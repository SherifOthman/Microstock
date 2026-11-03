import { BatchRecord, MasterMetadataRecord, MediaType, ProviderType } from '../../types';
import { db } from '../../db';
import { extractMediaInfo } from '../../utils/mediaExtractor';
import { terminateEpsWorker } from '../eps/epsEngine';
import { keyRingScheduler } from '../scheduler/KeyRingScheduler';
import { getProviderAdapter } from '../providers';
import { SYSTEM_VISION_PROMPT, buildVisionPrompt } from '../ai/masterPrompt';
import { parseAndNormalizeAiMetadata, KeywordPhrasing } from '../ai/metadataParser';

export interface QueueItem {
  id: string;
  filename: string;
  file?: File;
  mediaType?: MediaType;
  videoDurationSeconds?: number;
  videoResolution?: string;
  videoWidth?: number;
  videoHeight?: number;
  hasAudio?: boolean;
  isMuted?: boolean;
  mutedFile?: File;
  thumbnailBase64?: string;
  thumbnailDataUrl?: string;
  /** false = EPS/vector with no real artwork preview (placeholder badge was generated) */
  hasRealPreview?: boolean;
  status: 'pending' | 'resizing' | 'ready' | 'processing' | 'completed' | 'error';
  assignedKeyLabel?: string;
  assignedProvider?: ProviderType;
  assignedModel?: string;
  originalSizeBytes?: number;
  compressedSizeBytes?: number;
  latencyMs?: number;
  error?: string;
  retryCount: number;
  isRetry?: boolean;
  createdAt?: number;
  attemptHistory?: Array<{ provider: string; model: string; keyId?: string; status: 'success' | 'failed'; error?: string }>;
  metadataRecord?: MasterMetadataRecord;
}

/**
 * Extracts numeric sequence index from filename.
 * Handles formats like:
 * - B01_NT_PH_001.jpg -> 1
 * - asset_042.png -> 42
 * - video-05.mp4 -> 5
 * - photo (3).jpg -> 3
 * - clip007.mp4 -> 7
 * - sunset_beach.jpg -> null
 */
export function extractFilenameSequence(filename: string): number | null {
  if (!filename) return null;
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '').trim();

  // 1. Check for trailing numbers in parentheses: e.g. photo (3)
  const parenMatch = nameWithoutExt.match(/\((\d+)\)\s*$/);
  if (parenMatch) {
    const num = parseInt(parenMatch[1], 10);
    if (!isNaN(num)) return num;
  }

  // 2. Check for trailing sequence number after separator or boundary: e.g. _001, -05
  const trailingSepMatch = nameWithoutExt.match(/(?:[_\-\s]|^)(\d+)$/);
  if (trailingSepMatch) {
    const num = parseInt(trailingSepMatch[1], 10);
    if (!isNaN(num)) return num;
  }

  // 3. Check for letters immediately followed by numbers at the end of the base name: e.g. clip007, item10
  const attachedMatch = nameWithoutExt.match(/(\d+)$/);
  if (attachedMatch) {
    const num = parseInt(attachedMatch[1], 10);
    if (!isNaN(num)) return num;
  }

  return null;
}

/**
 * Sorts queue items in strict sequential order:
 * 1. By explicit filename sequence number if both have one.
 * 2. By natural alphanumeric comparison (e.g. item2 before item10).
 * 3. By creation timestamp (createdAt ascending).
 */
export function sortQueueItemsSequentially(items: QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => {
    const seqA = extractFilenameSequence(a.filename);
    const seqB = extractFilenameSequence(b.filename);

    if (seqA !== null && seqB !== null && seqA !== seqB) {
      return seqA - seqB;
    }

    // Natural alphanumeric sorting (handles 'item2.jpg' vs 'item10.jpg', 'apple.jpg' vs 'zebra.jpg')
    const nameComp = a.filename.localeCompare(b.filename, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    if (nameComp !== 0) return nameComp;

    // Fallback to createdAt
    return (a.createdAt ?? 0) - (b.createdAt ?? 0);
  });
}

export interface QueueState {
  batchId: string;
  batchName: string;
  status: 'idle' | 'resizing' | 'running' | 'paused' | 'completed';
  items: QueueItem[];
  totalCount: number;
  processedCount: number;
  failedCount: number;
  activeWorkers: number;
  elapsedSeconds: number;
}

export type QueueStateListener = (state: QueueState) => void;
export type QueueTimerListener = (elapsedSeconds: number) => void;

export class BatchQueueService {
  private static instance: BatchQueueService;
  private currentBatchId: string = crypto.randomUUID();
  private batchName: string = `Batch #${new Date().toLocaleTimeString()}`;
  private items: Map<string, QueueItem> = new Map();
  private status: 'idle' | 'resizing' | 'running' | 'paused' | 'completed' = 'idle';
  private activeWorkers = 0;
  private isLoopActive = false;
  private listeners: Set<QueueStateListener> = new Set();
  private timerListeners: Set<QueueTimerListener> = new Set();
  private timerInterval?: any;
  private elapsedSeconds = 0;
  private maxRetries = 3;
  private completedSinceLastRetry = 0; // Track successes for opportunistic retry
  private readonly OPPORTUNISTIC_RETRY_THRESHOLD = 5; // Give failed items another chance every 5 successes
  private activeAbortControllers: Set<AbortController> = new Set();

  private constructor() {}

  public static getInstance(): BatchQueueService {
    if (!BatchQueueService.instance) {
      BatchQueueService.instance = new BatchQueueService();
    }
    return BatchQueueService.instance;
  }

  public subscribe(listener: QueueStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public subscribeTimer(listener: QueueTimerListener): () => void {
    this.timerListeners.add(listener);
    return () => this.timerListeners.delete(listener);
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (e) {
        console.error('Queue state listener error', e);
      }
    });
  }

  private notifyTimer(): void {
    this.timerListeners.forEach((fn) => {
      try {
        fn(this.elapsedSeconds);
      } catch (e) {
        console.error('Queue timer listener error', e);
      }
    });
  }

  public getState(): QueueState {
    const itemsList = Array.from(this.items.values());
    const processed = itemsList.filter((i) => i.status === 'completed').length;
    const failed = itemsList.filter((i) => i.status === 'error').length;

    return {
      batchId: this.currentBatchId,
      batchName: this.batchName,
      status: this.status,
      items: itemsList,
      totalCount: itemsList.length,
      processedCount: processed,
      failedCount: failed,
      activeWorkers: this.activeWorkers,
      elapsedSeconds: this.elapsedSeconds,
    };
  }

  /**
   * Checks whether a File is a supported microstock image, video, or vector asset.
   * Excludes OS junk files (.DS_Store, thumbs.db, desktop.ini) and non-media documents (.exe, .pdf, .zip, .csv).
   */
  public static isSupportedStockMediaFile(file: File): boolean {
    if (!file || !file.name) return false;
    const lowerName = file.name.toLowerCase().trim();
    if (
      lowerName === '.ds_store' ||
      lowerName === 'thumbs.db' ||
      lowerName === 'desktop.ini' ||
      lowerName.startsWith('._')
    ) {
      return false;
    }
    const dotIdx = lowerName.lastIndexOf('.');
    const ext = dotIdx !== -1 ? lowerName.slice(dotIdx + 1) : '';
    const supportedExts = new Set([
      'jpg',
      'jpeg',
      'png',
      'webp',
      'tif',
      'tiff',
      'bmp',
      'gif',
      'avif',
      'mp4',
      'mov',
      'webm',
      'avi',
      'mkv',
      'm4v',
      'eps',
      'ai',
      'svg',
    ]);
    if (supportedExts.has(ext)) return true;
    if (file.type && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
      return true;
    }
    return false;
  }

  /**
   * Adds new image/video/vector files to the queue and generates lightweight 512px thumbnails
   */
  public async addFiles(files: File[]): Promise<void> {
    if (!files || files.length === 0) return;

    const validMediaFiles = files.filter((f) => BatchQueueService.isSupportedStockMediaFile(f));
    if (validMediaFiles.length === 0) return;

    if (this.status === 'idle' && this.items.size === 0) {
      this.currentBatchId = crypto.randomUUID();
      this.batchName = `Batch #${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      this.elapsedSeconds = 0;
    }

    this.status = 'resizing';
    this.notify();

    const baseTime = Date.now();
    for (let i = 0; i < validMediaFiles.length; i++) {
      const file = validMediaFiles[i];
      const id = crypto.randomUUID();
      const sourceMediaType = (file as any).__sourceMediaType as MediaType | undefined;
      const createdAt = baseTime + i;
      const initialDraft: MasterMetadataRecord = {
        id,
        batchId: this.currentBatchId,
        filename: file.name,
        fileSize: file.size,
        thumbnailBase64: '',
        mediaType: sourceMediaType || 'image',
        isAiGenerated: true,
        baseTitle: '',
        detailedDescription: '',
        rankedKeywords: [],
        categories: undefined,
        status: 'pending',
        createdAt,
      };
      const item: QueueItem = {
        id,
        filename: file.name,
        file,
        mediaType: sourceMediaType,
        originalSizeBytes: file.size,
        status: 'resizing',
        retryCount: 0,
        createdAt,
        metadataRecord: initialDraft,
      };
      this.items.set(id, item);
    }
    this.notify();

    // Process thumbnail downsampling and media extraction with bounded concurrency
    // (2 workers when batch includes heavy EPS/AI vector files, 8 for standard media)
    // and batched SQLite transactions to prevent memory spikes and UI freezes
    const resizingItems = Array.from(this.items.values()).filter(
      (item) => item.status === 'resizing' && item.file
    );
    const hasHeavyVectors = resizingItems.some((item) => {
      const ext = item.filename.split('.').pop()?.toLowerCase() || '';
      return ext === 'eps' || ext === 'ai' || item.mediaType === 'vector';
    });
    const INGEST_CHUNK_SIZE = 32;
    const INGEST_CONCURRENCY = hasHeavyVectors ? 2 : 8;

    const releaseRawFileBuffer = (item: QueueItem) => {
      if (!item.file || item.file.size === 0) return;
      try {
        let nativePath = (item.file as any).__nativePath || (item.file as any).path || '';
        if (!nativePath && typeof window !== 'undefined' && window.electronAPI?.getPathForFile) {
          try {
            nativePath = window.electronAPI.getPathForFile(item.file) || '';
          } catch {}
        }
        const sourceMediaType = (item.file as any).__sourceMediaType;
        const companionEpsName = (item.file as any).__companionEpsName;
        // Replace multi-MB File Blob in heap with a 0-byte shell preserving metadata & native OS path
        const shellFile = new File([], item.file.name, {
          type: item.file.type || 'application/octet-stream',
          lastModified: item.file.lastModified || Date.now(),
        });
        if (nativePath) {
          Object.defineProperty(shellFile, '__nativePath', { value: nativePath, configurable: true });
        }
        if (sourceMediaType) {
          Object.defineProperty(shellFile, '__sourceMediaType', { value: sourceMediaType, configurable: true });
        }
        if (companionEpsName) {
          Object.defineProperty(shellFile, '__companionEpsName', { value: companionEpsName, configurable: true });
        }
        item.file = shellFile;
      } catch {
        // ignore in restricted environments
      }
    };

    for (let i = 0; i < resizingItems.length; i += INGEST_CHUNK_SIZE) {
      const chunk = resizingItems.slice(i, i + INGEST_CHUNK_SIZE);
      const draftsToPersist: MasterMetadataRecord[] = [];

      for (let j = 0; j < chunk.length; j += INGEST_CONCURRENCY) {
        const subBatch = chunk.slice(j, j + INGEST_CONCURRENCY);
        await Promise.all(
          subBatch.map(async (item) => {
            if (!item.file) return;

            // Strictly corrupt 0-byte files are flagged immediately
            if (item.file.size === 0 && !item.originalSizeBytes) {
              const errMsg = `Media file "${item.filename}" is corrupted or empty (0 bytes)`;
              item.status = 'error';
              item.error = `Failed to process asset: ${errMsg}`;
              const errRec: MasterMetadataRecord = {
                id: item.id,
                batchId: this.currentBatchId,
                filename: item.filename,
                fileSize: 0,
                thumbnailBase64: '',
                mediaType: item.mediaType || 'image',
                isAiGenerated: true,
                baseTitle: '',
                detailedDescription: '',
                rankedKeywords: [],
                categories: undefined,
                status: 'error',
                errorMessage: errMsg,
                createdAt: item.createdAt || Date.now(),
              };
              item.metadataRecord = errRec;
              draftsToPersist.push(errRec);
              return;
            }

            let extractTimer: any;
            try {
              const extractTimeoutPromise = new Promise<never>((_, reject) => {
                extractTimer = setTimeout(() => reject(new Error('Media extraction timed out after 15s')), 15000);
              });

              const media = await Promise.race([
                extractMediaInfo(item.file, undefined, 384, 0.72),
                extractTimeoutPromise,
              ]);

              item.thumbnailBase64 = media.thumbnailBase64;
              item.thumbnailDataUrl = media.thumbnailDataUrl;
              item.compressedSizeBytes = media.compressedSizeBytes;
              item.mediaType = media.mediaType;
              item.videoDurationSeconds = media.videoDurationSeconds;
              item.videoResolution = media.videoResolution;
              item.videoWidth = media.width;
              item.videoHeight = media.height;
              item.hasAudio = media.hasAudio;
              item.hasRealPreview = media.hasRealPreview;
              item.status = 'ready';
              item.error = undefined;

              const draftRec: MasterMetadataRecord = {
                id: item.id,
                batchId: this.currentBatchId,
                filename: item.filename,
                fileSize: item.originalSizeBytes,
                compressedSize: item.compressedSizeBytes,
                thumbnailBase64:
                  item.thumbnailDataUrl ||
                  (item.thumbnailBase64 ? `data:image/jpeg;base64,${item.thumbnailBase64}` : ''),
                mediaType: item.mediaType || 'image',
                videoMeta:
                  item.videoDurationSeconds || item.videoResolution || item.videoWidth
                    ? {
                        durationSeconds: item.videoDurationSeconds,
                        resolution: item.videoResolution,
                        width: item.videoWidth,
                        height: item.videoHeight,
                      }
                    : undefined,
                isAiGenerated: true,
                baseTitle: item.metadataRecord?.baseTitle || '',
                detailedDescription: item.metadataRecord?.detailedDescription || '',
                rankedKeywords: item.metadataRecord?.rankedKeywords || [],
                categories: item.metadataRecord?.categories,
                status: 'pending',
                errorMessage: undefined,
                createdAt: item.createdAt || Date.now(),
              };
              item.metadataRecord = draftRec;
              draftsToPersist.push(draftRec);
            } catch {
              // Never mark a non-empty newly dropped asset as 'error' before AI generation!
              // Fall back cleanly to 'ready' / 'pending' so the asset stays Queued in the Studio UI.
              const ext = item.filename.split('.').pop()?.toLowerCase() || '';
              const inferredType: MediaType =
                item.mediaType ||
                (['mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v'].includes(ext)
                  ? 'video'
                  : ['eps', 'ai', 'svg'].includes(ext)
                  ? 'vector'
                  : 'image');

              item.mediaType = inferredType;
              item.hasRealPreview = false;
              item.status = 'ready';
              item.error = undefined;

              const fallbackRec: MasterMetadataRecord = {
                id: item.id,
                batchId: this.currentBatchId,
                filename: item.filename,
                fileSize: item.originalSizeBytes,
                thumbnailBase64: '',
                mediaType: inferredType,
                isAiGenerated: true,
                baseTitle: item.metadataRecord?.baseTitle || '',
                detailedDescription: item.metadataRecord?.detailedDescription || '',
                rankedKeywords: item.metadataRecord?.rankedKeywords || [],
                categories: item.metadataRecord?.categories,
                status: 'pending',
                errorMessage: undefined,
                createdAt: item.createdAt || Date.now(),
              };
              item.metadataRecord = fallbackRec;
              draftsToPersist.push(fallbackRec);
            } finally {
              if (extractTimer) clearTimeout(extractTimer);
              releaseRawFileBuffer(item);
            }
          })
        );
      }

      if (draftsToPersist.length > 0) {
        await db.masterRecords.bulkPut(draftsToPersist);
      }
      this.notify();
    }

    if (hasHeavyVectors) {
      try {
        terminateEpsWorker();
      } catch {}
    }

    this.status = 'idle';
    this.notify();
    await this.saveBatchToDB();
  }

  /**
   * Starts the batch processing queue across all available healthy keys
   */
  public async start(
    isAiGenerated = true,
    userPrompt?: string,
    defaultModelName = 'Nano Banana',
    keywordPhrasing: KeywordPhrasing = 'mixed',
    titleLengthPreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal'
  ): Promise<void> {
    this.status = 'running';
    this.startTimer();
    this.notify();

    if (this.isLoopActive) {
      return;
    }

    // Fill concurrency slots up to maximum healthy keys capacity
    this.dispatchLoop(isAiGenerated, userPrompt, defaultModelName, keywordPhrasing, titleLengthPreset);
  }

  private async dispatchLoop(
    isAiGenerated: boolean,
    userPrompt?: string,
    defaultModelName?: string,
    keywordPhrasing: KeywordPhrasing = 'mixed',
    titleLengthPreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal'
  ): Promise<void> {
    if (this.isLoopActive) return;
    this.isLoopActive = true;

    try {
      while (this.status === 'running') {
        // Enforce sequential processing: one asset at a time prevents rate limits and queue freezes
        if (this.activeWorkers >= 1) {
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }

        // Enforce strict sequential order: pick the next item in natural ascending sequence
        const readyItems = Array.from(this.items.values()).filter(
          (i) => i.status === 'ready'
        );
        const pendingItem = readyItems.length > 0 ? sortQueueItemsSequentially(readyItems)[0] : undefined;

        // If no items are pending, check if any workers are still running
        if (!pendingItem) {
          if (this.activeWorkers === 0) {
            this.status = 'completed';
            this.stopTimer();
            this.notify();
            await this.saveBatchToDB();
            break;
          }
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }

        // Mark item as processing so another loop iteration won't pick it
        pendingItem.status = 'processing';
        this.activeWorkers++;
        this.notify();

        // Launch async worker for this item
        this.processSingleItem(pendingItem, isAiGenerated, userPrompt, defaultModelName, keywordPhrasing, titleLengthPreset)
          .catch((err) => {
            console.error(`Item processing failed for ${pendingItem.filename}:`, err);
          })
          .finally(() => {
            this.activeWorkers = Math.max(0, this.activeWorkers - 1);
            this.notify();
          });

        await new Promise((r) => setTimeout(r, 50));
      }
    } finally {
      this.isLoopActive = false;
    }
  }

  private async processSingleItem(
    item: QueueItem,
    isAiGenerated: boolean,
    userPrompt?: string,
    defaultModelName = 'Nano Banana',
    keywordPhrasing: KeywordPhrasing = 'mixed',
    titleLengthPreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal'
  ): Promise<void> {
    if (!item.thumbnailBase64) {
      item.status = 'error';
      item.error = 'Thumbnail data missing';
      this.notify(); // UI update: item errored
      await db.masterRecords.update(item.id, {
        status: 'error',
        errorMessage: 'Thumbnail data missing',
      });
      return;
    }

    const maxAttempts = 3;
    let attempt = 0;
    let lastError: any = null;

    while (attempt < maxAttempts) {
      if (this.status !== 'running') {
        item.status = 'ready';
        this.notify();
        return;
      }

      attempt++;
      let lease: any = null;
      const startTime = performance.now();
      const WATCHDOG_MS = 22000;
      let watchdogTimer: any;
      const abortController = new AbortController();
      this.activeAbortControllers.add(abortController);

      try {
        await db.masterRecords.update(item.id, { status: 'processing' });

        const processingTask = (async () => {
          // 1. Acquire key lease from KeyRingScheduler
          // Exclude failed KEY IDs, and if a provider failed with high-demand/timeout/auth or failed >= 2 times on this item,
          // also exclude that provider so retries immediately cascade to OpenRouter, Groq, Mistral, and Cloudflare!
          const failedAttempts = (item.attemptHistory || []).filter((a) => a.status === 'failed');
          const failedKeyIds = failedAttempts
            .filter((a) => a.keyId)
            .map((a) => a.keyId as string);

          const providerFailCounts = new Map<string, number>();
          const excludedProviders = new Set<ProviderType>();
          for (const fa of failedAttempts) {
            const pid = fa.provider as ProviderType;
            if (!pid) continue;
            const count = (providerFailCounts.get(pid) || 0) + 1;
            providerFailCounts.set(pid, count);
            const errLower = (fa.error || '').toLowerCase();
            if (
              count >= 2 ||
              errLower.includes('high demand') ||
              errLower.includes('overloaded') ||
              errLower.includes('timed out') ||
              errLower.includes('503') ||
              errLower.includes('free tier is not available')
            ) {
              excludedProviders.add(pid);
            }
          }

          lease = await keyRingScheduler.acquireKey(
            undefined,
            failedKeyIds,
            Array.from(excludedProviders)
          );
          const { keyRecord, release } = lease;

          item.assignedKeyLabel = keyRecord.label;
          item.assignedProvider = keyRecord.providerId;
          item.assignedModel = keyRecord.modelId;
          this.notify();

          // 2. Build prompt & invoke vision API with strict 20s AbortController timeout
          const adapter = getProviderAdapter(keyRecord.providerId);
          const prompt = buildVisionPrompt(
            item.filename,
            userPrompt,
            item.mediaType,
            keywordPhrasing,
            titleLengthPreset,
            item.hasRealPreview,
            item.videoResolution,
            item.videoWidth,
            item.videoHeight
          );

          let apiTimer: any;
          const apiTimeoutPromise = new Promise<never>((_, reject) => {
            apiTimer = setTimeout(() => {
              const timeoutErr: any = new Error('AI Provider API call timed out after 20s — signal timed out');
              timeoutErr.status = 408;
              timeoutErr.isTimeout = true;
              abortController.abort(timeoutErr);
              reject(timeoutErr);
            }, 20000);
          });

          let rawAiText: string;
          try {
            rawAiText = await Promise.race([
              adapter.analyzeImage(
                keyRecord.key,
                keyRecord.modelId,
                item.thumbnailBase64!,
                prompt,
                SYSTEM_VISION_PROMPT,
                abortController.signal
              ),
              apiTimeoutPromise,
            ]);
          } finally {
            if (apiTimer) clearTimeout(apiTimer);
          }

          const latencyMs = Math.round(performance.now() - startTime);
          item.latencyMs = latencyMs;

          // 3. Parse & normalize Master Metadata Record with requested keyword phrasing
          const masterRecord = parseAndNormalizeAiMetadata(
            rawAiText,
            item.filename,
            item.thumbnailDataUrl || `data:image/jpeg;base64,${item.thumbnailBase64}`,
            this.currentBatchId,
            isAiGenerated,
            defaultModelName,
            keywordPhrasing,
            item.mediaType,
            item.videoResolution,
            item.videoWidth,
            item.videoHeight
          );
          masterRecord.id = item.id;
          // CRITICAL FIX: Preserve original creation timestamp so item never jumps to top of list!
          const existingRecord = await db.masterRecords.get(item.id);
          if (existingRecord?.createdAt) {
            masterRecord.createdAt = existingRecord.createdAt;
          } else if (item.createdAt) {
            masterRecord.createdAt = item.createdAt;
          }
          if (item.file?.size || item.originalSizeBytes) {
            masterRecord.fileSize = item.file?.size || item.originalSizeBytes;
          }
          if (item.compressedSizeBytes) {
            masterRecord.compressedSize = item.compressedSizeBytes;
          } else if (item.thumbnailBase64) {
            masterRecord.compressedSize = Math.round((item.thumbnailBase64.length * 3) / 4);
          }
          masterRecord.mediaType = item.mediaType || 'image';
          if (item.videoDurationSeconds || item.videoResolution || item.videoWidth) {
            masterRecord.videoMeta = {
              durationSeconds: item.videoDurationSeconds,
              resolution: item.videoResolution,
              width: item.videoWidth,
              height: item.videoHeight,
            };
          }

          if (!item.attemptHistory) item.attemptHistory = [];
          item.attemptHistory.push({
            provider: keyRecord.providerId,
            model: keyRecord.modelId,
            keyId: keyRecord.id,
            status: 'success',
          });

          const parsedPrompt = masterRecord.aiGenerationInfo?.prompt;
          masterRecord.aiGenerationInfo = {
            prompt: userPrompt || parsedPrompt || masterRecord.baseTitle,
            model: defaultModelName || 'Google Nano Banana',
            provider: keyRecord.providerId,
            latencyMs,
            attemptHistory: [...item.attemptHistory],
          };
          masterRecord.status = 'completed';

          item.metadataRecord = masterRecord;
          item.status = 'completed';
          item.error = undefined;
          this.completedSinceLastRetry++; // Track successful completions for opportunistic retry
          this.notify(); // UI update: item completed

          // Persist master record to IndexedDB
          await db.masterRecords.put(masterRecord);

          // Release key lease as success
          await release(true, undefined, latencyMs);

          // Opportunistic retry: Give failed items another chance after several successes
          if (this.completedSinceLastRetry >= this.OPPORTUNISTIC_RETRY_THRESHOLD) {
            this.completedSinceLastRetry = 0;
            this.opportunisticRetryFailed();
          }
        })();

        const watchdogPromise = new Promise((_, reject) => {
          watchdogTimer = setTimeout(() => {
            const wdErr: any = new Error(`Processing watchdog timeout (${WATCHDOG_MS / 1000}s) — signal timed out`);
            wdErr.status = 408;
            wdErr.isTimeout = true;
            abortController.abort(wdErr);
            reject(wdErr);
          }, WATCHDOG_MS);
        });

        await Promise.race([processingTask, watchdogPromise]);
        // Successfully processed!
        return;
      } catch (err: any) {
        abortController.abort();
        lastError = err;
        item.retryCount++;

        if (!item.attemptHistory) item.attemptHistory = [];
        if (lease) {
          item.attemptHistory.push({
            provider: item.assignedProvider || 'unknown',
            model: item.assignedModel || 'unknown',
            keyId: lease.keyRecord?.id || undefined,
            status: 'failed',
            error: err.message || String(err),
          });
        }

        if (lease) {
          // Release key lease with error (scheduler handles 429/503/timeout cooldowns and invalid status)
          await lease.release(false, err);
        }

        // If all keys are currently cooling down / timed out in acquireKey, don't spin 3 times on the same item
        const errMsgLower = String(err?.message || err || '').toLowerCase();
        if (errMsgLower.includes('key acquisition timed out') || errMsgLower.includes('no active api keys')) {
          break;
        }

        // Silent backoff before background retry if we have attempts remaining
        if (attempt < maxAttempts && this.status === 'running') {
          item.error = `Retrying (${attempt}/${maxAttempts}): ${err.message || String(err)}`;
          this.notify();
          // Yield to UI and wait 1.5s before next attempt
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      } finally {
        if (watchdogTimer) clearTimeout(watchdogTimer);
        this.activeAbortControllers.delete(abortController);
      }
    }

    // All background attempts exhausted: officially mark as error
    item.status = 'error';
    const finalErrMsg = `${item.assignedProvider ? `[${item.assignedProvider}] ` : ''}${lastError?.message || String(lastError)}`;
    item.error = finalErrMsg;
    this.notify();

    await db.masterRecords.update(item.id, {
      status: 'error',
      errorMessage: finalErrMsg,
    });
  }

  private abortAllInFlight(): void {
    for (const ctrl of this.activeAbortControllers) {
      try {
        ctrl.abort(new Error('Queue paused or stopped'));
      } catch {}
    }
    this.activeAbortControllers.clear();
  }

  public pause(): void {
    if (this.status === 'running') {
      this.status = 'paused';
      this.abortAllInFlight();
      this.stopTimer();
      this.notify();
    }
  }

  public resume(isAiGenerated = true, userPrompt?: string, defaultModelName?: string): void {
    if (this.status === 'paused') {
      this.start(isAiGenerated, userPrompt, defaultModelName);
    }
  }

  public stop(): void {
    this.status = 'idle';
    this.abortAllInFlight();
    this.stopTimer();
    this.notify();
  }

  public clear(): void {
    this.stop();
    this.items.clear();
    this.elapsedSeconds = 0;
    this.notify();
  }

  public async retryFailed(
    isAiGenerated = true,
    userPrompt?: string,
    defaultModelName?: string,
    keywordPhrasing: KeywordPhrasing = 'mixed',
    titleLengthPreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal'
  ): Promise<void> {
    this.completedSinceLastRetry = 0; // Reset opportunistic retry counter on manual retry

    // 1. Re-queue in-memory failed items
    for (const item of this.items.values()) {
      if (item.status === 'error') {
        item.status = 'ready';
        item.error = undefined;
        item.retryCount = 0;
        item.isRetry = true;
        item.metadataRecord = undefined;
      }
    }

    // 2. Also re-hydrate and re-queue any failed records stored in Dexie IndexedDB
    try {
      const dbFailed = await db.masterRecords
        .filter((r) => r.status === 'error' || Boolean(r.errorMessage))
        .toArray();

      for (const rec of dbFailed) {
        if (!this.items.has(rec.id)) {
          const queueItem: QueueItem = {
            id: rec.id,
            filename: rec.filename,
            thumbnailBase64: (rec.thumbnailBase64 || '').replace(/^data:image\/[^;]+;base64,/, ''),
            thumbnailDataUrl: rec.thumbnailBase64 || '',
            mediaType: rec.mediaType,
            videoDurationSeconds: rec.videoMeta?.durationSeconds,
            videoResolution: rec.videoMeta?.resolution,
            videoWidth: rec.videoMeta?.width,
            videoHeight: rec.videoMeta?.height,
            status: 'ready',
            retryCount: 0,
            isRetry: true,
            createdAt: rec.createdAt,
          };
          this.items.set(rec.id, queueItem);
        } else {
          const existing = this.items.get(rec.id)!;
          existing.status = 'ready';
          existing.error = undefined;
          existing.retryCount = 0;
          existing.isRetry = true;
          existing.metadataRecord = undefined;
        }

        await db.masterRecords.update(rec.id, {
          status: 'processing',
          errorMessage: undefined,
        });
      }
    } catch (e) {
      console.error('Error fetching failed records from DB for retry:', e);
    }

    this.notify();
    await this.start(isAiGenerated, userPrompt, defaultModelName, keywordPhrasing, titleLengthPreset);
  }

  /**
   * Retry a single failed item
   */
  public async retryItem(
    id: string,
    isAiGenerated = true,
    userPrompt?: string,
    defaultModelName?: string,
    keywordPhrasing: KeywordPhrasing = 'mixed',
    titleLengthPreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal'
  ): Promise<void> {
    await this.reprocessItem(id, isAiGenerated, userPrompt, defaultModelName, keywordPhrasing, titleLengthPreset);
  }

  /**
   * Opportunistic background retry: Give ONE failed item another chance
   * without resetting retry count. This helps recover from temporary issues
   * (network glitches, brief API downtime) without user intervention.
   * Called automatically after every N successful completions.
   */
  private opportunisticRetryFailed(): void {
    // Find the first failed item that still has retry attempts left
    const failedItem = Array.from(this.items.values()).find(
      (i) => i.status === 'error' && i.retryCount < this.maxRetries
    );
    
    if (failedItem) {
      // Give it another chance by marking it ready (keeps retry count)
      failedItem.status = 'ready';
      failedItem.error = undefined;
      failedItem.isRetry = true;
      // Don't reset retryCount - this is an opportunistic attempt
      this.notify();
    }
  }

  public removeItem(id: string): void {
    this.items.delete(id);
    this.notify();
  }

  public async reprocessItem(
    id: string,
    isAiGenerated = true,
    userPrompt?: string,
    defaultModelName?: string,
    keywordPhrasing: KeywordPhrasing = 'mixed',
    titleLengthPreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal'
  ): Promise<void> {
    // If in-memory queue is empty, rehydrate all records from DB so the global progress bar tracks accurate total/processed counts
    if (this.items.size === 0) {
      try {
        const allDbRecords = await db.masterRecords.toArray();
        for (const rec of allDbRecords) {
          this.items.set(rec.id, {
            id: rec.id,
            filename: rec.filename,
            thumbnailBase64: (rec.thumbnailBase64 || '').replace(/^data:image\/[^;]+;base64,/, ''),
            thumbnailDataUrl: rec.thumbnailBase64 || '',
            mediaType: rec.mediaType,
            videoDurationSeconds: rec.videoMeta?.durationSeconds,
            videoResolution: rec.videoMeta?.resolution,
            videoWidth: rec.videoMeta?.width,
            videoHeight: rec.videoMeta?.height,
            status: rec.id === id ? 'ready' : (rec.status === 'completed' || rec.baseTitle) ? 'completed' : rec.status === 'error' ? 'error' : 'ready',
            retryCount: 0,
            isRetry: rec.id === id,
            createdAt: rec.createdAt,
          });
        }
      } catch (e) {
        console.error('Error rehydrating items from DB for reprocessItem:', e);
      }
    }

    const existing = this.items.get(id);
    if (existing) {
      existing.status = 'ready';
      existing.retryCount = 0;
      existing.isRetry = true;
      existing.error = undefined;
      existing.metadataRecord = undefined;
    } else {
      const rec = await db.masterRecords.get(id);
      if (rec) {
        const queueItem: QueueItem = {
          id: rec.id,
          filename: rec.filename,
          thumbnailBase64: (rec.thumbnailBase64 || '').replace(/^data:image\/[^;]+;base64,/, ''),
          thumbnailDataUrl: rec.thumbnailBase64 || '',
          mediaType: rec.mediaType,
          videoDurationSeconds: rec.videoMeta?.durationSeconds,
          videoResolution: rec.videoMeta?.resolution,
          videoWidth: rec.videoMeta?.width,
          videoHeight: rec.videoMeta?.height,
          status: 'ready',
          retryCount: 0,
          isRetry: true,
          createdAt: rec.createdAt,
        };
        this.items.set(id, queueItem);
      } else {
        return;
      }
    }

    try {
      await db.masterRecords.update(id, {
        status: 'processing',
        errorMessage: undefined,
      });
    } catch (e) {
      console.warn('Could not update masterRecord status in DB:', e);
    }

    this.notify();
    await this.start(isAiGenerated, userPrompt, defaultModelName, keywordPhrasing, titleLengthPreset);
  }

  /**
   * Global Regenerate All: Takes all items in batch / DB, resets them to 'ready',
   * updates DB status to 'processing', and dispatches the queue loop.
   */
  public async reprocessAll(
    isAiGenerated = true,
    userPrompt?: string,
    defaultModelName?: string,
    keywordPhrasing: KeywordPhrasing = 'mixed',
    titleLengthPreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal'
  ): Promise<void> {
    this.completedSinceLastRetry = 0;
    this.elapsedSeconds = 0;

    // 1. If in-memory items is empty, rehydrate all from DB
    if (this.items.size === 0) {
      try {
        const allDbRecords = await db.masterRecords.toArray();
        for (const rec of allDbRecords) {
          const queueItem: QueueItem = {
            id: rec.id,
            filename: rec.filename,
            thumbnailBase64: (rec.thumbnailBase64 || '').replace(/^data:image\/[^;]+;base64,/, ''),
            thumbnailDataUrl: rec.thumbnailBase64 || '',
            mediaType: rec.mediaType,
            videoDurationSeconds: rec.videoMeta?.durationSeconds,
            videoResolution: rec.videoMeta?.resolution,
            videoWidth: rec.videoMeta?.width,
            videoHeight: rec.videoMeta?.height,
            status: 'ready',
            retryCount: 0,
            isRetry: true,
            createdAt: rec.createdAt,
          };
          this.items.set(rec.id, queueItem);
        }
      } catch (e) {
        console.error('Error rehydrating items from DB for reprocessAll:', e);
      }
    } else {
      // Re-queue all existing in-memory items
      for (const item of this.items.values()) {
        item.status = 'ready';
        item.retryCount = 0;
        item.isRetry = true;
        item.error = undefined;
        item.metadataRecord = undefined;
      }
    }

    // 2. Mark all records as processing in Dexie DB
    try {
      await db.masterRecords.toCollection().modify({
        status: 'processing',
        errorMessage: undefined,
      });
    } catch (e) {
      console.warn('Could not update all masterRecords to processing:', e);
    }

    this.notify();
    await this.start(isAiGenerated, userPrompt, defaultModelName, keywordPhrasing, titleLengthPreset);
  }

  public markItemMuted(id: string, mutedFile: File): void {
    const item = this.items.get(id);
    if (item) {
      item.isMuted = true;
      item.hasAudio = false;
      item.file = mutedFile;
      item.mutedFile = mutedFile;
      this.notify();
    }
  }

  private startTimer(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++;
      // Notify only lightweight timer subscribers so the 2,000-item Studio list never re-sorts at 1Hz
      this.notifyTimer();
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = undefined;
    }
  }

  private async saveBatchToDB(): Promise<void> {
    const state = this.getState();
    const record: BatchRecord = {
      id: state.batchId,
      name: state.batchName,
      createdAt: Date.now(),
      totalCount: state.totalCount,
      processedCount: state.processedCount,
      failedCount: state.failedCount,
      status: state.status === 'running' ? 'processing' : state.status === 'completed' ? 'completed' : 'idle',
    };
    await db.batches.put(record);
  }
}

export const batchQueueService = BatchQueueService.getInstance();
