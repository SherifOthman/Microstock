import React, { useEffect, useState } from 'react';
import { MasterMetadataRecord } from '../../../types';
import { db } from '../../../db';
import { QueueItem } from '../../../services/queue/BatchQueueService';
import { MODEL_DISPLAY_NAMES } from '../../../constants/providers';
import { ADOBE_CATEGORIES, DREAMSTIME_CATEGORIES, getDreamstimeCategoryName } from '../../../constants/categories';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Edit3,
  Film,
  FileText,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Loader2,
  Maximize2,
  Play,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { Dialog, DialogContent, DialogTitle } from '../../../components/ui/dialog';

export interface UnifiedAssetRow {
  id: string;
  filename: string;
  thumbnailUrl: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  queueItem?: QueueItem;
  masterRecord?: MasterMetadataRecord;
  error?: string;
}

export interface AssetCardProps {
  asset: UnifiedAssetRow;
  rec?: MasterMetadataRecord;
  viewMode?: 'compact' | 'detailed';
  copiedKey: string | null;
  onCopyText: (text: string, id: string) => void;
  onCopyAll: (rec: MasterMetadataRecord) => void;
  onDelete: (id: string, filename: string) => void;
  onRegenerate: (id: string) => void;
  onOpenLightbox?: (assetId: string) => void;
  onMuteSingleVideo?: (assetId: string) => void;
  isMuting?: boolean;
}

export const AssetCard: React.FC<AssetCardProps> = ({
  asset,
  rec,
  viewMode = 'detailed',
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
  const [localTitle, setLocalTitle] = useState(rec?.baseTitle || '');
  const [localDesc, setLocalDesc] = useState(rec?.detailedDescription || '');
  const [isEditingKws, setIsEditingKws] = useState(false);
  const [rawKwsInput, setRawKwsInput] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [draggedKwIndex, setDraggedKwIndex] = useState<number | null>(null);
  const [dragOverKwIndex, setDragOverKwIndex] = useState<number | null>(null);
  const [isHoverPlaying, setIsHoverPlaying] = useState(false);
  const [hoverVideoUrl, setHoverVideoUrl] = useState<string | null>(null);
  const [isTagsExpanded, setIsTagsExpanded] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [isManualEdit, setIsManualEdit] = useState(false);

  // Synchronize local states when the database record updates
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

  const handleRemoveKeyword = async (kwToRemove: string) => {
    if (!rec) return;
    const updated = (rec.rankedKeywords ?? []).filter(
      (k) => (k ?? '').toLowerCase() !== (kwToRemove ?? '').toLowerCase()
    );
    await db.masterRecords.update(rec.id, { rankedKeywords: updated });
  };

  const handleDropKeyword = async (targetIndex: number) => {
    if (!rec || draggedKwIndex === null || draggedKwIndex === targetIndex) {
      setDraggedKwIndex(null);
      setDragOverKwIndex(null);
      return;
    }
    const current = [...(rec.rankedKeywords ?? [])];
    const [moved] = current.splice(draggedKwIndex, 1);
    current.splice(targetIndex, 0, moved);
    await db.masterRecords.update(rec.id, { rankedKeywords: current });
    setDraggedKwIndex(null);
    setDragOverKwIndex(null);
  };

  const handleSaveRawKeywords = async () => {
    if (!rec) return;
    const cleanKws = (rawKwsInput ?? '')
      .split(',')
      .map((k) => (k ?? '').trim())
      .filter((k) => k.length > 0);
    // Deduplicate
    const unique = Array.from(new Set(cleanKws.map((k) => k.toLowerCase()))).map(
      (k) => cleanKws.find((orig) => orig.toLowerCase() === k) || k
    );
    await db.masterRecords.update(rec.id, { rankedKeywords: unique });
    setIsEditingKws(false);
  };

  const handleAddTagSubmit = async () => {
    if (!rec || !(newTagInput ?? '').trim()) {
      setIsAddingTag(false);
      setNewTagInput('');
      return;
    }
    const newKws = (newTagInput ?? '')
      .split(',')
      .map((k) => (k ?? '').trim())
      .filter((k) => k.length > 0);

    const existingLower = new Set((rec.rankedKeywords ?? []).map((k) => (k ?? '').toLowerCase()));
    const toAdd = newKws.filter((k) => !existingLower.has((k ?? '').toLowerCase()));

    if (toAdd.length > 0) {
      const updated = [...(rec.rankedKeywords ?? []), ...toAdd];
      await db.masterRecords.update(rec.id, { rankedKeywords: updated });
    }
    setNewTagInput('');
    setIsAddingTag(false);
  };

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

  const getCleanModelName = (modelId?: string, providerId?: string): string => {
    if (!modelId || typeof modelId !== 'string') return providerId ? getCleanProviderName(providerId) : 'AI Model';
    if (MODEL_DISPLAY_NAMES[modelId]) return MODEL_DISPLAY_NAMES[modelId];
    return (modelId ?? '').replace(/^.*\//, '');
  };

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

  const isCompact = viewMode === 'compact';

  // State-Driven UX Rule 3: Collapsed Pending Row for un-generated queue assets
  if (isQueued && !isProcessing && !isCompleted && !isManualEdit) {
    return (
      <div className="p-3 bg-card rounded-xl border border-slate-200 dark:border-white/[0.07] shadow-xs flex items-center justify-between gap-3 hover:border-slate-300 dark:hover:border-white/15 transition-colors w-full min-w-0">
        {/* Left: Thumbnail & basic file meta */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            onClick={() => onOpenLightbox && onOpenLightbox(asset.id)}
            className="w-11 h-11 rounded-lg overflow-hidden border border-slate-200/70 dark:border-white/[0.06] bg-slate-50 dark:bg-[#0B0F19] shrink-0 flex items-center justify-center cursor-pointer"
            title="Click to view full preview"
          >
            {asset.thumbnailUrl ? (
              <img src={asset.thumbnailUrl} alt={asset.filename} className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
            )}
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs sm:text-sm font-semibold text-foreground truncate max-w-[200px] sm:max-w-xs md:max-w-md block" title={asset.filename}>
                {asset.filename}
              </span>
              {hasNonAsciiInFilename && (
                <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5 font-semibold text-amber-500 border-amber-500/30 bg-amber-500/10 shrink-0">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  <span>Non-ASCII</span>
                </Badge>
              )}
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

        {/* Right: Inline Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            onClick={() => onRegenerate(asset.id)}
            className="h-7.5 px-3 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs cursor-pointer gap-1.5"
          >
            <Play className="w-3 h-3 fill-current" />
            <span className="hidden sm:inline">{language === 'ar' ? 'توليد الآن' : 'Generate'}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsManualEdit(true)}
            className="h-7.5 px-2.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Edit3 className="w-3 h-3" />
            <span className="hidden sm:inline">{language === 'ar' ? 'تعديل يدوي' : 'Manual Edit'}</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(asset.id, asset.filename)}
            className="h-7.5 w-7.5 text-muted-foreground hover:text-destructive cursor-pointer"
            title={t.deleteAsset}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={`rounded-2xl border border-border bg-card shadow-xs transition hover:border-border/80 flex flex-col min-w-0 w-full overflow-hidden ${
          isCompact
            ? 'p-3 sm:p-4 gap-3'
            : 'p-3 sm:p-5 gap-4 lg:gap-5 lg:flex-row items-start'
        }`}
      >
        {/* ======================================================== */}
        {/* COMPACT MODE HEADER: Clean Single Horizontal Row         */}
        {/* ======================================================== */}
        {isCompact && (
          <div className="flex items-center justify-between gap-3 w-full min-w-0 pb-2.5 border-b border-border/60">
            {/* Small Rounded Thumbnail (Click to open full Lightbox) */}
            <button
              type="button"
              onClick={() => onOpenLightbox ? onOpenLightbox(asset.id) : null}
              onMouseEnter={() => {
                if ((rec?.mediaType === 'video' || asset.queueItem?.mediaType === 'video') && asset.queueItem?.file) {
                  const url = URL.createObjectURL(asset.queueItem.file);
                  setHoverVideoUrl(url);
                  setIsHoverPlaying(true);
                }
              }}
              onMouseLeave={() => {
                setIsHoverPlaying(false);
                if (hoverVideoUrl) {
                  URL.revokeObjectURL(hoverVideoUrl);
                  setHoverVideoUrl(null);
                }
              }}
              className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border border-border bg-muted/30 shrink-0 group cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-ring"
              title="Click to view in Full-Screen Lightbox"
            >
              {isHoverPlaying && hoverVideoUrl ? (
                <video
                  src={hoverVideoUrl}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : asset.thumbnailUrl ? (
                <img
                  src={asset.thumbnailUrl}
                  alt={asset.filename}
                  className="w-full h-full object-cover transition duration-150 group-hover:scale-105"
                />
              ) : (
                <ImageIcon className="w-6 h-6 text-muted-foreground/40 m-auto" />
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <Maximize2 className="w-3.5 h-3.5 text-white" />
              </div>
            </button>

            {/* Info Column (Filename, Status Badge, Provider + Latency, Inline Audio Mute) */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="text-xs sm:text-sm font-semibold text-foreground truncate max-w-full block"
                  title={asset.filename}
                >
                  {asset.filename}
                </span>

                {hasNonAsciiInFilename && (
                  <Badge
                    variant="outline"
                    className="h-4 px-1 text-[9px] gap-0.5 font-semibold text-amber-500 border-amber-500/30 bg-amber-500/10 shrink-0"
                    title={language === 'ar' ? 'اسم الملف يحتوي على أحرف غير إنجليزية أو نقاط حذف (…) مما قد يعطل مطابقة CSV' : 'Filename contains non-ASCII characters or ellipsis (…) which may fail CSV matching'}
                  >
                    <AlertTriangle className="w-2.5 h-2.5" />
                    <span>Non-ASCII</span>
                  </Badge>
                )}

                {/* Inline Audio Muting in Compact Mode */}
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
                {/* Compact Status Indicator */}
                {isCompleted && (
                  <Badge
                    variant="outline"
                    className="py-0 px-2 h-5 text-[10px] font-semibold border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1 shrink-0"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>{t.completedStatus}</span>
                  </Badge>
                )}
                {isProcessing && (
                  <Badge
                    variant="outline"
                    className="py-0 px-2 h-5 text-[10px] font-semibold border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 gap-1 shrink-0"
                  >
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>{t.processingStatus}</span>
                  </Badge>
                )}
                {isQueued && (
                  <Badge
                    variant="outline"
                    className="py-0 px-2 h-5 text-[10px] font-medium border-border/80 bg-secondary/60 text-muted-foreground gap-1 shrink-0"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
                    <span>{t.queuedStatus || 'Waiting'}</span>
                  </Badge>
                )}
                {isError && (
                  <Badge
                    variant="outline"
                    className="py-0 px-2 h-5 text-[10px] font-semibold border-destructive/40 bg-destructive/10 text-destructive gap-1 shrink-0"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    <span>{t.failedStatus}</span>
                  </Badge>
                )}

                {/* Single muted string: Provider • Latency */}
                {isCompleted && rec && (
                  <span className="text-[11px] text-muted-foreground font-mono truncate">
                    {getCleanProviderName(rec.aiGenerationInfo?.provider)}
                    {rec.aiGenerationInfo?.latencyMs ? ` • ${(rec.aiGenerationInfo.latencyMs / 1000).toFixed(1)}s` : ''}
                  </span>
                )}
                {isProcessing && (
                  <span className="text-[11px] text-sky-500 font-mono truncate">
                    {asset.queueItem?.retryCount && asset.queueItem.retryCount > 0
                      ? t.retryingViaFallback || 'Retrying via fallback...'
                      : (t.analyzingWith || 'Analyzing with {provider}...').replace(
                          '{provider}',
                          getCleanProviderName(asset.queueItem?.assignedProvider)
                        )}
                  </span>
                )}
              </div>
            </div>

            {/* Quick Action Icons: Regenerate / Retry & Delete */}
            <div className="flex items-center gap-1 shrink-0">
              {(isCompleted || isError) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRegenerate(asset.id)}
                  className={`h-8 w-8 cursor-pointer ${
                    isError
                      ? 'text-destructive hover:text-destructive hover:bg-destructive/10'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
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

        {/* ======================================================== */}
        {/* DETAILED MODE / DESKTOP SIDEBAR: Full Thumbnail & Meta   */}
        {/* ======================================================== */}
        <div
          className={`w-full lg:w-56 shrink-0 flex-col gap-2.5 min-w-0 ${
            isCompact ? 'hidden' : 'flex'
          }`}
        >
          {/* Thumbnail with sleek subtle delete button pinned top-right and Hover-to-Play Video */}
          <div
            onClick={() => onOpenLightbox && onOpenLightbox(asset.id)}
            onMouseEnter={() => {
              if ((rec?.mediaType === 'video' || asset.queueItem?.mediaType === 'video') && asset.queueItem?.file) {
                const url = URL.createObjectURL(asset.queueItem.file);
                setHoverVideoUrl(url);
                setIsHoverPlaying(true);
              }
            }}
            onMouseLeave={() => {
              setIsHoverPlaying(false);
              if (hoverVideoUrl) {
                URL.revokeObjectURL(hoverVideoUrl);
                setHoverVideoUrl(null);
              }
            }}
            className="relative rounded-xl overflow-hidden border border-border bg-muted/30 aspect-4/3 flex items-center justify-center group cursor-pointer"
            title="Click to view in Full-Screen Lightbox"
          >
            {isHoverPlaying && hoverVideoUrl ? (
              <video
                src={hoverVideoUrl}
                autoPlay
                muted
                loop
                playsInline
                className="w-full h-full object-cover"
              />
            ) : asset.thumbnailUrl ? (
              <img
                src={asset.thumbnailUrl}
                alt={asset.filename}
                className="w-full h-full object-cover"
              />
            ) : (
              <ImageIcon className="w-10 h-10 text-muted-foreground/40" />
            )}

            {/* Hover overlay hint */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
              <Maximize2 className="w-5 h-5 text-white drop-shadow" />
            </div>

            {/* Media Type & Video Duration Badge */}
            {rec?.mediaType === 'video' || asset.queueItem?.mediaType === 'video' ? (
              <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/85 backdrop-blur-xs text-[10px] font-mono text-white flex items-center gap-1 border border-white/15 shadow-sm">
                <Film className="w-3 h-3 text-sky-400" />
                <span>
                  {rec?.videoMeta?.durationSeconds || asset.queueItem?.videoDurationSeconds
                    ? `${rec?.videoMeta?.durationSeconds || asset.queueItem?.videoDurationSeconds}s`
                    : t.video}
                </span>
                {(rec?.videoMeta?.resolution || asset.queueItem?.videoResolution) && (
                  <span className="text-sky-300 font-bold">
                    {rec?.videoMeta?.resolution || asset.queueItem?.videoResolution}
                  </span>
                )}
              </div>
            ) : rec?.mediaType === 'vector' || asset.queueItem?.mediaType === 'vector' ? (
              <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/85 backdrop-blur-xs text-[10px] font-mono text-indigo-300 flex items-center gap-1 border border-indigo-500/30 shadow-sm">
                <Layers className="w-3 h-3 text-indigo-400" />
                <span>{t.vector}</span>
              </div>
            ) : (
              <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/85 backdrop-blur-xs text-[10px] font-mono text-emerald-300 flex items-center gap-1 border border-emerald-500/30 shadow-sm">
                <Camera className="w-3 h-3 text-emerald-400" />
                <span>{t.photo}</span>
              </div>
            )}

            {/* Subtle delete icon button */}
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

          {/* Inline Video Audio Action Button (Detailed Mode) */}
          {(rec?.mediaType === 'video' || asset.queueItem?.mediaType === 'video') && (
            <div className="w-full">
              {asset.queueItem?.hasAudio ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onMuteSingleVideo && onMuteSingleVideo(asset.id)}
                  disabled={isMuting}
                  className="w-full h-7 px-2 text-[11px] gap-1.5 font-semibold text-amber-500 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 cursor-pointer"
                  title="Audio track detected in video file. Click to strip audio losslessly."
                >
                  {isMuting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
                  <span>{language === 'ar' ? '🔊 يوجد صوت — اضغط لكتمه' : '🔊 Audio Detected — Click to Mute'}</span>
                </Button>
              ) : asset.queueItem?.isMuted ? (
                <div className="w-full py-1 px-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-[10px] font-mono text-center flex items-center justify-center gap-1">
                  <VolumeX className="w-3 h-3" />
                  <span>{language === 'ar' ? '🔇 صامت جاهز (Silent Ready)' : '🔇 Silent Ready'}</span>
                </div>
              ) : null}
            </div>
          )}

          {/* Filename & Compact Status */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate max-w-full block" title={asset.filename}>
                {asset.filename}
              </p>
              {hasNonAsciiInFilename && (
                <Badge
                  variant="outline"
                  className="h-4 px-1 text-[9px] gap-0.5 font-semibold text-amber-500 border-amber-500/30 bg-amber-500/10 shrink-0"
                  title={language === 'ar' ? 'اسم الملف يحتوي على أحرف غير إنجليزية أو نقاط حذف (…) مما قد يعطل مطابقة CSV' : 'Filename contains non-ASCII characters or ellipsis (…) which may fail CSV matching'}
                >
                  <AlertTriangle className="w-2.5 h-2.5" />
                  <span>Non-ASCII</span>
                </Badge>
              )}
            </div>

            {/* Compact Status Pill */}
            {isCompleted && (
              <Badge
                variant="outline"
                className="w-full py-1 px-2.5 rounded-lg border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-xs flex items-center justify-center gap-1.5"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>{t.completedStatus}</span>
              </Badge>
            )}

            {isProcessing && (
              <Badge
                variant="outline"
                className="w-full py-1 px-2.5 rounded-lg border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold text-xs flex items-center justify-center gap-1.5"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{t.processingStatus}</span>
              </Badge>
            )}

            {isError && (
              <Badge
                variant="outline"
                className="w-full py-1 px-2.5 rounded-lg border-destructive/40 bg-destructive/10 text-destructive font-semibold text-xs flex items-center justify-center gap-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{t.failedStatus}</span>
              </Badge>
            )}

            {/* Inline Telemetry Line */}
            <div className="rounded-lg bg-slate-50 dark:bg-[#0B0F19] border border-slate-200/70 dark:border-white/[0.05] p-2 space-y-1 text-[10px] font-mono">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{formatBytes(originalSize)} → {formatBytes(compressedSize)}</span>
                {savingsPercent !== null && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                    -{savingsPercent}%
                  </span>
                )}
              </div>
              {isCompleted && rec && (
                <div className="flex items-center justify-between text-muted-foreground pt-1 border-t border-slate-200/50 dark:border-white/[0.04]">
                  <span className="truncate max-w-[120px] text-foreground font-semibold">
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

          {/* Compact Actions Row */}
          <div className="flex items-center gap-1.5 pt-0.5">
            {isCompleted && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRegenerate(asset.id)}
                className="flex-1 h-7.5 text-xs gap-1.5 cursor-pointer hover:bg-secondary border-slate-200 dark:border-white/[0.08]"
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
                className="flex-1 h-7.5 text-xs gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>{t.retry || (language === 'ar' ? 'إعادة المحاولة' : 'Retry')}</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(asset.id, asset.filename)}
              className="h-7.5 w-7.5 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
              title={t.deleteAsset}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

      {/* ======================================================== */}
      {/* RIGHT COLUMN: Interactive Form Fields & Keywords List    */}
      {/* ======================================================== */}
      <div className={`flex-1 w-full min-w-0 overflow-hidden ${isCompact ? 'space-y-2.5' : 'space-y-3.5'}`}>
        {/* Title Field with Copy & Character Counter */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <label className="font-semibold text-foreground flex items-center gap-1.5">
              <span>{t.title}</span>
              <span className="text-[10px] font-mono font-normal text-muted-foreground">
                ({(localTitle || '').length} chars)
              </span>
            </label>
            <button
              type="button"
              onClick={() => onCopyText(localTitle, `${asset.id}_title`)}
              disabled={!localTitle}
              className="inline-flex items-center gap-1 text-[11px] h-6 px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-40"
            >
              {copiedKey === `${asset.id}_title` ? (
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
            className="text-xs bg-slate-50 dark:bg-[#0B0F19] border-slate-200/70 dark:border-white/[0.05] font-medium text-left h-8 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Description Field with Copy, Character Counter & Expand Toggle on Compact */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <label className="font-semibold text-foreground flex items-center gap-1.5">
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
                onClick={() => onCopyText(localDesc, `${asset.id}_desc`)}
                disabled={!localDesc}
                className="inline-flex items-center gap-1 text-[11px] h-6 px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-40"
              >
                {copiedKey === `${asset.id}_desc` ? (
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
            className={`text-xs bg-slate-50 dark:bg-[#0B0F19] border-slate-200/70 dark:border-white/[0.05] resize-none text-left focus:ring-1 focus:ring-indigo-500 ${
              isCompact && !isDescExpanded ? 'line-clamp-2 max-h-16' : ''
            }`}
          />
        </div>

        {/* Keywords Management with Mobile Non-Scrollable Collapse & Safe Touch Navigation */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Tag className="w-3.5 h-3.5 text-indigo-500" />
              <span>{t.keywords}</span>
              {rec && (
                <span className="text-[11px] font-mono font-normal text-muted-foreground">
                  ({rec.rankedKeywords.length})
                </span>
              )}
              <span className="text-[10px] text-muted-foreground font-normal hidden sm:inline">
                • {t.dragToReorderTags}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {rec && (
                <button
                  type="button"
                  onClick={() => {
                    if (isEditingKws) {
                      setIsEditingKws(false);
                    } else {
                      setRawKwsInput(rec.rankedKeywords.join(', '));
                      setIsEditingKws(true);
                    }
                  }}
                  className="inline-flex items-center gap-1 text-[11px] h-6 px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <Edit3 className="w-3 h-3 text-muted-foreground" />
                  <span>{isEditingKws ? t.cancel : t.edit}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => rec && onCopyText(rec.rankedKeywords.join(', '), `${asset.id}_kws`)}
                disabled={!rec}
                className="inline-flex items-center gap-1 text-[11px] h-6 px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-40"
              >
                {copiedKey === `${asset.id}_kws` ? (
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

          {rec ? (
            isEditingKws ? (
              <div className="space-y-2">
                <Textarea
                  dir="ltr"
                  value={rawKwsInput}
                  onChange={(e) => setRawKwsInput(e.target.value)}
                  placeholder="Type or paste keywords separated by commas..."
                  className="text-xs min-h-[70px] bg-slate-50 dark:bg-[#0B0F19] border-slate-200/70 dark:border-white/[0.05] font-mono text-left"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" onClick={handleSaveRawKeywords} className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white">
                    {t.saveKeywords}
                  </Button>
                </div>
              </div>
            ) : (
              <div
                dir="ltr"
                className={`p-2.5 sm:p-3 rounded-xl border border-slate-200/70 dark:border-white/[0.05] bg-slate-50/70 dark:bg-[#0B0F19] flex flex-wrap gap-1.5 text-left touch-pan-y ${
                  isCompact ? 'overflow-visible' : 'max-h-56 overflow-y-auto'
                }`}
              >
                {(() => {
                  const allKws = rec.rankedKeywords;
                  const displayKws =
                    isCompact && !isTagsExpanded && !isEditingKws
                      ? allKws.slice(0, 10)
                      : allKws;
                  const remainingCount = allKws.length - 10;

                  return (
                    <>
                      {displayKws.map((kw, i) => {
                        const isTop10 = i < 10;
                        const isDragging = draggedKwIndex === i;
                        const isOver = dragOverKwIndex === i;
                        // On compact/mobile, only enable draggable if user toggled Edit mode to avoid scroll trap!
                        const canDrag = !isCompact || isEditingKws;

                        return (
                          <Badge
                            key={`${kw}-${i}`}
                            variant={isTop10 ? 'default' : 'secondary'}
                            draggable={canDrag}
                            onDragStart={(e) => {
                              if (!canDrag) return;
                              setDraggedKwIndex(i);
                              e.dataTransfer.setData('text/plain', String(i));
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragOver={(e) => {
                              if (!canDrag) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              if (dragOverKwIndex !== i) {
                                setDragOverKwIndex(i);
                              }
                            }}
                            onDragLeave={() => {
                              if (dragOverKwIndex === i) {
                                setDragOverKwIndex(null);
                              }
                            }}
                            onDrop={(e) => {
                              if (!canDrag) return;
                              e.preventDefault();
                              handleDropKeyword(i);
                            }}
                            onDragEnd={() => {
                              setDraggedKwIndex(null);
                              setDragOverKwIndex(null);
                            }}
                            className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 rounded-full text-xs font-medium transition select-none ${
                              canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                            } ${
                              isTop10
                                ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-semibold shadow-2xs hover:bg-indigo-500/20'
                                : 'border-slate-200/60 dark:border-white/[0.05] bg-slate-100 dark:bg-[#151C2C] text-slate-700 dark:text-slate-300 hover:text-foreground'
                            } ${isDragging ? 'opacity-30 scale-95' : ''} ${
                              isOver ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-background' : ''
                            }`}
                            title={isTop10 ? `#${i + 1} Top SEO Keyword` : `Keyword tag`}
                          >
                            {/* Grip handle only visible when dragging is enabled */}
                            {canDrag && (
                              <GripVertical className="w-2.5 h-2.5 opacity-40 hover:opacity-100 shrink-0" />
                            )}
                            {isTop10 && (
                              <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                                #{i + 1}
                              </span>
                            )}
                            <span>{kw}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveKeyword(kw);
                              }}
                              className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive transition cursor-pointer ml-0.5"
                              title={`Remove "${kw}"`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        );
                      })}

                      {/* Expand / Collapse Toggle Button in Compact / Mobile Mode */}
                      {isCompact && remainingCount > 0 && !isEditingKws && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setIsTagsExpanded(!isTagsExpanded)}
                          className="h-6 px-2 text-xs font-medium rounded-full cursor-pointer hover:bg-secondary/80 gap-1"
                        >
                          {isTagsExpanded ? (
                            <>
                              <ChevronUp className="w-3 h-3" />
                              <span>{t.showLessTags || 'Show less'}</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3 h-3" />
                              <span>
                                {(t.showMoreTags || '+{count} more').replace('{count}', String(remainingCount))}
                              </span>
                            </>
                          )}
                        </Button>
                      )}

                      {isAddingTag ? (
                        <div className="inline-flex items-center gap-1" dir="ltr">
                          <Input
                            dir="ltr"
                            autoFocus
                            value={newTagInput}
                            onChange={(e) => setNewTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddTagSubmit();
                              } else if (e.key === 'Escape') {
                                setIsAddingTag(false);
                              }
                            }}
                            onBlur={handleAddTagSubmit}
                            placeholder="tag..."
                            className="h-6 w-24 text-[11px] px-2 py-0 text-left font-mono"
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsAddingTag(true)}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground transition cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>{(t.addTag || 'Tag').replace(/^\+\s*/, '')}</span>
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            )
          ) : (
            <div className="p-3 sm:p-4 rounded-xl border border-dashed border-border bg-secondary/10 text-center text-xs text-muted-foreground">
              {isProcessing
                ? 'AI is analyzing composition and ranking keywords...'
                : 'Keywords will appear here once metadata is generated.'}
            </div>
          )}
        </div>

        {/* Category Mapping Preview Footer */}
        {rec && (
          <div dir="ltr" className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60 text-xs text-left w-full min-w-0">
            <div className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px] shrink-0">
              <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>{t.categories || 'Categories:'}</span>
            </div>

            {rec.categories?.adobeCategoryId && (
              <Badge variant="outline" className="text-[11px] gap-1 font-mono">
                <span className="text-muted-foreground">Adobe:</span>
                <span className="font-semibold text-foreground">
                  {ADOBE_CATEGORIES[rec.categories.adobeCategoryId] || `#${rec.categories.adobeCategoryId}`}
                </span>
              </Badge>
            )}

            {rec.categories?.shutterstockCategories && rec.categories.shutterstockCategories.length > 0 && (
              <Badge variant="outline" className="text-[11px] gap-1 font-mono">
                <span className="text-muted-foreground">Shutterstock:</span>
                <span className="font-semibold text-foreground">
                  {rec.categories.shutterstockCategories.filter(Boolean).join(', ')}
                </span>
              </Badge>
            )}

            {rec.categories?.dreamstimeCategory1 && (
              <Badge variant="outline" className="text-[11px] gap-1 font-mono">
                <span className="text-muted-foreground">Dreamstime:</span>
                <span className="font-semibold text-foreground">
                  {getDreamstimeCategoryName(rec.categories.dreamstimeCategory1, rec.isAiGenerated)}
                </span>
              </Badge>
            )}

            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => onCopyAll(rec)}
              className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer ml-auto border-border"
            >
              <Copy className="w-3 h-3" />
              <span>{t.copyAllMetadata || 'Copy All'}</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  </>
  );
};
