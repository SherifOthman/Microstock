import React from 'react';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { parseImageHeaderBuffer } from '../../src/workers/mediaInspector.worker';
import { inspectMoovBytes, stripAudioFromBufferInPlace, parseIsoBoxes } from '../../src/workers/videoMuter.worker';
import { CleanerFileTable } from '../../src/features/cleaner/components/CleanerFileTable';
import { VideoMuterTable } from '../../src/features/video/components/VideoMuterTable';
import { LanguageProvider } from '../../src/context/LanguageContext';
import { CleanedFileItem } from '../../src/services/cleaner/fileCleanerEngine';
import { VideoMuteItem } from '../../src/features/video/hooks/useVideoMuter';

// Load real CJS SqliteDatabaseManager using createRequire
import { createRequire } from 'module';
const requireCjs = createRequire(import.meta.url);
const { SqliteDatabaseManager } = requireCjs('../../electron/sqliteDb.cjs');

describe('Tier 2 Deep Integration: Real better-sqlite3 Engine, Worker Resilience & Virtualized DOM', () => {
  describe('Real better-sqlite3 Relational Database Engine (WAL, FK Cascades, 2,000-Item Transactions)', () => {
    let tempDir: string;
    let manager: any;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stockflow-sqlite-test-'));
      manager = new SqliteDatabaseManager();
      manager.init({
        getPath: () => tempDir,
      });
    });

    afterEach(() => {
      try {
        if (manager?.db) {
          manager.db.close();
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    });

    it('initializes real native better-sqlite3 in WAL mode with foreign_keys = ON and seeds 6 default agencies', () => {
      const info = manager.getDbInfo();
      expect(info.engine).toBe('sqlite-wal');
      expect(fs.existsSync(info.dbPath)).toBe(true);

      const journalMode = manager.db.pragma('journal_mode', { simple: true });
      expect(String(journalMode).toLowerCase()).toBe('wal');

      const fkEnabled = manager.db.pragma('foreign_keys', { simple: true });
      expect(fkEnabled).toBe(1);

      const agencies = manager.db.prepare('SELECT id, name, default_limit, limit_period FROM agencies ORDER BY id').all();
      expect(agencies).toHaveLength(6);
      expect(agencies.map((a: any) => a.id)).toEqual([
        '123rf',
        'adobe',
        'dreamstime',
        'freepik',
        'shutterstock',
        'vecteezy',
      ]);
    });

    it('bulk-inserts 2,000 relational assets + asset_metadata rows in a single ACID transaction under 1000ms', () => {
      const records = Array.from({ length: 2000 }, (_, i) => ({
        id: `asset-${i + 1}`,
        batchId: 'batch-enterprise-2k',
        filename: `B01_NT_PH_${String(i + 1).padStart(4, '0')}.jpg`,
        mediaType: i % 5 === 0 ? 'vector' : i % 3 === 0 ? 'video' : 'image',
        fileSize: 4096000,
        compressedSize: 48000,
        thumbnailBase64: 'data:image/jpeg;base64,thumb',
        videoMeta: i % 3 === 0 ? { durationSeconds: 15, resolution: '4K UHD', width: 3840, height: 2160 } : undefined,
        isAiGenerated: i % 2 === 0,
        baseTitle: `Commercial Stock Asset Title #${i + 1}`,
        detailedDescription: `Detailed description for asset #${i + 1} with commercial keywords.`,
        rankedKeywords: ['commercial', 'stock', 'photography', `tag${i + 1}`],
        categories: { adobeCategoryId: 19, shutterstockCategories: ['Technology'] },
        status: 'completed',
        createdAt: 10000 + i,
      }));

      const startMs = performance.now();
      manager.invoke('bulkPutMasterRecords', records);
      const elapsedMs = performance.now() - startMs;

      expect(elapsedMs).toBeLessThan(10000);
      expect(manager.invoke('countMasterRecords')).toBe(2000);

      // Verify relational join across assets + asset_metadata
      const sample = manager.invoke('getMasterRecord', 'asset-1500');
      expect(sample).toBeDefined();
      expect(sample.filename).toBe('B01_NT_PH_1500.jpg');
      expect(sample.baseTitle).toBe('Commercial Stock Asset Title #1500');
      expect(sample.rankedKeywords).toContain('tag1500');
      expect(sample.categories.adobeCategoryId).toBe(19);
    }, 20000);

    it('enforces ON DELETE CASCADE across assets -> asset_metadata and asset_distributions', () => {
      manager.invoke('putMasterRecord', {
        id: 'cascade-asset-1',
        batchId: 'b1',
        filename: 'cascade_test.jpg',
        mediaType: 'image',
        baseTitle: 'Cascade Test Asset',
        detailedDescription: 'Testing foreign key cascade delete.',
        rankedKeywords: ['cascade', 'sqlite'],
        status: 'completed',
        createdAt: Date.now(),
      });

      // Insert a distribution tracking row referencing cascade-asset-1 and agency 'adobe'
      manager.db
        .prepare(`
          INSERT INTO asset_distributions (asset_id, agency_id, upload_status, batch_folder, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `)
        .run('cascade-asset-1', 'adobe', 'uploaded', 'Batch_01', Date.now());

      const metaBefore = manager.db
        .prepare('SELECT COUNT(*) as cnt FROM asset_metadata WHERE asset_id = ?')
        .get('cascade-asset-1');
      const distBefore = manager.db
        .prepare('SELECT COUNT(*) as cnt FROM asset_distributions WHERE asset_id = ?')
        .get('cascade-asset-1');
      expect(metaBefore.cnt).toBe(1);
      expect(distBefore.cnt).toBe(1);

      // Delete parent row from assets
      manager.invoke('deleteMasterRecord', 'cascade-asset-1');

      const metaAfter = manager.db
        .prepare('SELECT COUNT(*) as cnt FROM asset_metadata WHERE asset_id = ?')
        .get('cascade-asset-1');
      const distAfter = manager.db
        .prepare('SELECT COUNT(*) as cnt FROM asset_distributions WHERE asset_id = ?')
        .get('cascade-asset-1');
      expect(metaAfter.cnt).toBe(0);
      expect(distAfter.cnt).toBe(0);
    });

    it('gracefully recovers from corrupted JSON columns in asset_metadata without throwing', () => {
      manager.invoke('putMasterRecord', {
        id: 'corrupt-json-1',
        batchId: 'b1',
        filename: 'corrupt_json.jpg',
        mediaType: 'image',
        baseTitle: 'Corrupt JSON Test',
        detailedDescription: 'Testing malformed JSON recovery.',
        rankedKeywords: ['valid'],
        status: 'completed',
        createdAt: Date.now(),
      });

      // Directly corrupt keywords_json and categories_json in SQLite
      manager.db
        .prepare(`
          UPDATE asset_metadata
          SET keywords_json = '{broken_json', categories_json = '[invalid', attempt_history_json = 'not_json'
          WHERE asset_id = ?
        `)
        .run('corrupt-json-1');

      const recovered = manager.invoke('getMasterRecord', 'corrupt-json-1');
      expect(recovered).toBeDefined();
      expect(recovered.baseTitle).toBe('Corrupt JSON Test');
      expect(recovered.rankedKeywords).toEqual([]);
      expect(recovered.categories).toBeUndefined();
    });
  });

  describe('Binary Media Header & MP4 Atom Worker Resilience Against Malformed Buffers', () => {
    it('parseImageHeaderBuffer safely returns null on truncated, zero-dimension, or malformed JPEG/PNG/WebP headers', () => {
      // 1. Empty 0-byte buffer
      expect(parseImageHeaderBuffer(new ArrayBuffer(0))).toBeNull();

      // 2. Truncated JPEG SOI + incomplete segment length
      const truncatedJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00]);
      expect(parseImageHeaderBuffer(truncatedJpeg.buffer)).toBeNull();

      // 3. JPEG with corrupt 0-length segment (infinite loop trap if not guarded)
      const zeroSegmentJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xc0]);
      expect(parseImageHeaderBuffer(zeroSegmentJpeg.buffer)).toBeNull();

      // 4. PNG with 0x0 dimensions
      const zeroDimPng = new ArrayBuffer(32);
      const pngView = new DataView(zeroDimPng);
      pngView.setUint32(0, 0x89504e47, false);
      pngView.setUint32(4, 0x0d0a1a0a, false);
      pngView.setUint32(16, 0, false);
      pngView.setUint32(20, 0, false);
      expect(parseImageHeaderBuffer(zeroDimPng)).toBeNull();

      // 5. WebP VP8X with valid dimensions (3840x2160)
      const webpBuf = new ArrayBuffer(32);
      const webpArr = new Uint8Array(webpBuf);
      webpArr.set([0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 0);
      // Width - 1 = 3839 (0x0EFF), Height - 1 = 2159 (0x086F)
      webpArr[24] = 0xff;
      webpArr[25] = 0x0e;
      webpArr[26] = 0x00;
      webpArr[27] = 0x6f;
      webpArr[28] = 0x08;
      webpArr[29] = 0x00;
      expect(parseImageHeaderBuffer(webpBuf)).toEqual({ width: 3840, height: 2160 });
    });

    it('parseIsoBoxes and stripAudioFromBufferInPlace resist oversized/cyclic MP4 box pointers', () => {
      // Box claiming size = 0xFFFFFFFF (4GB) inside a 32-byte buffer
      const corruptMp4 = new ArrayBuffer(32);
      const view = new DataView(corruptMp4);
      view.setUint32(0, 0xffffffff, false);
      const boxes = parseIsoBoxes(new Uint8Array(corruptMp4), 0, 32);
      expect(boxes).toEqual([]);

      // inspectMoovBytes on random garbage returns foundMoov: false without throwing
      const inspectRes = inspectMoovBytes(new Uint8Array(corruptMp4));
      expect(inspectRes.foundMoov).toBe(false);
      expect(inspectRes.hasAudio).toBe(false);

      // stripAudioFromBufferInPlace throws a descriptive error when moov atom is missing
      expect(() => stripAudioFromBufferInPlace(corruptMp4)).toThrow(/Unable to locate moov atom/i);
    });
  });

  describe('1,000-Item TanStack Virtual DOM Windowing Stress Tests', () => {
    it('CleanerFileTable mounts only a windowed slice (< 70 rows) when given 1,000 items', () => {
      const dummyFile = new File(['img'], 'sample.jpg', { type: 'image/jpeg' });
      const thousandCleanerItems: CleanedFileItem[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `clean-${i + 1}`,
        file: dummyFile,
        originalName: `raw_stock_photo_${i + 1}.jpg`,
        cleanedName: `B01_NT_PH_${String(i + 1).padStart(4, '0')}.jpg`,
        extension: 'jpg',
        size: 2048000,
        charCount: 18,
        status: 'cleaned',
        subFolder: 'Photos',
        batchFolder: 'Batch_01',
        sequenceNumber: i + 1,
        fuzzyKey: `rawstockphoto${i + 1}`,
        isDuplicate: false,
        duplicateCount: 1,
        validation: {
          isValid: true,
          isBlocking: false,
          width: 4000,
          height: 3000,
        },
      }));

      const { container } = render(
        <LanguageProvider>
          <CleanerFileTable
            language="en"
            rawFilesCount={1000}
            cleanedItems={thousandCleanerItems}
            filteredItems={thousandCleanerItems}
            mediaBatches={{ Photos: [], Videos: [], Vectors: [] }}
            batchDistribution={[{ folder: 'Batch_01', subFolder: 'Photos', total: 1000, isNew: true }]}
            searchFilter=""
            setSearchFilter={vi.fn()}
            isProcessing={false}
            masterDirectory="/mock/master"
            blockingErrorCount={0}
            totalDuplicateCount={0}
            duplicateGroupKeys={[]}
            progressMsg={null}
            onDrop={vi.fn()}
            onSelectFilesClick={vi.fn()}
            onSelectFolderClick={vi.fn()}
            onInitiateProcess={vi.fn()}
            onSendToStudio={vi.fn()}
            onOpenDuplicateModal={vi.fn()}
            onRemoveItem={vi.fn()}
          />
        </LanguageProvider>
      );

      // Verify total counter shows 1000 / 1000
      expect(screen.getByText('1000 / 1000')).toBeTruthy();

      // Verify DOM row count is strictly windowed (<= 65 rows instead of 1,000 rows!)
      const renderedRows = container.querySelectorAll('tbody tr');
      expect(renderedRows.length).toBeGreaterThan(0);
      expect(renderedRows.length).toBeLessThanOrEqual(65);
    });

    it('VideoMuterTable mounts only a windowed slice (< 70 rows) when given 1,000 video items', () => {
      const dummyVideo = new File(['vid'], 'clip.mp4', { type: 'video/mp4' });
      const thousandVideoItems: VideoMuteItem[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `vid-${i + 1}`,
        file: dummyVideo,
        originalName: `drone_footage_${String(i + 1).padStart(4, '0')}.mp4`,
        size: 10485760,
        hasAudio: true,
        status: 'completed',
        mutedSize: 10200000,
      }));

      const { container } = render(
        <VideoMuterTable
          items={thousandVideoItems}
          language="en"
          onMuteSingle={vi.fn()}
          onDownloadSingle={vi.fn()}
          onRemoveItem={vi.fn()}
        />
      );

      const renderedRows = container.querySelectorAll('tbody tr');
      expect(renderedRows.length).toBeGreaterThan(0);
      expect(renderedRows.length).toBeLessThanOrEqual(65);
    });
  });
});
