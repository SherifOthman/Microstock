import React, { useEffect, useState } from 'react';
import { ApiKeyRecord, AppSettings, ProviderType } from '../../../types';
import { KeyRow } from './KeyRow';
import { AddKeyDialog } from './AddKeyDialog';
import { PriorityCascadeCard } from './PriorityCascadeCard';
import { MODEL_DISPLAY_NAMES, PROVIDERS_META, PROVIDER_ORDER } from '../../../constants/providers';
import {
  exportKeyRingBackup,
  getAllApiKeys,
  getAppSettings,
  importKeyRingBackup,
  resetAllKeyCooldowns,
  saveAppSettings,
  updateApiKey,
} from '../../../db';
import { keyRingScheduler } from '../../../services/scheduler/KeyRingScheduler';
import { Tooltip } from '../../../components/ui/tooltip';
import { Card, CardContent } from '../../../components/ui/card';
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
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  KeyRound,
  Layers,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Upload,
  Zap,
} from 'lucide-react';

export const KeyRingView: React.FC = () => {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [selectedProviderFilter, setSelectedProviderFilter] = useState<string>('all');
  const [isAddKeyDialogOpen, setIsAddKeyDialogOpen] = useState<boolean>(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState<boolean>(false);
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

  const handleStrategyChange = async (strategy: 'interleaved' | 'priority_tiered') => {
    if (!settings) return;
    const updated = await saveAppSettings({ routingStrategy: strategy });
    setSettings(updated);
  };

  const handleResetCooldowns = async () => {
    await resetAllKeyCooldowns();
    await keyRingScheduler.resetAllCooldowns();
  };

  const handleTestAllKeys = async () => {
    setIsTestingAll(true);
    setTestProgress({ tested: 0, total: keys.length });
    try {
      await keyRingScheduler.testAllKeys((tested, total) => {
        setTestProgress({ tested, total });
      });
    } finally {
      setIsTestingAll(false);
      setTestProgress(null);
    }
  };

  const handleExportBackup = async () => {
    const json = await exportKeyRingBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keyring-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      await importKeyRingBackup(text);
      await keyRingScheduler.refreshKeys();
      const updatedSettings = await getAppSettings();
      setSettings(updatedSettings);
    };
    input.click();
  };

  const healthyCount = keys.filter((k) => k.status === 'healthy').length;
  const coolingCount = keys.filter((k) => k.status === 'cooling_down').length;
  const combinedRpm = keys
    .filter((k) => k.status === 'healthy')
    .reduce((sum, k) => sum + (k.rpmLimit || 0), 0);
  const inFlightCount = keys.reduce((sum, k) => sum + (k.activeRequests || 0), 0);

  const displayedKeys = (
    selectedProviderFilter === 'all'
      ? keys
      : keys.filter((k) => k.providerId === selectedProviderFilter)
  )
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);

  return (
    <div className="space-y-4">
      {/* 4-Card KPI Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Keys</p>
              <p className="text-2xl font-bold font-mono mt-1 text-foreground">{keys.length}</p>
            </div>
            <KeyRound className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Healthy & Ready</p>
              <p className="text-2xl font-bold font-mono mt-1 text-emerald-400">{healthyCount}</p>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-400/80" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Ready Keys</p>
              <p className="text-2xl font-bold font-mono mt-1 text-amber-400">
                {healthyCount} <span className="text-xs font-normal text-muted-foreground">/ {keys.length}</span>
              </p>
            </div>
            <Zap className="w-5 h-5 text-amber-400/80" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">In-Flight / Cooldown</p>
              <p className="text-2xl font-bold font-mono mt-1 text-foreground">
                {inFlightCount} <span className="text-xs font-normal text-muted-foreground">/ {coolingCount}</span>
              </p>
            </div>
            <Clock className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      {/* Strategy Selector & Actions Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-card rounded-xl border border-border">
        {/* Strategy Buttons */}
        <div className="flex items-center gap-1 bg-background p-1 rounded-lg border border-border">
          <Tooltip content="Parallel Round-Robin: Rotates requests evenly across all active keys (e.g. 3 keys × 15 RPM = 45 RPM combined capacity).">
            <button
              type="button"
              onClick={() => handleStrategyChange('interleaved')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                settings?.routingStrategy === 'interleaved'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Interleaved (Parallel)
            </button>
          </Tooltip>
          <Tooltip content="Priority Tiered: Pours all requests into your primary key first; only switches to backup keys when rate limit (429) is reached.">
            <button
              type="button"
              onClick={() => handleStrategyChange('priority_tiered')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                settings?.routingStrategy === 'priority_tiered'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Priority Tiered
            </button>
          </Tooltip>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestAllKeys}
            disabled={isTestingAll || keys.length === 0}
            className="gap-1 text-xs"
          >
            {isTestingAll ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 text-emerald-400" />
            )}
            {testProgress ? `Testing (${testProgress.tested}/${testProgress.total})` : 'Test All'}
          </Button>

          <Button variant="outline" size="sm" onClick={handleResetCooldowns} className="gap-1 text-xs">
            <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
            Reset Cooldowns
          </Button>

          <Button variant="ghost" size="sm" onClick={handleExportBackup} className="gap-1 text-xs" title="Export Backup">
            <Download className="w-3.5 h-3.5" />
          </Button>

          <Button variant="ghost" size="sm" onClick={handleImportBackup} className="gap-1 text-xs" title="Restore Backup">
            <Upload className="w-3.5 h-3.5" />
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setBulkProviderTarget(selectedProviderFilter === 'all' ? 'gemini' : (selectedProviderFilter as ProviderType));
              setIsAddKeyDialogOpen(true);
            }}
            className="gap-1.5 text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Keys
          </Button>
        </div>
      </div>

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

      {/* Provider Filter Tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setSelectedProviderFilter('all')}
          className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer shrink-0 ${
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
              className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                isSelected
                  ? 'bg-accent text-accent-foreground border border-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{PROVIDERS_META[pid].name}</span>
              <Badge variant="secondary" className="px-1 py-0 text-[10px] font-mono">
                {count}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Key Rows List */}
      <div className="space-y-2">
        {displayedKeys.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground text-xs space-y-2">
              <KeyRound className="w-8 h-8 mx-auto text-muted-foreground/60" />
              <p className="font-medium text-foreground">No API keys registered</p>
              <p>Add your free Gemini, OpenRouter, or Groq API keys to start processing.</p>
              <Button
                size="sm"
                onClick={() => {
                  setBulkProviderTarget(selectedProviderFilter === 'all' ? 'gemini' : (selectedProviderFilter as ProviderType));
                  setIsAddKeyDialogOpen(true);
                }}
                className="mt-2"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Keys
              </Button>
            </CardContent>
          </Card>
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
