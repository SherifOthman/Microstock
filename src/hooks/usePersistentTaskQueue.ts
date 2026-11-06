import { useEffect, useState } from 'react';
import {
  HydratedQueueResult,
  PersistentTaskModuleId,
  queuePersistenceService,
} from '../services/persistence/queuePersistenceService';

/**
 * Reusable React hook that any StockFlow tool (`ftp`, `studio`, `eps`, `cleaner`, `audio`)
 * can use to hydrate its persisted SQLite task queue on mount and subscribe to Windows System Tray commands.
 */
export function usePersistentTaskQueue<
  TItem extends Record<string, any> = any,
  TTelemetry = Record<string, any>
>(
  moduleId: PersistentTaskModuleId,
  options?: {
    onHydrated?: (result: HydratedQueueResult<TItem, TTelemetry>) => void;
    onTrayPause?: () => void;
    onTrayResume?: () => void;
    onPrepareForceQuit?: () => void;
  }
) {
  const [isHydrating, setIsHydrating] = useState(true);
  const [hydratedResult, setHydratedResult] = useState<HydratedQueueResult<
    TItem,
    TTelemetry
  > | null>(null);

  useEffect(() => {
    let cancelled = false;
    queuePersistenceService
      .hydrateModuleQueueSnapshot<TItem, TTelemetry>(moduleId)
      .then((res) => {
        if (cancelled) return;
        setHydratedResult(res);
        setIsHydrating(false);
        if (res && options?.onHydrated) {
          options.onHydrated(res);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsHydrating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.tasks?.onTrayCommand) {
      return;
    }
    const unsub = window.electronAPI.tasks.onTrayCommand((payload) => {
      if (payload.command === 'pause-all') {
        options?.onTrayPause?.();
      } else if (payload.command === 'resume-all') {
        options?.onTrayResume?.();
      } else if (payload.command === 'prepare-force-quit') {
        queuePersistenceService.flushModuleSnapshot(moduleId).catch(() => {});
        options?.onPrepareForceQuit?.();
      }
    });
    return () => unsub();
  }, [moduleId, options?.onTrayPause, options?.onTrayResume, options?.onPrepareForceQuit]);

  return {
    isHydrating,
    hydratedResult,
    saveSnapshot: (
      snapshot: Omit<
        Parameters<typeof queuePersistenceService.saveModuleQueueSnapshot<TItem, TTelemetry>>[0],
        'moduleId'
      >,
      immediate = false
    ) =>
      queuePersistenceService.saveModuleQueueSnapshot<TItem, TTelemetry>(
        { ...snapshot, moduleId },
        immediate
      ),
    clearSnapshot: () => queuePersistenceService.clearModuleQueueSnapshot(moduleId),
    syncLifecycle: (state: {
      isRunning: boolean;
      isPaused: boolean;
      progressPercent?: number;
      statusLabel?: string;
    }) =>
      queuePersistenceService.syncTaskLifecycleWithMainProcess({
        moduleId,
        ...state,
      }),
  };
}
