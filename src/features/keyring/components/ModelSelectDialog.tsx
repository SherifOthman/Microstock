import React, { useState } from 'react';
import { ApiKeyRecord, ModelInfo } from '../../../types';
import { getProviderAdapter } from '../../../services/providers';
import { PROVIDERS_META } from '../../../constants/providers';
import { Dialog } from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Eye, Loader2, RefreshCw } from 'lucide-react';

interface Props {
  keyRecord: ApiKeyRecord;
  open: boolean;
  onClose: () => void;
  onSave: (newModelId: string) => Promise<void>;
}

export const ModelSelectDialog: React.FC<Props> = ({ keyRecord, open, onClose, onSave }) => {
  const [modelId, setModelId] = useState<string>(keyRecord.modelId);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const providerMeta = PROVIDERS_META[keyRecord.providerId];

  const handleFetchModels = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const adapter = getProviderAdapter(keyRecord.providerId);
      const models = await adapter.fetchModels(keyRecord.key);
      setAvailableModels(models);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch models');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!modelId.trim()) return;
    setIsSaving(true);
    try {
      await onSave(modelId.trim());
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const filteredModels = availableModels.filter(
    (m) =>
      m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Configure Vision Model"
      description={`${providerMeta.name} • ${keyRecord.label}`}
    >
      <div className="space-y-4">
        {/* Model Dropdown & Fetch */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground">Select Active Vision Model</label>
            {providerMeta.supportsDynamicModels && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleFetchModels}
                disabled={isLoading}
                className="h-6 px-2 text-[10px] gap-1"
              >
                {isLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Fetch Live from API
              </Button>
            )}
          </div>

          <Select
            value={
              providerMeta.recommendedVisionModels.includes(modelId)
                ? modelId
                : availableModels.some((m) => m.id === modelId)
                ? modelId
                : 'custom'
            }
            onValueChange={(val) => {
              if (val !== 'custom') {
                setModelId(val);
              }
            }}
          >
            <SelectTrigger className="w-full h-8 text-xs font-mono bg-card">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent position="popper" className="max-w-[calc(100vw-2rem)] max-h-60">
              <SelectGroup>
                <SelectLabel>⭐ Recommended Vision Models</SelectLabel>
                {providerMeta.recommendedVisionModels.map((m) => (
                  <SelectItem key={m} value={m} className="text-xs font-mono">
                    {m}
                  </SelectItem>
                ))}
              </SelectGroup>

              {availableModels.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>🌐 Live Fetched Models</SelectLabel>
                    {availableModels.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs font-mono">
                        {m.name || m.id}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}

              <SelectSeparator />
              <SelectItem value="custom" className="text-xs font-mono">
                ✏️ Custom / Specific Model ID...
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Model ID Text Input for fine-tuning */}
          <div className="pt-1">
            <Input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="e.g. gemini-1.5-flash"
              className="font-mono text-xs"
            />
          </div>
        </div>

        {/* Presets */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">Presets</label>
          <div className="flex flex-wrap gap-1.5">
            {providerMeta.recommendedVisionModels.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setModelId(preset)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono border transition cursor-pointer ${
                  modelId === preset
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary text-secondary-foreground border-border hover:bg-accent'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg border border-destructive/30 bg-destructive/10 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Live Models List */}
        {availableModels.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden bg-background">
            <div className="p-2 border-b border-border bg-muted/40 flex items-center justify-between">
              <span className="text-xs font-medium">Models ({filteredModels.length})</span>
              <Input
                placeholder="Filter..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 w-36 text-xs"
              />
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-border">
              {filteredModels.map((m) => (
                <div
                  key={m.id}
                  onClick={() => setModelId(m.id)}
                  className={`p-2 flex items-center justify-between text-xs cursor-pointer transition ${
                    modelId === m.id ? 'bg-accent font-medium' : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-mono truncate">{m.id}</div>
                    {m.name && m.name !== m.id && (
                      <div className="text-[10px] text-muted-foreground truncate">{m.name}</div>
                    )}
                  </div>
                  {m.isVision && (
                    <Badge variant="secondary" className="gap-1 text-[10px] shrink-0">
                      <Eye className="w-2.5 h-2.5" /> vision
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dialog Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || !modelId.trim()}>
            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
            Save Model
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
