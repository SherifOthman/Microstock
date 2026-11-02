import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../../src/db';
import { BatchQueueService, QueueItem } from '../../src/services/queue/BatchQueueService';
import { extractMediaInfo } from '../../src/utils/mediaExtractor';
import {
  inspectVideoAudioTrack,
  stripAudioTrackLossless,
  saveMutedVideosToDirectory,
  VideoInspectionResult,
} from '../../src/services/video/videoMuterEngine';
import { saveCsvToDirectory, generatePlatformCsv } from '../../src/services/export/csvExporter';
import { processFilesForSegregatedRenaming, NEEDS_FIXING_FOLDER } from '../../src/services/cleaner/fileCleanerEngine';
import { keyRingScheduler } from '../../src/services/scheduler/KeyRingScheduler';
import * as providerModule from '../../src/services/providers';
import { MasterMetadataRecord } from '../../src/types';

describe('Chaos & Negative Resilience Testing (Proof of Zero Crashes)', () => {
  let queueService: BatchQueueService;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;
  const originalImage = global.Image;

  beforeEach(async () => {
    await db.masterRecords.clear();
    await db.apiKeys.clear();
    queueService = BatchQueueService.getInstance();
    queueService.clear();
    vi.restoreAllMocks();

    HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation((callback: any) => {
      callback(new Blob(['mock-blob'], { type: 'image/jpeg' }));
    });

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      fillStyle: '',
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      font: '',
      textAlign: '',
    } as any);

    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,mockCanvasBase64Data');

    (global as any).Image = class MockImage {
      naturalWidth = 800;
      naturalHeight = 600;
      width = 800;
      height = 600;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(val: string) {
        if (!val || val === 'data:image/jpeg;base64,' || val === 'data:,') {
          setTimeout(() => this.onerror && this.onerror(), 5);
        } else {
          setTimeout(() => this.onload && this.onload(), 5);
        }
      }
    };
  });

  afterEach(async () => {
    await db.masterRecords.clear();
    await db.apiKeys.clear();
    queueService.clear();
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
    global.Image = originalImage;
    vi.restoreAllMocks();
  });

  describe('Disaster Scenario 1: Native File System Failures (EACCES & ENOSPC)', () => {
    it('gracefully catches EACCES Permission Denied during CSV saving without crashing or losing DB data', async () => {
      // 1. Seed DB records
      const sampleRec: MasterMetadataRecord = {
        id: 'rec-1',
        filename: 'sunset_forest.jpg',
        batchId: 'batch-1',
        thumbnailBase64: 'fake-thumb',
        isAiGenerated: true,
        baseTitle: 'Dramatic Golden Sunset Over Pine Forest',
        detailedDescription: 'Aerial drone view of pine forest canopy at sunset.',
        rankedKeywords: ['forest', 'sunset', 'trees', 'nature', 'aerial'],
        status: 'completed',
        createdAt: Date.now(),
      };
      await db.masterRecords.put(sampleRec);

      const csvResult = generatePlatformCsv('adobe', [sampleRec], 'batch-1');

      // 2. Mock electronAPI.saveFiles throwing EACCES
      (window as any).electronAPI = {
        saveFiles: vi.fn().mockRejectedValue(new Error('EACCES: permission denied, open "C:\\Output\\batch-1_adobe.csv"')),
      };

      // 3. Attempt saving
      const saveResult = await saveCsvToDirectory([csvResult], '_Metadata_CSVs');

      // 4. Assert: App caught the error, returned false status, and DB record is completely intact
      expect(saveResult.success).toBe(false);
      expect(saveResult.savedCount).toBe(0);
      expect(saveResult.error).toContain('EACCES: permission denied');

      const dbCheck = await db.masterRecords.get('rec-1');
      expect(dbCheck).toBeDefined();
      expect(dbCheck?.status).toBe('completed');
      expect(dbCheck?.baseTitle).toBe('Dramatic Golden Sunset Over Pine Forest');
    });

    it('gracefully catches ENOSPC Disk Full during Video Muter saving without losing memory state', async () => {
      const mockVideo = new File(['fake-mp4-stream'], 'ocean_waves.mp4', { type: 'video/mp4' });
      const item: VideoInspectionResult = {
        id: 'ocean_waves.mp4',
        file: mockVideo,
        originalName: 'ocean_waves.mp4',
        size: 1024,
        hasAudio: true,
        audioTrackCount: 1,
        videoTrackCount: 1,
        status: 'muted',
        mutedBlob: new Blob(['muted-video-data'], { type: 'video/mp4' }),
      };

      // Mock ENOSPC Disk Full
      (window as any).electronAPI = {
        saveFiles: vi.fn().mockRejectedValue(new Error('ENOSPC: no space left on device, write')),
      };

      const result = await saveMutedVideosToDirectory([item], '_Muted_Videos');

      expect(result.success).toBe(false);
      expect(result.savedCount).toBe(0);
      expect(result.error).toContain('ENOSPC: no space left on device');
      // In-memory data preserved
      expect(item.mutedBlob).toBeDefined();
      expect(item.originalName).toBe('ocean_waves.mp4');
    });
  });

  describe('Disaster Scenario 2: Corrupted & Zero-Byte Media Resilience', () => {
    it('detects 0-byte video and returns corrupted flag without throwing unhandled exceptions', async () => {
      const emptyVideo = new File([], 'empty_corrupt.mp4', { type: 'video/mp4' });

      // In inspection
      const audioInfo = await inspectVideoAudioTrack(emptyVideo);
      expect(audioInfo.hasAudio).toBe(false);
      expect(audioInfo.isCorrupt).toBe(true);
      expect(audioInfo.error).toContain('0 bytes');

      // In lossless muting
      await expect(stripAudioTrackLossless(emptyVideo)).rejects.toThrow('Cannot mute 0-byte video file');
    });

    it('extractMediaInfo rejects 0-byte image, video, and vector files with clear error flags', async () => {
      const emptyJpg = new File([], 'zero_byte.jpg', { type: 'image/jpeg' });
      const emptyMp4 = new File([], 'zero_byte.mp4', { type: 'video/mp4' });
      const emptyEps = new File([], 'zero_byte.eps', { type: 'application/postscript' });

      await expect(extractMediaInfo(emptyJpg)).rejects.toThrow('corrupted or empty (0 bytes)');
      await expect(extractMediaInfo(emptyMp4)).rejects.toThrow('corrupted or empty (0 bytes)');
      await expect(extractMediaInfo(emptyEps)).rejects.toThrow('corrupted or empty (0 bytes)');
    });

    it('BatchQueueService handles corrupted 0-byte file by marking status error without blocking other items', async () => {
      const emptyFile = new File([], 'corrupt_item.jpg', { type: 'image/jpeg' });
      const validFile = new File(['valid-img-data'], 'valid_nature_photo.jpg', { type: 'image/jpeg' });

      // Mock Canvas and Image
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        fillText: vi.fn(),
      } as any);
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,validthumb');

      // Add both files
      await queueService.addFiles([emptyFile, validFile]);

      const items = queueService.getState().items;
      expect(items).toHaveLength(2);

      const corruptItem = items.find((i) => i.filename === 'corrupt_item.jpg');
      const validItem = items.find((i) => i.filename === 'valid_nature_photo.jpg');

      expect(corruptItem?.status).toBe('error');
      expect(corruptItem?.error).toContain('0 bytes');

      // The valid item was not blocked and transitioned to ready
      expect(validItem?.status).toBe('ready');

      // Verify DB persistence of error item
      const corruptDbRec = await db.masterRecords.get(corruptItem!.id);
      expect(corruptDbRec?.status).toBe('error');
      expect(corruptDbRec?.errorMessage).toContain('0 bytes');
    });

    it('FileCleanerEngine routes 0-byte files directly to _Needs_Fixing folder', () => {
      const emptyFile = new File([], 'empty_footage.mp4', { type: 'video/mp4' });
      const validFile = new File(['content'], 'tropical_beach_vacation.mp4', { type: 'video/mp4' });

      const results = processFilesForSegregatedRenaming([emptyFile, validFile], 'native', 1);
      expect(results).toHaveLength(2);

      const emptyRes = results.find((r) => r.originalName === 'empty_footage.mp4');
      const validRes = results.find((r) => r.originalName === 'tropical_beach_vacation.mp4');

      expect(emptyRes?.needsFixing).toBe(true);
      expect(emptyRes?.targetFolder).toBe(NEEDS_FIXING_FOLDER);
      expect(emptyRes?.fixingReason).toContain('0 bytes');

      expect(validRes?.needsFixing).toBe(false);
      expect(validRes?.targetFolder).toBe('Videos');
    });
  });

  describe('Disaster Scenario 3: Hard Network Drop (Failed to fetch) & Recovery', () => {
    it('catches hard network drop (TypeError: Failed to fetch), fails only active item, and allows retry without losing other items', async () => {
      // 1. Setup API keys in scheduler
      const mockKey1: ApiKeyRecord = {
        id: 'key-uuid-1',
        label: 'Key 1',
        providerId: 'gemini',
        modelId: 'gemini-1.5-flash',
        key: 'secret-1',
        status: 'healthy',
        rpmLimit: 15,
        rpdLimit: 1500,
        requestsInWindow: [],
        dailyRequestCount: 0,
        dailyResetTimestamp: 0,
        activeRequests: 0,
        lastUsedAt: 0,
        createdAt: 1000,
      };

      const mockRelease = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(keyRingScheduler, 'acquireKey').mockResolvedValue({
        keyRecord: mockKey1,
        release: mockRelease,
      });

      // 2. Mock adapter.analyzeImage:
      // - item1 fails with network drop ("TypeError: Failed to fetch") for first 3 attempts
      // - item2 succeeds immediately
      // - item1 retry (attempt 4+) succeeds after network is restored
      const validKeywords = [
        'skyscraper', 'architecture', 'glass', 'modern', 'building', 'city', 'downtown',
        'urban', 'exterior', 'contemporary', 'structure', 'facade', 'high rise', 'financial',
        'office', 'tower', 'steel', 'metropolis', 'skyline', 'commercial', 'corporate',
        'perspective', 'reflecting', 'blue sky', 'district',
      ];

      let item1FailCount = 0;
      const mockAdapter = {
        analyzeImage: vi.fn().mockImplementation(async (_key, _model, thumbBase64) => {
          if (thumbBase64 === 'fake-b64-1') {
            item1FailCount++;
            if (item1FailCount <= 3) {
              throw new TypeError('Failed to fetch');
            }
            return JSON.stringify({
              base_title: 'Recovered Network Photo Asset Title',
              detailed_description: 'Successfully recovered photo metadata after network re-establishment.',
              ranked_keywords: validKeywords,
            });
          }

          // item2 succeeds
          return JSON.stringify({
            base_title: 'Modern Architectural Skyscraper Glass',
            detailed_description: 'Stunning high angle view of contemporary glass skyscraper in downtown district.',
            ranked_keywords: validKeywords,
            categories: { adobeCategoryId: 1, shutterstockCategories: ['Buildings'], dreamstimeCategory1: 95 },
          });
        }),
      };
      vi.spyOn(providerModule, 'getProviderAdapter').mockReturnValue(mockAdapter as any);

      // Fast forward retries backoff (2s, 4s, 6s) without delay
      const realSetTimeout = global.setTimeout;
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any, ms?: number) => {
        if (ms && ms >= 1000) {
          return realSetTimeout(fn, 10);
        }
        return realSetTimeout(fn, ms);
      });

      // 3. Enqueue 2 items manually
      const item1: QueueItem = {
        id: 'net-fail-item',
        filename: 'network_fail.jpg',
        thumbnailBase64: 'fake-b64-1',
        status: 'ready',
        retryCount: 0,
        createdAt: 1000,
      };
      const item2: QueueItem = {
        id: 'net-success-item',
        filename: 'network_success.jpg',
        thumbnailBase64: 'fake-b64-2',
        status: 'ready',
        retryCount: 0,
        createdAt: 2000,
      };

      (queueService as any).items.set('net-fail-item', item1);
      (queueService as any).items.set('net-success-item', item2);

      await db.masterRecords.put({
        id: 'net-fail-item',
        filename: 'network_fail.jpg',
        status: 'pending',
        isAiGenerated: true,
        baseTitle: '',
        detailedDescription: '',
        rankedKeywords: [],
        createdAt: 1000,
      });
      await db.masterRecords.put({
        id: 'net-success-item',
        filename: 'network_success.jpg',
        status: 'pending',
        isAiGenerated: true,
        baseTitle: '',
        detailedDescription: '',
        rankedKeywords: [],
        createdAt: 2000,
      });

      // 4. Process both items sequentially
      (queueService as any).status = 'running';
      await (queueService as any).processSingleItem(item1, true);
      await (queueService as any).processSingleItem(item2, true);

      // 5. Assert: Failed item marked as error, success item marked as completed
      expect(item1.status).toBe('error');
      expect(item1.error).toContain('Failed to fetch');

      expect(item2.status).toBe('completed');
      expect(item2.metadataRecord?.baseTitle).toBe('Modern Architectural Skyscraper Glass');

      // Check DB records: success record is intact and completed!
      const successDbRec = await db.masterRecords.get('net-success-item');
      expect(successDbRec?.status).toBe('completed');
      expect(successDbRec?.baseTitle).toBe('Modern Architectural Skyscraper Glass');

      const failDbRec = await db.masterRecords.get('net-fail-item');
      expect(failDbRec?.status).toBe('error');
      expect(failDbRec?.errorMessage).toContain('Failed to fetch');

      // 6. Test User Clicking "Retry Failed"
      item1.status = 'ready';
      item1.retryCount = 0;
      item1.error = undefined;

      await (queueService as any).processSingleItem(item1, true);

      // Both items are now completed
      expect(item1.status).toBe('completed');
      expect(item1.metadataRecord?.baseTitle).toBe('Recovered Network Photo Asset Title');

      const retriedDbRec = await db.masterRecords.get('net-fail-item');
      expect(retriedDbRec?.status).toBe('completed');
      expect(retriedDbRec?.baseTitle).toBe('Recovered Network Photo Asset Title');
    });
  });
});
