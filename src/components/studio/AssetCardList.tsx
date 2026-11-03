import React, { useRef, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MasterMetadataRecord } from '../../types';
import { AssetCard } from '../../features/studio/components/AssetCard';
import { Button } from '../ui/button';
import { UploadCloud, FolderUp, Plus } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export interface AssetCardListProps {
  assets: any[];
  viewMode?: 'compact' | 'detailed';
  freepikAiGenerated?: boolean;
  dtAiGenerated?: boolean;
  selectedPlatforms?: string[];
  copiedKey: string | null;
  onCopyText: (text: string, id: string) => void;
  onCopyAll: (rec: MasterMetadataRecord) => void;
  onDelete: (id: string, filename: string) => void;
  onRegenerate: (id: string) => void;
  onOpenLightbox: (id: string) => void;
  onSelectFiles: () => void;
  onSelectFolder: () => void;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

export const AssetCardList: React.FC<AssetCardListProps> = React.memo(({
  assets,
  freepikAiGenerated = true,
  dtAiGenerated = true,
  selectedPlatforms = [],
  copiedKey,
  onCopyText,
  onCopyAll,
  onDelete,
  onRegenerate,
  onOpenLightbox,
  onSelectFiles,
  onSelectFolder,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
}) => {
  const { t } = useLanguage();
  const parentRef = useRef<HTMLDivElement>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const handleToggleExpand = useCallback((assetId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  }, []);

  const virtualizer = useVirtualizer({
    count: assets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = assets[index];
      return item && expandedIds.has(item.id) ? 340 : 62;
    },
    overscan: 8,
  });

  if (assets.length === 0) {
    return (
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`p-10 sm:p-14 rounded-xl border-2 border-dashed text-center transition-colors flex flex-col items-center justify-center gap-3 ${
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-border bg-card hover:border-primary/40'
        }`}
      >
        <div className="w-11 h-11 rounded-xl bg-secondary border border-border flex items-center justify-center text-primary">
          <UploadCloud className="w-5 h-5" />
        </div>
        <div className="space-y-1 max-w-md">
          <h3 className="text-sm font-semibold text-foreground">{t.dropMediaHere}</h3>
          <p className="text-xs text-muted-foreground">{t.dropMediaDesc}</p>
        </div>
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button size="sm" onClick={onSelectFiles} className="gap-1.5 text-xs font-semibold cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
            <span>{t.selectFiles}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onSelectFolder}
            className="gap-1.5 text-xs cursor-pointer"
          >
            <FolderUp className="w-3.5 h-3.5" />
            <span>{t.selectFolder}</span>
          </Button>
        </div>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();
  const hasMeasuredViewport = virtualItems.length > 0;

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="space-y-2.5 flex flex-col min-h-0"
    >
      {/* Consistent Dropbar Header with Both "Add Files" and "Add Folder" Buttons */}
      <div
        className={`p-2.5 px-3.5 rounded-xl border border-dashed flex flex-wrap items-center justify-between gap-2 text-xs transition-colors shrink-0 ${
          isDragOver ? 'border-primary bg-primary/5' : 'border-border bg-card'
        }`}
      >
        <span className="text-muted-foreground flex items-center gap-2 font-medium">
          <UploadCloud className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>{t.dropMediaHere}</span>
        </span>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={onSelectFiles} className="h-7 text-xs gap-1 cursor-pointer">
            <Plus className="w-3 h-3" />
            <span>{t.selectFiles}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onSelectFolder} className="h-7 text-xs gap-1 cursor-pointer">
            <FolderUp className="w-3 h-3" />
            <span>{t.selectFolder}</span>
          </Button>
        </div>
      </div>

      {/* TanStack Virtualized High-Density Asset List (60fps at 2,000+ items) */}
      <div
        ref={parentRef}
        className="overflow-y-auto max-h-[calc(100vh-220px)] pr-0.5"
      >
        {hasMeasuredViewport ? (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualRow) => {
              const asset = assets[virtualRow.index];
              if (!asset) return null;
              return (
                <div
                  key={asset.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="pb-1.5"
                >
                  <AssetCard
                    asset={asset}
                    rec={asset.masterRecord}
                    viewMode="compact"
                    freepikAiActive={freepikAiGenerated}
                    dreamstimeAiActive={dtAiGenerated}
                    selectedPlatforms={selectedPlatforms}
                    copiedKey={copiedKey}
                    onCopyText={onCopyText}
                    onCopyAll={onCopyAll}
                    onDelete={onDelete}
                    onRegenerate={onRegenerate}
                    onOpenLightbox={onOpenLightbox}
                    isExpanded={expandedIds.has(asset.id)}
                    onToggleExpand={handleToggleExpand}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          /* Fallback for JSDOM / zero-height test environments */
          <div className="space-y-1.5">
            {assets.slice(0, 50).map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                rec={asset.masterRecord}
                viewMode="compact"
                freepikAiActive={freepikAiGenerated}
                dreamstimeAiActive={dtAiGenerated}
                selectedPlatforms={selectedPlatforms}
                copiedKey={copiedKey}
                onCopyText={onCopyText}
                onCopyAll={onCopyAll}
                onDelete={onDelete}
                onRegenerate={onRegenerate}
                onOpenLightbox={onOpenLightbox}
                isExpanded={expandedIds.has(asset.id)}
                onToggleExpand={handleToggleExpand}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

AssetCardList.displayName = 'AssetCardList';
