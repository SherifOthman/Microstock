import React, { useEffect, useState } from 'react';
import { ApiKeyRecord, AppSettings, ProviderType } from '../../../types';
import { KeyRow } from './KeyRow';
import { AddKeyDialog } from './AddKeyDialog';
import { PriorityCascadeCard } from './PriorityCascadeCard';
import { MODEL_DISPLAY_NAMES, PROVIDERS_META, PROVIDER_ORDER } from '../../../constants/providers';
import {
  getAllApiKeys,
  getAppSettings,
  updateApiKey,
} from '../../../db';
import { keyRingScheduler } from '../../../services/scheduler/KeyRingScheduler';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import {
  KeyRound,
  Play,
  Plus,
} from 'lucide-react';

export const KeyRingView: React.FC = () => {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [selectedProviderFilter, setSelectedProviderFilter] = useState<string>('all');
  const [isAddKeyDialogOpen, setIsAddKeyDialogOpen] = useState<boolean>(false);
  const [bulkProviderTarget, setBulkProviderTarget] = useState<ProviderType>('gemini');
  const [isTestingAll, setIsTestingAll] = useState<boolean>(false);
  const [testProgress, setTestProgress] = useState<{ tested: number; total: number } | null>(null);

  useEffect(() => {
    getAppSettings().then(setSettings);
    const unsubscribe = keyRingScheduler.subscribe((updated) => setKeys([...updated]));
    keyRingScheduler.init();

    // Auto-migrate any legacy/deprecated model names to active gemini-3.1-flash-lite
    getAllApiKeys().then(async (allKeys) => {
      let migrated = false;
      for (const k of allKeys) {
        if (
          k.providerId === 'gemini' &&
          (k.modelId.includes('1.5') || k.modelId.includes('2.5') || k.modelId === 'gemini-3.8-flash')
        ) {
          await updateApiKey(k.id, {
            modelId: 'gemini-3.1-flash-lite',
            status: 'healthy',
            lastError: undefined,
          });
          migrated = true;
        }
      }
      if (migrated) {
        keyRingScheduler.refreshKeys();
      }
    });

    return () => unsubscribe();
  }, []);

  const handleTestAllKeys = async () => {
    setIsTestingAll(true);
    try {
      await keyRingScheduler.testAllKeys();
    } finally {
      setIsTestingAll(false);
    }
  };

  const displayedKeys = (
    selectedProviderFilter === 'all'
      ? keys
      : keys.filter((k) => k.providerId === selectedProviderFilter)
  )
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);

  return (
    <div className="space-y-4">
      {/* Interactive Drag & Drop Priority Cascade Configuration */}
      <PriorityCascadeCard
        settings={settings}
        keys={keys}
        onSettingsUpdate={(updated) => setSettings(updated)}
        onAddKey={(p) => {
          setBulkProviderTarget(p);
          setIsAddKeyDialogOpen(true);
        }}
        onFilterProvider={(p) => setSelectedProviderFilter(p)}
      />

      {/* Toolbar: Provider Filter Tabs & Add Key */}
      <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedProviderFilter('all')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer shrink-0 ${
              selectedProviderFilter === 'all'
                ? 'bg-accent text-accent-foreground border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All ({keys.length})
          </button>

          {PROVIDER_ORDER.map((pid) => {
            const count = keys.filter((k) => k.providerId === pid).length;
            const isSelected = selectedProviderFilter === pid;
            return (
              <button
                key={pid}
                type="button"
                onClick={() => setSelectedProviderFilter(pid)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  isSelected
                    ? 'bg-accent text-accent-foreground border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>{PROVIDERS_META[pid].name}</span>
                {count > 0 && (
                  <Badge variant="secondary" className="px-1 py-0 text-[10px] font-mono">
                    {count}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {keys.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestAllKeys}
              disabled={isTestingAll}
              className="h-7 text-xs gap-1 px-2.5"
              title="Test all keys"
            >
              <Play className="w-3 h-3 text-emerald-400" />
              <span>{isTestingAll ? 'Testing...' : 'Test All'}</span>
            </Button>
          )}

          <Button
            size="sm"
            onClick={() => {
              setBulkProviderTarget(
                selectedProviderFilter === 'all' ? 'gemini' : (selectedProviderFilter as ProviderType)
              );
              setIsAddKeyDialogOpen(true);
            }}
            className="h-7 gap-1 text-xs font-semibold px-3"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Key
          </Button>
        </div>
      </div>

      {/* Key Rows List */}
      <div className="space-y-1.5">
        {displayedKeys.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-border bg-card/40 text-center text-muted-foreground text-xs space-y-2">
            <KeyRound className="w-6 h-6 mx-auto text-muted-foreground/60" />
            <p className="font-medium text-foreground">No API keys registered</p>
            <p>Add a free Gemini, OpenRouter, Groq, or Cloudflare key to start generating metadata.</p>
            <Button
              size="sm"
              onClick={() => {
                setBulkProviderTarget(
                  selectedProviderFilter === 'all' ? 'gemini' : (selectedProviderFilter as ProviderType)
                );
                setIsAddKeyDialogOpen(true);
              }}
              className="mt-1 h-7 text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Key
            </Button>
          </div>
        ) : (
          displayedKeys.map((keyRecord) => <KeyRow key={keyRecord.id} keyRecord={keyRecord} />)
        )}
      </div>

      {/* Add Keys & Verification Dialog */}
      <AddKeyDialog
        open={isAddKeyDialogOpen}
        initialProvider={bulkProviderTarget}
        onClose={() => setIsAddKeyDialogOpen(false)}
        onSuccess={() => {
          keyRingScheduler.refreshKeys();
        }}
      />
    </div>
  );
};
