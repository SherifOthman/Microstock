import fs from 'fs';
import { hydrateVecteezyCsv } from '../src/services/rules/vecteezyHydrator';
import Papa from 'papaparse';

// Read the exact raw CSV uploaded by the user
const rawInput = fs.readFileSync('C:/Users/eleml/.gemini/antigravity/brain/d5cb20f6-d21a-4243-b5f8-5798d0b64415/.user_uploaded/media_1793262411481_421fee96.csv', 'utf-8');

const localRecords = [
  {
    id: 'rec_1',
    filename: 'Brushed_copper_metal_texture_2K_20261015121812.jpg',
    baseTitle: 'Brushed Copper Metal Texture Surface with Warm Glow',
    detailedDescription: 'Macro photograph of brushed copper metal texture with fine grain and metallic reflection.',
    rankedKeywords: ['brushed', 'copper', 'metal', 'texture', 'bronze', 'surface', 'metallic', 'background', 'plate', 'shiny'],
    categories: { adobe: 8 },
    createdAt: Date.now()
  },
  {
    id: 'rec_2',
    filename: 'Tan_leather_texture_close_up_2K_20261015121900.jpg',
    baseTitle: 'Close-Up of Tan Leather Texture with Natural Grain',
    detailedDescription: 'Macro photograph of a tan leather surface showing fine wrinkles and natural grain.',
    rankedKeywords: ['tan', 'leather', 'texture', 'natural', 'grain', 'macro', 'surface', 'material', 'brown', 'hide'],
    categories: { adobe: 8 },
    createdAt: Date.now()
  }
];

const parsedInput = Papa.parse(rawInput, { header: true });
console.log('INPUT PARSED FIELDS:', parsedInput.meta.fields);
console.log('INPUT PARSED ROW 0:', parsedInput.data[0]);
console.log('INPUT PARSED ROW 8 (Brushed Copper):', parsedInput.data[8]);
console.log('INPUT PARSED ROW 70 (Tan Leather):', parsedInput.data[70]);

const res = hydrateVecteezyCsv(rawInput, localRecords as any);

console.log('\n=== 1. BOM CHECK ===');
const inBuf = fs.readFileSync('C:/Users/eleml/.gemini/antigravity/brain/d5cb20f6-d21a-4243-b5f8-5798d0b64415/.user_uploaded/media_1793262411481_421fee96.csv');
const outBuf = Buffer.from(res.csvString, 'utf-8');

console.log('Input First 4 bytes: ', inBuf.subarray(0, 4), 'Has BOM:', inBuf[0] === 0xEF && inBuf[1] === 0xBB && inBuf[2] === 0xBF);
console.log('Output First 4 bytes:', outBuf.subarray(0, 4), 'Has BOM:', outBuf[0] === 0xEF && outBuf[1] === 0xBB && outBuf[2] === 0xBF);

console.log('\n=== 2. HEADERS & COLUMN ORDER ===');
const inHeader = rawInput.split(/\r?\n/)[0];
const outHeader = res.csvString.split(/\r?\n/)[0];
console.log('Input Header: ', inHeader);
console.log('Output Header:', outHeader);
console.log('Header Match: ', inHeader === outHeader);

console.log('\n=== 3. MATCHED ROWS IN OUTPUT ===');
const parsedOut = Papa.parse(res.csvString, { header: true });
const matchedRows = parsedOut.data.filter((r: any) => r.Title && r.Title.length > 0);
console.log('Total Output Rows:', parsedOut.data.length);
console.log('Matched Rows Count:', matchedRows.length);
for (const mr of matchedRows) {
  console.log('Matched Row:', JSON.stringify(mr, null, 2));
}

console.log('\n=== 4. RAW COMPARISON OF MATCHED ROWS ===');
const inLines = rawInput.split(/\r?\n/);
const outLines = res.csvString.split(/\r?\n/);
for (let i = 0; i < inLines.length; i++) {
  if (inLines[i].includes('Brushedcopper') || inLines[i].includes('Tanleather')) {
    console.log(`[Line ${i}]`);
    console.log('  ORIGINAL: ' + inLines[i]);
    console.log('  HYDRATED: ' + outLines[i]);
  }
}

console.log('\n=== 5. LINE ENDINGS ===');
console.log('Original Line Endings: CRLF?', rawInput.includes('\r\n'), 'Bare LF?', rawInput.replace(/\r\n/g, '').includes('\n'));
console.log('Output Line Endings:   CRLF?', res.csvString.includes('\r\n'), 'Bare LF?', res.csvString.replace(/\r\n/g, '').includes('\n'));

console.log('\n=== 6. CHECKING FOR "Opened ingredient" IN DESCRIPTION ===');
const sampleUnmatched = parsedOut.data[0] as any;
console.log('Unmatched row 0 Description:', sampleUnmatched?.Description);
