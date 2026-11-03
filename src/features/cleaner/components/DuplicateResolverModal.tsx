import React from 'react';
import { CleanedFileItem } from '../../../services/cleaner/fileCleanerEngine';
import { Dialog } from '../../../components/ui/dialog';
import { ConfirmDialog } from '../../../components/ui/alert-dialog';
import { DuplicatePreviewCard } from './DuplicatePreviewCard';

export interface DuplicateResolverModalProps {
  language: string;
  activeDuplicateKey: string | null;
  onCloseDuplicateModal: () => void;
  currentDuplicateModalItems: CleanedFileItem[];
  onRemoveItem: (id: string, file: File, item: CleanedFileItem) => void;
  showDuplicateInterceptDialog: boolean;
  onOpenChangeDuplicateIntercept: (open: boolean) => void;
  totalDuplicateCount: number;
  onConfirmProceedDuplicates: () => void;
  showSuccessDialog: boolean;
  onOpenChangeSuccessDialog: (open: boolean) => void;
  successDialogInfo: {
    savedCount: number;
    batches: string[];
    masterDir: string;
  } | null;
  onSendToStudio?: () => void;
}

export const DuplicateResolverModal: React.FC<DuplicateResolverModalProps> = React.memo(({
  language,
  activeDuplicateKey,
  onCloseDuplicateModal,
  currentDuplicateModalItems,
  onRemoveItem,
  showDuplicateInterceptDialog,
  onOpenChangeDuplicateIntercept,
  totalDuplicateCount,
  onConfirmProceedDuplicates,
  showSuccessDialog,
  onOpenChangeSuccessDialog,
  successDialogInfo,
  onSendToStudio,
}) => {
  return (
    <>
      <Dialog
        open={Boolean(activeDuplicateKey)}
        onClose={onCloseDuplicateModal}
        title={language === 'ar' ? 'مقارنة الملفات المكررة' : 'Duplicate Variants Comparison'}
        description={
          language === 'ar'
            ? 'قارن بين النسخ المتشابهة أدناه واحذف النسخ الزائدة قبل الحفظ.'
            : 'Compare matching or upscaled file variants side-by-side and remove unwanted copies.'
        }
        size="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {currentDuplicateModalItems.map((item) => (
            <DuplicatePreviewCard
              key={item.id}
              item={item}
              language={language}
              onLocate={(path) => window.electronAPI?.showItemInFolder?.(path)}
              onRemove={(id, file, itm) => {
                onRemoveItem(id, file, itm);
                if (currentDuplicateModalItems.length <= 2) {
                  onCloseDuplicateModal();
                }
              }}
            />
          ))}
        </div>
      </Dialog>

      <ConfirmDialog
        open={showDuplicateInterceptDialog}
        onOpenChange={onOpenChangeDuplicateIntercept}
        title={language === 'ar' ? 'تم رصد ملفات مكررة' : 'Potential Duplicates Detected'}
        description={
          language === 'ar'
            ? `يوجد ${totalDuplicateCount} ملفات مكررة أو متشابهة في القائمة. هل تريد المتابعة على أي حال؟`
            : `${totalDuplicateCount} potential duplicate files remain in the queue. Proceed with saving anyway?`
        }
        confirmText={language === 'ar' ? 'متابعة الحفظ' : 'Proceed Anyway'}
        cancelText={language === 'ar' ? 'مراجعة القائمة' : 'Review Queue'}
        onConfirm={onConfirmProceedDuplicates}
        onCancel={() => onOpenChangeDuplicateIntercept(false)}
      />

      <ConfirmDialog
        open={showSuccessDialog}
        onOpenChange={onOpenChangeSuccessDialog}
        title={language === 'ar' ? 'اكتمل التنظيم والحفظ' : 'Batch Ingestion Complete'}
        description={
          language === 'ar'
            ? `تم حفظ ${successDialogInfo?.savedCount} ملف داخل (${successDialogInfo?.batches.join(', ')}). هل تريد إرسالها الآن إلى استوديو Metadata؟`
            : `Organized ${successDialogInfo?.savedCount} files into ${successDialogInfo?.batches.join(', ')}. Send them directly to Metadata Studio now?`
        }
        confirmText={
          onSendToStudio
            ? language === 'ar'
              ? `إرسال إلى استوديو Metadata (${successDialogInfo?.savedCount || 0})`
              : `Send to Metadata Studio (${successDialogInfo?.savedCount || 0})`
            : language === 'ar'
            ? 'فتح المجلد'
            : 'Open Folder'
        }
        cancelText={language === 'ar' ? 'فتح المجلد' : 'Open Folder'}
        hideCancel={!onSendToStudio}
        onConfirm={() => {
          onOpenChangeSuccessDialog(false);
          if (onSendToStudio) {
            onSendToStudio();
          } else if (successDialogInfo?.masterDir) {
            window.electronAPI?.openPath?.(successDialogInfo.masterDir);
          }
        }}
        onCancel={() => {
          onOpenChangeSuccessDialog(false);
          if (successDialogInfo?.masterDir) {
            window.electronAPI?.openPath?.(successDialogInfo.masterDir);
          }
        }}
        onDismiss={() => {
          onOpenChangeSuccessDialog(false);
        }}
      />
    </>
  );
});

DuplicateResolverModal.displayName = 'DuplicateResolverModal';

