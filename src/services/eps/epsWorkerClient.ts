/**
 * EPS Web Worker Client Bridge & True Multi-Worker Concurrency Pool
 *
 * Features:
 * - True multi-worker pool (default: max 2-3 independent Worker instances)
 *   to avoid single-worker multiplexing bottlenecks and prevent UI freezes during 50+ file drops.
 * - Lazy on-demand `file.arrayBuffer()` reading ONLY when a concurrency slot is acquired,
 *   preventing upfront multi-gigabyte RAM spikes when queuing large batches.
 * - Safe fallback that re-reads a fresh ArrayBuffer from File/Blob if a transferred buffer
 *   was detached during a worker timeout or crash.
 * - Zero-copy Blob transfers with instantaneous non-blocking URL.createObjectURL(blob).
 */

import { EpsRenderResult, rasterizeEpsBufferDirect } from './epsWorkerCore';

interface PendingRequest {
  id: string;
  worker: Worker;
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

const idleWorkers: Worker[] = [];
const allWorkers = new Set<Worker>();
const pendingRequests = new Map<string, PendingRequest>();
let testWorkerFactory: (() => Worker) | null = null;

export function setMaxEpsConcurrencyForTesting(limit: number) {
  maxEpsConcurrency = Math.max(1, limit);
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

function attachWorkerHandlers(worker: Worker) {
  worker.onmessage = (e: MessageEvent) => {
    const { id, success, result, error } = e.data || {};
    if (!id || !pendingRequests.has(id)) return;

    const req = pendingRequests.get(id)!;
    clearTimeout(req.timeoutId);
    pendingRequests.delete(id);

    // Return worker to idle pool if still valid and not already listed
    if (allWorkers.has(req.worker) && !idleWorkers.includes(req.worker)) {
      idleWorkers.push(req.worker);
    }
    req.onFinished();

    if (success && result) {
      const objectUrl =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && result.blob
          ? URL.createObjectURL(result.blob)
          : result.dataUrl || '';

      const finalResult: EpsRenderResult = {
        ...result,
        objectUrl,
        dataUrl: result.dataUrl || objectUrl || '',
      };
      req.resolve(finalResult);
    } else {
      req.reject(new Error(error || 'Worker rasterization failed'));
    }
  };

  worker.onerror = (err: ErrorEvent) => {
    console.error('[EpsWorkerClient] Worker error event:', err);
    // Reject all pending requests associated with this crashed worker
    const affected: PendingRequest[] = [];
    for (const req of pendingRequests.values()) {
      if (req.worker === worker) {
        affected.push(req);
      }
    }
    // If shared mock worker or unassigned, reject all pending
    const toReject = affected.length > 0 ? affected : Array.from(pendingRequests.values());
    for (const req of toReject) {
      clearTimeout(req.timeoutId);
      pendingRequests.delete(req.id);
      req.onFinished();
      req.reject(new Error(err.message || 'EpsWorker encountered an unhandled error'));
    }
    destroySingleWorker(worker);
  };
}

function acquireWorkerInstance(): Worker {
  if (idleWorkers.length > 0) {
    return idleWorkers.pop()!;
  }

  const worker = testWorkerFactory
    ? testWorkerFactory()
    : new Worker(new URL('./epsWorker.ts', import.meta.url), {
        type: 'module',
      });

  allWorkers.add(worker);
  attachWorkerHandlers(worker);
  return worker;
}

function destroySingleWorker(worker: Worker) {
  allWorkers.delete(worker);
  const idx = idleWorkers.indexOf(worker);
  if (idx !== -1) {
    idleWorkers.splice(idx, 1);
  }
  try {
    worker.terminate();
  } catch {
    // ignore
  }
}

export function terminateEpsWorker(): void {
  for (const worker of Array.from(allWorkers)) {
    try {
      worker.terminate();
    } catch {
      // ignore
    }
  }
  allWorkers.clear();
  idleWorkers.length = 0;

  for (const [, req] of pendingRequests.entries()) {
    clearTimeout(req.timeoutId);
    req.reject(new Error('EPS worker terminated'));
  }
  pendingRequests.clear();
  taskQueue.length = 0;
  runningTasks = 0;
}

/**
 * Shared concurrency limiter for any EPS operation (including Tier 0 native Ghostscript)
 * so batch drops never flood main-thread memory with simultaneous ArrayBuffer reads.
 */
export function runInEpsPool<T>(taskFn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const execute = () => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          runningTasks = Math.max(0, runningTasks - 1);
          pumpTaskQueue();
        }
      };

      taskFn()
        .then((res) => {
          done();
          resolve(res);
        })
        .catch((err) => {
          done();
          reject(err);
        });
    };

    taskQueue.push(execute);
    pumpTaskQueue();
  });
}

/**
 * Offloads EPS rendering to a dedicated background Web Worker pool with strict concurrency limiting
 * and lazy ArrayBuffer allocation.
 */
export async function rasterizeEpsWithWorker(
  file: File | Blob,
  targetLongestSide = 4000,
  jpegQuality = 0.98
): Promise<EpsRenderResult> {
  const rawFileName = (file as File).name || 'vector.eps';

  if (!isWorkerSupported()) {
    return runInEpsPool(async () => {
      const buffer = await file.arrayBuffer();
      return rasterizeEpsBufferDirect(buffer, rawFileName, targetLongestSide, jpegQuality);
    });
  }

  return new Promise<EpsRenderResult>((resolve, reject) => {
    const executeTask = async () => {
      let isTaskSettled = false;
      const onFinished = () => {
        if (!isTaskSettled) {
          isTaskSettled = true;
          runningTasks = Math.max(0, runningTasks - 1);
          pumpTaskQueue();
        }
      };

      let buffer: ArrayBuffer;
      try {
        // Lazy allocation: only read File into ArrayBuffer once a concurrency slot is active!
        buffer = await file.arrayBuffer();
      } catch (readErr: any) {
        onFinished();
        reject(new Error(readErr?.message || `Failed to read EPS file "${rawFileName}"`));
        return;
      }

      let worker: Worker | null = null;
      try {
        worker = acquireWorkerInstance();
        const id = crypto.randomUUID();

        const timeoutId = setTimeout(async () => {
          if (pendingRequests.has(id)) {
            const timedOutReq = pendingRequests.get(id)!;
            pendingRequests.delete(id);
            destroySingleWorker(timedOutReq.worker);
            onFinished();

            console.warn(`[EpsWorkerClient] Worker timed out on "${rawFileName}", falling back with fresh buffer.`);
            try {
              // Re-read fresh buffer because the original buffer was transferred (detached)
              const fallbackBuffer = buffer.byteLength > 0 ? buffer : await file.arrayBuffer();
              const directRes = await rasterizeEpsBufferDirect(
                fallbackBuffer,
                rawFileName,
                Math.min(targetLongestSide, 2000),
                jpegQuality
              );
              resolve(directRes);
            } catch (fallbackErr: any) {
              reject(fallbackErr);
            }
          }
        }, 25000);

        pendingRequests.set(id, {
          id,
          worker,
          resolve,
          reject,
          timeoutId,
          onFinished,
        });

        // Transfer buffer for zero-copy memory dispatch
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
        if (worker) {
          destroySingleWorker(worker);
        }
        onFinished();
        console.warn('[EpsWorkerClient] Failed to dispatch to worker, executing fallback:', err);
        try {
          const fallbackBuffer = buffer.byteLength > 0 ? buffer : await file.arrayBuffer();
          const directRes = await rasterizeEpsBufferDirect(
            fallbackBuffer,
            rawFileName,
            Math.min(targetLongestSide, 2000),
            jpegQuality
          );
          resolve(directRes);
        } catch (fallbackErr: any) {
          reject(fallbackErr);
        }
      }
    };

    taskQueue.push(executeTask);
    pumpTaskQueue();
  });
}
