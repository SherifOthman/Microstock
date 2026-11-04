import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../../src/db';
import {
  processFilesForSegregatedRenaming,
  NEEDS_FIXING_FOLDER,
} from '../../src/services/cleaner/fileCleanerEngine';
import { BatchQueueService, QueueItem } from '../../src/services/queue/BatchQueueService';
import { sortUnifiedAssets, UnifiedAssetItem } from '../../src/hooks/useUnifiedAssets';
import * as mediaExtractorModule from '../../src/utils/mediaExtractor';

vi.mock('../../src/utils/mediaExtractor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/mediaExtractor')>();
  return {
    ...actual,
    extractMediaInfo: vi.fn().mockImplementation(async (file: File) => {
      const isVideo = file.name.endsWith('.mp4');
      const isVector = file.name.endsWith('.eps');
      return {
        mediaType: isVideo ? 'video' : isVector ? 'vector' : 'image',
        thumbnailBase64: 'mockthumbdata',
        thumbnailDataUrl: 'data:image/jpeg;base64,mockthumbdata',
        originalSizeBytes: file.size,
        compressedSizeBytes: 1024,
        videoDurationSeconds: isVideo ? 15 : undefined,
        videoResolution: isVideo ? '4K UHD' : undefined,
        hasAudio: false,
        width: 3840,
        height: 2160,
        hasRealPreview: true,
      };
    }),
  };
});
import {
  inspectVideoAudioTrack,
  saveMutedVideosToDirectory,
  VideoInspectionResult,
} from '../../src/services/video/videoMuterEngine';

describe('End-to-End (E2E) Mixed Media Resilient Pipeline', () => {
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

    (window as any).electronAPI = {
      probeAudio: vi.fn().mockResolvedValue({ hasAudio: false, audioTrackCount: 0, videoTrackCount: 1 }),
      saveFiles: vi.fn().mockResolvedValue({ success: true, savedCount: 5 }),
    };

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

  it('orchestrates mixed batch (10 JPGs, 5 MP4s, 3 paired EPS+JPG, 2 corrupt/invalid) through Segregation, Studio Queue & Video Muter', async () => {
    // 1. Prepare Mixed Batch Files
    // 10 JPG Photos (AI batch)
    const jpgFiles: File[] = Array.from({ length: 10 }, (_, i) => {
      const idx = String(i + 1).padStart(2, '0');
      return new File(['fake-jpg-content'], `commercial_office_workspace_${idx}.jpg`, { type: 'image/jpeg' });
    });

    // 5 MP4 Videos
    const mp4Files: File[] = Array.from({ length: 5 }, (_, i) => {
      const idx = String(i + 1).padStart(2, '0');
      return new File(['fake-mp4-content'], `aerial_drone_sunset_highway_${idx}.mp4`, { type: 'video/mp4' });
    });

    // 3 EPS Vectors with 3 Companion Preview JPGs (6 files total)
    const vectorPairs: File[] = [
      new File(['%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 500 500\n%%EOF'], 'corporate_infographic_timeline.eps', { type: 'application/postscript' }),
      new File(['preview-jpg-1'], 'corporate_infographic_timeline.jpg', { type: 'image/jpeg' }),
      new File(['%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 500 500\n%%EOF'], 'modern_finance_chart_diagram.eps', { type: 'application/postscript' }),
      new File(['preview-jpg-2'], 'modern_finance_chart_diagram.jpg', { type: 'image/jpeg' }),
      new File(['%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 500 500\n%%EOF'], 'technology_hexagon_pattern_mesh.eps', { type: 'application/postscript' }),
      new File(['preview-jpg-3'], 'technology_hexagon_pattern_mesh.jpg', { type: 'image/jpeg' }),
    ];

    // 2 Corrupt/Invalid Files: 0-byte corrupt file & numeric-only filename
    const corruptEmptyVideo = new File([], 'empty_corrupt_footage.mp4', { type: 'video/mp4' });
    const numericOnlyFile = new File(['valid-content'], '425997637_1793366301908538.jpg', { type: 'image/jpeg' });

    const fullBatch: File[] = [
      ...jpgFiles,
      ...mp4Files,
      ...vectorPairs,
      corruptEmptyVideo,
      numericOnlyFile,
    ];

    expect(fullBatch).toHaveLength(23);

    // =========================================================================
    // STEP 1: FILE CLEANER & SEGREGATION ENGINE
    // =========================================================================
    const segregatedItems = processFilesForSegregatedRenaming(fullBatch, 'ai', 1);
    expect(segregatedItems).toHaveLength(23);

    // Check invalid/corrupt items routed to _Needs_Fixing
    const needsFixingItems = segregatedItems.filter((i) => i.targetFolder === NEEDS_FIXING_FOLDER);
    expect(needsFixingItems).toHaveLength(2);

    const emptyCorruptResult = needsFixingItems.find((i) => i.originalName === 'empty_corrupt_footage.mp4');
    expect(emptyCorruptResult).toBeDefined();
    expect(emptyCorruptResult?.needsFixing).toBe(true);
    expect(emptyCorruptResult?.fixingReason).toContain('0 bytes');

    const numericResult = needsFixingItems.find((i) => i.originalName === '425997637_1793366301908538.jpg');
    expect(numericResult).toBeDefined();
    expect(numericResult?.needsFixing).toBe(true);
    expect(numericResult?.fixingReason).toContain('minimum 2 required');

    // Check segregation tracks
    const aiPhotos = segregatedItems.filter((i) => i.track === 'AI_Photos' && !i.needsFixing);
    const aiVideos = segregatedItems.filter((i) => i.track === 'AI_Videos' && !i.needsFixing);
    const aiVectors = segregatedItems.filter((i) => i.track === 'AI_Vectors' && !i.needsFixing);

    expect(aiPhotos).toHaveLength(10);
    expect(aiVideos).toHaveLength(5);
    // 3 .eps + 3 companion .jpg = 6 files in AI_Vectors track!
    expect(aiVectors).toHaveLength(6);

    // Sequence collision verification: each track has independent counters 001..N
    const photoSequences = aiPhotos.map((i) => i.sequenceNumber);
    expect(photoSequences).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const videoSequences = aiVideos.map((i) => i.sequenceNumber);
    expect(videoSequences).toEqual([1, 2, 3, 4, 5]);

    // Vector Pairing Verification: EPS and companion JPG must have identical sequence numbers
    const timelineEps = aiVectors.find((i) => i.originalName === 'corporate_infographic_timeline.eps');
    const timelineJpg = aiVectors.find((i) => i.originalName === 'corporate_infographic_timeline.jpg');
    expect(timelineEps).toBeDefined();
    expect(timelineJpg).toBeDefined();
    expect(timelineEps?.sequenceNumber).toBe(timelineJpg?.sequenceNumber);
    expect(timelineEps?.sequenceNumber).toBe(1);

    const chartEps = aiVectors.find((i) => i.originalName === 'modern_finance_chart_diagram.eps');
    const chartJpg = aiVectors.find((i) => i.originalName === 'modern_finance_chart_diagram.jpg');
    expect(chartEps?.sequenceNumber).toBe(chartJpg?.sequenceNumber);
    expect(chartEps?.sequenceNumber).toBe(2);

    const meshEps = aiVectors.find((i) => i.originalName === 'technology_hexagon_pattern_mesh.eps');
    const meshJpg = aiVectors.find((i) => i.originalName === 'technology_hexagon_pattern_mesh.jpg');
    expect(meshEps?.sequenceNumber).toBe(meshJpg?.sequenceNumber);
    expect(meshEps?.sequenceNumber).toBe(3);

    // =========================================================================
    // STEP 2: METADATA STUDIO QUEUE INGESTION & DB STATE
    // =========================================================================
    // Filter valid segregated files for studio metadata processing
    const validCleanedFiles: File[] = segregatedItems
      .filter((i) => !i.needsFixing)
      .map((item) => new File([item.originalFile as any], item.newFilename, { type: (item.originalFile as any).type }));

    expect(validCleanedFiles).toHaveLength(21); // 10 photos + 5 videos + 6 vector files

    // Mock HTML5 Canvas and Video extraction for studio queue
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
    } as any);

    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,mockthumbdata');

    // Mock extractMediaInfo so video decoding and canvas rasterization run instantaneously in JSDOM
    vi.spyOn(mediaExtractorModule, 'extractMediaInfo').mockImplementation(async (file: File) => {
      const isVideo = file.name.endsWith('.mp4');
      const isVector = file.name.endsWith('.eps');
      return {
        mediaType: isVideo ? 'video' : isVector ? 'vector' : 'image',
        thumbnailBase64: 'mockthumbdata',
        thumbnailDataUrl: 'data:image/jpeg;base64,mockthumbdata',
        originalSizeBytes: file.size,
        compressedSizeBytes: 1024,
        videoDurationSeconds: isVideo ? 15 : undefined,
        videoResolution: isVideo ? '4K UHD' : undefined,
        hasAudio: false,
        width: 3840,
        height: 2160,
        hasRealPreview: true,
      };
    });

    // Enqueue valid files in Metadata Studio
    // 10 JPGs + 5 MP4s + 3 Vector assets (3 EPS + 3 companion JPGs linked, companion JPGs are not double-queued) = 18 unique queue items
    await queueService.addFiles(validCleanedFiles);
    const queueState = queueService.getState();
    expect(queueState.totalCount).toBe(18);

    // Verify all items are persisted to IndexedDB
    const persistedRecords = await db.masterRecords.toArray();
    expect(persistedRecords).toHaveLength(18);

    // Verify sequence preservation in filenames
    const dbFilenames = persistedRecords.map((r) => r.filename);
    expect(dbFilenames.some((fn) => fn.includes('B01_AI_PH_001_'))).toBe(true);
    expect(dbFilenames.some((fn) => fn.includes('B01_AI_VD_001_'))).toBe(true);
    expect(dbFilenames.some((fn) => fn.includes('B01_AI_VC_001_'))).toBe(true);

    // Verify natural alphanumeric sort order across the pipeline matching OS explorer
    const unifiedRows: UnifiedAssetItem[] = persistedRecords.map((r) => ({
      id: r.id,
      filename: r.filename,
      thumbnailUrl: '',
      status: 'queued' as const,
      createdAt: r.createdAt || Date.now(),
    }));
    const sorted = sortUnifiedAssets(unifiedRows);
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(
        sorted[i].filename.localeCompare(sorted[i + 1].filename, undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      ).toBeLessThanOrEqual(0);
    }

    // =========================================================================
    // STEP 3: VIDEO MUTER TRANSITION & 100% EXPORT PRESERVATION
    // =========================================================================
    const videoFiles = validCleanedFiles.filter((f) => f.name.endsWith('.mp4'));
    expect(videoFiles).toHaveLength(5);

    // Inspect videos
    const inspectionResults: VideoInspectionResult[] = [];
    for (const vFile of videoFiles) {
      const audioInfo = await inspectVideoAudioTrack(vFile);
      inspectionResults.push({
        id: vFile.name,
        file: vFile,
        originalName: vFile.name,
        size: vFile.size,
        hasAudio: audioInfo.hasAudio,
        audioTrackCount: audioInfo.audioTrackCount,
        videoTrackCount: audioInfo.videoTrackCount,
        status: audioInfo.hasAudio ? 'ready' : 'already_silent',
      });
    }

    expect(inspectionResults).toHaveLength(5);

    // Mock native desktop saveFiles
    const mockSavedNames: string[] = [];
    (window as any).electronAPI = {
      saveFiles: vi.fn().mockImplementation(async (files: Array<{ name: string; buffer: ArrayBuffer }>) => {
        files.forEach((f) => mockSavedNames.push(f.name));
        return { success: true, savedCount: files.length };
      }),
    };

    const saveResult = await saveMutedVideosToDirectory(inspectionResults, '_Muted_Videos');
    expect(saveResult.success).toBe(true);
    expect(saveResult.savedCount).toBe(5);

    // Ensure 100% export rule: output filenames strictly match input filenames
    expect(mockSavedNames).toEqual(videoFiles.map((f) => f.name));
  });
});
