import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveDreamstimeRoute,
  formatBytes,
  formatTransferSpeed,
  formatEtaSeconds,
  FTP_MAX_RETRIES_PER_FILE,
  FTP_RETRY_BACKOFF_SCHEDULE_MS,
} from '../../src/services/ftp/dreamstimeFtpRouter';
import { DreamstimeFtpOrchestrator } from '../../src/services/ftp/ftpClientService';
import { db } from '../../src/db';

describe('Dreamstime FTP Uploader (Plain FTP Port 21, Intelligent Sorting & 5x Retry)', () => {
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
  });

  it('automatically sorts dropped files so Photos appear first, followed by Vectors, followed by Videos', () => {
    const orchestrator = new DreamstimeFtpOrchestrator();
    orchestrator.addFiles([
      { name: 'video_clip_01.mp4', size: 25_000_000 },
      { name: 'vector_illustration_01.eps', size: 4_000_000 },
      { name: 'photo_shoot_01.jpg', size: 8_000_000 },
      { name: 'video_clip_02.mov', size: 30_000_000 },
      { name: 'photo_shoot_02.png', size: 6_500_000 },
      { name: 'vector_illustration_02.ai', size: 5_200_000 },
    ]);

    const sortedQueue = orchestrator.getQueue();
    expect(sortedQueue.map((i) => i.filename)).toEqual([
      'photo_shoot_01.jpg',
      'photo_shoot_02.png',
      'vector_illustration_01.eps',
      'vector_illustration_02.ai',
      'video_clip_01.mp4',
      'video_clip_02.mov',
    ]);
    expect(sortedQueue.map((i) => i.mediaType)).toEqual([
      'image',
      'image',
      'vector',
      'vector',
      'video',
      'video',
    ]);
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

  it('formats transfer bytes, speed, and ETA strings accurately', () => {
    expect(formatBytes(1024 * 1024 * 5.5)).toBe('5.5 MB');
    expect(formatTransferSpeed(1024 * 1024 * 14.2)).toBe('14.2 MB/s');
    expect(formatTransferSpeed(1024 * 450)).toBe('450 KB/s');
    expect(formatTransferSpeed(0)).toBe('0 KB/s');
    expect(formatEtaSeconds(125)).toBe('02m 05s');
  });

  it('supports single-item retry and clear completed queue items', async () => {
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

    expect(orchestrator.getQueue().find((i) => i.filename === 'photo_failed.jpg')?.status).toBe('succeeded');

    // Clear completed
    orchestrator.clearCompleted();
    expect(orchestrator.getQueue().length).toBe(0);
  });
});
