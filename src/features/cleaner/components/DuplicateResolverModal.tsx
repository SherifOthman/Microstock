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
}) => {
  return (
    <>
      {/* Duplicate Comparison Modal */}
      <Dialog
        open={Boolean(activeDuplicateKey)}
        onClose={onCloseDuplicateModal}
        title={language === 'ar' ? 'مقارنة الملفات المكررة والنسخ المتشابهة' : 'Duplicate Files Comparison'}
        description={
          language === 'ar'
            ? 'تم اكتشاف أسماء ملفات متشابهة أو نسخ مكبرة/معدلة. قارن بين النسخ أدناه واحذف النسخة غير المرغوبة لتجنب رفض الستوك.'
            : 'Fuzzy duplicates or upscaled variants detected. Compare previews, resolutions, and file sizes side-by-side before deleting.'
        }
        className="max-w-3xl sm:max-w-4xl"
      >
        <div className="space-y-4">
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
        </div>
      </Dialog>

      {/* Duplicate Ingestion Warning Intercept Dialog */}
      <ConfirmDialog
        open={showDuplicateInterceptDialog}
        onOpenChange={onOpenChangeDuplicateIntercept}
        title={language === 'ar' ? 'تنبيه: تم اكتشاف ملفات مكررة' : 'Potential Duplicates Detected'}
        description={
          language === 'ar'
            ? `يوجد ${totalDuplicateCount} ملفات قد تكون مكررة أو نُسخ مكبرة/معدلة في القائمة الحالية. هل ترغب في المتابعة وحفظها على أي حال؟`
            : `There are ${totalDuplicateCount} potential duplicate or upscaled file variants detected in your queue. Are you sure you want to proceed with ingestion?`
        }
        confirmText={language === 'ar' ? 'متابعة الحفظ على أي حال' : 'Proceed Anyway'}
        cancelText={language === 'ar' ? 'إلغاء ومراجعة الملفات' : 'Cancel & Review'}
        onConfirm={onConfirmProceedDuplicates}
        onCancel={() => onOpenChangeDuplicateIntercept(false)}
      />

      {/* Prominent Success Modal after Ingestion */}
      <ConfirmDialog
        open={showSuccessDialog}
        onOpenChange={onOpenChangeSuccessDialog}
        title={language === 'ar' ? '✅ اكتمل التنظيم والحفظ بنجاح!' : '✅ Ingestion Complete!'}
        description={
          language === 'ar'
            ? `تم بنجاح تنظيم وحفظ ${successDialogInfo?.savedCount} ملف وتوزيعها داخل المجلدات (${successDialogInfo?.batches.join(', ')}) حسب النوع (Photos / Videos / Vectors).`
            : `Successfully organized ${successDialogInfo?.savedCount} files into ${successDialogInfo?.batches.join(', ')} across media sub-folders (Photos/, Videos/, and Vectors/).`
        }
        confirmText={language === 'ar' ? 'فتح المجلد في Explorer' : 'Open in Explorer'}
        hideCancel={true}
        onConfirm={() => {
          if (successDialogInfo?.masterDir) {
            window.electronAPI?.openPath?.(successDialogInfo.masterDir);
          }
          onOpenChangeSuccessDialog(false);
        }}
      />
    </>
  );
});

DuplicateResolverModal.displayName = 'DuplicateResolverModal';
