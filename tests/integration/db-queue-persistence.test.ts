import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../../src/db';
import { batchQueueService, QueueItem } from '../../src/services/queue/BatchQueueService';
import { MasterMetadataRecord } from '../../src/types';

describe('Tier 2 Integration: Database Persistence & Queue State Recovery', () => {
  beforeEach(async () => {
    await db.masterRecords.clear();
    batchQueueService.clear();
  });

  afterEach(async () => {
    await db.masterRecords.clear();
    batchQueueService.clear();
  });

  describe('In-Place Chronological Sorting (createdAt Invariance)', () => {
    it('maintains original createdAt order when an item is reprocessed', async () => {
      const time1 = 1000;
      const time2 = 2000;
      const time3 = 3000;

      const record1: MasterMetadataRecord = {
        id: 'rec-1',
        filename: 'asset_1.jpg',
        batchId: 'b1',
        thumbnailBase64: '',
        isAiGenerated: true,
        baseTitle: 'First Asset',
        detailedDescription: 'First Asset Description.',
        rankedKeywords: ['first', 'asset'],
        status: 'completed',
        createdAt: time1,
      };

      const record2: MasterMetadataRecord = {
        id: 'rec-2',
        filename: 'asset_2.jpg',
        batchId: 'b1',
        thumbnailBase64: '',
        isAiGenerated: true,
        baseTitle: 'Second Asset',
        detailedDescription: 'Second Asset Description.',
        rankedKeywords: ['second', 'asset'],
        status: 'completed',
        createdAt: time2,
      };

      const record3: MasterMetadataRecord = {
        id: 'rec-3',
        filename: 'asset_3.jpg',
        batchId: 'b1',
        thumbnailBase64: '',
        isAiGenerated: true,
        baseTitle: 'Third Asset',
        detailedDescription: 'Third Asset Description.',
        rankedKeywords: ['third', 'asset'],
        status: 'completed',
        createdAt: time3,
      };

      await db.masterRecords.bulkPut([record1, record2, record3]);

      // Reprocess item 2 at time 5000: its updated record should keep its original createdAt = 2000!
      const updatedRecord2: MasterMetadataRecord = {
        ...record2,
        baseTitle: 'Second Asset Regenerated',
        updatedAt: 5000,
      };
      await db.masterRecords.put(updatedRecord2);

      const all = await db.masterRecords.toArray();
      all.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

      expect(all[0].id).toBe('rec-1');
      expect(all[1].id).toBe('rec-2');
      expect(all[2].id).toBe('rec-3');
      expect(all[1].baseTitle).toBe('Second Asset Regenerated');
      expect(all[1].createdAt).toBe(time2);
    });

    it('does not re-order assets when an error item is retried and completes', async () => {
      const records: MasterMetadataRecord[] = [
        {
          id: 'rec-A',
          filename: 'photo_a.jpg',
          batchId: 'b1',
          thumbnailBase64: '',
          isAiGenerated: true,
          baseTitle: 'Title A',
          detailedDescription: 'Description A.',
          rankedKeywords: ['a'],
          status: 'completed',
          createdAt: 100,
        },
        {
          id: 'rec-B',
          filename: 'photo_b.jpg',
          batchId: 'b1',
          thumbnailBase64: '',
          isAiGenerated: true,
          baseTitle: 'Title B',
          detailedDescription: 'Description B.',
          rankedKeywords: ['b'],
          status: 'error',
          createdAt: 200,
        },
        {
          id: 'rec-C',
          filename: 'photo_c.jpg',
          batchId: 'b1',
          thumbnailBase64: '',
          isAiGenerated: true,
          baseTitle: 'Title C',
          detailedDescription: 'Description C.',
          rankedKeywords: ['c'],
          status: 'completed',
          createdAt: 300,
        },
      ];

      await db.masterRecords.bulkPut(records);

      // Now resolve rec-B
      await db.masterRecords.update('rec-B', { status: 'completed', baseTitle: 'Title B Resolved' });

      const all = await db.masterRecords.toArray();
      all.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

      expect(all.map((r) => r.id)).toEqual(['rec-A', 'rec-B', 'rec-C']);
      expect(all[1].baseTitle).toBe('Title B Resolved');
    });
  });

  describe('BatchQueueService State Management', () => {
    it('initializes with idle queue state', () => {
      const state = batchQueueService.getState();
      expect(state.status).toBe('idle');
      expect(state.totalCount).toBe(0);
      expect(state.processedCount).toBe(0);
      expect(state.failedCount).toBe(0);
      expect(state.items).toHaveLength(0);
    });

    it('reprocessItem rehydrates item from DB into queue and resets status', async () => {
      const mockRecord: MasterMetadataRecord = {
        id: 'rec-test-1',
        filename: 'nature_forest.jpg',
        batchId: 'b1',
        thumbnailBase64: 'data:image/jpeg;base64,mock',
        isAiGenerated: true,
        baseTitle: 'Nature Forest Tree',
        detailedDescription: 'Dense green forest with tall trees.',
        rankedKeywords: ['nature', 'forest', 'trees'],
        status: 'completed',
        createdAt: 500,
      };

      await db.masterRecords.put(mockRecord);

      await batchQueueService.reprocessItem('rec-test-1', true, '', 'Google Nano Banana');

      const queueItem = batchQueueService.getState().items.find((i) => i.id === 'rec-test-1');
      expect(queueItem).toBeDefined();
      expect(['queued', 'processing']).toContain(queueItem?.status);
      expect(queueItem?.filename).toBe('nature_forest.jpg');
      expect(queueItem?.retryCount).toBe(0);
    });

    it('reprocessAll re-queues all completed items and triggers re-run', async () => {
      const mockRecords: MasterMetadataRecord[] = [
        {
          id: 'item-1',
          filename: 'item_1.jpg',
          batchId: 'b1',
          thumbnailBase64: '',
          isAiGenerated: true,
          baseTitle: 'Title 1',
          detailedDescription: 'Desc 1.',
          rankedKeywords: ['one'],
          status: 'completed',
          createdAt: 10,
        },
        {
          id: 'item-2',
          filename: 'item_2.jpg',
          batchId: 'b1',
          thumbnailBase64: '',
          isAiGenerated: true,
          baseTitle: 'Title 2',
          detailedDescription: 'Desc 2.',
          rankedKeywords: ['two'],
          status: 'completed',
          createdAt: 20,
        },
      ];

      await db.masterRecords.bulkPut(mockRecords);

      await batchQueueService.reprocessAll(true, '', 'Google Nano Banana');

      const item1 = batchQueueService.getState().items.find((i) => i.id === 'item-1');
      const item2 = batchQueueService.getState().items.find((i) => i.id === 'item-2');

      expect(['ready', 'queued', 'processing']).toContain(item1?.status);
      expect(['ready', 'queued', 'processing']).toContain(item2?.status);
    });

    it('pauses and resumes queue cleanly', () => {
      // Simulate running status
      (batchQueueService as any).status = 'running';
      batchQueueService.pause();
      expect(batchQueueService.getState().status).toBe('paused');

      batchQueueService.resume(true, '', 'Google Nano Banana');
      expect(['idle', 'running']).toContain(batchQueueService.getState().status);
    });

    it('notifies subscribers on queue state changes', () => {
      let notifiedCount = 0;
      const unsubscribe = batchQueueService.subscribe(() => {
        notifiedCount++;
      });

      batchQueueService.pause();
      expect(notifiedCount).toBeGreaterThan(0);

      unsubscribe();
      const countBefore = notifiedCount;
      batchQueueService.clear();
      expect(notifiedCount).toBe(countBefore);
    });
  });

  describe('Database Deletion & Atomic Rollback', () => {
    it('deletes single record cleanly without affecting other records', async () => {
      await db.masterRecords.bulkPut([
        { id: '1', filename: '1.jpg', batchId: 'b', thumbnailBase64: '', isAiGenerated: false, baseTitle: '1', detailedDescription: '1', rankedKeywords: [], status: 'completed', createdAt: 1 },
        { id: '2', filename: '2.jpg', batchId: 'b', thumbnailBase64: '', isAiGenerated: false, baseTitle: '2', detailedDescription: '2', rankedKeywords: [], status: 'completed', createdAt: 2 },
      ]);

      await db.masterRecords.delete('1');
      const remaining = await db.masterRecords.toArray();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('2');
    });

    it('clears all records completely', async () => {
      await db.masterRecords.bulkPut([
        { id: '1', filename: '1.jpg', batchId: 'b', thumbnailBase64: '', isAiGenerated: false, baseTitle: '1', detailedDescription: '1', rankedKeywords: [], status: 'completed', createdAt: 1 },
        { id: '2', filename: '2.jpg', batchId: 'b', thumbnailBase64: '', isAiGenerated: false, baseTitle: '2', detailedDescription: '2', rankedKeywords: [], status: 'completed', createdAt: 2 },
      ]);

      await db.masterRecords.clear();
      const all = await db.masterRecords.toArray();
      expect(all).toHaveLength(0);
    });
  });
});
