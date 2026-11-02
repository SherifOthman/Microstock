import React, { useState, useEffect } from 'react';
import { Check, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { MasterMetadataRecord } from '../../../types';
import { db } from '../../../db';
import { useLanguage } from '../../../context/LanguageContext';

export interface AssetMetadataEditorProps {
  assetId: string;
  rec?: MasterMetadataRecord;
  isProcessing?: boolean;
  isCompact?: boolean;
  copiedKey: string | null;
  onCopyText: (text: string, id: string) => void;
}

export const AssetMetadataEditor: React.FC<AssetMetadataEditorProps> = React.memo(({
  assetId,
  rec,
  isProcessing = false,
  isCompact = false,
  copiedKey,
  onCopyText,
}) => {
  const { t } = useLanguage();
  const [localTitle, setLocalTitle] = useState(rec?.baseTitle || '');
  const [localDesc, setLocalDesc] = useState(rec?.detailedDescription || '');
  const [isDescExpanded, setIsDescExpanded] = useState(false);

  useEffect(() => {
    if (rec?.baseTitle !== undefined) {
      setLocalTitle(rec.baseTitle);
    }
  }, [rec?.baseTitle]);

  useEffect(() => {
    if (rec?.detailedDescription !== undefined) {
      setLocalDesc(rec.detailedDescription);
    }
  }, [rec?.detailedDescription]);

  const handleBlurTitle = async () => {
    if (rec && (localTitle ?? '').trim() !== rec.baseTitle) {
      await db.masterRecords.update(rec.id, { baseTitle: (localTitle ?? '').trim() });
    }
  };

  const handleBlurDesc = async () => {
    if (rec && (localDesc ?? '').trim() !== rec.detailedDescription) {
      await db.masterRecords.update(rec.id, { detailedDescription: (localDesc ?? '').trim() });
    }
  };

  return (
    <>
      {/* Title Field with Copy & Character Counter */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <label className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
            <span>{t.title}</span>
            <span className="text-[10px] font-mono font-normal text-muted-foreground">
              ({(localTitle || '').length} chars)
            </span>
          </label>
          <button
            type="button"
            onClick={() => onCopyText(localTitle, `${assetId}_title`)}
            disabled={!localTitle}
            className="inline-flex items-center gap-1 text-[11px] h-6 px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer disabled:opacity-40"
          >
            {copiedKey === `${assetId}_title` ? (
              <>
                <Check className="w-3 h-3 text-emerald-500" />
                <span className="text-emerald-500">{t.copied}</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-muted-foreground" />
                <span>{t.copy}</span>
              </>
            )}
          </button>
        </div>
        <Input
          dir="ltr"
          value={localTitle}
          onChange={(e) => setLocalTitle(e.target.value)}
          onBlur={handleBlurTitle}
          placeholder={isProcessing ? 'Generating title...' : 'Stock Asset Title...'}
          disabled={!rec}
          className="text-xs bg-zinc-100/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium text-left h-8 focus:ring-1 focus:ring-blue-500 shadow-2xs"
        />
      </div>

      {/* Description Field with Copy, Character Counter & Expand Toggle on Compact */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <label className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
            <span>{t.description}</span>
            <span className="text-[10px] font-mono font-normal text-muted-foreground">
              ({(localDesc || '').length} chars)
            </span>
          </label>
          <div className="flex items-center gap-1.5">
            {isCompact && (localDesc || '').length > 90 && (
              <button
                type="button"
                onClick={() => setIsDescExpanded(!isDescExpanded)}
                className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {isDescExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                <span>{isDescExpanded ? (t.showLessTags || 'Less') : 'More'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onCopyText(localDesc, `${assetId}_desc`)}
              disabled={!localDesc}
              className="inline-flex items-center gap-1 text-[11px] h-6 px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer disabled:opacity-40"
            >
              {copiedKey === `${assetId}_desc` ? (
                <>
                  <Check className="w-3 h-3 text-emerald-500" />
                  <span className="text-emerald-500">{t.copied}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-muted-foreground" />
                  <span>{t.copy}</span>
                </>
              )}
            </button>
          </div>
        </div>
        <Textarea
          dir="ltr"
          rows={isCompact && !isDescExpanded ? 2 : 3}
          value={localDesc}
          onChange={(e) => setLocalDesc(e.target.value)}
          onBlur={handleBlurDesc}
          placeholder={isProcessing ? 'Generating description...' : 'Detailed stock description...'}
          disabled={!rec}
          className={`text-xs bg-zinc-100/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 resize-none text-left focus:ring-1 focus:ring-blue-500 shadow-2xs ${
            isCompact && !isDescExpanded ? 'line-clamp-2 max-h-16' : ''
          }`}
        />
      </div>
    </>
  );
});

AssetMetadataEditor.displayName = 'AssetMetadataEditor';
