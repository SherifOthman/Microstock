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

// -------------------------------------------------------------
// Auto-repair de-gluer for glued microstock compound words
// -------------------------------------------------------------
export function deGlueCompoundWord(word: string): string {
  if (!word || typeof word !== 'string') return '';
  const trimmed = word.trim().toLowerCase();
  if (trimmed.includes(' ') || trimmed.length < 6) return trimmed;

  const knownReplacements: Record<string, string> = {
    homegym: 'home gym',
    homeworkout: 'home workout',
    homespace: 'home space',
    homefitness: 'home fitness',
    fitnessequipment: 'fitness equipment',
    fitnessgear: 'fitness gear',
    fitnesstool: 'fitness tool',
    recoverytool: 'recovery tool',
    recoverygear: 'recovery gear',
    stretchingtool: 'stretching tool',
    stretchinggear: 'stretching gear',
    stretchingband: 'stretching band',
    yogamaterial: 'yoga material',
    yogamat: 'yoga mat',
    yogagear: 'yoga gear',
    foamroller: 'foam roller',
    foamroll: 'foam roll',
    resistanceband: 'resistance band',
    resistancebands: 'resistance bands',
    texturedsurface: 'textured surface',
    texturedbackground: 'textured background',
    copyspace: 'copy space',
    blurredbackground: 'blurred background',
    flatlay: 'flat lay',
    highdetail: 'high detail',
    neutralbackground: 'neutral background',
    professionallighting: 'professional lighting',
    workoutroutine: 'workout routine',
    exercisemat: 'exercise mat',
    exerciseroutine: 'exercise routine',
  };

  if (knownReplacements[trimmed]) {
    return knownReplacements[trimmed];
  }

  // Roots: equipment, tool, gear, material, workout, surface, background, band, roller, gym, space, light, texture
  const suffixRegex = /^([a-z]{3,})(equipment|tool|gear|material|workout|surface|background|band|roller|gym|space|light|texture)$/i;
  const suffixMatch = trimmed.match(suffixRegex);
  if (suffixMatch) {
    const prefix = suffixMatch[1];
    const suffix = suffixMatch[2];
    const validSingleWords = new Set([
      'highlight', 'daylight', 'sunlight', 'spotlight', 'floodlight', 'moonlight', 'starlight',
      'backlight', 'candlelight', 'skylight', 'flashlight', 'twilight',
      'subspace', 'aerospace', 'workspace', 'airspace', 'namespace',
      'headband', 'wristband', 'armband', 'broadband', 'waistband', 'rubberband',
      'subsurface', 'backdrop'
    ]);
    if (!validSingleWords.has(trimmed)) {
      return `${prefix} ${suffix}`;
    }
  }

  const prefixRegex = /^(home|fitness|recovery|stretching|exercise)([a-z]{3,})$/i;
  const prefixMatch = trimmed.match(prefixRegex);
  if (prefixMatch) {
    return `${prefixMatch[1]} ${prefixMatch[2]}`;
  }

  return trimmed;
}

export function parseAndNormalizeAiMetadata(
  rawText: string,
  filename: string,
  thumbnailBase64: string,
  batchId: string,
  isAiGenerated: boolean,
  defaultAiModel = 'Midjourney v6',
  keywordPhrasing: KeywordPhrasing = 'mixed'
): MasterMetadataRecord {
  let parsed: RawAiOutput = {};

  try {
    // 1. Clean markdown code fences if present
    let cleaned = (rawText ?? '').trim();
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
    parsed = extractFallbackRegex(rawText ?? '');
  }

  // 2. Normalize Title
  let baseTitle = (parsed.base_title || '').trim();
  if (!baseTitle) {
    baseTitle = (filename ?? '').replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
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
    rawList = parsed.ranked_keywords
      .map((k) => String(k ?? '').trim().toLowerCase())
      .filter(Boolean);
  } else if (typeof parsed.ranked_keywords === 'string') {
    rawList = (parsed.ranked_keywords ?? '')
      .split(',')
      .map((k) => (k ?? '').trim().toLowerCase())
      .filter(Boolean);
  }

  let finalKeywords: string[] = [];

  if (keywordPhrasing === 'single') {
    // SINGLE WORDS ONLY: Split any multi-word phrases, de-glue compounds, strip punctuation, discard stop words
    const singleSet = new Set<string>();
    for (const item of rawList) {
      if (!item) continue;
      const deCamelled = (item ?? '').replace(/([a-z])([A-Z])/g, '$1 $2');
      const tokens = deCamelled
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .map((w) => (w ?? '').trim().toLowerCase())
        .filter(Boolean);

      for (const t of tokens) {
        // De-glue any compound words into separate single tokens
        const deglued = deGlueCompoundWord(t);
        const subTokens = deglued.split(/\s+/).filter((w) => w.length >= 2 && !stopWords.has(w) && !/^\d+$/.test(w));
        for (const sub of subTokens) {
          if (!singleSet.has(sub)) {
            singleSet.add(sub);
            finalKeywords.push(sub);
          }
        }
      }
    }
  } else {
    // SMART MICROSTOCK MIX (1 to 2 Words per Tag - DEFAULT & DOUBLE):
    // Preserves 1 or 2-word phrases intact as single unit tags (e.g. "duffel bag", "water bottle", "wireless earbuds", "copy space", "fitness equipment").
    // DO NOT split tags across whitespace!
    const phraseSet = new Set<string>();
    for (const item of rawList) {
      if (!item) continue;
      // Clean internal punctuation while preserving whitespace between words
      const deCamelled = (item ?? '').replace(/([a-z])([A-Z])/g, '$1 $2');
      const clean = deCamelled
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      if (!clean) continue;

      // De-glue any words inside phrase without breaking the phrase
      const parts = clean.split(' ').map((p) => deGlueCompoundWord(p)).join(' ').split(/\s+/).filter(Boolean);
      if (parts.length === 0) continue;

      if (parts.length <= 2) {
        // 1 or 2 words: KEEP INTACT AS A SINGLE TAG UNIT!
        const tag = parts.join(' ');
        if (tag.length >= 2 && !phraseSet.has(tag) && !/^\d+$/.test(tag)) {
          phraseSet.add(tag);
          finalKeywords.push(tag);
        }
      } else {
        // Only if tag has > 2 words (e.g. 3 or 4 words): chunk into max 2 words per tag
        for (let i = 0; i < parts.length; i += 2) {
          const tag = parts.slice(i, i + 2).join(' ').trim();
          if (tag.length >= 2 && !phraseSet.has(tag) && !/^\d+$/.test(tag)) {
            phraseSet.add(tag);
            finalKeywords.push(tag);
          }
        }
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
      .map((c) => findClosestCategory(String(c ?? '').trim()))
      .filter(Boolean) as string[];
    if (valid.length > 0) {
      shutterCats = [valid[0], valid[1]];
    }
  } else if (typeof parsed.category_shutterstock === 'string') {
    const cat = findClosestCategory((parsed.category_shutterstock ?? '').trim());
    if (cat) shutterCats = [cat];
  }

  // 7. Dreamstime Categories
  const dtCat1 = Number(parsed.dreamstime_category_1) || 115; // default Landscape / generic
  const dtCat2 = Number(parsed.dreamstime_category_2) || 105;
  const dtCat3 = isAiGenerated ? 114 : 100; // 114 is AI-Generated / Illustrations

  return {
    id: crypto.randomUUID(),
    batchId,
    filename: filename ?? '',
    thumbnailBase64: thumbnailBase64 ?? '',
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
  if (!input) return null;
  const normalized = (input ?? '').toLowerCase();
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
  if (!text) return result;

  const titleMatch = text.match(/"base_title"\s*:\s*"([^"]+)"/i);
  if (titleMatch) result.base_title = titleMatch[1];

  const descMatch = text.match(/"detailed_description"\s*:\s*"([^"]+)"/i);
  if (descMatch) result.detailed_description = descMatch[1];

  const kwMatch = text.match(/"ranked_keywords"\s*:\s*\[([^\]]+)\]/i);
  if (kwMatch) {
    result.ranked_keywords = (kwMatch[1] ?? '')
      .split(',')
      .map((k) => (k ?? '').replace(/["']/g, '').trim())
      .filter(Boolean);
  }

  return result;
}
