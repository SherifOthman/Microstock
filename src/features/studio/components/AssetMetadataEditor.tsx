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
  const { t, language } = useLanguage();
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
          <label className="font-semibold text-foreground flex items-center gap-1.5">
            <span>{t.title}</span>
            <span className="text-[10px] font-mono tabular-nums font-normal text-muted-foreground">
              ({(localTitle || '').length} {language === 'ar' ? 'حرف' : 'chars'})
            </span>
          </label>
          <button
            type="button"
            onClick={() => onCopyText(localTitle, `${assetId}_title`)}
            disabled={!localTitle}
            className="inline-flex items-center gap-1 text-[11px] h-6 px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition cursor-pointer disabled:opacity-40"
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
          dir={localTitle ? 'ltr' : language === 'ar' ? 'rtl' : 'ltr'}
          value={localTitle}
          onChange={(e) => setLocalTitle(e.target.value)}
          onBlur={handleBlurTitle}
          placeholder={
            isProcessing
              ? language === 'ar'
                ? 'جاري توليد العنوان...'
                : 'Generating title...'
              : language === 'ar'
              ? 'عنوان الملف (بالإنجليزية)...'
              : 'Stock Asset Title...'
          }
          disabled={!rec}
          className={`text-xs bg-secondary/70 border border-border text-foreground font-medium h-8 focus:ring-1 focus:ring-ring ${
            localTitle ? 'text-left' : 'text-start'
          }`}
        />
      </div>

      {/* Description Field with Copy, Character Counter & Expand Toggle on Compact */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <label className="font-semibold text-foreground flex items-center gap-1.5">
            <span>{t.description}</span>
            <span className="text-[10px] font-mono tabular-nums font-normal text-muted-foreground">
              ({(localDesc || '').length} {language === 'ar' ? 'حرف' : 'chars'})
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
                <span>{isDescExpanded ? (t.showLessTags || 'Less') : language === 'ar' ? 'المزيد' : 'More'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onCopyText(localDesc, `${assetId}_desc`)}
              disabled={!localDesc}
              className="inline-flex items-center gap-1 text-[11px] h-6 px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition cursor-pointer disabled:opacity-40"
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
          dir={localDesc ? 'ltr' : language === 'ar' ? 'rtl' : 'ltr'}
          rows={isCompact && !isDescExpanded ? 2 : 3}
          value={localDesc}
          onChange={(e) => setLocalDesc(e.target.value)}
          onBlur={handleBlurDesc}
          placeholder={
            isProcessing
              ? language === 'ar'
                ? 'جاري توليد الوصف...'
                : 'Generating description...'
              : language === 'ar'
              ? 'وصف تفصيلي للملف (بالإنجليزية)...'
              : 'Detailed stock description...'
          }
          disabled={!rec}
          className={`text-xs bg-secondary/70 border border-border text-foreground resize-none focus:ring-1 focus:ring-ring ${
            localDesc ? 'text-left' : 'text-start'
          } ${isCompact && !isDescExpanded ? 'line-clamp-2 max-h-16' : ''}`}
        />
      </div>
    </>
  );
});

AssetMetadataEditor.displayName = 'AssetMetadataEditor';
