import React, { useEffect, useState } from 'react';
import { MasterMetadataRecord } from '../../../types';
import { db } from '../../../db';
import { QueueItem } from '../../../services/queue/BatchQueueService';
import { MODEL_DISPLAY_NAMES } from '../../../constants/providers';
import { getAdobeCategoryName, getDreamstimeCategoryName, FREEPIK_BASE_MODELS } from '../../../constants/categories';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Switch } from '../../../components/ui/switch';
import { Tooltip } from '../../../components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  AlertTriangle,
  Box,
  Camera,
  Check,
  Copy,
  Edit3,
  Film,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Info,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

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
  const [localTitle, setLocalTitle] = useState(rec?.baseTitle || '');
  const [localDesc, setLocalDesc] = useState(rec?.detailedDescription || '');
  const [isAiGenerated, setIsAiGenerated] = useState<boolean>(rec?.isAiGenerated ?? true);
  const [localPrompt, setLocalPrompt] = useState<string>(rec?.aiGenerationInfo?.prompt || '');
  const [localModel, setLocalModel] = useState<string>(rec?.aiGenerationInfo?.model || 'Google Nano Banana');
  const [isEditingKws, setIsEditingKws] = useState(false);
  const [rawKwsInput, setRawKwsInput] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');

  // Synchronize local states when the database record updates (e.g., after AI generation)
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

  useEffect(() => {
    if (rec?.isAiGenerated !== undefined) {
      setIsAiGenerated(rec.isAiGenerated);
    }
  }, [rec?.isAiGenerated]);

  useEffect(() => {
    if (rec?.aiGenerationInfo?.prompt !== undefined) {
      setLocalPrompt(rec.aiGenerationInfo.prompt);
    }
  }, [rec?.aiGenerationInfo?.prompt]);

  useEffect(() => {
    if (rec?.aiGenerationInfo?.model !== undefined) {
      setLocalModel(rec.aiGenerationInfo.model);
    }
  }, [rec?.aiGenerationInfo?.model]);

  const handleToggleAi = async (checked: boolean) => {
    setIsAiGenerated(checked);
    if (rec) {
      await db.masterRecords.update(rec.id, { isAiGenerated: checked });
    }
  };

  const handleBlurPrompt = async () => {
    if (rec && localPrompt.trim() !== rec.aiGenerationInfo?.prompt) {
      await db.masterRecords.update(rec.id, {
        aiGenerationInfo: {
          ...rec.aiGenerationInfo,
          prompt: localPrompt.trim(),
          model: rec.aiGenerationInfo?.model || localModel,
        },
      });
    }
  };

  const handleModelChange = async (val: string) => {
    setLocalModel(val);
    if (rec) {
      await db.masterRecords.update(rec.id, {
        aiGenerationInfo: {
          ...rec.aiGenerationInfo,
          prompt: localPrompt || rec.aiGenerationInfo?.prompt || '',
          model: val,
        },
      });
    }
  };

  const handleBlurTitle = async () => {
    if (rec && localTitle.trim() !== rec.baseTitle) {
      await db.masterRecords.update(rec.id, { baseTitle: localTitle.trim() });
    }
  };

  const handleBlurDesc = async () => {
    if (rec && localDesc.trim() !== rec.detailedDescription) {
      await db.masterRecords.update(rec.id, { detailedDescription: localDesc.trim() });
    }
  };

  const handleRemoveKeyword = async (kwToRemove: string) => {
    if (!rec) return;
    const updated = rec.rankedKeywords.filter(
      (k) => k.toLowerCase() !== kwToRemove.toLowerCase()
    );
    await db.masterRecords.update(rec.id, { rankedKeywords: updated });
  };

  const handleSaveRawKeywords = async () => {
    if (!rec) return;
    const cleanKws = rawKwsInput
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    await db.masterRecords.update(rec.id, { rankedKeywords: cleanKws });
    setIsEditingKws(false);
  };

  const handleAddTagSubmit = async () => {
    if (!rec || !newTagInput.trim()) {
      setIsAddingTag(false);
      return;
    }
    const clean = newTagInput.trim().toLowerCase();
    if (!rec.rankedKeywords.includes(clean)) {
      await db.masterRecords.update(rec.id, {
        rankedKeywords: [...rec.rankedKeywords, clean],
      });
    }
    setNewTagInput('');
    setIsAddingTag(false);
  };

  const formatBytes = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getCleanModelName = (modelId?: string, providerId?: string): string => {
    if (providerId) {
      if (providerId === 'gemini') return 'Gemini';
      if (providerId === 'openrouter') return 'OpenRouter';
      if (providerId === 'groq') return 'Groq';
      if (providerId === 'mistral') return 'Mistral';
      if (providerId === 'cloudflare') return 'Cloudflare';
    }
    if (!modelId) return 'AI Vision';
    const lower = modelId.toLowerCase();
    if (lower.includes('gemini')) return 'Gemini';
    if (lower.includes('openrouter')) return 'OpenRouter';
    if (lower.includes('qwen') || lower.includes('groq')) return 'Groq';
    if (lower.includes('pixtral') || lower.includes('mistral')) return 'Mistral';
    if (lower.includes('llama') || lower.includes('@cf')) return 'Cloudflare';
    return modelId.split('/')[0] || 'AI Vision';
  };

  const isCompleted = asset.status === 'completed';
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
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs transition hover:border-zinc-700/80 flex flex-col md:flex-row gap-5 items-start">
      {/* ======================================================== */}
      {/* LEFT COLUMN: Thumbnail, Meta, Status, Live Model Tracker */}
      {/* ======================================================== */}
      <div className="w-full md:w-56 shrink-0 flex flex-col gap-2.5">
        {/* Thumbnail with red delete button pinned top-right */}
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
                  : 'Video'}
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
              <span>EPS Vector</span>
            </div>
          ) : (
            <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/85 backdrop-blur-xs text-[10px] font-mono text-emerald-300 flex items-center gap-1 border border-emerald-500/30 shadow-sm">
              <Camera className="w-3 h-3 text-emerald-400" />
              <span>PHOTO</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => onDelete(asset.id, asset.filename)}
            className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-red-600/90 hover:bg-red-500 text-white flex items-center justify-center shadow-md transition cursor-pointer"
            title="Delete Asset"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Filename & Dual Size Display: Original vs Compressed AI Payload */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-foreground truncate" title={asset.filename}>
            {asset.filename}
          </p>

          <div className="rounded-lg bg-secondary/40 border border-border/70 p-2 space-y-1.5 text-[10px] font-mono">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Original Size:</span>
              <span className="font-semibold text-foreground">{formatBytes(originalSize)}</span>
            </div>

            <div className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1">
                <span>AI Payload:</span>
                {savingsPercent !== null && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                    -{savingsPercent}%
                  </span>
                )}
              </span>
              <span className="font-semibold text-sky-400">{formatBytes(compressedSize)}</span>
            </div>
          </div>
        </div>

        {/* Status Pill matching the user's reference design */}
        {isCompleted && (
          <div className="w-full py-1.5 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold text-xs flex items-center justify-center gap-1.5">
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>DONE</span>
          </div>
        )}

        {isProcessing && (
          <div className="w-full py-1.5 px-3 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-sky-400 font-semibold text-xs flex items-center justify-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>PROCESSING</span>
          </div>
        )}

        {isQueued && (
          <div className="w-full py-1.5 px-3 rounded-lg bg-muted/60 border border-border text-muted-foreground font-semibold text-xs flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" />
            <span>QUEUED</span>
          </div>
        )}

        {isError && (
          <div className="w-full py-1.5 px-3 rounded-lg bg-red-950/40 border border-red-800/50 text-red-400 font-semibold text-xs flex items-center justify-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>FAILED</span>
          </div>
        )}

        {/* Live Model & Attempt Tracker */}
        <div className="rounded-lg border border-border bg-secondary/30 p-2.5 text-[11px] space-y-1.5">
          {isProcessing && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-sky-400 font-semibold text-[11px]">
                <Zap className="w-3 h-3 animate-pulse text-sky-400" />
                <span>Active Inference</span>
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                Trying:{' '}
                <span className="text-foreground font-semibold">
                  {getCleanModelName(asset.queueItem?.assignedModel, asset.queueItem?.assignedProvider)}
                </span>
              </div>
              {asset.queueItem?.assignedProvider && (
                <div className="text-[10px] text-muted-foreground font-mono">
                  Provider:{' '}
                  <span className="capitalize text-foreground">
                    {asset.queueItem.assignedProvider}
                  </span>
                </div>
              )}
            </div>
          )}

          {isCompleted && rec && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Model:</span>
                <span
                  className="font-semibold text-foreground truncate max-w-[130px]"
                  title={rec.aiGenerationInfo?.model}
                >
                  {getCleanModelName(rec.aiGenerationInfo?.model, rec.aiGenerationInfo?.provider)}
                </span>
              </div>
              {rec.aiGenerationInfo?.latencyMs && (
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Latency:</span>
                  <span className="font-mono text-emerald-400 font-medium">
                    {(rec.aiGenerationInfo.latencyMs / 1000).toFixed(1)}s
                  </span>
                </div>
              )}
              {/* Failover / Retry History */}
              {rec.aiGenerationInfo?.attemptHistory &&
                rec.aiGenerationInfo.attemptHistory.length > 1 && (
                  <div className="pt-1 border-t border-border/50 text-[10px] space-y-0.5">
                    <span className="text-amber-400 font-medium">Failover / Retries:</span>
                    {rec.aiGenerationInfo.attemptHistory.map((att, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground"
                      >
                        <span
                          className={
                            att.status === 'success' ? 'text-emerald-400' : 'text-red-400'
                          }
                        >
                          {att.status === 'success' ? '✓' : '✕'}
                        </span>
                        <span className="truncate">{getCleanModelName(att.model, att.provider as any)}</span>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}

          {isError && (
            <div className="space-y-1">
              <span className="text-red-400 text-[10px] font-semibold block">
                Inference Error:
              </span>
              <p className="text-[10px] text-muted-foreground line-clamp-2">
                {asset.error || asset.queueItem?.error || 'All attempts failed'}
              </p>
              {asset.queueItem?.attemptHistory &&
                asset.queueItem.attemptHistory.length > 0 && (
                  <div className="text-[9px] font-mono text-muted-foreground space-y-0.5 pt-1">
                    {asset.queueItem.attemptHistory.map((att, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <span className="text-red-400">✕</span>
                        <span className="truncate">{getCleanModelName(att.model, att.provider as any)}</span>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}

          {isQueued && (
            <div className="text-[10px] text-muted-foreground text-center py-0.5 font-mono">
              Waiting for next free API slot...
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* RIGHT COLUMN: Title, Description, Keywords, Actions       */}
      {/* ======================================================== */}
      <div className="flex-1 w-full flex flex-col gap-3.5">
        {/* AI GENERATED SWITCH ROW (Matching Contributor Portal Standards) */}
        <div className="flex items-center justify-between pb-2 border-b border-border/60">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-foreground">AI Generated</span>
            <Tooltip content="Indicates whether this asset was generated with AI. When enabled, Freepik and Dreamstime AI metadata (Prompt & Model) are automatically included.">
              <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-pointer" />
            </Tooltip>
          </div>
          <Switch
            checked={isAiGenerated}
            onCheckedChange={handleToggleAi}
            aria-label="Toggle AI Generated status"
          />
        </div>

        {/* PROMPT & BASE MODEL ROW (Visible when AI Generated is ON - Freepik Parity) */}
        {isAiGenerated && (
          <div className="space-y-1.5 p-2.5 rounded-lg border border-border/80 bg-secondary/15">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Pencil className="w-3.5 h-3.5 text-sky-400" />
                <span>Prompt</span>
                <Tooltip content="The AI generation prompt used to create this image (satisfies Freepik Contributor Portal requirements).">
                  <HelpCircle className="w-3 h-3 text-muted-foreground hover:text-foreground cursor-pointer" />
                </Tooltip>
              </div>

              <div className="flex items-center gap-2">
                {/* Freepik Base Model Selector */}
                <div className="flex items-center gap-1">
                  <Box className="w-3.5 h-3.5 text-muted-foreground" />
                  <Select
                    value={localModel}
                    onValueChange={handleModelChange}
                  >
                    <SelectTrigger className="h-7 text-xs bg-background/80 border-border min-w-[150px] max-w-[210px]">
                      <SelectValue placeholder="Base model" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {FREEPIK_BASE_MODELS.map((m) => (
                        <SelectItem key={m} value={m} className="text-xs">
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <button
                  type="button"
                  onClick={() => rec && onCopyText(localPrompt, `${asset.id}_prompt`)}
                  disabled={!rec || !localPrompt}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-border bg-secondary/50 text-foreground hover:bg-secondary transition cursor-pointer disabled:opacity-40"
                  title="Copy Prompt"
                >
                  {copiedKey === `${asset.id}_prompt` ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-muted-foreground" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {rec ? (
              <Textarea
                value={localPrompt}
                onChange={(e) => setLocalPrompt(e.target.value)}
                onBlur={handleBlurPrompt}
                placeholder="Enter AI generation prompt..."
                className="text-xs min-h-[52px] bg-secondary/20 border-border leading-relaxed resize-y focus:border-sky-500 font-mono"
              />
            ) : (
              <div className="h-12 rounded-lg border border-dashed border-border bg-muted/20 flex items-center px-3 text-xs text-muted-foreground italic">
                {isProcessing ? 'Generating AI prompt...' : 'Waiting in queue...'}
              </div>
            )}
          </div>
        )}

        {/* TITLE ROW */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <span className="text-sky-400 font-bold text-sm">H</span>
              <span>Title</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-muted-foreground">
                {localTitle.length} chars
              </span>
              <button
                type="button"
                onClick={() => rec && onCopyText(localTitle, `${asset.id}_title`)}
                disabled={!rec}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-border bg-secondary/50 text-foreground hover:bg-secondary transition cursor-pointer disabled:opacity-40"
              >
                {copiedKey === `${asset.id}_title` ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-muted-foreground" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {rec ? (
            <Input
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={handleBlurTitle}
              placeholder="Enter stock title..."
              className="h-9 text-xs font-medium bg-secondary/20 border-border focus:border-sky-500"
            />
          ) : (
            <div className="h-9 rounded-lg border border-dashed border-border bg-muted/20 flex items-center px-3 text-xs text-muted-foreground italic">
              {isProcessing ? 'Generating title with AI...' : 'Waiting in queue...'}
            </div>
          )}
        </div>

        {/* DESCRIPTION ROW */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <FileText className="w-3.5 h-3.5 text-sky-400" />
              <span>Description</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-muted-foreground">
                {localDesc.length} chars
              </span>
              <button
                type="button"
                onClick={() => rec && onCopyText(localDesc, `${asset.id}_desc`)}
                disabled={!rec}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-border bg-secondary/50 text-foreground hover:bg-secondary transition cursor-pointer disabled:opacity-40"
              >
                {copiedKey === `${asset.id}_desc` ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-muted-foreground" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {rec ? (
            <Textarea
              value={localDesc}
              onChange={(e) => setLocalDesc(e.target.value)}
              onBlur={handleBlurDesc}
              placeholder="Enter stock description..."
              className="text-xs min-h-[64px] bg-secondary/20 border-border leading-relaxed resize-y focus:border-sky-500"
            />
          ) : (
            <div className="h-16 rounded-lg border border-dashed border-border bg-muted/20 flex items-center px-3 text-xs text-muted-foreground italic">
              {isProcessing ? 'Generating description with AI...' : 'Waiting in queue...'}
            </div>
          )}
        </div>

        {/* KEYWORDS ROW */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Tag className="w-3.5 h-3.5 text-amber-400" />
              <span>Keywords</span>
              {rec && (
                <span className="text-[11px] font-mono font-normal text-muted-foreground">
                  {rec.rankedKeywords.length}
                </span>
              )}
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
                  <span>{isEditingKws ? 'Cancel' : 'Edit'}</span>
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
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-muted-foreground" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {rec ? (
            isEditingKws ? (
              <div className="space-y-2">
                <Textarea
                  value={rawKwsInput}
                  onChange={(e) => setRawKwsInput(e.target.value)}
                  placeholder="Type or paste keywords separated by commas..."
                  className="text-xs min-h-[70px] bg-secondary/20 border-border font-mono"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" onClick={handleSaveRawKeywords} className="h-7 text-xs">
                    Save Keywords
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl border border-border bg-secondary/15 flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                {rec.rankedKeywords.map((kw, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:border-sky-500/50 transition group/tag"
                  >
                    <span>{kw}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(kw)}
                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-sky-400/60 hover:text-red-400 transition cursor-pointer"
                      title={`Remove "${kw}"`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                {isAddingTag ? (
                  <div className="inline-flex items-center gap-1">
                    <Input
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
                      className="h-6 w-24 text-[11px] px-2 py-0"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAddingTag(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground transition cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Tag</span>
                  </button>
                )}
              </div>
            )
          ) : (
            <div className="h-20 rounded-lg border border-dashed border-border bg-muted/20 flex items-center px-3 text-xs text-muted-foreground italic">
              {isProcessing
                ? 'Generating 40-50 ranked keywords with AI...'
                : 'Waiting in queue...'}
            </div>
          )}
        </div>

        {/* BOTTOM ACTION BAR: Categories & Regenerate Button */}
        <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Left: Category info & Copy all matching reference screenshot */}
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            {rec ? (
              <>
                <span
                  className="font-mono text-[10px] bg-secondary/60 px-2 py-0.5 rounded-md border border-border"
                  title={getAdobeCategoryName(rec.categories.adobeCategoryId)}
                >
                  Adobe:{' '}
                  <span className="text-foreground font-semibold">
                    #{rec.categories.adobeCategoryId || 8}
                  </span>
                </span>
                <span
                  className="font-mono text-[10px] bg-secondary/60 px-2 py-0.5 rounded-md border border-border"
                  title="Official Shutterstock Category"
                >
                  Shutterstock:{' '}
                  <span className="text-foreground font-semibold">
                    {rec.categories.shutterstockCategories[0] || 'Objects'}
                  </span>
                </span>
                <span
                  className="font-mono text-[10px] bg-secondary/60 px-2 py-0.5 rounded-md border border-border"
                  title={getDreamstimeCategoryName(rec.categories.dreamstimeCategory1)}
                >
                  Dreamstime:{' '}
                  <span className="text-foreground font-semibold">
                    #{rec.categories.dreamstimeCategory1 || 114}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onCopyAll(rec)}
                  className="text-[11px] font-medium text-foreground/90 hover:text-foreground underline transition cursor-pointer flex items-center gap-1 ml-1"
                  title="Copy Title, Description, and Keywords to clipboard"
                >
                  {copiedKey === `${rec.id}_all` ? (
                    <span className="text-emerald-400 font-semibold no-underline">Copied All!</span>
                  ) : (
                    <span>Copy All</span>
                  )}
                </button>
              </>
            ) : (
              <span className="text-muted-foreground/60 italic text-[11px]">
                Categories assigned automatically upon completion
              </span>
            )}
          </div>

          {/* Right: Regenerate Button (Sky Blue matching the reference screenshot) */}
          <Button
            size="sm"
            onClick={() => onRegenerate(asset.id)}
            disabled={isProcessing}
            className="bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs px-4 py-2 h-8 rounded-lg shadow-sm gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`}
            />
            <span>Regenerate</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
