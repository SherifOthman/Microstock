import type { MasterMetadataRecord } from '../../types/index.ts';

export interface PlatformExportRow {
  [columnName: string]: string | number;
}

export interface PlatformExportResult {
  platformId: 'adobe' | 'freepik' | 'shutterstock' | 'vecteezy' | 'dreamstime' | '123rf';
  platformName: string;
  filename: string;
  csvString: string;
  isBlocked?: boolean;
  blockedReason?: string;
  rowCount: number;
}

const FORBIDDEN_AI_WORDS = [
  'ai',
  'generative ai',
  'generative',
  'artificial intelligence',
  'midjourney',
  'stable diffusion',
  'dall-e',
  'dalle',
  'flux',
  'flux.1',
  'prompt',
  'generated',
];

/**
 * Smart Semantic Truncation Engine (Zero Broken Words)
 * Scans backwards to the nearest full word boundary and strips trailing punctuation cleanly.
 */
export function smartTruncate(
  text: string,
  maxLength: number,
  options: { appendEllipsis?: boolean } = {}
): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;

  const reserve = options.appendEllipsis ? 3 : 0;
  const targetLen = Math.max(1, maxLength - reserve);

  let candidate = trimmed.slice(0, targetLen);

  // Scan backwards to nearest word boundary (space or comma)
  const lastSpace = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf(','));

  // Ensure word boundary is at least 30% into the target length
  if (lastSpace > targetLen * 0.3) {
    candidate = candidate.slice(0, lastSpace);
  }

  // Strip trailing punctuation cleanly (periods, commas, colons, semicolons, hyphens)
  candidate = candidate.replace(/[,;:\s\-_.]+$/, '').trim();

  if (options.appendEllipsis) {
    return `${candidate}...`;
  }
  return candidate;
}

/**
 * Strips AI-related words from title or keywords for strict platforms like Adobe Stock
 */
export function sanitizeNonAiText(text: string): string {
  let cleaned = text;
  for (const word of FORBIDDEN_AI_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '').replace(/\s{2,}/g, ' ').trim();
  }
  return cleaned;
}

export function sanitizeKeywords(keywords: string[]): string[] {
  return keywords.filter((kw) => {
    const lower = kw.toLowerCase().trim();
    return !FORBIDDEN_AI_WORDS.some(
      (forbidden) => lower === forbidden || lower.includes(` ${forbidden} `)
    );
  });
}

/**
 * Converts text to standard Title Case (for Vecteezy)
 */
export function toTitleCase(str: string): string {
  const smallWords = new Set([
    'a',
    'an',
    'and',
    'as',
    'at',
    'but',
    'by',
    'for',
    'in',
    'nor',
    'of',
    'on',
    'or',
    'so',
    'the',
    'to',
    'up',
    'yet',
  ]);
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      if (index === 0 || !smallWords.has(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(' ');
}

// 1. Adobe Stock Transformer
export function transformForAdobeStock(records: MasterMetadataRecord[]): PlatformExportRow[] {
  return records.map((rec) => {
    const sanitized = sanitizeNonAiText(rec.baseTitle);
    // Semantic truncate at 200 chars (zero broken words)
    const cleanTitle = smartTruncate(sanitized, 200, { appendEllipsis: false });
    const cleanKw = sanitizeKeywords(rec.rankedKeywords).slice(0, 49);

    return {
      Filename: rec.filename,
      Title: cleanTitle,
      Keywords: cleanKw.join(', '),
      Category: rec.categories.adobeCategoryId || 8,
    };
  });
}

export interface DreamstimeTransformOptions {
  isAiGenerated?: boolean;
  free?: boolean;
  editorial?: boolean;
  wel?: boolean;
  pel?: boolean;
  srel?: boolean;
}

export interface VecteezyTransformOptions {
  license?: 'pro' | 'free';
  webUploaderParity?: boolean;
}

export interface FreepikTransformOptions {
  modelName?: string;
  isAiGenerated?: boolean;
}

export interface UniversalTransformOptions {
  dreamstime?: DreamstimeTransformOptions;
  vecteezy?: VecteezyTransformOptions;
  freepik?: FreepikTransformOptions;
}

// 2. Freepik Transformer (Semicolon Delimited)
export function transformForFreepik(
  records: MasterMetadataRecord[],
  options?: FreepikTransformOptions
): PlatformExportRow[] {
  return records.map((rec) => {
    // 1. Semantic truncate at 200 chars
    let cleanTitle = smartTruncate(rec.baseTitle, 200, { appendEllipsis: false });
    // 2. Replace hyphens with spaces to prevent Freepik from concatenating words (e.g. Snowy-Winter -> SnowyWinter)
    cleanTitle = cleanTitle.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

    const isAi = options?.isAiGenerated !== undefined ? options.isAiGenerated : rec.isAiGenerated;

    // 3. Model selector (populated only if AI generated)
    const model = isAi
      ? (options?.modelName || (rec.aiGenerationInfo?.model ? rec.aiGenerationInfo.model : 'Google Nano Banana'))
      : '';

    // 4. Keywords: capped strictly at 49 for AI (Freepik auto-appends '_ai_generated'), or 50 for standard non-AI
    const maxKws = isAi ? 49 : 50;
    const keywords = rec.rankedKeywords.slice(0, maxKws).join(', ');

    // 5. Generative Prompt (populated only if AI generated)
    const prompt = isAi
      ? (rec.aiGenerationInfo?.prompt || `${cleanTitle}, high resolution commercial stock photography, hyper detailed`)
      : '';

    return {
      'File name': rec.filename,
      Title: cleanTitle,
      Keywords: keywords,
      Prompt: prompt,
      Model: model,
    };
  });
}

// 3. Shutterstock Transformer (Unlocked for user flexibility)
export function transformForShutterstock(
  records: MasterMetadataRecord[]
): { rows: PlatformExportRow[]; isBlocked: boolean; blockedReason?: string } {
  const rows = records.map((rec) => {
    const categoriesStr = rec.categories.shutterstockCategories.filter(Boolean).join(', ');
    // Semantic truncate description at 200 chars
    const cleanDesc = smartTruncate(rec.detailedDescription, 200, { appendEllipsis: false });

    return {
      Filename: rec.filename,
      Description: cleanDesc,
      Keywords: rec.rankedKeywords.slice(0, 50).join(', '),
      Categories: categoriesStr || 'Miscellaneous',
      Illustration: 'No',
      'Mature Content': 'No',
      Editorial: 'No',
    };
  });

  return { rows, isBlocked: false };
}

/**
 * Sanitizes local filenames to match Vecteezy's web uploader ingestion rules.
 * Vecteezy's Add Data web uploader strips all spaces, hyphens, and underscores
 * from the base filename, keeping the extension.
 */
export function sanitizeForVecteezyWeb(filename: string): string {
  if (!filename) return '';
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) {
    return filename.replace(/[\s\-_]+/g, '');
  }
  const base = filename.slice(0, lastDot);
  const ext = filename.slice(lastDot);
  const cleanBase = base.replace(/[\s\-_]+/g, '');
  return `${cleanBase}${ext.toLowerCase()}`;
}

// 4. Vecteezy Transformer
export function transformForVecteezy(
  records: MasterMetadataRecord[],
  options?: VecteezyTransformOptions
): PlatformExportRow[] {
  const license = options?.license || 'pro';
  const useWebParity = options?.webUploaderParity !== false;

  return records.map((rec) => {
    // 1. Filename: Apply Web Uploader parity (no underscores/spaces) by default
    const exportFilename = useWebParity
      ? sanitizeForVecteezyWeb(rec.filename)
      : rec.filename;

    // 2. Strict Title: Title Case, max 100 chars, no special symbols, no trailing period/ellipsis
    let titleCase = toTitleCase(rec.baseTitle);
    titleCase = smartTruncate(titleCase, 100, { appendEllipsis: false });
    titleCase = titleCase.replace(/[!@#$%\^&*~`+=<>?\\/|]/g, '');
    titleCase = titleCase.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ');
    titleCase = titleCase.replace(/[.,;: \-_…]+$/, '').trim();

    // 3. Clean single-line description (zero embedded \r or \n)
    let cleanDescription = (rec.detailedDescription || titleCase).trim();
    cleanDescription = cleanDescription.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

    // 4. Top 5 priority keywords placed at index 0-4, total keywords capped between 10 and 45
    const cleanKeywords = rec.rankedKeywords
      .map((k) => k.replace(/[\r\n\t,]+/g, ' ').replace(/\s+/g, ' ').trim())
      .filter((k) => k.length >= 2 && !/^\d+$/.test(k));
    const keywords = cleanKeywords.slice(0, 45).join(', ');

    return {
      Filename: exportFilename,
      Title: titleCase,
      Description: cleanDescription,
      Keywords: keywords,
      License: license,
    };
  });
}

// 5. Dreamstime Transformer (15-Column FTP Schema)
export function transformForDreamstime(
  records: MasterMetadataRecord[],
  options?: DreamstimeTransformOptions
): PlatformExportRow[] {
  const isAi = options?.isAiGenerated !== undefined ? options.isAiGenerated : true;
  const isFree = options?.free ? 1 : 0;
  const isEditorial = options?.editorial ? 1 : 0;
  const wel = options?.wel !== undefined ? (options.wel ? 1 : 0) : 1;
  const pel = options?.pel !== undefined ? (options.pel ? 1 : 0) : 1;
  const srel = options?.srel !== undefined ? (options.srel ? 1 : 0) : 0;

  return records.map((rec) => {
    let description = rec.detailedDescription.trim();

    // Rule 2: If AI generated, append mandatory AI disclosure
    const recordIsAi = options?.isAiGenerated !== undefined ? options.isAiGenerated : rec.isAiGenerated;
    if (recordIsAi && !description.toLowerCase().includes('ai-generated')) {
      description = `${description.replace(/\.$/, '')}, AI-generated image.`;
    }

    // Rule 1: Description MUST be strictly longer than Image Name
    if (description.length <= rec.baseTitle.length) {
      description = `${description} Detailed commercial stock visual asset with natural perspective.`;
    }

    // Ensure Description ends with a period
    if (!description.endsWith('.')) {
      description += '.';
    }

    const cleanTitle = smartTruncate(rec.baseTitle, 250, { appendEllipsis: false });
    const cleanDesc = smartTruncate(description, 756, { appendEllipsis: false });

    return {
      Filename: rec.filename,
      'Image Name': cleanTitle,
      Description: cleanDesc,
      'Category 1': rec.categories.dreamstimeCategory1 || 115,
      'Category 2': rec.categories.dreamstimeCategory2 || 105,
      'Category 3': recordIsAi ? 114 : rec.categories.dreamstimeCategory3 || 100, // 114 = AI-generated
      keywords: rec.rankedKeywords.join(', '),
      Free: isFree,
      'W-EL': wel, // Web Extended License
      'P-EL': pel, // Print Extended License
      'SR-EL': srel, // Sell-the-Right: Strictly 0 to prevent copyright buyout!
      'SR-Price': '',
      Editorial: isEditorial,
      'MR doc Ids': '',
      'Pr Docs': '',
    };
  });
}

// 6. 123RF Transformer
export function transformFor123rf(records: MasterMetadataRecord[]): PlatformExportRow[] {
  return records.map((rec) => {
    // 123RF official column schema: "oldfilename","123rf_filename","description","keywords","country"
    const cleanDesc = smartTruncate(rec.detailedDescription, 300, { appendEllipsis: false });
    const keywords = rec.rankedKeywords.slice(0, 50).join(', ');

    return {
      oldfilename: rec.filename,
      '123rf_filename': '',
      description: cleanDesc,
      keywords: keywords,
      country: '',
    };
  });
}
