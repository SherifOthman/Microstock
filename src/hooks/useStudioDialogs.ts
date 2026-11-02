import { useState } from 'react';

export function useStudioDialogs() {
  const [isKeyRingOpen, setIsKeyRingOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isDtUnlockDialogOpen, setIsDtUnlockDialogOpen] = useState(false);
  const [isShutterUnlockDialogOpen, setIsShutterUnlockDialogOpen] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<{ id: string; filename: string } | null>(null);
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const [noticeDialog, setNoticeDialog] = useState<{ title: string; message: string } | null>(null);
  const [incompleteExportDialog, setIncompleteExportDialog] = useState<{
    completedCount: number;
    incompleteCount: number;
    onProceed: () => void;
  } | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  return {
    isKeyRingOpen,
    setIsKeyRingOpen,
    isExportOpen,
    setIsExportOpen,
    isTemplatesOpen,
    setIsTemplatesOpen,
    isDtUnlockDialogOpen,
    setIsDtUnlockDialogOpen,
    isShutterUnlockDialogOpen,
    setIsShutterUnlockDialogOpen,
    assetToDelete,
    setAssetToDelete,
    clearAllConfirmOpen,
    setClearAllConfirmOpen,
    noticeDialog,
    setNoticeDialog,
    incompleteExportDialog,
    setIncompleteExportDialog,
    lightboxIndex,
    setLightboxIndex,
  };
}
