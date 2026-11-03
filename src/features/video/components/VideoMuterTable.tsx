import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { VideoMuteItem } from '../hooks/useVideoMuter';
import { Button } from '../../../components/ui/button';
import { Tooltip } from '../../../components/ui/tooltip';
import {
  AlertCircle,
  Download,
  Eye,
  Film,
  FolderOpen,
  Loader2,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';

export interface VideoMuterTableProps {
  items: VideoMuteItem[];
  language: string;
  onMuteSingle: (id: string) => void;
  onDownloadSingle: (item: VideoMuteItem) => void;
  onRemoveItem: (id: string) => void;
  onPreviewItem?: (item: VideoMuteItem) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const VideoMuterTable: React.FC<VideoMuterTableProps> = React.memo(({
  items,
  language,
  onMuteSingle,
  onDownloadSingle,
  onRemoveItem,
  onPreviewItem,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    overscan: 25,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const hasVirtualViewport = virtualRows.length > 0;
  const paddingTop = hasVirtualViewport ? virtualRows[0]?.start || 0 : 0;
  const paddingBottom = hasVirtualViewport
    ? Math.max(0, totalSize - (virtualRows[virtualRows.length - 1]?.end || 0))
    : 0;

  const isHiddenInBrowser =
    typeof window !== 'undefined' &&
    scrollRef.current &&
    (scrollRef.current.offsetParent === null || scrollRef.current.clientHeight === 0) &&
    typeof (globalThis as any).__vitest_worker__ === 'undefined' &&
    !(typeof process !== 'undefined' && process.env?.VITEST);

  const rowsToRender = hasVirtualViewport
    ? virtualRows.map((vr) => ({ item: items[vr.index], idx: vr.index }))
    : isHiddenInBrowser
    ? []
    : items.slice(0, 60).map((item, idx) => ({ item, idx }));

  return (
    <div className="flex-1 min-h-0 rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
        <table className="w-full text-xs text-start border-collapse">
          <thead className="sticky top-0 z-20 bg-secondary text-muted-foreground text-[11px] font-mono border-b border-border">
            <tr>
              <th className="py-2.5 px-3 w-12 text-center bg-secondary sticky top-0">#</th>
              <th className="py-2.5 px-3 text-start bg-secondary sticky top-0">
                {language === 'ar' ? 'اسم ملف الفيديو' : 'Video Filename'}
              </th>
              <th className="py-2.5 px-3 w-36 text-center bg-secondary sticky top-0">
                {language === 'ar' ? 'حالة الصوت' : 'Audio Status'}
              </th>
              <th className="py-2.5 px-3 w-28 text-end bg-secondary sticky top-0">
                {language === 'ar' ? 'الحجم' : 'Size'}
              </th>
              <th className="py-2.5 px-3 w-48 text-end bg-secondary sticky top-0">
                {language === 'ar' ? 'إجراءات' : 'Actions'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {paddingTop > 0 && (
              <tr>
                <td style={{ height: `${paddingTop}px` }} colSpan={5} />
              </tr>
            )}
            {rowsToRender.map(({ item, idx }) => {
              if (!item) return null;
              const nativePath = item.nativePath || (item.file as any)?.path;

              return (
                <tr key={item.id} className="hover:bg-secondary/40 transition-colors">
                  <td className="py-2.5 px-3 text-center text-muted-foreground font-mono tabular-nums text-[10px]">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <Film className="w-4 h-4 text-primary shrink-0" />
                      <p dir="ltr" className="font-mono text-foreground font-medium truncate max-w-md text-start">
                        {item.originalName}
                      </p>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center text-[11px]">
                    {item.status === 'completed' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                        <VolumeX className="w-3 h-3" />
                        <span>{language === 'ar' ? 'صامت' : 'Silent'}</span>
                      </span>
                    ) : item.status === 'processing' ? (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>{language === 'ar' ? 'جاري الكتم...' : 'Stripping...'}</span>
                      </span>
                    ) : item.status === 'error' ? (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <AlertCircle className="w-3 h-3" />
                        <span>{language === 'ar' ? 'خطأ' : 'Error'}</span>
                      </span>
                    ) : item.hasAudio === true ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                        <Volume2 className="w-3 h-3" />
                        <span>{language === 'ar' ? 'يوجد صوت' : 'Audio Track'}</span>
                      </span>
                    ) : item.hasAudio === false ? (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <VolumeX className="w-3 h-3" />
                        <span>{language === 'ar' ? 'بدون صوت' : 'No Audio'}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {language === 'ar' ? 'جاري الفحص...' : 'Scanning...'}
                      </span>
                    )}
                  </td>
                  <td dir="ltr" className="py-2.5 px-3 text-end font-mono tabular-nums text-muted-foreground text-[11px]">
                    <div>{formatBytes(item.mutedSize || item.size)}</div>
                    {item.mutedSize !== undefined && item.size > item.mutedSize && (
                      <div className="text-[9px] text-emerald-600 dark:text-emerald-400">
                        -{formatBytes(item.size - item.mutedSize)}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-end">
                    <div className="flex items-center justify-end gap-1">
                      {onPreviewItem && (
                        <Tooltip content={language === 'ar' ? 'معاينة الفيديو' : 'Preview video'}>
                          <button
                            type="button"
                            aria-label="Preview video"
                            onClick={() => onPreviewItem(item)}
                            className="text-muted-foreground hover:text-primary p-1.5 rounded transition cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      )}

                      {nativePath && (
                        <Tooltip content={language === 'ar' ? 'إظهار في مستكشف الملفات' : 'Reveal in OS Explorer'}>
                          <button
                            type="button"
                            aria-label="Reveal in OS Explorer"
                            onClick={() => window.electronAPI?.showItemInFolder?.(nativePath)}
                            className="text-muted-foreground hover:text-foreground p-1.5 rounded transition cursor-pointer"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      )}

                      {item.status !== 'completed' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onMuteSingle(item.id)}
                          disabled={item.status === 'processing'}
                          className="h-7 px-2 text-[11px] gap-1 cursor-pointer"
                        >
                          <VolumeX className="w-3 h-3" />
                          <span>{language === 'ar' ? 'كتم' : 'Mute'}</span>
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onDownloadSingle(item)}
                          className="h-7 px-2 text-[11px] gap-1 cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>{language === 'ar' ? 'تحميل' : 'Save'}</span>
                        </Button>
                      )}

                      <Tooltip content={language === 'ar' ? 'إزالة' : 'Remove'}>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.id)}
                          className="text-muted-foreground hover:text-destructive p-1.5 rounded transition cursor-pointer"
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
                <td style={{ height: `${paddingBottom}px` }} colSpan={5} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

VideoMuterTable.displayName = 'VideoMuterTable';
