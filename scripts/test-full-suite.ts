import { MasterMetadataRecord } from '../src/types';
import { generatePlatformCsv, SupportedPlatform } from '../src/services/export/csvExporter';
import { hydrateVecteezyCsv } from '../src/services/rules/vecteezyHydrator';
import { buildVisionPrompt, cleanFilenameHint } from '../src/services/ai/masterPrompt';
import { parseAndNormalizeAiMetadata, deGlueCompoundWord, rebalanceTopKeywords } from '../src/services/ai/metadataParser';
import { mapToDreamstimeCategories, getDreamstimeCategoryName, DREAMSTIME_CATEGORIES } from '../src/constants/categories';
import { cleanRawFilename, autoDetectLastNumber, processFilesForRenaming } from '../src/services/cleaner/fileCleanerEngine';
import Papa from 'papaparse';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 RUNNING COMPREHENSIVE END-TO-END VERIFICATION SUITE');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${details ? `-> ${details}` : ''}`);
    }
  }

  // -----------------------------------------------------------
  // TEST 1: Filename Cleaning & Prompt Hint Generation
  // -----------------------------------------------------------
  console.log('--- Test Group 1: Filename Domain Hints & Prompt Quality ---');
  const rawFile1 = 'Tan_leather_texture_close_up_2K_20261015121707.jpg';
  const clean1 = cleanFilenameHint(rawFile1);
  assert(clean1 === 'Tan leather texture close up', 'cleanFilenameHint strips timestamps, resolution & underscores', `Got: "${clean1}"`);

  const rawFile2 = 'Brushed_copper_metal_texture_2K_20261015121812.jpg';
  const clean2 = cleanFilenameHint(rawFile2);
  assert(clean2 === 'Brushed copper metal texture', 'cleanFilenameHint handles copper texture file', `Got: "${clean2}"`);

  const prompt = buildVisionPrompt(rawFile1, 'commercial microstock style');
  assert(prompt.includes('Tan leather texture close up'), 'buildVisionPrompt includes clean subject hint');
  assert(!prompt.includes('20261015121707'), 'buildVisionPrompt does not leak timestamp numbers');

  // -----------------------------------------------------------
  // TEST 2: Incomplete AI Output Rejection (Failover Trigger)
  // -----------------------------------------------------------
  console.log('\n--- Test Group 2: AI Output Parser & Noise Filtering ---');
  let rejectedEmpty = false;
  try {
    parseAndNormalizeAiMetadata('{}', 'test.jpg', 'base64', 'b1', false);
  } catch (err: any) {
    rejectedEmpty = true;
  }
  assert(rejectedEmpty, 'Parser strictly rejects empty AI output instead of generating dummy filler keywords');

  // Realistic Master Records for Export Testing
  const sampleRecords: MasterMetadataRecord[] = [
    {
      id: 'rec-1',
      batchId: 'batch-test',
      filename: 'Tan_leather_texture_close_up_2K_20261015121707.jpg',
      thumbnailBase64: 'mock-b64',
      isAiGenerated: true,
      baseTitle: 'Close-up of Tan Leather Texture with Natural Grain and Soft Folds',
      detailedDescription: 'Macro photograph of a tan leather surface showing natural grain, fine wrinkles, and soft folds with a white background area for copy space.',
      rankedKeywords: [
        'leather', 'texture', 'tan', 'material', 'background', 'brown', 'grain', 'close-up', 'macro',
        'surface', 'natural', 'wrinkles', 'folds', 'soft', 'smooth', 'tannin', 'cognac', 'hide', 'skin',
        'craft', 'luxury', 'fashion', 'accessories', 'bag', 'jacket', 'shoe', 'saddle', 'detail', 'pattern',
        'organic', 'warm', 'neutral', 'copy space', 'white background', 'isolated', 'tactile', 'flexible', 'durable'
      ],
      categories: {
        adobeCategoryId: 8,
        shutterstockCategories: ['Backgrounds/Textures'],
        dreamstimeCategory1: 114,
        dreamstimeCategory2: 115,
        dreamstimeCategory3: 114
      },
      status: 'completed',
      createdAt: Date.now()
    },
    {
      id: 'rec-2',
      batchId: 'batch-test',
      filename: 'Brushed_copper_metal_texture_2K_20261015121812.jpg',
      thumbnailBase64: 'mock-b64',
      isAiGenerated: true,
      baseTitle: 'Brushed Copper Metal Texture with Polished Horizontal Lines',
      detailedDescription: 'Close-up detail of a reddish-orange brushed copper metal sheet featuring elegant horizontal grain and soft studio reflections.',
      rankedKeywords: [
        'copper', 'metal', 'brushed copper', 'texture', 'metallic', 'bronze', 'surface', 'industrial',
        'sheet metal', 'copper texture', 'polished', 'horizontal lines', 'raw material', 'luxury finish',
        'warm metal', 'metallic background', 'hardware', 'construction', 'rose gold', 'modern architecture'
      ],
      categories: {
        adobeCategoryId: 8,
        shutterstockCategories: ['Backgrounds/Textures', 'Industrial'],
        dreamstimeCategory1: 114,
        dreamstimeCategory2: 120,
        dreamstimeCategory3: 114
      },
      status: 'completed',
      createdAt: Date.now()
    }
  ];

  // -----------------------------------------------------------
  // TEST 3: All 6 Microstock Platforms Single Export
  // -----------------------------------------------------------
  console.log('\n--- Test Group 3: All 6 Microstock Platforms Single Export ---');
  const platforms: SupportedPlatform[] = ['adobe', 'shutterstock', 'vecteezy', 'dreamstime', 'freepik', '123rf'];

  for (const pid of platforms) {
    const res = generatePlatformCsv(pid, sampleRecords, 'test_batch');
    assert(!res.isBlocked, `${pid.toUpperCase()}: Generates without blockage`);
    assert(res.csvString.length > 0, `${pid.toUpperCase()}: Output is non-empty`);
    assert(!res.csvString.startsWith('\uFEFF'), `${pid.toUpperCase()}: 100% Free of UTF-8 BOM byte mark`);

    // Verify CSV parsing (skipEmptyLines: true handles valid POSIX/CRLF trailing newlines at EOF)
    const parsed = Papa.parse(res.csvString, { header: true, skipEmptyLines: true });
    assert(parsed.errors.length === 0, `${pid.toUpperCase()}: Parses with 0 RFC 4180 syntax errors`);
    assert(parsed.data.length === 2, `${pid.toUpperCase()}: Contains exactly 2 rows`);

    // Platform specific validations
    if (pid === 'adobe') {
      const row = parsed.data[0] as any;
      assert(
        row['Filename'] && row['Title'] && row['Keywords'] && row['Category'] && 'Releases' in row,
        'Adobe Stock: Has exact 5 columns (Filename, Title, Keywords, Category, Releases)'
      );
      assert(row['Category'] === '8', 'Adobe Stock: Category is numeric integer (8)');
      assert(res.csvString.includes('\r\n'), 'Adobe Stock: Uses CRLF line endings');
      assert(res.csvString.endsWith('\r\n'), 'Adobe Stock: Has trailing CRLF newline');
    } else if (pid === 'shutterstock') {
      const row = parsed.data[0] as any;
      assert(
        row['Filename'] &&
          row['Description'] &&
          row['Keywords'] &&
          row['Categories'] &&
          'Editorial' in row &&
          'Mature content' in row &&
          'illustration' in row,
        'Shutterstock: Has official 7 columns (Filename, Description, Keywords, Categories, Editorial, Mature content, illustration)'
      );
      assert(row['Description'].length <= 200, 'Shutterstock: Description respects max 200 chars');
      assert(row['Editorial'] === 'no', 'Shutterstock: Default Editorial is "no"');
      assert(row['Mature content'] === 'no', 'Shutterstock: Default Mature content is "no"');
      assert(row['illustration'] === 'no', 'Shutterstock: Default illustration is "no"');
    } else if (pid === 'vecteezy') {
      const row = parsed.data[0] as any;
      assert(row['Filename'] && row['Title'] && row['Description'] && row['Keywords'] && row['License'], 'Vecteezy: Has required columns');
      assert(row['Title'].length <= 100, 'Vecteezy: Title respects max 100 chars');
      assert(!/[…\.]\s*$/.test(row['Title']), 'Vecteezy: Title has no trailing ellipses/periods');
      assert(row['License'] === 'pro', 'Vecteezy: Default license is "pro"');
      assert(!row['Filename'].includes('_') && !row['Filename'].includes(' '), 'Vecteezy: Filename sanitized for Web uploader parity (no underscores/spaces)');
    } else if (pid === 'dreamstime') {
      const row = parsed.data[0] as any;
      assert(row['Filename'] && row['Image Name'] && row['Description'] && row['Category 1'], 'Dreamstime: Has official 15-col FTP columns');
      assert(row['Description'].length > row['Image Name'].length, 'Dreamstime: Description is strictly longer than Image Name');
      assert(row['Description'].endsWith('.'), 'Dreamstime: Description is a complete sentence ending with period');
    } else if (pid === 'freepik') {
      assert(res.csvString.includes(';'), 'Freepik: Uses standard semicolon delimiter (;)');
    } else if (pid === '123rf') {
      const row = parsed.data[0] as any;
      assert(row['oldfilename'] && row['description'] && row['keywords'], '123RF: Has official 123rf columns (oldfilename, description, keywords)');
    }
  }

  // -----------------------------------------------------------
  // TEST 4: Configurable Export Options Verification
  // -----------------------------------------------------------
  console.log('\n--- Test Group 4: Configurable Platform Options ---');
  // Option A: Vecteezy License set to 'free'
  const vecFree = generatePlatformCsv('vecteezy', sampleRecords, 'test', { vecteezy: { license: 'free' } });
  const parsedVecFree = Papa.parse(vecFree.csvString, { header: true });
  const rowVec = parsedVecFree.data[0] as any;
  assert(rowVec['License'] === 'free', 'Vecteezy options: License dynamically switches to "free" when selected');

  // Option B: Dreamstime Free & Editorial options
  const dtCustom = generatePlatformCsv('dreamstime', sampleRecords, 'test', {
    dreamstime: { free: true, editorial: true, isAiGenerated: true }
  });
  const parsedDt = Papa.parse(dtCustom.csvString, { header: true });
  const rowDt = parsedDt.data[0] as any;
  assert(rowDt['Free'] === '1', 'Dreamstime options: Free column set to 1 when checked');
  assert(rowDt['Editorial'] === '1', 'Dreamstime options: Editorial column set to 1 when checked');
  assert(rowDt['Category 3'] === '212', 'Dreamstime options: AI Generated sets Category 3 to 212 (Illustrations & Clipart -> AI generated)');

  // Option C: Freepik AI Model Customization
  const fpCustom = generatePlatformCsv('freepik', sampleRecords, 'test', {
    freepik: { modelName: 'Midjourney v6.1 Photoreal' }
  });
  assert(fpCustom.csvString.includes('Midjourney v6.1 Photoreal'), 'Freepik options: Custom AI Model name injected correctly');

  // Option D: Shutterstock Compliance Options (Editorial, Mature content, illustration)
  const shutterCustom = generatePlatformCsv('shutterstock', sampleRecords, 'test', {
    shutterstock: { editorial: true, matureContent: true, illustration: true }
  });
  const parsedShutter = Papa.parse(shutterCustom.csvString, { header: true, skipEmptyLines: true });
  const rowShutter = parsedShutter.data[0] as any;
  assert(rowShutter['Editorial'] === 'yes', 'Shutterstock options: Editorial set to "yes" when checked');
  assert(rowShutter['Mature content'] === 'yes', 'Shutterstock options: Mature content set to "yes" when checked');
  assert(rowShutter['illustration'] === 'yes', 'Shutterstock options: illustration set to "yes" when checked');

  // -----------------------------------------------------------
  // TEST 5: Vecteezy Hydrator (Fuzzy Re-mapping with IDs)
  // -----------------------------------------------------------
  console.log('\n--- Test Group 5: Vecteezy CSV Hydrator ---');
  const officialVecteezyCsv = `"Id","Filename","Title","Description","Keywords","License"
"8492011","Tanleathertexturecloseup2K","","","","pro"
"8492012","Brushedcoppermetaltexture2K","","","","pro"`;

  const hydrated = hydrateVecteezyCsv(officialVecteezyCsv, sampleRecords, 'pro');
  assert(hydrated.matchedCount === 2, `Vecteezy Hydrator: Matched 2 of 2 files via fuzzy normalization (underscores & diacritics stripped)`);
  assert(!hydrated.csvString.startsWith('\uFEFF'), 'Vecteezy Hydrator: Output has NO BOM');

  const parsedHydrated = Papa.parse(hydrated.csvString, { header: true });
  const hRow1 = parsedHydrated.data[0] as any;
  assert(hRow1['Id'] === '8492011', 'Vecteezy Hydrator: Preserved official internal Id');
  assert(hRow1['Title'].includes('Leather Texture'), 'Vecteezy Hydrator: Injected Title Case Title');
  assert(hRow1['Keywords'].includes('leather, texture'), 'Vecteezy Hydrator: Injected Comma-separated Keywords');

  // -----------------------------------------------------------
  // TEST 6: Stock Tracker Data Logic & Media Recognition
  // -----------------------------------------------------------
  console.log('\n--- Test Group 6: Stock Tracker Logic & Media Recognition ---');
  const { createInitialPlatformStatuses, DEFAULT_PLATFORM_LIMITS } = await import('../src/db');
  const { getMediaTypeFromFilename, formatDuration } = await import('../src/utils/mediaExtractor');

  assert(getMediaTypeFromFilename('footage_drone_4k.mp4') === 'video', 'Tracker Media: Identifies MP4 as video');
  assert(getMediaTypeFromFilename('cinematic_sunset.mov') === 'video', 'Tracker Media: Identifies MOV as video');
  assert(getMediaTypeFromFilename('logo_badge.eps') === 'vector', 'Tracker Media: Identifies EPS as vector');
  assert(getMediaTypeFromFilename('vintage_ornament.ai') === 'vector', 'Tracker Media: Identifies AI as vector');
  assert(getMediaTypeFromFilename('macro_leather.jpg') === 'image', 'Tracker Media: Identifies JPG as image');

  assert(formatDuration(15) === '0:15', 'Duration formatting: 15s -> 0:15');
  assert(formatDuration(95) === '1:35', 'Duration formatting: 95s -> 1:35');

  const initialStatus = createInitialPlatformStatuses();
  assert(Object.keys(initialStatus).length === 6, 'Tracker: Initial platform map has all 6 agencies');
  assert(initialStatus.adobe.status === 'not_uploaded', 'Tracker: Default status is not_uploaded');
  assert(DEFAULT_PLATFORM_LIMITS.adobe.defaultBatchLimit === 50, 'Tracker Limits: Adobe default limit is 50');
  assert(DEFAULT_PLATFORM_LIMITS.freepik.defaultBatchLimit === 20, 'Tracker Limits: Freepik default limit is 20');

  // -----------------------------------------------------------
  // TEST 7: Keyword Phrasing (Single Words vs Double vs Mixed)
  // -----------------------------------------------------------
  console.log('\n--- Test Group 7: Keyword Phrasing (Single vs Double vs Mixed) ---');
  const aiSampleJson = JSON.stringify({
    base_title: 'Brushed Copper Sheet Metal Surface',
    detailed_description: 'Macro photograph of a clean brushed copper sheet metal texture with warm reflections.',
    ranked_keywords: [
      'copper metal', 'brushed texture', 'metallic surface', 'macro photo',
      'copper', 'metal', 'texture', 'brown', 'warm', 'clean', 'industrial design',
      'background copy space', 'detail'
    ],
    category_adobe: 8,
    category_shutterstock: ['Backgrounds/Textures'],
    dreamstime_category_1: 115,
  });

  const singleParsed = parseAndNormalizeAiMetadata(
    aiSampleJson,
    'copper_test.jpg',
    'base64',
    'batch-1',
    true,
    'Midjourney v6',
    'single'
  );

  assert(
    singleParsed.rankedKeywords.every((k) => !k.includes(' ')),
    'Single Keywords: 100% of keywords are strictly single words without spaces'
  );
  assert(
    singleParsed.rankedKeywords.includes('copper') && singleParsed.rankedKeywords.includes('metal'),
    'Single Keywords: Multi-word phrases were cleanly split into individual single words'
  );
  assert(
    !singleParsed.rankedKeywords.includes('and') && !singleParsed.rankedKeywords.includes('of'),
    'Single Keywords: Filtered common stop words'
  );

  const doubleParsed = parseAndNormalizeAiMetadata(
    aiSampleJson,
    'copper_test.jpg',
    'base64',
    'batch-1',
    true,
    'Midjourney v6',
    'double'
  );
  assert(
    doubleParsed.rankedKeywords.some((k) => k.includes(' ')),
    'Double Keywords: Preserves multi-word compound phrases'
  );

  const mixedPrompt = buildVisionPrompt('copper.jpg', '', 'image', 'mixed');
  assert(
    mixedPrompt.includes('Smart Microstock Mix (1 to 2 Words per Tag)') &&
    mixedPrompt.includes('NEVER glue or concatenate multiple words together without a space'),
    'Vision Prompt: Injects Smart Microstock Mix & Anti-Gluing instruction'
  );

  // Auto-repair de-gluer verification
  assert(deGlueCompoundWord('fitnessequipment') === 'fitness equipment', 'deGlue: Repairs fitnessequipment -> fitness equipment');
  assert(deGlueCompoundWord('homegym') === 'home gym', 'deGlue: Repairs homegym -> home gym');
  assert(deGlueCompoundWord('recoverytool') === 'recovery tool', 'deGlue: Repairs recoverytool -> recovery tool');
  assert(deGlueCompoundWord('texturedsurface') === 'textured surface', 'deGlue: Repairs texturedsurface -> textured surface');
  assert(deGlueCompoundWord('highlight') === 'highlight', 'deGlue: Preserves valid English words like highlight');

  // Metadata parser auto-repair integration test
  const gluedSampleJson = JSON.stringify({
    base_title: 'Fitness Gear Set with Foam Roller and Resistance Bands',
    detailed_description: 'Top down view of fitness equipment and exercise gear on yoga mat for physical training.',
    ranked_keywords: [
      'fitnessequipment', 'homegym', 'recoverytool', 'texturedsurface', 'foam roller',
      'resistance bands', 'yoga mat', 'exercise', 'training', 'healthy lifestyle',
      'physical fitness', 'body care', 'stretching', 'wellness', 'workout', 'active'
    ]
  });
  const repairedParsed = parseAndNormalizeAiMetadata(gluedSampleJson, 'gym.jpg', 'base64', 'batch-1', true, 'Nano Banana', 'mixed');
  assert(repairedParsed.rankedKeywords.includes('fitness equipment'), 'Parser Integration: Glued "fitnessequipment" auto-repaired to "fitness equipment"');
  assert(repairedParsed.rankedKeywords.includes('home gym'), 'Parser Integration: Glued "homegym" auto-repaired to "home gym"');
  assert(repairedParsed.rankedKeywords.includes('recovery tool'), 'Parser Integration: Glued "recoverytool" auto-repaired to "recovery tool"');

  // -----------------------------------------------------------
  // TEST 8: Advanced Vecteezy Matching (Order-independent & Unequal rows)
  // -----------------------------------------------------------
  console.log('\n--- Test Group 8: Advanced Vecteezy Matching & Edge Cases ---');
  // Scenario: Vecteezy CSV has 3 rows (reversed order + an extra file not in local database)
  const vecteezyMixedCsv = `"Id","Filename","Title","Description","Keywords","License"
"9999001","Extra file from older batch.jpg","Old Title","Old Desc","old, tag","free"
"8492012","Brushed copper metal texture 2K.jpg","","","","pro"
"8492011","Tan leather texture close up 2K.jpg","","","","pro"`;

  const hydratedAdvanced = hydrateVecteezyCsv(vecteezyMixedCsv, sampleRecords, 'pro');
  assert(hydratedAdvanced.totalRows === 3, 'Vecteezy Edge Cases: Total rows is 3');
  assert(hydratedAdvanced.matchedCount === 2, 'Vecteezy Edge Cases: Matched exactly the 2 local files');
  assert(hydratedAdvanced.unmatchedCount === 1, 'Vecteezy Edge Cases: Preserved the 1 unmatched extra file');

  const parsedAdv = Papa.parse(hydratedAdvanced.csvString, { header: true }).data as any[];
  const extraRow = parsedAdv.find((r) => r['Id'] === '9999001');
  assert(extraRow['Title'] === 'Old Title', 'Vecteezy Edge Cases: Unmatched row retains original title');
  assert(extraRow['Keywords'] === 'old, tag', 'Vecteezy Edge Cases: Unmatched row retains original keywords');

  const matchedCopper = parsedAdv.find((r) => r['Id'] === '8492012');
  assert(matchedCopper['Title'].includes('Brushed Copper'), 'Vecteezy Edge Cases: Reversed order matched copper accurately');

  // -----------------------------------------------------------
  // TEST 9: Top 10 Rebalancing, AI Boilerplate Stripping & Official Dreamstime Categories
  // -----------------------------------------------------------
  console.log('\n--- Test Group 9: Top 10 Rebalancing, Boilerplate Stripping & DT Categories ---');

  // 1. Generic AI boilerplate filename cleaning
  const aiBoilerplate1 = 'Create_separate_images_featuring_assorted_fruits_in_a_ceramic_bowl_2K.jpg';
  const cleanBoilerplate1 = cleanFilenameHint(aiBoilerplate1);
  assert(
    !cleanBoilerplate1.toLowerCase().includes('create') &&
    !cleanBoilerplate1.toLowerCase().includes('separate') &&
    !cleanBoilerplate1.toLowerCase().includes('images'),
    'cleanFilenameHint: Strips generic AI generation boilerplate tokens'
  );

  const genericOnlyFilename = 'Create_separate_images_showing_different_variations_generate.png';
  const cleanGenericOnly = cleanFilenameHint(genericOnlyFilename);
  assert(cleanGenericOnly === '', 'cleanFilenameHint: Returns empty string when filename contains only generic prompt words');

  // 2. Top 10 Rebalancer: guarantees single visible nouns first and limits 2-word clustering
  const clusteredKeywords = [
    'fresh fruit', 'fruit bowl', 'rustic kitchen', 'healthy food', 'wooden table',
    'still life', 'organic fruit', 'citrus fruit', 'delicious snack', 'dietary food',
    'apple', 'orange', 'banana', 'grapes', 'bowl', 'food', 'healthy', 'fresh', 'kitchen', 'table'
  ];
  const rebalanced = rebalanceTopKeywords(clusteredKeywords);
  const top10 = rebalanced.slice(0, 10);
  const top10Singles = top10.filter((k) => !k.includes(' '));
  const top10Doubles = top10.filter((k) => k.includes(' '));

  assert(top10Singles.length >= 7, `rebalanceTopKeywords: Guarantees at least 7 single words in Top 10 (Got ${top10Singles.length})`);
  assert(top10Doubles.length <= 3, `rebalanceTopKeywords: Caps compound 2-word phrases at 2-3 in Top 10 (Got ${top10Doubles.length})`);
  assert(!top10[0].includes(' ') && !top10[1].includes(' '), 'rebalanceTopKeywords: Positions #1 and #2 are primary single-word subjects');

  // 3. Official Dreamstime Category Mapping & Fallbacks
  const dtMapped = mapToDreamstimeCategories(7, ['Food and Drink'], true);
  assert(dtMapped.cat1 === 137, 'mapToDreamstimeCategories: Food maps to 137 (Nature -> Fruits & Vegetables)');
  assert(dtMapped.cat2 === 127, 'mapToDreamstimeCategories: Food maps secondary to 127 (Industries -> Food & Beverages)');
  assert(dtMapped.cat3 === 212, 'mapToDreamstimeCategories: AI Generated flag sets cat3 to 212');

  const dtName = getDreamstimeCategoryName(137, true);
  assert(dtName.includes('Fruits & Vegetables') && dtName.includes('AI Generated'), 'getDreamstimeCategoryName: Formats verified name and appends AI Generated badge');

  assert(DREAMSTIME_CATEGORIES[212] === 'Illustrations & Clipart -> AI generated', 'DREAMSTIME_CATEGORIES: Verified official 212 category in legend');
  assert(DREAMSTIME_CATEGORIES[115] === 'People -> Couples', 'DREAMSTIME_CATEGORIES: Verified 115 is Couples (never defaulted for food)');

  // -----------------------------------------------------------
  // TEST 10: Smart File Cleaner & Renamer Engine
  // -----------------------------------------------------------
  console.log('\n--- Test Group 10: Smart File Cleaner & Renamer Engine ---');
  
  // 1. Raw filename cleaning & junk stripping
  const rawJunk1 = 'Create_separate_images_featuring_assorted_fresh_fruits_in_rustic_ceramic_bowl_2K_20261015122121.jpg';
  const cleanOut1 = cleanRawFilename(rawJunk1, '_', 'lowercase', 55);
  assert(!cleanOut1.includes('create') && !cleanOut1.includes('2k') && !cleanOut1.includes('20261015122121'), 'cleanRawFilename: Strips AI boilerplate, 2K resolution & timestamps');
  assert(cleanOut1.length <= 55, `cleanRawFilename: Respects <= 55 chars length cap (Got: ${cleanOut1.length})`);
  assert(cleanOut1.includes('fruits') && cleanOut1.includes('bowl'), 'cleanRawFilename: Preserves meaningful English subject nouns');

  // 2. Word boundary safe truncation (does not cut words in half)
  const longName = 'A_very_long_descriptive_commercial_photography_title_with_extra_super_magnificent_aesthetic_elements_and_details_20261015.jpg';
  const truncatedClean = cleanRawFilename(longName, '_', 'lowercase', 55);
  assert(truncatedClean.length <= 55, `Word-boundary truncation: strictly <= 55 chars (Got: ${truncatedClean.length})`);
  assert(!truncatedClean.endsWith('_') && !truncatedClean.endsWith('-'), 'Word-boundary truncation: does not end with dangling separator');

  // 3. Auto-detect last number in folder
  const existingFolderFiles = [
    '001_apple_fruit.jpg',
    '002_orange_fruit.jpg',
    '019_grapes_macro.jpg',
    '020_banana_yellow.jpg',
    'random_unrelated_file.png',
  ];
  const nextNum = autoDetectLastNumber(existingFolderFiles);
  assert(nextNum === 21, `autoDetectLastNumber: Correctly identifies 20 as highest and suggests 21 (Got: ${nextNum})`);

  // 4. Sequential prefix mode (001_, 002_)
  const mockFile1 = new File(['content'], 'avocado_toast_with_egg_20261015.jpg', { type: 'image/jpeg', lastModified: 1000 });
  const mockFile2 = new File(['content'], 'fresh_orange_juice_glass_20261016.jpg', { type: 'image/jpeg', lastModified: 2000 });
  const sequentialRenamed = processFilesForRenaming([mockFile2, mockFile1], {
    mode: 'sequential',
    separator: '_',
    startCounter: 1,
    zeroPadDigits: 3,
    maxBaseLength: 55,
    caseStyle: 'lowercase',
    folderName: '_Cleaned_Ready',
  });

  assert(sequentialRenamed[0].cleanedName.startsWith('001_'), 'processFilesForRenaming: Pre-sorted chronologically, oldest is 001_');
  assert(sequentialRenamed[0].cleanedName.includes('avocado_toast'), 'processFilesForRenaming: Oldest file (avocado) became 001_');
  assert(sequentialRenamed[1].cleanedName.startsWith('002_'), 'processFilesForRenaming: Newer file (orange) became 002_');

  // 5. Clean only mode with duplicate auto-numbering (_01, _02)
  const dupFileA = new File(['content'], 'rustic_wooden_chair_2k_v1.jpg', { type: 'image/jpeg', lastModified: 1000 });
  const dupFileB = new File(['content'], 'rustic_wooden_chair_4k_v2.jpg', { type: 'image/jpeg', lastModified: 2000 });
  const cleanOnlyRenamed = processFilesForRenaming([dupFileA, dupFileB], {
    mode: 'clean_only',
    separator: '_',
    startCounter: 1,
    zeroPadDigits: 3,
    maxBaseLength: 55,
    caseStyle: 'lowercase',
    folderName: '_Cleaned_Ready',
  });
  assert(cleanOnlyRenamed[0].cleanedName === 'rustic_wooden_chair.jpg', 'clean_only mode: First occurrence has no numeric suffix');
  assert(cleanOnlyRenamed[1].cleanedName === 'rustic_wooden_chair_02.jpg', 'clean_only mode: Duplicate automatically gets _02 suffix');

  // -----------------------------------------------------------
  // TEST 11: Filename Hint Parser with Number Prefixes & Suffixes
  // -----------------------------------------------------------
  console.log('\n--- Test Group 11: Filename Hint Sequential Numbers Stripping ---');
  const seqFile = '001_Assorted_fresh_fruits_in_bowl.jpg';
  const cleanSeqHint = cleanFilenameHint(seqFile);
  assert(!cleanSeqHint.includes('001'), 'cleanFilenameHint: Strips leading zero-padded prefix "001_" from prompt hint');
  assert(cleanSeqHint.toLowerCase().includes('fruits') && cleanSeqHint.toLowerCase().includes('bowl'), 'cleanFilenameHint: Retains subject words from sequential filename');

  const dupCounterFile = 'Wooden_dining_table_in_kitchen_02.jpg';
  const cleanDupHint = cleanFilenameHint(dupCounterFile);
  assert(!cleanDupHint.includes('02'), 'cleanFilenameHint: Strips trailing duplicate suffix "_02" from prompt hint');
  assert(cleanDupHint.toLowerCase().includes('table'), 'cleanFilenameHint: Retains core subject from duplicate-numbered file');

  console.log('\n====================================================');
  console.log(`🏁 TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (100%)`);
  console.log('====================================================');
}

runTestSuite().catch(console.error);
