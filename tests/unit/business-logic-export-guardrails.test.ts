import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  filterCompletedExportRecords,
  generatePlatformCsv,
  exportAllCsvsToDirectory,
  downloadAllCsvsAsZip,
} from '../../src/services/export/csvExporter';
import { useCsvExport } from '../../src/hooks/useCsvExport';
import { getMediaTypeFromFilename, extractMediaInfo } from '../../src/utils/mediaExtractor';
import { buildRenamedFilesFromCleanedItems } from '../../src/features/cleaner/hooks/useFileCleaner';
import { BatchQueueService } from '../../src/services/queue/BatchQueueService';
import { MasterMetadataRecord, SupportedPlatform } from '../../src/types';

describe('Tier 1: Microstock Business Logic & Export Guardrails', () => {
  const completedPhotoRecord: MasterMetadataRecord = {
    id: 'comp-1',
    batchId: 'batch-1',
    filename: 'B01_NT_PH_001.jpg',
    mediaType: 'image',
    thumbnailBase64: 'mock',
    isAiGenerated: true,
    baseTitle: 'Aerial View of Solar Energy Farm in Desert Landscape',
    detailedDescription:
      'High resolution aerial drone shot of photovoltaic solar panels generating clean renewable electricity in arid desert.',
    rankedKeywords: [
      'solar',
      'energy',
      'renewable',
      'photovoltaic',
      'desert',
      'aerial',
      'power',
      'sustainable',
      'electricity',
      'green',
    ],
    categories: {
      adobeCategoryId: 19,
      shutterstockCategories: ['Technology', 'Nature'],
      dreamstimeCategory1: 105,
    },
    status: 'completed',
    createdAt: 1000,
  };

  const completedVectorRecord: MasterMetadataRecord = {
    id: 'comp-2',
    batchId: 'batch-1',
    filename: 'B01_NT_VC_001.jpg',
    mediaType: 'vector',
    thumbnailBase64: 'mock',
    isAiGenerated: false,
    baseTitle: 'Minimalist Geometric Startup Logo Vector Template',
    detailedDescription:
      'Clean scalable vector illustration of modern geometric brand identity emblem on white background.',
    rankedKeywords: ['vector', 'logo', 'geometric', 'brand', 'minimalist', 'template', 'design', 'icon', 'symbol', 'emblem'],
    status: 'completed',
    createdAt: 2000,
  };

  const pendingDraftRecord: MasterMetadataRecord = {
    id: 'pend-1',
    batchId: 'batch-1',
    filename: 'B01_NT_PH_002.jpg',
    mediaType: 'image',
    thumbnailBase64: 'mock',
    isAiGenerated: true,
    baseTitle: '',
    detailedDescription: '',
    rankedKeywords: [],
    status: 'pending',
    createdAt: 3000,
  };

  const processingRecord: MasterMetadataRecord = {
    id: 'proc-1',
    batchId: 'batch-1',
    filename: 'B01_NT_PH_003.jpg',
    mediaType: 'image',
    thumbnailBase64: 'mock',
    isAiGenerated: true,
    baseTitle: 'Partial Processing Title',
    detailedDescription: 'Partial description.',
    rankedKeywords: ['partial'],
    status: 'processing',
    createdAt: 4000,
  };

  const failedErrorRecord: MasterMetadataRecord = {
    id: 'err-1',
    batchId: 'batch-1',
    filename: 'B01_NT_PH_004.jpg',
    mediaType: 'image',
    thumbnailBase64: 'mock',
    isAiGenerated: true,
    baseTitle: '',
    detailedDescription: '',
    rankedKeywords: [],
    status: 'error',
    errorMessage: 'API key quota exceeded',
    createdAt: 5000,
  };

  const mixedBatch: MasterMetadataRecord[] = [
    completedPhotoRecord,
    pendingDraftRecord,
    completedVectorRecord,
    processingRecord,
    failedErrorRecord,
  ];

  describe('Strict Completed-Only CSV Filtering (Zero Blank Agency Rows)', () => {
    it('filterCompletedExportRecords excludes pending, processing, error, failed, and blank records', () => {
      const blankCompleted: MasterMetadataRecord = {
        ...completedPhotoRecord,
        id: 'blank-1',
        baseTitle: '   ',
        rankedKeywords: [],
        status: 'completed',
      };

      const filtered = filterCompletedExportRecords([...mixedBatch, blankCompleted]);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((r) => r.id)).toEqual(['comp-1', 'comp-2']);
    });

    it('strictly excludes pending and failed records across all 6 agency CSV generators', () => {
      const platforms: SupportedPlatform[] = [
        'adobe',
        'shutterstock',
        'freepik',
        'vecteezy',
        'dreamstime',
        '123rf',
      ];

      for (const pid of platforms) {
        const res = generatePlatformCsv(pid, mixedBatch, 'batch_test');
        expect(res.rowCount).toBe(2);
        if (pid === 'vecteezy') {
          expect(res.csvString).toContain('B01NTPH001.jpg');
          expect(res.csvString).toContain('B01NTVC001,');
          expect(res.csvString).not.toContain('B01NTPH002.jpg');
          expect(res.csvString).not.toContain('B01NTPH003.jpg');
          expect(res.csvString).not.toContain('B01NTPH004.jpg');
        } else if (pid === 'adobe' || pid === 'shutterstock') {
          expect(res.csvString).toContain('B01_NT_PH_001.jpg');
          expect(res.csvString).toContain('B01_NT_VC_001.eps');
          expect(res.csvString).not.toContain('B01_NT_PH_002.jpg');
          expect(res.csvString).not.toContain('B01_NT_PH_003.jpg');
          expect(res.csvString).not.toContain('B01_NT_PH_004.jpg');
        } else {
          expect(res.csvString).toContain('B01_NT_PH_001.jpg');
          expect(res.csvString).toContain('B01_NT_VC_001.jpg');
          expect(res.csvString).not.toContain('B01_NT_PH_002.jpg');
          expect(res.csvString).not.toContain('B01_NT_PH_003.jpg');
          expect(res.csvString).not.toContain('B01_NT_PH_004.jpg');
        }
      }
    });

    it('returns 0 rows and empty csvString when batch contains only pending and failed records', () => {
      const res = generatePlatformCsv('adobe', [pendingDraftRecord, failedErrorRecord], 'batch_empty');
      expect(res.rowCount).toBe(0);
      expect(res.csvString).toBe('');
    });
  });

  describe('Vector Origin Preservation (EPS Preview JPG -> Metadata Studio -> Agency CSVs)', () => {
    it('preserves mediaType: vector when EPS preview JPG is tagged with __sourceMediaType = vector', () => {
      const jpgPreviewFile = new File(['mock-jpg-bytes'], 'company_logo.jpg', { type: 'image/jpeg' });
      Object.defineProperty(jpgPreviewFile, '__sourceMediaType', {
        value: 'vector',
        enumerable: false,
        configurable: true,
      });

      expect(getMediaTypeFromFilename(jpgPreviewFile.name, jpgPreviewFile)).toBe('vector');
    });

    it('sets Shutterstock illustration = "yes" and Adobe Stock Category = 8 for EPS-originated JPG previews', () => {
      const shutterRes = generatePlatformCsv('shutterstock', [completedVectorRecord], 'vec_batch');
      expect(shutterRes.csvString).toContain(',yes');

      const adobeRes = generatePlatformCsv('adobe', [completedVectorRecord], 'vec_batch');
      expect(adobeRes.csvString).toContain(',8,');
    });

    it('buildRenamedFilesFromCleanedItems attaches __sourceMediaType = vector for Vectors subfolder items', () => {
      const rawEps = new File(['%!PS-Adobe-3.0 EPSF-3.0'], 'dirty_vector_name (1).eps', {
        type: 'application/postscript',
      });
      const renamedFiles = buildRenamedFilesFromCleanedItems([
        {
          id: 'item-1',
          file: rawEps,
          originalName: 'dirty_vector_name (1).eps',
          cleanedName: 'B01_NT_VC_001.eps',
          extension: 'eps',
          size: rawEps.size,
          charCount: 17,
          status: 'cleaned',
          subFolder: 'Vectors',
          batchFolder: 'Batch_01',
          sequenceNumber: 1,
          fuzzyKey: 'dirtyvectorname',
          isDuplicate: false,
          duplicateCount: 1,
        },
      ]);

      expect(renamedFiles).toHaveLength(1);
      expect(renamedFiles[0].name).toBe('B01_NT_VC_001.eps');
      expect((renamedFiles[0] as any).__sourceMediaType).toBe('vector');
    });
  });

  describe('useCsvExport Completeness Gate, Warn-on-Incomplete Dialog & Native Folder Save', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('opens incompleteExportDialog when batch has pending/failed items and only exports after onProceed()', async () => {
      (window as any).electronAPI = {
        saveFiles: vi.fn().mockResolvedValue({ success: true, savedCount: 2 }),
      };

      const { result } = renderHook(() =>
        useCsvExport(mixedBatch, ['adobe', 'shutterstock'], false, () => ({}))
      );

      expect(result.current.completedRecordsCount).toBe(2);
      expect(result.current.incompleteRecordsCount).toBe(3);

      // Trigger Native Folder Save with completeness check
      act(() => {
        result.current.handleSaveToFolderWithCheck(mixedBatch.length, 2);
      });

      // Must pause and present the Incomplete Batch Warning Dialog first!
      expect(result.current.incompleteExportDialog).not.toBeNull();
      expect(result.current.incompleteExportDialog?.completedCount).toBe(2);
      expect(result.current.incompleteExportDialog?.incompleteCount).toBe(3);
      expect((window as any).electronAPI.saveFiles).not.toHaveBeenCalled();

      // Now user confirms "Export Only Completed (2)"
      await act(async () => {
        await result.current.incompleteExportDialog?.onProceed();
      });

      expect(result.current.incompleteExportDialog).toBeNull();
      expect((window as any).electronAPI.saveFiles).toHaveBeenCalledTimes(1);
      expect(result.current.folderSaveSuccess).toContain('Saved 2 agency CSV file(s)');
    });

    it('blocks export with noticeDialog when 0 completed assets exist or queue is actively running', () => {
      const { result: emptyResult } = renderHook(() =>
        useCsvExport([pendingDraftRecord, failedErrorRecord], ['adobe'], false, () => ({}))
      );

      act(() => {
        emptyResult.current.handleExportZipWithCheck(2, 0);
      });

      expect(emptyResult.current.noticeDialog?.title).toBe('No Completed Assets Ready');

      const { result: runningResult } = renderHook(() =>
        useCsvExport([completedPhotoRecord], ['adobe'], true, () => ({}))
      );

      act(() => {
        runningResult.current.handleSingleExportWithCheck('adobe', 1, 1);
      });

      expect(runningResult.current.noticeDialog?.title).toBe('Export Blocked While Generating');
    });
  });

  describe('Supported Stock Media File Filtering (OS Junk & Non-Media Rejection)', () => {
    it('rejects .DS_Store, thumbs.db, desktop.ini, ._ resource forks, .exe, .pdf, .zip, and .csv', () => {
      const junkFiles = [
        new File(['junk'], '.DS_Store'),
        new File(['junk'], 'Thumbs.db'),
        new File(['junk'], 'desktop.ini'),
        new File(['junk'], '._photo_01.jpg'),
        new File(['junk'], 'malware.exe', { type: 'application/x-msdownload' }),
        new File(['junk'], 'contract.pdf', { type: 'application/pdf' }),
        new File(['junk'], 'archive.zip', { type: 'application/zip' }),
        new File(['junk'], 'metadata.csv', { type: 'text/csv' }),
      ];

      for (const f of junkFiles) {
        expect(BatchQueueService.isSupportedStockMediaFile(f)).toBe(false);
      }

      const validFiles = [
        new File(['img'], 'photo.jpg', { type: 'image/jpeg' }),
        new File(['img'], 'transparent.png', { type: 'image/png' }),
        new File(['vid'], 'clip.mp4', { type: 'video/mp4' }),
        new File(['vid'], 'cinema.mov', { type: 'video/quicktime' }),
        new File(['vec'], 'artwork.eps', { type: 'application/postscript' }),
        new File(['vec'], 'source.ai', { type: 'application/postscript' }),
        new File(['vec'], 'icon.svg', { type: 'image/svg+xml' }),
      ];

      for (const f of validFiles) {
        expect(BatchQueueService.isSupportedStockMediaFile(f)).toBe(true);
      }
    });
  });
});
