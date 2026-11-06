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

  it('4. enforces Dual-SQLite split (userdata.sqlite vs local_queues.sqlite), Zero-Base64 rule, Relative Master Paths, and Smart Daily Quit Backups with 7-day rolling retention', () => {
    // 1. Verify Dual-SQLite files exist on disk
    expect(path.basename(dbManager.dbPath)).toBe('userdata.sqlite');
    expect(path.basename(dbManager.queuesDbPath)).toBe('local_queues.sqlite');
    expect(fs.existsSync(dbManager.dbPath)).toBe(true);
    expect(fs.existsSync(dbManager.queuesDbPath)).toBe(true);

    // 2. Writing to ephemeral local_queues.sqlite must NOT mark userdata.sqlite dirty
    expect(dbManager.isUserDataDirty).toBe(false);
    dbManager.saveQueueSnapshot({
      moduleId: 'ftp',
      batchStatus: 'running',
      queue: [{ id: 'q1', filename: 'ephemeral.jpg' }],
    });
    expect(dbManager.isUserDataDirty).toBe(false);
    expect(dbManager.getQueueSnapshot('ftp')?.queue.length).toBe(1);

    // 3. Quit backup skips when userdata.sqlite is clean
    const skippedClean = dbManager.performQuitBackupIfNeeded();
    expect(skippedClean.skipped).toBe(true);
    expect(skippedClean.reason).toBe('not_dirty');

    // 4. Upsert a Master Record with Base64 data -> verify Zero-Base64 in SQLite & Relative Master Path storage
    const fakeJpg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
    const assetPath = path.join(dbManager.masterVaultDir, 'B99_hero.jpg');
    fs.writeFileSync(assetPath, Buffer.from('hero-img-bytes'));

    dbManager.putMasterRecord({
      id: 'rel-zero-b64',
      batchId: 'B99',
      filename: 'B99_hero.jpg',
      masterPath: assetPath,
      thumbnailBase64: `data:image/jpeg;base64,${fakeJpg}`,
      mediaType: 'image',
      isAiGenerated: false,
      baseTitle: 'Clean Architecture Asset',
      detailedDescription: 'Zero Base64 bloat in userdata.sqlite',
      rankedKeywords: ['architecture', 'sqlite', 'clean'],
      status: 'completed',
    });

    // userdata.sqlite is now dirty
    expect(dbManager.isUserDataDirty).toBe(true);

    // Inspect raw SQLite row in userdata.sqlite: thumbnail_base64 MUST be '' and master_path MUST be relative ('B99_hero.jpg')
    const rawRow = dbManager.db
      .prepare('SELECT thumbnail_base64, master_path FROM assets WHERE id = ?')
      .get('rel-zero-b64');
    expect(rawRow.thumbnail_base64).toBe('');
    expect(rawRow.master_path).toBe('B99_hero.jpg');

    // Inspect hydrated record: masterPath is dynamically reconstructed as absolute, and previewUrl uses stockflow://local?path=
    const hydrated = dbManager.getMasterRecord('rel-zero-b64');
    expect(hydrated.thumbnailBase64).toBe('');
    expect(hydrated.masterPath).toBe(assetPath);
    expect(hydrated.previewUrl).toContain('stockflow://local?path=');

    // 5. Perform Quit Backup -> runs once for today and resets dirty flag
    const firstQuitBackup = dbManager.performQuitBackupIfNeeded();
    expect(firstQuitBackup.skipped).toBeFalsy();
    expect(firstQuitBackup.backupFilePath).toContain('userdata_backup_');
    expect(dbManager.isUserDataDirty).toBe(false);

    // Modifying again on the same day should skip automated quit backup because a backup already exists today
    dbManager.putSetting({ key: 'test_key', value: 'updated_same_day' });
    expect(dbManager.isUserDataDirty).toBe(true);
    const secondQuitSameDay = dbManager.performQuitBackupIfNeeded();
    expect(secondQuitSameDay.skipped).toBe(true);
    expect(secondQuitSameDay.reason).toBe('already_backed_up_today');

    // 6. Verify 7-Day Rolling Retention prunes backups older than 7 days
    const oldBackupPath = path.join(
      dbManager.backupsDir,
      'userdata_backup_2020-01-01T00-00-00-000Z_app_quit.sqlite'
    );
    fs.writeFileSync(oldBackupPath, Buffer.from('old-sqlite-snapshot'));
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldBackupPath, tenDaysAgo, tenDaysAgo);

    dbManager.pruneOldBackups(7, 30);
    expect(fs.existsSync(oldBackupPath)).toBe(false);
    expect(fs.existsSync(firstQuitBackup.backupFilePath)).toBe(true);
  });

  it('5. evaluates full 6-agency Pre-Flight Warning rules (Adobe, Shutterstock, Freepik, Vecteezy, Dreamstime, 123RF)', async () => {
    const { evaluateAgencyPreflight } = await import(
      '../../src/services/tracker/agencyPreflightValidator'
    );

    const overloadedRecord: any = {
      id: 'pf-1',
      filename: 'test.jpg',
      mediaType: 'image',
      baseTitle: 'A'.repeat(210), // > 200 chars
      detailedDescription: 'Short desc', // < 5 words
      rankedKeywords: Array.from({ length: 53 }, (_, i) => `tag${i + 1}`), // 53 keywords
      status: 'completed',
      createdAt: Date.now(),
    };

    const adobeWarnings = evaluateAgencyPreflight(overloadedRecord, 'adobe');
    expect(adobeWarnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(['ADOBE_TITLE_OVER_200', 'ADOBE_KEYWORDS_OVER_49'])
    );

    const shutterWarnings = evaluateAgencyPreflight(overloadedRecord, 'shutterstock');
    expect(shutterWarnings.map((w) => w.code)).toContain('SHUTTER_KEYWORDS_OVER_50');

    const freepikWarnings = evaluateAgencyPreflight(overloadedRecord, 'freepik');
    expect(freepikWarnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(['FREEPIK_TITLE_OVER_100', 'FREEPIK_KEYWORDS_OVER_50'])
    );

    const dtWarnings = evaluateAgencyPreflight(overloadedRecord, 'dreamstime');
    expect(dtWarnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(['DT_TITLE_OVER_130', 'DT_DESC_SHORT'])
    );

    const rfWarnings = evaluateAgencyPreflight(overloadedRecord, '123rf');
    expect(rfWarnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(['RF_TITLE_OVER_110', 'RF_KEYWORDS_OVER_50'])
    );
  });

  it('6. executes Bulk SEO Surgery, 1-Click Auto-Trim Keywords, and Drag-and-Drop File/Hash Reconciliation Matching', async () => {
    const {
      autoTrimKeywordsForAgency,
      applyBulkMetadataSurgery,
      matchDroppedFilesToPendingAssets,
    } = await import('../../src/services/tracker/bulkTrackerOperations');
    const { db } = await import('../../src/db');

    await db.masterRecords.clear();
    const rec1: any = {
      id: 'bulk-1',
      batchId: 'B01',
      filename: 'B01-AI-PH-001_Solar_Panels.jpg',
      fileHash: 'sha256_abc12345',
      mediaType: 'image',
      baseTitle: 'Golden Hour Solar Panels Commercial Stock Background',
      detailedDescription: 'Golden Hour Solar Panels Commercial Stock Background for agencies.',
      rankedKeywords: [
        'solar',
        'midjourney',
        'illustartion',
        ...Array.from({ length: 50 }, (_, i) => `tag_${i + 1}`),
      ],
      status: 'completed',
      createdAt: Date.now(),
    };
    await db.masterRecords.put(rec1);

    // 1. Auto-Trim to Adobe Stock cap (49 keywords)
    const trimRes = await autoTrimKeywordsForAgency([rec1], 'adobe');
    expect(trimRes.updatedCount).toBe(1);
    expect(trimRes.cap).toBe(49);
    const afterTrim = await db.masterRecords.get('bulk-1');
    expect(afterTrim?.rankedKeywords).toHaveLength(49);

    // 2. Bulk Keyword Sanitizer: remove 'midjourney' and replace 'illustartion' -> 'illustration'
    await applyBulkMetadataSurgery([afterTrim!], {
      mode: 'keywords',
      keywordAction: 'remove',
      targetKeywordsRaw: 'midjourney',
    });
    const afterRemove = await db.masterRecords.get('bulk-1');
    expect(afterRemove?.rankedKeywords).not.toContain('midjourney');

    await applyBulkMetadataSurgery([afterRemove!], {
      mode: 'keywords',
      keywordAction: 'replace',
      targetKeywordsRaw: 'illustartion',
      replacementKeywordRaw: 'illustration',
    });
    const afterReplace = await db.masterRecords.get('bulk-1');
    expect(afterReplace?.rankedKeywords).toContain('illustration');
    expect(afterReplace?.rankedKeywords).not.toContain('illustartion');

    // 3. Bulk Find & Replace in Title & Description
    await applyBulkMetadataSurgery([afterReplace!], {
      mode: 'text',
      findText: 'Commercial Stock Background',
      replaceText: 'Renewable Energy Studio Concept',
      applyToTitle: true,
      applyToDescription: true,
    });
    const afterText = await db.masterRecords.get('bulk-1');
    expect(afterText?.baseTitle).toContain('Renewable Energy Studio Concept');
    expect(afterText?.detailedDescription).toContain('Renewable Energy Studio Concept');

    // 4. Drag & Drop File Matching against Pending Upload records
    const droppedFile = new File(['dummy'], 'B01-AI-PH-001_Solar_Panels.jpg', {
      type: 'image/jpeg',
    });
    const matchRes = await matchDroppedFilesToPendingAssets([droppedFile], [afterText!]);
    expect(matchRes.matchedIds).toEqual(['bulk-1']);
    expect(matchRes.unmatchedDroppedNames).toHaveLength(0);
  });
});


