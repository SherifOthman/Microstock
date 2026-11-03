import React from 'react';
import { CleanerOptions } from '../../../services/cleaner/fileCleanerEngine';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Tooltip } from '../../../components/ui/tooltip';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownAZ,
  Camera,
  CheckCircle2,
  Dice5,
  FolderCheck,
  FolderOpen,
  FolderSync,
  HardDrive,
  Layers,
  Loader2,
  RefreshCw,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';

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

  return (
    <div className="space-y-3">
      {/* 1. MASTER DESTINATION DIRECTORY & ASSET ORIGIN ISOLATION */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <HardDrive className="w-4 h-4 text-primary" />
              <span>{language === 'ar' ? 'مجلد الوجهة الرئيسي' : 'Master Destination Directory'}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {language === 'ar'
                ? 'المجلد الجذري الذي تُحفظ داخله دفعات الـ Batch (مثل B01, B02).'
                : 'Root folder where sequential batch folders (B01, B02...) are stored.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Prominent Asset Origin Toggle: Real (أصلي) vs AI (ذكاء اصطناعي) */}
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-secondary/70 border border-border">
              <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                {language === 'ar' ? 'مصدر الملفات:' : 'Asset Origin:'}
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
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                    !isAiOrigin
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground border border-transparent'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5 shrink-0" />
                  <span>{language === 'ar' ? 'أصلي' : 'Real'}</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isAiOrigin}
                  disabled={isProcessing}
                  onClick={() => setOptions((prev) => ({ ...prev, assetOrigin: 'ai' }))}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                    isAiOrigin
                      ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/40 shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground border border-transparent'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>{language === 'ar' ? 'ذكاء اصطناعي' : 'AI'}</span>
                </button>
              </div>
            </div>

            <Button
              size="sm"
              onClick={onSelectMasterDirectory}
              disabled={isProcessing}
              className="gap-1.5 text-xs font-semibold cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>
                {masterDirectory
                  ? language === 'ar'
                    ? 'تغيير المجلد'
                    : 'Change Folder'
                  : language === 'ar'
                  ? 'اختيار المجلد الرئيسي'
                  : 'Select Master Folder'}
              </span>
            </Button>

            {masterDirectory && (
              <Tooltip content={language === 'ar' ? 'إعادة فحص المجلد' : 'Rescan Disk'}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onScanMasterDirectory(masterDirectory)}
                  disabled={isScanningDisk || isProcessing}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanningDisk ? 'animate-spin' : ''}`} />
                </Button>
              </Tooltip>
            )}
          </div>
        </div>

        {masterDirectory ? (
          <div className="p-3 rounded-lg bg-secondary/60 border border-border text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div dir="ltr" className="flex items-center gap-2 font-mono text-[11px] text-foreground truncate text-start">
                <FolderCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="truncate">{masterDirectory}</span>
              </div>

              <span
                dir="ltr"
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                  isAiOrigin
                    ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30'
                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                }`}
              >
                {isAiOrigin
                  ? 'AI_Photos · AI_Videos · AI_Vectors'
                  : 'Photos · Videos · Vectors'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1.5 border-t border-border text-[11px] font-mono tabular-nums text-muted-foreground">
              <span className="text-foreground font-semibold">
                {isScanningDisk ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />{' '}
                    {language === 'ar' ? 'جاري الفحص...' : 'Scanning...'}
                  </span>
                ) : existingBatchesCount > 0 ? (
                  language === 'ar' ? `${existingBatchesCount} دفعات` : `${existingBatchesCount} Batches`
                ) : language === 'ar' ? (
                  'مساحة عمل جديدة'
                ) : (
                  'New Workspace'
                )}
              </span>
              <span>·</span>
              <Tooltip content={activePhotosSlot?.statusDescription}>
                <span>
                  <span dir="ltr">{isAiOrigin ? 'AI_Photos:' : 'Photos:'}</span>{' '}
                  <strong dir="ltr" className="text-foreground">{activePhotosSlot?.slotLabel || 'B01_001'}</strong>
                </span>
              </Tooltip>
              <span>·</span>
              <Tooltip content={activeVideosSlot?.statusDescription}>
                <span>
                  <span dir="ltr">{isAiOrigin ? 'AI_Videos:' : 'Videos:'}</span>{' '}
                  <strong dir="ltr" className="text-foreground">{activeVideosSlot?.slotLabel || 'B01_001'}</strong>
                </span>
              </Tooltip>
              <span>·</span>
              <Tooltip content={activeVectorsSlot?.statusDescription}>
                <span>
                  <span dir="ltr">{isAiOrigin ? 'AI_Vectors:' : 'Vectors:'}</span>{' '}
                  <strong dir="ltr" className="text-foreground">{activeVectorsSlot?.slotLabel || 'B01_001'}</strong>
                </span>
              </Tooltip>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-secondary/50 border border-border text-muted-foreground text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FolderSync className="w-4 h-4 text-primary shrink-0" />
              <span>
                {language === 'ar'
                  ? 'حدد مجلد الوجهة الرئيسي أولاً لتفعيل الترقيم التلقائي واستكمال الـ Batch.'
                  : 'Select a Master Destination Directory to enable automatic batch numbering and resume detection.'}
              </span>
            </div>
            <span
              dir="ltr"
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                isAiOrigin
                  ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30'
                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
              }`}
            >
              {isAiOrigin
                ? 'AI_Photos · AI_Videos · AI_Vectors'
                : 'Photos · Videos · Vectors'}
            </span>
          </div>
        )}
      </div>

      {/* 2. INGESTION & SORTING CONTROLS */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
          <span>{language === 'ar' ? 'إعدادات الترتيب والتقسيم' : 'Sorting & Batch Split Rules'}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                {options.sortOrder === 'shuffle' ? (
                  <Shuffle className="w-3 h-3 text-primary" />
                ) : (
                  <ArrowDownAZ className="w-3 h-3 text-primary" />
                )}
                <span>{language === 'ar' ? 'ترتيب الملفات:' : 'Sort Order:'}</span>
              </label>
              {options.sortOrder === 'shuffle' && rawFilesCount > 0 && (
                <button
                  type="button"
                  onClick={onReShuffle}
                  className="text-[10px] text-primary hover:underline flex items-center gap-1 cursor-pointer font-mono"
                >
                  <Dice5 className="w-3 h-3" />
                  <span>{language === 'ar' ? 'إعادة خلط' : 'Re-shuffle'}</span>
                </button>
              )}
            </div>
            <Select
              value={options.sortOrder}
              onValueChange={(val) => {
                setOptions((prev) => ({ ...prev, sortOrder: val as any }));
                if (val === 'alphabetical') setIsSeqWarningDismissed(false);
              }}
            >
              <SelectTrigger className="h-8 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="max-w-[calc(100vw-2rem)] max-h-60">
                <SelectItem value="shuffle" className="text-xs">
                  {language === 'ar' ? 'خلط عشوائي (يمنع رفض التشابه)' : 'Shuffle Mix (Recommended)'}
                </SelectItem>
                <SelectItem value="alphabetical" className="text-xs">
                  {language === 'ar' ? 'أبجدي حسب الاسم الأصلي (A-Z)' : 'Alphabetical (A-Z)'}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <Layers className="w-3 h-3 text-primary" />
              <span>{language === 'ar' ? 'الحد الأقصى لكل Batch:' : 'Max Files Per Batch:'}</span>
            </label>
            <Input
              type="number"
              min={10}
              max={1000}
              step={10}
              value={options.maxItemsPerBatch}
              onChange={(e) =>
                setOptions((prev) => ({
                  ...prev,
                  maxItemsPerBatch: Math.max(10, Math.min(1000, parseInt(e.target.value, 10) || 100)),
                }))
              }
              className="h-8 text-xs font-mono tabular-nums bg-background"
            />
          </div>
        </div>

        {options.sortOrder === 'alphabetical' && !isSeqWarningDismissed && (
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
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

      {/* MEDIA PRE-CHECK ALERTS */}
      {(blockingErrorCount > 0 || softWarningCount > 0) && (
        <div className="space-y-2">
          {blockingErrorCount > 0 && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center justify-between gap-2">
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
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                className="h-7.5 px-3 text-xs gap-1.5 shrink-0 cursor-pointer font-semibold"
              >
                {isBulkMoving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderSync className="w-3.5 h-3.5" />}
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
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
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
    </div>
  );
});

CleanerToolbar.displayName = 'CleanerToolbar';
