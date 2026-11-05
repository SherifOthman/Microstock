import React, { useEffect, useRef, useState } from 'react';
import { db, useSqliteQuery } from '../../db';
import {
  DreamstimeRemoteFolder,
  formatBytes,
  formatEtaSeconds,
  formatTransferSpeed,
  FtpExecutionMode,
  FtpProtocolType,
  FtpQueueItem,
  FtpTelemetryFrame,
} from '../../services/ftp/dreamstimeFtpRouter';
import { dreamstimeFtpService } from '../../services/ftp/ftpClientService';
import { Progress } from '../../components/ui/progress';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { getPlatformLogo } from '../../components/icons/StockLogos';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  FileImage,
  FileVideo,
  FolderGit2,
  Layers,
  Lock,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Server,
  Sparkles,
  Square,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

type QueueSubTab = 'all' | 'succeeded' | 'failed';

function getRemoteFolderBadgeStyle(folder: DreamstimeRemoteFolder): string {
  switch (folder) {
    case '/additional':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case '/video':
      return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    case '/':
    default:
      return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
  }
}

function getMediaIcon(mediaType: FtpQueueItem['mediaType']) {
  if (mediaType === 'vector') return <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  if (mediaType === 'video') return <FileVideo className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
  return <FileImage className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
}

export const FtpUploaderView: React.FC = () => {
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [queue, setQueue] = useState<FtpQueueItem[]>(() => dreamstimeFtpService.getQueue());
  const [telemetry, setTelemetry] = useState<FtpTelemetryFrame>(() =>
    dreamstimeFtpService.getTelemetry()
  );
  const [mode, setMode] = useState<FtpExecutionMode>(() => dreamstimeFtpService.getMode());
  const [activeSubTab, setActiveSubTab] = useState<QueueSubTab>('all');
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const storedProfile = useSqliteQuery(() => db.ftp.getProfile('dreamstime'), [], undefined);

  // Credential Form State
  const [protocol, setProtocol] = useState<FtpProtocolType>('ftps');
  const [host, setHost] = useState('ftp.dreamstime.com');
  const [port, setPort] = useState(21);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<{
    type: 'idle' | 'saving' | 'testing' | 'ok' | 'error';
    message?: string;
  }>({ type: 'idle' });

  useEffect(() => {
    const sync = () => {
      setQueue([...dreamstimeFtpService.getQueue()]);
      setTelemetry({ ...dreamstimeFtpService.getTelemetry() });
      setMode(dreamstimeFtpService.getMode());
    };
    const unsub = dreamstimeFtpService.subscribe(sync);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (storedProfile) {
      setProtocol(storedProfile.protocol || 'ftps');
      setHost(storedProfile.host || 'ftp.dreamstime.com');
      setPort(storedProfile.port || 21);
      if (storedProfile.username) {
        setUsername(storedProfile.username);
      }
    }
  }, [storedProfile?.updatedAt]);

  const handleSaveCredentials = async () => {
    setVaultStatus({ type: 'saving', message: 'Saving encrypted credentials...' });
    try {
      await dreamstimeFtpService.saveDreamstimeCredentials({
        protocol,
        host: host.trim() || 'ftp.dreamstime.com',
        port: Number(port) || 21,
        username: username.trim(),
        password: password || undefined,
        passiveMode: true,
      });
      setPassword('');
      setVaultStatus({ type: 'ok', message: 'Saved to Secure Vault' });
    } catch (err: any) {
      setVaultStatus({
        type: 'error',
        message: err?.message || 'Failed to save credentials',
      });
    }
  };

  const handleTestConnection = async () => {
    setVaultStatus({ type: 'testing', message: 'Testing connection...' });
    try {
      const res = await dreamstimeFtpService.testDreamstimeConnection({
        protocol,
        host: host.trim() || 'ftp.dreamstime.com',
        port: Number(port) || 21,
        username: username.trim() || 'dreamstime_contributor',
        password: password || undefined,
        mode,
      });
      if (res.success) {
        setPassword('');
        setVaultStatus({
          type: 'ok',
          message: `Connected (${res.latencyMs || 42}ms)`,
        });
      } else {
        setVaultStatus({
          type: 'error',
          message: res.error || 'Connection failed',
        });
      }
    } catch (err: any) {
      setVaultStatus({
        type: 'error',
        message: err?.message || 'Connection error',
      });
    }
  };

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    dreamstimeFtpService.addFiles(Array.from(fileList));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      dreamstimeFtpService.addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const rootCount = queue.filter((i) => i.remoteFolder === '/').length;
  const vectorCount = queue.filter((i) => i.remoteFolder === '/additional').length;
  const videoCount = queue.filter((i) => i.remoteFolder === '/video').length;

  const succeededItems = queue.filter((i) => i.status === 'succeeded');
  const failedItems = queue.filter((i) => i.status === 'failed');
  const queuedItems = queue.filter((i) => i.status === 'queued');

  const visibleQueue =
    activeSubTab === 'succeeded'
      ? succeededItems
      : activeSubTab === 'failed'
      ? failedItems
      : queue;

  return (
    <div
      data-testid="ftp-uploader-view"
      className="flex-1 min-h-0 h-full flex flex-col gap-3 overflow-hidden select-none"
    >
      {/* Minimalist Top Bar */}
      <div className="shrink-0 h-11 px-4 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {getPlatformLogo('dreamstime', 18)}
          <h1 className="text-sm font-bold tracking-tight text-foreground">
            {language === 'ar' ? 'رافع Dreamstime FTP' : 'Dreamstime FTP Uploader'}
          </h1>
        </div>

        <div
          dir="ltr"
          className="inline-flex items-center rounded-lg bg-secondary p-0.5 border border-border text-xs"
        >
          <button
            type="button"
            disabled={telemetry.isRunning}
            onClick={() => dreamstimeFtpService.setMode('dry_run')}
            className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              mode === 'dry_run'
                ? 'bg-card text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Dry-Run Test
          </button>
          <button
            type="button"
            disabled={telemetry.isRunning}
            onClick={() => dreamstimeFtpService.setMode('live')}
            className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              mode === 'live'
                ? 'bg-card text-emerald-400 shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Live FTPS
          </button>
        </div>
      </div>

      {/* Main 2-Column Minimalist Layout */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 overflow-hidden">
        {/* Left Sidebar: Credentials + Smart Folder Routing */}
        <div className="lg:col-span-4 xl:col-span-3 min-h-0 flex flex-col gap-3 overflow-y-auto">
          {/* 1. Dreamstime Credentials */}
          <div className="p-3.5 rounded-xl border border-border bg-card space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-primary" />
                <span>FTP Credentials</span>
              </span>
              {storedProfile?.hasSavedPassword && (
                <span className="text-[11px] text-emerald-400 font-medium">Encrypted</span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1.5" dir="ltr">
              <div className="col-span-2 space-y-1">
                <label className="text-[11px] text-muted-foreground block">Host</label>
                <Input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="ftp.dreamstime.com"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground block">Port</label>
                <Input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value) || 21)}
                  className="h-8 text-xs font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5" dir="ltr">
              <button
                type="button"
                onClick={() => setProtocol('ftps')}
                className={`h-7 rounded-md border text-xs font-medium transition cursor-pointer ${
                  protocol === 'ftps'
                    ? 'bg-primary/15 border-primary/40 text-primary font-semibold'
                    : 'bg-secondary/50 border-border text-muted-foreground'
                }`}
              >
                FTPS (Explicit TLS)
              </button>
              <button
                type="button"
                onClick={() => setProtocol('ftp')}
                className={`h-7 rounded-md border text-xs font-medium transition cursor-pointer ${
                  protocol === 'ftp'
                    ? 'bg-primary/15 border-primary/40 text-primary font-semibold'
                    : 'bg-secondary/50 border-border text-muted-foreground'
                }`}
              >
                Standard FTP
              </button>
            </div>

            <div className="space-y-2" dir="ltr">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground block">Username</label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Dreamstime username"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground block">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      storedProfile?.hasSavedPassword ? '•••••••••••• (Saved)' : 'FTP password'
                    }
                    className="h-8 text-xs font-mono pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSaveCredentials}
                className="h-8 text-xs cursor-pointer"
              >
                Save
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleTestConnection}
                className="h-8 text-xs gap-1.5 cursor-pointer"
              >
                <Server className="w-3.5 h-3.5" />
                <span>Test Link</span>
              </Button>
            </div>

            {vaultStatus.type !== 'idle' && (
              <p
                className={`text-xs font-medium truncate ${
                  vaultStatus.type === 'ok'
                    ? 'text-emerald-400'
                    : vaultStatus.type === 'error'
                    ? 'text-destructive'
                    : 'text-muted-foreground'
                }`}
              >
                {vaultStatus.message}
              </p>
            )}
          </div>

          {/* 2. Smart Folder Routing Summary */}
          <div className="p-3.5 rounded-xl border border-border bg-card space-y-2">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FolderGit2 className="w-3.5 h-3.5 text-primary" />
              <span>Auto-Routing Rules</span>
            </span>

            <div className="space-y-1.5 text-xs" dir="ltr">
              <div className="px-2.5 py-1.5 rounded-lg bg-secondary/40 flex items-center justify-between">
                <span className="text-muted-foreground">Photos (.jpg)</span>
                <span className="font-mono font-semibold text-sky-400">
                  / ({rootCount})
                </span>
              </div>
              <div className="px-2.5 py-1.5 rounded-lg bg-secondary/40 flex items-center justify-between">
                <span className="text-muted-foreground">Vectors (.eps, .ai)</span>
                <span className="font-mono font-semibold text-amber-400">
                  /additional ({vectorCount})
                </span>
              </div>
              <div className="px-2.5 py-1.5 rounded-lg bg-secondary/40 flex items-center justify-between">
                <span className="text-muted-foreground">Videos (.mp4, .mov)</span>
                <span className="font-mono font-semibold text-purple-400">
                  /video ({videoCount})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Progress Header + Clean Transfer Queue */}
        <div className="lg:col-span-8 xl:col-span-9 min-h-0 flex flex-col gap-3 overflow-hidden">
          {/* Compact Progress & Controls Card */}
          <div className="shrink-0 p-3.5 rounded-xl border border-border bg-card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3" dir="ltr">
              <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
                <div>
                  <span className="text-muted-foreground">Batch: </span>
                  <span className="font-bold text-foreground">
                    {telemetry.completedFiles} / {telemetry.totalFiles} files ({telemetry.batchPercent}%)
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Speed: </span>
                  <span className="font-bold text-emerald-400">
                    {telemetry.isRunning ? formatTransferSpeed(telemetry.speedBytesPerSec) : '0.0 MB/s'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">ETA: </span>
                  <span className="font-bold text-foreground">
                    {formatEtaSeconds(telemetry.etaSeconds)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp,.eps,.ai,.svg,.mp4,.mov,.webm"
                  className="hidden"
                  onChange={(e) => {
                    handleFilesSelected(e.target.files);
                    e.currentTarget.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={telemetry.isRunning}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 text-xs gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Files</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={telemetry.isRunning}
                  onClick={() => dreamstimeFtpService.loadSampleDreamstimeBatch()}
                  className="h-8 text-xs gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span>Sample Mix (6)</span>
                </Button>

                {failedItems.length > 0 && !telemetry.isRunning && (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => dreamstimeFtpService.retryAllFailed()}
                    className="h-8 text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retry Failed ({failedItems.length})</span>
                  </Button>
                )}

                {telemetry.isRunning ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => dreamstimeFtpService.abortBatch()}
                    className="h-8 text-xs gap-1.5 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop</span>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    disabled={queuedItems.length === 0}
                    onClick={() => dreamstimeFtpService.startBatchUpload()}
                    className="h-8 text-xs gap-1.5 cursor-pointer font-semibold"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Start Upload ({queuedItems.length})</span>
                  </Button>
                )}

                {queue.length > 0 && !telemetry.isRunning && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => dreamstimeFtpService.clearQueue()}
                    className="h-8 px-2 text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <Progress value={telemetry.batchPercent} className="h-2" />
          </div>

          {/* Transfer Queue Table */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={handleDrop}
            className={`flex-1 min-h-0 rounded-xl border bg-card flex flex-col overflow-hidden transition-colors ${
              isDraggingOver ? 'border-primary bg-primary/5' : 'border-border'
            }`}
          >
            {/* Simple Queue Filter Tabs */}
            <div className="shrink-0 h-10 px-3 border-b border-border flex items-center gap-1.5" dir="ltr">
              <button
                type="button"
                onClick={() => setActiveSubTab('all')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                  activeSubTab === 'all'
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Queue ({queue.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('succeeded')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                  activeSubTab === 'succeeded'
                    ? 'bg-emerald-500 text-black font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Completed ({succeededItems.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('failed')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                  activeSubTab === 'failed'
                    ? 'bg-destructive text-destructive-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Failed ({failedItems.length})
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {visibleQueue.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                  <UploadCloud className="w-8 h-8 text-primary mb-2 opacity-80" />
                  <h3 className="text-xs sm:text-sm font-semibold text-foreground">
                    Drop Files Here to Queue for Dreamstime
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-sm mt-1">
                    JPEGs route to <code className="text-sky-400 font-mono">/</code>, vectors route to{' '}
                    <code className="text-amber-400 font-mono">/additional</code>, and videos route to{' '}
                    <code className="text-purple-400 font-mono">/video</code>.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs" dir="ltr">
                  <thead className="sticky top-0 bg-card border-b border-border text-[11px] font-mono text-muted-foreground">
                    <tr>
                      <th className="py-2 px-3">File</th>
                      <th className="py-2 px-2.5">Destination</th>
                      <th className="py-2 px-2.5">Size</th>
                      <th className="py-2 px-2.5 w-40">Progress</th>
                      <th className="py-2 px-2.5">Status</th>
                      <th className="py-2 px-3 text-right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleQueue.map((item) => (
                      <tr key={item.id} className="hover:bg-secondary/30">
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {getMediaIcon(item.mediaType)}
                            <span className="font-mono text-xs text-foreground truncate max-w-[240px]">
                              {item.filename}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-2.5">
                          <span
                            className={`text-[11px] font-mono px-2 py-0.5 rounded border ${getRemoteFolderBadgeStyle(
                              item.remoteFolder
                            )}`}
                          >
                            {item.remoteFolder}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                          {formatBytes(item.fileSize)}
                        </td>
                        <td className="py-2 px-2.5">
                          <div className="flex items-center gap-2">
                            <Progress value={item.progressPercent} className="h-1.5 flex-1" />
                            <span className="text-[11px] font-mono tabular-nums text-muted-foreground w-8 text-right">
                              {item.progressPercent}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-2.5 text-xs">
                          {item.status === 'succeeded' && (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Done
                            </span>
                          )}
                          {item.status === 'uploading' && (
                            <span className="inline-flex items-center gap-1 text-primary">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Uploading
                            </span>
                          )}
                          {item.status === 'retrying' && (
                            <span className="inline-flex items-center gap-1 text-amber-400">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Retry {item.retryCount}/3
                            </span>
                          )}
                          {item.status === 'queued' && (
                            <span className="text-muted-foreground">Queued</span>
                          )}
                          {item.status === 'failed' && (
                            <span
                              className="inline-flex items-center gap-1 text-destructive font-medium"
                              title={item.errorMessage}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Failed
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {!telemetry.isRunning && (
                            <button
                              type="button"
                              onClick={() => dreamstimeFtpService.removeItem(item.id)}
                              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
