import React, { useState, useCallback } from 'react';
import { MasterMetadataRecord } from '../../../types';
import { db } from '../../../db';
import { QueueItem } from '../../../services/queue/BatchQueueService';
import { MODEL_DISPLAY_NAMES } from '../../../constants/providers';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  AlertTriangle,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { AssetThumbnail } from './AssetThumbnail';
import { AssetActionButtons } from './AssetActionButtons';
import { AssetKeywordsManager } from './AssetKeywordsManager';
import { AssetMetadataEditor } from './AssetMetadataEditor';
import { AssetCategoriesBadges } from './AssetCategoriesBadges';
import { AssetAiBadge } from './AssetAiBadge';

export interface UnifiedAssetRow {
  id: string;
  filename: string;
  thumbnailUrl: string;
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
}

export const AssetCard: React.FC<AssetCardProps> = React.memo(({
  asset,
  rec,
  viewMode = 'detailed',
  freepikAiActive = true,
  dreamstimeAiActive = true,
  selectedPlatforms = [],
  copiedKey,
  onCopyText,
  onCopyAll,
  onDelete,
  onRegenerate,
  onOpenLightbox,
  onMuteSingleVideo,
  isMuting = false,
}) => {
  const { t, language } = useLanguage();
  const [isManualEdit, setIsManualEdit] = useState(false);

  const isCompleted = asset.status === 'completed' && !!rec;
  const isProcessing = asset.status === 'processing';
  const isQueued = asset.status === 'queued';
  const isError = asset.status === 'error';
  const hasNonAsciiInFilename = /\u2026|[^\x00-\x7F]/.test(asset.filename);

  const originalSize =
    rec?.fileSize ||
    asset.queueItem?.originalSizeBytes ||
    asset.queueItem?.file?.size;

  const compressedSize =
    rec?.compressedSize ||
    asset.queueItem?.compressedSizeBytes ||
    (rec?.thumbnailBase64 ? Math.round((rec.thumbnailBase64.length * 3) / 4) : undefined) ||
    (asset.queueItem?.thumbnailBase64
      ? Math.round((asset.queueItem.thumbnailBase64.length * 3) / 4)
      : undefined);

  const savingsPercent =
    originalSize && compressedSize && originalSize > compressedSize
      ? Math.round(((originalSize - compressedSize) / originalSize) * 100)
      : null;

  const formatBytes = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getCleanProviderName = (providerId?: string): string => {
    if (!providerId) return 'AI Provider';
    const lower = providerId.toLowerCase();
    if (lower.includes('gemini') || lower === 'google') return 'Gemini';
    if (lower.includes('mistral')) return 'Mistral';
    if (lower.includes('groq')) return 'Groq';
    if (lower.includes('openrouter')) return 'OpenRouter';
    if (lower.includes('cloudflare')) return 'Cloudflare';
    return providerId.charAt(0).toUpperCase() + providerId.slice(1);
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

  const isCompact = viewMode === 'compact';

  // State-Driven UX Rule: Collapsed Pending Row for un-generated queued assets
  if (isQueued && !isProcessing && !isCompleted && !isManualEdit) {
    return (
      <div className="p-3 bg-card rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between gap-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors w-full min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div
            onClick={() => onOpenLightbox && onOpenLightbox(asset.id)}
            className="relative w-11 h-11 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shrink-0 flex items-center justify-center cursor-pointer"
            title="Click to view full preview"
          >
            {asset.thumbnailUrl ? (
              <img src={asset.thumbnailUrl} alt={asset.filename} className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
            )}
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <span className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[200px] sm:max-w-xs md:max-w-md block" title={asset.filename}>
                {asset.filename}
              </span>
              <AssetAiBadge
                showAiBadge={showAiBadge}
                isAiActive={isAiActive}
                hasNonAscii={hasNonAsciiInFilename}
                language={language}
              />
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
              <span>{formatBytes(originalSize)}</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-sans font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {t.queuedStatus || 'في الانتظار'}
              </span>
            </div>
          </div>
        </div>

        <AssetActionButtons
          assetId={asset.id}
          filename={asset.filename}
          isQueued={true}
          copiedKey={copiedKey}
          onRegenerate={onRegenerate}
          onDelete={onDelete}
          onManualEdit={() => setIsManualEdit(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-border bg-card shadow-xs transition hover:border-border/80 flex flex-col min-w-0 w-full overflow-hidden ${
        isCompact ? 'p-3 sm:p-4 gap-3' : 'p-3 sm:p-5 gap-4 lg:gap-5 lg:flex-row items-start'
      }`}
    >
      {/* COMPACT MODE HEADER */}
      {isCompact && (
        <div className="flex items-center justify-between gap-3 w-full min-w-0 pb-2.5 border-b border-border/60">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onOpenLightbox && onOpenLightbox(asset.id)}
              className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border border-border bg-muted/30 shrink-0 group cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-ring"
              title="Click to view in Full-Screen Lightbox"
            >
              {asset.thumbnailUrl ? (
                <img
                  src={asset.thumbnailUrl}
                  alt={asset.filename}
                  className="w-full h-full object-cover transition duration-150 group-hover:scale-105"
                />
              ) : (
                <ImageIcon className="w-6 h-6 text-muted-foreground/40 m-auto" />
              )}
            </button>

            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-full block"
                  title={asset.filename}
                >
                  {asset.filename}
                </span>
                <AssetAiBadge
                  showAiBadge={showAiBadge}
                  isAiActive={isAiActive}
                  hasNonAscii={hasNonAsciiInFilename}
                  language={language}
                />
                {(rec?.mediaType === 'video' || asset.queueItem?.mediaType === 'video') && asset.queueItem?.hasAudio && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onMuteSingleVideo && onMuteSingleVideo(asset.id)}
                    disabled={isMuting}
                    className="h-5 px-1.5 text-[9px] gap-1 font-semibold text-amber-500 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 shrink-0"
                    title="Audio detected - Click to strip audio track"
                  >
                    <Volume2 className="w-2.5 h-2.5" />
                    <span>{language === 'ar' ? 'كتم الصوت' : 'Mute'}</span>
                  </Button>
                )}
                {asset.queueItem?.isMuted && (
                  <Badge variant="outline" className="h-5 px-1.5 text-[9px] gap-1 text-emerald-500 border-emerald-500/30 bg-emerald-500/10 font-mono">
                    <VolumeX className="w-2.5 h-2.5" />
                    <span>{language === 'ar' ? 'صامت' : 'Silent'}</span>
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {isCompleted && (
                  <Badge variant="outline" className="py-0 px-2 h-5 text-[10px] font-semibold border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>{t.completedStatus}</span>
                  </Badge>
                )}
                {isProcessing && (
                  <Badge variant="outline" className="py-0 px-2 h-5 text-[10px] font-semibold border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 gap-1 shrink-0">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>{t.processingStatus}</span>
                  </Badge>
                )}
                {isQueued && (
                  <Badge variant="outline" className="py-0 px-2 h-5 text-[10px] font-medium border-border/80 bg-secondary/60 text-muted-foreground gap-1 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
                    <span>{t.queuedStatus || 'Waiting'}</span>
                  </Badge>
                )}
                {isError && (
                  <Badge variant="outline" className="py-0 px-2 h-5 text-[10px] font-semibold border-destructive/40 bg-destructive/10 text-destructive gap-1 shrink-0">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{t.failedStatus}</span>
                  </Badge>
                )}
                {isCompleted && rec && (
                  <span className="text-[11px] text-muted-foreground font-mono truncate">
                    {getCleanProviderName(rec.aiGenerationInfo?.provider)}
                    {rec.aiGenerationInfo?.latencyMs ? ` • ${(rec.aiGenerationInfo.latencyMs / 1000).toFixed(1)}s` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {(isCompleted || isError) && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRegenerate(asset.id)}
                className={`h-8 w-8 cursor-pointer ${isError ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:text-foreground'}`}
                title={isError ? (t.retry || 'Retry') : t.regenerate}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDelete(asset.id, asset.filename)}
              className="h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer"
              title={t.deleteAsset}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* DETAILED MODE SIDEBAR: Full Thumbnail, Media Type, Audio Muter, Status & Telemetry */}
      {!isCompact && (
        <div className="w-full lg:w-56 shrink-0 flex flex-col gap-2.5 min-w-0">
          <div className="relative">
            <AssetThumbnail
              assetId={asset.id}
              filename={asset.filename}
              thumbnailUrl={asset.thumbnailUrl}
              mediaType={rec?.mediaType || asset.queueItem?.mediaType}
              queueItem={asset.queueItem}
              rec={rec}
              isCompact={false}
              onOpenLightbox={onOpenLightbox}
              onMuteSingleVideo={onMuteSingleVideo}
              isMuting={isMuting}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(asset.id, asset.filename);
              }}
              className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-background/80 hover:bg-destructive hover:text-destructive-foreground text-foreground border border-border/80 flex items-center justify-center shadow-xs transition cursor-pointer z-10"
              title={t.deleteAsset}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-1.5 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate block" title={asset.filename}>
                  {asset.filename}
                </p>
                <AssetAiBadge
                  showAiBadge={showAiBadge}
                  isAiActive={isAiActive}
                  hasNonAscii={hasNonAsciiInFilename}
                  language={language}
                />
              </div>

              {isCompleted && (
                <Badge variant="outline" className="py-0.5 px-2 rounded-md border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-[10px] flex items-center gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>{t.completedStatus}</span>
                </Badge>
              )}
              {isProcessing && (
                <Badge variant="outline" className="py-0.5 px-2 rounded-md border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold text-[10px] flex items-center gap-1 shrink-0">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{t.processingStatus}</span>
                </Badge>
              )}
              {isError && (
                <Badge variant="outline" className="py-0.5 px-2 rounded-md border-destructive/40 bg-destructive/10 text-destructive font-semibold text-[10px] flex items-center gap-1 shrink-0">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{t.failedStatus}</span>
                </Badge>
              )}
            </div>

            {isError && (asset.error || asset.queueItem?.error) && (
              <div className="w-full text-xs text-destructive bg-destructive/10 border border-destructive/25 rounded-md p-2 flex items-start gap-2 break-normal">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-0.5 min-w-0">
                  <p className="font-semibold text-[11px] leading-tight text-destructive">
                    {language === 'ar' ? 'فشل التحليل البصري' : 'AI Analysis Failed'}
                  </p>
                  <p className="font-mono text-[11px] leading-relaxed text-destructive/90 break-words select-text">
                    {asset.error || asset.queueItem?.error}
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-lg bg-zinc-100/90 dark:bg-zinc-900/90 border border-zinc-200/70 dark:border-zinc-800 p-2.5 text-xs text-zinc-700 dark:text-zinc-300 space-y-1 font-mono">
              <div className="flex items-center justify-between">
                <span>{formatBytes(originalSize)} → {formatBytes(compressedSize)}</span>
                {savingsPercent !== null && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                    -{savingsPercent}%
                  </span>
                )}
              </div>
              {isCompleted && rec && (
                <div className="flex items-center justify-between pt-1 border-t border-zinc-200/50 dark:border-zinc-700/50 text-[11px]">
                  <span className="truncate max-w-[120px] text-zinc-900 dark:text-zinc-100 font-semibold">
                    {getCleanProviderName(rec.aiGenerationInfo?.provider)}
                  </span>
                  {rec.aiGenerationInfo?.latencyMs && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {(rec.aiGenerationInfo.latencyMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="pt-0.5">
            {isCompleted && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRegenerate(asset.id)}
                className="w-full h-7.5 text-xs gap-1.5 cursor-pointer font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
              >
                <RefreshCw className="w-3 h-3 text-muted-foreground" />
                <span>{t.regenerate}</span>
              </Button>
            )}
            {isError && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onRegenerate(asset.id)}
                className="w-full h-7.5 text-xs gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>{t.retry || (language === 'ar' ? 'إعادة المحاولة' : 'Retry')}</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* RIGHT COLUMN: Metadata Editor, Keywords Manager & Categories */}
      <div className={`flex-1 w-full min-w-0 overflow-hidden ${isCompact ? 'space-y-2.5' : 'space-y-3.5'}`}>
        <AssetMetadataEditor
          assetId={asset.id}
          rec={rec}
          isProcessing={isProcessing}
          isCompact={isCompact}
          copiedKey={copiedKey}
          onCopyText={onCopyText}
        />

        {rec ? (
          <AssetKeywordsManager
            assetId={asset.id}
            keywords={rec.rankedKeywords}
            isCompact={isCompact}
            copiedKey={copiedKey}
            onCopyKeywords={onCopyText}
            onUpdateKeywords={handleUpdateKeywords}
          />
        ) : (
          <div className="p-3 sm:p-4 rounded-xl border border-dashed border-border bg-secondary/10 text-center text-xs text-muted-foreground">
            {isProcessing
              ? 'AI is analyzing composition and ranking keywords...'
              : 'Keywords will appear here once metadata is generated.'}
          </div>
        )}

        {isCompleted && rec && (
          <AssetCategoriesBadges
            rec={rec}
            onCopyAll={onCopyAll}
          />
        )}
      </div>
    </div>
  );
});

AssetCard.displayName = 'AssetCard';
