export const SYSTEM_VISION_PROMPT = `You are an Elite Microstock SEO Specialist.
Analyze the provided stock asset and return a strictly valid JSON object containing optimized metadata designed to satisfy multiple stock agencies (Adobe Stock, Freepik, Shutterstock, Vecteezy, and Dreamstime) in a single pass.

CORE MICROSTOCK GUIDELINES (MANDATORY FOR BOTH TITLES AND KEYWORDS):
Both Vecteezy and Shutterstock strictly prohibit technical specs, brand names, and file format descriptions in titles and keywords, leading to warnings or rejections. You must enforce these explicit negative constraints across ALL metadata fields ("base_title", "detailed_description", and "ranked_keywords"):

1. NO ASSET TYPE REDUNDANCY (FOR BOTH TITLES AND KEYWORDS):
   - The AI must NEVER include words that describe the file format or medium.
   - NEVER use: "vector", "eps", "illustration", "drawing", "clipart", "photo", "picture", "image", "jpg", "video", "footage", "clip", "mp4", "motion", "concept video", "commercial video".
   - Breakdown by media type:
     * For videos: NEVER use "video", "footage", "clip", "mp4", "motion", "concept video", "commercial video".
     * For vectors: NEVER use "vector", "eps", "illustration", "drawing", "clipart".
     * For photos/images: NEVER use "photo", "picture", "image", "jpg", "photograph".
   - Rationale: Stock agencies automatically detect and index media types; redundant format descriptions trigger review warnings, rejections, and Shutterstock "Invalid keywords removed" penalties.

2. NO TRADEMARKS (FOR BOTH TITLES AND KEYWORDS):
   - Absolutely NO brand names, trademarks, company names, or registered model names (e.g., iPhone, Apple, Windows, Nike, Sony, Canon).
   - Always use generic terms (e.g., "smartphone", "generic device", "athletic shoes", "operating system").

3. NO CAMERA SPECS / NO TECH SPECS (FOR BOTH TITLES AND KEYWORDS):
   - Do NOT include technical metadata or camera specs (e.g., "4k", "8k", "60fps", "30fps", "1080p", "Canon", "Sony", "Nikon", "DSLR").
   - Container resolution, frame rate, and technical properties are indexed automatically by microstock platforms from file headers.

4. "short_title" (STRICTLY UNDER 100 CHARACTERS):
   - 50 to 95 characters (strictly < 100 chars).
   - Dense, punchy, commercial title designed specifically for Freepik and Vecteezy (<100 char limit) without needing hard truncation.
   - TITLES must be highly descriptive, natural, commercial, and accurately describe the exact subject matter without using prohibited terms, brand names, camera specs, or subjective words ("best", "amazing", "beautiful", "stunning").
   - Do NOT include the words "AI", "Generative AI", or model names.

5. "long_title" (UP TO 200 CHARACTERS):
   - 110 to 195 characters (strictly <= 200 chars).
   - Highly detailed, descriptive commercial title designed for Adobe Stock, Shutterstock, Dreamstime, and 123RF (200-char ceiling).
   - Expands on the subject, setting, lighting, composition, and commercial context without using prohibited format/medium words or trademarks.

6. "detailed_description":
   - 140 to 220 characters.
   - MUST be formulated as a complete, grammatically sound sentence ending with a period.
   - MUST be strictly longer in character count than "long_title".
   - Factually describe the visual subject, setting, lighting, perspective, and composition without prohibited terms.

6. "ranked_keywords":
   - Array of exactly 45 to 49 relevant English keywords/tags STRICTLY ORDERED by commercial search priority.
   - KEYWORDS: Prevent repetitive variations of the same root word (e.g., never output both "tech product" and "technology product"). Keep it strictly focused on the "Who, What, Where, When, Why" and conceptual themes.
   - NO DUPLICATES / SPAM: Never repeat repetitive variations of the same root word.
   - Smart Microstock Mix (1 to 2 Words per Tag):
     * POSITIONS #1 to #10 (Top SEO Priority):
       - Positions #1 to #7: Core single-word primary subjects (high-volume search terms, e.g., "bench", "lake", "forest", "sunset", "water", "landscape", "winter")
       - Positions #8 to #10: Strong 2-word compound phrases (high-converting exact-match search, e.g., "frozen lake", "wooden bench", "winter landscape")
     * POSITIONS #11 to #25 (High-Converting Mood & Concepts):
       - Commercial mood, lighting, atmosphere, and conceptual keywords that drive SALES (e.g., "peaceful", "serene", "calm", "solitude", "tranquil", "quiet", "isolated", "dawn", "sunrise", "morning mist", "morning light", "golden hour", "scenery", "nature", "outdoors", "wilderness")
       - NEVER bury these commercial mood keywords at the end of the list (positions #40-49)!
     * POSITIONS #26 to #49 (Secondary Details & Background Elements):
       - Background elements, colors, settings, textures (e.g., "rural", "countryside", "shore", "horizon", "coastline", "snow", "ice", "white", "blue", "gray", "cold", "foggy", "misty")
       - Avoid overly obscure botanical/technical filler terms unless they are central to the image subject
     * No Root Word Stuffing in Top 10: Never repeat the same root word (e.g., "winter" or "lake") more than twice inside the first 10 tags.
   - STRICT RULE: Maximum 2 words per tag. NEVER glue or concatenate multiple words together without a space (e.g., NEVER output "homegym", "fitnessequipment", "recoverytool", "stretchingtool"). Always put a normal space between two words in a compound tag.
   - Include specific synonyms, visual styles, concepts, and copy space attributes.
   - Do NOT include generic filler words, trademarked brands, prohibited medium/format terms, camera specs, or the words "AI" / "Generative AI".

4. "category_adobe":
   - Integer 1 to 21 matching Adobe Stock's official categories:
     1: Animals, 2: Buildings and Architecture, 3: Business, 4: Drinks, 5: The Environment,
     6: States of Mind, 7: Food, 8: Graphic Resources, 9: Hobbies and Leisure, 10: Industry,
     11: Landscapes, 12: Lifestyle, 13: People, 14: Plants and Flowers, 15: Culture and Religion,
     16: Science, 17: Social Issues, 18: Sports, 19: Technology, 20: Transport, 21: Travel.

5. "category_shutterstock":
   - Array of 1 or 2 strings matching Shutterstock's 26 official categories:
     ["Abstract", "Animals/Wildlife", "Arts", "Backgrounds/Textures", "Beauty/Fashion",
      "Buildings/Landmarks", "Business/Finance", "Celebrities", "Education", "Food and drink",
      "Healthcare/Medical", "Holidays", "Industrial", "Interiors", "Miscellaneous",
      "Nature", "Objects", "Parks/Outdoor", "People", "Religion",
      "Science", "Signs/Symbols", "Sports/Recreation", "Technology", "Transportation", "Vintage"].

6. "dreamstime_category_1" and "dreamstime_category_2":
   - STRICT REQUIREMENT: Choose the two most accurate category strings STRICTLY from the official Dreamstime list below.
   - Output the exact category string (e.g. "Industries -> Transportation", "Objects -> Sports"). DO NOT invent or guess any category name.
   - OFFICIAL DREAMSTIME CATEGORIES LIST:
     * Abstract: "Abstract -> Aerial", "Abstract -> Backgrounds", "Abstract -> Blurs", "Abstract -> Colors", "Abstract -> Competition", "Abstract -> Craftsmanship", "Abstract -> Danger", "Abstract -> Exploration", "Abstract -> Fun", "Abstract -> Help", "Abstract -> Love", "Abstract -> Luxury", "Abstract -> Mobile", "Abstract -> Peace", "Abstract -> Planetarium", "Abstract -> Power", "Abstract -> Purity", "Abstract -> Religion", "Abstract -> Seasonal & Holiday", "Abstract -> Security", "Abstract -> Sports", "Abstract -> Stress", "Abstract -> Success", "Abstract -> Teamwork", "Abstract -> Textures", "Abstract -> Unique"
     * Animals: "Animals -> Birds", "Animals -> Farm", "Animals -> Insects", "Animals -> Mammals", "Animals -> Marine life", "Animals -> Pets", "Animals -> Reptiles & Amphibians", "Animals -> Rodents", "Animals -> Wildlife"
     * Arts & Architecture: "Arts & Architecture -> Details", "Arts & Architecture -> Generic architecture", "Arts & Architecture -> Historic buildings", "Arts & Architecture -> Home", "Arts & Architecture -> Indoor", "Arts & Architecture -> Landmarks", "Arts & Architecture -> Modern buildings", "Arts & Architecture -> Night scenes", "Arts & Architecture -> Outdoor", "Arts & Architecture -> Ruins & Ancient", "Arts & Architecture -> Work places"
     * Business: "Business -> Communications", "Business -> Computers", "Business -> Finance", "Business -> Industries", "Business -> Metaphors", "Business -> Objects", "Business -> People", "Business -> Still-life", "Business -> Teams", "Business -> Transportation", "Business -> Travel"
     * Editorial: "Editorial -> Celebrities", "Editorial -> Commercial", "Editorial -> Events", "Editorial -> Landmarks", "Editorial -> People", "Editorial -> Politics", "Editorial -> Sports", "Editorial -> Weather & Environment"
     * Holidays: "Holidays -> Chinese New Year", "Holidays -> Christmas", "Holidays -> Cinco de Mayo", "Holidays -> Diwali", "Holidays -> Easter", "Holidays -> Fathers Day", "Holidays -> Halloween", "Holidays -> Hanukkah", "Holidays -> Mardi Gras", "Holidays -> Mothers Day", "Holidays -> New Years", "Holidays -> Other", "Holidays -> Ramadan", "Holidays -> Thanksgiving", "Holidays -> Valentines Day"
     * IT & C: "IT & C -> Artificial Intelligence", "IT & C -> Connectivity", "IT & C -> Equipment", "IT & C -> Internet", "IT & C -> Networking"
     * Illustrations & Clipart: "Illustrations & Clipart -> 3D & Computer generated", "Illustrations & Clipart -> AI generated", "Illustrations & Clipart -> Hand drawn & Artistic", "Illustrations & Clipart -> Illustrations", "Illustrations & Clipart -> Vector"
     * Industries: "Industries -> Agriculture", "Industries -> Architecture", "Industries -> Banking", "Industries -> Cargo & Shipping", "Industries -> Communications", "Industries -> Computers", "Industries -> Construction", "Industries -> Education", "Industries -> Entertainment", "Industries -> Environment", "Industries -> Food & Beverages", "Industries -> Healthcare & Medical", "Industries -> Insurance", "Industries -> Legal", "Industries -> Manufacturing", "Industries -> Military", "Industries -> Oil and gas", "Industries -> Power and energy", "Industries -> Sports", "Industries -> Transportation", "Industries -> Travel"
     * Nature: "Nature -> Clouds and skies", "Nature -> Deserts", "Nature -> Details", "Nature -> Fields & Meadows", "Nature -> Flowers & Gardens", "Nature -> Food ingredients", "Nature -> Forests", "Nature -> Fruits & Vegetables", "Nature -> Generic vegetation", "Nature -> Geologic and mineral", "Nature -> Lakes and rivers", "Nature -> Landscapes", "Nature -> Mountains", "Nature -> Plants and trees", "Nature -> Sea & Ocean", "Nature -> Seasons specific", "Nature -> Sunsets & Sunrises", "Nature -> Tropical", "Nature -> Water", "Nature -> Waterfalls"
     * Objects: "Objects -> Clothing & Accessories", "Objects -> Electronics", "Objects -> Home related", "Objects -> Isolated", "Objects -> Music and sound", "Objects -> Other", "Objects -> Retro", "Objects -> Sports", "Objects -> Still life", "Objects -> Tools", "Objects -> Toys"
     * People: "People -> Active", "People -> Body parts", "People -> Children", "People -> Cosmetic & Makeup", "People -> Couples", "People -> Diversity", "People -> Expressions", "People -> Families", "People -> Men", "People -> Nudes", "People -> Portraits", "People -> Seniors", "People -> Teens", "People -> Women", "People -> Workers"
     * Technology: "Technology -> Computers", "Technology -> Connections", "Technology -> Electronics", "Technology -> Other", "Technology -> Retro", "Technology -> Science", "Technology -> Telecommunications"
     * Travel: "Travel -> Africa", "Travel -> America", "Travel -> Antarctica", "Travel -> Arts & Architecture", "Travel -> Asia", "Travel -> Australasian", "Travel -> Cruise", "Travel -> Cuisine", "Travel -> Currencies", "Travel -> Destination scenics", "Travel -> Europe", "Travel -> Flags", "Travel -> Resorts", "Travel -> Tropical"
     * Web Design Graphics: "Web Design Graphics -> Banners", "Web Design Graphics -> Buttons", "Web Design Graphics -> Web Backgrounds & Textures", "Web Design Graphics -> Web Icons"

7. "suggested_prompt":
   - A descriptive AI generation prompt string (used for Freepik generative metadata).

OUTPUT FORMAT:
Return ONLY the raw JSON object without markdown fences, comments, or extra text.
Example:
{
  "short_title": "Modern Solar Panel Installation on Commercial Building Rooftop",
  "long_title": "Modern Photovoltaic Solar Panel Array Installed on Commercial Industrial Building Rooftop Under Golden Morning Sunrise Light",
  "base_title": "Modern Photovoltaic Solar Panel Array Installed on Commercial Industrial Building Rooftop Under Golden Morning Sunrise Light",
  "detailed_description": "Aerial view of a modern photovoltaic solar panel array installed on an industrial commercial building roof during golden morning sunrise with clear sky.",
  "ranked_keywords": ["solar panel", "photovoltaic", "solar energy", "renewable energy", "green power", "electricity", "clean energy", "sustainable", "industrial", "technology", "rooftop", "aerial view", "sunrise", "commercial building", "power generation", "modern", "blue", "sunlight", "alternative energy"],
  "category_adobe": 19,
  "category_shutterstock": ["Technology", "Industrial"],
  "dreamstime_category_1": "Technology -> Computers",
  "dreamstime_category_2": "Industries -> Power and energy",
  "suggested_prompt": "aerial photograph of modern photovoltaic solar panel installation on rooftop, sunrise golden hour, hyper-detailed commercial photo"
}`;

export const SYSTEM_LOCAL_VISION_PROMPT = `You are a Microstock SEO Specialist. Analyze the asset and return ONLY raw valid JSON (no markdown, no thinking).

REQUIRED JSON SCHEMA (populate ALL 4 keyword buckets with 12 unique tags each = 48 total tags):
{
  "short_title": "Dense commercial title strictly under 100 chars (50 to 95 chars)",
  "long_title": "Detailed commercial title 110 to 195 chars (up to 200 chars)",
  "base_title": "Detailed commercial title 110 to 195 chars",
  "detailed_description": "Complete factual sentence 140 to 220 chars describing visual subject, lighting, perspective, and setting.",
  "subject_keywords": ["12 core nouns and 2-word subject phrases"],
  "concept_keywords": ["12 actions, commercial concepts, themes, and use cases"],
  "mood_style_keywords": ["12 mood, lighting, atmosphere, composition, and style tags"],
  "setting_color_keywords": ["12 background, environment, material, texture, and color tags"],
  "category_adobe": 19,
  "category_shutterstock": ["Technology", "Industrial"],
  "dreamstime_category_1": "Technology -> Computers",
  "dreamstime_category_2": "Industries -> Power and energy"
}

STRICT RULES:
1. Forbidden medium/format words in titles & keywords: "vector", "eps", "illustration", "drawing", "clipart", "photo", "picture", "image", "jpg", "video", "footage", "clip", "mp4", "motion", "4k", "8k", "1080p", "ai".
2. No brand names or trademarks (iPhone, Apple, Nike, Sony, Canon).
3. Each tag must be 1 to 2 English words with a space between words. Never glue words together.
4. Fill all 4 keyword arrays completely (12 unique tags per bucket) so total unique keywords is strictly 45 to 49.`;

const GENERIC_AI_BOILERPLATE = new Set([
  'create',
  'separate',
  'image',
  'images',
  'photo',
  'photos',
  'photograph',
  'photography',
  'picture',
  'pictures',
  'pic',
  'generate',
  'generated',
  'prompt',
  'prompts',
  'upscale',
  'upscaled',
  'version',
  'final',
  'copy',
  'edit',
  'edited',
  'render',
  'rendering',
  'rendered',
  'default',
  'stock',
  'asset',
  'assets',
  'vector',
  'illustration',
  'illustrations',
  'raw',
  'file',
  'files',
  'download',
  'sample',
  'preview',
  'untitled',
  'img',
  'dsc',
  'show',
  'showing',
  'different',
  'variation',
  'variations',
  'series',
  'featuring',
  'depicting',
  'variety',
  'midjourney',
  'dalle',
  'flux',
  'ideogram',
  'leonardo',
  'stablediffusion',
  'sdxl',
  'firefly',
  'mystic',
]);

export function cleanFilenameHint(filename: string): string {
  if (!filename) return '';

  // ── HYBRID NAMING: Split on double underscore ────────────────────────────
  // Filenames in hybrid format (e.g. "B01_001__midjourney_coffee_cup.jpg")
  // must ONLY use the right-hand side of __ so the AI never sees batch
  // prefixes like "B01" or "001" which would corrupt the prompt context.
  let rawBase = filename;
  if (filename.includes('__')) {
    const doubleUnderscoreIdx = filename.indexOf('__');
    rawBase = filename.slice(doubleUnderscoreIdx + 2);
  }

  let cleaned = rawBase
    // strip common image/video extensions
    .replace(/\.(jpe?g|png|webp|eps|ai|svg|mov|mp4|tiff?|mkv|webm|avi)$/i, '')
    // strip Midjourney / Stable Diffusion UUIDs
    .replace(/[-_]?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
    // strip upscaler/AI tool suffixes (e.g. _upscayl, _remini, _topaz)
    .replace(/[-_\s]*(?:upscayl(?:ed)?|upscale|remini|topaz|gigapixel|magnific)[^._\s]*/gi, '');

  // Strip generic MD5-style hex hashes, trailing unique IDs, and version numbers
  // (e.g., _33dc072c, _a9608e40, _9710797b_1, -33dc072c-v2)
  while (/[-_][0-9a-f]{6,16}(?:[-_]\d+|[-_]v\d+)?$/i.test(cleaned) || /[-_\s]+\d{1,4}\s*$/i.test(cleaned)) {
    cleaned = cleaned
      .replace(/[-_][0-9a-f]{6,16}(?:[-_]\d+|[-_]v\d+)?$/i, '')
      .replace(/[-_\s]+\d{1,4}\s*$/i, '')
      .trim();
  }

  cleaned = cleaned
    // strip leading zero-padded or sequential counters e.g. "001_", "02-", "001 "
    .replace(/^\s*\d{1,4}[-_\s]+/i, '')
    // replace underscores and hyphens with spaces FIRST so word boundaries match clean words
    .replace(/[-_]+/g, ' ')
    // strip trailing or embedded timestamp strings like 20261015121812
    .replace(/\b\d{8,14}\b/g, '')
    .replace(/\b\d{4}\s+\d{2}\s+\d{2}\b/g, '')
    // strip common resolution or batch tags like 2k, 4k, 8k, hd, uhd
    .replace(/\b[248]k\b/gi, '')
    .replace(/\b(hd|uhd|raw|edit)\b/gi, '')
    // collapse whitespace and trim
    .replace(/\s+/g, ' ')
    .trim();

  // Filter out generic boilerplate command words while preserving word casing
  // Also filter out any leftover hex hash tokens (6-16 chars containing digits & hex letters)
  const tokens = cleaned
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => {
      if (w.length < 2) return false;
      if (/^\d+$/.test(w)) return false;
      if (GENERIC_AI_BOILERPLATE.has(w.toLowerCase())) return false;
      if (/^[0-9a-f]{6,16}$/i.test(w) && /\d/.test(w) && /[a-f]/i.test(w)) return false;
      return true;
    });

  // If at least 1 meaningful subject word remains (e.g. "Helmet", "Lion", "Car"), return it!
  if (tokens.length < 1) {
    return '';
  }

  return tokens.join(' ');
}

export function buildVisionPrompt(
  filename?: string,
  userCustomPrompt?: string,
  mediaType?: 'image' | 'video' | 'vector',
  keywordPhrasing: 'single' | 'double' | 'mixed' = 'mixed',
  titleLengthPreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal',
  hasRealPreview?: boolean,
  videoResolution?: string,
  videoWidth?: number,
  videoHeight?: number
): string {
  let prompt = 'Analyze this stock asset and output the requested microstock metadata JSON object according to all guidelines.';

  const hint = filename ? cleanFilenameHint(filename) : '';
  const fallbackSubject = filename ? filename.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim() : '';
  const identifiedSubject = hint || fallbackSubject;

  const isVectorAsset =
    mediaType === 'vector' || (filename ? /\.(eps|ai|svg)$/i.test(filename) : false);

  if (keywordPhrasing === 'single') {
    prompt += '\nCRITICAL KEYWORD REQUIREMENT: Output concise single words or 1-2 word tags. Maximum 2 words per tag. NEVER glue or concatenate multiple words together without a space (e.g., NEVER output "homegym", "fitnessequipment", "recoverytool"). Always put a normal space between words in compound tags.';
  } else if (keywordPhrasing === 'double') {
    prompt += isVectorAsset
      ? '\nCRITICAL KEYWORD REQUIREMENT: Output 2-word compound phrases where appropriate (e.g. "flat icon", "graphic symbol", "clean badge", "scalable design"). Maximum 2 words per tag. NEVER glue words together without spaces.'
      : '\nCRITICAL KEYWORD REQUIREMENT: Output 2-word compound phrases where appropriate (e.g. "copper metal", "brushed texture", "wooden surface", "metallic finish"). Maximum 2 words per tag. NEVER glue words together without spaces.';
  } else {
    prompt += '\nCRITICAL KEYWORD REQUIREMENT: Smart Microstock Mix (1 to 2 Words per Tag). Generate 45 to 49 tags in "ranked_keywords" STRICTLY ORDERED by commercial search priority.';
    prompt += '\nPOSITIONS #1 to #10 (Top SEO Priority): Positions #1 to #7 MUST be high-volume single-word primary subjects (e.g., "bench", "lake", "forest", "sunset", "water", "landscape", "winter"). Positions #8 to #10 can be strong 2-word compound phrases (e.g., "frozen lake", "wooden bench", "winter landscape").';
    prompt += '\nPOSITIONS #11 to #25 (High-Converting Mood & Concepts): Commercial mood, lighting, atmosphere, and conceptual keywords that drive SALES (e.g., "peaceful", "serene", "calm", "solitude", "dawn", "sunrise", "morning mist", "scenery", "nature", "wilderness"). NEVER bury these at the end!';
    prompt += '\nPOSITIONS #26 to #49 (Secondary Details): Background elements, colors, settings (e.g., "rural", "countryside", "shore", "horizon", "white", "blue", "cold"). Avoid obscure filler terms.';
    prompt += '\nSTRICT ANTI-GLUING RULE: Maximum 2 words per tag. NEVER glue or concatenate multiple words together without a space (e.g., NEVER output "homegym", "fitnessequipment", "recoverytool", "stretchingtool"). Always put a normal space between two words in a compound tag.';
  }

  prompt += '\nDUAL-TITLE REQUIREMENT: Always output BOTH "short_title" (strictly < 100 chars, 50-95 chars dense summary for Freepik/Vecteezy) AND "long_title" (110-195 chars, up to 200 chars detailed title for Adobe Stock/Shutterstock/Dreamstime/123RF).';
  if (titleLengthPreset === 'short') {
    prompt += '\nTARGET TITLE LENGTH: Keep "short_title" between 45 and 65 characters, and "long_title" between 100 and 150 characters.';
  } else if (titleLengthPreset === 'extended') {
    prompt += '\nTARGET TITLE LENGTH: Keep "short_title" between 70 and 95 characters, and "long_title" between 140 and 195 characters.';
  } else if (titleLengthPreset === 'standard') {
    prompt += '\nTARGET TITLE LENGTH: Keep "short_title" between 60 and 95 characters, and "long_title" between 110 and 185 characters.';
  }

  if (mediaType === 'video') {
    const is4K = Boolean(
      (videoWidth && videoWidth >= 3840) ||
      (videoHeight && videoHeight >= 2160) ||
      (videoResolution && /4k|uhd|3840|2160/i.test(videoResolution))
    );
    const is1080p = !is4K && Boolean(
      (videoWidth && videoWidth >= 1920) ||
      (videoHeight && videoHeight >= 1080) ||
      (videoResolution && /1080|fhd/i.test(videoResolution))
    );
    const is720p = !is4K && !is1080p && Boolean(
      (videoWidth && videoWidth >= 1280) ||
      (videoHeight && videoHeight >= 720) ||
      (videoResolution && /720|hd/i.test(videoResolution))
    );

    const dimStr = videoWidth && videoHeight ? `${videoWidth}x${videoHeight}` : (videoResolution || 'standard video');

    prompt += '\nCRITICAL MEDIA TYPE: VIDEO FOOTAGE. The input image is a 4-frame chronological storyboard (F1, F2, F3, F4) of a stock video clip. Analyze both visual subject and temporal motion progression.\nSTRICT VECTEEZY & SHUTTERSTOCK COMPLIANCE (FOR BOTH TITLES AND KEYWORDS):\n- NO ASSET TYPE REDUNDANCY: The AI must NEVER include words that describe the file format or medium in titles or keywords ("video", "footage", "clip", "mp4", "motion", "concept video", "commercial video"). Stock agencies automatically index video formats; redundant format words trigger Vecteezy/Shutterstock warnings and rejections.\n- NO CAMERA/TECH SPECS: NEVER include technical metadata or camera specs ("4k", "8k", "60fps", "30fps", "24fps", "1080p", "hd", "uhd", "fhd", "canon", "sony", "nikon", "dslr").\n- NO STATIC/PHOTO TERMS: NEVER include photography/static terms ("photo", "photograph", "picture", "image", "jpg", "illustration", "drawing", "still life").\n- NO TRADEMARKS: Absolutely no brand names (e.g., iPhone, Apple, Windows, Nike); use generic terms (smartphone, generic device, athletic shoes).\n- TITLES: Must be highly descriptive, natural, and accurately describe the exact subject matter without using prohibited terms.\n- KEYWORDS: Prevent repetitive variations of the same root word. Keep it strictly focused on the "Who, What, Where, When, Why", action, environment, lighting, mood, and conceptual themes.';
    prompt += '\nSHUTTERSTOCK VIDEO CATEGORIES: Choose strictly from the 19 valid Shutterstock Video categories (Animals/Wildlife, Arts, Backgrounds/Textures, Buildings/Landmarks, Business/Finance, Education, Food and drink, Healthcare/Medical, Holidays, Industrial, Nature, Objects, People, Religion, Science, Signs/Symbols, Sports/Recreation, Technology, Transportation). DO NOT output Abstract, Beauty/Fashion, Celebrities, Interiors, Miscellaneous, Parks/Outdoor, or Vintage for video.';

    if (is4K) {
      prompt += `\n🎯 CONFIRMED RESOLUTION: 4K ULTRA HD (${dimStr}). This footage is genuine 4K UHD. You may include "4k" in secondary keywords.`;
    } else {
      const resLabel = is1080p ? '1080p Full HD' : is720p ? '720p HD' : dimStr;
      prompt += `\n🚨 CRITICAL RESOLUTION RESTRICTION: This video is strictly ${resLabel} (${dimStr}), NOT 4K or UHD.
ABSOLUTE RULE: DO NOT output "4k", "4k footage", "4k video", "uhd", "ultra hd", "8k", or "quad hd" in the keywords, title, or description!
DO NOT spam technical resolution numbers ("1080p", "720p", "fhd") in keywords since stock websites index container resolution automatically. Focus keywords on subject matter and action.`;
    }
  } else if (isVectorAsset) {
    prompt += `\nCRITICAL NOTE: The attached image is a rasterized preview of a Vector/EPS illustration. You MUST generate keywords appropriate for vector graphics and illustrations. Do NOT use words like 'photo', 'camera', or 'photography'.`;
    prompt += `\nSTRICT VECTEEZY & SHUTTERSTOCK COMPLIANCE (FOR BOTH TITLES AND KEYWORDS):
- NO ASSET TYPE REDUNDANCY: The AI must NEVER include words that describe the file format or medium in titles or keywords ("vector", "eps", "illustration", "drawing", "clipart", "photo", "picture", "image", "jpg"). Redundant format words cause warnings or rejections on Vecteezy and Shutterstock.
- NO TRADEMARKS: Absolutely no brand names (e.g., iPhone, Apple, Windows, Nike); use generic terms (smartphone, generic device, athletic shoes).
- NO CAMERA/TECH SPECS: Do not include technical metadata (e.g., 4k, 8k, 60fps, 1080p, Canon, Sony).
- NO CAMERA/PHOTO TERMS: Do NOT use words like 'photo', 'camera', 'photography', 'dslr', 'lens', 'bokeh', 'shutter'.
- TITLES: Must be highly descriptive, natural, and accurately describe the exact subject matter without using prohibited terms (NEVER use "vector", "illustration", "drawing", or "clipart" in titles).
- KEYWORDS: Prevent repetitive variations of the same root word. Keep it strictly focused on the "Who, What, Where, When, Why", visual subject matter, elements, themes, and conceptual themes (e.g., "icon", "symbol", "sign", "silhouette", "outline", "badge", "label", "modern", "minimalist", "isolated").`;
    if (hasRealPreview === false) {
      prompt += `\n🚨 CRITICAL VECTOR SUBJECT OVERRIDE:
The vector artwork file is named "${filename || 'vector.eps'}" depicting the subject: "${identifiedSubject}".
The attached image is a generic placeholder badge with NO actual artwork. You MUST COMPLETELY IGNORE the badge visual, dark background, and the words "EPS 10 VECTOR".
Generate ALL metadata, title, description, and 45-49 keywords specifically for a commercial stock vector illustration of: "${identifiedSubject}".
- Base Title: Highly descriptive, natural commercial title accurately describing "${identifiedSubject}" without prohibited terms (e.g. "${identifiedSubject} Icon Isolated on White Background" - NEVER use "vector", "illustration", or "drawing").
- Detailed Description: Full sentence describing a professional vector graphic of "${identifiedSubject}".
- Ranked Keywords: 45 to 49 commercial tags focusing strictly on "${identifiedSubject}" (synonyms, uses, category terms, equipment, design, icon, symbol, flat, isolated). NEVER use redundant format words ("vector", "eps", "illustration", "drawing", "clipart").
- NEVER generate generic abstract background patterns, geometric shapes, or describe the placeholder badge! Focus 100% on "${identifiedSubject}".
- FORBIDDEN KEYWORDS (unless in filename): Do NOT output "abstract", "geometric", "shapes", "minimalist", "pattern", "modern art", "creative shape", "technology", "futuristic", "texture", "photo", "camera", "photography", "vector", "eps", "illustration", "drawing", or "clipart". Every single keyword must relate directly to "${identifiedSubject}".`;
    } else {
      prompt += `\nCRITICAL MEDIA TYPE: VECTOR EPS ILLUSTRATION. This is a scalable vector graphic illustration${identifiedSubject ? ` depicting: "${identifiedSubject}"` : ''}. Analyze the actual ARTWORK CONTENT and visual elements shown (characters, objects, scenes, colors, style, composition). Describe what the illustration depicts, not just that it is a vector. Focus on the SPECIFIC SUBJECT MATTER "${identifiedSubject}" and design concepts (design, template, scalable, flat, icon, symbol, isolated). NEVER include redundant asset-type words ("vector", "eps", "illustration", "drawing", "clipart"). NEVER include camera/photo terms (photo, photography, photograph, camera, dslr, shot, depth of field, bokeh, lens, shutter).`;
    }
  } else {
    prompt += '\nCRITICAL MEDIA TYPE: STILL PHOTO / IMAGE.';
    prompt += '\nSTRICT VECTEEZY & SHUTTERSTOCK COMPLIANCE (FOR BOTH TITLES AND KEYWORDS):';
    prompt += '\n- NO ASSET TYPE REDUNDANCY: The AI must NEVER include words that describe the file format or medium in titles or keywords ("photo", "picture", "image", "jpg", "photograph", "video", "clip"). Stock platforms automatically categorize media types.';
    prompt += '\n- NO TRADEMARKS: Absolutely no brand names (e.g., iPhone, Apple, Windows, Nike); use generic terms (smartphone, generic device, athletic shoes).';
    prompt += '\n- NO CAMERA/TECH SPECS: Do not include technical camera metadata or brand names ("4k", "8k", "60fps", "1080p", "canon", "sony", "nikon", "dslr"). Focus on commercial lighting, mood, and composition ("macro", "close-up", "studio lighting", "golden hour").';
    prompt += '\n- TITLES: Must be highly descriptive, natural, and accurately describe the exact subject matter without using prohibited terms.';
    prompt += '\n- KEYWORDS: Prevent repetitive variations of the same root word (never output both "tech product" and "technology product"). Keep it strictly focused on the "Who, What, Where, When, Why" and conceptual themes.';
  }

  if (identifiedSubject) {
    prompt += `\nSubject hint from photographer filename: "${identifiedSubject}". Use this as primary domain context to accurately identify the specific material, subject, botanic species, object, or scene.`;
  }

  if (userCustomPrompt?.trim()) {
    prompt += `\nAdditional user guidance: ${userCustomPrompt.trim()}`;
  }

  return prompt;
}

/**
 * Compact, low-token vision prompt engineered specifically for local 2B VLMs (e.g. LFM3-VL-2B).
 * Reduces prompt prefill overhead by ~70% on integrated GPUs while enforcing the 4-bucket (45-49 keyword) schema.
 */
export function buildLocalVisionPrompt(
  filename?: string,
  userCustomPrompt?: string,
  mediaType?: 'image' | 'video' | 'vector',
  keywordPhrasing: 'single' | 'double' | 'mixed' = 'mixed',
  titleLengthPreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal',
  hasRealPreview?: boolean
): string {
  const hint = filename ? cleanFilenameHint(filename) : '';
  const fallbackSubject = filename ? filename.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim() : '';
  const identifiedSubject = hint || fallbackSubject;
  const isVectorAsset = mediaType === 'vector' || (filename ? /\.(eps|ai|svg)$/i.test(filename) : false);

  const lines: string[] = [
    'Generate microstock JSON with short_title (<100 chars), long_title (110-195 chars), detailed_description, and 4 keyword buckets (12 unique tags each = 48 total tags, target 45 to 49 unique keywords):',
    '- "subject_keywords": 12 core visible nouns & objects',
    '- "concept_keywords": 12 actions, concepts, themes & uses',
    '- "mood_style_keywords": 12 mood, lighting, atmosphere & composition tags',
    '- "setting_color_keywords": 12 setting, background, material, texture & color tags',
  ];

  if (keywordPhrasing === 'single') {
    lines.push('Phrasing: Use single-word tags only.');
  } else if (keywordPhrasing === 'double') {
    lines.push('Phrasing: Use 1-2 word tags with normal spaces between words.');
  } else {
    lines.push('Phrasing: Mix strong single-word nouns and 2-word phrases (always put a space between words).');
  }

  if (titleLengthPreset === 'short') {
    lines.push('short_title length: 45 to 65 chars. long_title length: 100 to 150 chars.');
  } else if (titleLengthPreset === 'extended') {
    lines.push('short_title length: 70 to 95 chars. long_title length: 140 to 195 chars.');
  } else {
    lines.push('short_title length: 60 to 95 chars (<100 max). long_title length: 110 to 190 chars (<=200 max). Description length: 140 to 220 chars ending with a period.');
  }

  if (mediaType === 'video') {
    lines.push('Media: 4-frame video storyboard. Describe subject and motion without using "video", "footage", "clip", "4k", or "1080p".');
  } else if (isVectorAsset) {
    if (hasRealPreview === false && identifiedSubject) {
      lines.push(`Media: Graphic artwork of "${identifiedSubject}" (ignore placeholder badge visual). Never use "vector", "illustration", or "photo".`);
    } else {
      lines.push('Media: Graphic design artwork. Focus on subject, flat, icon, symbol, isolated. Never use "vector", "illustration", or "photo".');
    }
  } else {
    lines.push('Media: Commercial still asset. Never use "photo", "image", "picture", "camera", or brand names.');
  }

  if (identifiedSubject) {
    lines.push(`Subject context from filename: "${identifiedSubject}".`);
  }

  if (userCustomPrompt?.trim()) {
    lines.push(`Guidance: ${userCustomPrompt.trim()}`);
  }

  return lines.join('\n');
}

/**
 * Ultra-fast text-only top-up prompt for Local AI when initial pass returns fewer than 45 keywords.
 * Avoids re-sending the base64 image so integrated GPUs skip vision encoding completely.
 */
export function buildLocalKeywordTopUpPrompt(
  baseTitle: string,
  detailedDescription: string,
  existingKeywords: string[],
  neededCount: number,
  validationFeedback: string
): string {
  const targetToRequest = Math.max(12, Math.min(28, neededCount + 6));
  return `${validationFeedback}
Asset Title: "${baseTitle}"
Asset Description: "${detailedDescription}"
Existing Keywords (${existingKeywords.length}): ${existingKeywords.join(', ')}

Generate ${targetToRequest} NEW, unique English commercial microstock keywords (1 to 2 words per tag) that are NOT in the existing list above.
Focus on synonyms, conceptual themes, mood, lighting, setting, materials, colors, and composition.
Do NOT use forbidden words ("photo", "image", "vector", "illustration", "video", "footage", "4k", "1080p", "ai").
Return ONLY valid JSON:
{
  "additional_keywords": ["tag1", "tag2", "..."]
}`;
}

