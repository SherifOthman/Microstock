import React, { useState, useCallback, useEffect } from 'react';
import { MasterMetadataRecord } from '../../../types';
import { db } from '../../../db';
import { QueueItem } from '../../../services/queue/BatchQueueService';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Tooltip } from '../../../components/ui/tooltip';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { AssetKeywordsManager } from './AssetKeywordsManager';
import { AssetMetadataEditor } from './AssetMetadataEditor';
import { AssetCategoriesBadges } from './AssetCategoriesBadges';
import { AssetAiBadge } from './AssetAiBadge';

export interface UnifiedAssetRow {
  id: string;
  filename: string;
  thumbnailUrl?: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  queueItem?: QueueItem;
  masterRecord?: MasterMetadataRecord;
  error?: string;
  createdAt: number;
  isRetry?: boolean;
}

export interface AssetCardProps {
  asset: UnifiedAssetRow;
  rec?: MasterMetadataRecord;
  viewMode?: 'compact' | 'detailed';
  freepikAiActive?: boolean;
  dreamstimeAiActive?: boolean;
  selectedPlatforms?: string[];
  copiedKey: string | null;
  onCopyText: (text: string, id: string) => void;
  onCopyAll: (rec: MasterMetadataRecord) => void;
  onDelete: (id: string, filename: string) => void;
  onRegenerate: (id: string) => void;
  onOpenLightbox?: (assetId: string) => void;
  onMuteSingleVideo?: (assetId: string) => void;
  isMuting?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: (assetId: string) => void;
}

/**
 * Unified High-Density Single-Row Studio Asset Item with Expandable Drawer.
 * Expanding the row (via the chevron button) reveals the full editable Description textarea,
 * Title input, Keywords manager, and Agency Category badges.
 */
export const AssetCard: React.FC<AssetCardProps> = React.memo(({
  asset,
  rec,
  freepikAiActive = true,
  dreamstimeAiActive = true,
  selectedPlatforms = [],
  copiedKey,
  onCopyText,
  onCopyAll,
  onDelete,
  onRegenerate,
  onOpenLightbox,
  isExpanded,
  onToggleExpand,
}) => {
  const { t, language } = useLanguage();
  const [internalDrawerOpen, setInternalDrawerOpen] = useState(false);
  const isDrawerOpen = isExpanded !== undefined ? isExpanded : internalDrawerOpen;
  const [compactTitle, setCompactTitle] = useState(rec?.baseTitle || '');

  const handleToggleDrawer = useCallback(() => {
    if (onToggleExpand) {
      onToggleExpand(asset.id);
    } else {
      setInternalDrawerOpen((prev) => !prev);
    }
  }, [asset.id, onToggleExpand]);

  useEffect(() => {
    setCompactTitle(rec?.baseTitle || '');
  }, [rec?.baseTitle]);

  const isCompleted = asset.status === 'completed' && !!rec;
  const isProcessing = asset.status === 'processing';
  const isQueued = asset.status === 'queued';
  const isError = asset.status === 'error';
  const hasNonAsciiInFilename = /\u2026|[^\x00-\x7F]/.test(asset.filename);

  const isVideo =
    asset.queueItem?.mediaType === 'video' ||
    rec?.mediaType === 'video' ||
    /\.(mp4|mov|webm|avi|mkv|m4v)$/i.test(asset.filename);
  const videoHasAudio = isVideo
    ? (asset.queueItem?.hasAudio ?? rec?.videoMeta?.hasAudio)
    : undefined;

  const originalSize =
    rec?.fileSize ||
    asset.queueItem?.originalSizeBytes ||
    asset.queueItem?.file?.size;

  const formatBytes = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const hasFreepik = selectedPlatforms.includes('freepik');
  const hasDreamstime = selectedPlatforms.includes('dreamstime');
  const shouldEvaluateAi = hasFreepik || hasDreamstime;
  const hasUnflaggedAi = (hasFreepik && !freepikAiActive) || (hasDreamstime && !dreamstimeAiActive);
  const showAiBadge = shouldEvaluateAi;
  const isAiActive = shouldEvaluateAi && !hasUnflaggedAi;

  const handleUpdateKeywords = useCallback(async (newKeywords: string[]) => {
    if (rec) {
      await db.masterRecords.update(rec.id, { rankedKeywords: newKeywords });
    }
  }, [rec?.id]);

  const handleCompactTitleBlur = async () => {
    if (rec && (compactTitle ?? '').trim() !== rec.baseTitle) {
      await db.masterRecords.update(rec.id, { baseTitle: (compactTitle ?? '').trim() });
    }
  };

  const kwsCount = rec?.rankedKeywords?.length || 0;
  const nativePath: string | undefined =
    (asset as any).nativePath ||
    (asset.queueItem?.file as any)?.__nativePath ||
    (asset.queueItem?.file as any)?.path ||
    (rec as any)?.nativePath;

  const handleRevealInExplorer = useCallback(() => {
    if (nativePath && typeof window !== 'undefined' && window.electronAPI?.showItemInFolder) {
      window.electronAPI.showItemInFolder(nativePath);
    }
  }, [nativePath]);

  return (
    <div
      className={`rounded-lg border bg-card transition-colors w-full min-w-0 overflow-hidden ${
        videoHasAudio
          ? 'border-amber-500/50 hover:border-amber-500'
          : 'border-border hover:border-primary/40'
      }`}
    >
      {/* Single High-Density Row */}
      <div className="px-3 py-2 flex items-center gap-3 w-full min-w-0">
        {/* 40x40 Thumbnail */}
        <Tooltip content={language === 'ar' ? 'معاينة بالحجم الكامل' : 'Open preview'}>
          <button
            type="button"
            onClick={() => onOpenLightbox && onOpenLightbox(asset.id)}
            className="relative w-10 h-10 rounded-md overflow-hidden border border-border bg-secondary shrink-0 flex items-center justify-center cursor-pointer"
          >
            {asset.thumbnailUrl ? (
              <img src={asset.thumbnailUrl} alt={asset.filename} className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-4 h-4 text-muted-foreground/50" />
            )}
          </button>
        </Tooltip>

        {/* Filename & Status Column */}
        <div className="w-40 sm:w-52 shrink-0 min-w-0 text-start">
          <div className="flex items-center gap-1.5 min-w-0">
            <span dir="ltr" className="text-xs font-semibold text-foreground truncate block text-start">
              {asset.filename}
            </span>
            <AssetAiBadge
              showAiBadge={showAiBadge}
              isAiActive={isAiActive}
              hasNonAscii={hasNonAsciiInFilename}
              language={language}
            />
            {isVideo && videoHasAudio === true && (
              <Tooltip
                content={
                  language === 'ar'
                    ? 'تحذير: يحتوي هذا الفيديو على مسار صوتي! ترفض وكالات الستوك (Adobe, Shutterstock, Freepik) الفيديوهات ذات الأصوات غير المرخصة أو ضوضاء المايكروفون وقد يؤدي ذلك لحظر الحساب. استخدم أداة عزل الصوت أولاً.'
                    : 'Warning: Active audio track detected! Stock agencies (Adobe Stock, Shutterstock, Freepik, Pond5) reject videos with mic noise, voices, or background music and may block accounts for copyright/privacy violations. Strip audio in Audio Stripper before uploading.'
                }
              >
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/40 text-[10px] font-mono font-semibold shrink-0">
                  <Volume2 className="w-2.5 h-2.5" />
                  <span>{language === 'ar' ? 'صوت نشط!' : 'Has Audio!'}</span>
                </span>
              </Tooltip>
            )}
            {isVideo && videoHasAudio === false && (
              <Tooltip
                content={
                  language === 'ar'
                    ? 'آمن للرفع: فيديو صامت بدون مسار صوتي'
                    : 'Agency Safe: Video has no audio track (silent)'
                }
              >
                <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 text-[9px] font-mono shrink-0">
                  <VolumeX className="w-2.5 h-2.5" />
                </span>
              </Tooltip>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono tabular-nums text-muted-foreground mt-0.5">
            <span dir="ltr">{formatBytes(originalSize)}</span>
            <span>·</span>
            {isCompleted && (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                {t.completedStatus}
              </span>
            )}
            {isProcessing && (
              <span className="inline-flex items-center gap-1 text-primary font-medium">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                {t.processingStatus}
              </span>
            )}
            {isQueued && <span>{t.queuedStatus}</span>}
            {isError && <span className="text-destructive font-medium">{t.failedStatus}</span>}
          </div>
        </div>

        {/* Inline Title Input (or Status Message when ungenerated) */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          {rec ? (
            <>
              <Input
                dir={compactTitle ? 'ltr' : language === 'ar' ? 'rtl' : 'ltr'}
                value={compactTitle}
                onChange={(e) => setCompactTitle(e.target.value)}
                onBlur={handleCompactTitleBlur}
                placeholder={
                  isProcessing
                    ? language === 'ar'
                      ? 'جاري توليد العنوان...'
                      : 'Generating title...'
                    : language === 'ar'
                    ? 'عنوان الملف...'
                    : 'Asset title...'
                }
                className={`h-7 text-xs bg-secondary/60 border-border text-foreground font-medium flex-1 min-w-0 ${
                  compactTitle ? 'text-left' : 'text-start'
                }`}
              />
              <span
                dir={language === 'ar' ? 'rtl' : 'ltr'}
                className="text-[10px] font-mono tabular-nums text-muted-foreground shrink-0 hidden md:inline"
              >
                {language === 'ar' ? `${compactTitle.length} حرف` : `${compactTitle.length}c`}
              </span>
              <Tooltip content={t.copy}>
                <button
                  type="button"
                  onClick={() => onCopyText(compactTitle, `${asset.id}_title`)}
                  disabled={!compactTitle}
                  className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition cursor-pointer shrink-0"
                >
                  {copiedKey === `${asset.id}_title` ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </Tooltip>
            </>
          ) : isError ? (
            <span className="text-xs text-destructive truncate font-mono">
              {asset.error || asset.queueItem?.error || t.failedStatus}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground italic truncate">
              {isProcessing
                ? language === 'ar'
                  ? 'جاري توليد الـ Metadata...'
                  : 'Generating metadata...'
                : language === 'ar'
                ? 'في انتظار التوليد...'
                : 'Waiting in queue...'}
            </span>
          )}
        </div>

        {/* Keyword Count & Expand Drawer Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {rec && (
            <Tooltip content={language === 'ar' ? 'نسخ الكلمات المفتاحية' : 'Copy keywords'}>
              <button
                type="button"
                dir={language === 'ar' ? 'rtl' : 'ltr'}
                onClick={() => onCopyText((rec.rankedKeywords || []).join(', '), `${asset.id}_kws`)}
                className="h-7 px-2 rounded-md bg-secondary hover:bg-secondary/80 border border-border text-[11px] font-mono tabular-nums text-foreground flex items-center gap-1 cursor-pointer"
              >
                {copiedKey === `${asset.id}_kws` ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <span>{language === 'ar' ? `${kwsCount} كلمات` : `${kwsCount} tags`}</span>
                )}
              </button>
            </Tooltip>
          )}

          {rec && (
            <Tooltip
              content={
                isDrawerOpen
                  ? language === 'ar'
                    ? 'طي التفاصيل'
                    : 'Collapse details'
                  : language === 'ar'
                  ? 'توسيع الوصف والكلمات والتصنيفات'
                  : 'Expand description, keywords & categories'
              }
            >
              <button
                type="button"
                aria-label={isDrawerOpen ? 'Collapse details' : 'Expand details'}
                aria-expanded={isDrawerOpen}
                onClick={handleToggleDrawer}
                className={`h-7 px-2 rounded-md border text-xs flex items-center gap-1 transition cursor-pointer ${
                  isDrawerOpen
                    ? 'bg-primary/10 border-primary/40 text-primary font-semibold'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {isDrawerOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </Tooltip>
          )}

          {(isCompleted || isError) && !isProcessing && (
            <Tooltip content={isError ? t.retry : t.regenerate}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={isError ? t.retry : t.regenerate}
                onClick={() => onRegenerate(asset.id)}
                className={`h-7 w-7 cursor-pointer ${
                  isError ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </Tooltip>
          )}

          {onOpenLightbox && (
            <Tooltip content={language === 'ar' ? 'معاينة بالحجم الكامل' : 'Open preview'}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Open preview"
                onClick={() => onOpenLightbox(asset.id)}
                className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>
            </Tooltip>
          )}

          {nativePath && (
            <Tooltip content={language === 'ar' ? 'إظهار في مستكشف الملفات' : 'Reveal in OS Explorer'}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Reveal in OS Explorer"
                onClick={handleRevealInExplorer}
                className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
              </Button>
            </Tooltip>
          )}

          <Tooltip content={t.deleteAsset}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t.deleteAsset}
              onClick={() => onDelete(asset.id, asset.filename)}
              className="h-7 w-7 text-muted-foreground hover:text-destructive cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Expandable Drawer for Full Editable Description, Keywords & Agency Categories */}
      {isDrawerOpen && rec && (
        <div className="px-3.5 py-3 border-t border-border bg-secondary/20 space-y-3">
          <AssetMetadataEditor
            assetId={asset.id}
            rec={rec}
            isProcessing={isProcessing}
            isCompact={false}
            copiedKey={copiedKey}
            onCopyText={onCopyText}
          />
          <AssetKeywordsManager
            assetId={asset.id}
            keywords={rec.rankedKeywords}
            isCompact={false}
            copiedKey={copiedKey}
            onCopyKeywords={onCopyText}
            onUpdateKeywords={handleUpdateKeywords}
          />
          <AssetCategoriesBadges rec={rec} onCopyAll={onCopyAll} />
        </div>
      )}
    </div>
  );
});

AssetCard.displayName = 'AssetCard';
