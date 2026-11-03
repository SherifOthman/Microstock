import React from 'react';
import { MasterMetadataRecord } from '../../../types';
import { Button } from '../../../components/ui/button';
import { Tooltip } from '../../../components/ui/tooltip';
import { Edit3, RefreshCw, Trash2, Copy, Check } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

export interface AssetActionButtonsProps {
  assetId: string;
  filename: string;
  rec?: MasterMetadataRecord;
  isCompleted?: boolean;
  isError?: boolean;
  isQueued?: boolean;
  isCompact?: boolean;
  copiedKey: string | null;
  onRegenerate: (id: string) => void;
  onDelete: (id: string, filename: string) => void;
  onCopyAll?: (rec: MasterMetadataRecord) => void;
  onManualEdit?: () => void;
}

export const AssetActionButtons: React.FC<AssetActionButtonsProps> = React.memo(({
  assetId,
  filename,
  rec,
  isCompleted,
  isError,
  isQueued,
  copiedKey,
  onRegenerate,
  onDelete,
  onCopyAll,
  onManualEdit,
}) => {
  const { t, language } = useLanguage();

  if (isQueued) {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        {onManualEdit && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onManualEdit}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer gap-1"
          >
            <Edit3 className="w-3 h-3" />
            <span className="hidden sm:inline">{language === 'ar' ? 'تحرير يدوي' : 'Manual Edit'}</span>
          </Button>
        )}
        <Tooltip content={t.deleteAsset}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t.deleteAsset}
            onClick={() => onDelete(assetId, filename)}
            className="h-7 w-7 text-muted-foreground hover:text-destructive cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {isCompleted && rec && onCopyAll && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onCopyAll(rec)}
          className="h-7 text-xs gap-1.5 px-2.5 cursor-pointer"
        >
          {copiedKey === `all-${rec.id}` ? (
            <>
              <Check className="w-3 h-3 text-emerald-500" />
              <span className="text-emerald-500">{t.copiedAll || 'Copied All'}</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>{t.copyFullMetadata}</span>
            </>
          )}
        </Button>
      )}

      {(isCompleted || isError) && (
        <Tooltip content={isError ? t.retry : t.regenerate}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={isError ? t.retry : t.regenerate}
            onClick={() => onRegenerate(assetId)}
            className={`h-8 w-8 cursor-pointer ${
              isError ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </Tooltip>
      )}

      <Tooltip content={t.deleteAsset}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t.deleteAsset}
          onClick={() => onDelete(assetId, filename)}
          className="h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </Tooltip>
    </div>
  );
});

AssetActionButtons.displayName = 'AssetActionButtons';
