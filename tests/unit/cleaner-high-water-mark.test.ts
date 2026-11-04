import { describe, it, expect } from 'vitest';
import {
  parseBatchAndSequence,
  reconcileBatchesWithDb,
  calculateNextAvailableSlot,
  calculateAllMediaSlots,
  ExistingBatchInfo,
  MediaBatchesMap,
} from '../../src/services/cleaner/fileCleanerEngine';
import { MasterMetadataRecord } from '../../src/types';

describe('File Cleaner Sequence: High-Water Mark Logic (Preventing ID Collisions)', () => {
  describe('parseBatchAndSequence()', () => {
    it('correctly extracts batch number and sequence from standard filenames', () => {
      expect(parseBatchAndSequence('B01_001__clean_name.jpg')).toEqual({ batchNum: 1, sequence: 1 });
      expect(parseBatchAndSequence('B01_024_AI__sunset_beach.jpg')).toEqual({ batchNum: 1, sequence: 24 });
      expect(parseBatchAndSequence('B02_AI_PH_005_mountain.jpg')).toEqual({ batchNum: 2, sequence: 5 });
      expect(parseBatchAndSequence('B03_010.eps')).toEqual({ batchNum: 3, sequence: 10 });
      expect(parseBatchAndSequence('B12_100_AI__abstract.png')).toEqual({ batchNum: 12, sequence: 100 });
      expect(parseBatchAndSequence('D:\\Stock\\AI_Photos\\B01\\B01_042__test.jpg')).toEqual({ batchNum: 1, sequence: 42 });
    });

    it('returns null for filenames without Bxx_xxx pattern', () => {
      expect(parseBatchAndSequence('random_photo.jpg')).toBeNull();
      expect(parseBatchAndSequence('')).toBeNull();
    });
  });

  describe('reconcileBatchesWithDb() & Sequence Collision Prevention', () => {
    const emptyDiskBatches: MediaBatchesMap = {
      Photos: [],
      Videos: [],
      Vectors: [],
      AI_Photos: [],
      AI_Videos: [],
      AI_Vectors: [],
    };

    it('reconciles disk with DB: when 021-024 are deleted from disk, next sequence is B01_025', () => {
      // Physical disk only has B01 up to index 20 (user deleted 021-024)
      const diskBatches: MediaBatchesMap = {
        ...emptyDiskBatches,
        AI_Photos: [
          {
            name: 'B01',
            number: 1,
            path: 'C:/Stock/AI_Photos/B01',
            fileCount: 20,
            highestIndex: 20,
            lastFileName: 'B01_020_AI__forest.jpg',
          },
        ],
      };

      // SQLite database retains history up to B01_024
      const dbRecords: MasterMetadataRecord[] = [
        {
          id: 'rec-21',
          batchId: 'batch-1',
          filename: 'B01_021_AI__city_night.jpg',
          isAiGenerated: true,
          mediaType: 'image',
          baseTitle: 'City Night',
          detailedDescription: 'City night view',
          rankedKeywords: ['city'],
          thumbnailBase64: '',
          status: 'completed',
          createdAt: 1000,
        },
        {
          id: 'rec-24',
          batchId: 'batch-1',
          filename: 'B01_024_AI__sunset_sky.jpg',
          isAiGenerated: true,
          mediaType: 'image',
          baseTitle: 'Sunset Sky',
          detailedDescription: 'Sunset sky view',
          rankedKeywords: ['sunset'],
          thumbnailBase64: '',
          status: 'completed',
          createdAt: 2000,
        },
      ];

      const reconciled = reconcileBatchesWithDb(diskBatches, dbRecords);

      // Verified: AI_Photos highestIndex elevated to 24 from DB
      expect(reconciled.AI_Photos[0].highestIndex).toBe(24);

      // Verified: next available slot strictly increments from 24 to 25!
      const nextSlot = calculateNextAvailableSlot(reconciled.AI_Photos, 100);
      expect(nextSlot.startItemIndex).toBe(25);
      expect(nextSlot.slotLabel).toBe('B01_025');
    });

    it('preserves batch record if entire batch folder was removed from disk', () => {
      // Disk is empty
      const diskBatches: MediaBatchesMap = { ...emptyDiskBatches };

      // DB has records for B01 up to 40
      const dbRecords: MasterMetadataRecord[] = [
        {
          id: 'rec-40',
          batchId: 'batch-1',
          filename: 'B01_040_AI__ocean_waves.jpg',
          isAiGenerated: true,
          mediaType: 'image',
          baseTitle: 'Ocean Waves',
          detailedDescription: 'Ocean waves',
          rankedKeywords: ['ocean'],
          thumbnailBase64: '',
          status: 'completed',
          createdAt: 1000,
        },
      ];

      const reconciled = reconcileBatchesWithDb(diskBatches, dbRecords);
      expect(reconciled.AI_Photos.length).toBe(1);
      expect(reconciled.AI_Photos[0].highestIndex).toBe(40);

      // Next slot is B01_041
      const nextSlot = calculateNextAvailableSlot(reconciled.AI_Photos, 100);
      expect(nextSlot.startItemIndex).toBe(41);
      expect(nextSlot.slotLabel).toBe('B01_041');
    });

    it('rolls over to B02_001 if DB shows B01 reached maxItemsPerBatch (e.g. 100)', () => {
      const diskBatches: MediaBatchesMap = { ...emptyDiskBatches };
      const dbRecords: MasterMetadataRecord[] = [
        {
          id: 'rec-100',
          batchId: 'batch-1',
          filename: 'B01_100_AI__neon_lights.jpg',
          isAiGenerated: true,
          mediaType: 'image',
          baseTitle: 'Neon Lights',
          detailedDescription: 'Neon lights',
          rankedKeywords: ['neon'],
          thumbnailBase64: '',
          status: 'completed',
          createdAt: 1000,
        },
      ];

      const reconciled = reconcileBatchesWithDb(diskBatches, dbRecords);
      const nextSlot = calculateNextAvailableSlot(reconciled.AI_Photos, 100);

      expect(nextSlot.startBatchNumber).toBe(2);
      expect(nextSlot.startBatchFolder).toBe('B02');
      expect(nextSlot.startItemIndex).toBe(1);
      expect(nextSlot.slotLabel).toBe('B02_001');
    });

    it('maintains strict isolation across tracks (AI_Photos DB does not pollute Photos or Vectors)', () => {
      const diskBatches: MediaBatchesMap = { ...emptyDiskBatches };
      const dbRecords: MasterMetadataRecord[] = [
        {
          id: 'rec-1',
          batchId: 'batch-1',
          filename: 'B01_015_AI__ai_art.jpg',
          isAiGenerated: true,
          mediaType: 'image',
          baseTitle: 'AI Art',
          detailedDescription: 'AI Art',
          rankedKeywords: ['art'],
          thumbnailBase64: '',
          status: 'completed',
          createdAt: 1000,
        },
        {
          id: 'rec-2',
          batchId: 'batch-1',
          filename: 'B01_008__real_camera_pic.jpg',
          isAiGenerated: false,
          mediaType: 'image',
          baseTitle: 'Real Pic',
          detailedDescription: 'Real Pic',
          rankedKeywords: ['camera'],
          thumbnailBase64: '',
          status: 'completed',
          createdAt: 1000,
        },
      ];

      const slots = calculateAllMediaSlots(diskBatches, 100, dbRecords);

      expect(slots.AI_Photos.startItemIndex).toBe(16);
      expect(slots.AI_Photos.slotLabel).toBe('B01_016');

      expect(slots.Photos.startItemIndex).toBe(9);
      expect(slots.Photos.slotLabel).toBe('B01_009');

      expect(slots.Vectors.startItemIndex).toBe(1);
      expect(slots.Vectors.slotLabel).toBe('B01_001');
    });
  });
});
