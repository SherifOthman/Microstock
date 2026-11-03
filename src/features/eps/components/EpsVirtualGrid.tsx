import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { EpsConvertItem } from '../hooks/useEpsConverter';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Tooltip } from '../../../components/ui/tooltip';
import { Eye, FolderDown, FolderOpen, Layers, Loader2, RefreshCw } from 'lucide-react';

interface EpsItemCardProps {
  item: EpsConvertItem;
  language: string;
  onRenderSingle: (item: EpsConvertItem) => void;
  onSaveSingleJpg: (item: EpsConvertItem) => void;
  onPreviewItem?: (item: EpsConvertItem) => void;
}

export const EpsItemCard: React.FC<EpsItemCardProps> = React.memo(
  ({ item, language, onRenderSingle, onSaveSingleJpg, onPreviewItem }) => {
    const previewSrc = item.result?.objectUrl || item.result?.dataUrl;
    const nativePath = item.nativePath || (item.file as any)?.path;

    return (
      <Card className="overflow-hidden flex flex-col justify-between border-border bg-card hover:border-primary/40 transition-colors">
        <div className="p-3 space-y-2.5">
          <div
            onClick={() => onPreviewItem && onPreviewItem(item)}
            className="aspect-square rounded-lg bg-secondary/70 border border-border flex items-center justify-center overflow-hidden relative cursor-pointer group"
          >
            {previewSrc ? (
              <img
                src={previewSrc}
                alt={item.outputJpgName}
                decoding="async"
                className="w-full h-full object-contain bg-white"
              />
            ) : item.status === 'rendering' ? (
              <div className="flex flex-col items-center gap-1.5 text-primary">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-[10px] font-mono">
                  {language === 'ar' ? 'جاري التحويل...' : 'Rendering...'}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <Layers className="w-7 h-7 text-primary/60" />
                <span className="text-[10px] font-mono uppercase">
                  {language === 'ar' ? 'متجه EPS' : 'EPS Vector'}
                </span>
              </div>
            )}

            {item.result && (
              <span dir="ltr" className="absolute bottom-1.5 end-1.5 bg-background/90 text-foreground text-[10px] font-mono tabular-nums border border-border px-1.5 py-0.5 rounded">
                {item.result.width} × {item.result.height}
              </span>
            )}
          </div>

          <div className="space-y-0.5 min-w-0 text-start">
            <p dir="ltr" className="text-xs font-semibold text-foreground truncate text-start">
              {item.originalName}
            </p>
            <p dir="ltr" className="text-[11px] text-muted-foreground font-mono truncate text-start">
              → {item.outputJpgName}
            </p>
          </div>
        </div>

        <div className="p-3 pt-2 flex items-center justify-between border-t border-border/60">
          <span dir="ltr" className="text-[10px] text-muted-foreground font-mono tabular-nums">
            {(item.size / 1024).toFixed(0)} KB
          </span>

          <div className="flex items-center gap-1">
            {onPreviewItem && (
              <Tooltip content={language === 'ar' ? 'معاينة' : 'Preview'}>
                <button
                  type="button"
                  aria-label="Preview"
                  onClick={() => onPreviewItem(item)}
                  className="text-muted-foreground hover:text-primary p-1 rounded transition cursor-pointer"
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
                  className="text-muted-foreground hover:text-foreground p-1 rounded transition cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            )}

            {item.status === 'completed' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSaveSingleJpg(item)}
                className="h-7 text-xs px-2.5 gap-1 cursor-pointer"
              >
                <FolderDown className="w-3 h-3" />
                <span>{language === 'ar' ? 'حفظ' : 'Save'}</span>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRenderSingle(item)}
                disabled={item.status === 'rendering'}
                className="h-7 text-xs px-2.5 gap-1 cursor-pointer"
              >
                {item.status === 'rendering' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                <span>{language === 'ar' ? 'تحويل' : 'Render'}</span>
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  }
);
EpsItemCard.displayName = 'EpsItemCard';

export interface EpsVirtualGridProps {
  items: EpsConvertItem[];
  language: string;
  onRenderSingle: (item: EpsConvertItem) => void;
  onSaveSingleJpg: (item: EpsConvertItem) => void;
  onPreviewItem?: (item: EpsConvertItem) => void;
}

const COLUMNS = 4;

export const EpsVirtualGrid: React.FC<EpsVirtualGridProps> = React.memo(({
  items,
  language,
  onRenderSingle,
  onSaveSingleJpg,
  onPreviewItem,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowCount = Math.ceil(items.length / COLUMNS);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 310,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const hasMeasuredViewport = virtualRows.length > 0;

  return (
    <div
      ref={parentRef}
      className="flex-1 min-h-0 overflow-y-auto pr-0.5"
    >
      {hasMeasuredViewport ? (
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualRows.map((virtualRow) => {
            const startIdx = virtualRow.index * COLUMNS;
            const rowItems = items.slice(startIdx, startIdx + COLUMNS);
            return (
              <div
                key={virtualRow.index}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 pb-3.5"
              >
                {rowItems.map((item) => (
                  <EpsItemCard
                    key={item.id}
                    item={item}
                    language={language}
                    onRenderSingle={onRenderSingle}
                    onSaveSingleJpg={onSaveSingleJpg}
                    onPreviewItem={onPreviewItem}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        /* Fallback for JSDOM / zero-height test environments */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {items.slice(0, 40).map((item) => (
            <EpsItemCard
              key={item.id}
              item={item}
              language={language}
              onRenderSingle={onRenderSingle}
              onSaveSingleJpg={onSaveSingleJpg}
              onPreviewItem={onPreviewItem}
            />
          ))}
        </div>
      )}
    </div>
  );
});

EpsVirtualGrid.displayName = 'EpsVirtualGrid';
