/**
 * Global Native OS Notification Service for StockFlow Desktop
 * Bridges to Electron Main Process `app:notifyBatchComplete` / `app:showNotification`
 * with fallback to Web Notification API when running outside Electron.
 */

export type NotificationModuleType = 'ftp' | 'studio' | 'cleaner' | 'eps' | 'audio';

export interface BatchNotificationPayload {
  module: NotificationModuleType;
  title?: string;
  body?: string;
  succeededCount?: number;
  skippedCount?: number;
  failedCount?: number;
  duration?: string;
}

export async function notifyBatchComplete(payload: BatchNotificationPayload): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    if (window.electronAPI?.notifyBatchComplete) {
      const res = await window.electronAPI.notifyBatchComplete(payload);
      return Boolean(res?.success);
    }

    if (payload.module === 'ftp' && window.electronAPI?.notifyUploadComplete) {
      window.electronAPI.notifyUploadComplete({
        succeededCount: payload.succeededCount ?? 0,
        failedCount: payload.failedCount ?? 0,
        skippedCount: payload.skippedCount ?? 0,
        duration: payload.duration,
      });
      return true;
    }

    if (window.electronAPI?.showNotification) {
      const res = await window.electronAPI.showNotification({
        title: payload.title || 'StockFlow — Batch Complete',
        body:
          payload.body ||
          `Uploaded: ${payload.succeededCount ?? 0} | Skipped: ${payload.skippedCount ?? 0} | Failed: ${
            payload.failedCount ?? 0
          }`,
      });
      return Boolean(res?.success);
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(payload.title || 'StockFlow — Batch Complete', {
        body:
          payload.body ||
          `Succeeded: ${payload.succeededCount ?? 0} | Skipped: ${payload.skippedCount ?? 0} | Failed: ${
            payload.failedCount ?? 0
          }`,
      });
      return true;
    }
  } catch (err) {
    console.warn('[osNotifications] Failed to dispatch OS notification:', err);
  }
  return false;
}
