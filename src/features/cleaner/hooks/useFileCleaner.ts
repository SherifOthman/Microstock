import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  CleanedFileItem,
  CleanerOptions,
  DEFAULT_CLEANER_OPTIONS,
  ExistingBatchInfo,
  MediaResolutionValidation,
  MediaBatchesMap,
  calculateAllMediaSlots,
  processFilesForBatchIngest,
  saveBatchFilesToMasterDirectory,
  validateMediaDimensions,
} from '../../../services/cleaner/fileCleanerEngine';

export function useFileCleaner(language: string) {
  // Master Destination Directory & Disk State
  const [masterDirectory, setMasterDirectory] = useState<string>(() => {
    return localStorage.getItem('stock_cleaner_master_dir') || '';
  });
  const [mediaBatches, setMediaBatches] = useState<MediaBatchesMap>({
    Photos: [],
    Videos: [],
    Vectors: [],
  });
  const [existingBatches, setExistingBatches] = useState<ExistingBatchInfo[]>([]);
  const [isScanningDisk, setIsScanningDisk] = useState(false);

  // Imported Files & Configuration
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const [nativePaths, setNativePaths] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<CleanerOptions>(DEFAULT_CLEANER_OPTIONS);
  const [shuffleSeed, setShuffleSeed] = useState(1);
  const [searchFilter, setSearchFilter] = useState('');
  const [manualOverrides, setManualOverrides] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
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
          setMediaBatches(res.mediaBatches);
        }
        if (res.batches) {
          setExistingBatches(res.batches);
        }
      } else {
        setMediaBatches({ Photos: [], Videos: [], Vectors: [] });
        setExistingBatches([]);
      }
    } catch (err) {
      console.error('[FileCleaner] Failed to scan master directory:', err);
      setMediaBatches({ Photos: [], Videos: [], Vectors: [] });
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
        localStorage.setItem('stock_cleaner_master_dir', res.path);
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

  // Validate imported files resolutions asynchronously
  useEffect(() => {
    let isCancelled = false;

    const runValidations = async () => {
      const newValidations: Record<string, MediaResolutionValidation> = {};
      for (const file of rawFiles) {
        const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
        if (!validations[fileKey]) {
          const val = await validateMediaDimensions(file);
          if (!isCancelled) {
            newValidations[fileKey] = val;
          }
        }
      }

      if (!isCancelled && Object.keys(newValidations).length > 0) {
        setValidations((prev) => ({ ...prev, ...newValidations }));
      }
    };

    if (rawFiles.length > 0) {
      runValidations();
    }

    return () => {
      isCancelled = true;
    };
  }, [rawFiles, validations]);

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

  // Process files into batches based on sorting, slot allocation, and duplicate matching
  const cleanedItems: CleanedFileItem[] = useMemo(() => {
    if (rawFiles.length === 0) return [];
    const processed = processFilesForBatchIngest(rawFiles, options, mediaSlots, shuffleSeed, nativePaths);

    return processed.map((item) => {
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
  }, [rawFiles, options, mediaSlots, shuffleSeed, nativePaths, manualOverrides, validations]);

  // Count blocking errors and soft warnings
  const blockingErrorCount = useMemo(() => {
    return cleanedItems.filter((i) => i.validation?.isBlocking).length;
  }, [cleanedItems]);

  const softWarningCount = useMemo(() => {
    return cleanedItems.filter((i) => i.validation?.warningType === 'photo_low_resolution').length;
  }, [cleanedItems]);

  // Non-upscaled photos that require upscaling to 4K+ (width < 3000 || height < 3000)
  const lowResPhotos = useMemo(() => {
    return cleanedItems.filter(
      (i) => i.subFolder === 'Photos' && i.validation?.warningType === 'photo_low_resolution'
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

  // Calculate batch distribution summary grouped by Media Type and Batch Folder
  const batchDistribution = useMemo(() => {
    const counts = new Map<string, { folder: string; subFolder: 'Photos' | 'Videos' | 'Vectors'; total: number; isNew: boolean }>();
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

    return Array.from(counts.values());
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

  // Bulk-move all non-upscaled photos to _Needs_Fixing/Photos in one click
  const handleBulkMoveLowResPhotos = useCallback(async () => {
    if (lowResPhotos.length === 0) return;
    setIsBulkMoving(true);

    try {
      for (const item of lowResPhotos) {
        if (item.nativePath && typeof window !== 'undefined' && window.electronAPI?.quarantineFile) {
          try {
            await window.electronAPI.quarantineFile({
              filePath: item.nativePath,
              mediaType: 'Photos',
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
            ? `تم بنجاح نقل ${lowResPhotos.length} صورة تحتاج إلى تكبير إلى مجلد _Needs_Fixing/Photos وإزالتها من القائمة.`
            : `Successfully moved ${lowResPhotos.length} low-res photo(s) to _Needs_Fixing/Photos & removed from queue.`,
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
  }, [lowResPhotos, masterDirectory, language]);

  const handleClearAll = useCallback(() => {
    setRawFiles([]);
    setManualOverrides({});
    setStatusNotification(null);
  }, []);

  const handleReShuffle = useCallback(() => {
    setShuffleSeed((prev) => prev + 1);
  }, []);

  // Native Process & Save Directly to Hard Drive
  const handleProcessAndSave = useCallback(async () => {
    if (!masterDirectory) {
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
    setProgressMsg(language === 'ar' ? 'جارٍ حفظ وتقسيم الملفات إلى المجلدات...' : 'Saving and routing files into sub-folders...');
    setStatusNotification(null);

    try {
      const res = await saveBatchFilesToMasterDirectory(
        masterDirectory,
        cleanedItems,
        (done, total, cur) => {
          setProgressMsg(
            language === 'ar'
              ? `تم حفظ ${done} من أصل ${total} ملف... (${cur})`
              : `Saved ${done} of ${total} files... (${cur})`
          );
        }
      );

      if (res.success) {
        const touchedBatches = Array.from(new Set(cleanedItems.map((i) => `${i.subFolder}/${i.batchFolder}`)));
        setSuccessDialogInfo({
          savedCount: res.savedCount,
          batches: touchedBatches,
          masterDir: masterDirectory,
        });
        setShowSuccessDialog(true);

        await scanMasterDirectory(masterDirectory);
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

  return {
    masterDirectory,
    mediaBatches,
    existingBatches,
    isScanningDisk,
    rawFiles,
    options,
    setOptions,
    searchFilter,
    setSearchFilter,
    isProcessing,
    isBulkMoving,
    progressMsg,
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
  };
}
