import { db } from '../../db';
import { SupportedPlatform } from '../../types';

export type PersistentTaskModuleId = 'ftp' | 'studio' | 'eps' | 'cleaner' | 'audio';
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
 * Global Write-Behind Persistence & Background Task Lifecycle Service.
 * - Uses SQLite WAL (`persistent_task_queues`) via `db.queues` for atomic crash recovery.
 * - Coalesces rapid non-critical updates (e.g. byte ticks or bulk file drops) with a 250ms write-behind debounce
 *   while flushing state transitions (`queued` -> `uploading`, `succeeded`, `paused`, `clear`) immediately.
 * - Synchronizes active/paused task status with Electron Main Process (`window.electronAPI.tasks.updateLifecycleState`)
 *   so clicking `[X]` minimizes to the Windows System Tray when a task is active or paused, and quits cleanly when idle.
 */
class GlobalQueuePersistenceManager {
  private debounceTimers = new Map<PersistentTaskModuleId, ReturnType<typeof setTimeout>>();
  private pendingSnapshots = new Map<PersistentTaskModuleId, PersistentQueueSnapshot<any, any>>();

  /**
   * Strips non-serializable browser `File` objects and `blob:` URLs before saving to SQLite
   * so JSON serialization is fast and deterministic.
   */
  sanitizeQueueForStorage<T extends Record<string, any>>(queue: T[]): T[] {
    return queue.map((item) => {
      const clone: Record<string, any> = { ...item };
      delete clone.fileObject;
      if (typeof clone.previewUrl === 'string' && clone.previewUrl.startsWith('blob:')) {
        delete clone.previewUrl;
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
   * Hydrates a module's queue on app startup and sanitizes any mid-flight `'uploading'` items:
   * - Items that were `'uploading'` when the crash/power loss occurred are reset to `'queued'`
   *   so they can be cleanly resumed.
   * - For `Vector Bundle (JPG + EPS)` items where Phase A (`jpgPart.uploaded === true`) had already
   *   completed before the crash, `jpgPart.uploaded` is preserved and `bytesTransferred` is set to
   *   `jpgPart.fileSize` so hitting Resume starts directly at Phase B (`EPS -> /additional`).
   * - Reconstructs `previewUrl` using `stockflow://local?path=...` from `localPath`.
   * - Restores unfinished batches in a **Paused / Ready-to-Resume** state (`batchStatus: 'paused'`).
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

      // Reconstruct native previewUrl from localPath if not a CSV
      const previewSourcePath = item.jpgPart?.localPath || item.localPath;
      if (!item.isCsv && previewSourcePath && !item.previewUrl) {
        item.previewUrl = `stockflow://local?path=${encodeURIComponent(previewSourcePath)}`;
      }

      // Sanitize mid-flight 'uploading' or 'retrying' items interrupted by crash/power loss
      if (item.status === 'uploading' || item.status === 'retrying' || item.status === 'retry') {
        wasInterrupted = true;
        item.status = 'queued';
        item.retryCount = 0;
        item.errorCode = undefined;
        item.errorMessage = undefined;

        if (item.isVectorBundle && item.jpgPart?.uploaded && !item.epsPart?.uploaded) {
          // Preserve completed Phase A (JPG preview already on root /)
          item.bytesTransferred = Number(item.jpgPart.fileSize || 0);
          item.progressPercent = Math.round(
            (item.bytesTransferred / Math.max(1, Number(item.fileSize || 1))) * 100
          );
        } else {
          item.bytesTransferred = 0;
          item.progressPercent = 0;
        }
      }

      if (item.status === 'queued') {
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
   * knows whether clicking `[X]` should minimize to the Windows System Tray or quit the application.
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
    if (typeof window !== 'undefined' && window.electronAPI?.tasks?.updateLifecycleState) {
      try {
        return await window.electronAPI.tasks.updateLifecycleState(payload);
      } catch (err) {
        console.warn('[QueuePersistence] syncTaskLifecycleWithMainProcess warning:', err);
      }
    }
    const status = payload.isRunning && !payload.isPaused ? 'running' : payload.isPaused ? 'paused' : 'idle';
    return {
      status,
      hasActiveOrPaused: payload.isRunning || payload.isPaused,
      activeCount: payload.isRunning || payload.isPaused ? 1 : 0,
      primaryLabel: payload.statusLabel || status,
    };
  }
}

export const queuePersistenceService = new GlobalQueuePersistenceManager();
