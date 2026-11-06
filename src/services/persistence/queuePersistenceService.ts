import { db } from '../../db';
import { SupportedPlatform } from '../../types';

export type PersistentTaskModuleId = 'ftp' | 'studio' | 'eps' | 'cleaner' | 'audio' | 'tracker';
export type PersistentBatchStatus = 'idle' | 'running' | 'paused' | 'completed';

export interface PersistentQueueSnapshot<TItem = any, TTelemetry = Record<string, any>> {
  moduleId: PersistentTaskModuleId;
  sessionId?: string;
  batchStatus: PersistentBatchStatus;
  agencyId?: SupportedPlatform;
  queue: TItem[];
  telemetry?: TTelemetry;
  updatedAt?: number;
}

export interface HydratedQueueResult<TItem = any, TTelemetry = Record<string, any>> {
  moduleId: PersistentTaskModuleId;
  sessionId?: string;
  batchStatus: PersistentBatchStatus;
  wasInterrupted: boolean;
  recoverablePendingCount: number;
  queue: TItem[];
  telemetry: TTelemetry | null;
  updatedAt: number;
}

/**
 * Reconstructs a browser `File` object from a local disk path (`nativePath`) via Electron's `readLocalFile` IPC,
 * or creates a lightweight path-backed `File` handle when running in memory/test environments.
 */
export async function rehydrateFileFromDisk(params: {
  nativePath?: string;
  filename: string;
  mimeType?: string;
  size?: number;
  lastModified?: number;
}): Promise<File> {
  const { nativePath, filename, mimeType = 'application/octet-stream', lastModified = Date.now() } = params;
  if (nativePath && typeof window !== 'undefined' && window.electronAPI?.readLocalFile) {
    try {
      const res = await window.electronAPI.readLocalFile(nativePath);
      if (res?.success && res.buffer) {
        const f = new File([res.buffer], res.name || filename, {
          type: mimeType,
          lastModified,
        });
        Object.defineProperty(f, 'path', {
          value: nativePath,
          enumerable: true,
          configurable: true,
          writable: true,
        });
        Object.defineProperty(f, '__nativePath', {
          value: nativePath,
          enumerable: true,
          configurable: true,
          writable: true,
        });
        return f;
      }
    } catch {
      // fall through to path-backed stub
    }
  }

  const stub = new File([''], filename, { type: mimeType, lastModified });
  if (nativePath) {
    Object.defineProperty(stub, 'path', {
      value: nativePath,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(stub, '__nativePath', {
      value: nativePath,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return stub;
}

/**
 * Global Write-Behind Persistence & Background Task Lifecycle Service.
 * - Uses SQLite WAL (`persistent_task_queues`) via `db.queues` for atomic crash recovery across all 6 tools:
 *   `ftp`, `studio`, `tracker`, `cleaner`, `eps`, and `audio`.
 * - Coalesces rapid non-critical updates with a 250ms write-behind debounce
 *   while flushing structural state transitions immediately.
 * - Synchronizes active/paused task status with Electron Main Process (`window.electronAPI.tasks.updateLifecycleState`)
 *   and coordinates OS `powerSaveBlocker` so clicking `[X]` minimizes to the Windows System Tray whenever ANY tool
 *   has an active or paused task, and quits cleanly when all tools are idle.
 */
class GlobalQueuePersistenceManager {
  private debounceTimers = new Map<PersistentTaskModuleId, ReturnType<typeof setTimeout>>();
  private pendingSnapshots = new Map<PersistentTaskModuleId, PersistentQueueSnapshot<any, any>>();
  private moduleStates = new Map<
    PersistentTaskModuleId,
    { isRunning: boolean; isPaused: boolean; progressPercent: number; statusLabel: string }
  >();
  private lastPowerBlockerActive = false;

  /**
   * Strips non-serializable browser `File` objects, `Blob` buffers, and `blob:` URLs before saving to SQLite
   * so JSON serialization is fast and deterministic across all tools.
   */
  sanitizeQueueForStorage<T extends Record<string, any>>(queue: T[]): T[] {
    return queue.map((item) => {
      const clone: Record<string, any> = { ...item };

      // Preserve nativePath from attached File if not already set on the item
      const attachedFile = clone.file || clone.fileObject;
      if (!clone.nativePath && !clone.localPath && attachedFile) {
        const resolvedPath = (attachedFile as any).__nativePath || (attachedFile as any).path;
        if (resolvedPath) {
          clone.nativePath = resolvedPath;
        }
      }

      delete clone.file;
      delete clone.fileObject;
      delete clone.mutedFile;
      delete clone.mutedBlob;

      if (clone.result && typeof clone.result === 'object') {
        const resClone = { ...clone.result };
        delete resClone.blob;
        if (typeof resClone.objectUrl === 'string' && resClone.objectUrl.startsWith('blob:')) {
          delete resClone.objectUrl;
        }
        clone.result = resClone;
      }

      if (typeof clone.previewUrl === 'string' && clone.previewUrl.startsWith('blob:')) {
        delete clone.previewUrl;
      }
      if (typeof clone.previewThumbnailUrl === 'string' && clone.previewThumbnailUrl.startsWith('blob:')) {
        delete clone.previewThumbnailUrl;
      }
      if (typeof clone.thumbnailUrl === 'string' && clone.thumbnailUrl.startsWith('blob:')) {
        delete clone.thumbnailUrl;
      }

      if (clone.jpgPart && typeof clone.jpgPart === 'object') {
        const jpgClone = { ...clone.jpgPart };
        delete jpgClone.fileObject;
        clone.jpgPart = jpgClone;
      }
      if (clone.epsPart && typeof clone.epsPart === 'object') {
        const epsClone = { ...clone.epsPart };
        delete epsClone.fileObject;
        clone.epsPart = epsClone;
      }
      return clone as T;
    });
  }

  /**
   * Saves a module's queue and telemetry snapshot to SQLite (`persistent_task_queues`).
   * Pass `immediate = true` on structural state transitions (`succeeded`, `skipped`, `failed`, `paused`, `clear`).
   */
  async saveModuleQueueSnapshot<TItem extends Record<string, any>, TTelemetry = Record<string, any>>(
    snapshot: PersistentQueueSnapshot<TItem, TTelemetry>,
    immediate = false
  ): Promise<void> {
    const { moduleId } = snapshot;
    const sanitizedSnapshot: PersistentQueueSnapshot<TItem, TTelemetry> = {
      ...snapshot,
      queue: this.sanitizeQueueForStorage(snapshot.queue || []),
      updatedAt: Date.now(),
    };

    this.pendingSnapshots.set(moduleId, sanitizedSnapshot);

    const existingTimer = this.debounceTimers.get(moduleId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.debounceTimers.delete(moduleId);
    }

    if (immediate) {
      this.pendingSnapshots.delete(moduleId);
      await db.queues.saveSnapshot({
        moduleId: sanitizedSnapshot.moduleId,
        sessionId: sanitizedSnapshot.sessionId,
        batchStatus: sanitizedSnapshot.batchStatus,
        agencyId: sanitizedSnapshot.agencyId || 'dreamstime',
        queue: sanitizedSnapshot.queue,
        telemetry: sanitizedSnapshot.telemetry,
        updatedAt: sanitizedSnapshot.updatedAt,
      });
      return;
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(moduleId);
      const latest = this.pendingSnapshots.get(moduleId);
      if (!latest) return;
      this.pendingSnapshots.delete(moduleId);
      db.queues
        .saveSnapshot({
          moduleId: latest.moduleId,
          sessionId: latest.sessionId,
          batchStatus: latest.batchStatus,
          agencyId: latest.agencyId || 'dreamstime',
          queue: latest.queue,
          telemetry: latest.telemetry,
          updatedAt: latest.updatedAt,
        })
        .catch((err) => {
          console.warn(`[QueuePersistence] Failed saving snapshot for ${moduleId}:`, err);
        });
    }, 250);

    this.debounceTimers.set(moduleId, timer);
  }

  /**
   * Flushes any pending debounced snapshot immediately (e.g. on `prepare-force-quit`).
   */
  async flushModuleSnapshot(moduleId: PersistentTaskModuleId): Promise<void> {
    const existingTimer = this.debounceTimers.get(moduleId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.debounceTimers.delete(moduleId);
    }
    const pending = this.pendingSnapshots.get(moduleId);
    if (pending) {
      this.pendingSnapshots.delete(moduleId);
      await db.queues.saveSnapshot({
        moduleId: pending.moduleId,
        sessionId: pending.sessionId,
        batchStatus: pending.batchStatus,
        agencyId: pending.agencyId || 'dreamstime',
        queue: pending.queue,
        telemetry: pending.telemetry,
        updatedAt: Date.now(),
      });
    }
  }

  /**
   * Clears a module's persisted queue from SQLite (`Clear All`).
   */
  async clearModuleQueueSnapshot(moduleId: PersistentTaskModuleId): Promise<void> {
    const existingTimer = this.debounceTimers.get(moduleId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.debounceTimers.delete(moduleId);
    }
    this.pendingSnapshots.delete(moduleId);
    await db.queues.clearSnapshot(moduleId);
  }

  /**
   * Hydrates a module's queue on app startup and sanitizes any mid-flight items
   * (`'uploading'`, `'processing'`, `'rendering'`, `'resizing'`, `'retrying'`) interrupted by a crash or restart.
   */
  async hydrateModuleQueueSnapshot<
    TItem extends Record<string, any>,
    TTelemetry = Record<string, any>
  >(moduleId: PersistentTaskModuleId): Promise<HydratedQueueResult<TItem, TTelemetry> | null> {
    const stored = await db.queues.getSnapshot<TItem, TTelemetry>(moduleId);
    if (!stored || !Array.isArray(stored.queue) || stored.queue.length === 0) {
      return null;
    }

    let wasInterrupted = stored.batchStatus === 'running' || stored.batchStatus === 'paused';
    let recoverablePendingCount = 0;

    const hydratedQueue: TItem[] = stored.queue.map((rawItem) => {
      const item: Record<string, any> = { ...rawItem };

      // Reconstruct native previewUrl from localPath / nativePath if not a CSV
      const previewSourcePath = item.jpgPart?.localPath || item.localPath || item.nativePath;
      if (!item.isCsv && previewSourcePath && !item.previewUrl && moduleId === 'ftp') {
        item.previewUrl = `stockflow://local?path=${encodeURIComponent(previewSourcePath)}`;
      }

      // Sanitize mid-flight items across FTP, Studio, EPS, Audio, Cleaner, Tracker
      if (
        item.status === 'uploading' ||
        item.status === 'retrying' ||
        item.status === 'retry'
      ) {
        wasInterrupted = true;
        item.status = 'queued';
        item.retryCount = 0;
        item.errorCode = undefined;
        item.errorMessage = undefined;

        if (item.isVectorBundle && item.jpgPart?.uploaded && !item.epsPart?.uploaded) {
          item.bytesTransferred = Number(item.jpgPart.fileSize || 0);
          item.progressPercent = Math.round(
            (item.bytesTransferred / Math.max(1, Number(item.fileSize || 1))) * 100
          );
        } else {
          item.bytesTransferred = 0;
          item.progressPercent = 0;
        }
      } else if (item.status === 'processing' || item.status === 'resizing') {
        wasInterrupted = true;
        item.status = moduleId === 'studio' ? 'ready' : 'idle';
      } else if (item.status === 'rendering') {
        wasInterrupted = true;
        item.status = 'idle';
      }

      if (
        item.stage &&
        item.stage !== 'committed' &&
        item.stage !== 'duplicate_skipped' &&
        item.stage !== 'failed'
      ) {
        wasInterrupted = true;
        item.stage = 'queued';
        item.stageLabel = 'Queued';
      }

      if (
        item.status === 'queued' ||
        item.status === 'pending' ||
        item.status === 'ready' ||
        item.status === 'idle' ||
        item.stage === 'queued'
      ) {
        recoverablePendingCount++;
      }

      return item as TItem;
    });

    const resolvedBatchStatus: PersistentBatchStatus =
      recoverablePendingCount > 0 && wasInterrupted
        ? 'paused'
        : recoverablePendingCount === 0
        ? 'completed'
        : 'idle';

    return {
      moduleId,
      sessionId: stored.sessionId,
      batchStatus: resolvedBatchStatus,
      wasInterrupted: wasInterrupted && recoverablePendingCount > 0,
      recoverablePendingCount,
      queue: hydratedQueue,
      telemetry: stored.telemetry || null,
      updatedAt: stored.updatedAt,
    };
  }

  /**
   * Reports a module's running/paused state to the Electron Main Process so `mainWindow.on('close')`
   * knows whether clicking `[X]` should minimize to the Windows System Tray or quit the application,
   * and coordinates the OS `powerSaveBlocker` so Windows never sleeps while ANY tool is running.
   */
  async syncTaskLifecycleWithMainProcess(payload: {
    moduleId: PersistentTaskModuleId;
    isRunning: boolean;
    isPaused: boolean;
    progressPercent?: number;
    statusLabel?: string;
  }): Promise<{
    status: 'idle' | 'running' | 'paused';
    hasActiveOrPaused: boolean;
    activeCount: number;
    primaryLabel: string;
  }> {
    if (!payload.isRunning && !payload.isPaused) {
      this.moduleStates.delete(payload.moduleId);
    } else {
      this.moduleStates.set(payload.moduleId, {
        isRunning: payload.isRunning,
        isPaused: payload.isPaused,
        progressPercent: payload.progressPercent ?? 0,
        statusLabel: payload.statusLabel || '',
      });
    }

    let anyRunning = false;
    for (const st of this.moduleStates.values()) {
      if (st.isRunning && !st.isPaused) {
        anyRunning = true;
        break;
      }
    }

    // Automatically coordinate OS powerSaveBlocker across all tools
    if (
      anyRunning !== this.lastPowerBlockerActive &&
      typeof window !== 'undefined' &&
      window.electronAPI?.power?.setBlocker
    ) {
      this.lastPowerBlockerActive = anyRunning;
      window.electronAPI.power.setBlocker(anyRunning).catch(() => {});
    }

    if (typeof window !== 'undefined' && window.electronAPI?.tasks?.updateLifecycleState) {
      try {
        return await window.electronAPI.tasks.updateLifecycleState(payload);
      } catch (err) {
        console.warn('[QueuePersistence] syncTaskLifecycleWithMainProcess warning:', err);
      }
    }
    const status =
      payload.isRunning && !payload.isPaused
        ? 'running'
        : payload.isPaused
        ? 'paused'
        : 'idle';
    return {
      status,
      hasActiveOrPaused: payload.isRunning || payload.isPaused,
      activeCount: this.moduleStates.size,
      primaryLabel: payload.statusLabel || status,
    };
  }
}

export const queuePersistenceService = new GlobalQueuePersistenceManager();

