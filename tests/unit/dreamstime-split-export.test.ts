import { describe, it, expect } from 'vitest';
import {
  transformForDreamstime,
  transformForDreamstimeVideos,
} from '../../src/services/rules/platformTransformers';
import {
  generatePlatformCsv,
  downloadAllCsvsAsZip,
} from '../../src/services/export/csvExporter';
import { MasterMetadataRecord } from '../../src/types';

describe('Dreamstime Split Export (Images 15-Col vs Videos 13-Col)', () => {
  const sampleImageRecord: MasterMetadataRecord = {
    id: 'img-1',
    filename: 'sunset_beach.jpg',
    mediaType: 'photo',
    batchId: 'batch-1',
    thumbnailBase64: '',
    isAiGenerated: true,
    baseTitle: 'Golden Sunset over Tropical Ocean Beach',
    detailedDescription: 'Beautiful golden hour sunset over tropical sandy ocean beach with palm trees.',
    rankedKeywords: ['sunset', 'beach', 'ocean', 'tropical', 'palm tree', 'golden hour', 'sea'],
    categories: {
      adobeCategoryId: 15,
      shutterstockCategories: ['Nature'],
      dreamstimeCategory1: 158,
      dreamstimeCategory2: 122,
      dreamstimeCategory3: 212,
    },
    status: 'completed',
    createdAt: 1000,
  };

  const sampleVectorRecord: MasterMetadataRecord = {
    id: 'vec-1',
    filename: 'business_infographic.eps',
    mediaType: 'vector',
    batchId: 'batch-1',
    thumbnailBase64: '',
    isAiGenerated: false,
    baseTitle: 'Modern Business Infographic Timeline Template',
    detailedDescription: 'Vector infographic chart design layout with clean timeline steps for presentation.',
    rankedKeywords: ['infographic', 'business', 'vector', 'chart', 'timeline', 'presentation'],
    categories: {
      adobeCategoryId: 3,
      shutterstockCategories: ['Business/Finance'],
      dreamstimeCategory1: 95,
      dreamstimeCategory2: 105,
      dreamstimeCategory3: 0,
    },
    status: 'completed',
    createdAt: 2000,
  };

  const sampleVideoRecord: MasterMetadataRecord = {
    id: 'vid-1',
    filename: 'drone_traffic_highway.mp4',
    mediaType: 'video',
    batchId: 'batch-1',
    thumbnailBase64: '',
    isAiGenerated: false,
    baseTitle: 'Aerial Drone Shot of Highway Traffic at Dusk',
    detailedDescription: 'Cinematic aerial top down shot of busy highway traffic intersection during twilight dusk.',
    rankedKeywords: ['highway', 'traffic', 'aerial', 'drone', 'cars', 'dusk', 'city', 'transportation'],
    categories: {
      adobeCategoryId: 18,
      shutterstockCategories: ['Transportation'],
      dreamstimeCategory1: 147,
      dreamstimeCategory2: 110,
      dreamstimeCategory3: 0,
    },
    status: 'completed',
    createdAt: 3000,
  };

  const sampleAiVideoRecord: MasterMetadataRecord = {
    id: 'vid-2',
    filename: 'cyberpunk_city_loop.mov',
    mediaType: 'video',
    batchId: 'batch-1',
    thumbnailBase64: '',
    isAiGenerated: true,
    baseTitle: 'Futuristic Cyberpunk Neon City Flying Animation',
    detailedDescription: 'Seamless loop animation flying between skyscrapers in rainy cyberpunk neon lit metropolis.',
    rankedKeywords: ['cyberpunk', 'futuristic', 'neon', 'city', 'scifi', 'skyscrapers'],
    categories: {
      adobeCategoryId: 19,
      shutterstockCategories: ['Technology'],
      dreamstimeCategory1: 105,
      dreamstimeCategory2: 95,
      dreamstimeCategory3: 212,
    },
    status: 'completed',
    createdAt: 4000,
  };

  describe('Transformer Level: 15-Col Images vs 13-Col Videos', () => {
    it('generates 15-column schema for images with "Image Name", "Free", and "P-EL"', () => {
      const rows = transformForDreamstime([sampleImageRecord, sampleVectorRecord]);
      expect(rows).toHaveLength(2);

      const first = rows[0];
      const keys = Object.keys(first);
      expect(keys).toHaveLength(15);

      // Verify exact header names
      expect(keys[0]).toBe('Filename');
      expect(keys[1]).toBe('Image Name');
      expect(keys[2]).toBe('Description');
      expect(keys[3]).toBe('Category 1');
      expect(keys[4]).toBe('Category 2');
      expect(keys[5]).toBe('Category 3');
      expect(keys[6]).toBe('keywords');
      expect(keys[7]).toBe('Free');
      expect(keys[8]).toBe('W-EL');
      expect(keys[9]).toBe('P-EL');
      expect(keys[10]).toBe('SR-EL');
      expect(keys[11]).toBe('SR-Price');
      expect(keys[12]).toBe('Editorial');
      expect(keys[13]).toBe('MR doc Ids');
      expect(keys[14]).toBe('Pr Docs');

      // Verify values
      expect(first['Free']).toBe(0);
      expect(first['W-EL']).toBe(1);
      expect(first['P-EL']).toBe(1);
      expect(first['SR-EL']).toBe(0);
    });

    it('generates 13-column schema for videos with "Video Name", excluding "Free" and "P-EL"', () => {
      const rows = transformForDreamstimeVideos([sampleVideoRecord, sampleAiVideoRecord]);
      expect(rows).toHaveLength(2);

      const first = rows[0];
      const keys = Object.keys(first);
      expect(keys).toHaveLength(13);

      // Column 2 must be 'Video Name'
      expect(keys[1]).toBe('Video Name');

      // Must NOT have 'Free' or 'P-EL'
      expect(keys).not.toContain('Free');
      expect(keys).not.toContain('P-EL');

      // Must have 'W-EL' and 'SR-EL'
      expect(keys).toContain('W-EL');
      expect(keys).toContain('SR-EL');
      expect(first['W-EL']).toBe(1);
      expect(first['SR-EL']).toBe(0);

      // Verify exact 13 keys order
      expect(keys).toEqual([
        'Filename',
        'Video Name',
        'Description',
        'Category 1',
        'Category 2',
        'Category 3',
        'keywords',
        'W-EL',
        'SR-EL',
        'SR-Price',
        'Editorial',
        'MR doc Ids',
        'Pr Docs',
      ]);
    });

    it('appends AI-generated video disclosure if video is AI generated', () => {
      const rows = transformForDreamstimeVideos([sampleAiVideoRecord]);
      const desc = String(rows[0]['Description']);
      expect(desc.toLowerCase()).toContain('ai-generated');
    });
  });

  describe('csvExporter Level: Smart Split Export', () => {
    it('pure image/vector batch outputs stock_metadata_dreamstime_images.csv with 15 columns', () => {
      const result = generatePlatformCsv('dreamstime', [sampleImageRecord, sampleVectorRecord], 'stock_metadata');
      expect(result.isBlocked).toBeFalsy();
      expect(result.filename).toBe('stock_metadata_dreamstime_images.csv');
      expect(result.rowCount).toBe(2);

      const lines = result.csvString.split(/\r?\n/).filter(Boolean);
      expect(lines[0]).toContain('Image Name');
      expect(lines[0]).toContain('Free');
      expect(lines[0]).toContain('P-EL');
      expect(result.additionalResults).toBeUndefined();
    });

    it('pure video batch outputs stock_metadata_dreamstime_videos.csv with 13 columns', () => {
      const result = generatePlatformCsv('dreamstime', [sampleVideoRecord, sampleAiVideoRecord], 'stock_metadata');
      expect(result.isBlocked).toBeFalsy();
      expect(result.filename).toBe('stock_metadata_dreamstime_videos.csv');
      expect(result.rowCount).toBe(2);

      const lines = result.csvString.split(/\r?\n/).filter(Boolean);
      expect(lines[0]).toContain('Video Name');
      expect(lines[0]).not.toContain('Image Name');
      expect(lines[0]).not.toContain('Free');
      expect(lines[0]).not.toContain('P-EL');
    });

    it('mixed batch produces both images and videos CSV files simultaneously', () => {
      const mixed = [sampleImageRecord, sampleVideoRecord, sampleVectorRecord, sampleAiVideoRecord];
      const result = generatePlatformCsv('dreamstime', mixed, 'stock_metadata');

      expect(result.isBlocked).toBeFalsy();
      // Primary result is images CSV
      expect(result.filename).toBe('stock_metadata_dreamstime_images.csv');
      expect(result.rowCount).toBe(2); // 1 photo + 1 vector
      expect(result.csvString).toContain('sunset_beach.jpg');
      expect(result.csvString).toContain('business_infographic.jpg');
      expect(result.csvString).not.toContain('drone_traffic_highway.mp4');

      // Additional result is videos CSV
      expect(result.additionalResults).toBeDefined();
      expect(result.additionalResults).toHaveLength(1);

      const videoRes = result.additionalResults![0];
      expect(videoRes.filename).toBe('stock_metadata_dreamstime_videos.csv');
      expect(videoRes.rowCount).toBe(2); // 2 videos
      expect(videoRes.csvString).toContain('Video Name');
      expect(videoRes.csvString).toContain('drone_traffic_highway.mp4');
      expect(videoRes.csvString).toContain('cyberpunk_city_loop.mov');
      expect(videoRes.csvString).not.toContain('sunset_beach.jpg');
    });

    it('ZIP export bundles both dreamstime_images.csv and dreamstime_videos.csv when mixed media is present', async () => {
      const mixed = [sampleImageRecord, sampleVideoRecord];
      const stats = await downloadAllCsvsAsZip(['dreamstime'], mixed, 'stock_metadata');
      // 1 images file + 1 videos file = 2 downloaded files
      expect(stats.downloadedCount).toBe(2);
      expect(stats.blockedCount).toBe(0);
    });
  });
});
