/**
 * EPS Web Worker Client Bridge
 * 
 * Offloads PostScript parsing, CMYK math, and binary decoding to a background Web Worker,
 * keeping the React UI thread 100% responsive at 60fps during heavy file drops.
 * Includes timeout safeguards, error containment, and seamless direct fallback.
 */

import { EpsRenderResult, rasterizeEpsBufferDirect } from './epsWorkerCore';

interface PendingRequest {
  resolve: (res: EpsRenderResult) => void;
  reject: (err: Error) => void;
  timeoutId: any;
}

let activeWorker: Worker | null = null;
const pendingRequests = new Map<string, PendingRequest>();
let testWorkerFactory: (() => Worker) | null = null;

export function setWorkerFactoryForTesting(factory: (() => Worker) | null) {
  testWorkerFactory = factory;
}

export function isWorkerSupported(): boolean {
  if (testWorkerFactory) return true;
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

function initWorker(): Worker {
  if (activeWorker) return activeWorker;

  if (testWorkerFactory) {
    activeWorker = testWorkerFactory();
  } else {
    activeWorker = new Worker(new URL('./epsWorker.ts', import.meta.url), {
      type: 'module',
    });
  }

  activeWorker.onmessage = (e: MessageEvent) => {
    const { id, success, result, error } = e.data || {};
    if (!id || !pendingRequests.has(id)) return;

    const { resolve, reject, timeoutId } = pendingRequests.get(id)!;
    clearTimeout(timeoutId);
    pendingRequests.delete(id);

    if (success && result) {
      resolve(result as EpsRenderResult);
    } else {
      reject(new Error(error || 'Worker rasterization failed'));
    }
  };

  activeWorker.onerror = (err: ErrorEvent) => {
    console.error('[EpsWorkerClient] Worker error event:', err);
    // Reject all currently pending requests to prevent hanging promises
    for (const [id, req] of pendingRequests.entries()) {
      clearTimeout(req.timeoutId);
      req.reject(new Error(err.message || 'EpsWorker encountered an unhandled error'));
    }
    pendingRequests.clear();
    terminateEpsWorker();
  };

  return activeWorker;
}

export function terminateEpsWorker(): void {
  if (activeWorker) {
    try {
      activeWorker.terminate();
    } catch {
      // ignore
    }
    activeWorker = null;
  }
  for (const [id, req] of pendingRequests.entries()) {
    clearTimeout(req.timeoutId);
    req.reject(new Error('EPS worker terminated'));
  }
  pendingRequests.clear();
}

/**
 * Offloads EPS rendering to a dedicated background Web Worker.
 * If Web Workers are unavailable or fail, gracefully falls back to the direct in-process engine.
 */
export async function rasterizeEpsWithWorker(
  file: File | Blob,
  targetLongestSide = 4000,
  jpegQuality = 0.98
): Promise<EpsRenderResult> {
  const rawFileName = (file as File).name || 'vector.eps';
  const buffer = await file.arrayBuffer();

  if (!isWorkerSupported()) {
    return rasterizeEpsBufferDirect(buffer, rawFileName, targetLongestSide, jpegQuality);
  }

  return new Promise<EpsRenderResult>((resolve, reject) => {
    try {
      const worker = initWorker();
      const id = crypto.randomUUID();

      const timeoutId = setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          terminateEpsWorker();
          // Fall back to direct in-thread execution if worker times out
          console.warn(`[EpsWorkerClient] Worker timed out on "${rawFileName}", falling back to direct engine.`);
          rasterizeEpsBufferDirect(buffer, rawFileName, targetLongestSide, jpegQuality)
            .then(resolve)
            .catch(reject);
        }
      }, 25000);

      pendingRequests.set(id, { resolve, reject, timeoutId });

      // Transfer buffer for zero-copy memory dispatch to avoid main thread serialization overhead
      worker.postMessage(
        {
          id,
          type: 'rasterize',
          buffer,
          filename: rawFileName,
          maxDim: targetLongestSide,
          quality: jpegQuality,
        },
        [buffer]
      );
    } catch (err: any) {
      console.warn('[EpsWorkerClient] Failed to dispatch to worker, executing directly:', err);
      rasterizeEpsBufferDirect(buffer, rawFileName, targetLongestSide, jpegQuality)
        .then(resolve)
        .catch(reject);
    }
  });
}
