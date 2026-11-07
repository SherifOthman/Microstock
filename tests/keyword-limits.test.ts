import { describe, it, expect } from 'vitest';
import { parseAndNormalizeAiMetadata } from '../src/services/ai/metadataParser';
import {
  transformForFreepik,
  transformForAdobeStock,
  transformForShutterstock,
  transformForVecteezy,
  transformForDreamstime,
  transformFor123rf,
  splitAndDeduplicateSingleWordKeywords,
} from '../src/services/rules/platformTransformers';
import { MasterMetadataRecord } from '../src/types';

describe('Keyword Limits, Two Titles Schema & Agency Safety Constraints', () => {
  // Generate 60 unique keywords
  const longKeywordList = Array.from({ length: 60 }, (_, i) => `keyword${i + 1}`);

  const mockRecord: MasterMetadataRecord = {
    id: 'test-rec-1',
    batchId: 'batch-1',
    thumbnailBase64: '',
    filename: 'nature_forest_stream.jpg',
    mediaType: 'image',
    isAiGenerated: true,
    baseTitle: 'Crystal Clear Mountain Stream Flowing Through Deep Evergreen Pine Forest Under Golden Morning Sunlight',
    shortTitle: 'Crystal Clear Mountain Stream in Evergreen Forest',
    longTitle: 'Crystal Clear Mountain Stream Flowing Through Deep Evergreen Pine Forest Under Golden Morning Sunlight',
    detailedDescription: 'A serene mountain stream cascading over smooth river rocks in an untouched evergreen forest during golden morning light.',
    rankedKeywords: [...longKeywordList],
    categories: {
      adobeCategoryId: 5,
      shutterstockCategories: ['Nature'],
      dreamstimeCategory1: 18,
    },
    createdAt: Date.now(),
    status: 'completed',
  };

  it('Freepik export strictly enforces maximum 49 single-word keywords', () => {
    const rows = transformForFreepik([mockRecord], { isAiGenerated: true });
    expect(rows.length).toBe(1);

    const kws = String(rows[0].Keywords).split(',').map((k) => k.trim());
    expect(kws.length).toBeLessThanOrEqual(49);
    expect(kws.length).toBe(49);
  });

  it('Freepik programmatically splits compound phrases into deduplicated single words capped at 49', () => {
    const compoundRecord: MasterMetadataRecord = {
      ...mockRecord,
      rankedKeywords: [
        'home office',
        'office desk',
        'modern workspace',
        'wooden desk',
        'home',
        'coffee cup',
        'laptop computer',
        'natural sunlight',
      ],
    };

    const rows = transformForFreepik([compoundRecord], { isAiGenerated: true });
    const kws = String(rows[0].Keywords).split(',').map((k) => k.trim());

    expect(kws).toEqual([
      'home',
      'office',
      'desk',
      'modern',
      'workspace',
      'wooden',
      'coffee',
      'cup',
      'laptop',
      'computer',
      'natural',
      'sunlight',
    ]);
    // Every Freepik keyword must be a single word (no spaces)
    expect(kws.every((k) => !k.includes(' '))).toBe(true);
  });

  it('splitAndDeduplicateSingleWordKeywords preserves order and deduplicates case-insensitively', () => {
    const res = splitAndDeduplicateSingleWordKeywords([
      'Home Office',
      'office chair',
      'modern home',
      'ergonomic chair',
    ]);
    expect(res).toEqual(['home', 'office', 'chair', 'modern', 'ergonomic']);
  });

  it('Adobe Stock export strictly enforces maximum 49 keywords', () => {
    const rows = transformForAdobeStock([mockRecord]);
    expect(rows.length).toBe(1);

    const kws = String(rows[0].Keywords).split(',').map((k) => k.trim());
    expect(kws.length).toBeLessThanOrEqual(49);
    expect(kws.length).toBe(49);
  });

  it('Shutterstock export allows up to 50 keywords', () => {
    const res = transformForShutterstock([mockRecord]);
    const kws = String(res.rows[0].Keywords).split(',').map((k) => k.trim());
    expect(kws.length).toBeLessThanOrEqual(50);
    expect(kws.length).toBe(50);
  });

  it('routes shortTitle (<100 chars) to Freepik and Vecteezy, and longTitle (<=200 chars) to Adobe, Shutterstock, Dreamstime, and 123RF', () => {
    const freepikRows = transformForFreepik([mockRecord]);
    const vecteezyRows = transformForVecteezy([mockRecord]);
    const adobeRows = transformForAdobeStock([mockRecord]);
    const shutterRows = transformForShutterstock([mockRecord]).rows;
    const dreamstimeRows = transformForDreamstime([mockRecord]);
    const rf123Rows = transformFor123rf([mockRecord]);

    expect(freepikRows[0].Title).toBe('Crystal Clear Mountain Stream in Evergreen Forest');
    expect(String(freepikRows[0].Title).length).toBeLessThan(100);

    expect(vecteezyRows[0].Title).toBe('Crystal Clear Mountain Stream in Evergreen Forest');
    expect(String(vecteezyRows[0].Title).length).toBeLessThan(100);

    expect(adobeRows[0].Title).toBe(mockRecord.longTitle);
    expect(shutterRows[0].Description).toBe(`${mockRecord.longTitle}.`);
    expect(dreamstimeRows[0]['Image Name']).toBe(mockRecord.longTitle);
    expect(rf123Rows[0].description).toBe(`${mockRecord.longTitle}.`);
  });

  it('metadataParser parses short_title (<100 chars) and long_title (<=200 chars) and caps rankedKeywords at 50', () => {
    const rawAiOutput = JSON.stringify({
      short_title: 'Evergreen Forest Stream in Morning Light',
      long_title: 'Crystal Clear Mountain Stream Cascading Over Smooth River Rocks in Deep Untouched Evergreen Forest During Golden Morning Sunlight',
      detailed_description: 'Mountain stream cascading over smooth river rocks in a deep untouched evergreen forest bathed in golden morning sunlight.',
      ranked_keywords: longKeywordList,
      category_adobe: 5,
      category_shutterstock: ['Nature'],
    });

    const parsed = parseAndNormalizeAiMetadata(
      rawAiOutput,
      'forest_stream.jpg',
      'data:image/jpeg;base64,mock',
      'batch-1',
      true,
      'Google Nano Banana',
      'mixed',
      'image'
    );

    expect(parsed.shortTitle).toBe('Evergreen Forest Stream in Morning Light');
    expect((parsed.shortTitle || '').length).toBeLessThan(100);
    expect(parsed.longTitle).toContain('Crystal Clear Mountain Stream Cascading');
    expect((parsed.longTitle || '').length).toBeLessThanOrEqual(200);
    expect(parsed.rankedKeywords.length).toBeLessThanOrEqual(50);
    expect(parsed.rankedKeywords.length).toBe(50);
  });
});
