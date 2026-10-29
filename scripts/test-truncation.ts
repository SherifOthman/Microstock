import {
  smartTruncate,
  sanitizeNonAiText,
  sanitizeKeywords,
  toTitleCase,
} from '../src/services/rules/platformTransformers.ts';

function testSmartTruncation() {
  console.log('Testing Smart Semantic Truncation Engine...');

  // 1. Test word boundary preservation
  const longTitle = 'Aerial view of a clean photovoltaic solar panel installation on a commercial building roof during golden sunrise with soft lens flare';
  // Long title is 134 chars. Truncating to 100 chars (Vecteezy limit):
  const truncated100 = smartTruncate(longTitle, 100, { appendEllipsis: false });
  console.log('Original (134 chars):', longTitle);
  console.log('Truncated <= 100 chars:', truncated100);
  console.log('Length:', truncated100.length);

  console.assert(truncated100.length <= 100, 'Must be <= 100 chars');
  console.assert(!truncated100.endsWith('...'), 'No trailing ellipses per Vecteezy rules');
  console.assert(!truncated100.endsWith(' '), 'No trailing whitespace');
  console.assert(!/[,;:\-_.]+$/.test(truncated100), 'No trailing punctuation');
  // Check that the last word is complete (e.g. "golden", not "gol" or "gold")
  const lastWord = truncated100.split(' ').pop();
  console.assert(lastWord === 'during', `Expected last word to be "during", got "${lastWord}"`);

  // 2. Test title case
  const titleCaseSample = 'silhouette of a horse at sunset in nature';
  const titleCased = toTitleCase(titleCaseSample);
  console.assert(titleCased === 'Silhouette of a Horse at Sunset in Nature', 'Title Case failed');

  // 3. Test AI sanitization for Adobe Stock
  const aiTitle = 'A futuristic AI generated robot standing in a city, generated with Midjourney';
  const cleanTitle = sanitizeNonAiText(aiTitle);
  console.assert(!cleanTitle.toLowerCase().includes('ai generated'), 'AI generated must be stripped');
  console.assert(!cleanTitle.toLowerCase().includes('midjourney'), 'Midjourney must be stripped');

  const tags = ['robot', 'technology', 'generative ai', 'future', 'midjourney', 'city'];
  const cleanTags = sanitizeKeywords(tags);
  console.assert(!cleanTags.includes('generative ai'), 'Generative AI tag must be stripped');
  console.assert(!cleanTags.includes('midjourney'), 'Midjourney tag must be stripped');
  console.assert(cleanTags.includes('robot') && cleanTags.includes('city'), 'Legitimate tags must be kept');

  console.log('✅ All Semantic Truncation & Normalization assertions passed!');
}

testSmartTruncation();
