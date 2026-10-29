import { BatchRecord, MasterMetadataRecord, MediaType, ProviderType } from '../../types';
import { db } from '../../db';
import { extractMediaInfo } from '../../utils/mediaExtractor';
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
  thumbnailBase64?: string;
  thumbnailDataUrl?: string;
  status: 'pending' | 'resizing' | 'ready' | 'processing' | 'completed' | 'error';
  assignedKeyLabel?: string;
  assignedProvider?: ProviderType;
  assignedModel?: string;
  originalSizeBytes?: number;
  compressedSizeBytes?: number;
  latencyMs?: number;
  error?: string;
  retryCount: number;
  attemptHistory?: Array<{ provider: string; model: string; status: 'success' | 'failed'; error?: string }>;
  metadataRecord?: MasterMetadataRecord;
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

export class BatchQueueService {
  private static instance: BatchQueueService;
  private currentBatchId: string = crypto.randomUUID();
  private batchName: string = `Batch #${new Date().toLocaleTimeString()}`;
  private items: Map<string, QueueItem> = new Map();
  private status: 'idle' | 'resizing' | 'running' | 'paused' | 'completed' = 'idle';
  private activeWorkers = 0;
  private listeners: Set<QueueStateListener> = new Set();
  private timerInterval?: any;
  private elapsedSeconds = 0;
  private maxRetries = 3;

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
   * Adds new image files to the queue and generates lightweight 512px thumbnails
   */
  public async addFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;

    if (this.status === 'idle' && this.items.size === 0) {
      this.currentBatchId = crypto.randomUUID();
      this.batchName = `Batch #${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      this.elapsedSeconds = 0;
    }

    this.status = 'resizing';
    this.notify();

    for (const file of files) {
      const id = crypto.randomUUID();
      const item: QueueItem = {
        id,
        filename: file.name,
        file,
        originalSizeBytes: file.size,
        status: 'resizing',
        retryCount: 0,
      };
      this.items.set(id, item);
    }
    this.notify();

    // Process thumbnail downsampling and media extraction in micro-batches
    for (const item of this.items.values()) {
      if (item.status === 'resizing' && item.file) {
        try {
          const media = await extractMediaInfo(item.file, undefined, 512, 0.75);
          item.thumbnailBase64 = media.thumbnailBase64;
          item.thumbnailDataUrl = media.thumbnailDataUrl;
          item.compressedSizeBytes = media.compressedSizeBytes;
          item.mediaType = media.mediaType;
          item.videoDurationSeconds = media.videoDurationSeconds;
          item.videoResolution = media.videoResolution;
          item.status = 'ready';

          // Persist draft in Dexie IndexedDB so refresh never removes the asset
          const draft: MasterMetadataRecord = {
            id: item.id,
            batchId: this.currentBatchId,
            filename: item.filename,
            fileSize: item.originalSizeBytes,
            compressedSize: item.compressedSizeBytes,
            thumbnailBase64: item.thumbnailDataUrl || (item.thumbnailBase64 ? `data:image/jpeg;base64,${item.thumbnailBase64}` : ''),
            mediaType: item.mediaType || 'image',
            videoMeta: (item.videoDurationSeconds || item.videoResolution) ? {
              durationSeconds: item.videoDurationSeconds,
              resolution: item.videoResolution,
            } : undefined,
            isAiGenerated: true,
            baseTitle: '',
            detailedDescription: '',
            rankedKeywords: [],
            categories: {
              adobeCategoryId: 19,
              shutterstockCategories: ['Miscellaneous'],
              dreamstimeCategory1: 114,
              dreamstimeCategory2: 120,
              dreamstimeCategory3: 114,
            },
            status: 'pending',
            createdAt: Date.now(),
          };
          await db.masterRecords.put(draft);
        } catch (err: any) {
          item.status = 'error';
          item.error = `Failed to process asset: ${err.message}`;

          const errDraft: MasterMetadataRecord = {
            id: item.id,
            batchId: this.currentBatchId,
            filename: item.filename,
            fileSize: item.originalSizeBytes,
            thumbnailBase64: '',
            mediaType: item.mediaType || 'image',
            isAiGenerated: true,
            baseTitle: '',
            detailedDescription: '',
            rankedKeywords: [],
            categories: {
              adobeCategoryId: 19,
              shutterstockCategories: ['Miscellaneous'],
              dreamstimeCategory1: 114,
              dreamstimeCategory2: 120,
              dreamstimeCategory3: 114,
            },
            status: 'error',
            errorMessage: err.message,
            createdAt: Date.now(),
          };
          await db.masterRecords.put(errDraft);
        }
      }
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
    keywordPhrasing: KeywordPhrasing = 'single',
    titleLengthPreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal'
  ): Promise<void> {
    if (this.status === 'running') return;

    this.status = 'running';
    this.startTimer();
    this.notify();

    // Fill concurrency slots up to maximum healthy keys capacity
    this.dispatchLoop(isAiGenerated, userPrompt, defaultModelName, keywordPhrasing, titleLengthPreset);
  }

  private async dispatchLoop(
    isAiGenerated: boolean,
    userPrompt?: string,
    defaultModelName?: string,
    keywordPhrasing: KeywordPhrasing = 'single',
    titleLengthPreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal'
  ): Promise<void> {
    while (this.status === 'running') {
      const pendingItem = Array.from(this.items.values()).find(
        (i) => i.status === 'ready' || (i.status === 'error' && i.retryCount < this.maxRetries)
      );

      // If no items are pending, check if any workers are still running
      if (!pendingItem) {
        if (this.activeWorkers === 0) {
          this.status = 'completed';
          this.stopTimer();
          this.notify();
          await this.saveBatchToDB();
          break;
        }
        // Wait for active workers
        await new Promise((r) => setTimeout(r, 200));
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

      // Brief yield to allow concurrent key acquisition
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  private async processSingleItem(
    item: QueueItem,
    isAiGenerated: boolean,
    userPrompt?: string,
    defaultModelName = 'Nano Banana',
    keywordPhrasing: KeywordPhrasing = 'single',
    titleLengthPreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal'
  ): Promise<void> {
    if (!item.thumbnailBase64) {
      item.status = 'error';
      item.error = 'Thumbnail data missing';
      await db.masterRecords.update(item.id, {
        status: 'error',
        errorMessage: 'Thumbnail data missing',
      });
      return;
    }

    let lease: any = null;
    const startTime = performance.now();

    try {
      await db.masterRecords.update(item.id, { status: 'processing' });

      // 1. Acquire key lease from KeyRingScheduler (avoiding providers that previously failed for this item)
      const failedProviders = (item.attemptHistory || [])
        .filter((a) => a.status === 'failed')
        .map((a) => a.provider as ProviderType);

      lease = await keyRingScheduler.acquireKey(undefined, failedProviders);
      const { keyRecord, release } = lease;

      item.assignedKeyLabel = keyRecord.label;
      item.assignedProvider = keyRecord.providerId;
      item.assignedModel = keyRecord.modelId;
      this.notify();

      // 2. Build prompt & invoke vision API (passing cleaned filename as visual domain hint + mediaType + keywordPhrasing + titleLengthPreset)
      const adapter = getProviderAdapter(keyRecord.providerId);
      const prompt = buildVisionPrompt(item.filename, userPrompt, item.mediaType, keywordPhrasing, titleLengthPreset);

      const rawAiText = await adapter.analyzeImage(
        keyRecord.key,
        keyRecord.modelId,
        item.thumbnailBase64,
        prompt,
        SYSTEM_VISION_PROMPT
      );

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
        keywordPhrasing
      );
      masterRecord.id = item.id;
      if (item.file?.size || item.originalSizeBytes) {
        masterRecord.fileSize = item.file?.size || item.originalSizeBytes;
      }
      if (item.compressedSizeBytes) {
        masterRecord.compressedSize = item.compressedSizeBytes;
      } else if (item.thumbnailBase64) {
        masterRecord.compressedSize = Math.round((item.thumbnailBase64.length * 3) / 4);
      }
      masterRecord.mediaType = item.mediaType || 'image';
      if (item.videoDurationSeconds || item.videoResolution) {
        masterRecord.videoMeta = {
          durationSeconds: item.videoDurationSeconds,
          resolution: item.videoResolution,
        };
      }

      if (!item.attemptHistory) item.attemptHistory = [];
      item.attemptHistory.push({
        provider: keyRecord.providerId,
        model: keyRecord.modelId,
        status: 'success',
      });

      masterRecord.aiGenerationInfo = {
        prompt: userPrompt || 'Standard stock metadata prompt',
        model: keyRecord.modelId,
        provider: keyRecord.providerId,
        latencyMs,
        attemptHistory: [...item.attemptHistory],
      };
      masterRecord.status = 'completed';

      item.metadataRecord = masterRecord;
      item.status = 'completed';
      item.error = undefined;

      // Persist master record to IndexedDB
      await db.masterRecords.put(masterRecord);

      // Release key lease as success
      await release(true, undefined, latencyMs);
    } catch (err: any) {
      item.retryCount++;
      const isRetryable = item.retryCount < this.maxRetries;

      if (!item.attemptHistory) item.attemptHistory = [];
      if (lease) {
        item.attemptHistory.push({
          provider: item.assignedProvider || 'unknown',
          model: item.assignedModel || 'unknown',
          status: 'failed',
          error: err.message || String(err),
        });
      }

      item.status = isRetryable ? 'ready' : 'error';
      item.error = err.message || String(err);

      // Update Dexie database so failed image persists and can be retried
      await db.masterRecords.update(item.id, {
        status: isRetryable ? 'pending' : 'error',
        errorMessage: err.message || String(err),
      });

      if (lease) {
        // Release key lease with error (scheduler handles 429 cooldowns and invalid status)
        await lease.release(false, err);
      }
    }
  }

  public pause(): void {
    if (this.status === 'running') {
      this.status = 'paused';
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
    this.stopTimer();
    this.notify();
  }

  public clear(): void {
    this.stop();
    this.items.clear();
    this.elapsedSeconds = 0;
    this.notify();
  }

  public retryFailed(
    isAiGenerated = true,
    userPrompt?: string,
    defaultModelName?: string,
    keywordPhrasing: KeywordPhrasing = 'single',
    titleLengthPreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal'
  ): void {
    for (const item of this.items.values()) {
      if (item.status === 'error') {
        item.status = 'ready';
        item.error = undefined;
        item.retryCount = 0;
      }
    }
    this.start(isAiGenerated, userPrompt, defaultModelName, keywordPhrasing, titleLengthPreset);
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
    keywordPhrasing: KeywordPhrasing = 'single',
    titleLengthPreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal'
  ): Promise<void> {
    const existing = this.items.get(id);
    if (existing) {
      existing.status = 'ready';
      existing.retryCount = 0;
      existing.error = undefined;
      this.notify();
      this.start(isAiGenerated, userPrompt, defaultModelName, keywordPhrasing, titleLengthPreset);
      return;
    }

    const rec = await db.masterRecords.get(id);
    if (rec) {
      const queueItem: QueueItem = {
        id: rec.id,
        filename: rec.filename,
        thumbnailBase64: rec.thumbnailBase64.replace(/^data:image\/[^;]+;base64,/, ''),
        thumbnailDataUrl: rec.thumbnailBase64,
        mediaType: rec.mediaType,
        videoDurationSeconds: rec.videoMeta?.durationSeconds,
        videoResolution: rec.videoMeta?.resolution,
        status: 'ready',
        retryCount: 0,
      };
      this.items.set(id, queueItem);
      this.notify();
      this.start(isAiGenerated, userPrompt, defaultModelName, keywordPhrasing, titleLengthPreset);
    }
  }

  private startTimer(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++;
      this.notify();
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
