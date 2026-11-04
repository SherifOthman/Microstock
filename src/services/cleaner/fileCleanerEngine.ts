import { MasterMetadataRecord } from '../../types';
import { isElectron } from '../desktop/desktopFs';
import { sanitizeRenamerFilename } from '../../utils/renamerSanitizer';
import { type SegregatedTrack, SEGREGATED_TRACKS, NEEDS_FIXING_FOLDER } from '../../constants/renamerRules';
import { AssetBatchType, RenamerFileItem, RenamerMediaType, RenamerJobResult } from '../../types/renamer';
import { parseImageHeaderBuffer } from '../../utils/imageHeaderParser';

export type { SegregatedTrack };
export { SEGREGATED_TRACKS, NEEDS_FIXING_FOLDER };
export type { AssetBatchType, RenamerFileItem, RenamerMediaType, RenamerJobResult };

export interface MediaResolutionValidation {
  width?: number;
  height?: number;
  isValid: boolean;
  isBlocking: boolean; // true for invalid video resolution
  warningType?: 'none' | 'video_invalid_resolution' | 'photo_low_resolution';
  message?: string;
}

export type AssetOrigin = 'real' | 'ai';

export type SubFolderTrack =
  | 'Photos'
  | 'Videos'
  | 'Vectors'
  | 'AI_Photos'
  | 'AI_Videos'
  | 'AI_Vectors';

export interface CleanedFileItem {
  id: string;
  file: File;
  originalName: string;
  cleanedName: string;
  customName?: string;
  extension: string;
  lastModified: number;
  size: number;
  charCount: number;
  thumbnailUrl?: string;
  batchFolder: string; // e.g. "B01"
  batchIndex: number; // e.g. 1
  subFolder: SubFolderTrack;
  assetOrigin?: AssetOrigin;
  isAiGenerated?: boolean;
  relativePath: string; // e.g. "Photos/B01/B01_001.jpg" or "AI_Photos/B01/B01_001.jpg"
  validation?: MediaResolutionValidation;
  nativePath?: string;
  fuzzyKey: string;
  isDuplicate?: boolean;
  duplicateCount?: number;
}

export type SortOrderOption = 'shuffle' | 'alphabetical';

export interface CleanerOptions {
  sortOrder: SortOrderOption;
  maxItemsPerBatch: number;
  assetOrigin?: AssetOrigin;
}

export const DEFAULT_CLEANER_OPTIONS: CleanerOptions = {
  sortOrder: 'shuffle', // Default Shuffle (Random Mix)
  maxItemsPerBatch: 100,
  assetOrigin: 'real',
};

export interface ExistingBatchInfo {
  name: string;
  number: number;
  path: string;
  fileCount: number;
  highestIndex: number;
  lastFileName?: string;
}

export interface BatchSlotCalculation {
  startBatchNumber: number;
  startBatchFolder: string;
  startItemIndex: number;
  itemsRemainingInStartBatch: number;
  slotLabel: string;
  statusDescription: string;
  isContinuingExisting: boolean;
}

/**
 * Determines sub-folder track based on file extension and AssetOrigin ('real' vs 'ai')
 */
export function getSubFolderForExtension(
  filename: string,
  assetOrigin: AssetOrigin = 'real'
): SubFolderTrack {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const isAi = assetOrigin === 'ai';
  if (['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv'].includes(ext)) {
    return isAi ? 'AI_Videos' : 'Videos';
  }
  if (['eps', 'ai', 'svg'].includes(ext)) {
    return isAi ? 'AI_Vectors' : 'Vectors';
  }
  return isAi ? 'AI_Photos' : 'Photos'; // jpg, jpeg, png, etc.
}

/**
 * Calculates the next available slot given the scanned disk folders and maxItemsPerBatch.
 */
export function calculateNextAvailableSlot(
  batches: ExistingBatchInfo[] = [],
  maxItemsPerBatch = 100
): BatchSlotCalculation {
  if (!batches || batches.length === 0) {
    return {
      startBatchNumber: 1,
      startBatchFolder: 'B01',
      startItemIndex: 1,
      itemsRemainingInStartBatch: maxItemsPerBatch,
      slotLabel: 'B01_001',
      statusDescription: 'Ready to start fresh at B01_001',
      isContinuingExisting: false,
    };
  }

  const sorted = [...batches].sort((a, b) => a.number - b.number);
  const latest = sorted[sorted.length - 1];

  if (latest.fileCount >= maxItemsPerBatch || latest.highestIndex >= maxItemsPerBatch) {
    const nextNum = latest.number + 1;
    const folder = `B${String(nextNum).padStart(2, '0')}`;
    return {
      startBatchNumber: nextNum,
      startBatchFolder: folder,
      startItemIndex: 1,
      itemsRemainingInStartBatch: maxItemsPerBatch,
      slotLabel: `${folder}_001`,
      statusDescription: `Continuing from ${folder}_001 (${latest.name} reached ${latest.fileCount} items)`,
      isContinuingExisting: true,
    };
  }

  const folder = `B${String(latest.number).padStart(2, '0')}`;
  const nextIdx = (latest.highestIndex > 0 ? latest.highestIndex : latest.fileCount) + 1;
  const remaining = Math.max(0, maxItemsPerBatch - (nextIdx - 1));
  const slotStr = `${folder}_${String(nextIdx).padStart(3, '0')}`;

  return {
    startBatchNumber: latest.number,
    startBatchFolder: folder,
    startItemIndex: nextIdx,
    itemsRemainingInStartBatch: remaining,
    slotLabel: slotStr,
    statusDescription: `Continuing from ${slotStr} (${remaining} slots left in ${folder})`,
    isContinuingExisting: true,
  };
}

/**
 * Fisher-Yates array shuffle
 */
export function shuffleArray<T>(items: T[], seed = 0): T[] {
  const result = [...items];
  let m = result.length;
  let t: T;
  let i: number;
  let s = seed || Date.now();

  const random = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  while (m) {
    i = Math.floor(random() * m--);
    t = result[m];
    result[m] = result[i];
    result[i] = t;
  }

  return result;
}

/**
 * Inspects dimensions of an image or video file
 */
export async function validateMediaDimensions(file: File): Promise<MediaResolutionValidation> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  // 1. Vector files (.eps, .ai)
  if (['eps', 'ai', 'svg'].includes(ext)) {
    return { isValid: true, isBlocking: false, warningType: 'none' };
  }

  // 2. Video files (.mp4, .mov)
  if (['mp4', 'mov', 'm4v'].includes(ext)) {
    return new Promise((resolve) => {
      let settled = false;
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      const url = URL.createObjectURL(file);
      video.src = url;

      const finish = (width: number, height: number) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        video.onloadedmetadata = null;
        video.onerror = null;

        const isFHD = (width === 1920 && height === 1080) || (width === 1080 && height === 1920);
        const is4K =
          (width === 3840 && height === 2160) ||
          (width === 2160 && height === 3840) ||
          (width === 4096 && height === 2160) ||
          (width === 2160 && height === 4096);

        if (isFHD || is4K) {
          resolve({
            width,
            height,
            isValid: true,
            isBlocking: false,
            warningType: 'none',
          });
        } else {
          resolve({
            width,
            height,
            isValid: false,
            isBlocking: true,
            warningType: 'video_invalid_resolution',
            message: `Invalid Resolution: ${width}x${height}. Must be 1080p (1920x1080) or 4K (3840x2160 / 4096x2160).`,
          });
        }
      };

      video.onloadedmetadata = () => {
        finish(video.videoWidth, video.videoHeight);
      };

      video.onerror = () => {
        if (!settled) {
          settled = true;
          URL.revokeObjectURL(url);
          resolve({
            isValid: true,
            isBlocking: false,
            warningType: 'none',
          });
        }
      };

      // Timeout fallback
      setTimeout(() => {
        if (!settled) {
          settled = true;
          URL.revokeObjectURL(url);
          resolve({ isValid: true, isBlocking: false, warningType: 'none' });
        }
      }, 3000);
    });
  }

// Web Worker Pool for fast 64KB binary image header dimension parsing
const INSPECTOR_POOL_SIZE = 4;
let inspectorWorkers: Worker[] = [];
let inspectorNextIdx = 0;
let inspectorJobSeq = 1;
const inspectorPending = new Map<number, (dims: { width: number; height: number } | null) => void>();

function getNextInspectorWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  if (inspectorWorkers.length === 0) {
    try {
      for (let i = 0; i < INSPECTOR_POOL_SIZE; i++) {
        const w = new Worker(new URL('../../workers/mediaInspector.worker.ts', import.meta.url), {
          type: 'module',
        });
        w.onmessage = (e) => {
          const { id, width, height, parsed } = e.data || {};
          const cb = inspectorPending.get(id);
          if (cb) {
            inspectorPending.delete(id);
            cb(parsed && width && height ? { width, height } : null);
          }
        };
        w.onerror = () => {
          // Fallback handled per request timeout
        };
        inspectorWorkers.push(w);
      }
    } catch {
      inspectorWorkers = [];
      return null;
    }
  }
  const worker = inspectorWorkers[inspectorNextIdx % inspectorWorkers.length];
  inspectorNextIdx = (inspectorNextIdx + 1) % inspectorWorkers.length;
  return worker;
}

async function parseHeaderDimsOffThread(file: File, ext: string): Promise<{ width: number; height: number } | null> {
  try {
    const sliceSize = Math.min(file.size, 65536);
    const buffer = await file.slice(0, sliceSize).arrayBuffer();
    const worker = getNextInspectorWorker();
    if (worker) {
      return await new Promise<{ width: number; height: number } | null>((resolve) => {
        const id = inspectorJobSeq++;
        const timer = setTimeout(() => {
          if (inspectorPending.has(id)) {
            inspectorPending.delete(id);
            resolve(null);
          }
        }, 1200);
        inspectorPending.set(id, (dims) => {
          clearTimeout(timer);
          resolve(dims);
        });
        worker.postMessage({ id, buffer, ext }, [buffer]);
      });
    }
    return parseImageHeaderBuffer(buffer);
  } catch {
    return null;
  }
}

function buildPhotoValidationResult(width: number, height: number): MediaResolutionValidation {
  const megapixels = (width * height) / 1000000;
  if (width < 3000 || height < 3000) {
    return {
      width,
      height,
      isValid: true,
      isBlocking: false,
      warningType: 'photo_low_resolution',
      message: `Needs Upscaling: ${width}x${height} (${megapixels.toFixed(1)} MP). Both dimensions must be 3000px+ for microstock readiness.`,
    };
  }
  return {
    width,
    height,
    isValid: true,
    isBlocking: false,
    warningType: 'none',
  };
}

  // 3. Photo / Image files (.jpg, .jpeg, .png, .webp, etc.)
  // Fast Path 1: 64KB Binary Header Parser via Web Worker Pool (<0.5ms per file, 0 pixel decode)
  const fastDims = await parseHeaderDimsOffThread(file, ext);
  if (fastDims && fastDims.width > 0 && fastDims.height > 0) {
    return buildPhotoValidationResult(fastDims.width, fastDims.height);
  }

  // Fast Path 2: Hardware-accelerated createImageBitmap (if SOF marker was beyond 64KB)
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      const width = bmp.width;
      const height = bmp.height;
      bmp.close();
      if (width > 0 && height > 0) {
        return buildPhotoValidationResult(width, height);
      }
    } catch {
      // Fall through to FileReader/Image fallback for JSDOM test environments
    }
  }

  // Fallback Path 3: Standard Image element (for JSDOM / unit test environments)
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        resolve(buildPhotoValidationResult(width, height));
      };
      img.onerror = () => {
        resolve({ isValid: true, isBlocking: false, warningType: 'none' });
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      resolve({ isValid: true, isBlocking: false, warningType: 'none' });
    };
    reader.readAsDataURL(file);
  });
}

export type MediaType = SubFolderTrack;

export interface MediaBatchesMap {
  Photos: ExistingBatchInfo[];
  Videos: ExistingBatchInfo[];
  Vectors: ExistingBatchInfo[];
  AI_Photos?: ExistingBatchInfo[];
  AI_Videos?: ExistingBatchInfo[];
  AI_Vectors?: ExistingBatchInfo[];
}

export interface MediaSlotsMap {
  Photos: BatchSlotCalculation;
  Videos: BatchSlotCalculation;
  Vectors: BatchSlotCalculation;
  AI_Photos: BatchSlotCalculation;
  AI_Videos: BatchSlotCalculation;
  AI_Vectors: BatchSlotCalculation;
}

/**
 * Calculates next available slots across all 6 Real & AI media tracks independently
 */

export interface ParsedBatchSequence {
  batchNum: number;
  sequence: number;
}

/**
 * Extracts batch number and sequence index from filenames like:
 * - B01_024__clean_slug.jpg     -> { batchNum: 1, sequence: 24 }
 * - B01_024_AI__sunset.jpg      -> { batchNum: 1, sequence: 24 }
 * - B02_AI_PH_005_mountain.jpg  -> { batchNum: 2, sequence: 5 }
 * - B03_010.eps                 -> { batchNum: 3, sequence: 10 }
 */
export function parseBatchAndSequence(filename: string): ParsedBatchSequence | null {
  if (!filename) return null;
  const clean = filename.trim().split(/[\\/]/).pop() || '';
  const match = clean.match(/^B(\d+)[-_](?:[A-Z0-9]+[-_])*?(\d+)(?:[^0-9]|$)/i);
  if (match) {
    const batchNum = parseInt(match[1], 10);
    const sequence = parseInt(match[2], 10);
    if (!isNaN(batchNum) && !isNaN(sequence)) {
      return { batchNum, sequence };
    }
  }
  return null;
}

/**
 * Merges physical disk batch metadata with SQLite master records (MasterMetadataRecord).
 * For any batch, highestIndex = Math.max(diskHighestIndex, dbHighestIndex).
 * If a batch folder was deleted from disk entirely but exists in DB, it is preserved.
 * Prevents catastrophic sequence counter resets when files are purged from disk after export.
 */
export function reconcileBatchesWithDb(
  mediaBatches: Partial<MediaBatchesMap> = {},
  dbRecords: MasterMetadataRecord[] = []
): MediaBatchesMap {
  const reconciled: MediaBatchesMap = {
    Photos: (mediaBatches.Photos || []).map((b) => ({ ...b })),
    Videos: (mediaBatches.Videos || []).map((b) => ({ ...b })),
    Vectors: (mediaBatches.Vectors || []).map((b) => ({ ...b })),
    AI_Photos: (mediaBatches.AI_Photos || []).map((b) => ({ ...b })),
    AI_Videos: (mediaBatches.AI_Videos || []).map((b) => ({ ...b })),
    AI_Vectors: (mediaBatches.AI_Vectors || []).map((b) => ({ ...b })),
  };

  if (!dbRecords || dbRecords.length === 0) {
    return reconciled;
  }

  for (const rec of dbRecords) {
    if (!rec.filename) continue;
    const parsed = parseBatchAndSequence(rec.filename);
    if (!parsed) continue;

    // Resolve structural track
    const isVector = rec.mediaType === 'vector' || /\.(eps|ai|svg)$/i.test(rec.filename);
    const isVideo = rec.mediaType === 'video' || /\.(mp4|mov|mkv|webm)$/i.test(rec.filename);

    let track: SubFolderTrack;
    if (isVector) track = rec.isAiGenerated ? 'AI_Vectors' : 'Vectors';
    else if (isVideo) track = rec.isAiGenerated ? 'AI_Videos' : 'Videos';
    else track = rec.isAiGenerated ? 'AI_Photos' : 'Photos';

    const batchList = reconciled[track] || [];
    let batchInfo = batchList.find((b) => b.number === parsed.batchNum);

    if (!batchInfo) {
      batchInfo = {
        name: `B${String(parsed.batchNum).padStart(2, '0')}`,
        number: parsed.batchNum,
        path: '',
        fileCount: 0,
        highestIndex: parsed.sequence,
        lastFileName: rec.filename,
      };
      batchList.push(batchInfo);
    } else {
      if (parsed.sequence > batchInfo.highestIndex) {
        batchInfo.highestIndex = parsed.sequence;
        batchInfo.lastFileName = rec.filename;
      }
    }
  }

  for (const key of Object.keys(reconciled) as (keyof MediaBatchesMap)[]) {
    const list = reconciled[key];
    if (list && Array.isArray(list)) {
      list.sort((a, b) => a.number - b.number);
    }
  }

  return reconciled;
}

export function calculateAllMediaSlots(
  mediaBatches: Partial<MediaBatchesMap> = {},
  maxItemsPerBatch = 100,
  dbRecords?: MasterMetadataRecord[]
): MediaSlotsMap {
  const reconciled = dbRecords && dbRecords.length > 0
    ? reconcileBatchesWithDb(mediaBatches, dbRecords)
    : mediaBatches;

  return {
    Photos: calculateNextAvailableSlot(reconciled.Photos || [], maxItemsPerBatch),
    Videos: calculateNextAvailableSlot(reconciled.Videos || [], maxItemsPerBatch),
    Vectors: calculateNextAvailableSlot(reconciled.Vectors || [], maxItemsPerBatch),
    AI_Photos: calculateNextAvailableSlot(reconciled.AI_Photos || [], maxItemsPerBatch),
    AI_Videos: calculateNextAvailableSlot(reconciled.AI_Videos || [], maxItemsPerBatch),
    AI_Vectors: calculateNextAvailableSlot(reconciled.AI_Vectors || [], maxItemsPerBatch),
  };
}

/**
 * Cleans the original filename for the hybrid naming scheme:
 * - Uses sanitizeRenamerFilename for multi-pass tokenization, hash removal, and whole-word truncation.
 * - Returns a clean snake_case slug (e.g., "green_laser_scanning_carbon_fiber").
 */
export function cleanOriginalBaseName(originalFilename: string): string {
  const result = sanitizeRenamerFilename(originalFilename);
  return result.cleanBase;
}

/**
 * Advanced fuzzy normalization for stock asset filenames:
 * Strips common suffixes (upscaling tags, copy numbers, resolution, AI hashes, timestamps)
 * to group duplicate assets (e.g. original vs upscaled or copy).
 */
export function getFuzzyNormalizedBaseName(filename: string): string {
  const result = sanitizeRenamerFilename(filename);
  return result.cleanBase.replace(/_/g, ' ');
}

/**
 * Categorizes a file by extension into photo, video, or vector.
 */
export function getRenamerMediaType(filename: string): RenamerMediaType {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv'].includes(ext)) {
    return 'video';
  }
  if (['eps', 'ai', 'svg'].includes(ext)) {
    return 'vector';
  }
  return 'photo';
}

/**
 * Determines the 6-way segregated track based on user-chosen batchType ('ai' | 'native')
 * and detected mediaType ('photo' | 'video' | 'vector').
 */
export function getSegregatedTrack(batchType: AssetBatchType, mediaType: RenamerMediaType): SegregatedTrack {
  if (batchType.toLowerCase() === 'ai') {
    if (mediaType === 'video') return 'AI_Videos';
    if (mediaType === 'vector') return 'AI_Vectors';
    return 'AI_Photos';
  } else {
    if (mediaType === 'video') return 'Videos';
    if (mediaType === 'vector') return 'Vectors';
    return 'Photos';
  }
}

/**
 * Core Segregation & Renaming Engine:
 * - Sorts & processes files
 * - Segregates into 6 isolated tracks (Photos, AI_Photos, Videos, AI_Videos, Vectors, AI_Vectors)
 * - Assigns independent counters per track (001, 002...)
 * - Pairs .eps and preview .jpg with identical base names
 * - Routes files with < 2 valid words to _Needs_Fixing
 * - Solves the 3 real-world bugs (embedded hashes, numeric-only names, mid-word truncation)
 * - Ensures idempotency
 */
export function processFilesForSegregatedRenaming(
  files: (File | { name: string; size: number; path?: string })[],
  batchType: AssetBatchType,
  startingBatchNumber = 1
): RenamerFileItem[] {
  const batchStr = `B${String(startingBatchNumber).padStart(2, '0')}`;

  // Track independent counters per track
  const trackCounters: Record<SegregatedTrack, number> = {
    Photos: 1,
    AI_Photos: 1,
    Videos: 1,
    AI_Videos: 1,
    Vectors: 1,
    AI_Vectors: 1,
  };

  const results: RenamerFileItem[] = [];

  // First pass: identify vector files and pre-assign sequences so .jpg preview and .eps pair identically
  const epsBaseNames = new Map<string, string>();
  const assignedVectorSequences = new Map<string, { track: SegregatedTrack; seq: number; cleanBase: string }>();

  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'eps' || ext === 'ai') {
      const sanitized = sanitizeRenamerFilename(file.name);
      if (!sanitized.needsFixing && !sanitized.isAlreadyRenamed) {
        epsBaseNames.set(sanitized.cleanBase, file.name);
        const vectorTrack = getSegregatedTrack(batchType, 'vector');
        const seq = trackCounters[vectorTrack]++;
        assignedVectorSequences.set(sanitized.cleanBase, { track: vectorTrack, seq, cleanBase: sanitized.cleanBase });
      }
    }
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const sanitized = sanitizeRenamerFilename(file.name);
    const mediaType = getRenamerMediaType(file.name);
    const isRaster = mediaType === 'photo';
    const isPairedWithEps = isRaster && epsBaseNames.has(sanitized.cleanBase);
    const effectiveMediaType = isPairedWithEps ? 'vector' : mediaType;
    const track = getSegregatedTrack(batchType, effectiveMediaType);
    const ext = sanitized.extension || (file.name.includes('.') ? `.${file.name.split('.').pop()?.toLowerCase()}` : '');

    // If file is 0 bytes or corrupted
    if (file.size === 0) {
      results.push({
        id: `renamer-${i}-${file.name}`,
        originalFile: file as any,
        originalName: file.name,
        originalFilename: file.name,
        cleanName: sanitized.cleanBase,
        mediaType,
        batchType,
        track,
        batchNumber: startingBatchNumber,
        sequenceNumber: 0,
        proposedFilename: file.name,
        newFilename: file.name,
        extension: ext.replace(/^\./, ''),
        targetFolder: NEEDS_FIXING_FOLDER,
        needsFixing: true,
        fixingReason: 'Corrupted or empty file (0 bytes).',
        status: 'pending',
        isAlreadyFormatted: false,
      });
      continue;
    }

    // If file needs fixing (e.g. numeric only like 425997637_1793366301908538.mp4)
    if (sanitized.needsFixing) {
      results.push({
        id: `renamer-${i}-${file.name}`,
        originalFile: file,
        originalName: file.name,
        originalFilename: file.name,
        cleanName: sanitized.cleanBase,
        mediaType,
        batchType,
        track,
        batchNumber: startingBatchNumber,
        sequenceNumber: 0,
        proposedFilename: file.name,
        newFilename: file.name,
        extension: ext.replace(/^\./, ''),
        targetFolder: NEEDS_FIXING_FOLDER,
        needsFixing: true,
        fixingReason: sanitized.fixingReason || 'Filename does not contain at least 2 descriptive English words.',
        status: 'pending',
        isAlreadyFormatted: false,
      });
      continue;
    }

    // Check idempotency: already renamed
    if (sanitized.isAlreadyRenamed) {
      results.push({
        id: `renamer-${i}-${file.name}`,
        originalFile: file,
        originalName: file.name,
        originalFilename: file.name,
        cleanName: sanitized.cleanBase,
        mediaType,
        batchType,
        track,
        batchNumber: startingBatchNumber,
        sequenceNumber: 0,
        proposedFilename: file.name,
        newFilename: file.name,
        extension: ext.replace(/^\./, ''),
        targetFolder: track,
        needsFixing: false,
        status: 'skipped',
        isAlreadyFormatted: true,
      });
      continue;
    }

    // Determine sequence counter
    let seq = 1;
    const prefixCode = SEGREGATED_TRACKS[track].prefixCode;

    if (assignedVectorSequences.has(sanitized.cleanBase)) {
      seq = assignedVectorSequences.get(sanitized.cleanBase)!.seq;
    } else {
      seq = trackCounters[track]++;
    }

    const seqStr = String(seq).padStart(3, '0');
    const proposedFilename = `${batchStr}_${prefixCode}_${seqStr}_${sanitized.cleanBase}${ext}`;

    results.push({
      id: `renamer-${i}-${file.name}`,
      originalFile: file,
      originalName: file.name,
      originalFilename: file.name,
      cleanName: sanitized.cleanBase,
      mediaType,
      batchType,
      track,
      batchNumber: startingBatchNumber,
      sequenceNumber: seq,
      proposedFilename,
      newFilename: proposedFilename,
      extension: ext.replace(/^\./, ''),
      targetFolder: track,
      needsFixing: false,
      status: 'pending',
      isPairedVectorPreview: isPairedWithEps,
      pairedEpsName: isPairedWithEps ? epsBaseNames.get(sanitized.cleanBase) : undefined,
      isAlreadyFormatted: false,
    });
  }

  return results;
}

/**
 * Processes imported files:
 * 1. Sorts by Shuffle (default) or Alphabetical (A-Z)
 * 2. Media-First Hierarchy: Master / [Media Type] / [Batch]
 * 3. Independent Batch Counters per Media Type
 * 4. Hybrid Sequential Naming: [BATCH]_[SEQUENCE]__[CLEANED_NAME].ext
 * 5. Runs fuzzy duplicate detection across all imported files
 */
export function processFilesForBatchIngest(
  files: File[],
  options: CleanerOptions = DEFAULT_CLEANER_OPTIONS,
  initialSlotsInput?: MediaSlotsMap | BatchSlotCalculation,
  shuffleSeed = 1,
  nativePathsMap: Record<string, string> = {}
): CleanedFileItem[] {
  if (files.length === 0) return [];

  const VECTOR_EXTENSIONS = new Set(['eps', 'ai', 'svg']);
  const RASTER_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

  const getFileStem = (filename: string): string => {
    const lastDot = filename.lastIndexOf('.');
    return (lastDot > 0 ? filename.slice(0, lastDot) : filename).trim().toLowerCase();
  };

  // Identify all vector files by their base name stem
  const vectorStems = new Set<string>();
  for (const f of files) {
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    if (VECTOR_EXTENSIONS.has(ext)) {
      vectorStems.add(getFileStem(f.name));
    }
  }

  // Count fuzzy keys across all imported files to detect duplicates.
  // A vector file (.eps) and its companion preview image (.jpg) represent a SINGLE paired stock asset.
  // Do NOT double count them against each other so they are never falsely flagged as duplicates!
  const fuzzyCounts = new Map<string, number>();
  const countedPairStems = new Set<string>();

  for (const f of files) {
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    const stem = getFileStem(f.name);
    const isPairedRaster = RASTER_EXTENSIONS.has(ext) && vectorStems.has(stem);

    if (isPairedRaster) {
      if (countedPairStems.has(stem)) {
        continue;
      }
      countedPairStems.add(stem);
    } else if (VECTOR_EXTENSIONS.has(ext)) {
      countedPairStems.add(stem);
    }

    const key = getFuzzyNormalizedBaseName(f.name);
    if (key.length >= 2) {
      fuzzyCounts.set(key, (fuzzyCounts.get(key) || 0) + 1);
    }
  }

  let orderedFiles: File[];
  if (options.sortOrder === 'alphabetical') {
    orderedFiles = [...files].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
  } else {
    // Default: Shuffle (Random Mix)
    // Keep linked EPS + JPG vector pairs adjacent so they stay unified when reviewing batches
    const pairedGroups = new Map<string, File[]>();
    const singles: File[] = [];

    for (const f of files) {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      const stem = getFileStem(f.name);
      const isPairedRaster = RASTER_EXTENSIONS.has(ext) && vectorStems.has(stem);
      if (VECTOR_EXTENSIONS.has(ext) || isPairedRaster) {
        if (!pairedGroups.has(stem)) {
          pairedGroups.set(stem, []);
        }
        pairedGroups.get(stem)!.push(f);
      } else {
        singles.push(f);
      }
    }

    // In each pair, ensure the .eps is ordered first, followed by the companion .jpg
    for (const group of pairedGroups.values()) {
      group.sort((a, b) => {
        const aExt = a.name.split('.').pop()?.toLowerCase() || '';
        const bExt = b.name.split('.').pop()?.toLowerCase() || '';
        const aIsVec = VECTOR_EXTENSIONS.has(aExt) ? 0 : 1;
        const bIsVec = VECTOR_EXTENSIONS.has(bExt) ? 0 : 1;
        return aIsVec - bIsVec;
      });
    }

    const units: File[][] = [
      ...Array.from(pairedGroups.values()),
      ...singles.map((f) => [f]),
    ];
    const shuffledUnits = shuffleArray(units, shuffleSeed);
    orderedFiles = shuffledUnits.flat();
  }

  // Normalize initialSlots to full 6-track MediaSlotsMap
  const defaultFreshSlot: BatchSlotCalculation = {
    startBatchNumber: 1,
    startBatchFolder: 'B01',
    startItemIndex: 1,
    itemsRemainingInStartBatch: options.maxItemsPerBatch,
    slotLabel: 'B01_001',
    statusDescription: 'New Batch',
    isContinuingExisting: false,
  };

  let mediaSlots: MediaSlotsMap;
  if (initialSlotsInput && 'Photos' in initialSlotsInput) {
    const partial = initialSlotsInput as Partial<MediaSlotsMap>;
    mediaSlots = {
      Photos: partial.Photos || defaultFreshSlot,
      Videos: partial.Videos || defaultFreshSlot,
      Vectors: partial.Vectors || defaultFreshSlot,
      AI_Photos: partial.AI_Photos || defaultFreshSlot,
      AI_Videos: partial.AI_Videos || defaultFreshSlot,
      AI_Vectors: partial.AI_Vectors || defaultFreshSlot,
    };
  } else {
    const fallbackSlot = (initialSlotsInput as BatchSlotCalculation) || defaultFreshSlot;
    mediaSlots = {
      Photos: fallbackSlot,
      Videos: fallbackSlot,
      Vectors: fallbackSlot,
      AI_Photos: fallbackSlot,
      AI_Videos: fallbackSlot,
      AI_Vectors: fallbackSlot,
    };
  }

  const assetOrigin: AssetOrigin = options.assetOrigin === 'ai' ? 'ai' : 'real';
  const isAiGenerated = assetOrigin === 'ai';

  // Helper to build tracker state from a slot calculation
  const makeTracker = (slot: BatchSlotCalculation) => ({
    currentBatchNum: slot.startBatchNumber,
    currentItemIdx: slot.startItemIndex,
    itemsInCurrentBatch: Math.max(0, options.maxItemsPerBatch - slot.itemsRemainingInStartBatch),
  });

  // Maintain independent tracker per 6-way track (Real vs AI x Photo/Video/Vector)
  const trackers: Record<SubFolderTrack, {
    currentBatchNum: number;
    currentItemIdx: number;
    itemsInCurrentBatch: number;
  }> = {
    Photos: makeTracker(mediaSlots.Photos),
    Videos: makeTracker(mediaSlots.Videos),
    Vectors: makeTracker(mediaSlots.Vectors),
    AI_Photos: makeTracker(mediaSlots.AI_Photos),
    AI_Videos: makeTracker(mediaSlots.AI_Videos),
    AI_Vectors: makeTracker(mediaSlots.AI_Vectors),
  };

  interface PairedVectorAllocation {
    batchFolder: string;
    batchIndex: number;
    targetBaseName: string;
    subFolder: SubFolderTrack;
  }
  const pairedAllocations = new Map<string, PairedVectorAllocation>();

  return orderedFiles.map((file, idx) => {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const stem = getFileStem(file.name);
    const isVector = VECTOR_EXTENSIONS.has(ext);
    const isPairedRaster = RASTER_EXTENSIONS.has(ext) && vectorStems.has(stem);
    const isPartOfVectorPair = isVector || isPairedRaster;

    let subFolder: SubFolderTrack;
    let batchFolder: string;
    let batchIndex: number;
    let targetFilename: string;

    if (isPartOfVectorPair) {
      // Both the EPS and its matching companion preview route together to Vectors (or AI_Vectors)
      const vectorTrack: SubFolderTrack = isAiGenerated ? 'AI_Vectors' : 'Vectors';
      subFolder = vectorTrack;

      if (pairedAllocations.has(stem)) {
        // Reuse synchronized allocation from partner
        const alloc = pairedAllocations.get(stem)!;
        batchFolder = alloc.batchFolder;
        batchIndex = alloc.batchIndex;
        targetFilename = `${alloc.targetBaseName}.${ext}`;
      } else {
        // First file of pair: allocate new slot from vector tracker
        const tracker = trackers[vectorTrack];
        if (tracker.itemsInCurrentBatch >= options.maxItemsPerBatch) {
          tracker.currentBatchNum++;
          tracker.currentItemIdx = 1;
          tracker.itemsInCurrentBatch = 0;
        }

        batchFolder = `B${String(tracker.currentBatchNum).padStart(2, '0')}`;
        const indexStr = String(tracker.currentItemIdx).padStart(3, '0');
        const cleanedOriginal = cleanOriginalBaseName(file.name);

        let targetBaseName: string;
        if (assetOrigin === 'ai') {
          const aiTokenRegex = /(?:^|_)(ai)(?:_|$)/i;
          if (aiTokenRegex.test(cleanedOriginal)) {
            const withUpperAi = cleanedOriginal.replace(aiTokenRegex, (match, p1) => match.replace(p1, 'AI'));
            targetBaseName = `${batchFolder}_${indexStr}__${withUpperAi}`;
          } else {
            targetBaseName = `${batchFolder}_${indexStr}_AI__${cleanedOriginal}`;
          }
        } else {
          targetBaseName = `${batchFolder}_${indexStr}__${cleanedOriginal}`;
        }

        batchIndex = tracker.currentItemIdx;
        targetFilename = `${targetBaseName}.${ext}`;

        pairedAllocations.set(stem, {
          batchFolder,
          batchIndex,
          targetBaseName,
          subFolder: vectorTrack,
        });

        // Advance vector counter once for the whole pair
        tracker.currentItemIdx++;
        tracker.itemsInCurrentBatch++;
      }
    } else {
      // Standard routing for photos, videos, and standalone files
      subFolder = getSubFolderForExtension(file.name, assetOrigin);
      const tracker = trackers[subFolder];

      if (tracker.itemsInCurrentBatch >= options.maxItemsPerBatch) {
        tracker.currentBatchNum++;
        tracker.currentItemIdx = 1;
        tracker.itemsInCurrentBatch = 0;
      }

      batchFolder = `B${String(tracker.currentBatchNum).padStart(2, '0')}`;
      const indexStr = String(tracker.currentItemIdx).padStart(3, '0');
      const cleanedOriginal = cleanOriginalBaseName(file.name);

      if (assetOrigin === 'ai') {
        const aiTokenRegex = /(?:^|_)(ai)(?:_|$)/i;
        if (aiTokenRegex.test(cleanedOriginal)) {
          const withUpperAi = cleanedOriginal.replace(aiTokenRegex, (match, p1) => match.replace(p1, 'AI'));
          targetFilename = `${batchFolder}_${indexStr}__${withUpperAi}.${ext}`;
        } else {
          targetFilename = `${batchFolder}_${indexStr}_AI__${cleanedOriginal}.${ext}`;
        }
      } else {
        targetFilename = `${batchFolder}_${indexStr}__${cleanedOriginal}.${ext}`;
      }

      batchIndex = tracker.currentItemIdx;
      tracker.currentItemIdx++;
      tracker.itemsInCurrentBatch++;
    }

    // Media-First Dual-Root Hierarchy: Master / [Real | AI] / [Photos | AI_Photos | ...] / [Batch] / [Filename]
    const rootFolder = assetOrigin === 'ai' ? 'AI' : 'Real';
    const relativePath = `${rootFolder}/${subFolder}/${batchFolder}/${targetFilename}`;

    const fuzzyKey = getFuzzyNormalizedBaseName(file.name);
    const dupCount = fuzzyKey.length >= 2 ? fuzzyCounts.get(fuzzyKey) || 1 : 1;
    const isDuplicate = dupCount > 1;

    const nativePath = nativePathsMap[file.name] || (file as any).path || '';

    return {
      id: `${file.name}-${file.size}-${idx}`,
      file,
      originalName: file.name,
      cleanedName: targetFilename,
      extension: ext,
      lastModified: file.lastModified,
      size: file.size,
      charCount: targetFilename.length,
      batchFolder,
      batchIndex,
      subFolder,
      assetOrigin,
      isAiGenerated,
      relativePath,
      fuzzyKey,
      isDuplicate,
      duplicateCount: dupCount,
      nativePath,
    };
  });
}

/**
 * Saves prepared batch files directly to disk via Electron IPC chunked streaming
 * Creates destination batch folders and sub-folders (Photos/, Videos/, Vectors/)
 */
export async function saveBatchFilesToMasterDirectory(
  masterDir: string,
  items: CleanedFileItem[],
  onProgress?: (done: number, total: number, currentName: string) => void
): Promise<{ success: boolean; savedCount: number; error?: string }> {
  if (!masterDir) {
    return { success: false, savedCount: 0, error: 'Please select a Master Destination Directory first.' };
  }
  if (!items || items.length === 0) {
    return { success: false, savedCount: 0, error: 'No files to save.' };
  }

  // Check if any file has a blocking error
  const blockingFile = items.find((i) => i.validation?.isBlocking);
  if (blockingFile) {
    return {
      success: false,
      savedCount: 0,
      error: `Cannot process: "${blockingFile.originalName}" has an invalid video resolution. Please fix or remove it.`,
    };
  }

  if (!isElectron()) {
    throw new Error('This application must run in the Electron Desktop Client');
  }

  const electronAPI = (window as any).electronAPI;
  if (!electronAPI?.saveBatchFiles) {
    throw new Error('This application must run in the Electron Desktop Client');
  }

  const CHUNK_SIZE = 25;
  let totalSaved = 0;

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const preparedChunk = await Promise.all(
      chunk.map(async (item) => {
        const buffer = await item.file.arrayBuffer();
        const finalName = (item.customName || item.cleanedName).trim();
        // Media-First Dual-Root Hierarchy: Master / [Real | AI] / [Photos | Videos | Vectors] / [Batch] / [FinalName]
        const rootFolder = item.assetOrigin === 'ai' ? 'AI' : 'Real';
        const relativePath = `${rootFolder}/${item.subFolder}/${item.batchFolder}/${finalName}`;
        return {
          relativePath,
          buffer,
        };
      })
    );

    const res = await electronAPI.saveBatchFiles(masterDir, preparedChunk);
    if (!res.success) {
      return {
        success: false,
        savedCount: totalSaved,
        error: res.error || 'Failed to save batch chunk',
      };
    }

    totalSaved += res.savedCount;
    onProgress?.(totalSaved, items.length, chunk[chunk.length - 1].cleanedName);
  }

  return {
    success: true,
    savedCount: totalSaved,
  };
}

// Backward compatibility helpers
export function cleanRawFilename(rawName: string): string {
  const extMatch = rawName.match(/\.([a-zA-Z0-9]+)$/);
  return extMatch ? rawName.slice(0, extMatch.index) : rawName;
}

export function autoDetectLastNumber(filenames: string[]): number {
  let highest = 0;
  for (const name of filenames) {
    const match = name.match(/(?:^B\d+[-_](\d+)|[-_](\d+)\.[^.]+$|^(\d+)[-_])/i);
    if (match) {
      const num = parseInt(match[1] || match[2] || match[3], 10);
      if (!isNaN(num) && num > highest) highest = num;
    }
  }
  return highest > 0 ? highest + 1 : 1;
}

export function processFilesForRenaming(
  files: File[],
  options: any = DEFAULT_CLEANER_OPTIONS
): CleanedFileItem[] {
  return processFilesForBatchIngest(files, options);
}

export async function saveRenamedFilesToDirectory(
  items: CleanedFileItem[],
  _folderName = '_Cleaned_Ready',
  _onProgress?: (done: number, total: number) => void
): Promise<{ success: boolean; savedCount: number; error?: string; canceled?: boolean }> {
  return {
    success: true,
    savedCount: items.length,
  };
}
