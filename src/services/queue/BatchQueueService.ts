import { BatchRecord, MasterMetadataRecord, MediaType, ProviderType } from '../../types';
import { db, getAppSettings } from '../../db';
import { extractMediaInfo } from '../../utils/mediaExtractor';
import { terminateEpsWorker } from '../eps/epsEngine';
import { keyRingScheduler } from '../scheduler/KeyRingScheduler';
import { getProviderAdapter, localAiAdapter } from '../providers';
import { SYSTEM_VISION_PROMPT, SYSTEM_LOCAL_VISION_PROMPT, buildVisionPrompt } from '../ai/masterPrompt';
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
  isAiGenerated?: boolean;
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
  autoHealCount?: number;
  nextAutoRetryAt?: number;
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
 * Sorts queue items in strict top-to-bottom sequential order matching the Studio UI list (sortUnifiedAssets):
 * 1. Primary: Natural alphanumeric comparison on the full filename ({ numeric: true, sensitivity: 'base' }).
 *    This ensures 100% alignment with the Studio UI table and prevents trailing numbers in descriptive names
 *    from causing items in the middle of the list to be picked out of order.
 * 2. Secondary: Creation timestamp (createdAt ascending).
 * 3. Tertiary: Deterministic ID tie-breaker.
 */
export function sortQueueItemsSequentially(items: QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => {
    const nameComp = a.filename.localeCompare(b.filename, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    if (nameComp !== 0) return nameComp;

    const timeDiff = (a.createdAt ?? 0) - (b.createdAt ?? 0);
    if (timeDiff !== 0) return timeDiff;

    return (a.id || '').localeCompare(b.id || '');
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
  private readonly MAX_AUTO_HEAL_WAVES = 2; // Automatic background recovery passes per item
  private completedSinceLastRetry = 0; // Track successes for opportunistic retry
  private readonly OPPORTUNISTIC_RETRY_THRESHOLD = 3; // Re-queue cooled-down failed items after every 3 successes
  private activeAbortControllers: Set<AbortController> = new Set();
  private queueSessionId = 0;

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

    // Detect paired vector assets (.eps/.ai + companion .jpg/.jpeg/.png preview)
    // If an EPS and JPG share the exact same base stem name, ingest ONLY the .eps file
    // and attach the companion .jpg to it for instant, lightweight preview extraction.
    const VECTOR_EXTS = new Set(['eps', 'ai', 'svg']);
    const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);

    const getStem = (name: string) => {
      const lastDot = name.lastIndexOf('.');
      return (lastDot > 0 ? name.slice(0, lastDot) : name).trim().toLowerCase();
    };

    const vectorFileMap = new Map<string, File>();
    for (const f of validMediaFiles) {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (VECTOR_EXTS.has(ext)) {
        vectorFileMap.set(getStem(f.name), f);
      }
    }

    const companionFilesToSkip = new Set<File>();
    for (const f of validMediaFiles) {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (IMAGE_EXTS.has(ext)) {
        const stem = getStem(f.name);
        const matchingVector = vectorFileMap.get(stem);
        if (matchingVector && matchingVector !== f) {
          companionFilesToSkip.add(f);
          (matchingVector as any).__companionJpg = f;
          const companionPath = (f as any).__nativePath || (f as any).path || '';
          if (companionPath) {
            (matchingVector as any).__companionJpgNativePath = companionPath;
          }
        }
      }
    }

    const filesToQueue = validMediaFiles.filter((f) => !companionFilesToSkip.has(f));
    if (filesToQueue.length === 0) return;

    if (this.status === 'idle' && this.items.size === 0) {
      this.currentBatchId = crypto.randomUUID();
      this.batchName = `Batch #${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      this.elapsedSeconds = 0;
    }

    this.status = 'resizing';
    this.notify();

    const baseTime = Date.now();
    let detectedExplicitOrigin: boolean | null = null;

    for (let i = 0; i < filesToQueue.length; i++) {
      const file = filesToQueue[i];
      const id = crypto.randomUUID();
      const sourceMediaType = (file as any).__sourceMediaType as MediaType | undefined;
      const createdAt = baseTime + i;

      // Resolve Asset Origin (AI vs Real) from File Cleaner handoff or folder path
      let fileIsAi: boolean | undefined =
        typeof (file as any).__isAiGenerated === 'boolean' ? (file as any).__isAiGenerated : undefined;

      if (fileIsAi === undefined) {
        const rawPath = String(
          (file as any).__nativePath || (file as any).path || (file as any).webkitRelativePath || ''
        );
        if (/(?:^|[\\/])AI_(?:Photos|Videos|Vectors)(?:[\\/]|$)/i.test(rawPath)) {
          fileIsAi = true;
        } else if (/(?:^|[\\/])(?:Photos|Videos|Vectors)(?:[\\/]|$)/i.test(rawPath)) {
          fileIsAi = false;
        }
      }

      if (typeof fileIsAi === 'boolean') {
        detectedExplicitOrigin = fileIsAi;
      }

      const defaultStudioAi =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('stock_is_ai_generated') !== 'false'
          : true;
      const resolvedIsAi = typeof fileIsAi === 'boolean' ? fileIsAi : defaultStudioAi;

      const fileNativePath = (file as any).__nativePath || (file as any).path || '';
      const initialDraft: MasterMetadataRecord = {
        id,
        batchId: this.currentBatchId,
        filename: file.name,
        fileSize: file.size,
        thumbnailBase64: (file as any).__preRenderedDataUrl || (file as any).__thumbnailUrl || '',
        mediaType: sourceMediaType || 'image',
        isAiGenerated: resolvedIsAi,
        baseTitle: '',
        detailedDescription: '',
        rankedKeywords: [],
        categories: undefined,
        status: 'pending',
        createdAt,
      nativePath: fileNativePath,
      };
      const item: QueueItem = {
        id,
        filename: file.name,
        file,
        mediaType: sourceMediaType,
        isAiGenerated: fileIsAi,
        originalSizeBytes: file.size,
        status: 'resizing',
        retryCount: 0,
        createdAt,
        metadataRecord: initialDraft,
      };
      if ((file as any).__thumbnailUrl) {
        item.thumbnailDataUrl = (file as any).__thumbnailUrl;
      }
      this.items.set(id, item);
    }

    if (detectedExplicitOrigin !== null && typeof window !== 'undefined') {
      try {
        localStorage.setItem('stock_is_ai_generated', JSON.stringify(detectedExplicitOrigin));
        localStorage.setItem('stock_freepik_ai', JSON.stringify(detectedExplicitOrigin));
        localStorage.setItem('stock_dt_ai', JSON.stringify(detectedExplicitOrigin));
        window.dispatchEvent(
          new CustomEvent('stockflow:ai-origin-sync', {
            detail: { isAiGenerated: detectedExplicitOrigin },
          })
        );
      } catch {
        // ignore storage errors
      }
    }

    this.notify();

    // Process thumbnail downsampling and media extraction in strict top-to-bottom UI order
    const resizingItems = sortQueueItemsSequentially(
      Array.from(this.items.values()).filter(
        (item) => item.status === 'resizing' && item.file
      )
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
        const companionJpgNativePath = (item.file as any).__companionJpgNativePath;
        const isAiGeneratedProp = (item.file as any).__isAiGenerated;
        const assetOriginProp = (item.file as any).__assetOrigin;
        // Replace multi-MB File Blob in heap with a 0-byte shell preserving metadata & native OS path
        const shellFile = new File([], item.file.name, {
          type: item.file.type || 'application/octet-stream',
          lastModified: item.file.lastModified || Date.now(),
        });
        if (nativePath) {
          Object.defineProperty(shellFile, 'path', { value: nativePath, configurable: true, enumerable: true, writable: true });
          Object.defineProperty(shellFile, '__nativePath', { value: nativePath, configurable: true, enumerable: true, writable: true });
        }
        if (sourceMediaType) {
          Object.defineProperty(shellFile, '__sourceMediaType', { value: sourceMediaType, configurable: true });
        }
        if (companionEpsName) {
          Object.defineProperty(shellFile, '__companionEpsName', { value: companionEpsName, configurable: true });
        }
        if (companionJpgNativePath) {
          Object.defineProperty(shellFile, '__companionJpgNativePath', { value: companionJpgNativePath, configurable: true });
        }
        if (typeof isAiGeneratedProp === 'boolean') {
          Object.defineProperty(shellFile, '__isAiGenerated', { value: isAiGeneratedProp, configurable: true });
        }
        if (assetOriginProp) {
          Object.defineProperty(shellFile, '__assetOrigin', { value: assetOriginProp, configurable: true });
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
                isAiGenerated: typeof item.isAiGenerated === 'boolean' ? item.isAiGenerated : (item.metadataRecord?.isAiGenerated ?? true),
                baseTitle: '',
                detailedDescription: '',
                rankedKeywords: [],
                categories: undefined,
                status: 'error',
                errorMessage: errMsg,
                createdAt: item.createdAt || Date.now(),
                nativePath: (item.file as any)?.__nativePath || (item.file as any)?.path || item.metadataRecord?.nativePath || '',
              };
              item.metadataRecord = errRec;
              draftsToPersist.push(errRec);
              return;
            }

            let extractTimer: any;
            try {
              const extractTimeoutPromise = new Promise<never>((_, reject) => {
                const timeoutMs = hasHeavyVectors ? 60000 : 25000;
                extractTimer = setTimeout(() => reject(new Error('Media extraction timed out after ' + (timeoutMs / 1000) + 's')), timeoutMs);
              });

              const companionFile = (item.file as any)?.__companionJpg;
              const media = await Promise.race([
                extractMediaInfo(item.file, companionFile, 384, 0.72),
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
                  item.videoDurationSeconds || item.videoResolution || item.videoWidth || item.hasAudio !== undefined
                    ? {
                        durationSeconds: item.videoDurationSeconds,
                        resolution: item.videoResolution,
                        width: item.videoWidth,
                        height: item.videoHeight,
                        hasAudio: item.hasAudio,
                      }
                    : undefined,
                isAiGenerated:
                  typeof item.isAiGenerated === 'boolean'
                    ? item.isAiGenerated
                    : (item.metadataRecord?.isAiGenerated ?? true),
                baseTitle: item.metadataRecord?.baseTitle || '',
                detailedDescription: item.metadataRecord?.detailedDescription || '',
                rankedKeywords: item.metadataRecord?.rankedKeywords || [],
                categories: item.metadataRecord?.categories,
                status: 'pending',
                errorMessage: undefined,
                nativePath:
                  (item.file as any)?.__nativePath ||
                  (item.file as any)?.path ||
                  item.metadataRecord?.nativePath ||
                  '',
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
                isAiGenerated:
                  typeof item.isAiGenerated === 'boolean'
                    ? item.isAiGenerated
                    : (item.metadataRecord?.isAiGenerated ?? true),
                baseTitle: item.metadataRecord?.baseTitle || '',
                detailedDescription: item.metadataRecord?.detailedDescription || '',
                rankedKeywords: item.metadataRecord?.rankedKeywords || [],
                categories: item.metadataRecord?.categories,
                status: 'pending',
                errorMessage: undefined,
                nativePath:
                  (item.file as any)?.__nativePath ||
                  (item.file as any)?.path ||
                  item.metadataRecord?.nativePath ||
                  '',
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
    this.queueSessionId++;
    const currentSession = this.queueSessionId;
    this.startTimer();
    this.notify();

    if (this.isLoopActive) {
      return;
    }

    // Fill concurrency slots up to maximum healthy keys capacity
    this.dispatchLoop(isAiGenerated, userPrompt, defaultModelName, keywordPhrasing, titleLengthPreset, currentSession);
  }

  private async dispatchLoop(
    isAiGenerated: boolean,
    userPrompt?: string,
    defaultModelName?: string,
    keywordPhrasing: KeywordPhrasing = 'mixed',
    titleLengthPreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal',
    session?: number
  ): Promise<void> {
    if (this.isLoopActive) return;
    this.isLoopActive = true;
    const currentSession = session !== undefined ? session : this.queueSessionId;

    try {
      while (this.status === 'running' && this.queueSessionId === currentSession) {
        // Enforce sequential processing: one asset at a time prevents rate limits and queue freezes
        if (this.activeWorkers >= 1) {
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }

        // Check if any cooled-down failed items can be promoted back to 'ready' in the background
        this.promoteCooledDownFailedItems(false);

        // Enforce strict top-to-bottom sequential order matching the Studio UI list:
        // Consider both 'ready' and 'resizing' items in exact UI order so we never skip over a top item
        // that is still finishing thumbnail extraction to pick a middle item out of order!
        const allItems = Array.from(this.items.values());
        const pendingOrResizing = sortQueueItemsSequentially(
          allItems.filter((i) => i.status === 'ready' || i.status === 'resizing')
        );

        // Prefer first-pass items in strict top-to-bottom order before background retry items
        const firstPassPending = pendingOrResizing.filter((i) => !i.isRetry);
        const orderedCandidates = firstPassPending.length > 0 ? firstPassPending : pendingOrResizing;

        if (orderedCandidates.length > 0 && orderedCandidates[0].status === 'resizing') {
          // Wait briefly for the next top-to-bottom item to finish thumbnail extraction
          await new Promise((r) => setTimeout(r, 80));
          continue;
        }

        const pendingItem = orderedCandidates.find((i) => i.status === 'ready');

        // If no items are currently ready, check if any workers are still running or if failed items need auto-healing
        if (!pendingItem) {
          if (this.activeWorkers === 0) {
            // Automatic Background Self-Healing Pass:
            // Before finishing the batch, check if any failed items can be automatically retried after a brief cooldown
            const healableItems = this.getAutoHealableFailedItems();
            if (healableItems.length > 0 && this.status === 'running') {
              const now = Date.now();
              const earliestRetryAt = Math.min(
                ...healableItems.map((i) => i.nextAutoRetryAt || now)
              );
              const waitMs = Math.min(Math.max(0, earliestRetryAt - now), 2500);
              if (waitMs > 0) {
                await new Promise((r) => setTimeout(r, waitMs));
              }
              if (this.status !== 'running') break;
              this.promoteCooledDownFailedItems(true);
              continue;
            }

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
        this.processSingleItem(pendingItem, isAiGenerated, userPrompt, defaultModelName, keywordPhrasing, titleLengthPreset, currentSession)
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
    titleLengthPreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal',
    currentSession = 0
  ): Promise<void> {
    const isCancelled = () => {
      return this.status !== 'running' || (currentSession !== 0 && this.queueSessionId !== currentSession) || !this.items.has(item.id);
    };

    if (isCancelled()) return;
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
      const abortController = new AbortController();
      this.activeAbortControllers.add(abortController);
      let watchdogTimer: any;

      try {
        if (isCancelled()) return;
        await db.masterRecords.update(item.id, { status: 'processing' });

        const appSettings = await getAppSettings();
        const isLocalMode = appSettings.aiExecutionMode === 'local';
        const localConfig = appSettings.localAiConfig || {
          baseUrl: 'http://127.0.0.1:1234/v1',
          modelId: 'default',
          timeoutSeconds: 300,
        };

        const WATCHDOG_MS = isLocalMode
          ? Math.max(300000, (localConfig.timeoutSeconds || 300) * 1000 + 10000)
          : 25000;

        let assignedProviderName = '';
        let assignedModelName = '';
        let assignedKeyLabelName = '';

        const processingTask = (async () => {
          if (isCancelled()) return;

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

          let rawAiText: string;

          if (isLocalMode) {
            // STRICT LOCAL ISOLATION:
            // Complete bypass of KeyRingScheduler, sliding windows, and cloud failover.
            assignedProviderName = 'LM Studio';
            assignedModelName = localConfig.modelId || 'local-model';
            assignedKeyLabelName = 'Local AI Server';

            item.assignedKeyLabel = assignedKeyLabelName;
            item.assignedProvider = 'local' as any;
            item.assignedModel = assignedModelName;
            this.notify();

            const localTimeoutMs = (localConfig.timeoutSeconds || 300) * 1000;
            rawAiText = await localAiAdapter.analyzeImage(
              localConfig.baseUrl,
              localConfig.modelId,
              item.thumbnailBase64!,
              prompt,
              SYSTEM_LOCAL_VISION_PROMPT,
              abortController.signal,
              localTimeoutMs
            );
          } else {
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
            const { keyRecord } = lease;

            assignedProviderName = keyRecord.providerId;
            assignedModelName = keyRecord.modelId;
            assignedKeyLabelName = keyRecord.label;

            item.assignedKeyLabel = assignedKeyLabelName;
            item.assignedProvider = keyRecord.providerId;
            item.assignedModel = assignedModelName;
            this.notify();

            // 2. Build prompt & invoke vision API with strict 20s AbortController timeout
            const adapter = getProviderAdapter(keyRecord.providerId);

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
          }

          const latencyMs = Math.round(performance.now() - startTime);
          item.latencyMs = latencyMs;

          // 3. Parse & normalize Master Metadata Record with requested keyword phrasing
          const effectiveIsAi =
            typeof item.isAiGenerated === 'boolean' ? item.isAiGenerated : isAiGenerated;
          const masterRecord = parseAndNormalizeAiMetadata(
            rawAiText,
            item.filename,
            item.thumbnailDataUrl || `data:image/jpeg;base64,${item.thumbnailBase64}`,
            this.currentBatchId,
            effectiveIsAi,
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
          if (item.videoDurationSeconds || item.videoResolution || item.videoWidth || item.hasAudio !== undefined || existingRecord?.videoMeta?.hasAudio !== undefined) {
            masterRecord.videoMeta = {
              durationSeconds: item.videoDurationSeconds ?? existingRecord?.videoMeta?.durationSeconds,
              resolution: item.videoResolution ?? existingRecord?.videoMeta?.resolution,
              width: item.videoWidth ?? existingRecord?.videoMeta?.width,
              height: item.videoHeight ?? existingRecord?.videoMeta?.height,
              hasAudio: item.hasAudio ?? existingRecord?.videoMeta?.hasAudio,
            };
          }

          if (!item.attemptHistory) item.attemptHistory = [];
          item.attemptHistory.push({
            provider: assignedProviderName,
            model: assignedModelName,
            keyId: lease?.keyRecord?.id,
            status: 'success',
          });

          const parsedPrompt = masterRecord.aiGenerationInfo?.prompt;
          masterRecord.aiGenerationInfo = {
            prompt: userPrompt || parsedPrompt || masterRecord.baseTitle,
            model: assignedModelName || defaultModelName || 'Google Nano Banana',
            provider: assignedProviderName,
            latencyMs,
            attemptHistory: [...item.attemptHistory],
          };
          masterRecord.status = 'completed';

          item.metadataRecord = masterRecord;
          item.status = 'completed';
          item.error = undefined;
          this.completedSinceLastRetry++; // Track successful completions for opportunistic retry
          this.notify(); // UI update: item completed

          if (isCancelled()) {
            if (lease) await lease.release(false, new Error('Queue cancelled'));
            return;
          }

          // Persist master record to IndexedDB
          await db.masterRecords.put(masterRecord);

          // Release key lease as success if cloud lease was used
          if (lease) {
            await lease.release(true, undefined, latencyMs);
          }

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
        if (isCancelled()) {
          if (lease) {
            try { await lease.release(false, new Error('Queue cancelled')); } catch {}
          }
          return;
        }
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
          // Release key lease with error (scheduler handles 429/503/timeout cooldowns and invalid status)
          await lease.release(false, err);
        } else {
          item.attemptHistory.push({
            provider: 'LM Studio',
            model: item.assignedModel || 'local-model',
            status: 'failed',
            error: err.message || String(err),
          });
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

    if (isCancelled()) return;

    // All immediate attempts exhausted: mark as error and schedule for automatic background self-healing
    item.status = 'error';
    const finalErrMsg = `${item.assignedProvider ? `[${item.assignedProvider}] ` : ''}${lastError?.message || String(lastError)}`;
    item.error = finalErrMsg;
    if (this.isLoopActive && item.thumbnailBase64) {
      const currentWave = item.autoHealCount || 0;
      if (currentWave < this.MAX_AUTO_HEAL_WAVES && !/no active api keys/i.test(finalErrMsg)) {
        item.nextAutoRetryAt = Date.now() + 3000 * (currentWave + 1);
      }
    }
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
      this.queueSessionId++;
      this.abortAllInFlight();
      this.stopTimer();
      this.activeWorkers = 0;
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
    this.queueSessionId++;
    this.abortAllInFlight();
    this.stopTimer();
    this.activeWorkers = 0;
    this.notify();
  }

  public clear(): void {
    this.stop();
    terminateEpsWorker();
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
        item.autoHealCount = 0;
        item.nextAutoRetryAt = undefined;
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
   * Returns failed items that are eligible for automatic background self-healing during an active batch.
   */
  private getAutoHealableFailedItems(): QueueItem[] {
    const allItems = Array.from(this.items.values());
    const hasAnySuccess = allItems.some((i) => i.status === 'completed');
    // If at least one item in the batch has succeeded (proving API connectivity works), allow up to MAX_AUTO_HEAL_WAVES (2).
    // If 0 items have succeeded so far, allow 1 background recovery wave.
    const maxWavesAllowed = hasAnySuccess ? this.MAX_AUTO_HEAL_WAVES : 1;

    return sortQueueItemsSequentially(
      allItems.filter(
        (i) =>
          i.status === 'error' &&
          Boolean(i.thumbnailBase64) &&
          (i.autoHealCount || 0) < maxWavesAllowed &&
          !/no active api keys|corrupted or empty/i.test(i.error || '')
      )
    );
  }

  /**
   * Promotes cooled-down failed items back to 'ready' so the queue automatically retries them
   * in the background without user intervention.
   */
  private promoteCooledDownFailedItems(forceAllHealable = false): void {
    const now = Date.now();
    const healable = this.getAutoHealableFailedItems();
    if (healable.length === 0) return;

    let promoted = false;
    for (const item of healable) {
      if (forceAllHealable || !item.nextAutoRetryAt || now >= item.nextAutoRetryAt) {
        item.autoHealCount = (item.autoHealCount || 0) + 1;
        item.status = 'ready';
        if (item.retryCount >= this.maxRetries) {
          item.retryCount = 0;
        }
        item.error = undefined;
        item.isRetry = true;
        item.nextAutoRetryAt = undefined;
        promoted = true;
        if (!forceAllHealable) break; // Mid-batch: promote one cooled-down item at a time so main sequence isn't stalled
      }
    }

    if (promoted) {
      this.notify();
    }
  }

  private opportunisticRetryFailed(): void {
    this.promoteCooledDownFailedItems(false);
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
