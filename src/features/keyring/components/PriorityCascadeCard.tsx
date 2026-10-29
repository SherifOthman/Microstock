import React, { useState } from 'react';
import { ApiKeyRecord, AppSettings, ProviderType } from '../../../types';
import { MODEL_DISPLAY_NAMES, PROVIDERS_META, PROVIDER_ORDER } from '../../../constants/providers';
import { saveAppSettings, updateApiKey } from '../../../db';
import { keyRingScheduler } from '../../../services/scheduler/KeyRingScheduler';
import { Button } from '../../../components/ui/button';
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
      {/* Top Modal Action Bar (Clean Linear/Vercel style) */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-zinc-100">
            Provider Priority & Failover
          </span>
          <Tooltip content="The AI begins with #1. If it hits rate limits or errors, it cascades sequentially down the list. Drag rows to reorder.">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-zinc-800 text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer font-bold">
              i
            </span>
          </Tooltip>
          <button
            type="button"
            onClick={handleResetDefault}
            className="text-[11px] text-zinc-400 hover:text-zinc-200 hover:underline cursor-pointer ml-1 flex items-center gap-1"
            title="Reset to Gemini #1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Order</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {keys.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onTestAll}
              disabled={isTestingAll}
              className="h-7 text-xs gap-1.5 px-3 border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            >
              <Play className="w-3 h-3 text-emerald-400" />
              <span>{isTestingAll ? 'Testing...' : 'Test All'}</span>
            </Button>
          )}

          <Button
            size="sm"
            onClick={() => onAddKey('gemini')}
            className="h-7 text-xs font-semibold px-3.5 bg-zinc-100 text-zinc-950 hover:bg-white cursor-pointer shadow-xs gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Add Key</span>
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
                  ? 'border-emerald-500/40 bg-zinc-900/90'
                  : 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900/80'
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
                    className="p-0.5 text-zinc-500 hover:text-zinc-300 cursor-grab active:cursor-grabbing transition"
                    title="Drag to reorder priority"
                  >
                    <GripVertical className="w-4 h-4" />
                  </div>

                  {/* Minimal Priority Badge */}
                  <span
                    className={`text-xs font-mono px-2 py-0.5 rounded font-medium shrink-0 ${
                      isPrimary
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700/60'
                    }`}
                  >
                    {isPrimary ? '#1 Primary' : `#${index + 1}`}
                  </span>

                  {/* Provider Name */}
                  <span className="font-medium text-sm text-zinc-100 truncate">
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
                    <SelectTrigger className="h-8 text-xs bg-zinc-950 border-zinc-800 min-w-[200px] max-w-[240px] text-zinc-200">
                      <SelectValue>
                        <span className="truncate">
                          {MODEL_DISPLAY_NAMES[savedModel] || savedModel}
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-56 bg-zinc-950 border-zinc-800 text-zinc-200">
                      {meta.recommendedVisionModels.map((m) => (
                        <SelectItem key={m} value={m} className="text-xs focus:bg-zinc-800">
                          <span className="font-mono">{MODEL_DISPLAY_NAMES[m] || m}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Key Health Pill */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(providerId)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-zinc-800 bg-zinc-950 text-xs font-mono cursor-pointer transition hover:bg-zinc-900"
                    title={`${healthyKeys.length} of ${providerKeys.length} keys active`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        allHealthy
                          ? 'bg-emerald-400 animate-pulse'
                          : someHealthy
                          ? 'bg-amber-400'
                          : 'bg-zinc-600'
                      }`}
                    />
                    <span className="text-zinc-200 font-semibold">{healthyKeys.length}</span>
                    <span className="text-zinc-500">/ {providerKeys.length} keys</span>
                  </button>

                  {/* Expand/Collapse Chevron */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(providerId)}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-100 transition cursor-pointer"
                    title={isExpanded ? 'Collapse keys' : 'Expand keys'}
                  >
                    <ChevronDown
                      className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Nested Keys Drawer (Expanded State) */}
              {isExpanded && (
                <div className="border-t border-zinc-800/80 bg-zinc-950/60 px-3.5 py-2.5 space-y-1.5 animate-in fade-in-50 duration-150">
                  {providerKeys.length === 0 ? (
                    <div className="flex items-center justify-between py-2 px-2 text-zinc-500 text-xs">
                      <span>No keys added for {meta.name} yet.</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onAddKey(providerId)}
                        className="h-6 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 cursor-pointer gap-1 px-2"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Key</span>
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
                      <div className="pt-1.5 border-t border-zinc-900 flex justify-start">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onAddKey(providerId)}
                          className="h-6 text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 cursor-pointer gap-1 px-2"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add {meta.name} Key</span>
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
