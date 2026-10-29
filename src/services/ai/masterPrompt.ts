export const SYSTEM_VISION_PROMPT = `You are an Elite Microstock SEO Specialist.
Analyze the provided stock image and return a strictly valid JSON object containing optimized metadata designed to satisfy multiple stock agencies (Adobe Stock, Freepik, Shutterstock, Vecteezy, and Dreamstime) in a single pass.

UNIVERSAL SAFE-ZONE GUIDELINES:
1. "base_title":
   - 60 to 95 characters (Universal Safe Zone: fits Vecteezy's 100-char max and Adobe's 200-char max naturally).
   - Concise, factual, commercial, descriptive.
   - Do NOT include subjective words ("best", "amazing", "beautiful", "stunning").
   - Do NOT include the words "AI", "Generative AI", or model names.

2. "detailed_description":
   - 120 to 200 characters (Universal Safe Zone: fits Shutterstock's 200-char ceiling while satisfying Dreamstime).
   - MUST be formulated as a complete, grammatically sound sentence ending with a period.
   - MUST be strictly longer in character count than "base_title".
   - Factually describe the visual subject, setting, lighting, perspective, and composition.

3. "ranked_keywords":
   - Array of exactly 42 to 48 relevant English keywords/tags.
   - Smart Microstock Mix (1 to 2 Words per Tag): Each tag can be either a strong single word (e.g. "foam", "yoga", "minimal", "texture") OR a natural 2-word industry phrase separated by a normal space (e.g. "foam roller", "resistance bands", "home gym", "copy space", "fitness equipment", "blurred background").
   - STRICT RULE: Maximum 2 words per tag. NEVER glue or concatenate multiple words together without a space (e.g., NEVER output "homegym", "fitnessequipment", "recoverytool", "stretchingtool"). Always put a normal space between two words in a compound tag.
   - STRICTLY ORDERED by search relevance: index 0 to 4 MUST be the top 5 most critical search terms describing the primary subject (vital for Vecteezy).
   - Include specific synonyms, visual styles, concepts, and copy space attributes.
   - Do NOT include generic filler words, trademarked brands, or the words "AI" / "Generative AI".

4. "category_adobe":
   - Integer 1 to 21 matching Adobe Stock's official categories:
     1: Animals, 2: Buildings and Architecture, 3: Business, 4: Drinks, 5: The Environment,
     6: States of Mind, 7: Food, 8: Graphic Resources, 9: Hobbies and Leisure, 10: Industry,
     11: Landscapes, 12: Lifestyle, 13: People, 14: Plants and Flowers, 15: Culture and Religion,
     16: Science, 17: Social Issues, 18: Sports, 19: Technology, 20: Transport, 21: Travel.

5. "category_shutterstock":
   - Array of 1 or 2 strings matching Shutterstock's 26 official categories:
     ["Abstract", "Animals/Wildlife", "The Arts", "Backgrounds/Textures", "Beauty/Fashion",
      "Buildings/Landmarks", "Business/Finance", "Celebrities", "Education", "Food and Drink",
      "Healthcare/Medical", "Holidays", "Industrial", "Interiors", "Miscellaneous",
      "Nature", "Objects", "Parks/Outdoor", "People", "Religion",
      "Science", "Signs/Symbols", "Sports/Recreation", "Technology", "Transportation", "Vintage"].

6. "dreamstime_category_1" and "dreamstime_category_2":
   - Numerical category IDs representing visual subjects (e.g. 101 Animals, 102 Architecture, 105 Business, 114 Illustrations, 115 Landscapes, 120 Technology).

7. "suggested_prompt":
   - A descriptive AI generation prompt string (used for Freepik generative metadata).

OUTPUT FORMAT:
Return ONLY the raw JSON object without markdown fences, comments, or extra text.
Example:
{
  "base_title": "Modern Solar Panel Installation on Commercial Building Rooftop",
  "detailed_description": "Aerial view of a photovoltaic solar panel array installed on an industrial building roof during golden morning sunrise.",
  "ranked_keywords": ["solar panel", "photovoltaic", "solar energy", "renewable energy", "green power", "electricity", "clean energy", "sustainable", "industrial", "technology", "rooftop", "aerial view", "sunrise", "commercial building", "power generation", "modern", "blue", "sunlight", "alternative energy"],
  "category_adobe": 19,
  "category_shutterstock": ["Technology", "Industrial"],
  "dreamstime_category_1": 120,
  "dreamstime_category_2": 105,
  "suggested_prompt": "aerial photograph of modern photovoltaic solar panel installation on rooftop, sunrise golden hour, hyper-detailed commercial photo"
}`;

export function cleanFilenameHint(filename: string): string {
  if (!filename) return '';
  return filename
    // strip common image/video extensions
    .replace(/\.(jpe?g|png|webp|eps|ai|svg|mov|mp4|tiff?)$/i, '')
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
}

export function buildVisionPrompt(
  filename?: string,
  userCustomPrompt?: string,
  mediaType?: 'image' | 'video' | 'vector',
  keywordPhrasing: 'single' | 'double' | 'mixed' = 'mixed',
  titleLengthPreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal'
): string {
  let prompt = 'Analyze this stock asset and output the requested microstock metadata JSON object according to all guidelines.';

  if (keywordPhrasing === 'single') {
    prompt += '\nCRITICAL KEYWORD REQUIREMENT: Output concise single words or 1-2 word tags. Maximum 2 words per tag. NEVER glue or concatenate multiple words together without a space (e.g., NEVER output "homegym", "fitnessequipment", "recoverytool"). Always put a normal space between words in compound tags.';
  } else if (keywordPhrasing === 'double') {
    prompt += '\nCRITICAL KEYWORD REQUIREMENT: Output 2-word compound phrases where appropriate (e.g. "copper metal", "brushed texture", "macro photograph", "metallic surface"). Maximum 2 words per tag. NEVER glue words together without spaces.';
  } else {
    prompt += '\nCRITICAL KEYWORD REQUIREMENT: Smart Microstock Mix (1 to 2 Words per Tag). Generate 42 to 48 tags in "ranked_keywords". Each tag can be either a strong single word (e.g. "foam", "yoga", "minimal", "texture") OR a natural 2-word industry phrase separated by a normal space (e.g. "foam roller", "resistance bands", "home gym", "copy space", "fitness equipment", "blurred background"). Maximum 2 words per tag. NEVER glue or concatenate multiple words together without a space (e.g., NEVER output "homegym", "fitnessequipment", "recoverytool", "stretchingtool"). Always put a normal space between two words in a compound tag.';
  }

  if (titleLengthPreset === 'short') {
    prompt += '\nTARGET TITLE LENGTH: Keep "base_title" concise and punchy between 45 and 65 characters (ideal for Adobe Stock and Vecteezy sweet spot).';
  } else if (titleLengthPreset === 'extended') {
    prompt += '\nTARGET TITLE LENGTH: Provide an extended, rich "base_title" between 95 and 140 characters detailing the subject and atmosphere.';
  } else if (titleLengthPreset === 'standard') {
    prompt += '\nTARGET TITLE LENGTH: Keep "base_title" between 65 and 95 characters (Universal Safe Zone).';
  }

  if (mediaType === 'video') {
    prompt += '\nNOTE: This is a representative video snapshot frame from stock footage. Include video-specific search keywords where appropriate (e.g. footage, video clip, motion, slow motion, cinematic).';
  } else if (mediaType === 'vector') {
    prompt += '\nNOTE: This is a vector illustration/graphic resource asset. Include vector-specific terms (e.g. vector illustration, graphic design, scalable, clip art, icon).';
  }

  if (filename) {
    const hint = cleanFilenameHint(filename);
    if (hint && hint.length >= 3 && !/^\d+$/.test(hint)) {
      prompt += `\nSubject hint from photographer filename: "${hint}". Use this as helpful domain context to accurately identify the specific material, subject, botanic species, or scene (do not copy raw numbers, dimensions, or timestamps).`;
    }
  }

  if (userCustomPrompt?.trim()) {
    prompt += `\nAdditional user guidance: ${userCustomPrompt.trim()}`;
  }

  return prompt;
}
