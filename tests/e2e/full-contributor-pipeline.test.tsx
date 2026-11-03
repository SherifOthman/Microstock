import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { db } from '../../src/db';
import { BatchQueueService } from '../../src/services/queue/BatchQueueService';
import { useFileCleaner } from '../../src/features/cleaner/hooks/useFileCleaner';
import { useVideoMuter } from '../../src/features/video/hooks/useVideoMuter';
import { useEpsConverter } from '../../src/features/eps/hooks/useEpsConverter';
import { useCsvExport } from '../../src/hooks/useCsvExport';
import * as epsEngine from '../../src/services/eps/epsEngine';
import * as videoMuterEngine from '../../src/services/video/videoMuterEngine';
import * as mediaExtractor from '../../src/utils/mediaExtractor';

describe('Tier 3 E2E: Seamless Microstock Contributor Pipeline & 3,000-File Chaos Stress Suite', () => {
  let queueService: BatchQueueService;

  beforeEach(async () => {
    await db.masterRecords.clear();
    await db.apiKeys.clear();
    await db.batches.clear();
    queueService = BatchQueueService.getInstance();
    queueService.clear();
    vi.restoreAllMocks();

    vi.spyOn(mediaExtractor, 'extractMediaInfo').mockImplementation(async (file: File) => {
      if (!file || file.size === 0) {
        throw new Error(`Media file "${file?.name || 'unknown'}" is corrupted or empty (0 bytes)`);
      }
      const mediaType = mediaExtractor.getMediaTypeFromFilename(file.name, file);
      return {
        mediaType,
        thumbnailBase64: 'mockBase64Thumb',
        thumbnailDataUrl: 'data:image/jpeg;base64,mockBase64Thumb',
        originalSizeBytes: file.size,
        compressedSizeBytes: 1024,
        width: 3840,
        height: 2160,
        hasRealPreview: true,
      };
    });
  });

  afterEach(async () => {
    await db.masterRecords.clear();
    queueService.clear();
    vi.restoreAllMocks();
  });

  it('Pipeline E2E 1: File Cleaner -> 1-Click Handoff -> Metadata Studio Queue with Vector & Photo Classification', async () => {
    const handedOffFiles: File[] = [];
    const onSendToStudio = vi.fn(async (files: File[]) => {
      handedOffFiles.push(...files);
      await queueService.addFiles(files);
    });

    const { result } = renderHook(() => useFileCleaner('en', onSendToStudio));

    const rawPhoto = new File(['photo-bytes'], 'Sunset Beach Vacation (1) [Upscaled].jpg', {
      type: 'image/jpeg',
    });
    const rawVector = new File(['%!PS-Adobe-3.0 EPSF-3.0'], 'Corporate_Infographic_2026!.eps', {
      type: 'application/postscript',
    });

    act(() => {
      result.current.handleAddFiles([rawPhoto, rawVector]);
    });

    expect(result.current.cleanedItems).toHaveLength(2);

    // User clicks 1-click "Send to Metadata Studio" directly from Cleaner
    await act(async () => {
      result.current.handleSendToStudio();
    });

    expect(onSendToStudio).toHaveBeenCalledTimes(1);
    expect(handedOffFiles).toHaveLength(2);

    // Verify BatchQueueService ingested both files with sanitized sequential names and accurate mediaType
    const state = queueService.getState();
    expect(state.totalCount).toBe(2);

    const dbRecords = await db.masterRecords.toArray();
    expect(dbRecords).toHaveLength(2);
    const vectorRec = dbRecords.find((r) => r.filename.endsWith('.eps'));
    const photoRec = dbRecords.find((r) => r.filename.endsWith('.jpg'));
    expect(vectorRec?.mediaType).toBe('vector');
    expect(photoRec?.mediaType).toBe('image');
  });

  it('Pipeline E2E 2: Video Muter -> Lossless Audio Strip -> 1-Click Handoff -> Metadata Studio Queue', async () => {
    vi.spyOn(videoMuterEngine, 'inspectVideoAudioTrack').mockResolvedValue({
      hasAudio: true,
      audioTrackCount: 1,
      videoTrackCount: 1,
    });
    vi.spyOn(videoMuterEngine, 'stripAudioTrackLossless').mockImplementation(async () => {
      return new Blob(['silent-mp4-binary-stream'], { type: 'video/mp4' });
    });

    const onSendToStudio = vi.fn(async (files: File[]) => {
      await queueService.addFiles(files);
    });

    const { result } = renderHook(() => useVideoMuter('en', onSendToStudio));

    const clip1 = new File(['raw-video-with-audio-1'], 'B01_NT_VD_001.mp4', { type: 'video/mp4' });
    const clip2 = new File(['raw-video-with-audio-2'], 'B01_NT_VD_002.mov', { type: 'video/quicktime' });

    await act(async () => {
      await result.current.handleAddFiles([clip1, clip2]);
    });

    expect(result.current.items).toHaveLength(2);

    // Mute all videos
    await act(async () => {
      await result.current.handleMuteAll();
    });

    expect(result.current.items.every((i) => i.status === 'completed' && i.hasAudio === false)).toBe(true);

    // Click 1-click "Send to Metadata Studio"
    await act(async () => {
      result.current.handleSendToStudio();
    });

    expect(onSendToStudio).toHaveBeenCalledTimes(1);
    const sentFiles = onSendToStudio.mock.calls[0][0] as File[];
    expect(sentFiles).toHaveLength(2);
    // Exact original filenames strictly preserved
    expect(sentFiles.map((f) => f.name)).toEqual(['B01_NT_VD_001.mp4', 'B01_NT_VD_002.mov']);

    const dbRecords = await db.masterRecords.toArray();
    expect(dbRecords).toHaveLength(2);
    expect(dbRecords.every((r) => r.mediaType === 'video')).toBe(true);
  });

  it('Pipeline E2E 3: EPS Converter -> Studio Handoff -> Warn-on-Incomplete Gate -> Completed-Only Native Folder CSV Save', async () => {
    vi.spyOn(epsEngine, 'rasterizeEpsFile').mockImplementation(async () => ({
      width: 4000,
      height: 4000,
      dataUrl: 'data:image/jpeg;base64,mockJpg',
      objectUrl: 'blob:mock-eps-jpg',
      blob: new Blob(['rendered-300dpi-jpg'], { type: 'image/jpeg' }),
      sourceTier: 'vector',
      pathOpCount: 250,
    }));

    const onSendToStudio = vi.fn(async (files: File[]) => {
      await queueService.addFiles(files);
    });

    const { result: epsHook } = renderHook(() => useEpsConverter('en', onSendToStudio));

    const eps1 = new File(['%!PS-Adobe-3.0'], 'B01_NT_VC_001.eps', { type: 'application/postscript' });
    const eps2 = new File(['%!PS-Adobe-3.0'], 'B01_NT_VC_002.eps', { type: 'application/postscript' });

    act(() => {
      epsHook.current.handleAddFiles([eps1, eps2]);
    });

    await act(async () => {
      await epsHook.current.handleConvertAll();
    });

    expect(epsHook.current.completedCount).toBe(2);

    // Handoff rendered JPGs to Metadata Studio
    await act(async () => {
      epsHook.current.handleSendToStudio();
    });

    // Verify both arrived in Studio DB as 'vector' with canonical .eps filenames and pre-rendered preview data!
    let studioRecords = await db.masterRecords.toArray();
    expect(studioRecords).toHaveLength(2);
    expect(studioRecords[0].filename).toBe('B01_NT_VC_001.eps');
    expect(studioRecords[0].mediaType).toBe('vector');
    expect(studioRecords[1].filename).toBe('B01_NT_VC_002.eps');
    expect(studioRecords[1].mediaType).toBe('vector');

    // Simulate AI completing asset 1 while asset 2 remains 'pending'
    await db.masterRecords.update(studioRecords[0].id, {
      status: 'completed',
      baseTitle: 'Isometric Cloud Computing Server Network Vector Illustration',
      detailedDescription: 'Modern isometric vector graphic of cloud data center infrastructure.',
      rankedKeywords: ['cloud', 'server', 'isometric', 'vector', 'network', 'technology', 'data', 'illustration'],
    });

    studioRecords = await db.masterRecords.toArray();

    const savedFilesCapture: Array<{ name: string; data: string }> = [];
    (window as any).electronAPI = {
      saveFiles: vi.fn().mockImplementation(async (files: Array<{ name: string; buffer: ArrayBuffer }>) => {
        for (const f of files) {
          savedFilesCapture.push({
            name: f.name,
            data: new TextDecoder().decode(f.buffer),
          });
        }
        return { success: true, savedCount: files.length };
      }),
    };

    const { result: exportHook } = renderHook(() =>
      useCsvExport(studioRecords, ['adobe', 'shutterstock'], false, () => ({}))
    );

    // User clicks "Save CSVs to Folder" while 1 of 2 assets is still pending
    act(() => {
      exportHook.current.handleSaveToFolderWithCheck(2, 1);
    });

    // Warn-on-incomplete dialog must intercept!
    expect(exportHook.current.incompleteExportDialog).not.toBeNull();
    expect(exportHook.current.incompleteExportDialog?.completedCount).toBe(1);
    expect(exportHook.current.incompleteExportDialog?.incompleteCount).toBe(1);

    // User confirms proceeding with the 1 completed asset
    await act(async () => {
      await exportHook.current.incompleteExportDialog?.onProceed();
    });

    expect(savedFilesCapture).toHaveLength(2); // Adobe CSV + Shutterstock CSV
    const adobeCsv = savedFilesCapture.find((f) => f.name.includes('adobe'))!.data;
    const shutterCsv = savedFilesCapture.find((f) => f.name.includes('shutterstock'))!.data;

    // Only completed B01_NT_VC_001.eps is in the CSV; pending B01_NT_VC_002.eps is strictly excluded!
    expect(adobeCsv).toContain('B01_NT_VC_001.eps');
    expect(adobeCsv).not.toContain('B01_NT_VC_002');
    expect(adobeCsv).toContain(',8,'); // Vector default Category 8

    expect(shutterCsv).toContain('B01_NT_VC_001.eps');
    expect(shutterCsv).not.toContain('B01_NT_VC_002');
    expect(shutterCsv).toContain(',yes'); // Vector illustration = yes
  });

  it('Chaos Stress E2E 4: Dropping 3,000 Mixed/Unsupported/Corrupt Files at Once Filters Cleanly Without Deadlocks', async () => {
    const massiveDrop: File[] = [];

    // 1,000 Unsupported OS/junk/document files (.DS_Store, thumbs.db, .exe, .pdf, .zip)
    for (let i = 0; i < 1000; i++) {
      const ext = i % 4 === 0 ? '.DS_Store' : i % 4 === 1 ? 'thumbs.db' : i % 4 === 2 ? `doc_${i}.pdf` : `app_${i}.exe`;
      massiveDrop.push(new File(['junk'], ext));
    }

    // 2,000 Supported stock files (mix of valid photos, vectors, and 50 corrupt 0-byte files)
    for (let i = 0; i < 2000; i++) {
      if (i < 50) {
        massiveDrop.push(new File([], `corrupt_${i}.jpg`, { type: 'image/jpeg' }));
      } else {
        massiveDrop.push(new File(['valid'], `stock_asset_${i}.jpg`, { type: 'image/jpeg' }));
      }
    }

    expect(massiveDrop).toHaveLength(3000);

    await queueService.addFiles(massiveDrop);

    const state = queueService.getState();
    // 1,000 unsupported files filtered out immediately; 2,000 stock media files ingested
    expect(state.totalCount).toBe(2000);
    expect(state.failedCount).toBe(50); // 50 corrupt 0-byte files marked as error without blocking the 1,950 valid files
    const readyItems = state.items.filter((item) => item.status === 'ready');
    expect(readyItems).toHaveLength(1950);
  });
});
