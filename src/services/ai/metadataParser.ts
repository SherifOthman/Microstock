import { MasterMetadataRecord } from '../../types';
import { DREAMSTIME_CATEGORIES, mapToDreamstimeCategories, findDreamstimeCategoryId } from '../../constants/categories';
import { cleanFilenameHint } from './masterPrompt';

export const SHUTTERSTOCK_OFFICIAL_CATEGORIES = [
  'Abstract',
  'Animals/Wildlife',
  'Arts',
  'Backgrounds/Textures',
  'Beauty/Fashion',
  'Buildings/Landmarks',
  'Business/Finance',
  'Celebrities',
  'Education',
  'Food and drink',
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

export const SHUTTERSTOCK_VIDEO_CATEGORIES = new Set([
  'Animals/Wildlife',
  'Arts',
  'Backgrounds/Textures',
  'Buildings/Landmarks',
  'Business/Finance',
  'Education',
  'Food and drink',
  'Healthcare/Medical',
  'Holidays',
  'Industrial',
  'Nature',
  'Objects',
  'People',
  'Religion',
  'Science',
  'Signs/Symbols',
  'Sports/Recreation',
  'Technology',
  'Transportation',
]);

export interface RawAiOutput {
  base_title?: string;
  detailed_description?: string;
  ranked_keywords?: string[] | string;
  subject_keywords?: string[] | string;
  concept_keywords?: string[] | string;
  mood_style_keywords?: string[] | string;
  setting_color_keywords?: string[] | string;
  additional_keywords?: string[] | string;
  category_adobe?: number;
  category_shutterstock?: string[] | string;
  dreamstime_category_1?: string | number;
  dreamstime_category_2?: string | number;
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
  keywordPhrasing: KeywordPhrasing = 'mixed',
  mediaType?: 'image' | 'video' | 'vector',
  videoResolution?: string,
  videoWidth?: number,
  videoHeight?: number
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
  const isVectorMedia =
    mediaType === 'vector' || /\.(eps|ai|svg)$/i.test(filename ?? '');
  let baseTitle = (parsed.base_title || '').trim();
  if (!baseTitle) {
    const hint = cleanFilenameHint(filename ?? '');
    baseTitle = hint || (filename ?? '').replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim();
    baseTitle = baseTitle.charAt(0).toUpperCase() + baseTitle.slice(1);
  }

  // Sanitize any trailing or embedded hex hashes or IDs (e.g. 33dc072c, _a9608e40, _9710797b_1) leaking into title
  baseTitle = baseTitle
    .replace(/\b[0-9a-f]{6,16}(?:[-_]\d+)?\b/gi, (match) => {
      // Only strip if it contains both a digit and a hex letter (true random hash/ID)
      return (/\d/.test(match) && /[a-f]/i.test(match)) ? '' : match;
    })
    .replace(/[-_\s]+[0-9a-f]{6,16}(?:[-_\s]+\d+)?$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (isVectorMedia) {
    baseTitle = baseTitle
      .replace(/\b(?:photograph|photography|photos|photo)\b/gi, 'Graphic')
      .replace(/\b(?:camera\s+shot|camera)\b/gi, 'Graphic')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (baseTitle.length > 200) baseTitle = baseTitle.substring(0, 197) + '...';

  // 3. Normalize Description (Dreamstime Rule: Must be strictly longer than Title & complete sentence)
  let detailedDescription = (parsed.detailed_description || '').trim();
  if (!detailedDescription) {
    detailedDescription = isVectorMedia
      ? `High quality commercial stock vector illustration of ${baseTitle.toLowerCase()}.`
      : `High quality commercial stock photograph of ${baseTitle.toLowerCase()}.`;
  }
  if (isVectorMedia) {
    detailedDescription = detailedDescription
      .replace(/\b(?:stock\s+photograph|stock\s+photo|photograph|photography|photos|photo)\b/gi, 'graphic design')
      .replace(/\b(?:camera\s+shot|camera|dslr|bokeh|depth\s+of\s+field)\b/gi, 'graphic design')
      .replace(/\s+/g, ' ')
      .trim();
  }
  // Ensure description is strictly longer than baseTitle
  if (detailedDescription.length <= baseTitle.length) {
    detailedDescription = isVectorMedia
      ? `${detailedDescription} Scalable commercial vector graphic artwork with clean lines and professional composition.`
      : `${detailedDescription} Detailed commercial stock asset with natural lighting and professional composition.`;
  }
  if (!detailedDescription.endsWith('.')) {
    detailedDescription += '.';
  }

  // 4. Normalize Keywords with requested phrasing style (single, double, or mixed)
  const stopWords = new Set([
    'a', 'an', 'the', 'in', 'on', 'of', 'and', 'or', 'for', 'with', 'by', 'to', 'at', 'from',
    'is', 'it', 'as', 'into', 'like', 'than', 'onto'
  ]);

  const extractFieldArray = (field?: string[] | string): string[] => {
    if (!field) return [];
    if (Array.isArray(field)) {
      return field.map((k) => String(k ?? '').trim().toLowerCase()).filter(Boolean);
    }
    if (typeof field === 'string') {
      return field
        .split(',')
        .map((k) => (k ?? '').trim().toLowerCase())
        .filter(Boolean);
    }
    return [];
  };

  const hasLocalBuckets = Boolean(
    parsed.subject_keywords ||
      parsed.concept_keywords ||
      parsed.mood_style_keywords ||
      parsed.setting_color_keywords ||
      parsed.additional_keywords
  );

  const rawList: string[] = [
    ...extractFieldArray(parsed.ranked_keywords),
    ...extractFieldArray(parsed.subject_keywords),
    ...extractFieldArray(parsed.concept_keywords),
    ...extractFieldArray(parsed.mood_style_keywords),
    ...extractFieldArray(parsed.setting_color_keywords),
    ...extractFieldArray(parsed.additional_keywords),
  ];

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

  // Programmatic Resolution Guardrail for Video Keywords:
  const isVideoMedia = mediaType === 'video' || /\.(mp4|mov|webm|avi|mkv)$/i.test(filename ?? '');
  if (isVideoMedia) {
    const is4K = Boolean(
      (videoWidth && videoWidth >= 3840) ||
      (videoHeight && videoHeight >= 2160) ||
      (videoResolution && /4k|uhd|3840|2160/i.test(videoResolution)) ||
      (!videoWidth && !videoResolution && /4k|uhd|3840|2160/i.test(filename ?? ''))
    );

    if (!is4K) {
      // Strictly purge false 4K / 8K / UHD resolution tags
      const forbiddenRegex = /\b(?:4k|8k|uhd|ultra\s*hd|quad\s*hd|2160p|4320p)\b/i;
      finalKeywords = finalKeywords.filter((kw) => !forbiddenRegex.test(kw));
    } else {
      // For genuine 4K, remove 1080p tags and ensure '4k' is present
      const forbidden1080pRegex = /\b(?:1080p?|fhd|full\s*hd)\b/i;
      finalKeywords = finalKeywords.filter((kw) => !forbidden1080pRegex.test(kw));
      const has4k = finalKeywords.some((kw) => /\b4k\b/i.test(kw));
      if (!has4k && finalKeywords.length > 0) {
        finalKeywords.push('4k');
      }
    }
  } else {
    // Photos & vectors should not contain video resolution tags
    const allResRegex = /\b(?:4k|8k|1080p?|720p?|2160p?|uhd|fhd|hd|ultra\s*hd|full\s*hd)\b/i;
    finalKeywords = finalKeywords.filter((kw) => !allResRegex.test(kw));
  }

  // If AI generation failed to produce meaningful metadata, throw to trigger failover retry
  if (!parsed.base_title && rawList.length < 5) {
    throw new Error(`AI vision model returned incomplete output for "${filename}" (missing title & keywords). Triggering failover retry.`);
  }

  // Programmatic Guardrail for Vector/EPS Assets: Strictly purge photo/camera/photography terms
  if (isVectorMedia) {
    const forbiddenVectorPhotoRegex =
      /\b(?:photo|photos|photograph|photography|camera|dslr|lens|bokeh|shutter|depth\s*of\s*field|macro\s*photo|stock\s*photo)\b/i;
    finalKeywords = finalKeywords.filter((kw) => !forbiddenVectorPhotoRegex.test(kw));
    // Only augment with vector fallback tags if AI already gave real keywords (finalKeywords >= 10)
    if (finalKeywords.length >= 10) {
      const vectorFallbackTags = [
        'graphic',
        'design',
        'artwork',
        'symbol',
        'icon',
        'sign',
        'modern',
        'isolated',
        'flat design',
        'element',
      ];
      for (const vTag of vectorFallbackTags) {
        if (finalKeywords.length >= 45) break;
        if (!finalKeywords.includes(vTag)) {
          finalKeywords.push(vTag);
        }
      }
    }
  }

  // Apply Top 10 Keyword Priority rebalancing (ensuring at least 7 single words, max 2-3 compound phrases in top 10)
  const rebalancedKeywords = keywordPhrasing === 'single'
    ? finalKeywords
    : rebalanceTopKeywords(finalKeywords);

  // Local 4-bucket schema strictly caps at 49 keywords (45 to 49 target range); legacy flat schema caps at 50
  const maxKeywordCap = hasLocalBuckets ? 49 : 50;
  const uniqueKeywords = rebalancedKeywords.slice(0, maxKeywordCap);

  if (uniqueKeywords.length < 10) {
    throw new Error(`AI generated only ${uniqueKeywords.length} keywords for "${filename}" (minimum 10 required). Triggering failover retry.`);
  }

  // 5. Normalize Adobe Category (1 to 21)
  let adobeCat = Number(parsed.category_adobe);
  if (isNaN(adobeCat) || adobeCat < 1 || adobeCat > 21) {
    adobeCat = 8; // Default: Graphic Resources
  }

  // 6. Normalize Shutterstock Categories (Up to 2 matching official names, differentiated for video vs image)
  const isVideo = mediaType === 'video' || /\.(mp4|mov|webm|avi|mkv)$/i.test(filename);
  let shutterCats: [string, string?] = [isVideo ? 'Objects' : 'Miscellaneous'];
  if (Array.isArray(parsed.category_shutterstock) && parsed.category_shutterstock.length > 0) {
    const valid = parsed.category_shutterstock
      .map((c) => findClosestCategory(String(c ?? '').trim(), isVideo))
      .filter(Boolean) as string[];
    if (valid.length > 0) {
      shutterCats = [valid[0], valid[1]];
    }
  } else if (typeof parsed.category_shutterstock === 'string') {
    const cat = findClosestCategory((parsed.category_shutterstock ?? '').trim(), isVideo);
    if (cat) shutterCats = [cat];
  }

  // 7. Dreamstime Categories (Strict validation of string categories with deterministic fallback)
  let dtCat1 = findDreamstimeCategoryId(parsed.dreamstime_category_1);
  let dtCat2 = findDreamstimeCategoryId(parsed.dreamstime_category_2);

  const fallbackDt = mapToDreamstimeCategories(adobeCat, shutterCats, isAiGenerated, baseTitle);

  if (!dtCat1 || dtCat1 === 114) {
    dtCat1 = fallbackDt.cat1;
  }
  if (!dtCat2 || dtCat2 === 114 || dtCat2 === dtCat1) {
    dtCat2 = (fallbackDt.cat2 !== dtCat1) ? fallbackDt.cat2 : (fallbackDt.cat1 !== dtCat1 ? fallbackDt.cat1 : 141);
  }

  // Strict domain sanity: Bicycle / Transportation / Vehicle / Exhaust images must NEVER map to Food & Beverages (28, 63, 127, 137)
  const FOOD_CATEGORY_IDS = new Set([28, 63, 127, 137]);
  const isTransport =
    adobeCat === 20 ||
    /bike|bicycle|cycle|cycling|cyclist|transport|car|vehicle|motorcycle|auto|train|airplane|plane|aviation|exhaust|tailpipe|automotive|engine|supercar/i.test(
      baseTitle + ' ' + filename
    );
  if (isTransport) {
    if (FOOD_CATEGORY_IDS.has(dtCat1)) {
      dtCat1 = 98; // Industries -> Transportation
    }
    if (FOOD_CATEGORY_IDS.has(dtCat2) || dtCat2 === dtCat1) {
      dtCat2 = 156; // Objects -> Sports
    }
  }

  // Strict domain sanity: Deep Space / Asteroid / Planetarium must map to Science or Planetarium
  const isSpace = /space|asteroid|planet|meteor|cosmos|universe|galaxy|astronomy|solar system|orbit/i.test(
    baseTitle + ' ' + filename
  );
  if (isSpace) {
    if (dtCat1 === 105 || FOOD_CATEGORY_IDS.has(dtCat1)) dtCat1 = 165; // Abstract -> Planetarium
    if (dtCat2 === 105 || FOOD_CATEGORY_IDS.has(dtCat2) || dtCat2 === dtCat1) dtCat2 = 209; // Technology -> Science
  }

  // Strict domain sanity: Food/Produce images must NEVER map to People (115/120) or Technology Retro (107)
  const isFoodImage =
    adobeCat === 7 ||
    shutterCats.some((c) => (c ?? '').toLowerCase().includes('food')) ||
    /food|fruit|vegetable|produce|meal|dish|snack|dessert|cooking/i.test(baseTitle);
  if (isFoodImage && (dtCat1 === 107 || dtCat1 === 115 || dtCat1 === 120 || dtCat1 === 75 || dtCat1 === 78)) {
    dtCat1 = fallbackDt.cat1;
    dtCat2 = fallbackDt.cat2;
  }

  const dtCat3 = isAiGenerated ? 212 : 0; // 212 = official Dreamstime "Illustrations & Clipart -> AI generated"

  return {
    id: crypto.randomUUID(),
    batchId,
    filename: filename ?? '',
    thumbnailBase64: thumbnailBase64 ?? '',
    isAiGenerated,
    baseTitle,
    detailedDescription,
    rankedKeywords: uniqueKeywords.slice(0, maxKeywordCap),
    mediaType,
    videoMeta: (videoResolution || videoWidth || videoHeight) ? {
      resolution: videoResolution,
      width: videoWidth,
      height: videoHeight,
    } : undefined,
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

/**
 * Enforces Top 10 Keyword Priority:
 * - Positions #1 to #8 are core single-word visible nouns and primary subjects.
 * - At most 2 to 3 multi-word compound phrases in the Top 10 (interleaved naturally).
 * - No root word stuffing: never repeat the same root word (e.g. 'fruit' or 'food') more than twice in the Top 10.
 * - Positions #11 to #48 naturally house the remaining 10 to 15 two-word phrases and single words.
 */
export function rebalanceTopKeywords(keywords: string[]): string[] {
  if (keywords.length <= 10) return keywords;

  const singleWords: string[] = [];
  const multiWords: string[] = [];

  for (const kw of keywords) {
    if (kw.includes(' ')) {
      multiWords.push(kw);
    } else {
      singleWords.push(kw);
    }
  }

  // If there are less than 4 single words, keep original
  if (singleWords.length < 4) return keywords;

  const getRoot = (word: string): string => {
    const firstWord = word.split(' ')[0].toLowerCase();
    if (firstWord.length > 4 && firstWord.endsWith('ies')) return firstWord.slice(0, -3) + 'y';
    if (firstWord.length > 4 && firstWord.endsWith('es')) return firstWord.slice(0, -2);
    if (firstWord.length > 3 && firstWord.endsWith('s') && !firstWord.endsWith('ss')) return firstWord.slice(0, -1);
    return firstWord;
  };

  const GENERIC_MEDIUM_WORDS = new Set([
    'vector',
    'illustration',
    'illustrations',
    'graphic',
    'graphics',
    'clipart',
    'artwork',
    'scalable',
    'editable',
    'flat design',
    'vector graphic',
    'vector art',
    'vector illustration',
    'eps',
    'svg',
    'isolated',
    'white background',
    // Video medium words (keep out of top 10 keywords)
    'video',
    'videos',
    'clip',
    'clips',
    'video clip',
    'footage',
    'stock footage',
    'stock video',
    'motion',
    '4k',
    '4k video',
    '4k footage',
  ]);

  const topRootCounts = new Map<string, number>();
  const selectedSingle: string[] = [];
  const deferredSingle: string[] = [];

  for (const sw of singleWords) {
    const root = getRoot(sw);
    const count = topRootCounts.get(root) || 0;
    const isGenericMedium = GENERIC_MEDIUM_WORDS.has(sw.toLowerCase());
    if (selectedSingle.length < 8 && count < 2 && !isGenericMedium) {
      selectedSingle.push(sw);
      topRootCounts.set(root, count + 1);
    } else {
      deferredSingle.push(sw);
    }
  }

  const selectedMulti: string[] = [];
  const deferredMulti: string[] = [];

  // Allow at most 2 multi-word phrases inside the top 10 (or 3 if single words < 8)
  const maxMultiInTop10 = Math.max(2, 10 - selectedSingle.length);

  for (const mw of multiWords) {
    const wordsInMw = mw.split(' ');
    const root1 = getRoot(wordsInMw[0]);
    const root2 = wordsInMw[1] ? getRoot(wordsInMw[1]) : '';
    const count1 = topRootCounts.get(root1) || 0;
    const count2 = root2 ? (topRootCounts.get(root2) || 0) : 0;
    const isGenericMedium = GENERIC_MEDIUM_WORDS.has(mw.toLowerCase());

    if (selectedMulti.length < maxMultiInTop10 && count1 < 2 && count2 < 2 && !isGenericMedium) {
      selectedMulti.push(mw);
      topRootCounts.set(root1, count1 + 1);
      if (root2) topRootCounts.set(root2, count2 + 1);
    } else {
      deferredMulti.push(mw);
    }
  }

  // Fill up to 10 if needed
  while (selectedSingle.length + selectedMulti.length < 10 && deferredSingle.length > 0) {
    selectedSingle.push(deferredSingle.shift()!);
  }
  while (selectedSingle.length + selectedMulti.length < 10 && deferredMulti.length > 0) {
    selectedMulti.push(deferredMulti.shift()!);
  }

  // Interleave: Put first 5-6 core single words, then 1 compound phrase, then remaining single words, then remaining compound
  const top10: string[] = [];
  let sIdx = 0;
  let mIdx = 0;

  while (sIdx < Math.min(5, selectedSingle.length)) {
    top10.push(selectedSingle[sIdx++]);
  }
  if (mIdx < selectedMulti.length) {
    top10.push(selectedMulti[mIdx++]);
  }
  while (sIdx < selectedSingle.length) {
    top10.push(selectedSingle[sIdx++]);
  }
  while (mIdx < selectedMulti.length) {
    top10.push(selectedMulti[mIdx++]);
  }

  // Remaining keywords in their original relative discovery order
  const top10Set = new Set(top10);
  const remaining = keywords.filter((k) => !top10Set.has(k));

  return [...top10, ...remaining];
}

export function findClosestCategory(input: string, isVideo = false): string | null {
  if (!input) return null;
  const normalized = (input ?? '').toLowerCase().trim();

  // Alias support
  if (normalized === 'the arts' || normalized === 'arts') {
    return 'Arts';
  }
  if (normalized === 'food and drink' || normalized === 'food & drink') {
    return 'Food and drink';
  }

  let match: string | null = null;
  for (const official of SHUTTERSTOCK_OFFICIAL_CATEGORIES) {
    if (official.toLowerCase() === normalized) {
      match = official;
      break;
    }
  }
  if (!match) {
    for (const official of SHUTTERSTOCK_OFFICIAL_CATEGORIES) {
      if (official.toLowerCase().includes(normalized) || normalized.includes(official.toLowerCase())) {
        match = official;
        break;
      }
    }
  }

  if (match && isVideo && !SHUTTERSTOCK_VIDEO_CATEGORIES.has(match)) {
    // Map image-only category to closest valid video category from Shutterstock
    const lower = match.toLowerCase();
    if (lower === 'abstract') return 'Backgrounds/Textures';
    if (lower === 'beauty/fashion') return 'Objects';
    if (lower === 'interiors') return 'Buildings/Landmarks';
    if (lower === 'parks/outdoor') return 'Nature';
    if (lower === 'vintage') return 'Arts';
    if (lower === 'celebrities') return 'People';
    if (lower === 'miscellaneous') return 'Objects';
    return 'Objects';
  }

  return match;
}

function extractFallbackRegex(text: string): RawAiOutput {
  const result: RawAiOutput = {};
  if (!text) return result;

  const titleMatch = text.match(/"base_title"\s*:\s*"([^"]+)"/i);
  if (titleMatch) result.base_title = titleMatch[1];

  const descMatch = text.match(/"detailed_description"\s*:\s*"([^"]+)"/i);
  if (descMatch) result.detailed_description = descMatch[1];

  const bucketKeys = [
    'ranked_keywords',
    'subject_keywords',
    'concept_keywords',
    'mood_style_keywords',
    'setting_color_keywords',
    'additional_keywords',
  ] as const;

  const collectedFallbackKeywords: string[] = [];
  for (const key of bucketKeys) {
    const regex = new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]+)`, 'i');
    const match = text.match(regex);
    if (match && match[1]) {
      const items = match[1]
        .split(',')
        .map((k) => (k ?? '').replace(/["'\r\n]/g, '').trim())
        .filter(Boolean);
      collectedFallbackKeywords.push(...items);
    }
  }

  if (collectedFallbackKeywords.length > 0) {
    result.ranked_keywords = collectedFallbackKeywords;
  }

  return result;
}

export const MIN_REQUIRED_KEYWORDS = 45;
export const MAX_LOCAL_KEYWORDS = 49;

export interface KeywordValidationResult {
  isValid: boolean;
  count: number;
  retryMessage?: string;
}

/**
 * Validates that the normalized keyword list meets the 45+ microstock tag requirement.
 * Returns the exact system retry prompt message when count < minRequired.
 */
export function validateMinimumKeywords(
  keywords: string[],
  minRequired = MIN_REQUIRED_KEYWORDS
): KeywordValidationResult {
  const count = Array.isArray(keywords) ? keywords.length : 0;
  if (count < minRequired) {
    return {
      isValid: false,
      count,
      retryMessage: `You only provided ${count} keywords. You MUST provide at least ${minRequired} keywords.`,
    };
  }
  return {
    isValid: true,
    count,
  };
}

/**
 * Merges two ranked keyword arrays while preserving priority order and case-insensitive uniqueness.
 */
export function mergeUniqueRankedKeywords(
  existing: string[],
  incoming: string[],
  maxCount = 50
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const kw of [...(existing || []), ...(incoming || [])]) {
    const clean = (kw ?? '').trim().toLowerCase();
    if (!clean || clean.length < 2) continue;
    if (!seen.has(clean)) {
      seen.add(clean);
      merged.push(clean);
      if (merged.length >= maxCount) break;
    }
  }

  return merged;
}

