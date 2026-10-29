import React, { useEffect, useState } from 'react';
import { ApiKeyRecord, ProviderType } from '../../../types';
import { MODEL_DISPLAY_NAMES, PROVIDERS_META, PROVIDER_ORDER } from '../../../constants/providers';
import { createApiKeyRecord, saveApiKey, removeApiKey, getAllApiKeys } from '../../../db';
import { keyRingScheduler } from '../../../services/scheduler/KeyRingScheduler';
import { getProviderAdapter } from '../../../services/providers';
import { Dialog } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';

interface KeyEntry {
  id: string;
  providerId: ProviderType;
  key: string;
  label: string;
  model: string;
  rpm: number;
  createdAt: number;
  isTesting: boolean;
  testStatus?: 'idle' | 'success' | 'failed';
  latencyMs?: number;
  error?: string;
  warning?: string;
}

interface Props {
  open: boolean;
  initialProvider?: ProviderType;
  onClose: () => void;
  onSuccess: (records: ApiKeyRecord[]) => void;
}

export const AddKeyDialog: React.FC<Props> = ({
  open,
  initialProvider = 'gemini',
  onClose,
  onSuccess,
}) => {
  const [providerId, setProviderId] = useState<ProviderType>(initialProvider);
  const [inputKeysText, setInputKeysText] = useState<string>('');
  const [keysList, setKeysList] = useState<KeyEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [availableModels, setAvailableModels] = useState<string[]>(
    PROVIDERS_META[initialProvider].recommendedVisionModels
  );
  const [selectedModel, setSelectedModel] = useState<string>(
    PROVIDERS_META[initialProvider].defaultModelId
  );
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  const [fetchNotice, setFetchNotice] = useState<string | null>(null);

  const currentMeta = PROVIDERS_META[providerId];

  // Reset or switch provider
  const handleProviderSelect = (p: ProviderType) => {
    setProviderId(p);
    const meta = PROVIDERS_META[p];
    setAvailableModels(meta.recommendedVisionModels);
    setSelectedModel(meta.defaultModelId);
    setFetchNotice(null);
  };

  // Pre-load all saved keys from database when dialog opens
  useEffect(() => {
    if (open) {
      getAllApiKeys().then((records) => {
        const loaded: KeyEntry[] = records
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((r) => ({
            id: r.id,
            providerId: r.providerId,
            key: r.key,
            label: r.label,
            model: r.modelId,
            rpm: r.rpmLimit,
            createdAt: r.createdAt,
            isTesting: false,
            testStatus: r.status === 'healthy' ? 'success' : r.status === 'invalid' ? 'failed' : 'idle',
            latencyMs: r.lastLatencyMs,
            error: r.lastError,
          }));
        setKeysList(loaded);
      });
    }
  }, [open]);

  // Automatically detect provider & fetch live models when a key is pasted or entered
  useEffect(() => {
    const rawLines = inputKeysText
      .split('\n')
      .map((k) => k.trim())
      .filter((k) => k.length > 5);

    if (rawLines.length > 0) {
      const first = rawLines[0];
      // Auto-detect provider from prefix
      if (first.startsWith('sk-or-v1-') && providerId !== 'openrouter') {
        handleProviderSelect('openrouter');
        return;
      }
      if (first.startsWith('gsk_') && providerId !== 'groq') {
        handleProviderSelect('groq');
        return;
      }
      if ((first.startsWith('AQ.') || first.startsWith('AIza')) && providerId !== 'gemini') {
        handleProviderSelect('gemini');
        return;
      }

      const timer = setTimeout(() => {
        tryFetchLiveModels(rawLines[0]);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [inputKeysText, providerId]);

  // Dynamically queries the provider's API with the key to discover active models
  const tryFetchLiveModels = async (apiKey: string) => {
    if (!apiKey || apiKey.length < 10) return;
    setIsFetchingModels(true);
    setFetchNotice(null);

    try {
      const adapter = getProviderAdapter(providerId);
      if (adapter.fetchModels) {
        const live = await adapter.fetchModels(apiKey);

        if (live && live.length > 0) {
          let filteredNames: string[] = [];

          if (providerId === 'openrouter') {
            // Priority: verified multimodal vision models
            const visionKeywords = ['gemini', 'vision', 'vl', 'pixtral', 'multimodal'];
            const freeVisionModels = live
              .filter(
                (m) =>
                  (m.id.includes(':free') || m.pricing?.prompt === '0') &&
                  visionKeywords.some((vk) => m.id.toLowerCase().includes(vk))
              )
              .map((m) => m.id);

            filteredNames = freeVisionModels.length > 0 ? freeVisionModels : live.map((m) => m.id);
          } else {
            filteredNames = live.map((m) => m.id);
          }

          if (filteredNames.length > 0) {
            setAvailableModels(filteredNames);
            if (!filteredNames.includes(selectedModel)) {
              setSelectedModel(filteredNames[0]);
            }
            setFetchNotice(`Loaded ${filteredNames.length} active models from your key`);
          }
        }
      }
    } catch {
      // Keep static recommended list if query fails or key is still incomplete
    } finally {
      setIsFetchingModels(false);
    }
  };

  // Instant Add, Real-Time Test & Auto-Save
  const handleAddAndTestKey = async () => {
    const lines = inputKeysText
      .split('\n')
      .map((k) => k.trim())
      .filter((k) => k.length > 5);

    if (lines.length === 0) return;

    setIsProcessing(true);
    const adapter = getProviderAdapter(providerId);
    const newEntries: KeyEntry[] = [];
    const newSavedRecords: ApiKeyRecord[] = [];
    const baseNow = Date.now();

    for (let i = 0; i < lines.length; i++) {
      const rawKey = lines[i];
      const entryId = crypto.randomUUID();
      const itemCreatedAt = baseNow + i;

      try {
        const res = await adapter.testKey(rawKey, selectedModel);

        if (res.success) {
          // Success / Valid: Immediately create and save to database!
          const record = createApiKeyRecord(
            providerId,
            rawKey,
            `${currentMeta.name} #${keysList.filter((k) => k.providerId === providerId).length + i + 1}`,
            selectedModel,
            currentMeta.defaultRpm
          );
          record.createdAt = itemCreatedAt;
          record.status = 'healthy';
          record.lastLatencyMs = res.latencyMs;
          if (res.warning) {
            record.lastError = res.warning;
          }

          await saveApiKey(record);
          newSavedRecords.push(record);

          newEntries.push({
            id: record.id,
            providerId,
            key: rawKey,
            label: record.label,
            model: selectedModel,
            rpm: currentMeta.defaultRpm,
            createdAt: itemCreatedAt,
            isTesting: false,
            testStatus: 'success',
            latencyMs: res.latencyMs,
            warning: res.warning,
          });
        } else {
          // Test failed
          newEntries.push({
            id: entryId,
            providerId,
            key: rawKey,
            label: `${currentMeta.name} (Invalid)`,
            model: selectedModel,
            rpm: currentMeta.defaultRpm,
            createdAt: itemCreatedAt,
            isTesting: false,
            testStatus: 'failed',
            error: res.error || 'Verification failed',
          });
        }
      } catch (err: any) {
        newEntries.push({
          id: entryId,
          providerId,
          key: rawKey,
          label: `${currentMeta.name} (Error)`,
          model: selectedModel,
          rpm: currentMeta.defaultRpm,
          createdAt: itemCreatedAt,
          isTesting: false,
          testStatus: 'failed',
          error: err.message || 'Connection test failed',
        });
      }
    }

    if (newSavedRecords.length > 0) {
      await keyRingScheduler.refreshKeys();
      onSuccess(newSavedRecords);
    }

    setKeysList((prev) => [...prev, ...newEntries]);
    setInputKeysText('');
    setIsProcessing(false);
  };

  const handleTestSingleKey = async (entryId: string) => {
    setKeysList((prev) =>
      prev.map((item) =>
        item.id === entryId ? { ...item, isTesting: true, testStatus: 'idle', error: undefined } : item
      )
    );

    const target = keysList.find((k) => k.id === entryId);
    if (!target) return;

    try {
      const adapter = getProviderAdapter(target.providerId);
      const res = await adapter.testKey(target.key, target.model);

      setKeysList((prev) =>
        prev.map((item) =>
          item.id === entryId
            ? {
                ...item,
                isTesting: false,
                testStatus: res.success ? 'success' : 'failed',
                latencyMs: res.latencyMs,
                error: res.error,
                warning: res.warning,
              }
            : item
        )
      );
    } catch (err: any) {
      setKeysList((prev) =>
        prev.map((item) =>
          item.id === entryId
            ? {
                ...item,
                isTesting: false,
                testStatus: 'failed',
                error: err.message || 'Verification failed',
              }
            : item
        )
      );
    }
  };

  const currentProviderKeys = keysList
    .filter((k) => k.providerId === providerId)
    .sort((a, b) => a.createdAt - b.createdAt);

  const handleTestAllKeys = async () => {
    for (const item of currentProviderKeys) {
      await handleTestSingleKey(item.id);
    }
  };

  const handleRemoveKey = async (id: string) => {
    setKeysList((prev) => prev.filter((k) => k.id !== id));
    await removeApiKey(id);
    await keyRingScheduler.refreshKeys();
  };

  const maskKey = (key: string) => {
    if (key.length <= 10) return '••••••••';
    return `${key.slice(0, 6)}••••${key.slice(-4)}`;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add API Key"
      description="Select provider, paste your key, and click Add. It will be verified and saved automatically."
      className="max-w-2xl"
    >
      <div className="space-y-4 text-xs">
        {/* 1. Provider Select (Clean, no confusing generic RPM labels) */}
        <div className="space-y-1.5">
          <label className="font-medium text-foreground block">AI Provider</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PROVIDER_ORDER.map((pid) => {
              const meta = PROVIDERS_META[pid];
              const isSelected = providerId === pid;
              const count = keysList.filter((k) => k.providerId === pid).length;
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => handleProviderSelect(pid)}
                  className={`p-2.5 rounded-lg border text-left transition cursor-pointer flex flex-col gap-0.5 ${
                    isSelected
                      ? 'border-foreground bg-accent font-medium'
                      : 'border-border bg-card hover:bg-accent/40 text-muted-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-foreground text-xs font-semibold">{meta.name}</span>
                    {count > 0 && (
                      <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-mono">
                        {count}
                      </Badge>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground line-clamp-1">
                    {meta.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Key Input Area with Instant Auto-Verify Button */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="font-medium text-foreground">API Secret Key</label>
            <a
              href={currentMeta.signupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted-foreground hover:text-foreground underline"
            >
              Get free key from {currentMeta.name}
            </a>
          </div>
          <div className="flex gap-2">
            <textarea
              rows={2}
              placeholder="Paste your API key here (or multiple keys, one per line)..."
              value={inputKeysText}
              onChange={(e) => setInputKeysText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleAddAndTestKey();
                }
              }}
              className="flex-1 p-2 text-xs font-mono rounded-md border border-border bg-card text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring resize-none"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleAddAndTestKey}
              disabled={!inputKeysText.trim() || isProcessing}
              className="self-end h-8 gap-1.5 text-xs font-semibold px-3"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Testing & Adding...
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  Add Key
                </>
              )}
            </Button>
          </div>
        </div>

        {/* 3. Vision Model Selector with Official shadcn Select */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="font-medium text-foreground">Vision Model</label>
            {isFetchingModels && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                <Loader2 className="w-2.5 h-2.5 animate-spin" /> Fetching models...
              </span>
            )}
            {fetchNotice && !isFetchingModels && (
              <span className="text-[10px] text-foreground flex items-center gap-1 font-mono">
                <Sparkles className="w-2.5 h-2.5" /> {fetchNotice}
              </span>
            )}
          </div>

          <Select
            value={selectedModel}
            onValueChange={(val) => {
              setSelectedModel(val);
              setKeysList((prev) =>
                prev.map((k) => (k.providerId === providerId ? { ...k, model: val } : k))
              );
            }}
          >
            <SelectTrigger className="h-8 text-xs bg-card">
              <SelectValue placeholder="Select a vision model" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {availableModels.map((m) => {
                const isDefault = m === currentMeta.defaultModelId;
                const isFree =
                  m.includes(':free') ||
                  m.startsWith('openrouter/free') ||
                  m.includes('flash-lite') ||
                  m.includes('qwen');
                const displayName = MODEL_DISPLAY_NAMES[m] || m;

                return (
                  <SelectItem key={m} value={m} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{displayName}</span>
                      {isDefault && (
                        <Badge variant="outline" className="text-[9px] py-0 px-1">
                          Recommended
                        </Badge>
                      )}
                      {isFree && (
                        <Badge variant="secondary" className="text-[9px] py-0 px-1 font-mono">
                          Free
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* 4. Active / Tested Keys List for Selected Provider */}
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground text-xs">
              {currentMeta.name} Keys ({currentProviderKeys.length})
            </span>
            {currentProviderKeys.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestAllKeys}
                className="h-7 text-xs gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Test {currentMeta.name} Keys
              </Button>
            )}
          </div>

          {currentProviderKeys.length > 0 ? (
            <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-lg border border-border p-2 bg-card">
              {currentProviderKeys.map((entry, index) => {
                const isLastAdded =
                  index === currentProviderKeys.length - 1 && currentProviderKeys.length > 1;

                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-md bg-secondary/30 border border-border text-xs"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
                          #{index + 1}
                        </span>
                        <span className="font-mono text-foreground font-semibold">
                          {maskKey(entry.key)}
                        </span>
                        <Badge variant="outline" className="text-[9px] py-0 font-mono">
                          {MODEL_DISPLAY_NAMES[entry.model] || entry.model}
                        </Badge>
                        {isLastAdded && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] py-0 px-1 font-mono text-emerald-400 border border-emerald-500/20"
                          >
                            Last Added
                          </Badge>
                        )}
                      </div>
                    {entry.warning && (
                      <p
                        className="text-[10px] text-amber-400/90 truncate max-w-sm"
                        title={entry.warning}
                      >
                        {entry.warning}
                      </p>
                    )}
                    {entry.error && (
                      <p
                        className="text-[10px] text-destructive truncate max-w-sm"
                        title={entry.error}
                      >
                        {entry.error}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {entry.testStatus === 'success' && !entry.warning && (
                      <Badge
                        variant="outline"
                        className="text-[10px] py-0 gap-1 text-emerald-500 border-emerald-500/30"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        {entry.latencyMs ? `${entry.latencyMs}ms` : 'Healthy'}
                      </Badge>
                    )}

                    {entry.testStatus === 'success' && entry.warning && (
                      <Badge
                        variant="outline"
                        className="text-[10px] py-0 gap-1 text-amber-500 border-amber-500/30"
                        title={entry.warning}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        Valid (Restricted)
                      </Badge>
                    )}

                    {entry.testStatus === 'failed' && (
                      <Badge variant="destructive" className="text-[10px] py-0 gap-1">
                        <AlertCircle className="w-3 h-3" /> Failed
                      </Badge>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTestSingleKey(entry.id)}
                      disabled={entry.isTesting}
                      className="h-6 px-2 text-[10px]"
                    >
                      {entry.isTesting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        'Test'
                      )}
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveKey(entry.id)}
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      title="Remove key"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
            </div>
          ) : (
            <div className="p-4 rounded-lg border border-dashed border-border bg-muted/10 text-center text-xs text-muted-foreground">
              No keys registered for {currentMeta.name} yet. Paste your key above and click &quot;+ Add Key&quot;.
            </div>
          )}
        </div>

        {/* Clean Footer: Redundant "Save Keys" button completely removed! */}
        <div className="flex items-center justify-end pt-2 border-t border-border">
          <Button size="sm" onClick={onClose} className="px-6 font-semibold">
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
