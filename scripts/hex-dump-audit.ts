import fs from 'fs';
import { hydrateVecteezyCsv } from '../src/services/rules/vecteezyHydrator';
import Papa from 'papaparse';

// Read the raw user template
const originalCsv = fs.readFileSync('C:/Users/eleml/.gemini/antigravity/brain/d5cb20f6-d21a-4243-b5f8-5798d0b64415/.user_uploaded/media_1793262411481_421fee96.csv', 'utf-8');

const localRecords = [
  {
    id: 'rec_copper',
    filename: 'Brushed_copper_metal_texture_2K_20261015121812.jpg',
    baseTitle: 'Brushed Copper Metal Texture Surface with Warm Glow',
    detailedDescription: 'Macro photograph of brushed copper metal texture with fine grain and metallic reflection.',
    rankedKeywords: ['brushed', 'copper', 'metal', 'texture', 'bronze', 'surface', 'metallic', 'background', 'plate', 'shiny'],
    categories: { adobe: 8 },
    createdAt: Date.now()
  },
  {
    id: 'rec_tan',
    filename: 'Tan_leather_texture_close_up_2K_20261015121900.jpg',
    baseTitle: 'Close-Up of Tan Leather Texture with Natural Grain',
    detailedDescription: 'Macro photograph of a tan leather surface showing fine wrinkles and natural grain.',
    rankedKeywords: ['tan', 'leather', 'texture', 'natural', 'grain', 'macro', 'surface', 'material', 'brown', 'hide'],
    categories: { adobe: 8 },
    createdAt: Date.now()
  }
];

const hydrated = hydrateVecteezyCsv(originalCsv, localRecords as any);

// Check BOM
const origBuf = fs.readFileSync('C:/Users/eleml/.gemini/antigravity/brain/d5cb20f6-d21a-4243-b5f8-5798d0b64415/.user_uploaded/media_1793262411481_421fee96.csv');
const hydBuf = Buffer.from(hydrated.csvString, 'utf-8');

console.log('=== 1. BOM CHECK (HEX DUMP FIRST 8 BYTES) ===');
console.log('Original First 8 bytes (Hex):', origBuf.subarray(0, 8).toString('hex'));
console.log('Hydrated First 8 bytes (Hex):', hydBuf.subarray(0, 8).toString('hex'));
console.log('BOM Present in Original?', origBuf[0] === 0xef && origBuf[1] === 0xbb && origBuf[2] === 0xbf);
console.log('BOM Present in Hydrated?', hydBuf[0] === 0xef && hydBuf[1] === 0xbb && hydBuf[2] === 0xbf);

console.log('\n=== 2. LINE ENDINGS & CR LEAKAGE CHECK ===');
console.log('Original line count (split \\n):', originalCsv.split('\n').length);
console.log('Original contains \\r:', originalCsv.includes('\r'));
console.log('Hydrated contains \\r:', hydrated.csvString.includes('\r'));
console.log('Hydrated contains \\r\\n:', hydrated.csvString.includes('\r\n'));

console.log('\n=== 3. HEX DUMP OF LAST 16 BYTES OF ROW 1 ===');
const origLines = originalCsv.split(/\r?\n/);
const hydLines = hydrated.csvString.split(/\r?\n/);
console.log('Original Line 1:', origLines[1]);
console.log('Original Line 1 Hex of last 40 chars:', Buffer.from(origLines[1].slice(-40), 'utf-8').toString('hex'));
console.log('Hydrated Line 1:', hydLines[1]);
console.log('Hydrated Line 1 Hex of last 40 chars:', Buffer.from(hydLines[1].slice(-40), 'utf-8').toString('hex'));

console.log('\n=== 4. MATCHED ROW COMPARISON (ROW 8: BRUSHED COPPER) ===');
console.log('Original Row 8:\n ', origLines[9]);
console.log('Hydrated Row 8:\n ', hydLines[9]);

console.log('\n=== 5. MATCHED ROW COMPARISON (ROW 70: TAN LEATHER) ===');
console.log('Original Row 70:\n ', origLines[71]);
console.log('Hydrated Row 70:\n ', hydLines[71]);
