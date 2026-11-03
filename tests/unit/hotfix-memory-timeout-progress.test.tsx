import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlobalProgressBanner } from '../../src/components/studio/GlobalProgressBanner';
import { QueueState } from '../../src/services/queue/BatchQueueService';
import { keyRingScheduler } from '../../src/services/scheduler/KeyRingScheduler';
import { db } from '../../src/db';
import { rasterizeEpsBufferDirect } from '../../src/services/eps/epsWorkerCore';

describe('Emergency Hotfix Suite: Memory GC, 503/Timeout Cooldowns, & Strict Progress Bar', () => {
  beforeEach(async () => {
    await db.apiKeys.clear();
    await keyRingScheduler.refreshKeys();
  });

  it('Progress Bar strictly reflects (successful_items / total_items) * 100 and halts at 80% when 20 of 100 fail', () => {
    const mockQueueState: QueueState = {
      batchId: 'batch-1',
      batchName: 'Batch #1',
      status: 'completed',
      items: [],
      totalCount: 100,
      processedCount: 80,
      failedCount: 20,
      activeWorkers: 0,
      elapsedSeconds: 45,
    };

    render(<GlobalProgressBanner queueState={mockQueueState} showProgressBar={true} language="en" />);

    expect(screen.getByText('(80%)')).toBeTruthy();
    expect(screen.getByText('80/100 completed')).toBeTruthy();
    expect(screen.getByText('· 20 failed')).toBeTruthy();
  });

  it('KeyRingScheduler cools down keys on HTTP 503 High Demand and signal timed out errors', async () => {
    await db.apiKeys.put({
      id: 'gemini-key-1',
      providerId: 'gemini',
      key: 'AIzaSyTestKey111111111111111111111',
      label: 'Gemini Key 1',
      modelId: 'gemini-3.1-flash-lite',
      rpmLimit: 15,
      rpdLimit: 1500,
      status: 'healthy',
      requestsInWindow: [],
      dailyRequestCount: 0,
      dailyResetTimestamp: Date.now() + 86400000,
      activeRequests: 0,
      lastUsedAt: 0,
      createdAt: Date.now(),
    });
    await keyRingScheduler.refreshKeys();

    // 1. Simulate HTTP 503 High Demand error
    const lease1 = await keyRingScheduler.acquireKey('gemini');
    const err503: any = new Error('This model is currently experiencing high demand. Spikes in demand are usually temporary.');
    err503.status = 503;
    await lease1.release(false, err503);

    let keys = await keyRingScheduler.refreshKeys();
    expect(keys[0].status).toBe('cooling_down');
    expect(keys[0].cooldownUntil).toBeGreaterThan(Date.now());
    expect(keys[0].lastError).toContain('high demand');

    // Reset and test signal timed out error
    await keyRingScheduler.resetAllCooldowns();
    const lease2 = await keyRingScheduler.acquireKey('gemini');
    const errTimeout: any = new Error('Gemini request timed out (20s): signal timed out');
    errTimeout.status = 408;
    errTimeout.isTimeout = true;
    await lease2.release(false, errTimeout);

    keys = await keyRingScheduler.refreshKeys();
    expect(keys[0].status).toBe('cooling_down');
    expect(keys[0].cooldownUntil).toBeGreaterThan(Date.now());
    expect(keys[0].lastError).toContain('timed out');
  });

  it('EPS rasterizer releases uncompressed canvas reference from EpsRenderResult after encoding', async () => {
    let createdCanvas: HTMLCanvasElement | null = null;
    const origCreateElement = document.createElement.bind(document);
    const spyCreate = vi.spyOn(document, 'createElement').mockImplementation((tagName: any) => {
      const el = origCreateElement(tagName);
      if (String(tagName).toLowerCase() === 'canvas') {
        createdCanvas = el as HTMLCanvasElement;
        (el as any).getContext = () => ({
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 1,
          font: '',
          textAlign: '',
          textBaseline: '',
          fillRect: () => {},
          strokeRect: () => {},
          fillText: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          closePath: () => {},
          fill: () => {},
          stroke: () => {},
          save: () => {},
          restore: () => {},
          translate: () => {},
          scale: () => {},
          transform: () => {},
          bezierCurveTo: () => {},
          drawImage: () => {},
        });
        (el as any).toDataURL = () => 'data:image/jpeg;base64,mockJpgData';
        (el as any).toBlob = (cb: any) => cb(new Blob(['mock'], { type: 'image/jpeg' }));
      }
      return el;
    });

    try {
      const sampleEps = new TextEncoder().encode(
        '%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 200 200\n0.2 0.4 0.8 setrgbcolor\n0 0 200 200 rectfill\n%%EOF'
      );
      const res = await rasterizeEpsBufferDirect(sampleEps.buffer, 'test_vector.eps', 384, 0.72);
      expect(res.width).toBe(384);
      expect(res.height).toBe(384);
      expect(res.canvas).toBeUndefined();
      expect(createdCanvas).not.toBeNull();
      expect(createdCanvas!.width).toBe(0);
      expect(createdCanvas!.height).toBe(0);
    } finally {
      spyCreate.mockRestore();
    }
  });
});
