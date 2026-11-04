import { getDesktopSetting, setDesktopSetting } from "../../../db";
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  AssetOrigin,
  CleanedFileItem,
  CleanerOptions,
  DEFAULT_CLEANER_OPTIONS,
  ExistingBatchInfo,
  MediaResolutionValidation,
  MediaBatchesMap,
  SubFolderTrack,
  calculateAllMediaSlots,
  processFilesForBatchIngest,
  saveBatchFilesToMasterDirectory,
  validateMediaDimensions,
} from '../../../services/cleaner/fileCleanerEngine';

const EMPTY_MEDIA_BATCHES: MediaBatchesMap = {
  Photos: [],
  Videos: [],
  Vectors: [],
  AI_Photos: [],
  AI_Videos: [],
  AI_Vectors: [],
};

export function buildRenamedFilesFromCleanedItems(items: CleanedFileItem[], masterDir?: string): File[] {
  return items
    .filter((i) => !i.validation?.isBlocking)
    .map((item) => {
      const finalName = (item.customName !== undefined ? item.customName : item.cleanedName).trim();
      const renamedFile = new File([item.file], finalName, {
        type: item.file.type,
        lastModified: item.file.lastModified || Date.now(),
      });
      const isVector = item.subFolder === 'Vectors' || item.subFolder === 'AI_Vectors';
      if (isVector) {
        Object.defineProperty(renamedFile, '__sourceMediaType', {
          value: 'vector',
          enumerable: false,
          configurable: true,
        });
      }
      const isAi = Boolean(
        item.isAiGenerated || item.assetOrigin === 'ai' || item.subFolder.startsWith('AI_')
      );
      const origin: AssetOrigin = isAi ? 'ai' : 'real';
      Object.defineProperty(renamedFile, '__isAiGenerated', {
        value: isAi,
        enumerable: false,
        configurable: true,
      });
      Object.defineProperty(renamedFile, '__assetOrigin', {
        value: origin,
        enumerable: false,
        configurable: true,
      });

      const rootFolder = origin === 'ai' ? 'AI' : 'Real';
      const cleanMaster = masterDir ? masterDir.replace(/[\\/]+$/, '') : '';
      const resolvedPath = cleanMaster
        ? `${cleanMaster}/${rootFolder}/${item.subFolder}/${item.batchFolder}/${finalName}`
        : item.nativePath || (item.file as any).__nativePath || (item.file as any).path || '';

      if (resolvedPath) {
        Object.defineProperty(renamedFile, '__nativePath', {
          value: resolvedPath,
          enumerable: false,
          configurable: true,
        });
      }

      // If vector asset, link companion JPG path if available
      if (isVector && cleanMaster) {
        const companionBase = finalName.replace(/\.[^/.]+$/, '');
        const companionJpgPath = `${cleanMaster}/${rootFolder}/${item.subFolder}/${item.batchFolder}/${companionBase}.jpg`;
        Object.defineProperty(renamedFile, '__companionJpgNativePath', {
          value: companionJpgPath,
          enumerable: false,
          configurable: true,
        });
      }

      return renamedFile;
    });
}

export function useFileCleaner(language: string, onSendToStudio?: (files: File[]) => void) {
  // Load desktop settings on mount from SQLite
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const [savedDir, savedOrigin, savedBatchSize] = await Promise.all([
        getDesktopSetting<string>('stock_cleaner_master_dir', ''),
        getDesktopSetting<AssetOrigin>('stock_cleaner_asset_origin', 'real'),
        getDesktopSetting<number>('stock_cleaner_batch_size', 100),
      ]);
      if (!isMounted) return;
      if (savedDir) {
        setMasterDirectory(savedDir);
        scanMasterDirectory(savedDir);
      }
      setOptionsState((prev) => ({
        ...prev,
        assetOrigin: savedOrigin,
        maxItemsPerBatch: savedBatchSize,
      }));
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Master Destination Directory & Disk State
  const [masterDirectory, setMasterDirectory] = useState<string>(() => {
    return localStorage.getItem('stock_cleaner_master_dir') || '';
  });
  const [mediaBatches, setMediaBatches] = useState<MediaBatchesMap>(EMPTY_MEDIA_BATCHES);
  const [existingBatches, setExistingBatches] = useState<ExistingBatchInfo[]>([]);
  const [isScanningDisk, setIsScanningDisk] = useState(false);

  // Imported Files & Configuration
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const [lastProcessedFiles, setLastProcessedFiles] = useState<File[]>([]);
  const [isBatchSaved, setIsBatchSaved] = useState(false);
  const [nativePaths, setNativePaths] = useState<Record<string, string>>({});
  const [options, setOptionsState] = useState<CleanerOptions>(() => {
    const savedOrigin = localStorage.getItem('stock_cleaner_asset_origin');
    const assetOrigin: AssetOrigin = savedOrigin === 'ai' ? 'ai' : 'real';
    const savedBatchSize = localStorage.getItem('stock_cleaner_batch_size');
    const maxItemsPerBatch = savedBatchSize ? parseInt(savedBatchSize, 10) || 100 : 100;
    return {
      ...DEFAULT_CLEANER_OPTIONS,
      assetOrigin,
      maxItemsPerBatch,
    };
  });

  const setOptions: React.Dispatch<React.SetStateAction<CleanerOptions>> = useCallback((updater) => {
    setOptionsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next.assetOrigin && next.assetOrigin !== prev.assetOrigin) {
        setDesktopSetting('stock_cleaner_asset_origin', next.assetOrigin);
        setIsBatchSaved(false);
      }
      if (next.maxItemsPerBatch && next.maxItemsPerBatch !== prev.maxItemsPerBatch) {
        setDesktopSetting('stock_cleaner_batch_size', next.maxItemsPerBatch);
      }
      return next;
    });
  }, []);
  const [shuffleSeed, setShuffleSeed] = useState(1);
  const [searchFilter, setSearchFilter] = useState('');
  const [manualOverrides, setManualOverrides] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [processProgress, setProcessProgress] = useState<{ processed: number; total: number } | null>(null);
  const [statusNotification, setStatusNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Dialog States for Duplicates & Success
  const [showDuplicateInterceptDialog, setShowDuplicateInterceptDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successDialogInfo, setSuccessDialogInfo] = useState<{
    savedCount: number;
    batches: string[];
    masterDir: string;
  } | null>(null);

  // Active duplicate group key for modal comparison
  const [activeDuplicateKey, setActiveDuplicateKey] = useState<string | null>(null);

  // Dismissible Warning for Sequential Sorting
  const [isSeqWarningDismissed, setIsSeqWarningDismissed] = useState(false);

  // File Validations Map (Keyed by file unique identifier)
  const [validations, setValidations] = useState<Record<string, MediaResolutionValidation>>({});
  const validatedKeysRef = useRef<Set<string>>(new Set());
  const validationRunIdRef = useRef(0);

  // Scan Master Directory from disk via Electron native fs
  const scanMasterDirectory = useCallback(async (dirPath: string) => {
    if (!dirPath || typeof window === 'undefined' || !window.electronAPI?.scanMasterDirectory) {
      return;
    }

    setIsScanningDisk(true);
    try {
      const res = await window.electronAPI.scanMasterDirectory(dirPath);
      if (res.success) {
        if (res.mediaBatches) {
          setMediaBatches({
            ...EMPTY_MEDIA_BATCHES,
            ...res.mediaBatches,
          });
        }
        if (res.batches) {
          setExistingBatches(res.batches);
        }
      } else {
        setMediaBatches(EMPTY_MEDIA_BATCHES);
        setExistingBatches([]);
      }
    } catch (err) {
      console.error('[FileCleaner] Failed to scan master directory:', err);
      setMediaBatches(EMPTY_MEDIA_BATCHES);
      setExistingBatches([]);
    } finally {
      setIsScanningDisk(false);
    }
  }, []);

  // Initial scan on mount if directory is remembered
  useEffect(() => {
    if (masterDirectory) {
      scanMasterDirectory(masterDirectory);
    }
  }, [masterDirectory, scanMasterDirectory]);

  // Handle User choosing the Master Destination Directory
  const handleSelectMasterDirectory = async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.selectDirectory) return;

    try {
      const res = await window.electronAPI.selectDirectory({
        title: language === 'ar' ? 'حدد مجلد الوجهة الرئيسي للأصول' : 'Select Master Stock Destination Directory',
        defaultPath: masterDirectory || undefined,
      });

      if (!res.canceled && res.path) {
        setMasterDirectory(res.path);
        setDesktopSetting('stock_cleaner_master_dir', res.path);
        setStatusNotification(null);
        await scanMasterDirectory(res.path);
      }
    } catch (err: any) {
      setStatusNotification({
        type: 'error',
        message: err.message || 'Failed to open directory picker',
      });
    }
  };

  // Calculate Next Available Slots based on disk state per media type
  const mediaSlots = useMemo(() => {
    return calculateAllMediaSlots(mediaBatches, options.maxItemsPerBatch);
  }, [mediaBatches, options.maxItemsPerBatch]);

  // Validate imported files resolutions asynchronously in bounded chunks of 50 (no effect loop)
  useEffect(() => {
    let isCancelled = false;
    const currentRun = ++validationRunIdRef.current;

    const unvalidatedFiles = rawFiles.filter((file) => {
      const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
      return !validatedKeysRef.current.has(fileKey);
    });

    if (unvalidatedFiles.length === 0) return;

    const runValidations = async () => {
      const CHUNK_SIZE = 50;
      const CONCURRENCY = 8;

      for (let i = 0; i < unvalidatedFiles.length; i += CHUNK_SIZE) {
        if (isCancelled || validationRunIdRef.current !== currentRun) break;
        const chunk = unvalidatedFiles.slice(i, i + CHUNK_SIZE);
        const chunkResults: Record<string, MediaResolutionValidation> = {};

        for (let j = 0; j < chunk.length; j += CONCURRENCY) {
          if (isCancelled || validationRunIdRef.current !== currentRun) break;
          const subBatch = chunk.slice(j, j + CONCURRENCY);
          await Promise.all(
            subBatch.map(async (file) => {
              const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
              const val = await validateMediaDimensions(file);
              if (!isCancelled && validationRunIdRef.current === currentRun) {
                validatedKeysRef.current.add(fileKey);
                chunkResults[fileKey] = val;
              }
            })
          );
        }

        if (!isCancelled && validationRunIdRef.current === currentRun && Object.keys(chunkResults).length > 0) {
          setValidations((prev) => ({ ...prev, ...chunkResults }));
        }
      }
    };

    runValidations();

    return () => {
      isCancelled = true;
    };
  }, [rawFiles]);

  // Import files deduplicated and record native disk paths for Explorer interactions
  const handleAddFiles = useCallback((newFiles: File[]) => {
    if (newFiles.length === 0) return;

    // Collect native filesystem paths via Electron webUtils
    const newPaths: Record<string, string> = {};
    for (const f of newFiles) {
      let p = '';
      if (typeof window !== 'undefined' && window.electronAPI?.getPathForFile) {
        try {
          p = window.electronAPI.getPathForFile(f);
        } catch {
          p = (f as any).path || '';
        }
      } else {
        p = (f as any).path || '';
      }
      if (p) {
        newPaths[f.name] = p;
      }
    }
    if (Object.keys(newPaths).length > 0) {
      setNativePaths((prev) => ({ ...prev, ...newPaths }));
    }

    setRawFiles((prev) => {
      const combined = [...prev, ...newFiles];
      const uniqueMap = new Map<string, File>();
      for (const f of combined) {
        uniqueMap.set(`${f.name}-${f.size}`, f);
      }
      return Array.from(uniqueMap.values());
    });
    setIsBatchSaved(false);
    setStatusNotification(null);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleAddFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  }, [handleAddFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(Array.from(e.dataTransfer.files));
    }
  }, [handleAddFiles]);

  // Step 1: Compute base batch routing & fuzzy duplicate matching ONLY when files/options/slots change
  // (Decoupled from `validations` so bulk-drop resolution checks do not re-trigger O(N log N) sorting & Levenshtein)
  const baseProcessedItems: CleanedFileItem[] = useMemo(() => {
    if (rawFiles.length === 0) return [];
    return processFilesForBatchIngest(rawFiles, options, mediaSlots, shuffleSeed, nativePaths);
  }, [rawFiles, options, mediaSlots, shuffleSeed, nativePaths]);

  // Step 2: Lightweight O(N) merge of manual overrides and async resolution validations
  const cleanedItems: CleanedFileItem[] = useMemo(() => {
    if (baseProcessedItems.length === 0) return [];
    return baseProcessedItems.map((item) => {
      const fileKey = `${item.file.name}-${item.file.size}-${item.file.lastModified}`;
      const custom = manualOverrides[item.id];
      const finalName = custom || item.cleanedName;
      return {
        ...item,
        customName: custom,
        charCount: finalName.length,
        validation: validations[fileKey],
      };
    });
  }, [baseProcessedItems, manualOverrides, validations]);

  // Count blocking errors and soft warnings
  const blockingErrorCount = useMemo(() => {
    return cleanedItems.filter((i) => i.validation?.isBlocking).length;
  }, [cleanedItems]);

  const softWarningCount = useMemo(() => {
    return cleanedItems.filter(
      (i) =>
        (i.subFolder === 'Photos' || i.subFolder === 'AI_Photos') &&
        i.validation?.warningType === 'photo_low_resolution'
    ).length;
  }, [cleanedItems]);

  // Non-upscaled photos that require upscaling to 4K+ (width < 3000 || height < 3000)
  const lowResPhotos = useMemo(() => {
    return cleanedItems.filter(
      (i) =>
        (i.subFolder === 'Photos' || i.subFolder === 'AI_Photos') &&
        i.validation?.warningType === 'photo_low_resolution'
    );
  }, [cleanedItems]);

  // Total duplicates detected across the whole queue
  const totalDuplicateCount = useMemo(() => {
    return cleanedItems.filter((i) => i.isDuplicate).length;
  }, [cleanedItems]);

  const duplicateGroupKeys = useMemo(() => {
    return Array.from(new Set(cleanedItems.filter((i) => i.isDuplicate).map((i) => i.fuzzyKey)));
  }, [cleanedItems]);

  // Items currently being viewed in the Duplicate Comparison Modal
  const currentDuplicateModalItems = useMemo(() => {
    if (!activeDuplicateKey) return [];
    return cleanedItems.filter((i) => i.fuzzyKey === activeDuplicateKey);
  }, [cleanedItems, activeDuplicateKey]);

  // Calculate batch distribution summary grouped by Media Track and Batch Folder
  const batchDistribution = useMemo(() => {
    const counts = new Map<string, { folder: string; subFolder: SubFolderTrack; total: number; isNew: boolean }>();
    for (const item of cleanedItems) {
      const key = `${item.subFolder}/${item.batchFolder}`;
      const existing = counts.get(key) || {
        folder: item.batchFolder,
        subFolder: item.subFolder,
        total: 0,
        isNew: !(mediaBatches[item.subFolder] || []).some((b) => b.name.toLowerCase() === item.batchFolder.toLowerCase()),
      };
      existing.total++;
      counts.set(key, existing);
    }

    const TRACK_ORDER: Record<string, number> = {
      Photos: 1,
      AI_Photos: 1,
      Videos: 2,
      AI_Videos: 2,
      Vectors: 3,
      AI_Vectors: 3,
    };

    return Array.from(counts.values()).sort((a, b) => {
      const trackDiff = (TRACK_ORDER[a.subFolder] || 99) - (TRACK_ORDER[b.subFolder] || 99);
      if (trackDiff !== 0) return trackDiff;
      const aNum = parseInt((a.folder.match(/\d+/) || ['0'])[0], 10);
      const bNum = parseInt((b.folder.match(/\d+/) || ['0'])[0], 10);
      return aNum - bNum;
    });
  }, [cleanedItems, mediaBatches]);

  // Filtered items for search
  const filteredItems = useMemo(() => {
    if (!searchFilter.trim()) return cleanedItems;
    const q = searchFilter.toLowerCase();
    return cleanedItems.filter(
      (item) =>
        item.originalName.toLowerCase().includes(q) ||
        (item.customName || item.cleanedName).toLowerCase().includes(q) ||
        item.batchFolder.toLowerCase().includes(q) ||
        item.subFolder.toLowerCase().includes(q)
    );
  }, [cleanedItems, searchFilter]);

  // Remove item and smart-quarantine to _Needs_Fixing/[MediaType] folder if file has warnings
  const handleRemoveItem = useCallback(async (id: string, fileToRemove?: File, itemToQuarantine?: CleanedFileItem) => {
    if (itemToQuarantine) {
      const hasWarning = Boolean(
        itemToQuarantine.validation?.isBlocking ||
        itemToQuarantine.validation?.warningType === 'photo_low_resolution' ||
        (itemToQuarantine.validation && !itemToQuarantine.validation.isValid)
      );

      if (hasWarning && itemToQuarantine.nativePath && typeof window !== 'undefined' && window.electronAPI?.quarantineFile) {
        try {
          const res = await window.electronAPI.quarantineFile({
            filePath: itemToQuarantine.nativePath,
            mediaType: itemToQuarantine.subFolder,
            masterDir: masterDirectory,
          });
          if (res.success && res.moved) {
            setStatusNotification({
              type: 'success',
              message:
                language === 'ar'
                  ? `تم نقل "${itemToQuarantine.originalName}" إلى مجلد _Needs_Fixing/${itemToQuarantine.subFolder} وإزالته من القائمة.`
                  : `Moved "${itemToQuarantine.originalName}" to _Needs_Fixing/${itemToQuarantine.subFolder} & removed from queue.`,
            });
          }
        } catch (err) {
          console.warn('[FileCleaner] Quarantine failed silently:', err);
        }
      }
    }

    setRawFiles((prev) =>
      prev.filter((f) => {
        if (fileToRemove) {
          return f !== fileToRemove && !(f.name === fileToRemove.name && f.size === fileToRemove.size && f.lastModified === fileToRemove.lastModified);
        }
        return !id.startsWith(`${f.name}-${f.size}`);
      })
    );
    setManualOverrides((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }, [masterDirectory, language]);

  // Bulk-move all non-upscaled photos to _Needs_Fixing/[Photos | AI_Photos] in one click
  const handleBulkMoveLowResPhotos = useCallback(async () => {
    if (lowResPhotos.length === 0) return;
    setIsBulkMoving(true);
    const targetPhotoFolder = options.assetOrigin === 'ai' ? 'AI_Photos' : 'Photos';

    try {
      for (const item of lowResPhotos) {
        if (item.nativePath && typeof window !== 'undefined' && window.electronAPI?.quarantineFile) {
          try {
            await window.electronAPI.quarantineFile({
              filePath: item.nativePath,
              mediaType: item.subFolder || targetPhotoFolder,
              masterDir: masterDirectory,
            });
          } catch (err) {
            console.warn('[FileCleaner] Bulk quarantine item failed silently:', err);
          }
        }
      }

      const lowResIds = new Set(lowResPhotos.map((i) => i.id));
      const lowResFileNames = new Set(lowResPhotos.map((i) => i.originalName));

      setRawFiles((prev) => prev.filter((f) => !lowResFileNames.has(f.name)));
      setManualOverrides((prev) => {
        const copy = { ...prev };
        for (const id of lowResIds) {
          delete copy[id];
        }
        return copy;
      });

      setStatusNotification({
        type: 'success',
        message:
          language === 'ar'
            ? `تم بنجاح نقل ${lowResPhotos.length} صورة تحتاج إلى تكبير إلى مجلد _Needs_Fixing/${targetPhotoFolder} وإزالتها من القائمة.`
            : `Successfully moved ${lowResPhotos.length} low-res photo(s) to _Needs_Fixing/${targetPhotoFolder} & removed from queue.`,
      });
    } catch (err: any) {
      console.error('[FileCleaner] Bulk move error:', err);
      setStatusNotification({
        type: 'error',
        message: err.message || 'Failed to complete bulk quarantine.',
      });
    } finally {
      setIsBulkMoving(false);
    }
  }, [lowResPhotos, masterDirectory, language, options.assetOrigin]);

  const handleClearAll = useCallback(() => {
    validationRunIdRef.current++;
    setRawFiles([]);
    setManualOverrides({});
    setValidations({});
    validatedKeysRef.current.clear();
    setIsBatchSaved(false);
    setStatusNotification(null);
  }, []);

  const handleReShuffle = useCallback(() => {
    setShuffleSeed((prev) => prev + 1);
    setIsBatchSaved(false);
  }, []);

  // Native Process & Save Directly to Hard Drive
  const handleProcessAndSave = useCallback(async () => {
    let targetMasterDir = masterDirectory;

    // If user hasn't picked a Master Directory yet, open native folder picker on the spot
    if (!targetMasterDir && typeof window !== 'undefined' && window.electronAPI?.selectDirectory) {
      try {
        const pickRes = await window.electronAPI.selectDirectory({
          title: language === 'ar' ? 'حدد مجلد الوجهة لحفظ الملفات المنظمة' : 'Select Destination Folder to Save Organized Files',
        });
        if (!pickRes.canceled && pickRes.path) {
          targetMasterDir = pickRes.path;
          setMasterDirectory(pickRes.path);
          setDesktopSetting('stock_cleaner_master_dir', pickRes.path);
          await scanMasterDirectory(pickRes.path);
        }
      } catch {
        // ignore
      }
    }

    if (!targetMasterDir) {
      setStatusNotification({
        type: 'error',
        message: language === 'ar' ? 'الرجاء تحديد مجلد الوجهة الرئيسي أولاً' : 'Please select a Master Destination Directory first.',
      });
      return;
    }

    if (blockingErrorCount > 0) {
      setStatusNotification({
        type: 'error',
        message:
          language === 'ar'
            ? `لا يمكن بدء الحفظ: يوجد ${blockingErrorCount} فيديو بدقة غير متوافقة مع الستوك. يجب تصحيح الدقة أو حذف الملفات أولاً.`
            : `Cannot process: ${blockingErrorCount} video(s) have invalid resolutions. Must be 1080p or 4K. Fix or remove them before proceeding.`,
      });
      return;
    }

    if (cleanedItems.length === 0) return;

    setIsProcessing(true);
    setProcessProgress({ processed: 0, total: cleanedItems.length });
    setProgressMsg(language === 'ar' ? 'جارٍ حفظ وتقسيم الملفات إلى المجلدات...' : 'Saving and routing files into sub-folders...');
    setStatusNotification(null);

    try {
      const res = await saveBatchFilesToMasterDirectory(
        targetMasterDir,
        cleanedItems,
        (done, total, cur) => {
          setProcessProgress({ processed: done, total });
          setProgressMsg(
            language === 'ar'
              ? `تم حفظ ${done} من أصل ${total} ملف... (${cur})`
              : `Saved ${done} of ${total} files... (${cur})`
          );
        }
      );

      if (res.success) {
        const preparedFiles = buildRenamedFilesFromCleanedItems(cleanedItems, targetMasterDir);
        setLastProcessedFiles(preparedFiles);
        setIsBatchSaved(true);

        const touchedBatches = Array.from(new Set(cleanedItems.map((i) => `${i.subFolder}/${i.batchFolder}`)));
        setSuccessDialogInfo({
          savedCount: res.savedCount,
          batches: touchedBatches,
          masterDir: targetMasterDir,
        });
        setShowSuccessDialog(true);

        await scanMasterDirectory(targetMasterDir);
        setRawFiles([]);
        setManualOverrides({});
      } else {
        setStatusNotification({
          type: 'error',
          message: res.error || 'Failed to save batch files',
        });
      }
    } catch (err: any) {
      setStatusNotification({
        type: 'error',
        message: err.message || 'An unexpected error occurred during ingestion',
      });
    } finally {
      setIsProcessing(false);
      setProcessProgress(null);
      setProgressMsg(null);
    }
  }, [masterDirectory, blockingErrorCount, cleanedItems, language, scanMasterDirectory]);

  // Intercept process action if potential duplicates exist
  const handleInitiateProcess = useCallback(() => {
    if (totalDuplicateCount > 0) {
      setShowDuplicateInterceptDialog(true);
    } else {
      handleProcessAndSave();
    }
  }, [totalDuplicateCount, handleProcessAndSave]);

  const handleSendToStudio = useCallback(() => {
    if (!onSendToStudio) return;
    if (lastProcessedFiles.length > 0) {
      onSendToStudio(lastProcessedFiles);
      return;
    }
    if (cleanedItems.length > 0) {
      const files = buildRenamedFilesFromCleanedItems(cleanedItems, masterDirectory);
      if (files.length > 0) {
        onSendToStudio(files);
      }
    }
  }, [cleanedItems, lastProcessedFiles, masterDirectory, onSendToStudio]);

  return {
    masterDirectory,
    mediaBatches,
    existingBatches,
    isScanningDisk,
    rawFiles,
    lastProcessedFiles,
    isBatchSaved,
    options,
    setOptions,
    searchFilter,
    setSearchFilter,
    isProcessing,
    isBulkMoving,
    progressMsg,
    processProgress,
    statusNotification,
    setStatusNotification,
    showDuplicateInterceptDialog,
    setShowDuplicateInterceptDialog,
    showSuccessDialog,
    setShowSuccessDialog,
    successDialogInfo,
    activeDuplicateKey,
    setActiveDuplicateKey,
    isSeqWarningDismissed,
    setIsSeqWarningDismissed,
    mediaSlots,
    cleanedItems,
    filteredItems,
    blockingErrorCount,
    softWarningCount,
    lowResPhotos,
    totalDuplicateCount,
    duplicateGroupKeys,
    currentDuplicateModalItems,
    batchDistribution,
    scanMasterDirectory,
    handleSelectMasterDirectory,
    handleAddFiles,
    handleFileInput,
    handleDrop,
    handleRemoveItem,
    handleBulkMoveLowResPhotos,
    handleClearAll,
    handleReShuffle,
    handleInitiateProcess,
    handleProcessAndSave,
    handleSendToStudio,
  };
}

