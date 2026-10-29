import Papa from 'papaparse';
import type { MasterMetadataRecord } from '../../types';
import { smartTruncate, toTitleCase } from './platformTransformers';

export type MatchMethod = 'exact' | 'normalized' | 'token_overlap' | 'prefix' | 'fuzzy';

export interface VecteezyHydrationResult {
  csvString: string;
  totalRows: number;
  matchedCount: number;
  unmatchedCount: number;
  matches: Array<{
    vecteezyId: string;
    vecteezyFilename: string;
    matchedLocalFilename?: string;
    status: 'matched' | 'unmatched';
    matchMethod?: MatchMethod;
    confidenceScore?: number;
  }>;
}

/**
 * Normalizes a filename for fuzzy matching:
 * - Decomposes and strips unicode accents/diacritics (ç -> c, é -> e, ñ -> n)
 * - Removes common image/video extensions
 * - Removes underscores, spaces, hyphens, dots, ellipses
 * - Converts to lowercase
 */
export function normalizeFilename(name: string): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.(jpe?g|png|webp|eps|ai|svg|mov|mp4|tiff?)$/i, '')
    .replace(/[_\s\-\.…]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Strips timestamps (e.g. 20261015121812), resolution markers (2k, 4k, 8k),
 * and trailing noise from a normalized string to prevent false-positive matches
 * caused by identical timestamp suffixes.
 */
export function stripSemanticNoise(name: string): string {
  return normalizeFilename(name)
    .replace(/\d{6,}/g, '')
    .replace(/[248]k/gi, '')
    .trim();
}

/**
 * Extracts significant words from a filename for token-based matching
 */
export function extractWords(name: string): string[] {
  if (!name) return [];
  const clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.(jpe?g|png|webp|eps|ai|svg|mov|mp4|tiff?)$/i, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase();

  return clean
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => {
      // Filter out empty, timestamps, resolution tags, and tiny stop words
      if (w.length < 2) return false;
      if (/^\d{6,}$/.test(w)) return false; // timestamp
      if (/^[248]k$/i.test(w)) return false; // 2k, 4k
      if (['img', 'dsc', 'photo', 'video', 'raw', 'the', 'and', 'for'].includes(w)) return false;
      return true;
    });
}

/**
 * Calculates token overlap coefficient between two word sets
 */
function calculateTokenOverlap(wordsA: string[], wordsB: string[]): number {
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const setB = new Set(wordsB);
  const intersection = wordsA.filter((w) => setB.has(w)).length;
  // Overlap coefficient relative to the smaller set
  return intersection / Math.min(wordsA.length, wordsB.length);
}

/**
 * Calculates Levenshtein similarity between two strings (0.0 to 1.0)
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;

  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  return 1 - distance / Math.max(len1, len2);
}

/**
 * Finds the best matching MasterMetadataRecord for a Vecteezy CSV row
 * considering available (unclaimed) records.
 */
export function findBestRecordMatch(
  vecteezyFilename: string,
  records: MasterMetadataRecord[],
  claimedIds?: Set<string>
): { record?: MasterMetadataRecord; method?: MatchMethod; score?: number } {
  const availableRecords = claimedIds
    ? records.filter((r) => !claimedIds.has(r.id))
    : records;

  if (availableRecords.length === 0) return {};

  const vNorm = normalizeFilename(vecteezyFilename);
  const vRaw = vecteezyFilename.trim().toLowerCase();
  const vWords = extractWords(vecteezyFilename);

  // 1. Exact match (ignoring case & file extension)
  const exact = availableRecords.find((r) => {
    const rRaw = r.filename.trim().toLowerCase();
    const rBase = rRaw.replace(/\.[^/.]+$/, '');
    const vBase = vRaw.replace(/\.[^/.]+$/, '');
    return rRaw === vRaw || rBase === vBase;
  });
  if (exact) return { record: exact, method: 'exact', score: 1.0 };

  // 2. Normalized match (accents removed, underscores/spaces stripped)
  const normMatch = availableRecords.find((r) => normalizeFilename(r.filename) === vNorm);
  if (normMatch) return { record: normMatch, method: 'normalized', score: 0.95 };

  // 3. Word Token Overlap (Jaccard / Overlap coefficient >= 0.70)
  if (vWords.length >= 2) {
    let bestTokenRecord: MasterMetadataRecord | undefined;
    let bestTokenScore = 0;

    for (const r of availableRecords) {
      const rWords = extractWords(r.filename);
      const overlap = calculateTokenOverlap(vWords, rWords);
      if (overlap > bestTokenScore && overlap >= 0.6) {
        bestTokenScore = overlap;
        bestTokenRecord = r;
      }
    }

    if (bestTokenRecord && bestTokenScore >= 0.6) {
      return { record: bestTokenRecord, method: 'token_overlap', score: bestTokenScore };
    }
  }

  // 4. Prefix match (handles Vecteezy's truncation like "copper_texture_…")
  const prefixPart = vecteezyFilename.split(/[…\.]/)[0];
  const prefixNorm = normalizeFilename(prefixPart);

  if (prefixNorm.length >= 6) {
    const prefixMatch = availableRecords.find((r) => {
      const rNorm = normalizeFilename(r.filename);
      return rNorm.startsWith(prefixNorm) || prefixNorm.startsWith(rNorm);
    });
    if (prefixMatch) return { record: prefixMatch, method: 'prefix', score: 0.85 };
  }

  // 5. Substring containment
  const subMatch = availableRecords.find((r) => {
    const rNorm = normalizeFilename(r.filename);
    return (
      (rNorm.length > 8 && vNorm.includes(rNorm)) || (vNorm.length > 8 && rNorm.includes(vNorm))
    );
  });
  if (subMatch) return { record: subMatch, method: 'prefix', score: 0.8 };

  // 6. Fuzzy Levenshtein match on semantic names (threshold >= 0.78)
  const vSemantic = stripSemanticNoise(vecteezyFilename);
  if (vSemantic.length >= 6) {
    let bestFuzzyRecord: MasterMetadataRecord | undefined;
    let bestFuzzyScore = 0;

    for (const r of availableRecords) {
      const rSemantic = stripSemanticNoise(r.filename);
      const sim = calculateSimilarity(vSemantic, rSemantic);
      if (sim > bestFuzzyScore && sim >= 0.78) {
        bestFuzzyScore = sim;
        bestFuzzyRecord = r;
      }
    }

    if (bestFuzzyRecord) {
      return { record: bestFuzzyRecord, method: 'fuzzy', score: bestFuzzyScore };
    }
  }

  return {};
}

/**
 * Ingests an official CSV exported from Vecteezy's "Add Data" page,
 * preserves Vecteezy's official `Id` and sanitized `Filename`,
 * and populates `Title`, `Description`, `Keywords`, and `License`.
 *
 * Designed to gracefully handle situations where:
 * - Vecteezy has MORE files than local records (e.g. older files already in Vecteezy)
 * - Vecteezy has FEWER files than local records
 * - File order is completely different
 * - Filenames have been mutated (accents stripped, timestamps truncated, underscores converted to spaces)
 */
export function hydrateVecteezyCsv(
  vecteezyCsvContent: string,
  records: MasterMetadataRecord[],
  defaultLicense = 'pro'
): VecteezyHydrationResult {
  // 1. Strictly strip UTF-8 BOM if present at the start of input
  const sanitizedCsv = vecteezyCsvContent.replace(/^\uFEFF/, '').trim();

  const parsed = Papa.parse<Record<string, string>>(sanitizedCsv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ''),
  });

  const rows = parsed.data;
  const matches: VecteezyHydrationResult['matches'] = [];
  let matchedCount = 0;
  const claimedRecordIds = new Set<string>();

  const outputRows = rows.map((row) => {
    // Detect ID column (could be "Id" or "id" or "ID")
    const idKey = Object.keys(row).find((k) => k.toLowerCase() === 'id') || 'Id';
    const filenameKey =
      Object.keys(row).find((k) => k.toLowerCase() === 'filename' || k.toLowerCase() === 'file name') ||
      'Filename';

    const vecteezyId = (row[idKey] || '').trim();
    const vecteezyFilename = (row[filenameKey] || '').trim();

    // Clever multi-stage match with claimed ID tracking to prevent duplicate bindings
    const { record, method, score } = findBestRecordMatch(
      vecteezyFilename,
      records,
      claimedRecordIds
    );

    if (record) {
      claimedRecordIds.add(record.id);
      matchedCount++;
      matches.push({
        vecteezyId,
        vecteezyFilename,
        matchedLocalFilename: record.filename,
        status: 'matched',
        matchMethod: method,
        confidenceScore: score,
      });

      // Strict Vecteezy Title formatting: Title Case, max 100 chars, no special symbols, no trailing period/ellipsis
      let titleCase = toTitleCase(record.baseTitle);
      titleCase = smartTruncate(titleCase, 100, { appendEllipsis: false });
      titleCase = titleCase.replace(/[!@#$%\^&*~`+=<>?\\/|]/g, '');
      titleCase = titleCase.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ');
      titleCase = titleCase.replace(/[.,;: \-_…]+$/, '').trim();

      // Clean single-line description without any internal line breaks
      let cleanDescription = (record.detailedDescription || titleCase).trim();
      cleanDescription = cleanDescription.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

      // Top 5 priority keywords at index 0-4, min 5 tags, max 45 tags, strictly comma-separated
      const cleanKeywords = record.rankedKeywords
        .map((k) => k.replace(/[\r\n\t,]+/g, ' ').replace(/\s+/g, ' ').trim())
        .filter((k) => k.length >= 2 && !/^\d+$/.test(k));
      const keywords = cleanKeywords.slice(0, 45).join(', ');

      const originalHeaders =
        parsed.meta.fields && parsed.meta.fields.length > 0
          ? parsed.meta.fields
          : ['Filename', 'Title', 'Description', 'Keywords', 'License', 'Id'];

      const mappedRow: Record<string, string> = {};
      for (const h of originalHeaders) {
        const lower = h.trim().toLowerCase();
        if (lower === 'id') {
          mappedRow[h] = vecteezyId;
        } else if (lower === 'filename' || lower === 'file name') {
          mappedRow[h] = vecteezyFilename;
        } else if (lower === 'title') {
          mappedRow[h] = titleCase;
        } else if (lower === 'description') {
          mappedRow[h] = cleanDescription;
        } else if (lower === 'keywords') {
          mappedRow[h] = keywords;
        } else if (lower === 'license') {
          mappedRow[h] = defaultLicense || row.License || 'pro';
        } else {
          mappedRow[h] = row[h] || '';
        }
      }
      return mappedRow;
    } else {
      // Row not in local records (e.g. file is from another batch or already on Vecteezy)
      matches.push({
        vecteezyId,
        vecteezyFilename,
        status: 'unmatched',
      });

      const originalHeaders =
        parsed.meta.fields && parsed.meta.fields.length > 0
          ? parsed.meta.fields
          : ['Filename', 'Title', 'Description', 'Keywords', 'License', 'Id'];

      const mappedRow: Record<string, string> = {};
      for (const h of originalHeaders) {
        const lower = h.trim().toLowerCase();
        if (lower === 'id') {
          mappedRow[h] = vecteezyId;
        } else if (lower === 'filename' || lower === 'file name') {
          mappedRow[h] = vecteezyFilename;
        } else if (lower === 'title') {
          mappedRow[h] = row[h] || '';
        } else if (lower === 'description') {
          mappedRow[h] = row[h] || '';
        } else if (lower === 'keywords') {
          mappedRow[h] = row[h] || '';
        } else if (lower === 'license') {
          // Preserve template value untouched (e.g. "" if empty)
          mappedRow[h] = row[h] !== undefined ? row[h] : '';
        } else {
          mappedRow[h] = row[h] || '';
        }
      }
      return mappedRow;
    }
  });

  // Generate populated RFC 4180 CSV with Unix LF line endings (\n) and NO BOM for strict Vecteezy parser parity
  const cleanCsv = Papa.unparse(outputRows, {
    newline: '\n',
  });

  return {
    csvString: cleanCsv,
    totalRows: rows.length,
    matchedCount,
    unmatchedCount: rows.length - matchedCount,
    matches,
  };
}
