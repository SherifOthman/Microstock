import { describe, it, expect, beforeEach } from 'vitest';
import {
  bundleAndSortFtpQueue,
  generateDynamicCsvRemoteName,
  resolveDreamstimeRoute,
  formatBytes,
  formatBytesPrecise,
  formatTransferSpeed,
  formatSpeedPrecise,
  formatEtaSeconds,
  formatTimeLeftHms,
  formatUnifiedUploadProgressLine,
  FTP_MAX_RETRIES_PER_FILE,
  FTP_RETRY_BACKOFF_SCHEDULE_MS,
} from '../../src/services/ftp/dreamstimeFtpRouter';
import { DreamstimeFtpOrchestrator } from '../../src/services/ftp/ftpClientService';
import { db } from '../../src/db';

describe('Dreamstime FTP Uploader (Plain FTP Port 21, Vector Pair Bundling, Precision Telemetry & 5x Retry)', () => {
  beforeEach(async () => {
    await db.ftp.clearLogs('dreamstime');
  });

  it('deterministically routes JPEGs, Vectors (.eps/.ai), and Videos (.mp4/.mov) into Dreamstime target folders', () => {
    const jpgRoute = resolveDreamstimeRoute('B01_AI_PH_001_luxury_kitchen.jpg');
    expect(jpgRoute.remoteFolder).toBe('/');
    expect(jpgRoute.remotePath).toBe('/B01_AI_PH_001_luxury_kitchen.jpg');
    expect(jpgRoute.mediaType).toBe('image');

    const epsRoute = resolveDreamstimeRoute('B01_NT_VC_002_isometric_chart.eps');
    expect(epsRoute.remoteFolder).toBe('/additional');
    expect(epsRoute.remotePath).toBe('/additional/B01_NT_VC_002_isometric_chart.eps');
    expect(epsRoute.mediaType).toBe('vector');

    const aiRoute = resolveDreamstimeRoute('B01_NT_VC_003_badge_pack.AI');
    expect(aiRoute.remoteFolder).toBe('/additional');
    expect(aiRoute.remotePath).toBe('/additional/B01_NT_VC_003_badge_pack.AI');
    expect(aiRoute.mediaType).toBe('vector');

    const mp4Route = resolveDreamstimeRoute('B01_AI_VD_004_drone_4k.mp4');
    expect(mp4Route.remoteFolder).toBe('/video');
    expect(mp4Route.remotePath).toBe('/video/B01_AI_VD_004_drone_4k.mp4');
    expect(mp4Route.mediaType).toBe('video');

    const movRoute = resolveDreamstimeRoute('B01_NT_VD_005_coffee_pour.MOV');
    expect(movRoute.remoteFolder).toBe('/video');
    expect(movRoute.remotePath).toBe('/video/B01_NT_VD_005_coffee_pour.MOV');
    expect(movRoute.mediaType).toBe('video');

    const csvRoute = resolveDreamstimeRoute('dreamstime_metadata_export.csv');
    expect(csvRoute.remoteFolder).toBe('/');
    expect(csvRoute.remotePath).toBe('/dreamstime_metadata_export.csv');
    expect(csvRoute.ruleLabel).toContain('CSV');
  });

  it('automatically pairs matching JPG + EPS stems into atomic Vector Bundles and sorts Standalone Photos -> Vector Bundles/Vectors -> Videos', () => {
    const orchestrator = new DreamstimeFtpOrchestrator();
    orchestrator.addFiles([
      { name: 'video_clip_01.mp4', size: 25_000_000 },
      { name: 'helmet_vector.eps', size: 4_000_000 },
      { name: 'standalone_photo_01.jpg', size: 8_000_000 },
      { name: 'helmet_vector.jpg', size: 2_000_000 },
      { name: 'video_clip_02.mov', size: 30_000_000 },
      { name: 'standalone_photo_02.png', size: 6_500_000 },
      { name: 'standalone_vector_02.ai', size: 5_200_000 },
    ]);

    const sortedQueue = orchestrator.getQueue();
    expect(sortedQueue.length).toBe(6);

    // 1. Standalone Photos first
    expect(sortedQueue[0].filename).toBe('standalone_photo_01.jpg');
    expect(sortedQueue[0].mediaType).toBe('image');
    expect(sortedQueue[1].filename).toBe('standalone_photo_02.png');
    expect(sortedQueue[1].mediaType).toBe('image');

    // 2. Vector Bundle (helmet_vector.jpg + helmet_vector.eps) and Standalone Vector second
    const bundle = sortedQueue[2];
    expect(bundle.isVectorBundle).toBe(true);
    expect(bundle.displayName).toBe('Vector Bundle: helmet_vector');
    expect(bundle.fileSize).toBe(6_000_000);
    expect(bundle.jpgPart?.filename).toBe('helmet_vector.jpg');
    expect(bundle.jpgPart?.remoteFolder).toBe('/');
    expect(bundle.epsPart?.filename).toBe('helmet_vector.eps');
    expect(bundle.epsPart?.remoteFolder).toBe('/additional');

    expect(sortedQueue[3].filename).toBe('standalone_vector_02.ai');
    expect(sortedQueue[3].mediaType).toBe('vector');

    // 3. Videos last
    expect(sortedQueue[4].filename).toBe('video_clip_01.mp4');
    expect(sortedQueue[4].mediaType).toBe('video');
    expect(sortedQueue[5].filename).toBe('video_clip_02.mov');
    expect(sortedQueue[5].mediaType).toBe('video');
  });

  it('dynamically renames CSV remote filename with timestamp (anti-collision) while keeping localPath untouched, routes to root /, and enforces CSV as absolute last priority', () => {
    // 1. Anti-collision remote naming helper test
    const dynamicRemoteName = generateDynamicCsvRemoteName('dreamstime_batch.csv', 1701234567);
    expect(dynamicRemoteName).toBe('dreamstime_batch_1701234567.csv');

    // 2. Queue addition, routing, and strict sorting test
    const orchestrator = new DreamstimeFtpOrchestrator();
    orchestrator.addFiles([
      { name: 'video_clip_01.mp4', path: 'C:/media/video_clip_01.mp4', size: 20_000_000 },
      { name: 'metadata_export.csv', path: 'C:/exports/metadata_export.csv', size: 15_000 },
      { name: 'photo_highres.jpg', path: 'C:/media/photo_highres.jpg', size: 5_000_000 },
      { name: 'icon_pack.eps', path: 'C:/media/icon_pack.eps', size: 3_000_000 },
      { name: 'icon_pack.jpg', path: 'C:/media/icon_pack.jpg', size: 1_000_000 },
      { name: 'vector_standalone.ai', path: 'C:/media/vector_standalone.ai', size: 2_000_000 },
    ]);

    const queue = orchestrator.getQueue();
    expect(queue.length).toBe(5); // Photo (1) + Vector Bundle (1) + Standalone Vector (1) + Video (1) + CSV (1)

    // Strict Sorting Order:
    // Priority 0: Standalone Photo
    expect(queue[0].filename).toBe('photo_highres.jpg');
    expect(queue[0].mediaType).toBe('image');
    expect(queue[0].remoteFolder).toBe('/');

    // Priority 1: Vector Bundle & Standalone Vector
    expect(queue[1].isVectorBundle).toBe(true);
    expect(queue[1].displayName).toBe('Vector Bundle: icon_pack');
    expect(queue[2].filename).toBe('vector_standalone.ai');
    expect(queue[2].mediaType).toBe('vector');
    expect(queue[2].remoteFolder).toBe('/additional');

    // Priority 2: Video
    expect(queue[3].filename).toBe('video_clip_01.mp4');
    expect(queue[3].mediaType).toBe('video');
    expect(queue[3].remoteFolder).toBe('/video');

    // Priority 3: CSV Metadata (MUST BE ABSOLUTELY LAST)
    const csvItem = queue[4];
    expect(csvItem.isCsv).toBe(true);
    expect(csvItem.displayName).toBe('metadata_export.csv');
    // Local path on disk is strictly preserved and UNTOUCHED
    expect(csvItem.localPath).toBe('C:/exports/metadata_export.csv');
    // Remote filename dynamically includes timestamp
    expect(csvItem.remoteName).toMatch(/^metadata_export_\d+\.csv$/);
    expect(csvItem.filename).toBe(csvItem.remoteName);
    // Remote folder is strictly root '/'
    expect(csvItem.remoteFolder).toBe('/');
    expect(csvItem.remotePath).toBe(`/${csvItem.remoteName}`);
  });

  it('forces Plain FTP on port 21 and encrypts passwords at rest with enc:<hex> prefix in SQLite', async () => {
    const orchestrator = new DreamstimeFtpOrchestrator();
    const saved = await orchestrator.saveDreamstimeCredentials({
      host: 'ftp.dreamstime.com',
      username: 'dt_contributor_99',
      password: 'SuperSecretFtpPassword!2026',
    });

    expect(saved.agencyId).toBe('dreamstime');
    expect(saved.protocol).toBe('ftp');
    expect(saved.host).toBe('ftp.dreamstime.com');
    expect(saved.port).toBe(21);
    expect(saved.username).toBe('dt_contributor_99');
    expect(saved.hasSavedPassword).toBe(true);
    expect(saved.encryptedPassword?.startsWith('enc:')).toBe(true);
    expect(saved.encryptedPassword).not.toContain('SuperSecretFtpPassword!2026');
  });

  it('enforces 5x auto-retry schedule (2s, 5s, 10s, 30s, 60s) and recovers cleanly on transient network drops', async () => {
    const orchestrator = new DreamstimeFtpOrchestrator();
    expect(FTP_MAX_RETRIES_PER_FILE).toBe(5);
    expect(FTP_RETRY_BACKOFF_SCHEDULE_MS).toEqual([2000, 5000, 10000, 30000, 60000]);
    expect(orchestrator.getRetryDelayMs(1)).toBe(2000);
    expect(orchestrator.getRetryDelayMs(2)).toBe(5000);
    expect(orchestrator.getRetryDelayMs(3)).toBe(10000);
    expect(orchestrator.getRetryDelayMs(4)).toBe(30000);
    expect(orchestrator.getRetryDelayMs(5)).toBe(60000);

    orchestrator.addFiles([
      { name: 'photo_01.jpg', size: 2_000_000 },
      { name: 'vector_02.eps', size: 3_000_000 },
    ]);

    const result = await orchestrator.startBatchUpload({
      mode: 'dry_run',
      faultMode: 'transient_recover_on_retry_2',
      faultTargetFilenames: ['vector_02.eps'],
      baseBackoffMs: 2,
      simulatedChunkIntervalMs: 1,
    });

    expect(result.succeededCount).toBe(2);
    expect(result.failedCount).toBe(0);

    const queue = orchestrator.getQueue();
    const recoveredItem = queue.find((i) => i.filename === 'vector_02.eps');
    expect(recoveredItem?.status).toBe('succeeded');
    expect(recoveredItem?.retryCount).toBe(2);
    expect(recoveredItem?.maxRetries).toBe(5);
    expect(recoveredItem?.remoteFolder).toBe('/additional');
  });

  it('isolates persistent failures into Failed Queue after 5 retries without halting batch, logs to SQLite, and supports 1-click Retry All Failed', async () => {
    const orchestrator = new DreamstimeFtpOrchestrator();
    orchestrator.addFiles([
      { name: 'photo_01.jpg', size: 2_000_000 },
      { name: 'video_02_drop.mp4', size: 10_000_000 },
      { name: 'vector_03.eps', size: 4_000_000 },
    ]);

    const firstRun = await orchestrator.startBatchUpload({
      mode: 'dry_run',
      faultMode: 'persistent_fail_all_5',
      faultTargetFilenames: ['video_02_drop.mp4'],
      baseBackoffMs: 1,
      simulatedChunkIntervalMs: 1,
    });

    expect(firstRun.succeededCount).toBe(2);
    expect(firstRun.failedCount).toBe(1);

    const failedItem = orchestrator.getQueue().find((i) => i.filename === 'video_02_drop.mp4');
    expect(failedItem?.status).toBe('failed');
    expect(failedItem?.retryCount).toBe(5);
    expect(failedItem?.errorCode).toBe('ETIMEDOUT_421');

    // Now test 1-click Retry All Failed
    const retryRun = await orchestrator.retryAllFailed({
      mode: 'dry_run',
      faultMode: 'none',
      baseBackoffMs: 1,
      simulatedChunkIntervalMs: 1,
    });

    expect(retryRun.succeededCount).toBe(3);
    expect(retryRun.failedCount).toBe(0);

    const logs = await db.ftp.getTransferLogs({ agencyId: 'dreamstime' });
    expect(logs.length).toBeGreaterThanOrEqual(4);
  });

  it('formats precision transfer bytes, speed, HH:MM:SS time left, and unified progress line accurately', () => {
    expect(formatBytes(1024 * 1024 * 5.5)).toBe('5.5 MB');
    expect(formatBytesPrecise(687.73 * 1024)).toBe('687.73 KB');
    expect(formatBytesPrecise(5.49 * 1024 * 1024)).toBe('5.49 MB');
    expect(formatTransferSpeed(1024 * 1024 * 14.2)).toBe('14.2 MB/s');
    expect(formatTransferSpeed(1024 * 450)).toBe('450 KB/s');
    expect(formatSpeedPrecise(625.03 * 1024)).toBe('625.03 KB/s');
    expect(formatEtaSeconds(125)).toBe('02m 05s');
    expect(formatTimeLeftHms(61)).toBe('00:01:01');

    const line = formatUnifiedUploadProgressLine({
      sessionId: 'sess_1',
      mode: 'live',
      isRunning: true,
      isPaused: false,
      totalFiles: 5,
      completedFiles: 0,
      succeededFiles: 0,
      failedFiles: 0,
      skippedFiles: 0,
      currentFileIndex: 1,
      currentItemId: 'item_1',
      currentFilename: 'test.mp4',
      currentRemoteFolder: '/video',
      currentFileBytesTransferred: Math.round(687.73 * 1024),
      currentFileTotalBytes: Math.round(5.49 * 1024 * 1024),
      currentFilePercent: 12,
      batchBytesTransferred: Math.round(687.73 * 1024),
      batchTotalBytes: Math.round(5.49 * 1024 * 1024),
      batchPercent: 12,
      speedBytesPerSec: Math.round(625.03 * 1024),
      etaSeconds: 61,
      activeRetryAttempt: 0,
    });
    expect(line).toBe(
      'Upload progress: 1/5 files - 687.73 KB / 5.49 MB @ 625.03 KB/s Time left: 00:01:01'
    );
  });

  it('supports single-item retry and clear completed / clear all queue items', async () => {
    const orchestrator = new DreamstimeFtpOrchestrator();
    orchestrator.addFiles([
      { name: 'photo_success.jpg', size: 1_000_000 },
      { name: 'photo_failed.jpg', size: 2_000_000 },
    ]);

    await orchestrator.startBatchUpload({
      mode: 'dry_run',
      faultMode: 'persistent_fail_all_5',
      faultTargetFilenames: ['photo_failed.jpg'],
      baseBackoffMs: 1,
      simulatedChunkIntervalMs: 1,
    });

    const failed = orchestrator.getQueue().find((i) => i.filename === 'photo_failed.jpg');
    expect(failed?.status).toBe('failed');

    // Retry single item
    await orchestrator.retrySingleItem(failed!.id, {
      mode: 'dry_run',
      faultMode: 'none',
      baseBackoffMs: 1,
      simulatedChunkIntervalMs: 1,
    });

    expect(orchestrator.getQueue().find((i) => i.filename === 'photo_failed.jpg')?.status).toBe(
      'succeeded'
    );

    // Clear all resets queue and telemetry counters
    orchestrator.clearQueue();
    expect(orchestrator.getQueue().length).toBe(0);
    expect(orchestrator.getTelemetry().totalFiles).toBe(0);
  });

  it('strictly isolates 550 duplicate errors into Skipped state without retrying', async () => {
    const orchestrator = new DreamstimeFtpOrchestrator();
    orchestrator.addFiles([
      { name: 'photo_good.jpg', size: 1_000_000 },
      { name: 'photo_exists_550.jpg', size: 2_000_000 },
    ]);

    const result = await orchestrator.startBatchUpload({
      mode: 'dry_run',
      faultMode: 'permanent_550_skip',
      faultTargetFilenames: ['photo_exists_550.jpg'],
      baseBackoffMs: 1,
      simulatedChunkIntervalMs: 1,
    });

    expect(result.succeededCount).toBe(1);
    expect(result.failedCount).toBe(0);

    const queue = orchestrator.getQueue();
    const skippedItem = queue.find((i) => i.filename === 'photo_exists_550.jpg');
    expect(skippedItem?.status).toBe('skipped');
    expect(skippedItem?.errorCode).toBe('550');

    const telemetry = orchestrator.getTelemetry();
    expect(telemetry.completedFiles).toBe(2);
    expect(telemetry.totalFiles).toBe(2);
    expect(telemetry.batchPercent).toBe(100);
    expect(telemetry.skippedFiles).toBe(1);
  });

  it('supports pause and resume during batch upload safely without halting queue', async () => {
    const orchestrator = new DreamstimeFtpOrchestrator();
    orchestrator.addFiles([
      { name: 'photo_1.jpg', size: 1_000_000 },
      { name: 'photo_2.jpg', size: 1_000_000 },
    ]);

    expect(orchestrator.getIsPaused()).toBe(false);

    const uploadPromise = orchestrator.startBatchUpload({
      mode: 'dry_run',
      simulatedChunkIntervalMs: 20,
    });

    await new Promise((r) => setTimeout(r, 10));
    orchestrator.pauseBatch();
    expect(orchestrator.getIsPaused()).toBe(true);
    expect(orchestrator.getTelemetry().isPaused).toBe(true);

    orchestrator.resumeBatch();
    expect(orchestrator.getIsPaused()).toBe(false);
    expect(orchestrator.getTelemetry().isPaused).toBe(false);

    const result = await uploadPromise;
    expect(result.succeededCount).toBe(2);
  });
});
