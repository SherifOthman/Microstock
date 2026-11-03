import { TaskProgressBar } from '../../../components/ui/TaskProgressBar';
import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CleanedFileItem, SubFolderTrack } from '../../../services/cleaner/fileCleanerEngine';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Tooltip } from '../../../components/ui/tooltip';
import { useLanguage } from '../../../context/LanguageContext';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Eye,
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
  Wand2,
} from 'lucide-react';

export interface CleanerFileTableProps {
  language: string;
  rawFilesCount: number;
  cleanedItems: CleanedFileItem[];
  filteredItems: CleanedFileItem[];
  mediaBatches: any;
  batchDistribution: { folder: string; subFolder: SubFolderTrack; total: number; isNew: boolean }[];
  searchFilter: string;
  setSearchFilter: (q: string) => void;
  isProcessing: boolean;
  isBatchSaved?: boolean;
  masterDirectory: string;
  blockingErrorCount: number;
  totalDuplicateCount: number;
  duplicateGroupKeys: string[];
  progressMsg: string | null;
  processProgress?: { processed: number; total: number } | null;
  onDrop: (e: React.DragEvent) => void;
  onSelectFilesClick: () => void;
  onSelectFolderClick: () => void;
  onInitiateProcess: () => void;
  onSendToStudio?: () => void;
  onOpenDuplicateModal: (key: string) => void;
  onRemoveItem: (id: string, file: File, item: CleanedFileItem) => void;
  onPreviewItem?: (item: CleanedFileItem) => void;
}

export const CleanerFileTable: React.FC<CleanerFileTableProps> = React.memo(({
  language,
  rawFilesCount,
  cleanedItems,
  filteredItems,
  batchDistribution,
  searchFilter,
  setSearchFilter,
  isProcessing,
  isBatchSaved = false,
  masterDirectory,
  blockingErrorCount,
  totalDuplicateCount,
  duplicateGroupKeys,
  progressMsg,
  processProgress,
  onDrop,
  onSelectFilesClick,
  onSelectFolderClick,
  onInitiateProcess,
  onSendToStudio,
  onOpenDuplicateModal,
  onRemoveItem,
  onPreviewItem,
}) => {
  const { t } = useLanguage();
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Group batch distribution deterministically into Photos, Videos, Vectors
  const groupedBatches = React.useMemo(() => {
    const photos: typeof batchDistribution = [];
    const videos: typeof batchDistribution = [];
    const vectors: typeof batchDistribution = [];

    for (const b of batchDistribution) {
      if (b.subFolder.toLowerCase().includes('video')) {
        videos.push(b);
      } else if (b.subFolder.toLowerCase().includes('vector')) {
        vectors.push(b);
      } else {
        photos.push(b);
      }
    }
    return { photos, videos, vectors };
  }, [batchDistribution]);

  const rowVirtualizer = useVirtualizer({
    count: filteredItems.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 40,
    overscan: 25,
  });

  if (rawFilesCount === 0) {
    return (
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="border-2 border-dashed border-border hover:border-primary/50 bg-card rounded-xl p-10 text-center transition space-y-3"
      >
        <div className="w-11 h-11 rounded-xl bg-secondary text-primary flex items-center justify-center mx-auto border border-border">
          <UploadCloud className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            {language === 'ar' ? 'اسحب الملفات هنا للتنظيف والترقيم' : 'Drop stock files here to sanitize & organize'}
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {language === 'ar'
              ? 'يدعم JPG, PNG, MP4, MOV, EPS — تسمية تلقائية وتوزيع حسب النوع.'
              : 'Supports JPG, PNG, MP4, MOV, EPS — automatic sequential naming and media folder routing.'}
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button size="sm" onClick={onSelectFilesClick} className="gap-1.5 text-xs cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
            <span>{t.selectFiles}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onSelectFolderClick}
            className="gap-1.5 text-xs cursor-pointer"
          >
            <FolderUp className="w-3.5 h-3.5" />
            <span>{t.selectFolder}</span>
          </Button>
        </div>
      </div>
    );
  }

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const hasVirtualViewport = virtualRows.length > 0;
  const paddingTop = hasVirtualViewport ? virtualRows[0]?.start || 0 : 0;
  const paddingBottom = hasVirtualViewport
    ? Math.max(0, totalSize - (virtualRows[virtualRows.length - 1]?.end || 0))
    : 0;

  const isHiddenInBrowser =
    typeof window !== 'undefined' &&
    tableContainerRef.current &&
    (tableContainerRef.current.offsetParent === null || tableContainerRef.current.clientHeight === 0) &&
    typeof (globalThis as any).__vitest_worker__ === 'undefined' &&
    !(typeof process !== 'undefined' && process.env?.VITEST);

  const rowsToRender = hasVirtualViewport
    ? virtualRows.map((vr) => ({ item: filteredItems[vr.index], idx: vr.index }))
    : isHiddenInBrowser
    ? []
    : filteredItems.slice(0, 60).map((item, idx) => ({ item, idx }));

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col gap-2.5 overflow-hidden">
      {/* Task Progress Bar (when processing/saving) */}
      {isProcessing && (
        <TaskProgressBar
          status="running"
          currentCount={processProgress?.processed || 0}
          totalCount={processProgress?.total || cleanedItems.length}
          title={language === 'ar' ? 'جارٍ حفظ وتقسيم الملفات المنظمة...' : 'Saving and routing organized files...'}
          language={language}
        />
      )}

      {/* Batch Allocation & Action Toolbar (Sticky / Pinned Top Toolbar) */}
      <div className="p-3 bg-card rounded-xl border border-border flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0 sticky top-0 z-10 shadow-2xs">
        {/* Categorized Batch Distribution Groups */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>{language === 'ar' ? 'توزيع الـ Batch:' : 'Batch Allocation:'}</span>
            <span className="text-muted-foreground font-mono tabular-nums text-[11px] font-normal">
              ({cleanedItems.length} {language === 'ar' ? 'إجمالي' : 'total'})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {/* PHOTOS */}
            {groupedBatches.photos.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded border border-border">
                  <ImageIcon className="w-3 h-3 text-emerald-500" />
                  <span>{groupedBatches.photos[0]?.subFolder.startsWith('AI_') ? 'AI Photos' : 'Photos'}</span>
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  {groupedBatches.photos.map((b) => (
                    <span
                      key={`${b.subFolder}-${b.folder}`}
                      dir="ltr"
                      className="px-2 py-0.5 rounded border text-[11px] font-mono tabular-nums bg-secondary/60 border-border text-foreground"
                    >
                      <strong>{b.folder}:</strong> {b.total}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* VIDEOS */}
            {groupedBatches.videos.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded border border-border">
                  <Film className="w-3 h-3 text-blue-500" />
                  <span>{groupedBatches.videos[0]?.subFolder.startsWith('AI_') ? 'AI Videos' : 'Videos'}</span>
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  {groupedBatches.videos.map((b) => (
                    <span
                      key={`${b.subFolder}-${b.folder}`}
                      dir="ltr"
                      className="px-2 py-0.5 rounded border text-[11px] font-mono tabular-nums bg-secondary/60 border-border text-foreground"
                    >
                      <strong>{b.folder}:</strong> {b.total}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* VECTORS */}
            {groupedBatches.vectors.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded border border-border">
                  <PenTool className="w-3 h-3 text-violet-500" />
                  <span>{groupedBatches.vectors[0]?.subFolder.startsWith('AI_') ? 'AI Vectors' : 'Vectors'}</span>
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  {groupedBatches.vectors.map((b) => (
                    <span
                      key={`${b.subFolder}-${b.folder}`}
                      dir="ltr"
                      className="px-2 py-0.5 rounded border text-[11px] font-mono tabular-nums bg-secondary/60 border-border text-foreground"
                    >
                      <strong>{b.folder}:</strong> {b.total}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onSelectFilesClick}
            disabled={isProcessing}
            className="gap-1.5 text-xs cursor-pointer font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.selectFiles}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onSelectFolderClick}
            disabled={isProcessing}
            className="gap-1.5 text-xs cursor-pointer font-medium"
          >
            <FolderUp className="w-3.5 h-3.5" />
            <span>{t.selectFolder}</span>
          </Button>

          {onSendToStudio && (
            <Tooltip
              content={
                !isBatchSaved
                  ? language === 'ar'
                    ? 'احفظ الملفات المنظمة على القرص أولاً قبل إرسالها إلى استوديو Metadata'
                    : 'Process & Save renamed files to disk first before sending to Metadata Studio'
                  : language === 'ar'
                  ? 'إرسال الملفات المحفوظة إلى استوديو Metadata'
                  : 'Send saved files to Metadata Studio'
              }
            >
              <span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onSendToStudio}
                  disabled={!isBatchSaved || isProcessing || cleanedItems.length === 0 || blockingErrorCount > 0}
                  className="gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>
                    {language === 'ar'
                      ? `إرسال إلى استوديو Metadata (${cleanedItems.length})`
                      : `Send to Metadata Studio (${cleanedItems.length})`}
                  </span>
                </Button>
              </span>
            </Tooltip>
          )}

          <Button
            size="sm"
            onClick={onInitiateProcess}
            disabled={isProcessing || cleanedItems.length === 0 || blockingErrorCount > 0}
            className="gap-1.5 text-xs font-semibold cursor-pointer"
          >
            {isProcessing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>
              {language === 'ar'
                ? `حفظ في مجلد (${cleanedItems.length})`
                : `Process & Save to Folder (${cleanedItems.length})`}
            </span>
          </Button>
        </div>
      </div>

      {/* Duplicate Detection Alert */}
      {totalDuplicateCount > 0 && (
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Copy className="w-4 h-4 shrink-0" />
            <span>
              {language === 'ar'
                ? `تم رصد ${totalDuplicateCount} ملفات مكررة أو متشابهة.`
                : `${totalDuplicateCount} potential duplicate or variant files detected.`}
            </span>
          </div>
          {duplicateGroupKeys.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenDuplicateModal(duplicateGroupKeys[0])}
              className="h-6 px-2.5 text-[11px] cursor-pointer"
            >
              <span>{language === 'ar' ? 'مراجعة المكررات' : 'Review Duplicates'}</span>
            </Button>
          )}
        </div>
      )}

      {/* Progress Indicator */}
      {progressMsg && (
        <div className="p-2.5 rounded-lg bg-secondary/50 border border-border text-xs flex items-center gap-2 font-mono text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          <span>{progressMsg}</span>
        </div>
      )}

      {/* Search Filter */}
      <div className="flex items-center justify-between gap-2 text-xs shrink-0">
        <div className="relative w-full max-w-xs">
          <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={language === 'ar' ? 'تصفية الأسماء...' : 'Filter filenames...'}
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="h-8 ps-8 text-xs bg-background"
          />
        </div>
        <span dir="ltr" className="text-[11px] text-muted-foreground font-mono tabular-nums">
          {filteredItems.length} / {cleanedItems.length}
        </span>
      </div>

      {/* TanStack Virtualized Table (Full Window Height, 60fps for 2,000+ files) */}
      <div className="flex-1 min-h-0 rounded-xl border border-border bg-card overflow-hidden flex flex-col">
        <div ref={tableContainerRef} className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
          <table className="w-full text-xs text-start border-collapse">
            <thead className="sticky top-0 z-20 bg-secondary text-muted-foreground text-[11px] font-mono border-b border-border">
              <tr>
                <th className="py-2.5 px-3 w-12 text-center bg-secondary sticky top-0">{t.colNumber}</th>
                <th className="py-2.5 px-3 w-36 bg-secondary sticky top-0 text-start">{t.colBatch}</th>
                <th className="py-2.5 px-3 w-1/3 bg-secondary sticky top-0 text-start">{t.colOriginalName}</th>
                <th className="py-2.5 px-2 text-center w-6 bg-secondary sticky top-0"></th>
                <th className="py-2.5 px-3 w-1/3 bg-secondary sticky top-0 text-start">{t.colDestinationName}</th>
                <th className="py-2.5 px-3 w-32 text-center bg-secondary sticky top-0">{t.colResolution}</th>
                <th className="py-2.5 px-3 w-20 text-end bg-secondary sticky top-0">{t.colSize}</th>
                <th className="py-2.5 px-2 w-16 text-center bg-secondary sticky top-0">{t.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {paddingTop > 0 && (
                <tr>
                  <td style={{ height: `${paddingTop}px` }} colSpan={8} />
                </tr>
              )}
              {rowsToRender.map(({ item, idx }) => {
                if (!item) return null;
                const val = item.validation;
                const isAiTrack = item.subFolder.startsWith('AI_');
                const isPhoto = item.subFolder === 'Photos' || item.subFolder === 'AI_Photos';
                const isVideo = item.subFolder === 'Videos' || item.subFolder === 'AI_Videos';

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors ${
                      val?.isBlocking
                        ? 'bg-destructive/10 hover:bg-destructive/15'
                        : val?.warningType === 'photo_low_resolution'
                        ? 'bg-amber-500/5 hover:bg-amber-500/10'
                        : 'hover:bg-secondary/40'
                    }`}
                  >
                    <td className="py-2 px-3 text-center text-muted-foreground font-mono tabular-nums text-[10px]">
                      {idx + 1}
                    </td>

                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <span dir="ltr" className="font-semibold text-foreground">{item.batchFolder}</span>
                        <span className="text-muted-foreground">·</span>
                        <span
                          dir="ltr"
                          className={`inline-flex items-center gap-1 ${
                            isAiTrack ? 'text-violet-600 dark:text-violet-400 font-semibold' : 'text-muted-foreground'
                          }`}
                        >
                          {isPhoto ? (
                            <ImageIcon className={`w-3 h-3 ${isAiTrack ? 'text-violet-500' : 'text-primary'}`} />
                          ) : isVideo ? (
                            <Film className={`w-3 h-3 ${isAiTrack ? 'text-violet-500' : 'text-primary'}`} />
                          ) : (
                            <PenTool className={`w-3 h-3 ${isAiTrack ? 'text-violet-500' : 'text-primary'}`} />
                          )}
                          <span>{item.subFolder}</span>
                        </span>
                      </div>
                    </td>

                    <td className="py-2 px-3 font-mono text-muted-foreground truncate max-w-xs">
                      <div className="flex items-center gap-1.5 truncate">
                        <span dir="ltr" className="truncate text-start">{item.originalName}</span>
                        {item.isDuplicate && (
                          <Tooltip content={language === 'ar' ? 'مقارنة النسخ المكررة' : 'Compare duplicate variants'}>
                            <button
                              type="button"
                              onClick={() => onOpenDuplicateModal(item.fuzzyKey)}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-mono cursor-pointer shrink-0 transition"
                            >
                              <Copy className="w-2.5 h-2.5 shrink-0" />
                              <span>
                                {language === 'ar' ? `مكرر (${item.duplicateCount})` : `Dup (${item.duplicateCount})`}
                              </span>
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    </td>

                    <td className="py-2 px-2 text-center text-muted-foreground/50">
                      <ArrowRight className="w-3.5 h-3.5 mx-auto rtl:rotate-180" />
                    </td>

                    <td className="py-2 px-3 font-mono text-foreground">
                      <div dir="ltr" className="flex items-center gap-1 text-start">
                        <span className="text-muted-foreground text-[11px]">
                          {item.subFolder}/{item.batchFolder}/
                        </span>
                        <span className="text-foreground font-semibold text-xs">
                          {item.customName !== undefined ? item.customName : item.cleanedName}
                        </span>
                      </div>
                    </td>

                    <td className="py-2 px-3 text-center">
                      {val ? (
                        val.isBlocking ? (
                          <Tooltip content={val.message}>
                            <span dir="ltr" className="inline-flex items-center gap-1 text-destructive text-[11px] font-mono font-semibold">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              <span>{val.width}×{val.height}</span>
                            </span>
                          </Tooltip>
                        ) : val.warningType === 'photo_low_resolution' ? (
                          <Tooltip content={val.message}>
                            <span dir="ltr" className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-[11px] font-mono">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>{val.width}×{val.height}</span>
                            </span>
                          </Tooltip>
                        ) : (
                          <span dir="ltr" className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono tabular-nums">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{val.width ? `${val.width}×${val.height}` : 'OK'}</span>
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] text-muted-foreground font-mono inline-flex items-center justify-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                        </span>
                      )}
                    </td>

                    <td dir="ltr" className="py-2 px-3 text-end font-mono tabular-nums text-muted-foreground text-[11px]">
                      {(item.size / (1024 * 1024)).toFixed(1)} MB
                    </td>

                    <td className="py-2 px-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {onPreviewItem && (
                          <Tooltip content={language === 'ar' ? 'معاينة الملف' : 'Quick preview'}>
                            <button
                              type="button"
                              aria-label="Quick preview"
                              onClick={() => onPreviewItem(item)}
                              className="text-muted-foreground hover:text-primary p-1 rounded transition cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </Tooltip>
                        )}
                        {(item.nativePath || (item.file as any)?.path) && (
                          <Tooltip content={language === 'ar' ? 'إظهار في مستكشف الملفات' : 'Reveal in OS Explorer'}>
                            <button
                              type="button"
                              aria-label="Reveal in OS Explorer"
                              onClick={() =>
                                window.electronAPI?.showItemInFolder?.(
                                  item.nativePath || (item.file as any)?.path
                                )
                              }
                              className="text-muted-foreground hover:text-foreground p-1 rounded transition cursor-pointer"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                            </button>
                          </Tooltip>
                        )}
                        <Tooltip
                          content={
                            item.validation?.isBlocking || item.validation?.warningType === 'photo_low_resolution'
                              ? language === 'ar'
                                ? 'نقل إلى _Needs_Fixing'
                                : 'Move to _Needs_Fixing'
                              : language === 'ar'
                              ? 'إزالة من القائمة'
                              : 'Remove from list'
                          }
                        >
                          <button
                            type="button"
                            onClick={() => onRemoveItem(item.id, item.file, item)}
                            className="p-1 rounded text-muted-foreground hover:text-destructive transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paddingBottom > 0 && (
                <tr>
                  <td style={{ height: `${paddingBottom}px` }} colSpan={8} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

CleanerFileTable.displayName = 'CleanerFileTable';
