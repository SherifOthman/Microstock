import React from 'react';
import { MasterMetadataRecord } from '../../../types';
import { Button } from '../../../components/ui/button';
import { Play, RotateCcw, Copy, Check, Maximize2, Trash2, Edit3 } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

export interface AssetActionButtonsProps {
  assetId: string;
  filename: string;
  isQueued?: boolean;
  isCompleted?: boolean;
  rec?: MasterMetadataRecord;
  copiedKey: string | null;
  onRegenerate: (id: string) => void;
  onCopyAll?: (rec: MasterMetadataRecord) => void;
  onOpenLightbox?: (id: string) => void;
  onDelete: (id: string, filename: string) => void;
  onManualEdit?: () => void;
}

export const AssetActionButtons: React.FC<AssetActionButtonsProps> = React.memo(({
  assetId,
  filename,
  isQueued = false,
  isCompleted = false,
  rec,
  copiedKey,
  onRegenerate,
  onCopyAll,
  onOpenLightbox,
  onDelete,
  onManualEdit,
}) => {
  const { t, language } = useLanguage();

  if (isQueued) {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onRegenerate(assetId)}
          className="h-7.5 px-3 text-xs font-medium cursor-pointer gap-1.5 shadow-2xs hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors"
        >
          <Play className="w-3 h-3 fill-current" />
          <span className="hidden sm:inline">{language === 'ar' ? 'توليد الآن' : 'Generate'}</span>
        </Button>

        {onManualEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onManualEdit}
            className="h-7.5 px-2.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Edit3 className="w-3 h-3" />
            <span className="hidden sm:inline">{language === 'ar' ? 'تعديل يدوي' : 'Manual Edit'}</span>
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(assetId, filename)}
          className="h-7.5 w-7.5 text-muted-foreground hover:text-destructive cursor-pointer"
          title={t.deleteAsset}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {/* Regenerate Button */}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onRegenerate(assetId)}
        className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer gap-1.5"
        title="Regenerate Metadata for this asset"
      >
        <RotateCcw className="w-3.5 h-3.5 text-blue-500" />
        <span className="hidden sm:inline">{language === 'ar' ? 'إعادة التوليد' : 'Regenerate'}</span>
      </Button>

      {/* Copy All Metadata Button */}
      {isCompleted && rec && onCopyAll && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onCopyAll(rec)}
          className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer gap-1.5"
          title="Copy Title, Description, and Keywords to clipboard"
        >
          {copiedKey === `${assetId}_all` ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500 hidden sm:inline">{t.copied}</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">{t.copyAllMetadata || 'Copy All'}</span>
            </>
          )}
        </Button>
      )}

      {/* Lightbox trigger */}
      {onOpenLightbox && (
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onOpenLightbox(assetId)}
          className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
          title="Full-Screen Preview"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </Button>
      )}

      {/* Delete asset button */}
      <Button
        size="icon"
        variant="ghost"
        onClick={() => onDelete(assetId, filename)}
        className="h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer"
        title={t.deleteAsset}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
});

AssetActionButtons.displayName = 'AssetActionButtons';
