/**
 * EPS Web Worker Client Bridge & Concurrency Pool
 * 
 * Features:
 * - Strict concurrency queue limiting simultaneous EPS parsing (default: max 2-3 workers)
 *   to avoid starving the OS/Browser CPU and freezing the UI during 50+ file batch drops.
 * - Zero-copy Blob transfers with instantaneous non-blocking URL.createObjectURL(blob).
 * - Automatic timeout containment and graceful fallback to direct engine.
 */

import { EpsRenderResult, rasterizeEpsBufferDirect } from './epsWorkerCore';

interface PendingRequest {
  resolve: (res: EpsRenderResult) => void;
  reject: (err: Error) => void;
  timeoutId: any;
  onFinished: () => void;
}

export const DEFAULT_MAX_EPS_CONCURRENCY = Math.min(
  3,
  Math.max(1, typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) - 1 : 2)
);

let maxEpsConcurrency = DEFAULT_MAX_EPS_CONCURRENCY;
let runningTasks = 0;
const taskQueue: Array<() => void> = [];

let activeWorker: Worker | null = null;
const pendingRequests = new Map<string, PendingRequest>();
let testWorkerFactory: (() => Worker) | null = null;

export function setMaxEpsConcurrencyForTesting(limit: number) {
  maxEpsConcurrency = limit;
}

export function setWorkerFactoryForTesting(factory: (() => Worker) | null) {
  testWorkerFactory = factory;
}

export function isWorkerSupported(): boolean {
  if (testWorkerFactory) return true;
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

function pumpTaskQueue() {
  while (runningTasks < maxEpsConcurrency && taskQueue.length > 0) {
    const nextTask = taskQueue.shift();
    if (nextTask) {
      runningTasks++;
      nextTask();
    }
  }
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

    const { resolve, reject, timeoutId, onFinished } = pendingRequests.get(id)!;
    clearTimeout(timeoutId);
    pendingRequests.delete(id);
    onFinished();

    if (success && result) {
      // Instantaneous non-blocking client-side Object URL (0.01ms, 0 base64 overhead)
      const objectUrl =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && result.blob
          ? URL.createObjectURL(result.blob)
          : result.dataUrl || '';

      const finalResult: EpsRenderResult = {
        ...result,
        objectUrl,
        dataUrl: objectUrl || result.dataUrl || '',
      };
      resolve(finalResult);
    } else {
      reject(new Error(error || 'Worker rasterization failed'));
    }
  };

  activeWorker.onerror = (err: ErrorEvent) => {
    console.error('[EpsWorkerClient] Worker error event:', err);
    // Reject all currently pending requests to prevent hanging promises
    for (const [id, req] of pendingRequests.entries()) {
      clearTimeout(req.timeoutId);
      req.onFinished();
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
  taskQueue.length = 0;
  runningTasks = 0;
}

/**
 * Offloads EPS rendering to a dedicated background Web Worker with strict concurrency limiting.
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
    const executeTask = () => {
      let isTaskSettled = false;
      const onFinished = () => {
        if (!isTaskSettled) {
          isTaskSettled = true;
          runningTasks = Math.max(0, runningTasks - 1);
          pumpTaskQueue();
        }
      };

      try {
        const worker = initWorker();
        const id = crypto.randomUUID();

        const timeoutId = setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id);
            onFinished();
            terminateEpsWorker();
            // Fall back to direct in-thread execution if worker times out
            console.warn(`[EpsWorkerClient] Worker timed out on "${rawFileName}", falling back to direct engine.`);
            rasterizeEpsBufferDirect(buffer, rawFileName, targetLongestSide, jpegQuality)
              .then(resolve)
              .catch(reject);
          }
        }, 25000);

        pendingRequests.set(id, {
          resolve,
          reject,
          timeoutId,
          onFinished,
        });

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
        onFinished();
        console.warn('[EpsWorkerClient] Failed to dispatch to worker, executing directly:', err);
        rasterizeEpsBufferDirect(buffer, rawFileName, targetLongestSide, jpegQuality)
          .then(resolve)
          .catch(reject);
      }
    };

    taskQueue.push(executeTask);
    pumpTaskQueue();
  });
}
