import { useState, useCallback, useRef, useEffect } from 'react';
import {
  inspectVideoAudioTrack,
  stripAudioTrackLossless,
} from '../../../services/video/videoMuterEngine';
import { saveFilesToLocalDirectory, FileToSave } from '../../../services/desktop/desktopFs';
import {
  queuePersistenceService,
  rehydrateFileFromDisk,
} from '../../../services/persistence/queuePersistenceService';

export interface VideoMuteItem {
  id: string;
  file: File;
  originalName: string;
  size: number;
  nativePath?: string;
  hasAudio: boolean | null;
  status: 'idle' | 'processing' | 'completed' | 'error';
  errorMessage?: string;
  mutedBlob?: Blob;
  mutedSize?: number;
}

// Module-level session cache so unmounting on tab switch preserves active in-memory items
let cachedVideoMuteItems: VideoMuteItem[] = [];

export function resetVideoMuterInMemoryCache(): void {
  cachedVideoMuteItems = [];
}

export function useVideoMuter(language: string, onSendToStudio?: (files: File[]) => void) {
  const [items, setItems] = useState<VideoMuteItem[]>(() => cachedVideoMuteItems);
  const itemsRef = useRef<VideoMuteItem[]>(cachedVideoMuteItems);
  itemsRef.current = items;
  const [isMutingBatch, setIsMutingBatch] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);

  // Hydrate persisted Audio Stripper queue from SQLite / localStorage on app startup
  const hasHydratedRef = useRef(false);
  useEffect(() => {
    if (hasHydratedRef.current || cachedVideoMuteItems.length > 0) return;
    hasHydratedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const snap = await queuePersistenceService.hydrateModuleQueueSnapshot<VideoMuteItem>('audio');
        if (cancelled || !snap || snap.queue.length === 0) return;
        const rehydrated: VideoMuteItem[] = await Promise.all(
          snap.queue.map(async (raw) => {
            const file = await rehydrateFileFromDisk({
              nativePath: raw.nativePath,
              filename: raw.originalName,
              mimeType: 'video/mp4',
              size: raw.size,
            });
            return {
              ...raw,
              file,
              status: raw.status === 'completed' ? 'completed' : 'idle',
            };
          })
        );
        if (!cancelled && cachedVideoMuteItems.length === 0) {
          cachedVideoMuteItems = rehydrated;
          itemsRef.current = rehydrated;
          setItems(rehydrated);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync module cache, SQLite persistence, and Main Process lifecycle
  const hadItemsRef = useRef(items.length > 0);
  useEffect(() => {
    cachedVideoMuteItems = items;
    const isRunning = isMutingBatch || isExporting;
    const completed = items.filter((i) => i.status === 'completed').length;
    const pct = items.length > 0 ? Math.round((completed / items.length) * 100) : 0;

    queuePersistenceService
      .syncTaskLifecycleWithMainProcess({
        moduleId: 'audio',
        isRunning,
        isPaused: false,
        progressPercent: pct,
        statusLabel: isRunning
          ? `Audio Stripper (${completed}/${items.length})`
          : 'Idle',
      })
      .catch(() => {});

    if (items.length > 0) {
      hadItemsRef.current = true;
      queuePersistenceService
        .saveModuleQueueSnapshot(
          {
            moduleId: 'audio',
            batchStatus: isRunning ? 'running' : completed === items.length ? 'completed' : 'idle',
            queue: items,
          },
          !isRunning
        )
        .catch(() => {});
    } else if (hadItemsRef.current) {
      hadItemsRef.current = false;
      queuePersistenceService.clearModuleQueueSnapshot('audio').catch(() => {});
    }
  }, [items, isMutingBatch, isExporting]);

  const handleAddFiles = useCallback(async (newFiles: File[]) => {
    const videoFiles = newFiles.filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return f.type.startsWith('video/') || ext === 'mp4' || ext === 'mov';
    });

    if (videoFiles.length === 0) return;

    const now = Date.now();
    const createdItems: VideoMuteItem[] = videoFiles.map((file, idx) => {
      let nativePath = (file as any).__nativePath || (file as any).path || '';
      if (!nativePath && typeof window !== 'undefined' && window.electronAPI?.getPathForFile) {
        try {
          nativePath = window.electronAPI.getPathForFile(file) || '';
        } catch {
          // ignore
        }
      }
      return {
        id: `${file.name}-${file.size}-${now}-${idx}`,
        file,
        originalName: file.name,
        size: file.size,
        nativePath: nativePath || undefined,
        hasAudio: null,
        status: 'idle',
      };
    });

    setItems((prev) => {
      const next = [...prev, ...createdItems];
      itemsRef.current = next;
      return next;
    });
    setExportSuccessMessage(null);

    // Inspect audio tracks in bounded chunks of 16 (4 concurrent workers) so state flushes smoothly
    const CHUNK_SIZE = 16;
    const CONCURRENCY = 4;
    for (let i = 0; i < createdItems.length; i += CHUNK_SIZE) {
      const chunk = createdItems.slice(i, i + CHUNK_SIZE);
      const updates = new Map<string, boolean>();

      for (let j = 0; j < chunk.length; j += CONCURRENCY) {
        const sub = chunk.slice(j, j + CONCURRENCY);
        await Promise.all(
          sub.map(async (item) => {
            const inspection = await inspectVideoAudioTrack(item.file);
            updates.set(item.id, inspection.hasAudio);
          })
        );
      }

      setItems((prev) => {
        const next = prev.map((p) => (updates.has(p.id) ? { ...p, hasAudio: updates.get(p.id)! } : p));
        itemsRef.current = next;
        return next;
      });
    }
  }, []);

  const handleRemoveItem = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      itemsRef.current = next;
      cachedVideoMuteItems = next;
      if (next.length === 0) {
        hadItemsRef.current = false;
        queuePersistenceService.clearModuleQueueSnapshot('audio').catch(() => {});
      }
      return next;
    });
  }, []);

  const handleClearAll = useCallback(() => {
    cachedVideoMuteItems = [];
    itemsRef.current = [];
    hadItemsRef.current = false;
    setItems([]);
    setExportSuccessMessage(null);
    queuePersistenceService.clearModuleQueueSnapshot('audio').catch(() => {});
  }, []);

  const handleMuteSingle = useCallback(async (id: string) => {
    const currentItem = itemsRef.current.find((i) => i.id === id);
    if (!currentItem || currentItem.status === 'processing') return;
    const targetFile = currentItem.file;

    setItems((prev) => {
      const next = prev.map((i) =>
        i.id === id ? { ...i, status: 'processing' as const, errorMessage: undefined } : i
      );
      itemsRef.current = next;
      return next;
    });

    try {
      const mutedBlob = await stripAudioTrackLossless(targetFile);
      setItems((prev) => {
        const next = prev.map((i) =>
          i.id === id
            ? {
                ...i,
                status: 'completed' as const,
                hasAudio: false,
                mutedBlob,
                mutedSize: mutedBlob.size,
              }
            : i
        );
        itemsRef.current = next;
        return next;
      });
    } catch (err: any) {
      setItems((prev) => {
        const next = prev.map((i) =>
          i.id === id
            ? { ...i, status: 'error' as const, errorMessage: err?.message || 'Failed to strip audio' }
            : i
        );
        itemsRef.current = next;
        return next;
      });
    }
  }, []);

  const handleMuteAll = useCallback(async () => {
    if (itemsRef.current.length === 0 || isMutingBatch) return;
    setIsMutingBatch(true);
    setExportSuccessMessage(null);

    try {
      const pending = itemsRef.current.filter((i) => i.status !== 'completed');
      const hwThreads = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
      const CONCURRENCY = Math.min(4, Math.max(2, Math.floor(hwThreads / 2)));
      for (let i = 0; i < pending.length; i += CONCURRENCY) {
        const sub = pending.slice(i, i + CONCURRENCY);
        await Promise.all(sub.map((item) => handleMuteSingle(item.id)));
      }
    } finally {
      setIsMutingBatch(false);
    }
  }, [isMutingBatch, handleMuteSingle]);

  const handleDownloadSingle = useCallback(async (item: VideoMuteItem) => {
    let blobToDownload: Blob = item.mutedBlob || item.file;
    if (!item.mutedBlob && item.status !== 'completed') {
      try {
        blobToDownload = await stripAudioTrackLossless(item.file);
      } catch {
        blobToDownload = item.file;
      }
    }
    const url = URL.createObjectURL(blobToDownload);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', item.originalName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const handleExportToFolder = useCallback(async () => {
    if (items.length === 0) return;
    setIsExporting(true);
    setExportSuccessMessage(null);

    try {
      const filesToSave: FileToSave[] = [];
      for (const item of items) {
        let blobData: Blob = item.mutedBlob || item.file;
        if (item.status !== 'completed' && !item.mutedBlob) {
          try {
            blobData = await stripAudioTrackLossless(item.file);
            const finalSize = blobData.size;
            setItems((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? { ...i, status: 'completed', hasAudio: false, mutedBlob: blobData, mutedSize: finalSize }
                  : i
              )
            );
          } catch {
            blobData = item.file;
          }
        }
        filesToSave.push({
          name: item.originalName,
          data: blobData,
        });
      }

      const saveRes = await saveFilesToLocalDirectory(filesToSave, {
        folderName: 'Muted_Stock_Videos',
      });

      if (saveRes.success) {
        setExportSuccessMessage(
          language === 'ar'
            ? `تم حفظ ${saveRes.savedCount} فيديو صامت في المجلد بنجاح.`
            : `Saved ${saveRes.savedCount} silent videos to folder.`
        );
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Folder export failed:', err);
      }
    } finally {
      setIsExporting(false);
    }
  }, [items, language]);

  const handleSendToStudio = useCallback(() => {
    if (!onSendToStudio) return;
    const completed = items.filter((i) => i.status === 'completed' || i.hasAudio === false);
    const targetItems = completed.length > 0 ? completed : items;
    if (targetItems.length === 0) return;

    const filesToSend: File[] = targetItems.map((item) => {
      const blob = item.mutedBlob || item.file;
      const f = new File([blob], item.originalName, {
        type: item.file.type || 'video/mp4',
        lastModified: item.file.lastModified || Date.now(),
      });
      if (item.nativePath) {
        Object.defineProperty(f, '__nativePath', {
          value: item.nativePath,
          enumerable: false,
          configurable: true,
        });
      }
      return f;
    });

    onSendToStudio(filesToSend);
  }, [items, onSendToStudio]);

  return {
    items,
    isMutingBatch,
    isExporting,
    exportSuccessMessage,
    handleAddFiles,
    handleRemoveItem,
    handleClearAll,
    handleMuteSingle,
    handleMuteAll,
    handleDownloadSingle,
    handleExportToFolder,
    handleSendToStudio,
  };
}

