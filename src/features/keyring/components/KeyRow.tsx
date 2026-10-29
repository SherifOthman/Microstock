import React, { useState } from 'react';
import { ApiKeyRecord } from '../../../types';
import { KeyStatusBadge } from './KeyStatusBadge';
import { ModelSelectDialog } from './ModelSelectDialog';
import { MODEL_DISPLAY_NAMES, PROVIDERS_META } from '../../../constants/providers';
import { getProviderAdapter } from '../../../services/providers';
import { updateApiKey, removeApiKey } from '../../../db';
import { keyRingScheduler } from '../../../services/scheduler/KeyRingScheduler';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { ConfirmDialog } from '../../../components/ui/alert-dialog';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Flame,
  Loader2,
  Play,
  Settings2,
  Trash2,
} from 'lucide-react';

interface Props {
  keyRecord: ApiKeyRecord;
}

export const KeyRow: React.FC<Props> = ({ keyRecord }) => {
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; msg?: string } | null>(null);

  const providerMeta = PROVIDERS_META[keyRecord.providerId];

  const handleCopy = () => {
    navigator.clipboard.writeText(keyRecord.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleTestKey = async () => {
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
    } catch (err: any) {
      setTestResult({ success: false, msg: 'Error' });
    } finally {
      setIsTesting(false);
      setTimeout(() => setTestResult(null), 4000);
    }
  };

  const handleSaveModel = async (newModelId: string) => {
    await updateApiKey(keyRecord.id, { modelId: newModelId });
    await keyRingScheduler.refreshKeys();
  };

  const handleDelete = () => {
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

  const inFlight = keyRecord.activeRequests > 0;
  const recentCalls = keyRecord.requestsInWindow?.length || 0;

  return (
    <>
      <div className="flex items-center justify-between p-2 rounded-lg border border-border bg-card/60 hover:bg-card transition text-xs gap-2">
        {/* Left: Provider Tag & Masked Key */}
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="outline" className="font-mono uppercase text-[10px] shrink-0">
            {keyRecord.providerId.slice(0, 3)}
          </Badge>

          <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[11px] truncate">
            <span className="font-semibold text-foreground truncate">{showKey ? keyRecord.key : maskedKey}</span>
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="hover:text-foreground cursor-pointer p-0.5 shrink-0"
              title={showKey ? 'Hide' : 'Reveal'}
            >
              {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="hover:text-foreground cursor-pointer p-0.5 shrink-0"
              title="Copy"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Right: Status & Actions (No duplicate model name!) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <KeyStatusBadge keyRecord={keyRecord} />

          {testResult && (
            <span
              className={`text-[11px] font-mono mr-0.5 ${
                testResult.success ? 'text-emerald-400' : 'text-destructive'
              }`}
            >
              {testResult.msg}
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleTestKey}
            disabled={isTesting || keyRecord.status === 'disabled'}
            className="h-6 px-2 text-[11px] gap-1 cursor-pointer"
            title="Test key"
          >
            {isTesting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3 text-emerald-400" />
            )}
            Test
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            className="h-6 w-6 text-muted-foreground hover:text-destructive cursor-pointer"
            title="Delete key"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {isModelDialogOpen && (
        <ModelSelectDialog
          keyRecord={keyRecord}
          open={isModelDialogOpen}
          onClose={() => setIsModelDialogOpen(false)}
          onSave={handleSaveModel}
        />
      )}

      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete API Key"
        description={`Are you sure you want to delete "${keyRecord.label}"? Any active rotation using this key will immediately stop.`}
        confirmText="Delete Key"
        variant="destructive"
        onConfirm={handleConfirmDelete}
      />
    </>
  );
};
