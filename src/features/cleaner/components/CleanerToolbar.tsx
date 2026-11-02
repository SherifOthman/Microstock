import React from 'react';
import { CleanerOptions } from '../../../services/cleaner/fileCleanerEngine';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownAZ,
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
  return (
    <div className="space-y-4">
      {/* 1. MASTER DESTINATION DIRECTORY & SMART AUTO-RESUME BANNER */}
      <div className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <HardDrive className="w-4 h-4 text-emerald-500" />
              <span>{language === 'ar' ? 'مجلد الوجهة الرئيسي (Master Directory)' : 'Master Destination Directory'}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {language === 'ar'
                ? 'المجلد الأساسي الذي يحتوي على مجلدات الباتشات (مثل: B01, B02, B03).'
                : 'The root folder containing your stock batches (e.g. Stock_Master/ containing B01, B02, B03...).'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={onSelectMasterDirectory}
              disabled={isProcessing}
              className="gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-xs"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{masterDirectory ? (language === 'ar' ? 'تغيير المجلد' : 'Change Master Folder') : (language === 'ar' ? 'تحديد المجلد الرئيسي' : 'Select Master Directory')}</span>
            </Button>

            {masterDirectory && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onScanMasterDirectory(masterDirectory)}
                disabled={isScanningDisk || isProcessing}
                className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                title="Rescan Disk"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanningDisk ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>

        {/* Directory Path & Auto-Resume Detection Box */}
        {masterDirectory ? (
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs space-y-2">
            <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-300 truncate">
              <FolderCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">{masterDirectory}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-800/80">
              <Badge variant="outline" className="text-[10px] font-mono bg-zinc-800/60 border-zinc-700 text-zinc-300">
                {isScanningDisk ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Scanning disk...
                  </span>
                ) : existingBatchesCount > 0 ? (
                  `${existingBatchesCount} Batches Detected`
                ) : (
                  'Ready (Fresh Structure)'
                )}
              </Badge>

              <Badge
                variant="outline"
                className="text-[10px] font-mono bg-blue-500/10 border-blue-500/30 text-blue-400 font-semibold"
                title={mediaSlots.Photos.statusDescription}
              >
                📷 Photos: {mediaSlots.Photos.slotLabel}
              </Badge>

              <Badge
                variant="outline"
                className="text-[10px] font-mono bg-purple-500/10 border-purple-500/30 text-purple-400 font-semibold"
                title={mediaSlots.Videos.statusDescription}
              >
                🎬 Videos: {mediaSlots.Videos.slotLabel}
              </Badge>

              <Badge
                variant="outline"
                className="text-[10px] font-mono bg-amber-500/10 border-amber-500/30 text-amber-400 font-semibold"
                title={mediaSlots.Vectors.statusDescription}
              >
                ✒️ Vectors: {mediaSlots.Vectors.slotLabel}
              </Badge>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400 text-xs flex items-center gap-2">
            <FolderSync className="w-4 h-4 shrink-0" />
            <span>
              {language === 'ar'
                ? 'يرجى اختيار مجلد الوجهة الرئيسي أولاً لقراءة الباتشات من القرص وتحديد نقطة المتابعة تلقائياً.'
                : 'Select your Master Destination Directory first to enable disk auto-scanning, resume detection, and batch auto-splitting.'}
            </span>
          </div>
        )}
      </div>

      {/* 2. INGESTION & SORTING CONTROLS BAR */}
      <div className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
          <span>{language === 'ar' ? 'خيارات الفرز والتقسيم' : 'Ingestion & Sorting Settings'}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                {options.sortOrder === 'shuffle' ? <Shuffle className="w-3 h-3 text-emerald-400" /> : <ArrowDownAZ className="w-3 h-3 text-amber-400" />}
                <span>{language === 'ar' ? 'ترتيب الملفات:' : 'Sort Sequence:'}</span>
              </label>
              {options.sortOrder === 'shuffle' && rawFilesCount > 0 && (
                <button
                  type="button"
                  onClick={onReShuffle}
                  className="text-[10px] text-emerald-400 hover:underline flex items-center gap-0.5 cursor-pointer font-mono"
                  title="Re-randomize files sequence"
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
                  {language === 'ar' ? 'خلط عشوائي (افتراضي - يمنع رفض التشابه)' : 'Shuffle (Random Mix) [Default]'}
                </SelectItem>
                <SelectItem value="alphabetical" className="text-xs">
                  {language === 'ar' ? 'أبجدي بالاسم الأصلي (A-Z)' : 'Original Filename (A-Z)'}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <Layers className="w-3 h-3 text-primary" />
              <span>{language === 'ar' ? 'أقصى عدد لكل باتش (Auto-Split):' : 'Max Items Per Batch:'}</span>
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
              className="h-8 text-xs font-mono bg-background"
            />
          </div>
        </div>

        {options.sortOrder === 'alphabetical' && !isSeqWarningDismissed && (
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 dark:text-amber-400 text-xs flex items-center justify-between gap-2 mt-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
              <span>
                {language === 'ar'
                  ? '⚠️ تحذير: الترتيب المتسلسل قد يتسبب في رفض الصور بسبب تشابه اللقطات المتتالية على Adobe Stock.'
                  : "⚠️ Warning: Sequential sorting may cause 'Similar Image' rejection on Adobe Stock."}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsSeqWarningDismissed(true)}
              className="text-amber-500/80 hover:text-amber-500 cursor-pointer"
              title="Dismiss warning"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* MEDIA PRE-CHECK WARNING ALERT */}
      {(blockingErrorCount > 0 || softWarningCount > 0) && (
        <div className="space-y-2">
          {blockingErrorCount > 0 && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  {language === 'ar'
                    ? `⚠️ تنبيه حاسم: يوجد ${blockingErrorCount} فيديو بدقة غير مقبولة (يجب أن تكون بدقة 1080p أو 4K حصراً). تم تعطيل الحفظ حتى يتم تصحيح أو إزالة الملفات.`
                    : `⚠️ Critical Pre-Check: ${blockingErrorCount} video(s) have non-broadcast resolutions. Microstocks require strictly 1080p or 4K. Processing is blocked until resolved.`}
                </span>
              </div>
            </div>
          )}

          {softWarningCount > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 dark:text-amber-400 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                <span>
                  {language === 'ar'
                    ? `⚠️ تنبيه الدقة: يوجد ${softWarningCount} صورة أبعادها أقل من 3000 بكسل وتحتاج إلى تكبير (Upscale) للوصول إلى دقة 4K+ وتجنب رفض الستوك.`
                    : `⚠️ Resolution Alert: ${softWarningCount} photo(s) are under 3000px and need upscaling to 4K+ before agency submission.`}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onBulkMoveLowResPhotos}
                disabled={isBulkMoving || isProcessing}
                className="h-7.5 px-3 text-xs bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30 hover:text-amber-200 gap-1.5 shrink-0 cursor-pointer font-semibold shadow-xs transition"
              >
                {isBulkMoving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FolderSync className="w-3.5 h-3.5" />
                )}
                <span>
                  {language === 'ar'
                    ? `⚠️ يوجد ${softWarningCount} صور تحتاج تكبير. نقل الكل إلى _Needs_Fixing`
                    : `⚠️ ${softWarningCount} Photos need Upscaling. Move all to _Needs_Fixing`}
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
