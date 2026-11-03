import React, { useEffect, useState } from 'react';
import { ApiKeyRecord, ProviderType } from '../../../types';
import { PROVIDERS_META, PROVIDER_ORDER, MODEL_DISPLAY_NAMES } from '../../../constants/providers';
import { keyRingScheduler, RoutingStrategy } from '../../../services/scheduler/KeyRingScheduler';
import { updateApiKey, removeApiKey } from '../../../db';
import { decryptSecret } from '../../../services/desktop/secureStorage';
import { AddKeyDialog } from './AddKeyDialog';
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
  RotateCcw,
  Copy,
  Check,
  Shuffle,
  Info,
  GripVertical,
} from 'lucide-react';
import { ConfirmDialog } from '../../../components/ui/alert-dialog';
import { useLanguage } from '../../../context/LanguageContext';

export const KeyRingView: React.FC = () => {
  const { language } = useLanguage();
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [decryptedMap, setDecryptedMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<ProviderType>('gemini');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKeyRecord | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [keyToDelete, setKeyToDelete] = useState<ApiKeyRecord | null>(null);
  const [routingMode, setRoutingMode] = useState<RoutingStrategy>(
    keyRingScheduler.getRoutingMode()
  );

  useEffect(() => {
    const unsub = keyRingScheduler.subscribe((updated) => {
      setKeys([...updated]);
      setRoutingMode(keyRingScheduler.getRoutingMode());
    });
    keyRingScheduler.init();
    return () => unsub();
  }, []);

  // Ensure every key is decrypted for normal readable display (never show enc:76...)
  useEffect(() => {
    let mounted = true;
    const decryptAll = async () => {
      const nextMap: Record<string, string> = {};
      for (const k of keys) {
        nextMap[k.id] = await decryptSecret(k.key);
      }
      if (mounted) {
        setDecryptedMap(nextMap);
      }
    };
    decryptAll();
    return () => {
      mounted = false;
    };
  }, [keys]);

  const handleToggleMask = (id: string) => {
    setRevealedKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyKey = async (id: string, rawKey: string) => {
    try {
      await navigator.clipboard.writeText(rawKey);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch {
      // Ignore clipboard permission errors in test env
    }
  };

  const providerKeys = keys.filter((k) => k.providerId === activeTab);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIndex) {
      setDraggedIdx(null);
      return;
    }

    const reordered = [...providerKeys];
    const [moved] = reordered.splice(draggedIdx, 1);
    reordered.splice(targetIndex, 0, moved);

    const baseTime = Date.now() - reordered.length * 1000;
    for (let i = 0; i < reordered.length; i++) {
      await updateApiKey(reordered[i].id, { createdAt: baseTime + i * 1000 });
    }
    await keyRingScheduler.refreshKeys();
    setDraggedIdx(null);
  };

  const handleToggleDisable = async (key: ApiKeyRecord) => {
    const newStatus = key.status === 'disabled' ? 'healthy' : 'disabled';
    await updateApiKey(key.id, {
      status: newStatus,
      cooldownUntil: undefined,
      lastError: undefined,
    });
    await keyRingScheduler.refreshKeys();
  };

  const handleResetAllCooldowns = async () => {
    await keyRingScheduler.resetAllCooldowns();
  };

  const handleToggleRoutingMode = () => {
    const nextMode: RoutingStrategy =
      routingMode === 'priority' ? 'round_robin' : 'priority';
    keyRingScheduler.setRoutingMode(nextMode);
    setRoutingMode(nextMode);
  };

  const handleProviderModelChange = async (newModelId: string) => {
    await keyRingScheduler.updateProviderModel(activeTab, newModelId);
  };

  const handleDeleteConfirm = async () => {
    if (keyToDelete) {
      await removeApiKey(keyToDelete.id);
      await keyRingScheduler.refreshKeys();
      setKeyToDelete(null);
    }
  };

  const getProviderShortName = (provider: ProviderType) => {
    const labels: Record<ProviderType, string> = {
      gemini: 'Google Gemini',
      openrouter: 'OpenRouter',
      groq: 'Groq',
      mistral: 'Mistral',
      cloudflare: 'Cloudflare',
    };
    return labels[provider] || provider;
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

  const formatNormalKey = (key: ApiKeyRecord) => {
    const plain = decryptedMap[key.id] ?? key.key ?? '';
    if (!plain) return '••••••••';
    // Default masked for privacy as requested by the user; allow revealing via Eye toggle
    const isRevealed = !!revealedKeys[key.id];
    if (isRevealed) return plain;
    if (plain.length <= 8) return '••••••••';
    return `${plain.slice(0, 6)}••••••••••••${plain.slice(-4)}`;
  };

  const totalHealthyRpm = keys
    .filter((k) => k.status === 'healthy')
    .reduce((acc, k) => acc + k.rpmLimit, 0);

  const hasCoolingKeys = keys.some((k) => k.status === 'cooling_down' || !!k.lastError);
  const activeProviderMeta = PROVIDERS_META[activeTab];
  const activeProviderModel =
    providerKeys[0]?.modelId || activeProviderMeta.defaultModelId;

  return (
    <div className="space-y-4">
      {/* Top Summary & Global Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Tooltip
            content={
              language === 'ar'
                ? 'التبديل التلقائي بين المفاتيح والمزودين (Gemini → OpenRouter → Groq → Mistral → Cloudflare) عند ضغط الخدمة أو انتهاء الحد.'
                : 'Automatic multi-provider rotation (Gemini → OpenRouter → Groq → Mistral → Cloudflare) on 429/503 or timeouts.'
            }
          >
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary/60 border border-border text-xs text-muted-foreground hover:text-foreground cursor-help transition">
              <Info className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>{language === 'ar' ? 'تدوير تلقائي متعدد المزودين' : 'Multi-Provider Failover Active'}</span>
            </div>
          </Tooltip>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleToggleRoutingMode}
            title={
              language === 'ar'
                ? 'تغيير نظام التوزيع بين المفاتيح'
                : 'Switch key rotation strategy'
            }
            className="px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 border border-border flex items-center gap-1.5 text-xs font-mono cursor-pointer transition"
          >
            <Shuffle className="w-3.5 h-3.5 text-primary" />
            <span>
              {routingMode === 'round_robin'
                ? language === 'ar'
                  ? 'توزيع بالتساوي (Round-Robin)'
                  : 'Round-Robin All'
                : language === 'ar'
                ? 'تتابع أولوية (Cascade)'
                : 'Priority Cascade'}
            </span>
          </button>

          {hasCoolingKeys && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetAllCooldowns}
              className="h-7 gap-1 text-xs cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{language === 'ar' ? 'إعادة تفعيل الكل' : 'Reset Cooldowns'}</span>
            </Button>
          )}

          <div
            dir="ltr"
            className="px-2.5 py-1 rounded-lg bg-secondary border border-border flex items-center gap-1.5 text-xs font-mono tabular-nums"
          >
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

      {/* Provider Tabs Navigation */}
      <div
        role="tablist"
        aria-label="AI Providers"
        className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border"
      >
        {PROVIDER_ORDER.map((providerId) => {
          const pKeys = keys.filter((k) => k.providerId === providerId);
          const healthyCount = pKeys.filter((k) => k.status === 'healthy').length;
          const coolingCount = pKeys.filter((k) => k.status === 'cooling_down').length;
          const isSelected = activeTab === providerId;

          let dotColor = 'bg-muted-foreground/40';
          if (healthyCount > 0) dotColor = 'bg-emerald-500';
          else if (coolingCount > 0) dotColor = 'bg-amber-500';
          else if (pKeys.length > 0) dotColor = 'bg-destructive';

          return (
            <button
              key={providerId}
              role="tab"
              type="button"
              aria-selected={isSelected}
              onClick={() => setActiveTab(providerId)}
              className={`px-3 py-2 rounded-t-lg border-b-2 text-xs font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                isSelected
                  ? 'border-primary text-foreground bg-secondary/60'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/30'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${dotColor}`} />
              <span>{getProviderShortName(providerId)}</span>
              <Badge
                variant="outline"
                className={`text-[10px] font-mono px-1.5 py-0 h-4 ${
                  isSelected
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : 'bg-secondary text-muted-foreground border-border'
                }`}
              >
                {pKeys.length}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Active Provider Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-xl bg-secondary/30 border border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">
            {activeProviderMeta.name}
          </span>
          <Badge variant="outline" className="text-[10px] font-mono">
            {providerKeys.length}{' '}
            {language === 'ar'
              ? 'مفتاح'
              : providerKeys.length === 1
              ? 'Key'
              : 'Keys'}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {providerKeys.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                {language === 'ar' ? 'نموذج المزود:' : 'Model:'}
              </span>
              <Select
                value={activeProviderModel}
                onValueChange={handleProviderModelChange}
              >
                <SelectTrigger className="h-7 text-[11px] font-mono w-48 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-60">
                  {Array.from(
                    new Set([
                      ...activeProviderMeta.recommendedVisionModels,
                      activeProviderModel,
                    ])
                  ).map((m) => (
                    <SelectItem key={m} value={m} className="font-mono text-xs">
                      {MODEL_DISPLAY_NAMES[m] || m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditingKey(null);
              setIsAddOpen(true);
            }}
            className="h-7 gap-1 text-xs cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>
              {language === 'ar'
                ? `إضافة مفتاح ${getProviderShortName(activeTab)}`
                : `Add ${getProviderShortName(activeTab)} Key`}
            </span>
          </Button>
        </div>
      </div>

      {/* Keys List for Active Provider Tab */}
      {providerKeys.length === 0 ? (
        <div className="p-8 rounded-xl border border-dashed border-border bg-secondary/20 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center mx-auto border border-border">
            <KeyRound className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h3 className="text-xs font-semibold text-foreground">
              {language === 'ar'
                ? `لا توجد مفاتيح مضافة لـ ${activeProviderMeta.name}`
                : `No ${activeProviderMeta.name} Keys Configured`}
            </h3>
            <p className="text-xs text-muted-foreground">
              {language === 'ar'
                ? `أضف مفتاح ${activeProviderMeta.name} لاستخدامه تلقائياً في توليد الـ Metadata والتبديل الاحتياطي.`
                : `Add a ${activeProviderMeta.name} API key to enable automatic failover and metadata generation.`}
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
            <span>
              {language === 'ar'
                ? `إضافة مفتاح ${getProviderShortName(activeTab)}`
                : `Add ${getProviderShortName(activeTab)} Key`}
            </span>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {providerKeys.map((key, idx) => {
            const plainKey = decryptedMap[key.id] ?? key.key ?? '';
            const isRevealed = !!revealedKeys[key.id];
            return (
              <div
                key={key.id}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, idx)}
                className={`p-3 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  draggedIdx === idx ? 'opacity-40 border-primary border-dashed' : ''
                } ${
                  key.status === 'disabled'
                    ? 'border-border/60 bg-secondary/20 opacity-60'
                    : 'border-border bg-secondary/40 hover:border-primary/40'
                }`}
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                  <div
                    className="flex items-center gap-1 bg-background border border-border rounded-md px-1.5 py-1 shrink-0 cursor-grab active:cursor-grabbing hover:border-primary/60 transition"
                    title={language === 'ar' ? 'اسحب لإعادة الترتيب' : 'Drag to reorder priority'}
                  >
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                    <span
                      dir="ltr"
                      className="text-[10px] font-mono font-bold text-primary tabular-nums"
                    >
                      #{idx + 1}
                    </span>
                  </div>

                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-xs text-foreground truncate">
                        {key.label}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono bg-secondary border-border text-foreground"
                      >
                        {getProviderShortName(key.providerId)}
                      </Badge>
                      <span
                        dir="ltr"
                        className="text-[11px] font-mono text-muted-foreground"
                      >
                        {key.modelId}
                      </span>
                      {getStatusBadge(key)}
                    </div>

                    {/* Masked / Readable API Key Box */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground font-mono tabular-nums">
                      <div
                        dir="ltr"
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-background/80 border border-border/80 text-foreground max-w-full"
                      >
                        <span className="select-all break-all font-mono text-[11px]">
                          {formatNormalKey(key)}
                        </span>
                        <button
                          type="button"
                          title={isRevealed ? (language === 'ar' ? 'إخفاء المفتاح' : 'Mask key') : (language === 'ar' ? 'إظهار المفتاح' : 'Show full key')}
                          onClick={() => handleToggleMask(key.id)}
                          className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                        >
                          {isRevealed ? (
                            <EyeOff className="w-3 h-3" />
                          ) : (
                            <Eye className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          title="Copy API key"
                          onClick={() => handleCopyKey(key.id, plainKey)}
                          className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                        >
                          {copiedId === key.id ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      <span>·</span>
                      <span dir="ltr">{key.rpmLimit} RPM</span>
                      <span>·</span>
                      <span>
                        {key.dailyRequestCount || 0}{' '}
                        {language === 'ar' ? 'طلب' : 'reqs'}
                      </span>
                    </div>

                    {key.lastError && (
                      <p
                        dir="ltr"
                        className="text-[11px] text-destructive truncate max-w-xl font-mono text-start"
                      >
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
            );
          })}
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
        defaultProvider={activeTab}
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

