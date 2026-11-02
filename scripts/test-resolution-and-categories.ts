import assert from 'assert';
import { findDreamstimeCategoryId, mapToDreamstimeCategories } from '../src/constants/categories';
import { buildVisionPrompt } from '../src/services/ai/masterPrompt';
import { parseAndNormalizeAiMetadata } from '../src/services/ai/metadataParser';

console.log('--- Testing Dreamstime String Category Resolution ---');

// Exact string match
assert.strictEqual(findDreamstimeCategoryId('Industries -> Transportation'), 98, 'Matches exact string');
assert.strictEqual(findDreamstimeCategoryId('Objects -> Sports'), 156, 'Matches exact string');
assert.strictEqual(findDreamstimeCategoryId('industries -> food & beverages'), 127, 'Matches lowercase string');

// Subcategory match
const transId = findDreamstimeCategoryId('Transportation');
assert(transId === 98 || transId === 82, 'Matches subcategory name to a valid Transportation category (98 or 82)');
assert.strictEqual(findDreamstimeCategoryId('Sports'), 50, 'Matches subcategory name (defaulting to first registered)');

// Numeric string match
assert.strictEqual(findDreamstimeCategoryId('98'), 98, 'Matches numeric string');
assert.strictEqual(findDreamstimeCategoryId(98), 98, 'Matches number');

// Invalid string returns undefined
assert.strictEqual(findDreamstimeCategoryId('Some Random Fake Category 123'), undefined, 'Invalid string returns undefined');

console.log('✅ Dreamstime string resolution passed');

console.log('--- Testing Bicycle Category Guardrail ---');
const bicycleDt = mapToDreamstimeCategories(undefined, [], false, 'vintage city bicycle on street');
assert.strictEqual(bicycleDt.cat1, 98, 'Bicycle maps to Industries -> Transportation (98)');
assert.strictEqual(bicycleDt.cat2, 156, 'Bicycle maps to Objects -> Sports (156)');
assert.notStrictEqual(bicycleDt.cat1, 127, 'Bicycle NEVER maps to Food & Beverages');
assert.notStrictEqual(bicycleDt.cat2, 127, 'Bicycle NEVER maps to Food & Beverages');

console.log('✅ Bicycle Category Guardrail passed');

console.log('--- Testing 1080p Video Prompt & Keyword Guardrail ---');
const prompt1080 = buildVisionPrompt(
  'cycling_commute.mp4',
  undefined,
  'video',
  'mixed',
  'optimal',
  undefined,
  '1080p FHD',
  1920,
  1080
);
assert(prompt1080.includes('CRITICAL RESOLUTION RESTRICTION'), 'Prompt has resolution restriction for 1080p');
assert(prompt1080.includes('1080p Full HD (FHD)'), 'Prompt specifies 1080p Full HD');
assert(prompt1080.includes('DO NOT output "4k"'), 'Prompt strictly forbids 4k');
assert(!prompt1080.includes('Confidently include accurate resolution keywords: "4k"'), 'Does not include 4K instruction');

// Test metadata parser purging 4k keywords on 1080p video
const rawAiWithHallucinated4k = JSON.stringify({
  base_title: 'Cyclist riding road bicycle along scenic coastal highway',
  detailed_description: 'Tracking shot of a cyclist pedaling road bike along the coastal road under bright sun.',
  ranked_keywords: [
    'cyclist', 'bicycle', 'cycling', 'road bike', 'athlete', 'highway', 'coast', 'ocean',
    'motion', '4k', 'uhd', '4k footage', '4k video', 'ultra hd', 'speed', 'exercise',
    'fitness', 'sports', 'outdoor', 'helmet', 'pedal', 'asphalt', 'view', 'summer'
  ],
  category_adobe: 18,
  category_shutterstock: ['Sports/Recreation', 'Transportation'],
  dreamstime_category_1: 'Industries -> Transportation',
  dreamstime_category_2: 'Objects -> Sports'
});

const parsed1080 = parseAndNormalizeAiMetadata(
  rawAiWithHallucinated4k,
  'cycling_commute.mp4',
  'base64',
  'batch-test',
  false,
  undefined,
  'mixed',
  'video',
  '1080p FHD',
  1920,
  1080
);

assert.strictEqual(parsed1080.categories?.dreamstimeCategory1, 98, 'Parsed Dreamstime Cat 1 is 98 (Transportation)');
assert.strictEqual(parsed1080.categories?.dreamstimeCategory2, 156, 'Parsed Dreamstime Cat 2 is 156 (Sports)');
assert(!parsed1080.rankedKeywords.includes('4k'), 'Purged "4k" keyword for 1080p video');
assert(!parsed1080.rankedKeywords.includes('uhd'), 'Purged "uhd" keyword for 1080p video');
assert(!parsed1080.rankedKeywords.includes('4k footage'), 'Purged "4k footage" keyword for 1080p video');
assert(!parsed1080.rankedKeywords.includes('4k video'), 'Purged "4k video" keyword for 1080p video');
assert(!parsed1080.rankedKeywords.includes('ultra hd'), 'Purged "ultra hd" keyword for 1080p video');
assert(parsed1080.rankedKeywords.includes('cyclist'), 'Retained valid keywords');
assert(parsed1080.rankedKeywords.includes('bicycle'), 'Retained valid keywords');

console.log('✅ 1080p Video Guardrail passed');

console.log('--- Testing 4K Video Prompt & Keyword Inclusion ---');
const prompt4K = buildVisionPrompt(
  'aerial_nature.mp4',
  undefined,
  'video',
  'mixed',
  'optimal',
  undefined,
  '4K UHD',
  3840,
  2160
);
assert(prompt4K.includes('CONFIRMED RESOLUTION: 4K ULTRA HD'), 'Prompt recognizes 4K UHD');
assert(prompt4K.includes('Confidently include accurate resolution keywords: "4k"'), 'Prompt instructs 4k keywords');

const rawAiFor4K = JSON.stringify({
  base_title: 'Spectacular aerial view of misty pine forest mountains at sunrise',
  detailed_description: 'Wide cinematic drone shot gliding smoothly over dense evergreen forest canopy covered in morning fog.',
  ranked_keywords: [
    'aerial', 'forest', 'mountains', 'pine trees', 'fog', 'mist', 'drone shot', 'sunrise',
    'wilderness', 'nature', 'landscape', 'scenic', 'canopy', 'green', 'morning', 'trees'
  ],
  category_adobe: 11,
  category_shutterstock: ['Nature', 'Parks/Outdoor'],
  dreamstime_category_1: 'Nature -> Landscapes',
  dreamstime_category_2: 'Nature -> Forests'
});

const parsed4K = parseAndNormalizeAiMetadata(
  rawAiFor4K,
  'aerial_nature.mp4',
  'base64',
  'batch-test',
  false,
  undefined,
  'mixed',
  'video',
  '4K UHD',
  3840,
  2160
);

assert(parsed4K.rankedKeywords.includes('4k'), 'Automatically ensured "4k" keyword for genuine 4K video');
assert.strictEqual(parsed4K.categories?.dreamstimeCategory1, 146, 'Nature -> Landscapes is 146');
assert.strictEqual(parsed4K.categories?.dreamstimeCategory2, 18, 'Nature -> Forests is 18');

console.log('✅ 4K Video Support passed');

console.log('--- Testing Shutterstock Video vs Image Category Normalization ---');
import { findClosestCategory } from '../src/services/ai/metadataParser';
import { transformForShutterstock } from '../src/services/rules/platformTransformers';

// For images, Abstract & Beauty/Fashion are valid
assert.strictEqual(findClosestCategory('Abstract', false), 'Abstract', 'Image accepts Abstract');
assert.strictEqual(findClosestCategory('Beauty/Fashion', false), 'Beauty/Fashion', 'Image accepts Beauty/Fashion');

// For videos, Abstract -> Backgrounds/Textures, Beauty/Fashion -> Objects
assert.strictEqual(findClosestCategory('Abstract', true), 'Backgrounds/Textures', 'Video maps Abstract -> Backgrounds/Textures');
assert.strictEqual(findClosestCategory('Beauty/Fashion', true), 'Objects', 'Video maps Beauty/Fashion -> Objects');
assert.strictEqual(findClosestCategory('The Arts', true), 'Arts', 'Video maps The Arts -> Arts');
assert.strictEqual(findClosestCategory('Food and Drink', true), 'Food and drink', 'Video maps Food and Drink -> Food and drink');

console.log('✅ Shutterstock Category Normalization passed');

console.log('--- Testing Real Screenshot Edge Cases (Car Exhaust & Asteroid) ---');
// Screenshot 1: Car Exhaust Flame Flickering from Sports Car Tailpipe at Night
const exhaustDt = mapToDreamstimeCategories(10, ['Industrial', 'Transportation'], false, 'Car Exhaust Flame Flickering from Sports Car Tailpipe at Night');
assert.strictEqual(exhaustDt.cat1, 98, 'Car Exhaust maps to Industries -> Transportation (98)');
assert.notStrictEqual(exhaustDt.cat1, 127, 'Car Exhaust NEVER maps to Food & Beverages');
assert.notStrictEqual(exhaustDt.cat2, 127, 'Car Exhaust NEVER maps to Food & Beverages');

// Screenshot 2: Rotating Asteroid in Deep Space with Cratered Surface Texture
const asteroidDt = mapToDreamstimeCategories(16, ['Science', 'Backgrounds/Textures'], false, 'Rotating Asteroid in Deep Space with Cratered Surface Texture');
assert.strictEqual(asteroidDt.cat1, 165, 'Asteroid maps to Abstract -> Planetarium (165)');
assert.strictEqual(asteroidDt.cat2, 209, 'Asteroid maps to Technology -> Science (209)');
assert.notStrictEqual(asteroidDt.cat1, 105, 'Asteroid NEVER maps to Computers');

console.log('✅ Real Screenshot Edge Cases passed');

console.log('🎉 ALL NEW FEATURE TESTS PASSED!');
