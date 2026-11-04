import React from 'react';
import { CleanerOptions } from '../../../services/cleaner/fileCleanerEngine';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Tooltip } from '../../../components/ui/tooltip';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Dice5,
  FolderCheck,
  FolderOpen,
  FolderSync,
  HardDrive,
  Layers,
  Loader2,
  Lock,
  RefreshCw,
  Sparkles,
  Unlock,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../../../components/ui/alert-dialog';

export interface CleanerToolbarProps {
  language: string;
  masterDirectory: string;
  existingBatchesCount: number;
  isScanningDisk: boolean;
  isProcessing: boolean;
  mediaSlots: any;
  options: CleanerOptions;
  setOptions: React.Dispatch<React.SetStateAction<CleanerOptions>>;
  rawFilesCount: number;
  isSeqWarningDismissed: boolean;
  setIsSeqWarningDismissed: (val: boolean) => void;
  blockingErrorCount: number;
  softWarningCount: number;
  isBulkMoving: boolean;
  statusNotification: { type: 'success' | 'error'; message: string } | null;
  onSelectMasterDirectory: () => void;
  onScanMasterDirectory: (dir: string) => void;
  onReShuffle: () => void;
  onBulkMoveLowResPhotos: () => void;
  onDismissNotification: () => void;
}

export const CleanerToolbar: React.FC<CleanerToolbarProps> = React.memo(({
  language,
  masterDirectory,
  existingBatchesCount,
  isScanningDisk,
  isProcessing,
  mediaSlots,
  options,
  setOptions,
  rawFilesCount,
  isSeqWarningDismissed,
  setIsSeqWarningDismissed,
  blockingErrorCount,
  softWarningCount,
  isBulkMoving,
  statusNotification,
  onSelectMasterDirectory,
  onScanMasterDirectory,
  onReShuffle,
  onBulkMoveLowResPhotos,
  onDismissNotification,
}) => {
  const isAiOrigin = options.assetOrigin === 'ai';
  const activePhotosSlot = (isAiOrigin ? mediaSlots?.AI_Photos : mediaSlots?.Photos) || mediaSlots?.Photos;
  const activeVideosSlot = (isAiOrigin ? mediaSlots?.AI_Videos : mediaSlots?.Videos) || mediaSlots?.Videos;
  const activeVectorsSlot = (isAiOrigin ? mediaSlots?.AI_Vectors : mediaSlots?.Vectors) || mediaSlots?.Vectors;

  const [isBatchSizeUnlocked, setIsBatchSizeUnlocked] = React.useState(false);
  const [showBatchLockDialog, setShowBatchLockDialog] = React.useState(false);

  // If masterDirectory or existingBatchesCount changes, lock batch size to safeguard against accidental inconsistency
  React.useEffect(() => {
    setIsBatchSizeUnlocked(false);
  }, [masterDirectory, existingBatchesCount]);

  const isBatchLocked = existingBatchesCount > 0 && !isBatchSizeUnlocked;

  const isRtl = language === 'ar';
  const nextSlotsSummary = `${isAiOrigin ? 'AI_Photos' : 'Photos'}: ${activePhotosSlot?.slotLabel || 'B01_001'} · ${
    isAiOrigin ? 'AI_Videos' : 'Videos'
  }: ${activeVideosSlot?.slotLabel || 'B01_001'} · ${isAiOrigin ? 'AI_Vectors' : 'Vectors'}: ${
    activeVectorsSlot?.slotLabel || 'B01_001'
  }`;

  return (
    <div className="space-y-2">
      {/* SINGLE COMPACT COMMAND BAR (Output Folder on Start | Origin, Sort & Batch Size on End) */}
      <div className="px-3 py-2.5 rounded-xl border border-border bg-card flex flex-wrap items-center justify-between gap-2.5 shadow-2xs">
        {/* Start Side: Master Output Folder */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {masterDirectory ? (
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <Tooltip content={`${masterDirectory} (${nextSlotsSummary})`}>
                <div
                  dir="ltr"
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-secondary/70 border border-border font-mono text-xs text-foreground max-w-[240px] sm:max-w-[320px]"
                >
                  <FolderCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="truncate">{masterDirectory}</span>
                </div>
              </Tooltip>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onSelectMasterDirectory}
                disabled={isProcessing}
                className="h-8 text-xs gap-1.5 cursor-pointer font-medium"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>{isRtl ? 'تغيير المجلد' : 'Change Folder'}</span>
              </Button>

              <Tooltip content={isRtl ? 'إعادة فحص المجلد' : 'Rescan Folder'}>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => onScanMasterDirectory(masterDirectory)}
                  disabled={isScanningDisk || isProcessing}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanningDisk ? 'animate-spin' : ''}`} />
                </Button>
              </Tooltip>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={onSelectMasterDirectory}
                disabled={isProcessing}
                className="h-8 text-xs gap-1.5 cursor-pointer font-semibold"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>{isRtl ? 'اختيار مجلد الحفظ' : 'Select Output Folder'}</span>
              </Button>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {isRtl ? 'لحفظ الدفعات المنظمة بداخله' : 'Where organized batches will be saved'}
              </span>
            </div>
          )}
        </div>

        {/* End Side: Asset Origin, Sort Order & Batch Size (all on the same single line) */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Asset Origin Toggle (shadcn Button group: Real vs AI) */}
          <div
            role="radiogroup"
            aria-label={isRtl ? 'نوع الملفات' : 'Asset Origin'}
            className="inline-flex items-center h-8 rounded-md bg-secondary/70 p-0.5 border border-border gap-0.5"
          >
            <Button
              type="button"
              role="radio"
              aria-checked={!isAiOrigin}
              variant={!isAiOrigin ? 'default' : 'ghost'}
              size="sm"
              disabled={isProcessing}
              onClick={() => setOptions((prev) => ({ ...prev, assetOrigin: 'real' }))}
              className={`h-7 px-2.5 text-xs font-semibold gap-1 cursor-pointer ${
                !isAiOrigin
                  ? 'bg-emerald-600 hover:bg-emerald-600/90 text-white shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Camera className="w-3.5 h-3.5 shrink-0" />
              <span>{isRtl ? 'أصلي' : 'Real'}</span>
            </Button>
            <Button
              type="button"
              role="radio"
              aria-checked={isAiOrigin}
              variant={isAiOrigin ? 'default' : 'ghost'}
              size="sm"
              disabled={isProcessing}
              onClick={() => setOptions((prev) => ({ ...prev, assetOrigin: 'ai' }))}
              className={`h-7 px-2.5 text-xs font-semibold gap-1 cursor-pointer ${
                isAiOrigin
                  ? 'bg-violet-600 hover:bg-violet-600/90 text-white shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>{isRtl ? 'ذكاء اصطناعي' : 'AI'}</span>
            </Button>
          </div>

          {/* Sort Order Selector (shadcn Select with explicit RTL/LTR dir) */}
          <div className="flex items-center gap-1">
            <Select
              dir={isRtl ? 'rtl' : 'ltr'}
              value={options.sortOrder}
              onValueChange={(val) => {
                setOptions((prev) => ({ ...prev, sortOrder: val as any }));
                if (val === 'alphabetical') setIsSeqWarningDismissed(false);
              }}
            >
              <SelectTrigger dir={isRtl ? 'rtl' : 'ltr'} className="h-8 text-xs bg-background min-w-[145px] font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir={isRtl ? 'rtl' : 'ltr'} position="popper">
                <SelectItem value="shuffle" className="text-xs">
                  {isRtl ? 'خلط عشوائي (موصى به)' : 'Shuffle Mix (Recommended)'}
                </SelectItem>
                <SelectItem value="alphabetical" className="text-xs">
                  {isRtl ? 'أبجدي (A-Z)' : 'Alphabetical (A-Z)'}
                </SelectItem>
              </SelectContent>
            </Select>
            {options.sortOrder === 'shuffle' && rawFilesCount > 0 && (
              <Tooltip content={isRtl ? 'إعادة خلط الترتيب' : 'Re-shuffle files'}>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={onReShuffle}
                  className="h-8 w-8 text-primary hover:text-primary cursor-pointer shrink-0"
                >
                  <Dice5 className="w-3.5 h-3.5" />
                </Button>
              </Tooltip>
            )}
          </div>

          {/* Batch Size Control (shadcn Input + shadcn Button lock trigger) */}
          <div className="inline-flex items-center h-8 gap-1.5 px-2.5 rounded-md bg-secondary/70 border border-border">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 whitespace-nowrap">
              <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>{isRtl ? 'الدفعة:' : 'Batch:'}</span>
            </label>

            <Input
              type="number"
              min={10}
              max={1000}
              step={10}
              readOnly={isBatchLocked}
              disabled={isProcessing}
              value={options.maxItemsPerBatch}
              onChange={(e) =>
                setOptions((prev) => ({
                  ...prev,
                  maxItemsPerBatch: Math.max(10, Math.min(1000, parseInt(e.target.value, 10) || 100)),
                }))
              }
              onClick={() => {
                if (isBatchLocked) {
                  setShowBatchLockDialog(true);
                }
              }}
              className={`h-6 w-14 text-xs font-mono tabular-nums text-center bg-background px-1 py-0 ${
                isBatchLocked ? 'cursor-pointer select-none opacity-85 hover:border-amber-500/50' : ''
              }`}
            />

            {isBatchLocked ? (
              <Tooltip content={isRtl ? 'انقر لفك القفل وتعديل حجم الدفعة' : 'Click to unlock and edit batch size'}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowBatchLockDialog(true)}
                  className="h-6 w-6 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span className="sr-only">{isRtl ? 'مقفل (تعديل)' : 'Locked (Edit)'}</span>
                </Button>
              </Tooltip>
            ) : existingBatchesCount > 0 && isBatchSizeUnlocked ? (
              <Tooltip content={isRtl ? 'مفتوح للتعديل' : 'Unlocked'}>
                <span className="inline-flex items-center justify-center h-6 w-6 text-emerald-600 dark:text-emerald-400">
                  <Unlock className="w-3.5 h-3.5" />
                  <span className="sr-only">{isRtl ? 'مفتوح للتعديل' : 'Unlocked'}</span>
                </span>
              </Tooltip>
            ) : null}
          </div>
        </div>
      </div>

      {/* Sequential Sorting Warning */}
      {options.sortOrder === 'alphabetical' && !isSeqWarningDismissed && (
        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>
              {isRtl
                ? 'تنبيه: الترتيب المتسلسل قد يؤدي لرفض اللقطات المتتالية المتشابهة على Adobe Stock.'
                : 'Note: Sequential sorting may trigger similar-shot rejections on Adobe Stock.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsSeqWarningDismissed(true)}
            className="hover:opacity-80 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* COMPACT MEDIA PRE-CHECK ALERTS */}
      {(blockingErrorCount > 0 || softWarningCount > 0) && (
        <div className="space-y-2">
          {blockingErrorCount > 0 && (
            <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  {language === 'ar'
                    ? `يوجد ${blockingErrorCount} فيديو بدقة غير قياسية (المطلوب 1080p أو 4K). يرجى إزالتها للمتابعة.`
                    : `${blockingErrorCount} video(s) have non-standard dimensions (1080p or 4K required). Resolve before ingesting.`}
                </span>
              </div>
            </div>
          )}

          {softWarningCount > 0 && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  {language === 'ar'
                    ? `يوجد ${softWarningCount} صورة أقل من 3000px وتحتاج إلى تكبير (Upscale).`
                    : `${softWarningCount} photo(s) are under 3000px and require upscaling.`}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onBulkMoveLowResPhotos}
                disabled={isBulkMoving || isProcessing}
                className="h-7 px-3 text-xs gap-1.5 shrink-0 cursor-pointer font-semibold"
              >
                {isBulkMoving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FolderSync className="w-3.5 h-3.5" />
                )}
                <span>
                  {language === 'ar'
                    ? `نقل (${softWarningCount}) إلى _Needs_Fixing`
                    : `Move ${softWarningCount} to _Needs_Fixing`}
                </span>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* NOTIFICATIONS BANNER */}
      {statusNotification && (
        <div
          className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            statusNotification.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusNotification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <X className="w-4 h-4 shrink-0" />
            )}
            <span>{statusNotification.message}</span>
          </div>
          <button
            type="button"
            onClick={onDismissNotification}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* BATCH SIZE CONSISTENCY WARNING DIALOG */}
      <ConfirmDialog
        open={showBatchLockDialog}
        onOpenChange={setShowBatchLockDialog}
        title={language === 'ar' ? 'تعديل سعة الدفعة (Batch Size)' : 'Modify Batch Size'}
        description={
          language === 'ar'
            ? `يحتوي المجلد على ${existingBatchesCount} دفعة/دفعات سابقة تم إنشاؤها بحجم (${options.maxItemsPerBatch} ملف). تغيير حجم الدفعة الآن قد يؤدي لعدم تناسق تقسيم الملفات بين الدفعات السابقة والجديدة. هل أنت متأكد من رغبتك في التعديل؟`
            : `This workspace already contains ${existingBatchesCount} batch(es) configured for ${options.maxItemsPerBatch} files each. Changing the batch size now may cause inconsistent file counts between existing and new batches. Are you sure you want to unlock and edit it?`
        }
        confirmText={language === 'ar' ? 'تأكيد وإلغاء القفل' : 'Unlock & Edit'}
        cancelText={language === 'ar' ? 'إلغاء' : 'Cancel'}
        onConfirm={() => {
          setIsBatchSizeUnlocked(true);
          setShowBatchLockDialog(false);
        }}
        onCancel={() => {
          setShowBatchLockDialog(false);
        }}
      />
    </div>
  );
});

CleanerToolbar.displayName = 'CleanerToolbar';
