import React from 'react';
import { CleanedFileItem } from '../../../services/cleaner/fileCleanerEngine';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { useLanguage } from '../../../context/LanguageContext';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Film,
  FolderOpen,
  FolderUp,
  Image as ImageIcon,
  Layers,
  Loader2,
  PenTool,
  Plus,
  Save,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';

export interface CleanerFileTableProps {
  language: string;
  rawFilesCount: number;
  cleanedItems: CleanedFileItem[];
  filteredItems: CleanedFileItem[];
  mediaBatches: any;
  batchDistribution: { folder: string; subFolder: 'Photos' | 'Videos' | 'Vectors'; total: number; isNew: boolean }[];
  searchFilter: string;
  setSearchFilter: (q: string) => void;
  isProcessing: boolean;
  masterDirectory: string;
  blockingErrorCount: number;
  totalDuplicateCount: number;
  duplicateGroupKeys: string[];
  progressMsg: string | null;
  onDrop: (e: React.DragEvent) => void;
  onSelectFilesClick: () => void;
  onSelectFolderClick: () => void;
  onInitiateProcess: () => void;
  onOpenDuplicateModal: (key: string) => void;
  onRemoveItem: (id: string, file: File, item: CleanedFileItem) => void;
}

export const CleanerFileTable: React.FC<CleanerFileTableProps> = React.memo(({
  language,
  rawFilesCount,
  cleanedItems,
  filteredItems,
  mediaBatches,
  batchDistribution,
  searchFilter,
  setSearchFilter,
  isProcessing,
  masterDirectory,
  blockingErrorCount,
  totalDuplicateCount,
  duplicateGroupKeys,
  progressMsg,
  onDrop,
  onSelectFilesClick,
  onSelectFolderClick,
  onInitiateProcess,
  onOpenDuplicateModal,
  onRemoveItem,
}) => {
  const { t } = useLanguage();

  if (rawFilesCount === 0) {
    return (
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="border-2 border-dashed border-border hover:border-emerald-500/50 bg-card/50 rounded-2xl p-12 text-center transition space-y-4"
      >
        <div className="w-12 h-12 rounded-xl bg-secondary text-foreground flex items-center justify-center mx-auto border border-border">
          <UploadCloud className="w-6 h-6 text-emerald-500" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            {language === 'ar' ? 'اسحب الصور أو الفيديوهات أو المتجهات هنا' : 'Drop stock files here to organize & ingest'}
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {language === 'ar'
              ? 'يدعم JPG, PNG, MP4, MOV, EPS. فرز عشوائي، تسمية هجينة (B01_001__name)، وتوزيع تلقائي إلى Photos/ و Videos/ و Vectors/.'
              : 'Supports JPG, PNG, MP4, MOV, EPS. Shuffle sort, hybrid sequential naming (B01_001__name), and auto-routed to Photos/, Videos/, and Vectors/.'}
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button size="sm" onClick={onSelectFilesClick} className="gap-1.5 text-xs cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
            <span>{language === 'ar' ? 'اختيار ملفات' : 'Select Files'}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onSelectFolderClick}
            className="gap-1.5 text-xs cursor-pointer"
          >
            <FolderUp className="w-3.5 h-3.5" />
            <span>{t.selectFolder || 'Add Folder'}</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Batch Allocation Bar */}
      <div className="p-3.5 bg-card rounded-xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-emerald-500" />
            <span>{language === 'ar' ? 'خطة التقسيم:' : 'Batch Ingest Plan:'}</span>
          </span>

          {batchDistribution.map((b) => (
            <Badge
              key={`${b.subFolder}-${b.folder}`}
              variant="outline"
              className={`text-[11px] font-mono gap-1.5 py-0.5 ${
                b.isNew
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              }`}
            >
              <span className="font-bold">{b.subFolder}/{b.folder}:</span>
              <span>{b.total} items</span>
              {b.isNew && <span className="text-[9px] uppercase px-1 rounded bg-blue-500/20 font-sans">New</span>}
            </Badge>
          ))}

          <span className="text-muted-foreground font-mono text-[11px]">
            ({cleanedItems.length} {language === 'ar' ? 'إجمالي' : 'total files'})
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap justify-between sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onSelectFilesClick}
            disabled={isProcessing}
            className="gap-1.5 text-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{language === 'ar' ? 'إضافة المزيد' : 'Add More'}</span>
          </Button>

          <Button
            size="sm"
            onClick={onInitiateProcess}
            disabled={isProcessing || cleanedItems.length === 0 || !masterDirectory || blockingErrorCount > 0}
            className="gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-sm disabled:opacity-50"
          >
            {isProcessing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>
              {language === 'ar'
                ? `تنظيم وحفظ ${cleanedItems.length} ملف`
                : `Process & Ingest ${cleanedItems.length} Files`}
            </span>
          </Button>
        </div>
      </div>

      {/* Duplicate Detection Alert */}
      {totalDuplicateCount > 0 && (
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-500 dark:text-amber-400 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Copy className="w-4 h-4 shrink-0" />
            <span>
              {language === 'ar'
                ? `⚠️ تم اكتشاف ${totalDuplicateCount} ملفات قد تكون مكررة أو نُسخ مكبرة/معدلة. انقر على شارة التكرار لمقارنتها بالمعاينة.`
                : `⚠️ ${totalDuplicateCount} potential duplicate or upscaled file variants detected. Click duplicate badges to compare.`}
            </span>
          </div>
          {duplicateGroupKeys.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenDuplicateModal(duplicateGroupKeys[0])}
              className="h-6 px-2 text-[10px] text-amber-500 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer"
            >
              <span>{language === 'ar' ? 'مقارنة المكررات' : 'Review Duplicates'}</span>
            </Button>
          )}
        </div>
      )}

      {/* Progress Indicator */}
      {progressMsg && (
        <div className="p-2.5 rounded-lg bg-secondary/50 border border-border text-xs flex items-center gap-2 font-mono text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
          <span>{progressMsg}</span>
        </div>
      )}

      {/* Search Filter */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="relative w-full max-w-xs">
          <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={language === 'ar' ? 'بحث في أسماء الملفات...' : 'Filter files list...'}
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="h-8 ps-8 text-xs bg-background"
          />
        </div>
        <span className="text-[11px] text-muted-foreground font-mono">
          Showing {filteredItems.length} of {cleanedItems.length}
        </span>
      </div>

      {/* Live Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto max-h-[500px]" dir="ltr">
          <table className="w-full text-xs text-left border-collapse" dir="ltr">
            <thead className="sticky top-0 z-20 bg-zinc-950 text-zinc-200 dark:bg-zinc-950 dark:text-zinc-200 text-[11px] font-mono border-b border-border shadow-xs">
              <tr>
                <th className="py-2.5 px-3 w-12 text-center bg-zinc-950 dark:bg-zinc-950 sticky top-0">{t.colNumber || '#'}</th>
                <th className="py-2.5 px-3 w-32 bg-zinc-950 dark:bg-zinc-950 sticky top-0">{t.colBatch || 'Batch & Category'}</th>
                <th className="py-2.5 px-3 w-1/3 bg-zinc-950 dark:bg-zinc-950 sticky top-0">{t.colOriginalName || 'Original Filename'}</th>
                <th className="py-2.5 px-2 text-center w-6 bg-zinc-950 dark:bg-zinc-950 sticky top-0"></th>
                <th className="py-2.5 px-3 w-1/3 bg-zinc-950 dark:bg-zinc-950 sticky top-0">{t.colDestinationName || 'Destination Filename (Relative Path)'}</th>
                <th className="py-2.5 px-3 w-32 text-center bg-zinc-950 dark:bg-zinc-950 sticky top-0">{t.colResolution || 'Resolution Status'}</th>
                <th className="py-2.5 px-3 w-20 text-right bg-zinc-950 dark:bg-zinc-950 sticky top-0">{t.colSize || 'Size'}</th>
                <th className="py-2.5 px-2 w-16 text-center bg-zinc-950 dark:bg-zinc-950 sticky top-0">{t.colActions || 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredItems.map((item, idx) => {
                const isNewBatch = !(mediaBatches[item.subFolder] || []).some(
                  (b: any) => b.name.toLowerCase() === item.batchFolder.toLowerCase()
                );
                const val = item.validation;

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors ${
                      val?.isBlocking
                        ? 'bg-destructive/10 hover:bg-destructive/15'
                        : val?.warningType === 'photo_low_resolution'
                        ? 'bg-amber-500/5 hover:bg-amber-500/10'
                        : 'hover:bg-secondary/20'
                    }`}
                  >
                    <td className="py-2 px-3 text-center text-muted-foreground font-mono text-[10px]">
                      {idx + 1}
                    </td>

                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-mono font-bold ${
                            isNewBatch
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          }`}
                        >
                          {item.batchFolder}
                        </Badge>

                        <Badge
                          variant="secondary"
                          className="text-[9px] font-mono px-1 py-0 flex items-center gap-1 text-zinc-300"
                        >
                          {item.subFolder === 'Photos' ? (
                            <ImageIcon className="w-2.5 h-2.5 text-blue-400" />
                          ) : item.subFolder === 'Videos' ? (
                            <Film className="w-2.5 h-2.5 text-purple-400" />
                          ) : (
                            <PenTool className="w-2.5 h-2.5 text-amber-400" />
                          )}
                          <span>{item.subFolder}</span>
                        </Badge>
                      </div>
                    </td>

                    <td className="py-2 px-3 font-mono text-muted-foreground truncate max-w-xs" title={item.originalName}>
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">{item.originalName}</span>
                        {item.isDuplicate && (
                          <button
                            type="button"
                            onClick={() => onOpenDuplicateModal(item.fuzzyKey)}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-500 hover:bg-amber-500/25 text-[10px] font-mono cursor-pointer shrink-0 transition"
                            title={language === 'ar' ? 'ملف مكرر أو متطابق - انقر للمقارنة والمعاينة' : 'Fuzzy duplicate detected - Click to compare'}
                          >
                            <Copy className="w-2.5 h-2.5 shrink-0" />
                            <span>⚠️ Dup ({item.duplicateCount})</span>
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="py-2 px-2 text-center text-muted-foreground/60">
                      <ArrowRight className="w-3.5 h-3.5 mx-auto" />
                    </td>

                    <td className="py-2 px-3 font-mono text-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground text-[10px] font-semibold">
                          {item.subFolder}/{item.batchFolder}/
                        </span>
                        <span className="text-emerald-400 font-bold text-xs tracking-wide">
                          {item.customName !== undefined ? item.customName : item.cleanedName}
                        </span>
                      </div>
                    </td>

                    <td className="py-2 px-3 text-center">
                      {val ? (
                        val.isBlocking ? (
                          <div className="flex flex-col items-center gap-1">
                            <div
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/20 border border-destructive/40 text-destructive text-[10px] font-mono font-semibold"
                              title={val.message}
                            >
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              <span>{val.width}x{val.height} Invalid</span>
                            </div>
                            {item.nativePath && (
                              <button
                                type="button"
                                onClick={() => window.electronAPI?.showItemInFolder?.(item.nativePath!)}
                                className="inline-flex items-center gap-1 text-[10px] text-destructive hover:underline font-mono cursor-pointer"
                                title={language === 'ar' ? 'تحديد الملف في مستكشف ويندوز' : 'Locate in Windows Explorer'}
                              >
                                <FolderOpen className="w-3 h-3" />
                                <span>{language === 'ar' ? '🔍 تحديد' : '🔍 Locate'}</span>
                              </button>
                            )}
                          </div>
                        ) : val.warningType === 'photo_low_resolution' ? (
                          <div
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-500 text-[10px] font-mono"
                            title={val.message}
                          >
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>{val.width}x{val.height} (&lt;3000px)</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 text-emerald-500 text-[10px] font-mono">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{val.width ? `${val.width}x${val.height}` : 'Verified'}</span>
                          </div>
                        )
                      ) : (
                        <span className="text-[10px] text-muted-foreground font-mono flex items-center justify-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> checking
                        </span>
                      )}
                    </td>

                    <td className="py-2 px-3 text-right font-mono text-muted-foreground text-[10px]">
                      {(item.size / (1024 * 1024)).toFixed(1)} MB
                    </td>

                    <td className="py-2 px-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {item.nativePath && (
                          <button
                            type="button"
                            onClick={() => window.electronAPI?.showItemInFolder?.(item.nativePath!)}
                            className="text-muted-foreground hover:text-foreground p-1 rounded transition cursor-pointer"
                            title={language === 'ar' ? 'تحديد الملف في مستكشف ويندوز' : 'Show in Windows Explorer'}
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.id, item.file, item)}
                          className={`p-1 rounded transition cursor-pointer ${
                            item.validation?.isBlocking || item.validation?.warningType === 'photo_low_resolution'
                              ? 'text-amber-500 hover:text-destructive hover:bg-destructive/10'
                              : 'text-muted-foreground hover:text-destructive'
                          }`}
                          title={
                            item.validation?.isBlocking || item.validation?.warningType === 'photo_low_resolution'
                              ? (language === 'ar' ? 'نقل الملف إلى مجلد _Needs_Fixing وحذفه من القائمة' : 'Move to _Needs_Fixing folder & remove from queue')
                              : (language === 'ar' ? 'إزالة الملف من القائمة' : 'Remove file from queue')
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

CleanerFileTable.displayName = 'CleanerFileTable';
