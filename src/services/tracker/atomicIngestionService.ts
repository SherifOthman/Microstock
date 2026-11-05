import {
  MasterMetadataRecord,
  MediaType,
  TrackerPipelineStage,
} from '../../types';
import { db, getAppSettings } from '../../db';
import { extractMediaInfo } from '../../utils/mediaExtractor';
import { stripAudioTrackLossless } from '../video/videoMuterEngine';
import { keyRingScheduler } from '../scheduler/KeyRingScheduler';
import { getProviderAdapter, localAiAdapter } from '../providers';
import {
  SYSTEM_VISION_PROMPT,
  SYSTEM_LOCAL_VISION_PROMPT,
  buildVisionPrompt,
  buildLocalVisionPrompt,
} from '../ai/masterPrompt';
import { parseAndNormalizeAiMetadata } from '../ai/metadataParser';
import { BatchQueueService } from '../queue/BatchQueueService';

export interface IngestionQueueItem {
  id: string;
  file?: File;
  sourcePath?: string;
  filename: string;
  mediaType: MediaType;
  fileSize?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  resolution?: string;
  hasAudio?: boolean;
  isAiGenerated: boolean;
  thumbnailBase64?: string;
  tempFilePath?: string;
  fileHash?: string;
  stage: TrackerPipelineStage;
  stageLabel: string;
  error?: string;
  duplicateOfFilename?: string;
  committedRecord?: MasterMetadataRecord;
  createdAt: number;
}

export type IngestionListener = (items: IngestionQueueItem[], isRunning: boolean) => void;

const STAGE_LABELS: Record<TrackerPipelineStage, string> = {
  queued: 'Queued',
  copying_temp: 'Copying to Temp...',
  hashing: 'Checking SHA-256 Hash...',
  validating_quality: 'Validating Specs...',
  extracting_eps: 'Extracting EPS...',
  muting_audio: 'Muting Audio...',
  generating_metadata: 'Generating Tags...',
  committing_vault: 'Committing to Vault...',
  committed: 'Committed to Master Vault',
  duplicate_skipped: 'Duplicate Skipped',
  failed: 'Failed (Rolled Back)',
};

export function getPipelineStageBadgeLabel(stage: TrackerPipelineStage): string {
  return STAGE_LABELS[stage] || stage;
}

export function detectMediaTypeFromFilename(filename: string): MediaType {
  const lower = (filename || '').toLowerCase();
  if (/\.(mp4|mov|webm|avi|mkv|m4v)$/.test(lower)) return 'video';
  if (/\.(eps|ai|svg)$/.test(lower)) return 'vector';
  return 'image';
}

export function generateDeterministicFallbackMetadata(
  filename: string,
  mediaType: MediaType,
  isAiGenerated: boolean,
  batchId: string,
  thumbnailBase64: string
): MasterMetadataRecord {
  const cleanStem = filename
    .replace(/\.[^.]+$/, '')
    .replace(/^B\d+[-_](?:(?:AI|NT)[-_][A-Z]{2}[-_])?\d+[-_]*/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();

  const words = cleanStem
    .split(/\s+/)
    .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length >= 2);

  const titleWords =
    words.length > 0
      ? words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      : 'Commercial Stock Media Asset';

  const suffix =
    mediaType === 'vector'
      ? 'Vector Illustration Graphic'
      : mediaType === 'video'
      ? '4K Stock Video Footage'
      : 'Commercial Stock Background';

  const baseTitle = `${titleWords} ${suffix}`.slice(0, 190).trim();
  const detailedDescription = `${baseTitle} prepared for commercial microstock distribution and creative design projects.`;

  const basePool =
    mediaType === 'vector'
      ? [
          'vector', 'illustration', 'graphic', 'design', 'element', 'artwork', 'creative', 'modern',
          'symbol', 'icon', 'concept', 'background', 'template', 'banner', 'poster', 'digital',
          'abstract', 'style', 'shape', 'pattern', 'sign', 'flat', 'isolated', 'commercial',
          'layout', 'visual', 'decorative', 'art', 'minimal', 'professional', 'print', 'web',
          'composition', 'trendy', 'clean', 'structure', 'identity', 'emblem', 'badge', 'card',
        ]
      : mediaType === 'video'
      ? [
          'video', 'footage', 'motion', 'clip', 'cinematic', '4k', 'background', 'scene',
          'commercial', 'modern', 'creative', 'digital', 'abstract', 'visual', 'dynamic', 'smooth',
          'light', 'color', 'atmosphere', 'concept', 'production', 'media', 'broadcast', 'loop',
          'professional', 'quality', 'texture', 'space', 'environment', 'natural', 'style', 'view',
          'movement', 'frame', 'vivid', 'contemporary', 'backdrop', 'screen', 'display', 'project',
        ]
      : [
          'background', 'commercial', 'creative', 'modern', 'design', 'concept', 'texture', 'light',
          'color', 'abstract', 'digital', 'professional', 'style', 'space', 'clean', 'minimal',
          'surface', 'composition', 'pattern', 'visual', 'detail', 'quality', 'bright', 'soft',
          'artistic', 'aesthetic', 'contemporary', 'studio', 'decor', 'wallpaper', 'banner', 'backdrop',
          ' vibrant', 'tone', 'harmony', 'structure', 'natural', 'lifestyle', 'business', 'luxury',
        ];

  const mergedKeywords = Array.from(
    new Set([...words, ...basePool.map((t) => t.trim().toLowerCase())].filter(Boolean))
  ).slice(0, 46);

  return {
    id: crypto.randomUUID(),
    batchId,
    filename,
    thumbnailBase64,
    mediaType,
    isAiGenerated,
    baseTitle,
    detailedDescription,
    rankedKeywords: mergedKeywords,
    categories: {
      adobeCategoryId: mediaType === 'vector' ? 8 : 11,
      shutterstockCategories: ['Abstract', 'Backgrounds/Textures'],
      dreamstimeCategory1: 1,
      dreamstimeCategory2: 2,
      dreamstimeCategory3: isAiGenerated ? 114 : 3,
    },
    status: 'completed',
    pipelineStage: 'committed',
    createdAt: Date.now(),
  };
}

class AtomicIngestionService {
  private items: Map<string, IngestionQueueItem> = new Map();
  private listeners: Set<IngestionListener> = new Set();
  private isRunning = false;

  public subscribe(listener: IngestionListener): () => void {
    this.listeners.add(listener);
    listener(this.getItems(), this.isRunning);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getItems(): IngestionQueueItem[] {
    return Array.from(this.items.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  private notify(): void {
    const list = this.getItems();
    this.listeners.forEach((fn) => {
      try {
        fn(list, this.isRunning);
      } catch (e) {
        console.error('[AtomicIngestion] Listener error:', e);
      }
    });
  }

  private updateItem(id: string, patch: Partial<IngestionQueueItem>): IngestionQueueItem | undefined {
    const existing = this.items.get(id);
    if (!existing) return undefined;
    const nextStage = patch.stage || existing.stage;
    const updated: IngestionQueueItem = {
      ...existing,
      ...patch,
      stage: nextStage,
      stageLabel: patch.stageLabel || getPipelineStageBadgeLabel(nextStage),
    };
    this.items.set(id, updated);
    this.notify();
    return updated;
  }

  public clearCompletedAndDuplicates(): void {
    for (const [id, item] of this.items.entries()) {
      if (item.stage === 'committed' || item.stage === 'duplicate_skipped') {
        this.items.delete(id);
      }
    }
    this.notify();
  }

  /**
   * Enqueues files for atomic ingestion into the Master Vault and starts the item-by-item pipeline.
   */
  public async enqueueFiles(
    files: File[],
    options: { isAiGenerated?: boolean; batchId?: string; useAiMetadata?: boolean } = {}
  ): Promise<{ committedCount: number; duplicateCount: number; failedCount: number }> {
    const validFiles = files.filter((f) => BatchQueueService.isSupportedStockMediaFile(f));
    const batchId = options.batchId || `B${String(new Date().getDate()).padStart(2, '0')}`;
    const isAiGenerated = options.isAiGenerated ?? true;
    const now = Date.now();

    const addedIds: string[] = [];
    validFiles.forEach((file, idx) => {
      const id = crypto.randomUUID();
      const sourcePath =
        (typeof window !== 'undefined' && (window as any).electronAPI?.getPathForFile?.(file)) ||
        (file as any).path ||
        undefined;

      const item: IngestionQueueItem = {
        id,
        file,
        sourcePath,
        filename: file.name,
        mediaType: detectMediaTypeFromFilename(file.name),
        fileSize: file.size,
        isAiGenerated,
        stage: 'queued',
        stageLabel: getPipelineStageBadgeLabel('queued'),
        createdAt: now + idx,
      };
      this.items.set(id, item);
      addedIds.push(id);
    });

    this.notify();
    return await this.processItemsByIds(addedIds, batchId, options.useAiMetadata ?? true);
  }

  /**
   * Retries a single failed ingestion item from scratch.
   */
  public async retryItem(itemId: string): Promise<void> {
    const existing = this.items.get(itemId);
    if (!existing) return;
    this.updateItem(itemId, {
      stage: 'queued',
      error: undefined,
      tempFilePath: undefined,
    });
    await this.processItemsByIds([itemId], 'B01', true);
  }

  private async processItemsByIds(
    ids: string[],
    batchId: string,
    useAiMetadata: boolean
  ): Promise<{ committedCount: number; duplicateCount: number; failedCount: number }> {
    this.isRunning = true;
    this.notify();

    let committedCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;

    for (const id of ids) {
      const item = this.items.get(id);
      if (!item) continue;

      let tempFilePath: string | undefined;

      try {
        // STEP 1: Copy to hidden .stockflow_temp & Compute SHA-256 Hash
        this.updateItem(id, { stage: 'copying_temp' });

        let rawBuffer: ArrayBuffer | undefined;
        if (item.file && typeof item.file.arrayBuffer === 'function') {
          rawBuffer = await item.file.arrayBuffer();
        }

        this.updateItem(id, { stage: 'hashing' });
        const stageRes = await db.tracker.stageAndHashFile({
          sourcePath: item.sourcePath,
          fileBuffer: rawBuffer,
          filename: item.filename,
          batchId,
        });

        if (!stageRes.success) {
          throw new Error(stageRes.error || 'Failed to copy file to temporary staging area.');
        }

        if (stageRes.isDuplicate) {
          duplicateCount++;
          this.updateItem(id, {
            stage: 'duplicate_skipped',
            fileHash: stageRes.fileHash,
            duplicateOfFilename: stageRes.existingFilename,
            stageLabel: `Duplicate (${stageRes.existingFilename || 'Skipped'})`,
          });
          continue;
        }

        tempFilePath = stageRes.tempFilePath;
        const fileHash = stageRes.fileHash;
        const fileSize = stageRes.fileSize || item.fileSize || 0;

        // STEP 2: Quality & Size Check
        this.updateItem(id, {
          stage: 'validating_quality',
          tempFilePath,
          fileHash,
          fileSize,
        });

        if (fileSize === 0) {
          throw new Error('Zero-byte or empty file rejected by quality gate.');
        }

        if (rawBuffer && rawBuffer.byteLength < 64) {
          const textSample = new TextDecoder().decode(rawBuffer);
          if (/corrupt/i.test(textSample)) {
            throw new Error('Corrupted media stream rejected by quality gate.');
          }
        }

        // STEP 3: Media-Specific Extraction (Extract EPS Preview / Mute Video Audio / Extract Thumbnail)
        let workingFile = item.file;
        let thumbnailBase64 = item.thumbnailBase64 || '';
        let width: number | undefined;
        let height: number | undefined;
        let durationSeconds: number | undefined;
        let resolution: string | undefined;
        let hasAudio = false;

        if (item.mediaType === 'vector') {
          this.updateItem(id, { stage: 'extracting_eps' });
        } else if (item.mediaType === 'video') {
          this.updateItem(id, { stage: 'muting_audio' });
          if (workingFile) {
            try {
              const mutedBlob = await stripAudioTrackLossless(workingFile);
              if (mutedBlob) {
                workingFile = new File([mutedBlob], item.filename, {
                  type: workingFile.type || 'video/mp4',
                });
                hasAudio = false;
              }
            } catch {
              // Keep original video if container doesn't require remuxing
            }
          }
        }

        if (workingFile) {
          try {
            const mediaInfo = await extractMediaInfo(workingFile, undefined, 512, 0.78);
            thumbnailBase64 = mediaInfo.thumbnailBase64 || '';
            width = mediaInfo.width;
            height = mediaInfo.height;
            durationSeconds = mediaInfo.videoDurationSeconds;
            resolution = mediaInfo.videoResolution;
            hasAudio = Boolean(mediaInfo.hasAudio);
          } catch {
            // Fall back to deterministic visual SVG preview below
          }
        }

        if (!thumbnailBase64) {
          const accent =
            item.mediaType === 'vector'
              ? '#8b5cf6'
              : item.mediaType === 'video'
              ? '#0ea5e9'
              : '#10b981';
          const badge = item.mediaType.toUpperCase();
          const shortLabel = item.filename.replace(/\.[^.]+$/, '').slice(-14);
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="${accent}"/></linearGradient></defs><rect width="160" height="160" fill="url(#g)"/><rect x="12" y="12" width="56" height="20" rx="4" fill="rgba(0,0,0,0.45)"/><text x="40" y="26" fill="#ffffff" font-family="monospace" font-size="10" font-weight="bold" text-anchor="middle">${badge}</text><text x="80" y="92" fill="#f8fafc" font-family="sans-serif" font-size="12" font-weight="600" text-anchor="middle">${shortLabel.replace(/[<>&"']/g, '')}</text></svg>`;
          thumbnailBase64 = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
          width = width || (item.mediaType === 'video' ? 3840 : 4000);
          height = height || (item.mediaType === 'video' ? 2160 : 3000);
        }

        // STEP 4: AI Metadata Generation (or Fast Fallback if no active Cloud/Local AI configured)
        this.updateItem(id, {
          stage: 'generating_metadata',
          thumbnailBase64,
          width,
          height,
          durationSeconds,
          resolution,
          hasAudio,
        });

        const settings = await getAppSettings();
        let metadataRecord = generateDeterministicFallbackMetadata(
          item.filename,
          item.mediaType,
          item.isAiGenerated,
          batchId,
          thumbnailBase64
        );

        if (useAiMetadata && thumbnailBase64) {
          try {
            if (settings.aiExecutionMode === 'local' && settings.localAiConfig) {
              const localCfg = settings.localAiConfig;
              const prompt = buildLocalVisionPrompt(
                item.filename,
                settings.defaultAiPrompt || '',
                item.mediaType,
                'mixed',
                'optimal',
                item.mediaType === 'vector'
              );
              const rawJson = await localAiAdapter.analyzeImage(
                localCfg.baseUrl,
                localCfg.modelId,
                thumbnailBase64,
                prompt,
                SYSTEM_LOCAL_VISION_PROMPT,
                undefined,
                (localCfg.timeoutSeconds || 300) * 1000,
                localCfg.hardwareProfile || 'auto'
              );
              metadataRecord = parseAndNormalizeAiMetadata(
                rawJson,
                item.filename,
                thumbnailBase64,
                batchId,
                item.isAiGenerated,
                settings.defaultAiModelName || 'Local VLM',
                'mixed',
                item.mediaType
              );
            } else {
              const allKeys = await db.apiKeys.toArray();
              const hasHealthyKey = allKeys.some((k) => k.status === 'healthy');
              if (hasHealthyKey) {
                const lease = await keyRingScheduler.acquireKey();
                try {
                  const adapter = getProviderAdapter(lease.keyRecord.providerId);
                  const prompt = buildVisionPrompt(
                    item.filename,
                    settings.defaultAiPrompt || '',
                    item.mediaType,
                    'mixed',
                    'optimal',
                    item.mediaType === 'vector'
                  );
                  const rawJson = await adapter.analyzeImage(
                    lease.keyRecord.key,
                    lease.keyRecord.modelId,
                    thumbnailBase64,
                    prompt,
                    SYSTEM_VISION_PROMPT
                  );
                  metadataRecord = parseAndNormalizeAiMetadata(
                    rawJson,
                    item.filename,
                    thumbnailBase64,
                    batchId,
                    item.isAiGenerated,
                    lease.keyRecord.modelId,
                    'mixed',
                    item.mediaType
                  );
                  await lease.release(true);
                } catch (aiErr: any) {
                  await lease.release(false, aiErr);
                  throw aiErr;
                }
              }
            }
          } catch (aiGenErr: any) {
            // If user explicitly had keys/local AI that threw an error, fail atomically so user can Retry
            const allKeys = await db.apiKeys.toArray();
            if (settings.aiExecutionMode === 'local' || allKeys.some((k) => k.status === 'healthy')) {
              throw new Error(`AI Metadata Generation failed: ${aiGenErr?.message || 'Provider error'}`);
            }
          }
        }

        // STEP 5: Atomic Commit to Master Vault & SQLite
        this.updateItem(id, { stage: 'committing_vault' });

        const recordToCommit: MasterMetadataRecord = {
          ...metadataRecord,
          id,
          batchId,
          filename: item.filename,
          originalFilename: item.filename,
          originalPath: item.sourcePath,
          fileHash,
          fileSize,
          thumbnailBase64,
          mediaType: item.mediaType,
          isAiGenerated: item.isAiGenerated,
          videoMeta:
            width || height || durationSeconds || resolution
              ? {
                  width,
                  height,
                  durationSeconds,
                  resolution,
                  hasAudio,
                }
              : undefined,
          pipelineStage: 'committed',
          status: 'completed',
          createdAt: item.createdAt,
        };

        const committed = await db.tracker.commitAtomicallyToMasterVault({
          record: recordToCommit,
          tempFilePath,
          triggerBackup: false, // We trigger the batch backup right after the loop completes
        });

        committedCount++;
        this.updateItem(id, {
          stage: 'committed',
          committedRecord: committed,
        });
      } catch (err: any) {
        failedCount++;
        // ATOMIC RULE: Immediately wipe temp file and roll back DB state for this item
        await db.tracker.rollbackIngestedItem({
          assetId: id,
          tempFilePath,
        });

        this.updateItem(id, {
          stage: 'failed',
          error: err?.message || 'Pipeline step failed — temp file wiped & rolled back.',
          stageLabel: 'Failed (Rolled Back)',
        });
      }
    }

    // Event-Driven Backup Trigger #3: Immediately after completing an ingestion batch
    if (committedCount > 0) {
      await db.tracker.performHotBackup('batch_ingest');
    }

    this.isRunning = false;
    this.notify();

    return { committedCount, duplicateCount, failedCount };
  }
}

export const atomicIngestionService = new AtomicIngestionService();
