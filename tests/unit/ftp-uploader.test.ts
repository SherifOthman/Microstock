import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveDreamstimeRoute,
  formatBytes,
  formatTransferSpeed,
  formatEtaSeconds,
} from '../../src/services/ftp/dreamstimeFtpRouter';
import { DreamstimeFtpOrchestrator } from '../../src/services/ftp/ftpClientService';
import { db } from '../../src/db';

describe('Dreamstime FTP Uploader (Phase 1 PoC)', () => {
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

  it('encrypts Dreamstime FTP passwords at rest with enc:<hex> prefix in SQLite', async () => {
    const orchestrator = new DreamstimeFtpOrchestrator();
    const saved = await orchestrator.saveDreamstimeCredentials({
      protocol: 'ftps',
      host: 'ftp.dreamstime.com',
      port: 21,
      username: 'dt_contributor_99',
      password: 'SuperSecretFtpPassword!2026',
      passiveMode: true,
    });

    expect(saved.agencyId).toBe('dreamstime');
    expect(saved.host).toBe('ftp.dreamstime.com');
    expect(saved.port).toBe(21);
    expect(saved.username).toBe('dt_contributor_99');
    expect(saved.hasSavedPassword).toBe(true);
    expect(saved.encryptedPassword?.startsWith('enc:')).toBe(true);
    expect(saved.encryptedPassword).not.toContain('SuperSecretFtpPassword!2026');
  });

  it('auto-retries transient network drops with exponential backoff and recovers cleanly on Retry #2', async () => {
    const orchestrator = new DreamstimeFtpOrchestrator();
    orchestrator.addFiles([
      { name: 'photo_01.jpg', size: 2_000_000 },
      { name: 'vector_02.eps', size: 3_000_000 },
    ]);

    const result = await orchestrator.startBatchUpload({
      mode: 'dry_run',
      faultMode: 'transient_recover_on_retry_2',
      faultTargetFilenames: ['vector_02.eps'],
      baseBackoffMs: 5,
      simulatedChunkIntervalMs: 1,
    });

    expect(result.succeededCount).toBe(2);
    expect(result.failedCount).toBe(0);

    const queue = orchestrator.getQueue();
    const recoveredItem = queue.find((i) => i.filename === 'vector_02.eps');
    expect(recoveredItem?.status).toBe('succeeded');
    expect(recoveredItem?.retryCount).toBe(2);
    expect(recoveredItem?.remoteFolder).toBe('/additional');
  });

  it('isolates persistent failures into Failed Queue after 3 retries without halting batch, and supports 1-click Retry All Failed', async () => {
    const orchestrator = new DreamstimeFtpOrchestrator();
    orchestrator.addFiles([
      { name: 'photo_01.jpg', size: 2_000_000 },
      { name: 'video_02_drop.mp4', size: 10_000_000 },
      { name: 'vector_03.eps', size: 4_000_000 },
    ]);

    const firstRun = await orchestrator.startBatchUpload({
      mode: 'dry_run',
      faultMode: 'persistent_fail_all_3',
      faultTargetFilenames: ['video_02_drop.mp4'],
      baseBackoffMs: 5,
      simulatedChunkIntervalMs: 1,
    });

    expect(firstRun.succeededCount).toBe(2);
    expect(firstRun.failedCount).toBe(1);

    const failedItem = orchestrator.getQueue().find((i) => i.filename === 'video_02_drop.mp4');
    expect(failedItem?.status).toBe('failed');
    expect(failedItem?.retryCount).toBe(3);
    expect(failedItem?.errorCode).toBe('ETIMEDOUT_421');

    // Now test 1-click Retry All Failed
    const retryRun = await orchestrator.retryAllFailed({
      mode: 'dry_run',
      faultMode: 'none',
      baseBackoffMs: 5,
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
    expect(formatEtaSeconds(125)).toBe('02m 05s');
  });
});
