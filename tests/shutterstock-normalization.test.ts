import { describe, it, expect } from 'vitest';
import {
  SHUTTERSTOCK_OFFICIAL_CATEGORIES,
  SHUTTERSTOCK_VIDEO_CATEGORIES,
  parseAndNormalizeAiMetadata,
} from '../src/services/ai/metadataParser';
import { transformForShutterstock } from '../src/services/rules/platformTransformers';
import { MasterMetadataRecord } from '../src/types';

describe('Shutterstock Category Normalization (Video vs Image)', () => {
  it('official list contains exactly 26 image categories and 19 video categories', () => {
    expect(SHUTTERSTOCK_OFFICIAL_CATEGORIES.length).toBe(26);
    expect(SHUTTERSTOCK_VIDEO_CATEGORIES.size).toBe(19);

    // Image-only categories must NOT exist in the video set
    const imageOnly = ['Abstract', 'Beauty/Fashion', 'Celebrities', 'Interiors', 'Miscellaneous', 'Parks/Outdoor', 'Vintage'];
    for (const cat of imageOnly) {
      expect(SHUTTERSTOCK_VIDEO_CATEGORIES.has(cat)).toBe(false);
    }
  });

  it('normalizes image-only categories to valid video categories when media is video', () => {
    const rawAiOutput = JSON.stringify({
      base_title: 'Rotating Asteroid in Deep Space',
      detailed_description: 'Rocky asteroid slowly rotating in deep space with cratered surface textures.',
      ranked_keywords: ['asteroid', 'space', 'meteor', 'cosmos', 'planet', 'universe', 'astronomy', 'orbit', 'science', 'dark'],
      category_adobe: 16,
      category_shutterstock: ['Abstract', 'Science'], // 'Abstract' is image-only!
      dreamstime_category_1: 'Abstract -> Planetarium',
    });

    const record = parseAndNormalizeAiMetadata(
      rawAiOutput,
      'asteroid_video.mp4',
      'data:image/jpeg;base64,mock',
      'batch-1',
      true,
      'Google Nano Banana',
      'mixed',
      'video'
    );

    const cats = record.categories?.shutterstockCategories || [];
    expect(cats[0]).toBe('Backgrounds/Textures'); // Converted from Abstract
    expect(cats[1]).toBe('Science');
  });

  it('formats Shutterstock CSV categories with comma and NO space', () => {
    const mockRecord: MasterMetadataRecord = {
      id: 'rec-1',
      filename: 'asteroid_video.mp4',
      mediaType: 'video',
      isAiGenerated: true,
      baseTitle: 'Rotating Asteroid in Deep Space',
      detailedDescription: 'Rocky asteroid slowly rotating in deep space with cratered surface textures.',
      rankedKeywords: ['asteroid', 'space', 'science', 'astronomy'],
      categories: {
        adobeCategoryId: 16,
        shutterstockCategories: ['Backgrounds/Textures', 'Science'],
        dreamstimeCategory1: 165,
        dreamstimeCategory2: 209,
      },
      createdAt: Date.now(),
      status: 'completed',
    };

    const res = transformForShutterstock([mockRecord]);
    expect(res.rows.length).toBe(1);
    const row = res.rows[0];

    // Must be comma-separated without space e.g. "Backgrounds/Textures,Science"
    expect(row.Categories).toBe('Backgrounds/Textures,Science');
    expect(row.Categories).not.toContain(' ');
  });

  it('converts image-only categories in transformForShutterstock export fallback', () => {
    const mockRecordWithImageCat: MasterMetadataRecord = {
      id: 'rec-2',
      filename: 'modern_building_interior.mov',
      mediaType: 'video',
      isAiGenerated: true,
      baseTitle: 'Modern Building Interior Drone Sweep',
      detailedDescription: 'Cinematic drone sweep through a luxury modern building interior with natural lighting.',
      rankedKeywords: ['building', 'interior', 'modern', 'architecture'],
      categories: {
        adobeCategoryId: 2,
        shutterstockCategories: ['Interiors'], // Interiors is image-only!
      },
      createdAt: Date.now(),
      status: 'completed',
    };

    const res = transformForShutterstock([mockRecordWithImageCat]);
    const row = res.rows[0];

    // Interiors should map to Buildings/Landmarks for video
    expect(row.Categories).toBe('Buildings/Landmarks');
  });
});
