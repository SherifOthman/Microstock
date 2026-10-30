import JSZip from 'jszip';
import fileSaver from 'file-saver';
const saveAs = (fileSaver as any).saveAs || fileSaver;

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
}

export interface CleanerOptions {
  mode: 'sequential' | 'clean_only';
  separator: '_' | '-';
  startCounter: number;
  zeroPadDigits: number;
  maxBaseLength: number;
  caseStyle: 'lowercase' | 'TitleCase' | 'preserve';
  folderName: string;
}

export const DEFAULT_CLEANER_OPTIONS: CleanerOptions = {
  mode: 'sequential',
  separator: '_',
  startCounter: 1,
  zeroPadDigits: 3,
  maxBaseLength: 55,
  caseStyle: 'lowercase',
  folderName: '_Cleaned_Ready',
};

const AI_BOILERPLATE_PATTERNS = [
  /^create[_-]?separate[_-]?images[_-]?(featuring|showing)?/i,
  /^a[_-]?series[_-]?of[_-]?(detailed)?[_-]?images[_-]?(featuring|showing)?/i,
  /^default[_-]/i,
  /^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}[_-]?/i, // UUID prefix
  /[_-]?[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$/i, // UUID suffix
  /\b(upscaled?|upscale)\b/gi,
  /\b[248]k\b/gi,
  /\b(1080p|720p|4k|2k|8k|uhd|fhd|hd)\b/gi,
  /\b(raw|final|edit|edited|sample|preview|copy|draft|v\d+)\b/gi,
];

/**
 * Strips camera and AI junk, dates, hashes, and resolution tags from a filename
 */
export function cleanRawFilename(
  rawName: string,
  separator: '_' | '-' = '_',
  caseStyle: 'lowercase' | 'TitleCase' | 'preserve' = 'lowercase',
  maxBaseLength = 55
): string {
  // Extract extension
  const extMatch = rawName.match(/\.([a-zA-Z0-9]+)$/);
  const baseWithoutExt = extMatch ? rawName.slice(0, extMatch.index) : rawName;

  let cleaned = baseWithoutExt;

  // 1. Remove leading sequential numbers e.g. "001_", "02-", "001 "
  cleaned = cleaned.replace(/^\s*\d{1,4}[-_\s]+/i, '');

  // 2. Remove trailing duplicate counters e.g. "_01", "-02", "_1"
  cleaned = cleaned.replace(/[-_\s]+\d{1,4}\s*$/i, '');

  // 3. Replace underscores and hyphens with spaces FIRST so word boundaries match clean words
  cleaned = cleaned.replace(/[-_]+/g, ' ');

  // 4. Remove AI boilerplate words & command phrases
  cleaned = cleaned.replace(/\b(create|separate|images?|featuring|showing|series|default)\b/gi, ' ');
  cleaned = cleaned.replace(/\b(upscaled?|upscale|raw|final|edit|edited|sample|preview|copy|draft|v\d+)\b/gi, ' ');

  // 5. Remove dates and timestamps e.g. 20261015122121, 2026 10 30
  cleaned = cleaned.replace(/\b\d{8,14}\b/g, ' ');
  cleaned = cleaned.replace(/\b\d{4}\s+\d{2}\s+\d{2}(\s+\d{2,6})?\b/g, ' ');

  // 6. Remove resolution tags e.g. 2k, 4k, 8k, 1080p, 720p, uhd, fhd, hd
  cleaned = cleaned.replace(/\b[248]k\b/gi, ' ');
  cleaned = cleaned.replace(/\b(1080p|720p|uhd|fhd|hd)\b/gi, ' ');

  // 7. Remove hex hashes e.g. [a-f0-9]{8,} or UUIDs
  cleaned = cleaned.replace(/\b[a-f0-9]{8,32}\b/gi, ' ');

  // 8. Replace any remaining punctuation with spaces
  cleaned = cleaned.replace(/[!@#$%^&*+=<>?\\/|~`:;"'()[\]{}]+/g, ' ');

  // 9. Clean whitespace and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // If nothing meaningful remains, fallback to clean generic name
  if (!cleaned || cleaned.length < 2) {
    cleaned = 'stock_asset';
  }

  // 10. Word-boundary truncation to maxBaseLength (without cutting words in half)
  if (cleaned.length > maxBaseLength) {
    const truncated = cleaned.slice(0, maxBaseLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 15) {
      cleaned = truncated.slice(0, lastSpace).trim();
    } else {
      cleaned = truncated.trim();
    }
  }

  // 11. Apply casing style
  const words = cleaned.split(/\s+/).filter(Boolean);
  let processedWords: string[] = [];

  if (caseStyle === 'lowercase') {
    processedWords = words.map((w) => w.toLowerCase());
  } else if (caseStyle === 'TitleCase') {
    processedWords = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  } else {
    processedWords = words;
  }

  return processedWords.join(separator);
}

/**
 * Scans a list of existing filenames to find the highest number in leading patterns like "020_..."
 * and returns suggested next number (e.g. 21).
 */
export function autoDetectLastNumber(filenames: string[]): number {
  let highest = 0;

  for (const name of filenames) {
    // Match leading numbers e.g. "001_", "025-", "100 "
    const leadingMatch = name.match(/^(\d{1,5})[-_\s]/);
    if (leadingMatch) {
      const num = parseInt(leadingMatch[1], 10);
      if (!isNaN(num) && num > highest && num < 100000) {
        highest = num;
      }
    }

    // Match trailing numbers before extension e.g. "_020.jpg", "-05.png"
    const trailingMatch = name.match(/[-_](\d{1,5})\.[a-zA-Z0-9]+$/);
    if (trailingMatch) {
      const num = parseInt(trailingMatch[1], 10);
      if (!isNaN(num) && num > highest && num < 100000) {
        highest = num;
      }
    }
  }

  return highest > 0 ? highest + 1 : 1;
}

/**
 * Processes an imported list of files:
 * 1. Chronological sort (oldest to newest by lastModified)
 * 2. Cleans names according to selected mode
 * 3. Handles duplicate clean names gracefully
 */
export function processFilesForRenaming(
  files: File[],
  options: CleanerOptions = DEFAULT_CLEANER_OPTIONS
): CleanedFileItem[] {
  // 1. Sort files chronologically by lastModified ascending
  const sorted = [...files].sort((a, b) => a.lastModified - b.lastModified);

  const duplicateCounter = new Map<string, number>();
  let currentCounter = options.startCounter;

  return sorted.map((file, idx) => {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const cleanBase = cleanRawFilename(
      file.name,
      options.separator,
      options.caseStyle,
      options.maxBaseLength
    );

    let finalName = '';

    if (options.mode === 'sequential') {
      const prefix = String(currentCounter).padStart(options.zeroPadDigits, '0') + options.separator;
      finalName = `${prefix}${cleanBase}.${ext}`;
      currentCounter++;
    } else {
      // Clean only mode: check for duplicates
      const count = duplicateCounter.get(cleanBase) || 0;
      duplicateCounter.set(cleanBase, count + 1);

      if (count === 0) {
        finalName = `${cleanBase}.${ext}`;
      } else {
        const dupSuffix = `${options.separator}${String(count + 1).padStart(2, '0')}`;
        finalName = `${cleanBase}${dupSuffix}.${ext}`;
      }
    }

    return {
      id: `${file.name}-${file.lastModified}-${idx}`,
      file,
      originalName: file.name,
      cleanedName: finalName,
      extension: ext,
      lastModified: file.lastModified,
      size: file.size,
      charCount: finalName.length,
    };
  });
}

/**
 * Saves renamed files directly to a selected directory using the File System Access API
 */
export async function saveRenamedFilesToDirectory(
  items: CleanedFileItem[],
  folderName = '_Cleaned_Ready',
  onProgress?: (done: number, total: number) => void
): Promise<{ success: boolean; savedCount: number; error?: string }> {
  try {
    if (!('showDirectoryPicker' in window)) {
      throw new Error('File System Access API is not supported in this browser. Please use ZIP download.');
    }

    // Prompt user to select parent folder
    const dirHandle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
    });

    // Create or open the output subfolder
    const targetDir = folderName ? await dirHandle.getDirectoryHandle(folderName, { create: true }) : dirHandle;

    let saved = 0;
    for (const item of items) {
      const filename = (item.customName || item.cleanedName).trim();
      const fileHandle = await targetDir.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(item.file);
      await writable.close();

      saved++;
      onProgress?.(saved, items.length);
    }

    return { success: true, savedCount: saved };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, savedCount: 0, error: 'User cancelled folder selection.' };
    }
    return { success: false, savedCount: 0, error: err.message || 'Failed to save files.' };
  }
}

/**
 * Bundles renamed files into a single .ZIP archive for mobile / universal download
 */
export async function downloadRenamedFilesAsZip(
  items: CleanedFileItem[],
  zipFilename = 'Cleaned_Microstock_Files.zip',
  onProgress?: (percent: number) => void
): Promise<void> {
  const zip = new JSZip();

  for (const item of items) {
    const filename = (item.customName || item.cleanedName).trim();
    zip.file(filename, item.file);
  }

  const blob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      onProgress?.(Math.round(metadata.percent));
    }
  );

  saveAs(blob, zipFilename);
}
