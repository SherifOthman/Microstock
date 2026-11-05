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
  SimulatedFaultMode,
} from '../../services/ftp/dreamstimeFtpRouter';
import { dreamstimeFtpService } from '../../services/ftp/ftpClientService';
import { Progress } from '../../components/ui/progress';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { getPlatformLogo } from '../../components/icons/StockLogos';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Eye,
  EyeOff,
  FileImage,
  FileVideo,
  FolderGit2,
  HardDriveUpload,
  Layers,
  Lock,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  UploadCloud,
  Wifi,
  XCircle,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

type QueueSubTab = 'all' | 'succeeded' | 'failed' | 'logs';

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

  // Subscribe to live orchestrator state
  const [queue, setQueue] = useState<FtpQueueItem[]>(() => dreamstimeFtpService.getQueue());
  const [telemetry, setTelemetry] = useState<FtpTelemetryFrame>(() =>
    dreamstimeFtpService.getTelemetry()
  );
  const [mode, setMode] = useState<FtpExecutionMode>(() => dreamstimeFtpService.getMode());
  const [faultMode, setFaultMode] = useState<SimulatedFaultMode>(() =>
    dreamstimeFtpService.getFaultMode()
  );
  const [activeSubTab, setActiveSubTab] = useState<QueueSubTab>('all');
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // SQLite persisted profile & audit logs
  const storedProfile = useSqliteQuery(() => db.ftp.getProfile('dreamstime'), [], undefined);
  const transferLogs = useSqliteQuery(
    () => db.ftp.getTransferLogs({ agencyId: 'dreamstime', limit: 60 }),
    [queue.length, telemetry.completedFiles],
    []
  );

  // Credential Vault Form State
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
      setFaultMode(dreamstimeFtpService.getFaultMode());
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

  const handleModeSwitch = (nextMode: FtpExecutionMode) => {
    dreamstimeFtpService.setMode(nextMode);
  };

  const handleFaultModeChange = (nextFault: SimulatedFaultMode) => {
    dreamstimeFtpService.setFaultMode(nextFault);
  };

  const handleSaveCredentials = async () => {
    setVaultStatus({ type: 'saving', message: 'Encrypting via OS safeStorage...' });
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
      setVaultStatus({
        type: 'ok',
        message: 'Saved to SQLite (safeStorage encrypted)',
      });
    } catch (err: any) {
      setVaultStatus({
        type: 'error',
        message: err?.message || 'Failed to save credentials',
      });
    }
  };

  const handleTestConnection = async () => {
    setVaultStatus({
      type: 'testing',
      message:
        mode === 'live'
          ? `Handshaking ${host}:${port} (${protocol.toUpperCase()})...`
          : 'Simulating Dreamstime FTPS handshake...',
    });
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
          message: `Connected (${res.latencyMs || 45}ms · ${protocol.toUpperCase()})`,
        });
      } else {
        setVaultStatus({
          type: 'error',
          message: res.error || 'Connection test failed',
        });
      }
    } catch (err: any) {
      setVaultStatus({
        type: 'error',
        message: err?.message || 'Connection test error',
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

  // Compute folder routing counts
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
    <div className="flex-1 min-h-0 h-full flex flex-col gap-3 overflow-hidden select-none">
      {/* Ultra-Slim Top Header Bar */}
      <div className="shrink-0 h-11 px-3.5 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            {getPlatformLogo('dreamstime', 16)}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-xs sm:text-sm font-bold tracking-tight text-foreground truncate">
              {language === 'ar' ? 'رافع FTP الذكي — Dreamstime' : 'Microstock FTP Uploader'}
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold shrink-0">
              Dreamstime PoC · Phase 1
            </span>
            <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border shrink-0">
              <ShieldCheck className="w-3 h-3 text-primary" />
              SFTP-Ready Adapter
            </span>
          </div>
        </div>

        {/* Execution Mode Switcher (Dry-Run vs Live FTPS) */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            dir="ltr"
            className="inline-flex items-center rounded-lg bg-secondary p-0.5 border border-border text-[11px] font-medium"
          >
            <button
              type="button"
              disabled={telemetry.isRunning}
              onClick={() => handleModeSwitch('dry_run')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                mode === 'dry_run'
                  ? 'bg-card text-foreground shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Dry-Run Simulator</span>
            </button>
            <button
              type="button"
              disabled={telemetry.isRunning}
              onClick={() => handleModeSwitch('live')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                mode === 'live'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Wifi className="w-3 h-3 text-emerald-400" />
              <span>Live FTPS (Port 21)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 overflow-hidden">
        {/* LEFT COLUMN: Secure Credential Vault + Smart Routing Rules + Resiliency Controls */}
        <div className="lg:col-span-4 xl:col-span-3 min-h-0 flex flex-col gap-2.5 overflow-y-auto pr-0.5">
          {/* 1. Secure Credential Vault Card */}
          <div className="p-3.5 rounded-xl border border-border bg-card space-y-2.5 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-primary shrink-0" />
                <h2 className="text-xs font-semibold text-foreground">
                  {language === 'ar' ? 'خزنة بيانات Dreamstime' : 'Dreamstime Credential Vault'}
                </h2>
              </div>
              <span
                dir="ltr"
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/25"
              >
                OS safeStorage
              </span>
            </div>

            {/* Protocol & Host/Port */}
            <div className="grid grid-cols-3 gap-1.5" dir="ltr">
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] font-mono text-muted-foreground block">
                  FTP HOST
                </label>
                <Input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="ftp.dreamstime.com"
                  className="h-7 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-foreground block">
                  PORT
                </label>
                <Input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value) || 21)}
                  className="h-7 text-xs font-mono tabular-nums"
                />
              </div>
            </div>

            {/* Protocol selector */}
            <div className="space-y-1" dir="ltr">
              <label className="text-[10px] font-mono text-muted-foreground block">
                TRANSPORT SECURITY
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setProtocol('ftps')}
                  className={`h-7 px-2 rounded-md border text-[11px] font-mono transition cursor-pointer ${
                    protocol === 'ftps'
                      ? 'bg-primary/15 border-primary/40 text-primary font-semibold'
                      : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Explicit FTPS (TLS)
                </button>
                <button
                  type="button"
                  onClick={() => setProtocol('ftp')}
                  className={`h-7 px-2 rounded-md border text-[11px] font-mono transition cursor-pointer ${
                    protocol === 'ftp'
                      ? 'bg-primary/15 border-primary/40 text-primary font-semibold'
                      : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Standard FTP
                </button>
              </div>
            </div>

            {/* Username & Password */}
            <div className="space-y-2" dir="ltr">
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-foreground block">
                  USERNAME
                </label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="dreamstime_username"
                  className="h-7 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono text-muted-foreground">
                    PASSWORD
                  </label>
                  {storedProfile?.hasSavedPassword && !password && (
                    <span className="text-[10px] font-mono text-emerald-400">
                      ● Encrypted in SQLite
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      storedProfile?.hasSavedPassword
                        ? '•••••••••••••••• (Saved)'
                        : 'Enter FTP password...'
                    }
                    className="h-7 text-xs font-mono pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Save & Test Buttons */}
            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSaveCredentials}
                disabled={vaultStatus.type === 'saving' || vaultStatus.type === 'testing'}
                className="h-7 text-xs gap-1.5 cursor-pointer"
              >
                <Lock className="w-3 h-3" />
                <span>Save Vault</span>
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleTestConnection}
                disabled={vaultStatus.type === 'saving' || vaultStatus.type === 'testing'}
                className="h-7 text-xs gap-1.5 cursor-pointer"
              >
                <Server className="w-3 h-3" />
                <span>Test Link</span>
              </Button>
            </div>

            {vaultStatus.type !== 'idle' && (
              <div
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono flex items-center gap-1.5 ${
                  vaultStatus.type === 'ok'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : vaultStatus.type === 'error'
                    ? 'bg-destructive/10 border-destructive/30 text-destructive'
                    : 'bg-secondary border-border text-muted-foreground'
                }`}
              >
                {vaultStatus.type === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                {vaultStatus.type === 'error' && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate">{vaultStatus.message}</span>
              </div>
            )}
          </div>

          {/* 2. Dreamstime Smart Extension Router Card */}
          <div className="p-3.5 rounded-xl border border-border bg-card space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <FolderGit2 className="w-3.5 h-3.5 text-primary shrink-0" />
                <h2 className="text-xs font-semibold text-foreground">
                  {language === 'ar' ? 'التوجيه التلقائي للمجلدات' : 'Dreamstime Auto-Router'}
                </h2>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">By Extension</span>
            </div>

            <div className="space-y-1.5 text-xs" dir="ltr">
              <div className="px-2.5 py-1.5 rounded-lg bg-secondary/40 border border-border flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <FileImage className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="text-[11px] text-foreground truncate">JPEGs / Raster</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border bg-sky-500/15 text-sky-400 border-sky-500/30">
                    /
                  </span>
                  <span className="text-[11px] font-mono tabular-nums font-semibold text-foreground w-5 text-right">
                    {rootCount}
                  </span>
                </div>
              </div>

              <div className="px-2.5 py-1.5 rounded-lg bg-secondary/40 border border-border flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-[11px] text-foreground truncate">Vectors (.eps, .ai)</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border bg-amber-500/15 text-amber-400 border-amber-500/30">
                    /additional
                  </span>
                  <span className="text-[11px] font-mono tabular-nums font-semibold text-foreground w-5 text-right">
                    {vectorCount}
                  </span>
                </div>
              </div>

              <div className="px-2.5 py-1.5 rounded-lg bg-secondary/40 border border-border flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <FileVideo className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span className="text-[11px] text-foreground truncate">Videos (.mp4, .mov)</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border bg-purple-500/15 text-purple-400 border-purple-500/30">
                    /video
                  </span>
                  <span className="text-[11px] font-mono tabular-nums font-semibold text-foreground w-5 text-right">
                    {videoCount}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Network Resiliency & 3x Auto-Retry Simulator Card */}
          <div className="p-3.5 rounded-xl border border-border bg-card space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-primary shrink-0" />
                <h2 className="text-xs font-semibold text-foreground">
                  3x Exponential Backoff
                </h2>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                1.5s → 3s → 6s
              </span>
            </div>

            <p className="text-[11px] text-muted-foreground leading-snug">
              Test how the queue handles network drops during unattended overnight batches:
            </p>

            <div className="space-y-1 text-[11px]" dir="ltr">
              {(
                [
                  {
                    id: 'none',
                    label: 'Clean Transfer (0 Drops)',
                    desc: 'All files stream at 100% with zero network errors',
                  },
                  {
                    id: 'transient_recover_on_retry_2',
                    label: 'Transient Blip (Recovers Retry #2)',
                    desc: 'File #2 drops mid-stream, auto-retries & succeeds',
                  },
                  {
                    id: 'persistent_fail_all_3',
                    label: 'Hard Drop (Moves to Failed Queue)',
                    desc: 'Exhausts all 3 retries → isolates in Failed Queue',
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={telemetry.isRunning}
                  onClick={() => handleFaultModeChange(opt.id)}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-left transition cursor-pointer ${
                    faultMode === opt.id
                      ? 'bg-primary/15 border-primary/40 text-foreground font-semibold'
                      : 'bg-secondary/30 border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{opt.label}</span>
                    {faultMode === opt.id && (
                      <span className="text-[10px] font-mono text-primary">ACTIVE</span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground font-normal mt-0.5">
                    {opt.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Live Telemetry Cockpit + Dropzone + Transfer Queue & SQLite Logs */}
        <div className="lg:col-span-8 xl:col-span-9 min-h-0 flex flex-col gap-2.5 overflow-hidden">
          {/* 1. Live Telemetry Cockpit */}
          <div className="shrink-0 p-3.5 rounded-xl border border-border bg-card space-y-3">
            {/* Top Telemetry KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Overall Batch Counter */}
              <div className="p-2.5 rounded-lg bg-secondary/40 border border-border space-y-0.5">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Batch Progress</span>
                  <HardDriveUpload className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="text-base font-bold font-mono tabular-nums text-foreground" dir="ltr">
                  File {telemetry.currentFileIndex} of {telemetry.totalFiles}
                </div>
                <div className="text-[10px] font-mono tabular-nums text-muted-foreground" dir="ltr">
                  {formatBytes(telemetry.batchBytesTransferred)} / {formatBytes(telemetry.batchTotalBytes)}
                </div>
              </div>

              {/* Live Upload Speed */}
              <div className="p-2.5 rounded-lg bg-secondary/40 border border-border space-y-0.5">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Live Speed (EMA)</span>
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-base font-bold font-mono tabular-nums text-emerald-400" dir="ltr">
                  {telemetry.isRunning ? formatTransferSpeed(telemetry.speedBytesPerSec) : '0.0 MB/s'}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground" dir="ltr">
                  {mode === 'live' ? 'Explicit FTPS Stream' : '60fps Telemetry Bridge'}
                </div>
              </div>

              {/* Estimated Time Remaining */}
              <div className="p-2.5 rounded-lg bg-secondary/40 border border-border space-y-0.5">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Estimated Time (ETA)</span>
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                </div>
                <div className="text-base font-bold font-mono tabular-nums text-foreground" dir="ltr">
                  {formatEtaSeconds(telemetry.etaSeconds)}
                </div>
                <div className="text-[10px] font-mono tabular-nums text-muted-foreground" dir="ltr">
                  {telemetry.succeededFiles} ok · {telemetry.failedFiles} failed
                </div>
              </div>

              {/* Active Target Folder & Retry Status */}
              <div className="p-2.5 rounded-lg bg-secondary/40 border border-border space-y-0.5">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Active Route</span>
                  <FolderGit2 className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="flex items-center gap-1.5 pt-0.5" dir="ltr">
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${getRemoteFolderBadgeStyle(
                      telemetry.currentRemoteFolder
                    )}`}
                  >
                    {telemetry.currentRemoteFolder}
                  </span>
                  {telemetry.activeRetryAttempt > 0 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                      Retry {telemetry.activeRetryAttempt}/3
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground truncate" dir="ltr">
                  {telemetry.currentFilename || 'Waiting for batch...'}
                </div>
              </div>
            </div>

            {/* Dual 60fps Progress Bars (Overall Batch + Current File) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-0.5" dir="ltr">
              {/* Overall Batch Progress Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-muted-foreground">
                    OVERALL BATCH ({telemetry.completedFiles}/{telemetry.totalFiles} FILES)
                  </span>
                  <span className="font-bold tabular-nums text-foreground">
                    {telemetry.batchPercent}%
                  </span>
                </div>
                <Progress value={telemetry.batchPercent} className="h-2" />
              </div>

              {/* Current File Progress Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-muted-foreground truncate max-w-[260px]">
                    {telemetry.currentFilename
                      ? `FILE: ${telemetry.currentFilename}`
                      : 'CURRENT FILE PROGRESS'}
                  </span>
                  <span className="font-bold tabular-nums text-primary">
                    {telemetry.currentFilePercent}%
                  </span>
                </div>
                <Progress
                  value={telemetry.currentFilePercent}
                  className="h-2"
                  indicatorClassName={
                    telemetry.activeRetryAttempt > 0 ? 'bg-amber-400' : 'bg-emerald-500'
                  }
                />
              </div>
            </div>

            {/* Live Status Line & Action Bar */}
            <div className="pt-1 border-t border-border flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    telemetry.isRunning
                      ? 'bg-emerald-400 animate-ping'
                      : failedItems.length > 0
                      ? 'bg-amber-400'
                      : 'bg-muted-foreground'
                  }`}
                />
                <span className="text-[11px] font-mono text-muted-foreground truncate" dir="ltr">
                  {telemetry.statusMessage}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
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
                  className="h-7 text-xs gap-1.5 cursor-pointer"
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
                  className="h-7 text-xs gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span>Load Sample Dreamstime Mix (6)</span>
                </Button>

                {failedItems.length > 0 && !telemetry.isRunning && (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => dreamstimeFtpService.retryAllFailed()}
                    className="h-7 text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retry All Failed ({failedItems.length})</span>
                  </Button>
                )}

                {telemetry.isRunning ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => dreamstimeFtpService.abortBatch()}
                    className="h-7 text-xs gap-1.5 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Abort Batch</span>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    disabled={queuedItems.length === 0}
                    onClick={() => dreamstimeFtpService.startBatchUpload()}
                    className="h-7 text-xs gap-1.5 cursor-pointer"
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
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive cursor-pointer"
                    title="Clear Queue"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* 2. Queue & SQLite Audit Tabs */}
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
            {/* Segmented Tab Bar */}
            <div className="shrink-0 h-10 px-3 border-b border-border flex items-center justify-between gap-2 bg-secondary/20">
              <div className="flex items-center gap-1" dir="ltr">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('all')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    activeSubTab === 'all'
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  <span>All Queue</span>
                  <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded bg-black/20">
                    {queue.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSubTab('succeeded')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    activeSubTab === 'succeeded'
                      ? 'bg-emerald-500 text-black font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Succeeded</span>
                  <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded bg-black/15">
                    {succeededItems.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSubTab('failed')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    activeSubTab === 'failed'
                      ? 'bg-destructive text-destructive-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Failed Queue</span>
                  <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded bg-black/20">
                    {failedItems.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSubTab('logs')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    activeSubTab === 'logs'
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>SQLite Audit Logs</span>
                  <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded bg-black/20">
                    {transferLogs?.length || 0}
                  </span>
                </button>
              </div>

              {activeSubTab === 'logs' && (transferLogs?.length || 0) > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => db.ftp.clearLogs('dreamstime')}
                  className="h-7 text-[11px] text-muted-foreground hover:text-destructive cursor-pointer"
                >
                  Clear History
                </Button>
              )}
            </div>

            {/* Tab Content Area */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {activeSubTab === 'logs' ? (
                (transferLogs?.length || 0) === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                    <Database className="w-8 h-8 mb-2 opacity-40" />
                    <p className="text-xs font-medium text-foreground">No SQLite transfer logs recorded yet</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Run a Dreamstime upload batch to persist per-file transfer telemetry in SQLite.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs" dir="ltr">
                    <thead className="sticky top-0 bg-card border-b border-border text-[10px] font-mono text-muted-foreground uppercase">
                      <tr>
                        <th className="py-2 px-3">Filename</th>
                        <th className="py-2 px-2.5">Dreamstime Target</th>
                        <th className="py-2 px-2.5">Size</th>
                        <th className="py-2 px-2.5">Retries</th>
                        <th className="py-2 px-2.5">Status</th>
                        <th className="py-2 px-3 text-right">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono text-[11px]">
                      {transferLogs?.map((log) => (
                        <tr key={log.id} className="hover:bg-secondary/30">
                          <td className="py-2 px-3 font-medium text-foreground truncate max-w-[240px]">
                            {log.filename}
                          </td>
                          <td className="py-2 px-2.5">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded border ${getRemoteFolderBadgeStyle(
                                log.remoteDirectory
                              )}`}
                            >
                              {log.remotePath}
                            </span>
                          </td>
                          <td className="py-2 px-2.5 tabular-nums text-muted-foreground">
                            {formatBytes(log.fileSize)}
                          </td>
                          <td className="py-2 px-2.5 tabular-nums text-muted-foreground">
                            {log.retryCount > 0 ? `${log.retryCount}/3` : '0'}
                          </td>
                          <td className="py-2 px-2.5">
                            {log.status === 'succeeded' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" />
                                Succeeded
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 text-destructive"
                                title={log.errorMessage}
                              >
                                <XCircle className="w-3 h-3" />
                                {log.errorCode || 'Failed'}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                            {log.durationMs}ms
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : visibleQueue.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary mb-3">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <h3 className="text-xs sm:text-sm font-semibold text-foreground">
                    {activeSubTab === 'failed'
                      ? 'Zero Failed Transfers'
                      : activeSubTab === 'succeeded'
                      ? 'No Completed Transfers Yet'
                      : 'Drop Microstock Assets Here for Dreamstime Auto-Routing'}
                  </h3>
                  <p className="text-[11px] text-muted-foreground max-w-md mt-1 leading-relaxed">
                    JPEGs route automatically to <code className="text-sky-400 font-mono">/</code>, EPS/AI
                    vectors route to <code className="text-amber-400 font-mono">/additional</code>, and
                    MP4/MOV videos route to <code className="text-purple-400 font-mono">/video</code>.
                  </p>
                  {activeSubTab === 'all' && (
                    <div className="flex items-center gap-2 mt-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-8 text-xs gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Browse Local Files</span>
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => dreamstimeFtpService.loadSampleDreamstimeBatch()}
                        className="h-8 text-xs gap-1.5 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Load Sample Dreamstime Mix (6 Files)</span>
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs" dir="ltr">
                  <thead className="sticky top-0 bg-card border-b border-border text-[10px] font-mono text-muted-foreground uppercase z-10">
                    <tr>
                      <th className="py-2 px-3">Asset Filename</th>
                      <th className="py-2 px-2.5">Dreamstime Target Path</th>
                      <th className="py-2 px-2.5">Size</th>
                      <th className="py-2 px-2.5 w-44">Progress</th>
                      <th className="py-2 px-2.5">Status / Retries</th>
                      <th className="py-2 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-xs">
                    {visibleQueue.map((item) => (
                      <tr key={item.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {getMediaIcon(item.mediaType)}
                            <span className="font-mono text-[11px] font-medium text-foreground truncate max-w-[230px]">
                              {item.filename}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-2.5">
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${getRemoteFolderBadgeStyle(
                              item.remoteFolder
                            )}`}
                          >
                            {item.remotePath}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                          {formatBytes(item.fileSize)}
                        </td>
                        <td className="py-2 px-2.5">
                          <div className="flex items-center gap-2">
                            <Progress
                              value={item.progressPercent}
                              className="h-1.5 flex-1"
                              indicatorClassName={
                                item.status === 'failed'
                                  ? 'bg-destructive'
                                  : item.status === 'retrying'
                                  ? 'bg-amber-400'
                                  : item.status === 'succeeded'
                                  ? 'bg-emerald-500'
                                  : 'bg-primary'
                              }
                            />
                            <span className="text-[10px] font-mono tabular-nums text-muted-foreground w-8 text-right">
                              {item.progressPercent}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-2.5 font-mono text-[11px]">
                          {item.status === 'succeeded' && (
                            <span className="inline-flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                Transferred{item.retryCount > 0 ? ` (Retry #${item.retryCount})` : ''}
                              </span>
                            </span>
                          )}
                          {item.status === 'uploading' && (
                            <span className="inline-flex items-center gap-1 text-primary">
                              <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                              <span>
                                Uploading{item.retryCount > 0 ? ` (${item.retryCount}/3)` : '...'}
                              </span>
                            </span>
                          )}
                          {item.status === 'retrying' && (
                            <span className="inline-flex items-center gap-1 text-amber-400">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>Backoff Retry {item.retryCount}/3</span>
                            </span>
                          )}
                          {item.status === 'queued' && (
                            <span className="text-muted-foreground">Queued</span>
                          )}
                          {item.status === 'failed' && (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 text-destructive font-semibold">
                                <XCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>Failed (3/3 Retries)</span>
                              </span>
                              {item.errorMessage && (
                                <p className="text-[10px] text-destructive/80 truncate max-w-[210px]">
                                  {item.errorMessage}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {!telemetry.isRunning && (
                            <button
                              type="button"
                              onClick={() => dreamstimeFtpService.removeItem(item.id)}
                              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition cursor-pointer"
                              title="Remove from queue"
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
