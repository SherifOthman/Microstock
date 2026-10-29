import React, { useState } from 'react';
import { ApiKeyRecord } from '../../../types';
import { getProviderAdapter } from '../../../services/providers';
import { updateApiKey, removeApiKey } from '../../../db';
import { keyRingScheduler } from '../../../services/scheduler/KeyRingScheduler';
import { ConfirmDialog } from '../../../components/ui/alert-dialog';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Play,
  Trash2,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

interface Props {
  keyRecord: ApiKeyRecord;
  index: number;
}

export const KeyRow: React.FC<Props> = ({ keyRecord, index }) => {
  const { t } = useLanguage();
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; msg?: string } | null>(null);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(keyRecord.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleTestKey = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTesting(true);
    setTestResult(null);

    try {
      const adapter = getProviderAdapter(keyRecord.providerId);
      const res = await adapter.testKey(keyRecord.key, keyRecord.modelId);

      const newStatus = res.success
        ? 'healthy'
        : res.statusCode === 429
        ? 'cooling_down'
        : 'invalid';

      const cooldown = res.statusCode === 429 ? Date.now() + 30000 : undefined;

      await updateApiKey(keyRecord.id, {
        status: newStatus,
        lastLatencyMs: res.latencyMs,
        lastError: res.success ? '' : (res.error || 'Verification failed'),
        cooldownUntil: cooldown,
      });

      await keyRingScheduler.refreshKeys();

      setTestResult({
        success: res.success,
        msg: res.success ? `${res.latencyMs}ms` : 'Failed',
      });
    } catch {
      setTestResult({ success: false, msg: 'Error' });
    } finally {
      setIsTesting(false);
      setTimeout(() => setTestResult(null), 4000);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    await removeApiKey(keyRecord.id);
    await keyRingScheduler.refreshKeys();
  };

  const maskedKey = keyRecord.key.includes(':')
    ? (() => {
        const [acc, tok] = keyRecord.key.split(':');
        const maskedAcc = acc.length > 8 ? `${acc.slice(0, 4)}...${acc.slice(-4)}` : acc;
        const maskedTok = tok.length > 10 ? `${tok.slice(0, 5)}•••${tok.slice(-4)}` : '••••••••';
        return `Account: ${maskedAcc} • Token: ${maskedTok}`;
      })()
    : keyRecord.key.length > 10
    ? `${keyRecord.key.slice(0, 7)}•••${keyRecord.key.slice(-4)}`
    : '••••••••';

  return (
    <>
      <div dir="ltr" className="h-9 px-2.5 rounded-md hover:bg-secondary/60 flex items-center justify-between text-xs transition-colors group text-left">
        {/* Left: Key Index + Monospace Masked Key */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-mono text-muted-foreground font-medium shrink-0">
            #{index + 1}
          </span>
          <span className="font-mono text-xs text-foreground truncate">
            {showKey ? keyRecord.key : maskedKey}
          </span>
        </div>

        {/* Right: Latency/Status + Quick Action Icons */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Status / Latency indicator */}
          {testResult ? (
            <span
              className={`text-xs font-mono ${
                testResult.success ? 'text-emerald-500 font-semibold' : 'text-destructive font-semibold'
              }`}
            >
              {testResult.msg}
            </span>
          ) : keyRecord.status === 'healthy' && keyRecord.lastLatencyMs ? (
            <span className="flex items-center gap-1 text-xs font-mono text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>{keyRecord.lastLatencyMs}ms</span>
            </span>
          ) : keyRecord.status === 'healthy' ? (
            <span className="flex items-center gap-1 text-xs font-mono text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>{t.ready}</span>
            </span>
          ) : keyRecord.status === 'cooling_down' ? (
            <span className="flex items-center gap-1 text-xs font-mono text-amber-500">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>{t.cooldown}</span>
            </span>
          ) : keyRecord.status === 'invalid' ? (
            <span className="flex items-center gap-1 text-xs font-mono text-destructive">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
              <span>{t.invalid}</span>
            </span>
          ) : (
            <span className="text-xs font-mono text-muted-foreground">{t.untested}</span>
          )}

          {/* Action Icons (Grouped tightly) */}
          <div className="flex items-center gap-0.5 ml-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowKey(!showKey);
              }}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition cursor-pointer"
              title={showKey ? 'Hide' : 'Reveal'}
            >
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition cursor-pointer"
              title="Copy Key"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={handleTestKey}
              disabled={isTesting}
              className="p-1 rounded text-muted-foreground hover:text-emerald-500 hover:bg-secondary transition cursor-pointer disabled:opacity-30"
              title="Test Key"
            >
              {isTesting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={handleDelete}
              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition cursor-pointer"
              title="Delete Key"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title={t.deleteKeyConfirmTitle}
        description={t.deleteKeyConfirmDesc}
        confirmText={t.delete}
        variant="destructive"
        onConfirm={handleConfirmDelete}
      />
    </>
  );
};
