/**
 * Keyword Processing, De-Gluing & Resolution Guardrails
 */

import { MAX_KEYWORDS, FORBIDDEN_RESOLUTION_TAGS } from '../constants/metadataLimits';

export const KNOWN_COMPOUND_REPLACEMENTS: Record<string, string> = {
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
  solarenergy: 'solar energy',
  coffeecup: 'coffee cup',
  woodenbench: 'wooden bench',
  smartwatch: 'smart watch',
};

/**
 * Auto-repair de-gluer for glued microstock compound words
 */
export function deGlueCompoundWord(word: string): string {
  if (!word || typeof word !== 'string') return '';
  const trimmed = word.trim().toLowerCase();
  if (trimmed.includes(' ') || trimmed.length < 6) return trimmed;

  if (KNOWN_COMPOUND_REPLACEMENTS[trimmed]) {
    return KNOWN_COMPOUND_REPLACEMENTS[trimmed];
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

/**
 * Rebalances keyword priority: ensures top 10 contains high-converting single words
 * and promotes title-relevant keywords to the very top.
 */
export function rebalanceTopKeywords(keywords: string[], titleHint?: string): string[] {
  if (!keywords || keywords.length === 0) return [];
  let list = [...keywords];

  // If titleHint is provided, prioritize words appearing in title
  if (titleHint) {
    const titleWords = new Set(
      titleHint
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3)
    );

    const titleMatches: string[] = [];
    const others: string[] = [];

    for (const kw of list) {
      const lower = kw.toLowerCase();
      if (titleWords.has(lower) || Array.from(titleWords).some((tw) => lower.includes(tw))) {
        titleMatches.push(kw);
      } else {
        others.push(kw);
      }
    }
    list = [...titleMatches, ...others];
  }

  if (list.length <= 10) return list;

  const top10 = list.slice(0, 10);
  const rest = list.slice(10);

  const singleWordsTop = top10.filter((k) => !k.includes(' '));
  const phrasesTop = top10.filter((k) => k.includes(' '));

  // If top 10 already has 7+ single words, preserve ranking
  if (singleWordsTop.length >= 7) {
    return list;
  }

  // Promote single words from rest into top 10
  const singleWordsRest: string[] = [];
  const phrasesRest: string[] = [];
  for (const k of rest) {
    if (!k.includes(' ')) {
      singleWordsRest.push(k);
    } else {
      phrasesRest.push(k);
    }
  }

  const neededSingles = Math.min(7 - singleWordsTop.length, singleWordsRest.length);
  const promotedSingles = singleWordsRest.splice(0, neededSingles);

  const keptPhrases = phrasesTop.slice(0, 10 - (singleWordsTop.length + promotedSingles.length));
  const demotedPhrases = phrasesTop.slice(keptPhrases.length);

  const newTop10 = [...singleWordsTop, ...promotedSingles, ...keptPhrases];
  const newRest = [...demotedPhrases, ...singleWordsRest, ...phrasesRest];

  return [...newTop10, ...newRest];
}

/**
 * Strictly filters out false 4K/UHD resolution tags for 1080p/720p videos.
 * For genuine 4K videos, ensures 4K is present and removes 1080p.
 * For still photos, strips all video resolution tags.
 */
export function filterResolutionKeywords(
  keywords: string[],
  widthOrIs4K: number | boolean,
  height?: number,
  mediaType: string = 'video'
): string[] {
  let list = [...keywords];
  const isVideo = mediaType === 'video';

  if (!isVideo) {
    // Photos & vectors should not contain video resolution tags
    const allResRegex = /\b(?:4k|8k|1080p?|720p?|2160p?|uhd|fhd|hd|ultra\s*hd|full\s*hd)\b/i;
    return list.filter((kw) => !allResRegex.test(kw));
  }

  let is4k = false;
  if (typeof widthOrIs4K === 'boolean') {
    is4k = widthOrIs4K;
  } else if (typeof widthOrIs4K === 'number') {
    is4k = widthOrIs4K >= 3840 || (height !== undefined && height >= 2160);
  }

  if (!is4k) {
    // 1080p or smaller: strictly strip 4k, 8k, 2160p, uhd, ultra hd
    const forbidden4kRegex = /\b(?:4k|8k|2160p?|uhd|ultra\s*hd)\b/i;
    list = list.filter((kw) => !forbidden4kRegex.test(kw));
  } else {
    // 4k: strictly strip 1080p, 720p, fhd, full hd
    const forbidden1080Regex = /\b(?:1080p?|720p?|fhd|full\s*hd)\b/i;
    list = list.filter((kw) => !forbidden1080Regex.test(kw));
  }

  return list;
}

/**
 * Enforces keyword limit (default max 49)
 */
export function enforceKeywordLimit(keywords: string[], max: number = MAX_KEYWORDS): string[] {
  return (keywords || []).slice(0, max);
}
