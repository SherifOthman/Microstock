import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ConfirmDialog } from '../../src/components/ui/alert-dialog';
import { DuplicateResolverModal } from '../../src/features/cleaner/components/DuplicateResolverModal';
import { CleanerToolbar } from '../../src/features/cleaner/components/CleanerToolbar';
import { CleanerOptions } from '../../src/services/cleaner/fileCleanerEngine';

describe('Cleaner Guardrails & Dialog Isolation Suite', () => {
  describe('ConfirmDialog isolation logic', () => {
    it('calls ONLY onConfirm and does not trigger onCancel when confirm action is clicked', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      const onOpenChange = vi.fn();

      render(
        <ConfirmDialog
          open={true}
          onOpenChange={onOpenChange}
          title="Test Confirm"
          description="Are you sure?"
          confirmText="Proceed"
          cancelText="Abort"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      const confirmBtn = screen.getByText('Proceed');
      fireEvent.click(confirmBtn);

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('calls onCancel exactly once when cancel action is clicked', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      const onOpenChange = vi.fn();

      render(
        <ConfirmDialog
          open={true}
          onOpenChange={onOpenChange}
          title="Test Confirm"
          confirmText="Proceed"
          cancelText="Abort"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      const cancelBtn = screen.getByText('Abort');
      fireEvent.click(cancelBtn);

      expect(onConfirm).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('calls onDismiss when closed via escape/external without button click', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      const onDismiss = vi.fn();
      let openState = true;

      const { rerender } = render(
        <ConfirmDialog
          open={openState}
          onOpenChange={(open) => {
            openState = open;
          }}
          title="Test Confirm"
          onConfirm={onConfirm}
          onCancel={onCancel}
          onDismiss={onDismiss}
        />
      );

      // Simulate Radix dismissing (pressing Escape or backdrop close)
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

      expect(onConfirm).not.toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('DuplicateResolverModal Success Dialog Behavior', () => {
    beforeEach(() => {
      window.electronAPI = {
        openPath: vi.fn().mockResolvedValue(''),
        showItemInFolder: vi.fn(),
      } as any;
    });

    it('ONLY sends to studio and NEVER opens Explorer folder when "Send to Metadata Studio" is clicked', () => {
      const onSendToStudio = vi.fn();
      const onOpenChangeSuccessDialog = vi.fn();

      render(
        <DuplicateResolverModal
          language="en"
          activeDuplicateKey={null}
          onCloseDuplicateModal={vi.fn()}
          currentDuplicateModalItems={[]}
          onRemoveItem={vi.fn()}
          showDuplicateInterceptDialog={false}
          onOpenChangeDuplicateIntercept={vi.fn()}
          totalDuplicateCount={0}
          onConfirmProceedDuplicates={vi.fn()}
          showSuccessDialog={true}
          onOpenChangeSuccessDialog={onOpenChangeSuccessDialog}
          successDialogInfo={{
            savedCount: 42,
            batches: ['B01', 'B02'],
            masterDir: 'D:/Photos/Master',
          }}
          onSendToStudio={onSendToStudio}
        />
      );

      const sendBtn = screen.getByText(/Send to Metadata Studio \(42\)/i);
      fireEvent.click(sendBtn);

      expect(onSendToStudio).toHaveBeenCalledTimes(1);
      expect(onOpenChangeSuccessDialog).toHaveBeenCalledWith(false);
      expect(window.electronAPI?.openPath).not.toHaveBeenCalled();
    });

    it('ONLY opens folder and does NOT send to studio when "Open Folder" is clicked', () => {
      const onSendToStudio = vi.fn();
      const onOpenChangeSuccessDialog = vi.fn();

      render(
        <DuplicateResolverModal
          language="en"
          activeDuplicateKey={null}
          onCloseDuplicateModal={vi.fn()}
          currentDuplicateModalItems={[]}
          onRemoveItem={vi.fn()}
          showDuplicateInterceptDialog={false}
          onOpenChangeDuplicateIntercept={vi.fn()}
          totalDuplicateCount={0}
          onConfirmProceedDuplicates={vi.fn()}
          showSuccessDialog={true}
          onOpenChangeSuccessDialog={onOpenChangeSuccessDialog}
          successDialogInfo={{
            savedCount: 42,
            batches: ['B01'],
            masterDir: 'D:/Photos/Master',
          }}
          onSendToStudio={onSendToStudio}
        />
      );

      const openFolderBtn = screen.getByText('Open Folder');
      fireEvent.click(openFolderBtn);

      expect(onSendToStudio).not.toHaveBeenCalled();
      expect(window.electronAPI?.openPath).toHaveBeenCalledWith('D:/Photos/Master');
      expect(onOpenChangeSuccessDialog).toHaveBeenCalledWith(false);
    });

    it('closes dialog without opening folder when dismissed via Escape', () => {
      const onSendToStudio = vi.fn();
      const onOpenChangeSuccessDialog = vi.fn();

      render(
        <DuplicateResolverModal
          language="en"
          activeDuplicateKey={null}
          onCloseDuplicateModal={vi.fn()}
          currentDuplicateModalItems={[]}
          onRemoveItem={vi.fn()}
          showDuplicateInterceptDialog={false}
          onOpenChangeDuplicateIntercept={vi.fn()}
          totalDuplicateCount={0}
          onConfirmProceedDuplicates={vi.fn()}
          showSuccessDialog={true}
          onOpenChangeSuccessDialog={onOpenChangeSuccessDialog}
          successDialogInfo={{
            savedCount: 42,
            batches: ['B01'],
            masterDir: 'D:/Photos/Master',
          }}
          onSendToStudio={onSendToStudio}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

      expect(onSendToStudio).not.toHaveBeenCalled();
      expect(window.electronAPI?.openPath).not.toHaveBeenCalled();
      expect(onOpenChangeSuccessDialog).toHaveBeenCalledWith(false);
    });
  });

  describe('CleanerToolbar Max Files Per Batch Guardrail', () => {
    const defaultOptions: CleanerOptions = {
      assetOrigin: 'real',
      sortOrder: 'shuffle',
      maxItemsPerBatch: 100,
      minPhotoDimension: 2000,
      require4kVideo: false,
      deduplicateImages: true,
      deduplicateVideos: true,
      deduplicateVectors: true,
      similarityThreshold: 0.95,
      generateJpgPreviewForEps: true,
    };

    it('allows direct editing when existingBatchesCount is 0 (new workspace)', () => {
      const setOptions = vi.fn();
      render(
        <CleanerToolbar
          language="en"
          masterDirectory="D:/Photos/Master"
          existingBatchesCount={0}
          isScanningDisk={false}
          isProcessing={false}
          mediaSlots={null}
          options={defaultOptions}
          setOptions={setOptions}
          rawFilesCount={50}
          isSeqWarningDismissed={false}
          setIsSeqWarningDismissed={vi.fn()}
          blockingErrorCount={0}
          softWarningCount={0}
          isBulkMoving={false}
          statusNotification={null}
          onSelectMasterDirectory={vi.fn()}
          onScanMasterDirectory={vi.fn()}
          onReShuffle={vi.fn()}
          onBulkMoveLowResPhotos={vi.fn()}
          onDismissNotification={vi.fn()}
        />
      );

      // Lock indicator should NOT be present
      expect(screen.queryByText(/Locked \(Edit\)/i)).toBeNull();

      const input = screen.getByRole('spinbutton');
      expect(input.hasAttribute('readonly')).toBe(false);

      fireEvent.change(input, { target: { value: '50' } });
      expect(setOptions).toHaveBeenCalled();
    });

    it('locks input when existingBatchesCount > 0 and displays unlock confirmation modal', () => {
      const setOptions = vi.fn();
      render(
        <CleanerToolbar
          language="en"
          masterDirectory="D:/Photos/Master"
          existingBatchesCount={3}
          isScanningDisk={false}
          isProcessing={false}
          mediaSlots={null}
          options={defaultOptions}
          setOptions={setOptions}
          rawFilesCount={50}
          isSeqWarningDismissed={false}
          setIsSeqWarningDismissed={vi.fn()}
          blockingErrorCount={0}
          softWarningCount={0}
          isBulkMoving={false}
          statusNotification={null}
          onSelectMasterDirectory={vi.fn()}
          onScanMasterDirectory={vi.fn()}
          onReShuffle={vi.fn()}
          onBulkMoveLowResPhotos={vi.fn()}
          onDismissNotification={vi.fn()}
        />
      );

      // Lock indicator must be present
      const lockBtn = screen.getByText(/Locked \(Edit\)/i);
      expect(lockBtn).toBeTruthy();

      const input = screen.getByRole('spinbutton');
      expect(input.hasAttribute('readonly')).toBe(true);

      // Clicking locked input or lock button triggers warning dialog
      fireEvent.click(lockBtn);

      expect(screen.getByText(/Modify Batch Size/i)).toBeTruthy();
      expect(screen.getByText(/already contains 3 batch\(es\) configured for 100 files each/i)).toBeTruthy();

      // Confirm unlocking
      const unlockBtn = screen.getByText('Unlock & Edit');
      fireEvent.click(unlockBtn);

      // Should now show Unlocked badge and input is not readOnly
      expect(screen.getByText(/Unlocked/i)).toBeTruthy();
      expect(input.hasAttribute('readonly')).toBe(false);
    });

    it('supports Arabic localization for batch lock warning', () => {
      render(
        <CleanerToolbar
          language="ar"
          masterDirectory="D:/Photos/Master"
          existingBatchesCount={2}
          isScanningDisk={false}
          isProcessing={false}
          mediaSlots={null}
          options={defaultOptions}
          setOptions={vi.fn()}
          rawFilesCount={50}
          isSeqWarningDismissed={false}
          setIsSeqWarningDismissed={vi.fn()}
          blockingErrorCount={0}
          softWarningCount={0}
          isBulkMoving={false}
          statusNotification={null}
          onSelectMasterDirectory={vi.fn()}
          onScanMasterDirectory={vi.fn()}
          onReShuffle={vi.fn()}
          onBulkMoveLowResPhotos={vi.fn()}
          onDismissNotification={vi.fn()}
        />
      );

      const lockBtnAr = screen.getByText(/مقفل \(تعديل\)/i);
      expect(lockBtnAr).toBeTruthy();

      fireEvent.click(lockBtnAr);

      expect(screen.getByText(/تعديل سعة الدفعة/i)).toBeTruthy();
      expect(screen.getByText(/يحتوي المجلد على 2 دفعة\/دفعات سابقة/i)).toBeTruthy();
    });
  });
});
