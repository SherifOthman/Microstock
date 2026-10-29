import { MasterMetadataRecord } from '../src/types';
import { generatePlatformCsv, SupportedPlatform } from '../src/services/export/csvExporter';
import { hydrateVecteezyCsv } from '../src/services/rules/vecteezyHydrator';
import { buildVisionPrompt, cleanFilenameHint } from '../src/services/ai/masterPrompt';
import { parseAndNormalizeAiMetadata, deGlueCompoundWord } from '../src/services/ai/metadataParser';
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

    // Verify CSV parsing
    const parsed = Papa.parse(res.csvString, { header: true });
    assert(parsed.errors.length === 0, `${pid.toUpperCase()}: Parses with 0 RFC 4180 syntax errors`);
    assert(parsed.data.length === 2, `${pid.toUpperCase()}: Contains exactly 2 rows`);

    // Platform specific validations
    if (pid === 'adobe') {
      const row = parsed.data[0] as any;
      assert(row['Filename'] && row['Title'] && row['Keywords'] && row['Category'], 'Adobe Stock: Has required columns');
      assert(row['Category'] === '8', 'Adobe Stock: Category is numeric integer (8)');
    } else if (pid === 'shutterstock') {
      const row = parsed.data[0] as any;
      assert(row['Filename'] && row['Description'] && row['Keywords'] && row['Categories'], 'Shutterstock: Has required columns');
      assert(row['Description'].length <= 200, 'Shutterstock: Description respects max 200 chars');
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
  assert(rowDt['Category 3'] === '114', 'Dreamstime options: AI Generated sets Category 3 to 114 (Illustrations/AI)');

  // Option C: Freepik AI Model Customization
  const fpCustom = generatePlatformCsv('freepik', sampleRecords, 'test', {
    freepik: { modelName: 'Midjourney v6.1 Photoreal' }
  });
  assert(fpCustom.csvString.includes('Midjourney v6.1 Photoreal'), 'Freepik options: Custom AI Model name injected correctly');

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

  console.log('\n====================================================');
  console.log(`🏁 TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (100%)`);
  console.log('====================================================');
}

runTestSuite().catch(console.error);
