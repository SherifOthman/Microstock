import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  rasterizeEpsWithWorker,
  terminateEpsWorker,
  isWorkerSupported,
  setWorkerFactoryForTesting,
} from '../../src/services/eps/epsWorkerClient';

describe('EPS Web Worker Background Engine (epsWorkerClient.ts)', () => {
  let mockWorkerInstance: any;
  let postedMessages: any[] = [];
  let transferredObjects: any[] = [];

  beforeEach(() => {
    postedMessages = [];
    transferredObjects = [];

    mockWorkerInstance = {
      postMessage: vi.fn((msg: any, transferables?: any[]) => {
        postedMessages.push(msg);
        if (transferables) {
          transferredObjects.push(...transferables);
        }
      }),
      terminate: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onmessage: null,
      onerror: null,
    };

    setWorkerFactoryForTesting(() => mockWorkerInstance);
  });

  afterEach(() => {
    terminateEpsWorker();
    setWorkerFactoryForTesting(null);
  });

  it('detects worker availability accurately', () => {
    expect(isWorkerSupported()).toBe(true);
  });

  it('dispatches EPS buffer to worker off the main thread with transferable ArrayBuffer', async () => {
    const epsBuffer = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    const epsFile = new File([epsBuffer], 'test_artwork.eps', { type: 'application/postscript' });

    // Start rasterization promise
    const promise = rasterizeEpsWithWorker(epsFile, 512, 0.8);

    // Wait for file.arrayBuffer() to resolve and post to worker
    await vi.waitFor(() => expect(mockWorkerInstance.postMessage).toHaveBeenCalledTimes(1));

    const sentMsg = postedMessages[0];
    expect(sentMsg.type).toBe('rasterize');
    expect(sentMsg.filename).toBe('test_artwork.eps');
    expect(sentMsg.maxDim).toBe(512);
    expect(sentMsg.quality).toBe(0.8);
    expect(sentMsg.buffer).toBeInstanceOf(ArrayBuffer);

    // Verify transferable buffer was passed for zero-copy memory transfer
    expect(transferredObjects.length).toBeGreaterThan(0);

    // Simulate worker success response
    const mockResult = {
      width: 512,
      height: 512,
      dataUrl: 'data:image/jpeg;base64,mockWorkerData',
      blob: new Blob(['mock'], { type: 'image/jpeg' }),
      sourceTier: 'binary_preview' as const,
      pathOpCount: 150,
    };

    mockWorkerInstance.onmessage({
      data: {
        id: sentMsg.id,
        success: true,
        result: mockResult,
      },
    });

    const result = await promise;
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    expect(result.dataUrl).toBe('data:image/jpeg;base64,mockWorkerData');
    expect(result.sourceTier).toBe('binary_preview');
    expect(result.pathOpCount).toBe(150);
  });

  it('handles worker errors gracefully and rejects the promise with worker error message', async () => {
    const epsFile = new File(['invalid postscript'], 'corrupt.eps');
    const promise = rasterizeEpsWithWorker(epsFile);

    await vi.waitFor(() => expect(mockWorkerInstance.postMessage).toHaveBeenCalledTimes(1));
    const sentMsg = postedMessages[0];

    // Simulate worker returning failure
    mockWorkerInstance.onmessage({
      data: {
        id: sentMsg.id,
        success: false,
        error: 'Corrupt EPS header: no BoundingBox or binary preview found',
      },
    });

    await expect(promise).rejects.toThrow('Corrupt EPS header');
  });

  it('handles worker general error events without crashing the app', async () => {
    const epsFile = new File(['something'], 'crash.eps');
    const promise = rasterizeEpsWithWorker(epsFile);

    await vi.waitFor(() => expect(mockWorkerInstance.postMessage).toHaveBeenCalledTimes(1));

    // Trigger worker.onerror
    if (mockWorkerInstance.onerror) {
      mockWorkerInstance.onerror(new ErrorEvent('error', { message: 'Out of memory in worker' }));
    }

    await expect(promise).rejects.toThrow('Out of memory in worker');
  });

  it('terminates the active worker instance and rejects pending requests cleanly', async () => {
    const epsFile = new File(['test'], 'test.eps');
    const promise = rasterizeEpsWithWorker(epsFile);

    await vi.waitFor(() => expect(mockWorkerInstance.postMessage).toHaveBeenCalledTimes(1));

    terminateEpsWorker();
    expect(mockWorkerInstance.terminate).toHaveBeenCalled();
    await expect(promise).rejects.toThrow('EPS worker terminated');
  });
});
