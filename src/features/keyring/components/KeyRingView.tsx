import React, { useEffect, useState } from 'react';
import { ApiKeyRecord, ProviderType } from '../../../types';
import { keyRingScheduler } from '../../../services/scheduler/KeyRingScheduler';
import { updateApiKey, removeApiKey } from '../../../db';
import { AddKeyDialog } from './AddKeyDialog';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Tooltip } from '../../../components/ui/tooltip';
import {
  KeyRound,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Activity,
  ShieldAlert,
  Clock,
  CheckCircle2,
  Eye,
  EyeOff,
  Edit3,
  Power,
} from 'lucide-react';
import { ConfirmDialog } from '../../../components/ui/alert-dialog';
import { useLanguage } from '../../../context/LanguageContext';

export const KeyRingView: React.FC = () => {
  const { language } = useLanguage();
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKeyRecord | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [keyToDelete, setKeyToDelete] = useState<ApiKeyRecord | null>(null);

  useEffect(() => {
    const unsub = keyRingScheduler.subscribe((updated) => {
      setKeys([...updated]);
    });
    keyRingScheduler.init();
    return () => unsub();
  }, []);

  const handleToggleVisibility = (id: string) => {
    setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleMovePriority = async (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= keys.length) return;

    const currentKey = keys[index];
    const swapKey = keys[targetIdx];

    await updateApiKey(currentKey.id, { createdAt: swapKey.createdAt });
    await updateApiKey(swapKey.id, { createdAt: currentKey.createdAt });
    await keyRingScheduler.refreshKeys();
  };

  const handleToggleDisable = async (key: ApiKeyRecord) => {
    const newStatus = key.status === 'disabled' ? 'healthy' : 'disabled';
    await updateApiKey(key.id, {
      status: newStatus,
      cooldownUntil: undefined,
    });
    await keyRingScheduler.refreshKeys();
  };

  const handleDeleteConfirm = async () => {
    if (keyToDelete) {
      await removeApiKey(keyToDelete.id);
      await keyRingScheduler.refreshKeys();
      setKeyToDelete(null);
    }
  };

  const getProviderBadge = (provider: ProviderType) => {
    const labels: Record<ProviderType, string> = {
      gemini: 'Google Gemini',
      groq: 'Groq Cloud',
      openrouter: 'OpenRouter',
      mistral: 'Mistral AI',
      cloudflare: 'Cloudflare',
    };
    return (
      <Badge variant="outline" className="text-[10px] font-mono bg-secondary border-border text-foreground">
        {labels[provider] || provider}
      </Badge>
    );
  };

  const getStatusBadge = (key: ApiKeyRecord) => {
    if (key.status === 'healthy') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-medium">
          <CheckCircle2 className="w-3 h-3" /> {language === 'ar' ? 'نشط' : 'Healthy'}
        </span>
      );
    }
    if (key.status === 'cooling_down') {
      const remaining = key.cooldownUntil
        ? Math.max(0, Math.ceil((key.cooldownUntil - Date.now()) / 1000))
        : 0;
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-600 dark:text-amber-400 font-medium">
          <Clock className="w-3 h-3 animate-spin" />{' '}
          {language === 'ar' ? `تهدئة (${remaining}ث)` : `Cooldown (${remaining}s)`}
        </span>
      );
    }
    if (key.status === 'invalid') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-destructive font-medium">
          <ShieldAlert className="w-3 h-3" /> {language === 'ar' ? 'غير صالح' : 'Invalid'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
        {language === 'ar' ? 'معطل' : 'Disabled'}
      </span>
    );
  };

  const maskKey = (raw: string, show: boolean) => {
    if (!raw) return '••••••••';
    if (show) return raw;
    if (raw.length <= 8) return '••••••••';
    return `${raw.slice(0, 6)}••••••••••••${raw.slice(-4)}`;
  };

  const totalHealthyRpm = keys
    .filter((k) => k.status === 'healthy')
    .reduce((acc, k) => acc + k.rpmLimit, 0);

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">
            {language === 'ar'
              ? 'ترتيب أولوية المفاتيح والتبديل التلقائي عند بلوغ حد الطلبات (429).'
              : 'Priority cascade with automatic 429 rate-limit failover across providers.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div dir="ltr" className="px-2.5 py-1 rounded-lg bg-secondary border border-border flex items-center gap-1.5 text-xs font-mono tabular-nums">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span className="text-muted-foreground">RPM:</span>
            <span className="font-semibold text-foreground">{totalHealthyRpm}</span>
          </div>

          <Button
            size="sm"
            onClick={() => {
              setEditingKey(null);
              setIsAddOpen(true);
            }}
            className="gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{language === 'ar' ? 'إضافة مفتاح' : 'Add API Key'}</span>
          </Button>
        </div>
      </div>

      {/* Keys List */}
      {keys.length === 0 ? (
        <div className="p-8 rounded-xl border border-dashed border-border bg-secondary/20 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center mx-auto border border-border">
            <KeyRound className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h3 className="text-xs font-semibold text-foreground">
              {language === 'ar' ? 'لا توجد مفاتيح API مضافة' : 'No API Keys Configured'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {language === 'ar'
                ? 'أضف مفتاح Gemini أو Groq أو Mistral أو OpenRouter لبدء توليد الـ Metadata.'
                : 'Add a Gemini, Groq, Mistral, or OpenRouter key to start generating metadata.'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditingKey(null);
              setIsAddOpen(true);
            }}
            className="gap-1.5 text-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{language === 'ar' ? 'إضافة أول مفتاح' : 'Add First Key'}</span>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((key, idx) => (
            <div
              key={key.id}
              className={`p-3 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                key.status === 'disabled'
                  ? 'border-border/60 bg-secondary/20 opacity-60'
                  : 'border-border bg-secondary/40 hover:border-primary/40'
              }`}
            >
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="flex flex-col items-center gap-0.5 bg-background border border-border rounded-lg p-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleMovePriority(idx, 'up')}
                    disabled={idx === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-0.5 cursor-pointer"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <span dir="ltr" className="text-[10px] font-mono font-bold text-primary px-1 tabular-nums">
                    #{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleMovePriority(idx, 'down')}
                    disabled={idx === keys.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-0.5 cursor-pointer"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>

                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-xs text-foreground truncate">{key.label}</span>
                    {getProviderBadge(key.providerId)}
                    <span dir="ltr" className="text-[11px] font-mono text-muted-foreground">{key.modelId}</span>
                    {getStatusBadge(key)}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground font-mono tabular-nums">
                    <span dir="ltr" className="flex items-center gap-1">
                      <span>{maskKey(key.key, !!visibleKeys[key.id])}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleVisibility(key.id)}
                        className="text-muted-foreground hover:text-foreground ml-1 cursor-pointer"
                      >
                        {visibleKeys[key.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                    </span>
                    <span>·</span>
                    <span dir="ltr">{key.rpmLimit} RPM</span>
                    <span>·</span>
                    <span>
                      {key.dailyRequestCount || 0} {language === 'ar' ? 'طلب' : 'reqs'}
                    </span>
                  </div>

                  {key.lastError && (
                    <p dir="ltr" className="text-[11px] text-destructive truncate max-w-md font-mono text-start">
                      {key.lastError}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                <Tooltip content={language === 'ar' ? 'تعديل المفتاح' : 'Edit key'}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditingKey(key);
                      setIsAddOpen(true);
                    }}
                    className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </Button>
                </Tooltip>
                <Tooltip
                  content={
                    key.status === 'disabled'
                      ? language === 'ar'
                        ? 'تفعيل المفتاح'
                        : 'Enable'
                      : language === 'ar'
                      ? 'تعطيل المفتاح'
                      : 'Disable'
                  }
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggleDisable(key)}
                    className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Power className="w-3.5 h-3.5" />
                  </Button>
                </Tooltip>
                <Tooltip content={language === 'ar' ? 'حذف المفتاح' : 'Delete key'}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setKeyToDelete(key)}
                    className="h-7 w-7 text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddKeyDialog
        open={isAddOpen}
        onClose={() => {
          setIsAddOpen(false);
          setEditingKey(null);
        }}
        onKeyAdded={() => keyRingScheduler.refreshKeys()}
        editKey={editingKey}
      />

      <ConfirmDialog
        open={!!keyToDelete}
        onOpenChange={(open) => !open && setKeyToDelete(null)}
        title={language === 'ar' ? 'حذف مفتاح API' : 'Delete API Key'}
        description={
          language === 'ar'
            ? `هل تريد حذف المفتاح "${keyToDelete?.label}"؟`
            : `Remove "${keyToDelete?.label}" from KeyRing?`
        }
        confirmText={language === 'ar' ? 'حذف' : 'Delete'}
        variant="destructive"
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
};
