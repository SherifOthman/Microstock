import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../../src/db';
import { batchQueueService, QueueItem } from '../../src/services/queue/BatchQueueService';
import { keyRingScheduler } from '../../src/services/scheduler/KeyRingScheduler';
import * as providerModule from '../../src/services/providers';
import { ApiKeyRecord, MasterMetadataRecord } from '../../src/types';

describe('Tier 2 Integration: Queue Timeouts, Watchdogs & Recovery States (BatchQueueService.ts)', () => {
  beforeEach(async () => {
    await db.masterRecords.clear();
    await db.apiKeys.clear();
    batchQueueService.clear();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await db.masterRecords.clear();
    await db.apiKeys.clear();
    batchQueueService.clear();
    vi.restoreAllMocks();
  });

  describe('Missing Thumbnail Immediate Error State', () => {
    it('immediately flags an item as error if thumbnailBase64 is missing without attempting API calls', async () => {
      const mockAcquireKey = vi.spyOn(keyRingScheduler, 'acquireKey');

      const itemWithoutThumb: QueueItem = {
        id: 'no-thumb-1',
        filename: 'broken.jpg',
        status: 'ready',
        retryCount: 0,
        createdAt: Date.now(),
        // thumbnailBase64 is undefined!
      };

      // Seed draft in DB
      await db.masterRecords.put({
        id: 'no-thumb-1',
        filename: 'broken.jpg',
        status: 'pending',
        isAiGenerated: true,
        baseTitle: '',
        detailedDescription: '',
        rankedKeywords: [],
        createdAt: Date.now(),
      });

      (batchQueueService as any).items.set('no-thumb-1', itemWithoutThumb);
      (batchQueueService as any).status = 'running';

      // Call internal processSingleItem
      await (batchQueueService as any).processSingleItem(itemWithoutThumb, true);

      expect(itemWithoutThumb.status).toBe('error');
      expect(itemWithoutThumb.error).toBe('Thumbnail data missing');
      expect(mockAcquireKey).not.toHaveBeenCalled();

      // Check DB update
      const dbRec = await db.masterRecords.get('no-thumb-1');
      expect(dbRec?.status).toBe('error');
      expect(dbRec?.errorMessage).toBe('Thumbnail data missing');
    });
  });

  describe('Multi-Attempt Retry Loop & Key Rotation on Failures', () => {
    it('retries up to 3 times, tracking attemptHistory and rotating excluded key IDs', async () => {
      // Mock global setTimeout in this test so exponential backoff (2s, 4s) resolves immediately without delay
      const realSetTimeout = global.setTimeout;
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any, ms?: number) => {
        if (ms && ms >= 1000) {
          // Immediately resolve background backoff delays
          return realSetTimeout(fn, 10);
        }
        return realSetTimeout(fn, ms);
      });

      let callCount = 0;
      const excludedKeysReceived: string[][] = [];

      const mockKey1: ApiKeyRecord = {
        id: 'key-uuid-1',
        label: 'Key One',
        providerId: 'gemini',
        modelId: 'gemini-1.5-flash',
        key: 'secret-1',
        status: 'healthy',
        rpmLimit: 15,
        tpmLimit: 1000000,
        rpdLimit: 1500,
        currentRpmUsage: 0,
        currentTpmUsage: 0,
        currentRpdUsage: 0,
        createdAt: Date.now(),
      };

      const mockKey2: ApiKeyRecord = {
        id: 'key-uuid-2',
        label: 'Key Two',
        providerId: 'gemini',
        modelId: 'gemini-1.5-flash',
        key: 'secret-2',
        status: 'healthy',
        rpmLimit: 15,
        tpmLimit: 1000000,
        rpdLimit: 1500,
        currentRpmUsage: 0,
        currentTpmUsage: 0,
        currentRpdUsage: 0,
        createdAt: Date.now(),
      };

      const mockRelease = vi.fn().mockResolvedValue(undefined);

      vi.spyOn(keyRingScheduler, 'acquireKey').mockImplementation(async (_provider, failedKeys) => {
        excludedKeysReceived.push([...(failedKeys || [])]);
        callCount++;
        const chosenKey = callCount === 1 ? mockKey1 : mockKey2;
        return {
          keyRecord: chosenKey,
          release: mockRelease,
        };
      });

      // Mock provider adapter to throw API timeout / rate limit errors
      const mockAdapter = {
        providerId: 'gemini',
        name: 'Google Gemini',
        analyzeImage: vi.fn().mockRejectedValue(new Error('AI Provider API call timed out after 20s')),
      };
      vi.spyOn(providerModule, 'getProviderAdapter').mockReturnValue(mockAdapter as any);

      // Seed queue item
      const item: QueueItem = {
        id: 'timeout-item-1',
        filename: 'nature_drone.mp4',
        thumbnailBase64: 'fake-b64-data',
        status: 'ready',
        retryCount: 0,
        attemptHistory: [],
        createdAt: Date.now(),
      };

      await db.masterRecords.put({
        id: 'timeout-item-1',
        filename: 'nature_drone.mp4',
        status: 'pending',
        isAiGenerated: true,
        baseTitle: '',
        detailedDescription: '',
        rankedKeywords: [],
        createdAt: Date.now(),
      });

      (batchQueueService as any).items.set('timeout-item-1', item);
      (batchQueueService as any).status = 'running';

      // Run single item processor (should run 3 attempts)
      await (batchQueueService as any).processSingleItem(item, true);

      // Verifications
      expect(item.status).toBe('error');
      expect(item.retryCount).toBe(3);
      expect(item.attemptHistory).toHaveLength(3);
      expect(item.attemptHistory?.[0].status).toBe('failed');
      expect(item.attemptHistory?.[0].error).toContain('timed out after 20s');
      expect(item.error).toContain('timed out after 20s');

      // Key rotation verification: attempt 2 should exclude key-uuid-1
      expect(excludedKeysReceived.length).toBe(3);
      expect(excludedKeysReceived[1]).toContain('key-uuid-1');

      // Releases should have been called 3 times with success = false
      expect(mockRelease).toHaveBeenCalledTimes(3);
      expect(mockRelease.mock.calls[0][0]).toBe(false);

      // DB verification
      const dbRec = await db.masterRecords.get('timeout-item-1');
      expect(dbRec?.status).toBe('error');
      expect(dbRec?.errorMessage).toContain('timed out after 20s');
    }, 10000);
  });

  describe('Queue Lifecycle: Pause, Resume & State Transition', () => {
    it('sets status to paused when pause() is invoked during running state', () => {
      (batchQueueService as any).status = 'running';
      batchQueueService.pause();
      expect(batchQueueService.getState().status).toBe('paused');
    });

    it('resumes queue and starts dispatchLoop when resume() is called', () => {
      (batchQueueService as any).status = 'paused';
      const dispatchSpy = vi.spyOn(batchQueueService as any, 'dispatchLoop').mockImplementation(async () => {});

      batchQueueService.resume();
      expect(batchQueueService.getState().status).toBe('running');
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });

    it('clear() empties all queue items and resets status to idle', () => {
      (batchQueueService as any).items.set('item-1', { id: 'item-1', filename: 'test.jpg', status: 'ready', retryCount: 0, createdAt: Date.now() });
      (batchQueueService as any).status = 'running';

      batchQueueService.clear();
      expect(batchQueueService.getState().items).toHaveLength(0);
      expect(batchQueueService.getState().status).toBe('idle');
    });
  });

  describe('Opportunistic Retry for Failed Items', () => {
    it('automatically re-queues failed items once opportunistic retry threshold is reached', () => {
      // Seed a failed item in queue that still has retries left (retryCount = 1 < maxRetries = 2)
      const failedItem: QueueItem = {
        id: 'failed-item-1',
        filename: 'retry_me.jpg',
        thumbnailBase64: 'fake-b64',
        status: 'error',
        error: 'Prior 503 error',
        retryCount: 1,
        createdAt: Date.now(),
      };
      (batchQueueService as any).items.set('failed-item-1', failedItem);

      // Call opportunisticRetryFailed
      (batchQueueService as any).opportunisticRetryFailed();

      expect(failedItem.status).toBe('ready');
      expect(failedItem.error).toBeUndefined();
      expect(failedItem.retryCount).toBe(1);
      expect(failedItem.isRetry).toBe(true);
    });
  });

  describe('Strict Sequential Dispatch Order in dispatchLoop', () => {
    it('dispatches items in strict numerical sequence even if added or keyed out of order', async () => {
      const processedFilenames: string[] = [];

      // Mock processSingleItem to record processing order and mark item as completed
      vi.spyOn(batchQueueService as any, 'processSingleItem').mockImplementation(async (item: QueueItem) => {
        processedFilenames.push(item.filename);
        item.status = 'completed';
        (batchQueueService as any).activeWorkers--;
      });

      // Insert items in inverted order
      const item3: QueueItem = { id: 'id-3', filename: 'clip_003.mp4', status: 'ready', retryCount: 0, createdAt: 1000 };
      const item1: QueueItem = { id: 'id-1', filename: 'clip_001.mp4', status: 'ready', retryCount: 0, createdAt: 2000 };
      const item2: QueueItem = { id: 'id-2', filename: 'clip_002.mp4', status: 'ready', retryCount: 0, createdAt: 3000 };

      (batchQueueService as any).items.set('id-3', item3);
      (batchQueueService as any).items.set('id-1', item1);
      (batchQueueService as any).items.set('id-2', item2);

      (batchQueueService as any).status = 'running';
      await (batchQueueService as any).dispatchLoop(false);

      expect(processedFilenames).toEqual([
        'clip_001.mp4',
        'clip_002.mp4',
        'clip_003.mp4',
      ]);
    });
  });
});
