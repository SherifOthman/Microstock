import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  rasterizeEpsWithWorker,
  terminateEpsWorker,
  isWorkerSupported,
  setWorkerFactoryForTesting,
  setMaxEpsConcurrencyForTesting,
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
    setMaxEpsConcurrencyForTesting(2); // Strict limit of 2 for testing
  });

  afterEach(() => {
    terminateEpsWorker();
    setWorkerFactoryForTesting(null);
    setMaxEpsConcurrencyForTesting(2);
  });

  it('detects worker availability accurately', () => {
    expect(isWorkerSupported()).toBe(true);
  });

  it('dispatches EPS buffer to worker off the main thread with transferable ArrayBuffer and creates objectUrl', async () => {
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

    // Simulate worker returning raw Blob without heavy main-thread base64
    const mockBlob = new Blob(['mock-binary-jpeg'], { type: 'image/jpeg' });
    const mockResult = {
      width: 512,
      height: 512,
      blob: mockBlob,
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
    expect(result.blob).toBe(mockBlob);
    // Instantaneous non-blocking objectUrl should be present
    expect(result.objectUrl || result.dataUrl).toBeTruthy();
    expect(result.sourceTier).toBe('binary_preview');
    expect(result.pathOpCount).toBe(150);
  });

  it('strictly limits worker concurrency to prevent CPU starvation and queues remaining tasks', async () => {
    setMaxEpsConcurrencyForTesting(2);

    const f1 = new File(['eps1'], 'f1.eps');
    const f2 = new File(['eps2'], 'f2.eps');
    const f3 = new File(['eps3'], 'f3.eps');
    const f4 = new File(['eps4'], 'f4.eps');

    // Launch 4 tasks simultaneously
    const p1 = rasterizeEpsWithWorker(f1);
    const p2 = rasterizeEpsWithWorker(f2);
    const p3 = rasterizeEpsWithWorker(f3);
    const p4 = rasterizeEpsWithWorker(f4);

    // Wait until initial batch posts
    await vi.waitFor(() => expect(mockWorkerInstance.postMessage).toHaveBeenCalledTimes(2));

    // Exactly 2 tasks should have been posted, while 2 wait in queue
    expect(postedMessages).toHaveLength(2);
    expect(postedMessages.map((m) => m.filename)).toEqual(['f1.eps', 'f2.eps']);

    // Complete the first task
    const msg1 = postedMessages[0];
    mockWorkerInstance.onmessage({
      data: {
        id: msg1.id,
        success: true,
        result: {
          width: 500,
          height: 500,
          blob: new Blob(['done']),
          sourceTier: 'vector',
        },
      },
    });

    await p1;

    // Resolving task 1 should immediately pump the queue and dispatch task 3
    await vi.waitFor(() => expect(mockWorkerInstance.postMessage).toHaveBeenCalledTimes(3));
    expect(postedMessages[2].filename).toBe('f3.eps');

    // Complete task 2
    const msg2 = postedMessages[1];
    mockWorkerInstance.onmessage({
      data: {
        id: msg2.id,
        success: true,
        result: {
          width: 500,
          height: 500,
          blob: new Blob(['done2']),
          sourceTier: 'vector',
        },
      },
    });

    await p2;

    // Resolving task 2 should immediately pump task 4
    await vi.waitFor(() => expect(mockWorkerInstance.postMessage).toHaveBeenCalledTimes(4));
    expect(postedMessages[3].filename).toBe('f4.eps');

    // Complete 3 & 4
    mockWorkerInstance.onmessage({
      data: {
        id: postedMessages[2].id,
        success: true,
        result: { width: 500, height: 500, blob: new Blob(['d3']), sourceTier: 'vector' },
      },
    });
    mockWorkerInstance.onmessage({
      data: {
        id: postedMessages[3].id,
        success: true,
        result: { width: 500, height: 500, blob: new Blob(['d4']), sourceTier: 'vector' },
      },
    });

    await Promise.all([p3, p4]);
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledTimes(4);
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
