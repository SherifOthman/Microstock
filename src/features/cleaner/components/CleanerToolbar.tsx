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

  // If masterDirectory changes, re-lock batch size to safeguard against accidental inconsistency
  React.useEffect(() => {
    setIsBatchSizeUnlocked(false);
  }, [masterDirectory]);

  const isBatchLocked = existingBatchesCount > 0 && !isBatchSizeUnlocked;

  return (
    <div className="space-y-2.5">
      {/* STREAMLINED UNIFIED COMMAND BAR (Directory, Origin, Sort & Batch Rules) */}
      <div className="p-3.5 rounded-xl border border-border bg-card space-y-2.5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left: Master Destination Directory Display & Selector */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="p-1.5 rounded-lg bg-secondary text-primary shrink-0 border border-border">
              <HardDrive className="w-4 h-4" />
            </div>

            {masterDirectory ? (
              <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                <div
                  dir="ltr"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/80 border border-border font-mono text-xs text-foreground truncate max-w-sm sm:max-w-md"
                  title={masterDirectory}
                >
                  <FolderCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="truncate">{masterDirectory}</span>
                </div>

                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-secondary border border-border text-muted-foreground whitespace-nowrap">
                  {isScanningDisk ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />{' '}
                      {language === 'ar' ? 'جاري الفحص...' : 'Scanning...'}
                    </span>
                  ) : existingBatchesCount > 0 ? (
                    language === 'ar' ? `${existingBatchesCount} دفعات` : `${existingBatchesCount} Batches`
                  ) : (
                    language === 'ar' ? 'مساحة عمل جديدة' : 'New Workspace'
                  )}
                </span>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={onSelectMasterDirectory}
                  disabled={isProcessing}
                  className="h-7 text-xs gap-1 cursor-pointer font-medium"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'تغيير المجلد' : 'Change Folder'}</span>
                </Button>

                <Tooltip content={language === 'ar' ? 'إعادة فحص المجلد' : 'Rescan Disk'}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onScanMasterDirectory(masterDirectory)}
                    disabled={isScanningDisk || isProcessing}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanningDisk ? 'animate-spin' : ''}`} />
                  </Button>
                </Tooltip>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">
                  {language === 'ar'
                    ? 'حدد مجلد الوجهة الرئيسي للأصول المنظمة'
                    : 'Select Master Stock Destination Directory'}
                </span>
                <Button
                  size="sm"
                  onClick={onSelectMasterDirectory}
                  disabled={isProcessing}
                  className="h-7 text-xs gap-1.5 cursor-pointer font-semibold"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'اختيار المجلد الرئيسي' : 'Select Master Folder'}</span>
                </Button>
              </div>
            )}
          </div>

          {/* Right: Controls Strip (Asset Origin, Sort Order, Max Batch Size) */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Prominent Asset Origin Toggle: Real vs AI */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-secondary/70 border border-border">
              <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                {language === 'ar' ? 'المصدر:' : 'Origin:'}
              </span>
              <div
                role="radiogroup"
                aria-label={language === 'ar' ? 'مصدر الملفات' : 'Asset Origin'}
                className="inline-flex items-center rounded-md bg-background p-0.5 border border-border gap-0.5"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={!isAiOrigin}
                  disabled={isProcessing}
                  onClick={() => setOptions((prev) => ({ ...prev, assetOrigin: 'real' }))}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold transition cursor-pointer ${
                    !isAiOrigin
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground border border-transparent'
                  }`}
                >
                  <Camera className="w-3 h-3 shrink-0" />
                  <span>{language === 'ar' ? 'أصلي' : 'Real'}</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isAiOrigin}
                  disabled={isProcessing}
                  onClick={() => setOptions((prev) => ({ ...prev, assetOrigin: 'ai' }))}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold transition cursor-pointer ${
                    isAiOrigin
                      ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/40 shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground border border-transparent'
                  }`}
                >
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span>{language === 'ar' ? 'ذكاء اصطناعي' : 'AI'}</span>
                </button>
              </div>
            </div>

            {/* Sort Order Selector with Re-shuffle */}
            <div className="flex items-center gap-1">
              <Select
                value={options.sortOrder}
                onValueChange={(val) => {
                  setOptions((prev) => ({ ...prev, sortOrder: val as any }));
                  if (val === 'alphabetical') setIsSeqWarningDismissed(false);
                }}
              >
                <SelectTrigger className="h-7 text-xs bg-background min-w-[130px] font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-w-[calc(100vw-2rem)] max-h-60">
                  <SelectItem value="shuffle" className="text-xs">
                    {language === 'ar' ? 'خلط عشوائي (موصى به)' : 'Shuffle Mix (Recommended)'}
                  </SelectItem>
                  <SelectItem value="alphabetical" className="text-xs">
                    {language === 'ar' ? 'أبجدي حسب الاسم (A-Z)' : 'Alphabetical (A-Z)'}
                  </SelectItem>
                </SelectContent>
              </Select>
              {options.sortOrder === 'shuffle' && rawFilesCount > 0 && (
                <Tooltip content={language === 'ar' ? 'إعادة خلط الترتيب' : 'Re-shuffle files'}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onReShuffle}
                    className="h-7 px-2 text-xs text-primary hover:text-primary cursor-pointer"
                  >
                    <Dice5 className="w-3.5 h-3.5" />
                  </Button>
                </Tooltip>
              )}
            </div>

            {/* Max Files Per Batch with Smart Consistency Guardrail */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-secondary/70 border border-border">
              <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                <Layers className="w-3 h-3 text-primary" />
                <span>{language === 'ar' ? 'سعة الدفعة:' : 'Batch Size:'}</span>
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
                <button
                  type="button"
                  onClick={() => setShowBatchLockDialog(true)}
                  className="inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                  title={language === 'ar' ? 'انقر لتعديل حجم الدفعة' : 'Click to unlock and modify batch size'}
                >
                  <Lock className="w-3 h-3" />
                  <span>{language === 'ar' ? 'مقفل (تعديل)' : 'Locked (Edit)'}</span>
                </button>
              ) : existingBatchesCount > 0 && isBatchSizeUnlocked ? (
                <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <Unlock className="w-3 h-3" />
                  <span>{language === 'ar' ? 'مفتوح للتعديل' : 'Unlocked'}</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* BOTTOM ROW: Next Available Slot Indicators & Origin Track Badge */}
        {masterDirectory && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border text-[11px] font-mono tabular-nums text-muted-foreground">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-foreground font-semibold flex items-center gap-1">
                <FolderSync className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>{language === 'ar' ? 'حالة الترقيم التالية:' : 'Next Slots:'}</span>
              </span>
              <Tooltip content={activePhotosSlot?.statusDescription}>
                <span className="px-2 py-0.5 rounded bg-secondary/80 border border-border">
                  <span dir="ltr" className="text-muted-foreground">
                    {isAiOrigin ? 'AI_Photos: ' : 'Photos: '}
                  </span>
                  <strong dir="ltr" className="text-foreground">
                    {activePhotosSlot?.slotLabel || 'B01_001'}
                  </strong>
                </span>
              </Tooltip>
              <Tooltip content={activeVideosSlot?.statusDescription}>
                <span className="px-2 py-0.5 rounded bg-secondary/80 border border-border">
                  <span dir="ltr" className="text-muted-foreground">
                    {isAiOrigin ? 'AI_Videos: ' : 'Videos: '}
                  </span>
                  <strong dir="ltr" className="text-foreground">
                    {activeVideosSlot?.slotLabel || 'B01_001'}
                  </strong>
                </span>
              </Tooltip>
              <Tooltip content={activeVectorsSlot?.statusDescription}>
                <span className="px-2 py-0.5 rounded bg-secondary/80 border border-border">
                  <span dir="ltr" className="text-muted-foreground">
                    {isAiOrigin ? 'AI_Vectors: ' : 'Vectors: '}
                  </span>
                  <strong dir="ltr" className="text-foreground">
                    {activeVectorsSlot?.slotLabel || 'B01_001'}
                  </strong>
                </span>
              </Tooltip>
            </div>

            <span
              dir="ltr"
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                isAiOrigin
                  ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30'
                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
              }`}
            >
              {isAiOrigin ? 'AI Track (Isolated)' : 'Real Stock Track'}
            </span>
          </div>
        )}

        {/* Sequential Sorting Warning */}
        {options.sortOrder === 'alphabetical' && !isSeqWarningDismissed && (
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                {language === 'ar'
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
      </div>

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
