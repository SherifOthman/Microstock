import { hydrateVecteezyCsv } from '../src/services/rules/vecteezyHydrator.ts';
import type { MasterMetadataRecord } from '../src/types/index.ts';

const mockRecords: MasterMetadataRecord[] = [
  {
    id: '1',
    filename: 'Bamboo_coffee_cup_on_surface_2K_20261015120819.jpg',
    thumbnailBase64: '',
    baseTitle: 'Reusable Bamboo Coffee Cup With Dark Grey Silicone Lid Standing On Table',
    detailedDescription:
      'This image displays a single reusable bamboo coffee tumbler featuring a dark grey silicone lid on concrete tabletop.',
    rankedKeywords: ['reusable', 'sustainable', 'eco-friendly', 'bamboo', 'coffee', 'cup'],
    categories: { shutterstockCategories: [] },
    isAiGenerated: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: '2',
    filename: 'Cosmetic_containers_on_stone_sur…_2K_20261015124233.jpg',
    thumbnailBase64: '',
    baseTitle: 'Minimalist Beige Skincare Containers On Travertine Pedestal Platforms',
    detailedDescription:
      'Collection of neutral skincare containers arranged elegantly on stacked travertine stone slabs with natural sunlight.',
    rankedKeywords: ['skincare', 'minimalist', 'cosmetic', 'travertine', 'wellness', 'beauty'],
    categories: { shutterstockCategories: [] },
    isAiGenerated: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

// Exact rows from user's Vecteezy export:
const userVecteezyCsv = `Filename,Title,Description,Keywords,License,Id
Bamboocoffeecuponsurface2K20261015120819.jpg,,Opened ingredient,,"",71926cdd-d0d6-4503-b214-0783a15e2906
Cosmeticcontainersonstonesur_2K20261015124233.jpg,,Opened ingredient,,"",b27bb748-45a7-4d91-878d-b97cf80213b7
`;

console.log('--- Testing User Real Vecteezy CSV Hydration ---');
const result = hydrateVecteezyCsv(userVecteezyCsv, mockRecords, 'pro');

console.log(`Total rows: ${result.totalRows}`);
console.log(`Matched rows: ${result.matchedCount}`);
console.log(`Unmatched rows: ${result.unmatchedCount}`);
console.log('\nMatches details:');
console.log(result.matches);
console.log('\nGenerated Output CSV:');
console.log(result.csvString);

if (result.matchedCount === 2) {
  console.log('✅ TEST PASSED: User real data matched 100%!');
} else {
  console.error('❌ TEST FAILED');
  process.exit(1);
}
