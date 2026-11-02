import React, { memo } from 'react';
import { UnifiedAssetRow } from '../../features/studio/components/AssetCard';
import { SupportedPlatform, MasterMetadataRecord } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from '../../components/ui/button';
import { UploadCloud, Image as ImageIcon, FolderUp } from 'lucide-react';
import { AssetCard } from '../../features/studio/components/AssetCard';

export interface AssetCardListProps {
  assets: UnifiedAssetRow[];
  viewMode: 'compact' | 'detailed';
  freepikAiGenerated: boolean;
  dtAiGenerated: boolean;
  selectedPlatforms: SupportedPlatform[];
  copiedKey: string | null;
  onCopyText: (text: string, id: string) => void;
  onCopyAll: (rec: MasterMetadataRecord) => void;
  onDelete: (id: string, filename: string) => void;
  onRegenerate: (id: string) => void;
  onOpenLightbox?: (id: string) => void;
  onMuteSingleVideo?: (id: string) => void;
  mutingAssetId?: string | null;
  onSelectFiles: () => void;
  onSelectFolder: () => void;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

export const AssetCardList: React.FC<AssetCardListProps> = memo(({
  assets,
  viewMode,
  freepikAiGenerated,
  dtAiGenerated,
  selectedPlatforms,
  copiedKey,
  onCopyText,
  onCopyAll,
  onDelete,
  onRegenerate,
  onOpenLightbox,
  onMuteSingleVideo,
  mutingAssetId,
  onSelectFiles,
  onSelectFolder,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
}) => {
  const { t } = useLanguage();

  if (assets.length === 0) {
    return (
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-16 text-center transition-all ${
          isDragOver
            ? 'border-foreground bg-accent/40 scale-[0.99]'
            : 'border-border bg-card/40 hover:bg-card/70'
        }`}
      >
        <div className="w-12 h-12 rounded-xl bg-secondary text-foreground flex items-center justify-center mx-auto mb-3 border border-border">
          <UploadCloud className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">
          Drop stock images or videos here or browse files
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5 mb-4">
          Supports JPG, PNG, WebP, MP4, MOV, and EPS vectors.
        </p>
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" onClick={onSelectFiles} className="gap-1.5 cursor-pointer">
            <ImageIcon className="w-3.5 h-3.5" /> Select Images & Videos
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onSelectFolder}
            className="gap-1.5 cursor-pointer"
          >
            <FolderUp className="w-3.5 h-3.5" /> {t.selectFolder}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={viewMode === 'compact' ? 'space-y-2.5' : 'space-y-4'}>
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          rec={asset.masterRecord}
          viewMode={viewMode}
          freepikAiActive={freepikAiGenerated}
          dreamstimeAiActive={dtAiGenerated}
          selectedPlatforms={selectedPlatforms}
          copiedKey={copiedKey}
          onCopyText={onCopyText}
          onCopyAll={onCopyAll}
          onDelete={onDelete}
          onRegenerate={onRegenerate}
          onOpenLightbox={onOpenLightbox}
          onMuteSingleVideo={onMuteSingleVideo}
          isMuting={mutingAssetId === asset.id}
        />
      ))}
    </div>
  );
});

AssetCardList.displayName = 'AssetCardList';
