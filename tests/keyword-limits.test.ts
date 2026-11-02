import { describe, it, expect } from 'vitest';
import { parseAndNormalizeAiMetadata } from '../src/services/ai/metadataParser';
import {
  transformForFreepik,
  transformForAdobeStock,
  transformForShutterstock,
} from '../src/services/rules/platformTransformers';
import { MasterMetadataRecord } from '../src/types';

describe('Keyword Limits and Agency Safety Constraints', () => {
  // Generate 60 unique keywords
  const longKeywordList = Array.from({ length: 60 }, (_, i) => `keyword${i + 1}`);

  const mockRecord: MasterMetadataRecord = {
    id: 'test-rec-1',
    filename: 'nature_forest_stream.jpg',
    mediaType: 'image',
    isAiGenerated: true,
    baseTitle: 'Crystal Clear Stream Flowing Through Deep Evergreen Forest',
    detailedDescription: 'A serene mountain stream cascading over smooth river rocks in an untouched evergreen forest.',
    rankedKeywords: [...longKeywordList],
    categories: {
      adobeCategoryId: 5,
      shutterstockCategories: ['Nature'],
      dreamstimeCategory1: 18,
    },
    createdAt: Date.now(),
    status: 'completed',
  };

  it('Freepik AI export strictly enforces maximum 49 keywords to leave slot #50 for _ai_generated', () => {
    const rows = transformForFreepik([mockRecord], { isAiGenerated: true });
    expect(rows.length).toBe(1);

    const kws = rows[0].Keywords.split(',').map((k) => k.trim());
    expect(kws.length).toBeLessThanOrEqual(49);
    expect(kws.length).toBe(49);
  });

  it('Freepik non-AI export allows up to 50 keywords', () => {
    const nonAiRecord = { ...mockRecord, isAiGenerated: false };
    const rows = transformForFreepik([nonAiRecord], { isAiGenerated: false });
    const kws = rows[0].Keywords.split(',').map((k) => k.trim());
    expect(kws.length).toBeLessThanOrEqual(50);
    expect(kws.length).toBe(50);
  });

  it('Adobe Stock export strictly enforces maximum 49 keywords', () => {
    const rows = transformForAdobeStock([mockRecord]);
    expect(rows.length).toBe(1);

    const kws = rows[0].Keywords.split(',').map((k) => k.trim());
    expect(kws.length).toBeLessThanOrEqual(49);
    expect(kws.length).toBe(49);
  });

  it('Shutterstock export allows up to 50 keywords', () => {
    const res = transformForShutterstock([mockRecord]);
    const kws = res.rows[0].Keywords.split(',').map((k) => k.trim());
    expect(kws.length).toBeLessThanOrEqual(50);
    expect(kws.length).toBe(50);
  });

  it('metadataParser caps rankedKeywords at 50 even if AI returns more', () => {
    const rawAiOutput = JSON.stringify({
      base_title: 'Evergreen Forest Stream',
      detailed_description: 'Mountain stream cascading over river rocks in deep evergreen forest.',
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

    expect(parsed.rankedKeywords.length).toBeLessThanOrEqual(50);
    expect(parsed.rankedKeywords.length).toBe(50);
  });
});
