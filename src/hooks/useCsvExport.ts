/**
 * Custom Hook: useCsvExport
 * Encapsulates platform CSV generation, ZIP compilation, and strict export lockout when running.
 */

import { useState, useCallback, useMemo } from 'react';
import { SupportedPlatform, MasterMetadataRecord } from '../types';
import {
  filterCompletedExportRecords,
  generatePlatformCsv,
  downloadSingleCsv,
  downloadAllCsvsAsZip,
  exportAllCsvsToDirectory,
} from '../services/export/csvExporter';
import { UniversalTransformOptions } from '../services/rules/platformTransformers';

export interface IncompleteExportDialogState {
  completedCount: number;
  incompleteCount: number;
  onProceed: () => void;
}

export function useCsvExport(
  records: MasterMetadataRecord[],
  selectedPlatforms: SupportedPlatform[],
  isRunning: boolean,
  getTransformOptions: () => UniversalTransformOptions
) {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [previewPlatform, setPreviewPlatform] = useState<SupportedPlatform | null>(null);
  const [previewCsvContent, setPreviewCsvContent] = useState('');
  const [previewCopied, setPreviewCopied] = useState(false);
  const [isSavingToFolder, setIsSavingToFolder] = useState(false);
  const [folderSaveSuccess, setFolderSaveSuccess] = useState<string | null>(null);
  const [noticeDialog, setNoticeDialog] = useState<{ title: string; message: string } | null>(null);
  const [incompleteExportDialog, setIncompleteExportDialog] = useState<IncompleteExportDialogState | null>(null);

  const completedRecords = useMemo(() => filterCompletedExportRecords(records), [records]);
  const completedRecordsCount = completedRecords.length;
  const incompleteRecordsCount = Math.max(0, records.length - completedRecordsCount);

  const previewCsv = useCallback(
    (pid: SupportedPlatform) => {
      if (isRunning) {
        setNoticeDialog({
          title: 'Export Blocked While Generating',
          message: 'Please wait until active metadata generation completes before previewing or exporting.',
        });
        return;
      }

      if (completedRecords.length === 0) {
        setNoticeDialog({
          title: 'No Completed Assets Ready',
          message: 'No completed assets with valid metadata are ready to preview yet.',
        });
        return;
      }

      const res = generatePlatformCsv(pid, completedRecords, 'stock_metadata', getTransformOptions());
      if (res.isBlocked) {
        setNoticeDialog({
          title: 'Preview Blocked',
          message: res.blockedReason || 'Platform export requirements not met.',
        });
        return;
      }

      setPreviewPlatform(pid);
      setPreviewCsvContent(res.csvString);
      setPreviewCopied(false);
    },
    [isRunning, completedRecords, getTransformOptions]
  );

  const triggerSingleExport = useCallback(
    (pid: SupportedPlatform) => {
      if (isRunning) {
        setNoticeDialog({
          title: 'Export Blocked While Generating',
          message: 'Please wait until active metadata generation completes before exporting.',
        });
        return;
      }

      if (completedRecords.length === 0) {
        setNoticeDialog({
          title: 'No Completed Assets Ready',
          message: 'No completed assets with valid metadata are ready to export yet.',
        });
        return;
      }

      const res = generatePlatformCsv(pid, completedRecords, 'stock_metadata', getTransformOptions());
      if (res.isBlocked) {
        setNoticeDialog({
          title: 'Export Blocked',
          message: res.blockedReason || 'Platform export requirements not met.',
        });
        return;
      }

      try {
        downloadSingleCsv(res);
      } catch (err: any) {
        setNoticeDialog({
          title: 'Download Failed',
          message: err.message || 'Failed to download CSV.',
        });
      }
    },
    [isRunning, completedRecords, getTransformOptions]
  );

  const triggerZipExport = useCallback(async () => {
    if (isRunning) {
      setNoticeDialog({
        title: 'Export Blocked While Generating',
        message: 'Please wait until active metadata generation completes before exporting.',
      });
      return;
    }

    if (completedRecords.length === 0) {
      setNoticeDialog({
        title: 'No Completed Assets Ready',
        message: 'No completed assets with valid metadata are ready to export yet.',
      });
      return;
    }

    try {
      await downloadAllCsvsAsZip(
        selectedPlatforms,
        completedRecords,
        'stock_metadata',
        getTransformOptions()
      );
    } catch (err: any) {
      setNoticeDialog({
        title: 'ZIP Export Failed',
        message: err.message || 'Export failed.',
      });
    }
  }, [isRunning, selectedPlatforms, completedRecords, getTransformOptions]);

  const triggerSaveToFolder = useCallback(async () => {
    if (isRunning) {
      setNoticeDialog({
        title: 'Export Blocked While Generating',
        message: 'Please wait until active metadata generation completes before exporting.',
      });
      return;
    }

    if (completedRecords.length === 0) {
      setNoticeDialog({
        title: 'No Completed Assets Ready',
        message: 'No completed assets with valid metadata are ready to export yet.',
      });
      return;
    }

    setIsSavingToFolder(true);
    setFolderSaveSuccess(null);
    try {
      const res = await exportAllCsvsToDirectory(
        selectedPlatforms,
        completedRecords,
        'stock_metadata',
        getTransformOptions(),
        '_Metadata_CSVs'
      );
      if (res.success) {
        setFolderSaveSuccess(`Saved ${res.savedCount} agency CSV file(s) to folder.`);
      } else if (!res.canceled && res.error) {
        setNoticeDialog({
          title: 'Folder Export Failed',
          message: res.error,
        });
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setNoticeDialog({
          title: 'Folder Export Failed',
          message: err.message || 'Failed to save CSVs to directory.',
        });
      }
    } finally {
      setIsSavingToFolder(false);
    }
  }, [isRunning, selectedPlatforms, completedRecords, getTransformOptions]);

  const runWithCompletenessGate = useCallback(
    (action: () => void, explicitTotalCount?: number, explicitCompletedCount?: number) => {
      if (isRunning) {
        setNoticeDialog({
          title: 'Export Blocked While Generating',
          message: 'Please wait until active metadata generation completes before exporting.',
        });
        return;
      }

      const effCompleted = explicitCompletedCount !== undefined ? explicitCompletedCount : completedRecordsCount;
      const effTotal = explicitTotalCount !== undefined ? explicitTotalCount : records.length;

      if (effCompleted === 0) {
        setNoticeDialog({
          title: 'No Completed Assets Ready',
          message: 'No completed assets with valid metadata are ready to export yet.',
        });
        return;
      }

      if (effCompleted < effTotal) {
        setIncompleteExportDialog({
          completedCount: effCompleted,
          incompleteCount: effTotal - effCompleted,
          onProceed: () => {
            setIncompleteExportDialog(null);
            action();
          },
        });
        return;
      }

      action();
    },
    [isRunning, completedRecordsCount, records.length]
  );

  const handleExportZipWithCheck = useCallback(
    (totalAssetsCount?: number, completedCount?: number) => {
      runWithCompletenessGate(() => triggerZipExport(), totalAssetsCount, completedCount);
    },
    [runWithCompletenessGate, triggerZipExport]
  );

  const handleSingleExportWithCheck = useCallback(
    (pid: SupportedPlatform, totalAssetsCount?: number, completedCount?: number) => {
      runWithCompletenessGate(() => triggerSingleExport(pid), totalAssetsCount, completedCount);
    },
    [runWithCompletenessGate, triggerSingleExport]
  );

  const handleSaveToFolderWithCheck = useCallback(
    (totalAssetsCount?: number, completedCount?: number) => {
      runWithCompletenessGate(() => triggerSaveToFolder(), totalAssetsCount, completedCount);
    },
    [runWithCompletenessGate, triggerSaveToFolder]
  );

  const copyPreviewCsv = useCallback(() => {
    if (previewCsvContent) {
      navigator.clipboard.writeText(previewCsvContent);
      setPreviewCopied(true);
      setTimeout(() => setPreviewCopied(false), 2000);
    }
  }, [previewCsvContent]);

  return {
    isExportOpen,
    setIsExportOpen,
    previewPlatform,
    setPreviewPlatform,
    previewCsvContent,
    previewCopied,
    setPreviewCopied,
    copyPreviewCsv,
    isSavingToFolder,
    folderSaveSuccess,
    setFolderSaveSuccess,
    completedRecordsCount,
    incompleteRecordsCount,
    noticeDialog,
    setNoticeDialog,
    incompleteExportDialog,
    setIncompleteExportDialog,
    previewCsv,
    handlePreviewCsv: previewCsv,
    triggerSingleExport,
    handleSingleExport: triggerSingleExport,
    handleSingleExportWithCheck,
    triggerZipExport,
    handleZipExport: triggerZipExport,
    handleExportZipWithCheck,
    triggerSaveToFolder,
    handleSaveToFolder: triggerSaveToFolder,
    handleSaveToFolderWithCheck,
  };
}
