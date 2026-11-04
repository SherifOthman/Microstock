import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { SqliteDatabaseManager } = require('../../electron/sqliteDb.cjs');

describe('Microstock Distribution Tracker (Master Brain) & Event-Driven Hot Backups', () => {
  let tempDir: string;
  let sourceDir: string;
  let dbManager: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stockflow-tracker-test-'));
    sourceDir = path.join(tempDir, 'User_Source_Folder');
    fs.mkdirSync(sourceDir, { recursive: true });
    dbManager = new SqliteDatabaseManager(tempDir);
    dbManager.init(tempDir);
  });

  afterEach(() => {
    if (dbManager) {
      dbManager.close();
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('1. provisions future-proof SQLite schema with all 5 tables and nullable future columns', () => {
    const tables = dbManager.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);

    expect(tables).toContain('assets');
    expect(tables).toContain('agency_tracking');
    expect(tables).toContain('rejection_dictionary');
    expect(tables).toContain('export_baskets');
    expect(tables).toContain('backup_logs');

    // Verify future-proof columns on agency_tracking
    const trackingCols = dbManager.db
      .prepare('PRAGMA table_info(agency_tracking)')
      .all()
      .map((c: any) => c.name);

    expect(trackingCols).toEqual(
      expect.arrayContaining([
        'asset_id',
        'agency_id',
        'status',
        'export_basket_id',
        'staged_file_path',
        'agency_asset_id',
        'agency_url',
        'rejection_reason_id',
        'custom_rejection_note',
        'ftp_status',
        'ftp_remote_path',
        'ftp_last_attempt_at',
        'scraped_status_raw',
        'scraped_downloads',
        'scraped_earnings_cents',
        'scraped_views',
        'last_scraped_at',
        'ai_flags',
      ])
    );

    // Verify future-proof columns on assets
    const assetCols = dbManager.db
      .prepare('PRAGMA table_info(assets)')
      .all()
      .map((c: any) => c.name);

    expect(assetCols).toEqual(
      expect.arrayContaining([
        'original_path',
        'master_path',
        'preview_path',
        'file_hash',
        'perceptual_hash',
        'pipeline_stage',
        'ai_vision_score',
        'ai_flags_json',
        'custom_attributes_json',
      ])
    );

    // Verify seeded rejection dictionary
    const reasons = dbManager.getRejectionDictionary();
    expect(reasons.length).toBeGreaterThanOrEqual(6);
  });

  it('2. executes Copy-First Atomic Ingestion (Source -> Temp -> Master_Vault), SHA-256 deduplication, and atomic rollback on failure', () => {
    const sampleFile1 = path.join(sourceDir, 'studio_photo_01.jpg');
    const sampleContent = Buffer.from('fake-jpeg-binary-payload-001');
    fs.writeFileSync(sampleFile1, sampleContent);

    // Step A: Copy to hidden .stockflow_temp and compute SHA-256 hash
    const staged = dbManager.stageAndHashFile({
      sourcePath: sampleFile1,
      filename: 'studio_photo_01.jpg',
      batchId: 'B01',
    });

    expect(staged.success).toBe(true);
    expect(staged.isDuplicate).toBe(false);
    expect(staged.fileHash).toHaveLength(64);
    expect(fs.existsSync(staged.tempFilePath)).toBe(true);
    // CRITICAL: Original source file must remain 100% untouched in sourceDir
    expect(fs.existsSync(sampleFile1)).toBe(true);

    // Step B: Commit atomically to Master_Vault
    const committed = dbManager.commitAtomicallyToMasterVault({
      tempFilePath: staged.tempFilePath,
      record: {
        id: 'asset-001',
        batchId: 'B01',
        filename: 'studio_photo_01.jpg',
        originalPath: sampleFile1,
        fileHash: staged.fileHash,
        fileSize: staged.fileSize,
        mediaType: 'image',
        isAiGenerated: false,
        baseTitle: 'Minimalist wooden desk in modern sunlit studio',
        detailedDescription: 'Minimalist wooden desk in modern sunlit studio with laptop.',
        rankedKeywords: Array.from({ length: 46 }, (_, i) => `keyword${i + 1}`),
        status: 'completed',
      },
    });

    expect(committed.status).toBe('completed');
    expect(committed.pipelineStage).toBe('committed');
    expect(fs.existsSync(committed.masterPath)).toBe(true);
    expect(fs.existsSync(staged.tempFilePath)).toBe(false); // Temp cleaned up after move
    expect(fs.existsSync(sampleFile1)).toBe(true); // Original still untouched!
    expect(Object.keys(committed.agencyTrackings)).toHaveLength(6);
    expect(Object.values(committed.agencyTrackings).every((t: any) => t.status === 'New')).toBe(true);

    // Step C: Attempting to ingest an identical file (even with a different filename) must be skipped by SHA-256 hash check
    const duplicateFile = path.join(sourceDir, 'renamed_copy_of_photo_01.jpg');
    fs.writeFileSync(duplicateFile, sampleContent);

    const dupResult = dbManager.stageAndHashFile({
      sourcePath: duplicateFile,
      filename: 'renamed_copy_of_photo_01.jpg',
      batchId: 'B01',
    });
    expect(dupResult.isDuplicate).toBe(true);
    expect(dupResult.existingAssetId).toBe('asset-001');

    // Step D: Simulate mid-pipeline failure -> rollbackIngestedItem must wipe temp file and remove uncommitted DB record
    const failingSource = path.join(sourceDir, 'corrupted_vector.eps');
    fs.writeFileSync(failingSource, Buffer.from('corrupt-eps-stream'));

    const stagedFail = dbManager.stageAndHashFile({
      sourcePath: failingSource,
      filename: 'corrupted_vector.eps',
      batchId: 'B01',
    });
    expect(fs.existsSync(stagedFail.tempFilePath)).toBe(true);

    const rolledBack = dbManager.rollbackIngestedItem({
      assetId: 'asset-fail-99',
      tempFilePath: stagedFail.tempFilePath,
    });
    expect(rolledBack.rolledBack).toBe(true);
    expect(fs.existsSync(stagedFail.tempFilePath)).toBe(false);
    expect(dbManager.getMasterRecord('asset-fail-99')).toBeUndefined();
  });

  it('3. creates Export Baskets (Pending Upload) and supports bulk Reconciliation & RejectionDictionary logging', () => {
    // Seed 3 committed assets in Master Vault
    const assetIds = ['exp-1', 'exp-2', 'exp-3'];
    for (const id of assetIds) {
      const src = path.join(sourceDir, `${id}.jpg`);
      fs.writeFileSync(src, Buffer.from(`unique-image-content-${id}`));
      const staged = dbManager.stageAndHashFile({
        sourcePath: src,
        filename: `${id}.jpg`,
        batchId: 'B01',
      });
      dbManager.commitAtomicallyToMasterVault({
        tempFilePath: staged.tempFilePath,
        record: {
          id,
          batchId: 'B01',
          filename: `${id}.jpg`,
          originalPath: src,
          fileHash: staged.fileHash,
          fileSize: staged.fileSize,
          mediaType: 'image',
          isAiGenerated: false,
          baseTitle: `Asset ${id} commercial photography`,
          detailedDescription: `Detailed description for ${id}.`,
          rankedKeywords: ['studio', 'commercial', 'photo'],
          status: 'completed',
        },
      });
    }

    // Export all 3 to Adobe Stock -> must create Export Basket and set status to 'Pending Upload' (NOT 'Uploaded')
    const csvContent = 'Filename,Title,Keywords,Category\nexp-1.jpg,Asset 1,"studio,photo",1\n';
    const basket = dbManager.createExportBasket({
      agencyId: 'adobe',
      assetIds,
      csvContent,
      csvFilename: 'adobe_stock_metadata.csv',
    });

    expect(basket.agencyId).toBe('adobe');
    expect(basket.itemCount).toBe(3);
    expect(fs.existsSync(basket.stagingFolderPath)).toBe(true);
    expect(fs.existsSync(basket.csvFilePath)).toBe(true);
    expect(fs.existsSync(path.join(basket.stagingFolderPath, 'exp-1.jpg'))).toBe(true);

    // Verify all 3 assets are now 'Pending Upload' for adobe, while other agencies remain 'New'
    const recordsAfterExport = dbManager.getMasterRecords();
    for (const rec of recordsAfterExport) {
      expect(rec.agencyTrackings.adobe.status).toBe('Pending Upload');
      expect(rec.agencyTrackings.adobe.exportBasketId).toBe(basket.id);
      expect(rec.agencyTrackings.shutterstock.status).toBe('New');
    }

    // Reconcile: exp-1 & exp-2 succeeded on portal ('Uploaded'), exp-3 failed portal upload -> revert to 'New'
    dbManager.reconcileAgencyStatuses({
      assetIds: ['exp-1', 'exp-2'],
      agencyId: 'adobe',
      targetStatus: 'Uploaded',
    });
    dbManager.reconcileAgencyStatuses({
      assetIds: ['exp-3'],
      agencyId: 'adobe',
      targetStatus: 'New',
    });

    const exp1 = dbManager.getMasterRecord('exp-1');
    const exp3 = dbManager.getMasterRecord('exp-3');
    expect(exp1.agencyTrackings.adobe.status).toBe('Uploaded');
    expect(exp3.agencyTrackings.adobe.status).toBe('New');

    // Add a custom rejection reason to RejectionDictionary and mark exp-2 as Rejected
    const customReason = dbManager.addRejectionReason({
      agencyId: 'adobe',
      title: 'Generative AI Checkers Artifact',
      description: 'Visible grid artifact in shadow gradient.',
      severity: 'fixable',
    });

    dbManager.reconcileAgencyStatuses({
      assetIds: ['exp-2'],
      agencyId: 'adobe',
      targetStatus: 'Rejected',
      rejectionReasonId: customReason.id,
      customRejectionNote: 'Need to heal bottom-left corner in Photoshop.',
    });

    const exp2 = dbManager.getMasterRecord('exp-2');
    const exp2Adobe = exp2.agencyTrackings.adobe;
    expect(exp2Adobe.status).toBe('Rejected');
    expect(exp2Adobe.rejectionReasonId).toBe(customReason.id);
    expect(exp2Adobe.rejectionReasonTitle).toBe('Generative AI Checkers Artifact');
    expect(exp2Adobe.customRejectionNote).toBe('Need to heal bottom-left corner in Photoshop.');
  });

  it('4. executes Event-Driven SQLite Hot Backups and enforces the 30-file rolling retention policy', () => {
    // Trigger 1: Startup backup was already created during dbManager.init()
    const initialBackups = dbManager.getBackupLogs(30);
    expect(initialBackups.length).toBeGreaterThanOrEqual(1);
    expect(initialBackups[0].triggerEvent).toBe('app_startup');

    // Trigger 35 event-driven backups across batch operations and verify rolling retention caps files on disk at 30
    for (let i = 1; i <= 35; i++) {
      dbManager.performHotBackup(i % 2 === 0 ? 'batch_ingest' : 'batch_reconcile');
    }

    const backupFilesOnDisk = fs
      .readdirSync(dbManager.backupsDir)
      .filter((f: string) => f.startsWith('stockflow_backup_') && f.endsWith('.sqlite'));

    expect(backupFilesOnDisk.length).toBe(30);
  });
});
