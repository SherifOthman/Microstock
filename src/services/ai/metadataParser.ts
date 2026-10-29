import { MasterMetadataRecord } from '../../types';

export const SHUTTERSTOCK_OFFICIAL_CATEGORIES = [
  'Abstract',
  'Animals/Wildlife',
  'The Arts',
  'Backgrounds/Textures',
  'Beauty/Fashion',
  'Buildings/Landmarks',
  'Business/Finance',
  'Celebrities',
  'Education',
  'Food and Drink',
  'Healthcare/Medical',
  'Holidays',
  'Industrial',
  'Interiors',
  'Miscellaneous',
  'Nature',
  'Objects',
  'Parks/Outdoor',
  'People',
  'Religion',
  'Science',
  'Signs/Symbols',
  'Sports/Recreation',
  'Technology',
  'Transportation',
  'Vintage',
];

export interface RawAiOutput {
  base_title?: string;
  detailed_description?: string;
  ranked_keywords?: string[] | string;
  category_adobe?: number;
  category_shutterstock?: string[] | string;
  dreamstime_category_1?: number;
  dreamstime_category_2?: number;
  suggested_prompt?: string;
}

export type KeywordPhrasing = 'single' | 'double' | 'mixed';

export function parseAndNormalizeAiMetadata(
  rawText: string,
  filename: string,
  thumbnailBase64: string,
  batchId: string,
  isAiGenerated: boolean,
  defaultAiModel = 'Midjourney v6',
  keywordPhrasing: KeywordPhrasing = 'single'
): MasterMetadataRecord {
  let parsed: RawAiOutput = {};

  try {
    // 1. Clean markdown code fences if present
    let cleaned = rawText.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/^```\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');

    // Extract first JSON block if surrounded by stray text
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.warn(`JSON parse failed for "${filename}", attempting regex fallback extraction:`, err);
    parsed = extractFallbackRegex(rawText);
  }

  // 2. Normalize Title
  let baseTitle = (parsed.base_title || '').trim();
  if (!baseTitle) {
    baseTitle = filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    baseTitle = baseTitle.charAt(0).toUpperCase() + baseTitle.slice(1);
  }
  if (baseTitle.length > 200) baseTitle = baseTitle.substring(0, 197) + '...';

  // 3. Normalize Description (Dreamstime Rule: Must be strictly longer than Title & complete sentence)
  let detailedDescription = (parsed.detailed_description || '').trim();
  if (!detailedDescription) {
    detailedDescription = `High quality commercial stock photograph of ${baseTitle.toLowerCase()}.`;
  }
  // Ensure description is strictly longer than baseTitle
  if (detailedDescription.length <= baseTitle.length) {
    detailedDescription = `${detailedDescription} Detailed commercial stock asset with natural lighting and professional composition.`;
  }
  if (!detailedDescription.endsWith('.')) {
    detailedDescription += '.';
  }

  // 4. Normalize Keywords with requested phrasing style (single, double, or mixed)
  const stopWords = new Set([
    'a', 'an', 'the', 'in', 'on', 'of', 'and', 'or', 'for', 'with', 'by', 'to', 'at', 'from',
    'is', 'it', 'as', 'into', 'like', 'than', 'onto'
  ]);

  let rawList: string[] = [];
  if (Array.isArray(parsed.ranked_keywords)) {
    rawList = parsed.ranked_keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean);
  } else if (typeof parsed.ranked_keywords === 'string') {
    rawList = parsed.ranked_keywords
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
  }

  let finalKeywords: string[] = [];

  if (keywordPhrasing === 'single') {
    // SINGLE WORDS ONLY: Split any multi-word phrases, strip punctuation, discard stop words
    // Never merge compound words into single meaningless blobs (e.g. split into separate distinct words)
    const singleSet = new Set<string>();
    for (const item of rawList) {
      // Split camelCase if any (e.g. "fitnessEquipment" -> "fitness equipment")
      const deCamelled = item.replace(/([a-z])([A-Z])/g, '$1 $2');
      const tokens = deCamelled
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length >= 2 && !stopWords.has(w) && !/^\d+$/.test(w));

      for (const t of tokens) {
        if (!singleSet.has(t)) {
          singleSet.add(t);
          finalKeywords.push(t);
        }
      }
    }
  } else if (keywordPhrasing === 'double') {
    // DOUBLE / MULTI-WORD PHRASES
    const phraseSet = new Set<string>();
    for (const item of rawList) {
      const clean = item
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      if (clean && !phraseSet.has(clean) && !/^\d+$/.test(clean)) {
        phraseSet.add(clean);
        finalKeywords.push(clean);
      }
    }
  } else {
    // MIXED: Keep clean natural mix of single and multi-word terms
    const mixedSet = new Set<string>();
    for (const item of rawList) {
      const clean = item
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      if (clean && !mixedSet.has(clean) && !/^\d+$/.test(clean)) {
        mixedSet.add(clean);
        finalKeywords.push(clean);
      }
    }
  }

  const uniqueKeywords = finalKeywords.slice(0, 50);

  // If AI generation failed to produce meaningful metadata, throw to trigger failover retry
  if (!parsed.base_title && uniqueKeywords.length < 5) {
    throw new Error(`AI vision model returned incomplete output for "${filename}" (missing title & keywords). Triggering failover retry.`);
  }

  if (uniqueKeywords.length < 10) {
    throw new Error(`AI generated only ${uniqueKeywords.length} keywords for "${filename}" (minimum 15 required). Triggering failover retry.`);
  }

  // 5. Normalize Adobe Category (1 to 21)
  let adobeCat = Number(parsed.category_adobe);
  if (isNaN(adobeCat) || adobeCat < 1 || adobeCat > 21) {
    adobeCat = 8; // Default: Graphic Resources
  }

  // 6. Normalize Shutterstock Categories (Up to 2 matching official names)
  let shutterCats: [string, string?] = ['Miscellaneous'];
  if (Array.isArray(parsed.category_shutterstock) && parsed.category_shutterstock.length > 0) {
    const valid = parsed.category_shutterstock
      .map((c) => findClosestCategory(String(c).trim()))
      .filter(Boolean) as string[];
    if (valid.length > 0) {
      shutterCats = [valid[0], valid[1]];
    }
  } else if (typeof parsed.category_shutterstock === 'string') {
    const cat = findClosestCategory(parsed.category_shutterstock.trim());
    if (cat) shutterCats = [cat];
  }

  // 7. Dreamstime Categories
  const dtCat1 = Number(parsed.dreamstime_category_1) || 115; // default Landscape / generic
  const dtCat2 = Number(parsed.dreamstime_category_2) || 105;
  const dtCat3 = isAiGenerated ? 114 : 100; // 114 is AI-Generated / Illustrations

  return {
    id: crypto.randomUUID(),
    batchId,
    filename,
    thumbnailBase64,
    isAiGenerated,
    baseTitle,
    detailedDescription,
    rankedKeywords: uniqueKeywords.slice(0, 50),
    categories: {
      adobeCategoryId: adobeCat,
      shutterstockCategories: shutterCats,
      dreamstimeCategory1: dtCat1,
      dreamstimeCategory2: dtCat2,
      dreamstimeCategory3: dtCat3,
    },
    aiGenerationInfo: isAiGenerated
      ? {
          prompt: parsed.suggested_prompt || baseTitle,
          model: defaultAiModel,
        }
      : undefined,
    status: 'completed',
    createdAt: Date.now(),
  };
}

function findClosestCategory(input: string): string | null {
  const normalized = input.toLowerCase();
  for (const official of SHUTTERSTOCK_OFFICIAL_CATEGORIES) {
    if (official.toLowerCase() === normalized) return official;
  }
  for (const official of SHUTTERSTOCK_OFFICIAL_CATEGORIES) {
    if (official.toLowerCase().includes(normalized) || normalized.includes(official.toLowerCase())) {
      return official;
    }
  }
  return null;
}

function extractFallbackRegex(text: string): RawAiOutput {
  const result: RawAiOutput = {};

  const titleMatch = text.match(/"base_title"\s*:\s*"([^"]+)"/i);
  if (titleMatch) result.base_title = titleMatch[1];

  const descMatch = text.match(/"detailed_description"\s*:\s*"([^"]+)"/i);
  if (descMatch) result.detailed_description = descMatch[1];

  const kwMatch = text.match(/"ranked_keywords"\s*:\s*\[([^\]]+)\]/i);
  if (kwMatch) {
    result.ranked_keywords = kwMatch[1]
      .split(',')
      .map((k) => k.replace(/["']/g, '').trim())
      .filter(Boolean);
  }

  return result;
}
