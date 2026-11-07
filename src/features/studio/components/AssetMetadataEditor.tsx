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

  const deriveShortTitle = (r?: MasterMetadataRecord): string => {
    if (!r) return '';
    if (r.shortTitle) return r.shortTitle;
    const base = r.baseTitle || r.longTitle || '';
    if (base.length < 100) return base;
    return base.slice(0, 99).replace(/\s+\S*$/, '').trim();
  };

  const deriveLongTitle = (r?: MasterMetadataRecord): string => {
    if (!r) return '';
    return r.longTitle || r.baseTitle || r.shortTitle || '';
  };

  const [localShortTitle, setLocalShortTitle] = useState(deriveShortTitle(rec));
  const [localLongTitle, setLocalLongTitle] = useState(deriveLongTitle(rec));
  const [localDesc, setLocalDesc] = useState(rec?.detailedDescription || '');
  const [isDescExpanded, setIsDescExpanded] = useState(false);

  useEffect(() => {
    setLocalShortTitle(deriveShortTitle(rec));
    setLocalLongTitle(deriveLongTitle(rec));
  }, [rec?.shortTitle, rec?.longTitle, rec?.baseTitle]);

  useEffect(() => {
    if (rec?.detailedDescription !== undefined) {
      setLocalDesc(rec.detailedDescription);
    }
  }, [rec?.detailedDescription]);

  const handleBlurShortTitle = async () => {
    const trimmed = (localShortTitle ?? '').trim();
    if (rec && trimmed !== (rec.shortTitle ?? deriveShortTitle(rec))) {
      await db.masterRecords.update(rec.id, {
        shortTitle: trimmed,
        baseTitle: rec.longTitle || rec.baseTitle || trimmed,
      });
    }
  };

  const handleBlurLongTitle = async () => {
    const trimmed = (localLongTitle ?? '').trim();
    if (rec && trimmed !== (rec.longTitle ?? rec.baseTitle)) {
      await db.masterRecords.update(rec.id, {
        longTitle: trimmed,
        baseTitle: trimmed || localShortTitle,
      });
    }
  };

  const handleBlurDesc = async () => {
    if (rec && (localDesc ?? '').trim() !== rec.detailedDescription) {
      await db.masterRecords.update(rec.id, { detailedDescription: (localDesc ?? '').trim() });
    }
  };

  const shortLen = (localShortTitle || '').length;
  const longLen = (localLongTitle || '').length;

  return (
    <>
      {/* Short Title (<100 chars — Freepik / Vecteezy) */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <label className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
            <span>{language === 'ar' ? 'العنوان القصير (Short Title)' : 'Short Title'}</span>
            <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-secondary text-muted-foreground border border-border/60">
              Freepik · Vecteezy
            </span>
            <span
              className={`text-[10px] font-mono tabular-nums font-normal ${
                shortLen >= 100 ? 'text-amber-500 font-semibold' : 'text-muted-foreground'
              }`}
            >
              ({shortLen}/99 {language === 'ar' ? 'حرف' : 'chars'})
            </span>
          </label>
          <button
            type="button"
            onClick={() => onCopyText(localShortTitle, `${assetId}_short_title`)}
            disabled={!localShortTitle}
            className="inline-flex items-center gap-1 text-[11px] h-6 px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition cursor-pointer disabled:opacity-40"
          >
            {copiedKey === `${assetId}_short_title` ? (
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
          dir={localShortTitle ? 'ltr' : language === 'ar' ? 'rtl' : 'ltr'}
          value={localShortTitle}
          onChange={(e) => setLocalShortTitle(e.target.value)}
          onBlur={handleBlurShortTitle}
          placeholder={
            isProcessing
              ? language === 'ar'
                ? 'جاري توليد العنوان القصير (<100 حرف)...'
                : 'Generating short title (<100 chars)...'
              : language === 'ar'
              ? 'عنوان مكثف أقل من 100 حرف لـ Freepik و Vecteezy...'
              : 'Dense title strictly under 100 chars (Freepik / Vecteezy)...'
          }
          disabled={!rec}
          className={`text-xs bg-secondary/70 border border-border text-foreground font-medium h-8 focus:ring-1 focus:ring-ring ${
            localShortTitle ? 'text-left' : 'text-start'
          }`}
        />
      </div>

      {/* Long Title (<=200 chars — Adobe / Shutterstock / Dreamstime / 123RF) */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <label className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
            <span>{language === 'ar' ? 'العنوان المفصل (Long Title)' : 'Long Title'}</span>
            <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-secondary text-muted-foreground border border-border/60">
              Adobe · Shutterstock · Dreamstime · 123RF
            </span>
            <span
              className={`text-[10px] font-mono tabular-nums font-normal ${
                longLen > 200 ? 'text-amber-500 font-semibold' : 'text-muted-foreground'
              }`}
            >
              ({longLen}/200 {language === 'ar' ? 'حرف' : 'chars'})
            </span>
          </label>
          <button
            type="button"
            onClick={() => onCopyText(localLongTitle, `${assetId}_title`)}
            disabled={!localLongTitle}
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
          dir={localLongTitle ? 'ltr' : language === 'ar' ? 'rtl' : 'ltr'}
          value={localLongTitle}
          onChange={(e) => setLocalLongTitle(e.target.value)}
          onBlur={handleBlurLongTitle}
          placeholder={
            isProcessing
              ? language === 'ar'
                ? 'جاري توليد العنوان المفصل (حتى 200 حرف)...'
                : 'Generating detailed long title (up to 200 chars)...'
              : language === 'ar'
              ? 'عنوان تفصيلي حتى 200 حرف لـ Adobe و Shutterstock...'
              : 'Detailed stock title up to 200 chars (Adobe / Shutterstock)...'
          }
          disabled={!rec}
          className={`text-xs bg-secondary/70 border border-border text-foreground font-medium h-8 focus:ring-1 focus:ring-ring ${
            localLongTitle ? 'text-left' : 'text-start'
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
