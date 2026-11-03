import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { rasterizeEpsFile, EpsRenderResult } from '../../../services/eps/epsEngine';
import { saveFilesToLocalDirectory, FileToSave } from '../../../services/desktop/desktopFs';

export interface EpsConvertItem {
  id: string;
  file: File;
  originalName: string;
  outputJpgName: string;
  size: number;
  nativePath?: string;
  status: 'idle' | 'rendering' | 'completed' | 'error';
  progressMsg?: string;
  errorMessage?: string;
  result?: EpsRenderResult;
}

export function useEpsConverter(
  language: string,
  onSendToStudio?: (files: File[]) => void
) {
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const [items, setItems] = useState<EpsConvertItem[]>([]);
  const [isConvertingBatch, setIsConvertingBatch] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const revokeAllObjectUrls = useCallback(() => {
    objectUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    });
    objectUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    const trackedUrls = objectUrlsRef.current;
    return () => {
      trackedUrls.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      });
      trackedUrls.clear();
    };
  }, []);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) =>
      a.originalName.localeCompare(b.originalName, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [items]);

  const handleAddFiles = useCallback((newFiles: File[]) => {
    const epsFiles = newFiles.filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ext === 'eps' || ext === 'ai';
    });

    if (epsFiles.length === 0) {
      setStatusMessage({
        type: 'error',
        text: language === 'ar' ? 'يرجى اختيار ملفات .eps أو .ai فقط' : 'Please select .eps or .ai vector files only',
      });
      return;
    }

    const newItems: EpsConvertItem[] = epsFiles.map((file) => {
      const base = file.name.replace(/\.[^/.]+$/, '');
      let nativePath = (file as any).__nativePath || (file as any).path || '';
      if (!nativePath && typeof window !== 'undefined' && window.electronAPI?.getPathForFile) {
        try {
          nativePath = window.electronAPI.getPathForFile(file) || '';
        } catch {
          // ignore
        }
      }
      return {
        id: crypto.randomUUID(),
        file,
        originalName: file.name,
        outputJpgName: `${base}.jpg`,
        size: file.size,
        nativePath: nativePath || undefined,
        status: 'idle',
      };
    });

    setItems((prev) => {
      const existing = new Set(prev.map((p) => p.originalName));
      return [...prev, ...newItems.filter((n) => !existing.has(n.originalName))];
    });

    setStatusMessage(null);
  }, [language]);

  const handleRenderSingle = useCallback(async (item: EpsConvertItem) => {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: 'rendering', progressMsg: 'Rendering...' } : i))
    );

    try {
      const res = await rasterizeEpsFile(item.file);
      if (res.objectUrl) {
        objectUrlsRef.current.add(res.objectUrl);
      }
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== item.id) return i;
          if (i.result?.objectUrl && i.result.objectUrl !== res.objectUrl) {
            try {
              URL.revokeObjectURL(i.result.objectUrl);
            } catch {
              // ignore
            }
            objectUrlsRef.current.delete(i.result.objectUrl);
          }
          return { ...i, status: 'completed', result: res, progressMsg: undefined };
        })
      );
    } catch (err: any) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, status: 'error', errorMessage: err.message || 'Rasterization failed', progressMsg: undefined }
            : i
        )
      );
    }
  }, []);

  const handleConvertAll = useCallback(async () => {
    setIsConvertingBatch(true);
    setStatusMessage(null);

    const pending = sortedItems.filter((i) => i.status !== 'completed');
    const CONCURRENCY = 2;
    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      const subBatch = pending.slice(i, i + CONCURRENCY);
      await Promise.all(subBatch.map((item) => handleRenderSingle(item)));
    }

    setIsConvertingBatch(false);
    setStatusMessage({
      type: 'success',
      text: language === 'ar' ? 'اكتمل تحويل جميع ملفات الـ EPS بنجاح.' : 'All EPS files converted to 300 DPI JPG.',
    });
  }, [sortedItems, handleRenderSingle, language]);

  const handleSaveSingleJpg = useCallback(async (item: EpsConvertItem) => {
    if (!item.result?.blob) return;
    try {
      const res = await saveFilesToLocalDirectory([
        { name: item.outputJpgName, data: item.result.blob },
      ]);
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: language === 'ar' ? `تم حفظ ${item.outputJpgName}` : `Saved ${item.outputJpgName}`,
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to save',
      });
    }
  }, [language]);

  const handleSaveToDirectory = useCallback(async () => {
    const completed = items.filter((i) => i.result?.blob);
    if (completed.length === 0) return;

    try {
      const filesToSave: FileToSave[] = completed.map((item) => ({
        name: item.outputJpgName,
        data: item.result!.blob!,
      }));

      const res = await saveFilesToLocalDirectory(filesToSave, {
        folderName: 'EPS_Converted_JPGs',
      });

      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: language === 'ar' ? `تم حفظ ${res.savedCount} ملف JPG بنجاح.` : `Saved ${res.savedCount} JPG files to directory.`,
        });
      } else if (!res.canceled) {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to save to directory',
        });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setStatusMessage({
          type: 'error',
          text: err.message || 'Failed to save to directory',
        });
      }
    }
  }, [items, language]);

  const handleSendToStudio = useCallback(() => {
    if (!onSendToStudio) return;
    const completed = items.filter((i) => i.result?.blob || i.result?.dataUrl);
    if (completed.length === 0) return;

    // Pass the canonical .eps filename with pre-rendered JPG blob attached
    // so Metadata Studio displays .eps, downscales the JPEG blob to 384px, and avoids re-running Ghostscript
    const filesToSend: File[] = completed.map((item) => {
      const vectorFile = new File([item.result!.blob || item.file], item.originalName, {
        type: 'image/jpeg',
        lastModified: item.file.lastModified || Date.now(),
      });
      Object.defineProperty(vectorFile, '__sourceMediaType', {
        value: 'vector',
        enumerable: false,
        configurable: true,
      });
      Object.defineProperty(vectorFile, '__companionEpsName', {
        value: item.originalName,
        enumerable: false,
        configurable: true,
      });
      if (item.result?.dataUrl && item.result.dataUrl.startsWith('data:image/') && item.result.dataUrl.length <= 120_000) {
        Object.defineProperty(vectorFile, '__preRenderedDataUrl', {
          value: item.result.dataUrl,
          enumerable: false,
          configurable: true,
        });
      }
      if (item.result?.width) {
        Object.defineProperty(vectorFile, '__preRenderedWidth', {
          value: item.result.width,
          enumerable: false,
          configurable: true,
        });
      }
      if (item.result?.height) {
        Object.defineProperty(vectorFile, '__preRenderedHeight', {
          value: item.result.height,
          enumerable: false,
          configurable: true,
        });
      }
      if (item.nativePath) {
        Object.defineProperty(vectorFile, '__nativePath', {
          value: item.nativePath,
          enumerable: false,
          configurable: true,
        });
      }
      return vectorFile;
    });

    onSendToStudio(filesToSend);
  }, [items, onSendToStudio]);

  const handleClearAll = useCallback(() => {
    revokeAllObjectUrls();
    setItems([]);
    setStatusMessage(null);
  }, [revokeAllObjectUrls]);

  const completedCount = useMemo(() => items.filter((i) => i.status === 'completed').length, [items]);

  return {
    items,
    sortedItems,
    completedCount,
    isConvertingBatch,
    statusMessage,
    handleAddFiles,
    handleRenderSingle,
    handleConvertAll,
    handleSaveSingleJpg,
    handleSaveToDirectory,
    handleSendToStudio,
    handleClearAll,
  };
}
