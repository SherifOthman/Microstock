import React, { useState } from 'react';
import { ApiKeyRecord, AppSettings, ProviderType } from '../../../types';
import { MODEL_DISPLAY_NAMES, PROVIDERS_META, PROVIDER_ORDER } from '../../../constants/providers';
import { saveAppSettings, updateApiKey } from '../../../db';
import { keyRingScheduler } from '../../../services/scheduler/KeyRingScheduler';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Tooltip } from '../../../components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { KeyRow } from './KeyRow';
import {
  ChevronDown,
  GripVertical,
  Play,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

interface Props {
  settings: AppSettings | null;
  keys: ApiKeyRecord[];
  onSettingsUpdate: (settings: AppSettings) => void;
  onAddKey: (provider: ProviderType) => void;
  onTestAll: () => void;
  isTestingAll: boolean;
}

export const PriorityCascadeCard: React.FC<Props> = ({
  settings,
  keys,
  onSettingsUpdate,
  onAddKey,
  onTestAll,
  isTestingAll,
}) => {
  const { t } = useLanguage();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [expandedProviders, setExpandedProviders] = useState<Record<ProviderType, boolean>>({
    gemini: false,
    groq: false,
    openrouter: false,
    mistral: false,
    cloudflare: false,
  });

  const toggleExpand = (provider: ProviderType) => {
    setExpandedProviders((prev) => ({
      ...prev,
      [provider]: !prev[provider],
    }));
  };

  // Reconstruct current priority list
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

  const handleResetDefault = () => {
    handleReorder(['gemini', 'groq', 'openrouter', 'mistral', 'cloudflare']);
  };

  // Drag and Drop
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

    const matchingKeys = keys.filter((k) => k.providerId === provider);
    for (const k of matchingKeys) {
      await updateApiKey(k.id, { modelId });
    }
    await keyRingScheduler.refreshKeys();
  };

  return (
    <div className="space-y-3 text-xs">
      {/* Top Modal Action Bar (Clean Linear/Vercel style with strict semantic tokens) */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-foreground">
            {t.providerPriority}
          </span>
          <Tooltip content="The AI begins with #1. If it hits rate limits or errors, it cascades sequentially down the list. Drag rows to reorder.">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-secondary text-[10px] text-muted-foreground hover:text-foreground cursor-pointer font-bold border border-border">
              i
            </span>
          </Tooltip>
          <button
            type="button"
            onClick={handleResetDefault}
            className="text-[11px] text-muted-foreground hover:text-foreground hover:underline cursor-pointer ml-1 flex items-center gap-1"
            title="Reset to Gemini #1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{t.resetOrder}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {keys.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onTestAll}
              disabled={isTestingAll}
              className="h-7 text-xs gap-1.5 px-3 border-border bg-card text-foreground hover:bg-secondary cursor-pointer"
            >
              <Play className="w-3 h-3 text-emerald-500 fill-emerald-500/20" />
              <span>{isTestingAll ? t.testing : t.testAll}</span>
            </Button>
          )}

          <Button
            size="sm"
            onClick={() => onAddKey('gemini')}
            className="h-7 text-xs font-semibold px-3.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>{t.addKey}</span>
          </Button>
        </div>
      </div>

      {/* Unified Collapsible Provider Accordion Stack */}
      <div className="space-y-2" onDragLeave={() => setDragOverIndex(null)}>
        {currentPriority.map((providerId, index) => {
          const meta = PROVIDERS_META[providerId];
          const providerKeys = keys.filter((k) => k.providerId === providerId);
          const healthyKeys = providerKeys.filter((k) => k.status === 'healthy');
          const isPrimary = index === 0;
          const isExpanded = expandedProviders[providerId] ?? (providerKeys.length > 0 && isPrimary);

          const savedModel =
            settings?.providerModels?.[providerId] ||
            providerKeys[0]?.modelId ||
            meta.defaultModelId;

          const isBeingDragged = draggedIndex === index;
          const isDragOver = dragOverIndex === index;

          // Key health pill color
          const hasKeys = providerKeys.length > 0;
          const allHealthy = hasKeys && healthyKeys.length === providerKeys.length;
          const someHealthy = hasKeys && healthyKeys.length > 0 && !allHealthy;

          return (
            <div
              key={providerId}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`rounded-lg border transition-all overflow-hidden ${
                isPrimary
                  ? 'border-emerald-500/40 bg-card/95 shadow-xs'
                  : 'border-border bg-card/60 hover:bg-card'
              } ${isBeingDragged ? 'opacity-40 border-dashed border-sky-400' : ''} ${
                isDragOver ? 'border-primary ring-2 ring-primary/20 scale-[1.005]' : ''
              }`}
            >
              {/* Main Provider Row (Collapsed Header) */}
              <div
                onClick={() => toggleExpand(providerId)}
                className="p-3 flex items-center justify-between gap-3 cursor-pointer select-none"
              >
                {/* Left Group: Drag Handle, Minimal Priority Badge, Provider Name */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="p-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing transition"
                    title="Drag to reorder priority"
                  >
                    <GripVertical className="w-4 h-4" />
                  </div>

                  {/* Minimal Priority Badge */}
                  <span
                    className={`text-xs font-mono px-2 py-0.5 rounded font-medium shrink-0 ${
                      isPrimary
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold'
                        : 'bg-secondary text-muted-foreground border border-border'
                    }`}
                  >
                    {isPrimary ? `#1 ${t.primary}` : `#${index + 1}`}
                  </span>

                  {/* Provider Name */}
                  <span className="font-semibold text-sm text-foreground truncate">
                    {meta.name}
                  </span>
                </div>

                {/* Right Group: Model Selector, Key Health Pill, Expand Chevron */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-2.5 shrink-0"
                >
                  {/* Model Selector Dropdown */}
                  <Select
                    value={savedModel}
                    onValueChange={(val) => handleModelChange(providerId, val)}
                  >
                    <SelectTrigger className="h-8 text-xs bg-background border-border min-w-[200px] max-w-[240px] text-foreground">
                      <SelectValue>
                        <span className="truncate">
                          {MODEL_DISPLAY_NAMES[savedModel] || savedModel}
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-56 bg-popover border-border text-popover-foreground">
                      {meta.recommendedVisionModels.map((m) => (
                        <SelectItem key={m} value={m} className="text-xs">
                          <span className="font-mono">{MODEL_DISPLAY_NAMES[m] || m}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Key Health Pill (Locked nowrap shrink-0) */}
                  <Badge
                    variant="outline"
                    onClick={() => toggleExpand(providerId)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono cursor-pointer transition hover:bg-secondary border-border bg-background whitespace-nowrap shrink-0"
                    title={`${healthyKeys.length} of ${providerKeys.length} keys active`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        allHealthy
                          ? 'bg-emerald-500 animate-pulse'
                          : someHealthy
                          ? 'bg-amber-500'
                          : 'bg-muted-foreground'
                      }`}
                    />
                    <span className="text-foreground font-semibold">{healthyKeys.length}</span>
                    <span className="text-muted-foreground">/ {providerKeys.length} {t.keys}</span>
                  </Badge>

                  {/* Expand/Collapse Chevron */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(providerId)}
                    className="p-1 rounded text-muted-foreground hover:text-foreground transition cursor-pointer"
                    title={isExpanded ? 'Collapse keys' : 'Expand keys'}
                  >
                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Nested Keys Drawer (Expanded State) */}
              {isExpanded && (
                <div className="border-t border-border bg-secondary/20 px-3.5 py-2.5 space-y-1.5 animate-in fade-in-50 duration-150">
                  {providerKeys.length === 0 ? (
                    <div className="flex items-center justify-between py-2 px-2 text-muted-foreground text-xs">
                      <span>{(t.noKeysForProvider || 'No keys added for {name} yet.').replace('{name}', meta.name)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onAddKey(providerId)}
                        className="h-6 text-xs text-foreground hover:bg-secondary cursor-pointer gap-1 px-2"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{t.addKey || 'Add Key'}</span>
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        {providerKeys.map((keyRec, kIdx) => (
                          <KeyRow key={keyRec.id} keyRecord={keyRec} index={kIdx} />
                        ))}
                      </div>

                      {/* Quick Add Button at bottom left */}
                      <div className="pt-1.5 border-t border-border/50 flex justify-start">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onAddKey(providerId)}
                          className="h-6 text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer gap-1 px-2"
                        >
                          <Plus className="w-3 h-3" />
                          <span>{(t.addProviderKey || 'Add {name} Key').replace('{name}', meta.name)}</span>
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
