import fs from 'fs';
import { hydrateVecteezyCsv } from '../src/services/rules/vecteezyHydrator';

const csvContent = fs.readFileSync('C:/Users/eleml/.gemini/antigravity/brain/d5cb20f6-d21a-4243-b5f8-5798d0b64415/.user_uploaded/media_1793262411481_421fee96.csv', 'utf-8');

const sampleRecords = [
  {
    id: 'rec_1',
    filename: 'Tan_leather_texture_close_up_2K_20261015121900.jpg',
    baseTitle: 'Close-up of Tan Leather Texture with Natural Grain and Soft Folds',
    detailedDescription: 'Macro photograph of a tan leather surface showing natural grain.',
    rankedKeywords: ['leather', 'texture', 'tan', 'material', 'background', 'brown'],
    categories: { adobe: 8, shutterstock: ['Backgrounds/Textures'], dreamstime: 114 },
    createdAt: Date.now()
  },
  {
    id: 'rec_2',
    filename: 'Brushed_copper_metal_texture_2K_20261015121812.jpg',
    baseTitle: 'Brushed Copper Metal Texture Surface',
    detailedDescription: 'High quality commercial stock photograph of brushed copper metal texture.',
    rankedKeywords: ['brushed', 'copper', 'metal', 'texture', 'metallic', 'bronze'],
    categories: { adobe: 8, shutterstock: ['Backgrounds/Textures'], dreamstime: 115 },
    createdAt: Date.now()
  }
];

const result = hydrateVecteezyCsv(csvContent, sampleRecords as any);
console.log('Total rows in CSV:', result.totalRows);
console.log('Matched count:', result.matchedCount);
console.log('Unmatched count:', result.unmatchedCount);
const matched = result.matches.filter(m => m.status === 'matched');
console.log('Matched items:', JSON.stringify(matched, null, 2));
