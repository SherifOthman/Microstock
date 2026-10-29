import React, { useState } from 'react';
import { ApiKeyRecord, AppSettings, ProviderType } from '../../../types';
import { MODEL_DISPLAY_NAMES, PROVIDERS_META, PROVIDER_ORDER } from '../../../constants/providers';
import { saveAppSettings, updateApiKey } from '../../../db';
import { keyRingScheduler } from '../../../services/scheduler/KeyRingScheduler';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Tooltip } from '../../../components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';

interface Props {
  settings: AppSettings | null;
  keys: ApiKeyRecord[];
  onSettingsUpdate: (settings: AppSettings) => void;
  onAddKey: (provider: ProviderType) => void;
  onFilterProvider?: (provider: ProviderType) => void;
}

export const PriorityCascadeCard: React.FC<Props> = ({
  settings,
  keys,
  onSettingsUpdate,
  onAddKey,
  onFilterProvider,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Reconstruct current priority list (safeguarding against missing providers)
  const currentPriority: ProviderType[] = React.useMemo(() => {
    const saved = settings?.providerPriority || [];
    const set = new Set(saved);
    for (const p of PROVIDER_ORDER) {
      set.add(p);
    }
    return Array.from(set);
  }, [settings?.providerPriority]);

  const handleReorder = async (newOrder: ProviderType[]) => {
    if (!settings) return;
    const updated = await saveAppSettings({ providerPriority: newOrder });
    onSettingsUpdate(updated);
    await keyRingScheduler.refreshKeys();
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const newOrder = [...currentPriority];
    const temp = newOrder[index - 1];
    newOrder[index - 1] = newOrder[index];
    newOrder[index] = temp;
    handleReorder(newOrder);
  };

  const handleMoveDown = (index: number) => {
    if (index >= currentPriority.length - 1) return;
    const newOrder = [...currentPriority];
    const temp = newOrder[index + 1];
    newOrder[index + 1] = newOrder[index];
    newOrder[index] = temp;
    handleReorder(newOrder);
  };

  const handleResetDefault = () => {
    handleReorder(['gemini', 'groq', 'openrouter', 'mistral', 'cloudflare']);
  };

  // Drag and Drop event handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }

    const newOrder = [...currentPriority];
    const [moved] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, moved);
    setDraggedIndex(null);
    handleReorder(newOrder);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Model Selection per Provider
  const handleModelChange = async (provider: ProviderType, modelId: string) => {
    if (!settings) return;
    const currentModels = settings.providerModels || {};
    const updated = await saveAppSettings({
      providerModels: {
        ...currentModels,
        [provider]: modelId,
      },
    });
    onSettingsUpdate(updated);

    // Also update any existing keys of this provider in DB
    const matchingKeys = keys.filter((k) => k.providerId === provider);
    for (const k of matchingKeys) {
      await updateApiKey(k.id, { modelId });
    }
    await keyRingScheduler.refreshKeys();
  };

  const isPriorityMode = settings?.routingStrategy === 'priority_tiered';

  return (
    <div className="p-3.5 bg-card rounded-xl border border-border space-y-3 text-xs">
      {/* Header with Title, Mode Indicator & Reset */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-border">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md border border-border bg-secondary/40 text-foreground">
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-xs text-foreground">
              Provider & Model Priority Cascade
            </span>
            <Badge
              variant="outline"
              className={`text-[10px] py-0 font-mono ${
                isPriorityMode
                  ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                  : 'text-muted-foreground bg-muted/40'
              }`}
            >
              {isPriorityMode ? 'Active (Priority Mode)' : 'Standby (Parallel Mode Active)'}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            The scheduler begins with Provider #1. If it hits a rate limit (429) or fails, it automatically cascades to #2, #3, etc.
            <span className="text-foreground/80 font-medium ml-1">
              Drag the ⠿ handle or click ▲/▼ to change priority order.
            </span>
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleResetDefault}
          className="h-7 text-xs text-muted-foreground hover:text-foreground shrink-0 gap-1.5 self-start sm:self-auto"
          title="Reset to default order (Google Gemini #1)"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset (Gemini #1)</span>
        </Button>
      </div>

      {/* Draggable Reorderable Priority Rows */}
      <div className="space-y-1.5" onDragLeave={() => setDragOverIndex(null)}>
        {currentPriority.map((providerId, index) => {
          const meta = PROVIDERS_META[providerId];
          const providerKeys = keys.filter((k) => k.providerId === providerId);
          const healthyKeys = providerKeys.filter((k) => k.status === 'healthy');
          const hasKeys = providerKeys.length > 0;

          // Determine badge label and color matching the reference design
          const isPrimary = index === 0;
          const isFallback1 = index === 1;
          const isFallback2 = index === 2;

          let badgeText = `#${index + 1} Fallback ${index}`;
          let badgeStyle = 'border-border text-muted-foreground bg-secondary/40';
          let rowHighlight = 'border-border bg-card/60 hover:bg-card';

          if (isPrimary) {
            badgeText = '#1 Primary';
            badgeStyle = 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10 font-bold';
            rowHighlight = 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10';
          } else if (isFallback1) {
            badgeStyle = 'border-sky-500/40 text-sky-400 bg-sky-500/10 font-semibold';
          } else if (isFallback2) {
            badgeStyle = 'border-purple-500/40 text-purple-400 bg-purple-500/10 font-semibold';
          }

          // Active vision model
          const savedModel =
            settings?.providerModels?.[providerId] ||
            providerKeys[0]?.modelId ||
            meta.defaultModelId;

          const isBeingDragged = draggedIndex === index;
          const isDragOver = dragOverIndex === index;

          return (
            <div
              key={providerId}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2 rounded-lg border transition-all ${rowHighlight} ${
                isBeingDragged ? 'opacity-40 scale-[0.99] border-dashed border-sky-400' : ''
              } ${isDragOver ? 'border-primary ring-2 ring-primary/20 scale-[1.01]' : ''}`}
            >
              {/* Left: Drag Handle, Up/Down, Priority Badge & Provider Name */}
              <div className="flex items-center gap-2 min-w-0">
                {/* Drag Handle with Hint Tooltip */}
                <Tooltip content="Click & drag to reorder priority">
                  <div
                    className="p-1 rounded cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground transition hover:bg-secondary"
                    aria-label="Drag to reorder"
                  >
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>
                </Tooltip>

                {/* Up / Down Arrows */}
                <div className="flex flex-col -space-y-1">
                  <button
                    type="button"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="p-0.5 text-muted-foreground/60 hover:text-foreground disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition"
                    title="Move up in priority"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === currentPriority.length - 1}
                    className="p-0.5 text-muted-foreground/60 hover:text-foreground disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition"
                    title="Move down in priority"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>

                {/* Priority Badge */}
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border shrink-0 ${badgeStyle}`}
                >
                  {badgeText}
                </span>

                {/* Provider Title & Subtitle */}
                <div className="flex items-center gap-1.5 truncate">
                  <span className="font-semibold text-foreground truncate">{meta.name}</span>
                  <span className="text-[10px] text-muted-foreground truncate hidden md:inline">
                    ({meta.badge})
                  </span>
                </div>
              </div>

              {/* Right: Model Selector & Key Counter / Add Key */}
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-border/40">
                {/* Model Selector Dropdown */}
                <div className="flex items-center gap-1.5 flex-1 sm:flex-initial">
                  <span className="text-[10px] text-muted-foreground font-mono hidden xs:inline">Model:</span>
                  <Select
                    value={savedModel}
                    onValueChange={(val) => handleModelChange(providerId, val)}
                  >
                    <SelectTrigger className="h-7 text-xs bg-card border-border w-full sm:w-auto sm:min-w-[170px] sm:max-w-[230px]">
                      <SelectValue>
                        <span className="truncate">
                          {MODEL_DISPLAY_NAMES[savedModel] || savedModel}
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {meta.recommendedVisionModels.map((m) => (
                        <SelectItem key={m} value={m} className="text-xs">
                          <span className="font-mono">{MODEL_DISPLAY_NAMES[m] || m}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Key Status Pill or + Add Key Button */}
                {hasKeys ? (
                  <button
                    type="button"
                    onClick={() => onFilterProvider?.(providerId)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-secondary/40 hover:bg-secondary text-[11px] font-mono transition cursor-pointer shrink-0"
                    title={`View ${meta.name} keys in keyring`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        healthyKeys.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                      }`}
                    />
                    <span className="font-semibold text-foreground">{healthyKeys.length}</span>
                    <span className="text-muted-foreground">/ {providerKeys.length}</span>
                  </button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAddKey(providerId)}
                    className="h-7 text-xs gap-1 border-dashed hover:border-solid hover:bg-primary hover:text-primary-foreground shrink-0"
                    title={`Add an API key for ${meta.name}`}
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add key</span>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
