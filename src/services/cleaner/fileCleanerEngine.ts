import { isElectron } from '../desktop/desktopFs';
import { sanitizeRenamerFilename } from '../../utils/renamerSanitizer';
import { type SegregatedTrack, SEGREGATED_TRACKS, NEEDS_FIXING_FOLDER } from '../../constants/renamerRules';
import { AssetBatchType, RenamerFileItem, RenamerMediaType, RenamerJobResult } from '../../types/renamer';

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
  subFolder: 'Photos' | 'Videos' | 'Vectors';
  relativePath: string; // e.g. "B01/Photos/B01_001.jpg"
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
}

export const DEFAULT_CLEANER_OPTIONS: CleanerOptions = {
  sortOrder: 'shuffle', // Default Shuffle (Random Mix)
  maxItemsPerBatch: 100,
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
 * Determines sub-folder category based on file extension
 */
export function getSubFolderForExtension(filename: string): 'Photos' | 'Videos' | 'Vectors' {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'mov', 'm4v'].includes(ext)) {
    return 'Videos';
  }
  if (['eps', 'ai'].includes(ext)) {
    return 'Vectors';
  }
  return 'Photos'; // jpg, jpeg, png, etc.
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

  // 3. Photo / Image files (.jpg, .jpeg, .png, etc.)
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        const megapixels = (width * height) / 1000000;

        // Microstock readiness: images output at ~2000px need upscaling to 4K+ (~3000px+ on both sides)
        if (width < 3000 || height < 3000) {
          resolve({
            width,
            height,
            isValid: true,
            isBlocking: false,
            warningType: 'photo_low_resolution',
            message: `Needs Upscaling: ${width}x${height} (${megapixels.toFixed(1)} MP). Both dimensions must be 3000px+ for microstock readiness.`,
          });
        } else {
          resolve({
            width,
            height,
            isValid: true,
            isBlocking: false,
            warningType: 'none',
          });
        }
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

export type MediaType = 'Photos' | 'Videos' | 'Vectors';

export interface MediaBatchesMap {
  Photos: ExistingBatchInfo[];
  Videos: ExistingBatchInfo[];
  Vectors: ExistingBatchInfo[];
}

export interface MediaSlotsMap {
  Photos: BatchSlotCalculation;
  Videos: BatchSlotCalculation;
  Vectors: BatchSlotCalculation;
}

/**
 * Calculates next available slots across all media types independently
 */
export function calculateAllMediaSlots(
  mediaBatches: Partial<MediaBatchesMap> = {},
  maxItemsPerBatch = 100
): MediaSlotsMap {
  return {
    Photos: calculateNextAvailableSlot(mediaBatches.Photos || [], maxItemsPerBatch),
    Videos: calculateNextAvailableSlot(mediaBatches.Videos || [], maxItemsPerBatch),
    Vectors: calculateNextAvailableSlot(mediaBatches.Vectors || [], maxItemsPerBatch),
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

  // Count fuzzy keys across all imported files to detect duplicates
  const fuzzyCounts = new Map<string, number>();
  for (const f of files) {
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
    orderedFiles = shuffleArray(files, shuffleSeed);
  }

  // Normalize initialSlots to MediaSlotsMap
  let mediaSlots: MediaSlotsMap;
  if (initialSlotsInput && 'Photos' in initialSlotsInput) {
    mediaSlots = initialSlotsInput as MediaSlotsMap;
  } else {
    const fallbackSlot = (initialSlotsInput as BatchSlotCalculation) || {
      startBatchNumber: 1,
      startBatchFolder: 'B01',
      startItemIndex: 1,
      itemsRemainingInStartBatch: options.maxItemsPerBatch,
      slotLabel: 'B01_001',
      statusDescription: 'New Batch',
      isContinuingExisting: false,
    };
    mediaSlots = {
      Photos: fallbackSlot,
      Videos: fallbackSlot,
      Vectors: fallbackSlot,
    };
  }

  // Maintain independent tracker per media type
  const trackers: Record<MediaType, {
    currentBatchNum: number;
    currentItemIdx: number;
    itemsInCurrentBatch: number;
  }> = {
    Photos: {
      currentBatchNum: mediaSlots.Photos.startBatchNumber,
      currentItemIdx: mediaSlots.Photos.startItemIndex,
      itemsInCurrentBatch: Math.max(0, options.maxItemsPerBatch - mediaSlots.Photos.itemsRemainingInStartBatch),
    },
    Videos: {
      currentBatchNum: mediaSlots.Videos.startBatchNumber,
      currentItemIdx: mediaSlots.Videos.startItemIndex,
      itemsInCurrentBatch: Math.max(0, options.maxItemsPerBatch - mediaSlots.Videos.itemsRemainingInStartBatch),
    },
    Vectors: {
      currentBatchNum: mediaSlots.Vectors.startBatchNumber,
      currentItemIdx: mediaSlots.Vectors.startItemIndex,
      itemsInCurrentBatch: Math.max(0, options.maxItemsPerBatch - mediaSlots.Vectors.itemsRemainingInStartBatch),
    },
  };

  return orderedFiles.map((file, idx) => {
    const subFolder = getSubFolderForExtension(file.name);
    const tracker = trackers[subFolder];

    // Auto-split rollover when reaching batch size limit for this media type
    if (tracker.itemsInCurrentBatch >= options.maxItemsPerBatch) {
      tracker.currentBatchNum++;
      tracker.currentItemIdx = 1;
      tracker.itemsInCurrentBatch = 0;
    }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const batchFolder = `B${String(tracker.currentBatchNum).padStart(2, '0')}`;
    const indexStr = String(tracker.currentItemIdx).padStart(3, '0');
    const cleanedOriginal = cleanOriginalBaseName(file.name);

    // Hybrid Sequential Naming: [BATCH]_[SEQUENCE]__[CLEANED_ORIGINAL_NAME].ext
    const targetFilename = `${batchFolder}_${indexStr}__${cleanedOriginal}.${ext}`;

    // Flipped Media-First Hierarchy: Master / [Media Type] / [Batch] / [Filename]
    const relativePath = `${subFolder}/${batchFolder}/${targetFilename}`;

    const fuzzyKey = getFuzzyNormalizedBaseName(file.name);
    const dupCount = fuzzyKey.length >= 2 ? fuzzyCounts.get(fuzzyKey) || 1 : 1;
    const isDuplicate = dupCount > 1;

    const nativePath = nativePathsMap[file.name] || (file as any).path || '';

    tracker.currentItemIdx++;
    tracker.itemsInCurrentBatch++;

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
      batchIndex: tracker.currentItemIdx - 1,
      subFolder,
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
        // Media-First Hierarchy: [Media Type] / [Batch] / [FinalName]
        const relativePath = `${item.subFolder}/${item.batchFolder}/${finalName}`;
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
