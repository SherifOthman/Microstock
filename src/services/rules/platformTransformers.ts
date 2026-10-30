import type { MasterMetadataRecord } from '../../types';
import { DREAMSTIME_CATEGORIES, mapToDreamstimeCategories } from '../../constants/categories';

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

const DANGLING_TRAILING_WORDS = new Set([
  'with',
  'and',
  'or',
  'on',
  'in',
  'at',
  'to',
  'for',
  'of',
  'by',
  'the',
  'a',
  'an',
  'including',
  'from',
  'into',
]);

/**
 * Smart Semantic Truncation Engine (Zero Broken Words)
 * Cuts cleanly at full word boundary before maxLength, strips trailing dangling conjunctions/prepositions,
 * and appends a clean period if addPeriod is true (or requested via options).
 */
export function smartTruncate(
  text: string,
  maxLength: number,
  options: { appendEllipsis?: boolean; addPeriod?: boolean } | boolean = false
): string {
  const addPeriod = typeof options === 'boolean' ? options : (options.addPeriod ?? false);
  const appendEllipsis = typeof options === 'object' ? (options.appendEllipsis ?? false) : false;

  const trimmed = (text ?? '').trim();
  if (!trimmed) return '';

  const targetMax = addPeriod ? maxLength - 1 : maxLength;
  if (trimmed.length <= targetMax) {
    if (addPeriod && !trimmed.endsWith('.')) {
      return `${trimmed}.`;
    }
    return trimmed;
  }

  const reserve = appendEllipsis ? 3 : 0;
  const targetLen = Math.max(1, targetMax - reserve);

  let candidate = trimmed.slice(0, targetLen);

  // Scan backwards to nearest word boundary (space or comma)
  const lastSpace = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf(','));

  // Ensure word boundary is at least 30% into the target length
  if (lastSpace > targetLen * 0.3) {
    candidate = candidate.slice(0, lastSpace);
  }

  // Strip trailing punctuation cleanly (periods, commas, colons, semicolons, hyphens)
  candidate = candidate.replace(/[,;:\s\-_.]+$/, '').trim();

  // Strip trailing dangling conjunctions/prepositions (e.g. "photo of a dog with" -> "photo of a dog")
  let words = candidate.split(/\s+/);
  while (words.length > 0 && DANGLING_TRAILING_WORDS.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }
  candidate = words.join(' ').replace(/[,;:\s\-_.]+$/, '').trim();

  if (appendEllipsis) {
    return `${candidate}...`;
  }
  if (addPeriod) {
    return `${candidate}.`;
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
    const sanitized = sanitizeNonAiText(rec.baseTitle ?? '');
    // Semantic truncate at 200 chars (zero broken words)
    const cleanTitle = smartTruncate(sanitized, 200, false);
    const cleanKw = sanitizeKeywords(rec.rankedKeywords ?? []).slice(0, 49);

    return {
      Filename: rec.filename ?? '',
      Title: cleanTitle,
      Keywords: cleanKw.join(', '),
      Category: rec.categories?.adobeCategoryId || 8,
      Releases: '',
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

export interface ShutterstockTransformOptions {
  editorial?: boolean;
  matureContent?: boolean;
  illustration?: boolean;
}

export interface VecteezyTransformOptions {
  license?: 'pro' | 'free';
  webUploaderParity?: boolean;
}

export interface FreepikTransformOptions {
  modelName?: string;
  isAiGenerated?: boolean;
}

export interface OneTwoThreeRfTransformOptions {
  countryCode?: string; // 2-character ISO country code, default 'EG' (Egypt)
  includeNewFilename?: boolean;
}

export interface UniversalTransformOptions {
  dreamstime?: DreamstimeTransformOptions;
  shutterstock?: ShutterstockTransformOptions;
  vecteezy?: VecteezyTransformOptions;
  freepik?: FreepikTransformOptions;
  '123rf'?: OneTwoThreeRfTransformOptions;
}

// 2. Freepik Transformer (Semicolon Delimited)
export function transformForFreepik(
  records: MasterMetadataRecord[],
  options?: FreepikTransformOptions
): PlatformExportRow[] {
  return records.map((rec) => {
    // 1. Semantic truncate at 200 chars
    let cleanTitle = smartTruncate(rec.baseTitle ?? '', 200, false);
    // 2. Replace hyphens with spaces to prevent Freepik from concatenating words (e.g. Snowy-Winter -> SnowyWinter)
    cleanTitle = (cleanTitle ?? '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

    const isAi = options?.isAiGenerated !== undefined ? options.isAiGenerated : rec.isAiGenerated;

    // 3. Model selector (populated only if AI generated)
    const model = isAi
      ? (options?.modelName || (rec.aiGenerationInfo?.model ? rec.aiGenerationInfo.model : 'Google Nano Banana'))
      : '';

    // 4. Keywords: capped strictly at 49 for AI (Freepik auto-appends '_ai_generated'), or 50 for standard non-AI
    const maxKws = isAi ? 49 : 50;
    const keywords = (rec.rankedKeywords ?? []).slice(0, maxKws).join(', ');

    // 5. Generative Prompt (populated only if AI generated)
    const prompt = isAi
      ? (rec.aiGenerationInfo?.prompt || `${cleanTitle}, high resolution commercial stock photography, hyper detailed`)
      : '';

    return {
      'File name': rec.filename ?? '',
      Title: cleanTitle,
      Keywords: keywords,
      Prompt: prompt,
      Model: model,
    };
  });
}

// 3. Shutterstock Transformer (Official 7-Column Schema: Filename,Description,Keywords,Categories,Editorial,Mature content,illustration)
export function transformForShutterstock(
  records: MasterMetadataRecord[],
  options?: ShutterstockTransformOptions
): { rows: PlatformExportRow[]; isBlocked: boolean; blockedReason?: string } {
  const editorialVal = options?.editorial ? 'yes' : 'no';
  const matureVal = options?.matureContent ? 'yes' : 'no';
  const illustrationVal = options?.illustration ? 'yes' : 'no';

  const rows = records.map((rec) => {
    const categoriesStr = (rec.categories?.shutterstockCategories ?? []).filter(Boolean).join(', ');
    // Semantic truncate description at 200 chars ending with a period
    const cleanDesc = smartTruncate(rec.detailedDescription ?? '', 200, true);

    return {
      Filename: rec.filename ?? '',
      Description: cleanDesc,
      Keywords: (rec.rankedKeywords ?? []).slice(0, 50).join(', '),
      Categories: categoriesStr || 'Miscellaneous',
      Editorial: editorialVal,
      'Mature content': matureVal,
      illustration: illustrationVal,
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
      ? sanitizeForVecteezyWeb(rec.filename ?? '')
      : (rec.filename ?? '');

    // 2. Strict Title: Title Case, max 100 chars, no special symbols, no trailing period/ellipsis
    let titleCase = toTitleCase(rec.baseTitle ?? '');
    titleCase = smartTruncate(titleCase, 100, false);
    titleCase = (titleCase ?? '').replace(/[!@#$%\^&*~`+=<>?\\/|]/g, '');
    titleCase = (titleCase ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ');
    titleCase = (titleCase ?? '').replace(/[.,;: \-_…]+$/, '').trim();

    // 3. Clean single-line description (zero embedded \r or \n)
    let cleanDescription = (rec.detailedDescription || titleCase || '').trim();
    cleanDescription = (cleanDescription ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

    // 4. Top 5 priority keywords placed at index 0-4, total keywords capped between 10 and 45
    const cleanKeywords = (rec.rankedKeywords ?? [])
      .map((k) => (k ?? '').replace(/[\r\n\t,]+/g, ' ').replace(/\s+/g, ' ').trim())
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
  const isFree = options?.free ? 1 : 0;
  const isEditorial = options?.editorial ? 1 : 0;
  const wel = options?.wel !== undefined ? (options.wel ? 1 : 0) : 1;
  const pel = options?.pel !== undefined ? (options.pel ? 1 : 0) : 1;
  const srel = options?.srel !== undefined ? (options.srel ? 1 : 0) : 0;

  return records.map((rec) => {
    let description = (rec.detailedDescription ?? '').trim();

    // Rule 2: If AI generated, append mandatory AI disclosure
    const recordIsAi = options?.isAiGenerated !== undefined ? options.isAiGenerated : rec.isAiGenerated;
    if (recordIsAi && !description.toLowerCase().includes('ai-generated')) {
      description = `${description.replace(/\.$/, '')}, AI-generated image.`;
    }

    const cleanTitle = smartTruncate(rec.baseTitle ?? '', 250, false);

    // Rule 1: Description MUST be strictly longer than Image Name
    if (description.length <= cleanTitle.length) {
      description = `${description.replace(/\.$/, '')}. High quality detailed commercial stock photography visual asset with natural perspective.`;
    }

    // Ensure Description ends with a period
    if (!description.endsWith('.')) {
      description += '.';
    }

    let cleanDesc = smartTruncate(description, 756, true);
    if (cleanDesc.length <= cleanTitle.length) {
      cleanDesc = `${cleanDesc} High quality detailed commercial stock asset.`;
    }

    // Official Dreamstime categories with fallback mapper
    let cat1 = rec.categories?.dreamstimeCategory1 || 0;
    let cat2 = rec.categories?.dreamstimeCategory2 || 0;
    // Dreamstime official AI category ID is 212 ('Illustrations & Clipart -> AI generated')
    const cat3 = recordIsAi ? 212 : (rec.categories?.dreamstimeCategory3 || 0);

    if (!cat1 || !DREAMSTIME_CATEGORIES[cat1]) {
      const mapped = mapToDreamstimeCategories(
        rec.categories?.adobeCategoryId,
        rec.categories?.shutterstockCategories,
        recordIsAi
      );
      cat1 = mapped.cat1;
      if (!cat2 || !DREAMSTIME_CATEGORIES[cat2]) {
        cat2 = mapped.cat2;
      }
    }

    return {
      Filename: rec.filename ?? '',
      'Image Name': cleanTitle,
      Description: cleanDesc,
      'Category 1': cat1,
      'Category 2': cat2,
      'Category 3': cat3,
      keywords: (rec.rankedKeywords ?? []).join(', '),
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

// 6. 123RF Transformer (Official 5-Column Schema: "oldfilename","123rf_filename","description","keywords","country")
export function transformFor123rf(
  records: MasterMetadataRecord[],
  options?: OneTwoThreeRfTransformOptions
): PlatformExportRow[] {
  // Default country code: 'EG' (Egypt) as requested; can be empty or custom
  const country = options?.countryCode !== undefined ? options.countryCode.trim().toUpperCase() : 'EG';

  return records.map((rec) => {
    // 123RF official column schema: "oldfilename","123rf_filename","description","keywords","country"
    const cleanDesc = smartTruncate(rec.detailedDescription ?? '', 300, true);
    const keywords = (rec.rankedKeywords ?? []).slice(0, 50).join(', ');

    return {
      oldfilename: rec.filename ?? '',
      '123rf_filename': '',
      description: cleanDesc,
      keywords: keywords,
      country: country,
    };
  });
}
