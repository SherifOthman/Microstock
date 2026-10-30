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
  Copy,
  Edit3,
  Film,
  FileText,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

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
  copiedKey: string | null;
  onCopyText: (text: string, id: string) => void;
  onCopyAll: (rec: MasterMetadataRecord) => void;
  onDelete: (id: string, filename: string) => void;
  onRegenerate: (id: string) => void;
}

export const AssetCard: React.FC<AssetCardProps> = ({
  asset,
  rec,
  copiedKey,
  onCopyText,
  onCopyAll,
  onDelete,
  onRegenerate,
}) => {
  const { t } = useLanguage();
  const [localTitle, setLocalTitle] = useState(rec?.baseTitle || '');
  const [localDesc, setLocalDesc] = useState(rec?.detailedDescription || '');
  const [isEditingKws, setIsEditingKws] = useState(false);
  const [rawKwsInput, setRawKwsInput] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [draggedKwIndex, setDraggedKwIndex] = useState<number | null>(null);
  const [dragOverKwIndex, setDragOverKwIndex] = useState<number | null>(null);

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

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-5 shadow-xs transition hover:border-border/80 flex flex-col lg:flex-row gap-5 items-start min-w-0 w-full overflow-hidden">
      {/* ======================================================== */}
      {/* LEFT COLUMN: Thumbnail, Meta, Status, Live Model Tracker */}
      {/* ======================================================== */}
      <div className="w-full lg:w-56 shrink-0 flex flex-col gap-2.5 min-w-0">
        {/* Thumbnail with sleek subtle delete button pinned top-right */}
        <div className="relative rounded-xl overflow-hidden border border-border bg-muted/30 aspect-4/3 flex items-center justify-center group">
          {asset.thumbnailUrl ? (
            <img
              src={asset.thumbnailUrl}
              alt={asset.filename}
              className="w-full h-full object-cover"
            />
          ) : (
            <ImageIcon className="w-10 h-10 text-muted-foreground/40" />
          )}

          {/* Media Type & Video Duration Badge */}
          {(rec?.mediaType === 'video' || asset.queueItem?.mediaType === 'video') ? (
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
          ) : (rec?.mediaType === 'vector' || asset.queueItem?.mediaType === 'vector') ? (
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
            onClick={() => onDelete(asset.id, asset.filename)}
            className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-background/80 hover:bg-destructive hover:text-destructive-foreground text-foreground border border-border/80 flex items-center justify-center shadow-xs transition cursor-pointer"
            title={t.deleteAsset}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Filename & Dual Size Display: Original vs Compressed AI Payload */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-foreground truncate max-w-full block" title={asset.filename}>
            {asset.filename}
          </p>

          <div className="rounded-lg bg-secondary/40 border border-border/70 p-2 space-y-1.5 text-[10px] font-mono">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>{t.originalSize}</span>
              <span className="font-semibold text-foreground">{formatBytes(originalSize)}</span>
            </div>

            <div className="flex items-center justify-between text-muted-foreground">
              <span>{t.aiPayload}</span>
              <div dir="ltr" className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
                <span className="font-semibold text-sky-400">{formatBytes(compressedSize)}</span>
                {savingsPercent !== null && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-500 font-semibold border border-emerald-500/20">
                    -{savingsPercent}%
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Status Badge with sleek shadcn outline design */}
        {isCompleted && (
          <Badge
            variant="outline"
            className="w-full py-1.5 px-3 rounded-lg border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-xs flex items-center justify-center gap-1.5"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>{t.completedStatus}</span>
          </Badge>
        )}

        {isProcessing && (
          <Badge
            variant="outline"
            className="w-full py-1.5 px-3 rounded-lg border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold text-xs flex items-center justify-center gap-1.5"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{t.processingStatus}</span>
          </Badge>
        )}

        {isQueued && (
          <Badge
            variant="outline"
            className="w-full py-1.5 px-3 rounded-lg border-border/80 bg-secondary/60 text-muted-foreground font-medium text-xs flex items-center justify-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
            <span>{t.queuedStatus || 'Waiting'}</span>
          </Badge>
        )}

        {isError && (
          <Badge
            variant="outline"
            className="w-full py-1.5 px-3 rounded-lg border-destructive/40 bg-destructive/10 text-destructive font-semibold text-xs flex items-center justify-center gap-1.5"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{t.failedStatus}</span>
          </Badge>
        )}

        {/* Live Model & Attempt Tracker */}
        <div className="rounded-lg border border-border bg-secondary/30 p-2.5 text-[11px] space-y-1.5">
          {isProcessing && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-sky-500 font-semibold text-[11px]">
                <Zap className="w-3 h-3 animate-pulse" />
                <span>
                  {asset.queueItem?.retryCount && asset.queueItem.retryCount > 0
                    ? t.retryingViaFallback || 'Retrying via fallback...'
                    : (t.analyzingWith || 'Analyzing with {provider}...').replace(
                        '{provider}',
                        getCleanProviderName(asset.queueItem?.assignedProvider)
                      )}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {t.provider || 'Provider:'}{' '}
                <span className="text-foreground font-semibold">
                  {getCleanProviderName(asset.queueItem?.assignedProvider)}
                </span>
              </div>
            </div>
          )}

          {isCompleted && rec && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{t.provider || 'Provider:'}</span>
                <span
                  className="font-semibold text-foreground truncate max-w-[130px]"
                  title={rec.aiGenerationInfo?.provider}
                >
                  {getCleanProviderName(rec.aiGenerationInfo?.provider)}
                </span>
              </div>
              {rec.aiGenerationInfo?.latencyMs && (
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{t.latency}</span>
                  <span className="font-mono text-emerald-500 font-medium">
                    {(rec.aiGenerationInfo.latencyMs / 1000).toFixed(1)}s
                  </span>
                </div>
              )}
              {/* Clean Failover List on one compact line */}
              {rec.aiGenerationInfo?.attemptHistory &&
                rec.aiGenerationInfo.attemptHistory.length > 1 && (
                  <div className="pt-1 border-t border-border/50 text-[10px] space-y-0.5">
                    <span className="text-amber-500 font-medium">Failover:</span>
                    <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground flex-wrap">
                      {rec.aiGenerationInfo.attemptHistory.map((att, idx) => (
                        <React.Fragment key={idx}>
                          {idx > 0 && <span className="text-muted-foreground/60">→</span>}
                          <span
                            className={
                              att.status === 'success' ? 'text-emerald-500 font-medium' : 'text-destructive'
                            }
                          >
                            {att.status === 'success' ? '✓' : '✗'} {getCleanProviderName(att.provider)}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}

          {isError && (
            <div className="text-[10px] text-destructive leading-tight">
              {asset.error || 'Metadata generation failed. Check your API keys and models.'}
            </div>
          )}
        </div>

        {/* Regenerate Button */}
        {isCompleted && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRegenerate(asset.id)}
            className="w-full h-8 text-xs gap-1.5 cursor-pointer hover:bg-secondary border-border"
          >
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{t.regenerate}</span>
          </Button>
        )}
      </div>

      {/* ======================================================== */}
      {/* RIGHT COLUMN: Interactive Form Fields & Keywords List    */}
      {/* ======================================================== */}
      <div className="flex-1 w-full min-w-0 space-y-3.5 overflow-hidden">
        {/* Title Field with Copy & Character Counter */}
        <div className="space-y-1.5">
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
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-border bg-secondary/50 text-foreground hover:bg-secondary transition cursor-pointer disabled:opacity-40"
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
            className="text-xs bg-card border-border font-medium text-left"
          />
        </div>

        {/* Description Field with Copy & Character Counter */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <label className="font-semibold text-foreground flex items-center gap-1.5">
              <span>{t.description}</span>
              <span className="text-[10px] font-mono font-normal text-muted-foreground">
                ({(localDesc || '').length} chars)
              </span>
            </label>
            <button
              type="button"
              onClick={() => onCopyText(localDesc, `${asset.id}_desc`)}
              disabled={!localDesc}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-border bg-secondary/50 text-foreground hover:bg-secondary transition cursor-pointer disabled:opacity-40"
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
          <Textarea
            dir="ltr"
            rows={2}
            value={localDesc}
            onChange={(e) => setLocalDesc(e.target.value)}
            onBlur={handleBlurDesc}
            placeholder={isProcessing ? 'Generating description...' : 'Detailed stock description...'}
            disabled={!rec}
            className="text-xs bg-card border-border resize-none text-left"
          />
        </div>

        {/* Keywords Management with Top 10 SEO Priority Highlight */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Tag className="w-3.5 h-3.5 text-amber-500" />
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
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-border bg-secondary/50 text-foreground hover:bg-secondary transition cursor-pointer"
                >
                  <Edit3 className="w-3 h-3 text-muted-foreground" />
                  <span>{isEditingKws ? t.cancel : t.edit}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => rec && onCopyText(rec.rankedKeywords.join(', '), `${asset.id}_kws`)}
                disabled={!rec}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-border bg-secondary/50 text-foreground hover:bg-secondary transition cursor-pointer disabled:opacity-40"
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
                  className="text-xs min-h-[70px] bg-secondary/20 border-border font-mono text-left"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" onClick={handleSaveRawKeywords} className="h-7 text-xs">
                    {t.saveKeywords}
                  </Button>
                </div>
              </div>
            ) : (
              <div
                dir="ltr"
                className="p-3 rounded-xl border border-border bg-secondary/15 flex flex-wrap gap-1.5 max-h-56 overflow-y-auto text-left"
              >
                {rec.rankedKeywords.map((kw, i) => {
                  const isTop10 = i < 10;
                  const isDragging = draggedKwIndex === i;
                  const isOver = dragOverKwIndex === i;

                  return (
                    <Badge
                      key={`${kw}-${i}`}
                      variant={isTop10 ? 'default' : 'secondary'}
                      draggable={true}
                      onDragStart={(e) => {
                        setDraggedKwIndex(i);
                        e.dataTransfer.setData('text/plain', String(i));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
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
                        e.preventDefault();
                        handleDropKeyword(i);
                      }}
                      onDragEnd={() => {
                        setDraggedKwIndex(null);
                        setDragOverKwIndex(null);
                      }}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium transition cursor-grab active:cursor-grabbing select-none ${
                        isTop10
                          ? 'border-primary/60 bg-primary/10 text-foreground font-semibold shadow-2xs hover:bg-primary/20'
                          : 'border-border/60 bg-secondary/60 text-muted-foreground hover:text-foreground'
                      } ${isDragging ? 'opacity-30 scale-95' : ''} ${
                        isOver ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''
                      }`}
                      title={isTop10 ? `#${i + 1} Top SEO Keyword (Drag to reorder)` : `Drag to reorder tag`}
                    >
                      <GripVertical className="w-2.5 h-2.5 opacity-40 hover:opacity-100 shrink-0" />
                      {isTop10 && (
                        <span className="text-[10px] font-mono text-primary font-bold">
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
              </div>
            )
          ) : (
            <div className="p-4 rounded-xl border border-dashed border-border bg-secondary/10 text-center text-xs text-muted-foreground">
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
  );
};
