import React, { useEffect, useRef, useState } from 'react';
import { db, useSqliteQuery } from '../../db';
import {
  DreamstimeRemoteFolder,
  formatBytes,
  formatBytesPrecise,
  formatEtaSeconds,
  formatSpeedPrecise,
  formatTimeLeftHms,
  formatUnifiedUploadProgressLine,
  FtpQueueItem,
  FtpTelemetryFrame,
} from '../../services/ftp/dreamstimeFtpRouter';
import { dreamstimeFtpService } from '../../services/ftp/ftpClientService';
import { Progress } from '../../components/ui/progress';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Tooltip } from '../../components/ui/tooltip';
import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '../../components/ui/dialog';
import { getPlatformLogo } from '../../components/icons/StockLogos';
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Coffee,
  Eye,
  EyeOff,
  FileImage,
  FileSpreadsheet,
  FileVideo,
  FolderOpen,
  FolderPlus,
  Layers,
  Lock,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Settings,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { OneTwoThreeRfFtpUploaderView } from './OneTwoThreeRfFtpUploaderView';
import { FtpSupportedAgencyId } from '../../services/ftp/oneTwoThreeRfFtpRouter';

type QueueSubTab = 'all' | 'succeeded' | 'failed' | 'skipped';

function getRemoteFolderBadgeStyle(
  folder: DreamstimeRemoteFolder,
  isVectorBundle?: boolean
): string {
  if (isVectorBundle) {
    return 'bg-amber-500/15 text-amber-300 border-amber-500/35';
  }
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

function getMediaIcon(item: FtpQueueItem) {
  if (item.filename.toLowerCase().endsWith('.csv')) {
    return <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  }
  if (item.isVectorBundle || item.mediaType === 'vector') {
    return <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  }
  if (item.mediaType === 'video') {
    return <FileVideo className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
  }
  return <FileImage className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
}

function getMediaTypeLabel(item: FtpQueueItem, language: string): string {
  if (item.filename.toLowerCase().endsWith('.csv')) {
    return 'CSV';
  }
  if (item.isVectorBundle) {
    return language === 'ar' ? 'حزمة فيكتور (JPG+EPS)' : 'Vector Pair (JPG+EPS)';
  }
  if (item.mediaType === 'vector') return language === 'ar' ? 'فيكتور' : 'Vector';
  if (item.mediaType === 'video') return language === 'ar' ? 'فيديو' : 'Video';
  return language === 'ar' ? 'صورة' : 'Photo';
}

function renderMediaPreviewContent(item: FtpQueueItem, size: 'hover' | 'modal') {
  const boxClass =
    size === 'modal'
      ? 'w-full max-h-[75vh] h-auto rounded-lg border border-border bg-black/70 object-contain shadow-md'
      : 'w-full max-h-72 h-auto rounded-lg border border-border bg-black/60 object-contain shadow-inner';

  if (item.filename.toLowerCase().endsWith('.csv')) {
    return (
      <div
        className={`${
          size === 'modal' ? 'w-full h-52' : 'w-full h-40'
        } rounded-lg border border-border bg-emerald-950/20 flex flex-col items-center justify-center gap-2 text-emerald-400 text-xs font-mono`}
      >
        <FileSpreadsheet className="w-10 h-10 text-emerald-400" />
        <span className="text-xs font-medium tracking-wide">CSV Metadata Asset</span>
      </div>
    );
  }

  const src = item.previewUrl;
  if (!src) {
    return (
      <div
        className={`${
          size === 'modal' ? 'w-full h-52' : 'w-full h-40'
        } rounded-lg border border-border bg-secondary/40 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs font-mono`}
      >
        {item.mediaType === 'video' ? (
          <FileVideo className="w-10 h-10 text-purple-400" />
        ) : item.isVectorBundle || item.mediaType === 'vector' ? (
          <Layers className="w-10 h-10 text-amber-400" />
        ) : (
          <FileImage className="w-10 h-10 text-sky-400" />
        )}
        <span className="text-xs font-medium">
          {item.mediaType === 'vector' && !item.isVectorBundle
            ? 'EPS Vector Asset'
            : 'Preview Ready'}
        </span>
      </div>
    );
  }

  if (item.mediaType === 'video') {
    return (
      <video
        src={src}
        muted
        autoPlay
        loop
        playsInline
        controls={size === 'modal'}
        className={boxClass}
      />
    );
  }

  return (
    <img
      src={src}
      alt={item.displayName || item.filename}
      className={boxClass}
    />
  );
}

async function extractFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const collected: File[] = [];
  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];

  const readEntryRecursively = async (entry: any): Promise<void> => {
    if (!entry) return;
    if (entry.isFile) {
      await new Promise<void>((resolve) => {
        entry.file(
          (file: File) => {
            collected.push(file);
            resolve();
          },
          () => resolve()
        );
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readBatch = async (): Promise<void> => {
        const entries: any[] = await new Promise((resolve) => {
          reader.readEntries(
            (batch: any[]) => resolve(batch || []),
            () => resolve([])
          );
        });
        if (entries.length > 0) {
          for (const child of entries) {
            await readEntryRecursively(child);
          }
          await readBatch();
        }
      };
      await readBatch();
    }
  };

  const entries = items
    .map((item) =>
      typeof (item as any).webkitGetAsEntry === 'function'
        ? (item as any).webkitGetAsEntry()
        : null
    )
    .filter(Boolean);

  if (entries.length > 0 && entries.some((e) => e.isDirectory)) {
    for (const entry of entries) {
      await readEntryRecursively(entry);
    }
    if (collected.length > 0) {
      return collected;
    }
  }

  return dataTransfer.files ? Array.from(dataTransfer.files) : [];
}

export function formatElapsedMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${String(hours).padStart(2, '0')}:${String(remMins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Stabilizes upload telemetry math:
 * - Tracks total elapsed seconds while uploading or paused
 * - Computes overall average speed (Total Bytes Uploaded / Total Seconds Elapsed)
 * - Computes stabilized Global ETA (Total Remaining Bytes / Average Speed)
 */
export function useFtpTelemetryMath(telemetry: FtpTelemetryFrame) {
  const batchStartTimeRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (telemetry.isRunning) {
      if (!batchStartTimeRef.current) {
        batchStartTimeRef.current = Date.now();
        setElapsedSeconds(1);
      }
      if (telemetry.isPaused) {
        return;
      }
      const timer = setInterval(() => {
        if (batchStartTimeRef.current) {
          setElapsedSeconds(Math.max(1, Math.floor((Date.now() - batchStartTimeRef.current) / 1000)));
        }
      }, 1000);
      return () => clearInterval(timer);
    } else if (!telemetry.isPaused) {
      batchStartTimeRef.current = null;
      setElapsedSeconds(0);
    }
  }, [telemetry.isRunning, telemetry.isPaused]);

  const totalRemainingBytes = Math.max(0, telemetry.batchTotalBytes - telemetry.batchBytesTransferred);
  const averageSpeedBps =
    elapsedSeconds > 0 && telemetry.batchBytesTransferred > 0
      ? telemetry.batchBytesTransferred / elapsedSeconds
      : 0;

  const stableEtaSeconds =
    telemetry.isRunning && !telemetry.isPaused && averageSpeedBps > 0 && totalRemainingBytes > 0
      ? Math.round(totalRemainingBytes / averageSpeedBps)
      : totalRemainingBytes === 0
      ? 0
      : null;

  const activeFileNumber = Math.min(
    telemetry.totalFiles,
    Math.max(1, telemetry.currentFileIndex || telemetry.completedFiles + 1)
  );

  return {
    batchStartTime: batchStartTimeRef.current,
    elapsedSeconds,
    averageSpeedBps,
    stableEtaSeconds,
    totalRemainingBytes,
    activeFileNumber,
  };
}

export const FtpUploaderView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [selectedAgency, setSelectedAgency] = useState<FtpSupportedAgencyId>(() => {
    try {
      return (localStorage.getItem('stock_ftp_agency') as FtpSupportedAgencyId) || 'dreamstime';
    } catch {
      return 'dreamstime';
    }
  });

  const handleAgencyChange = (agency: FtpSupportedAgencyId) => {
    setSelectedAgency(agency);
    try {
      localStorage.setItem('stock_ftp_agency', agency);
    } catch {}
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const [queue, setQueue] = useState<FtpQueueItem[]>(() => dreamstimeFtpService.getQueue());
  const [telemetry, setTelemetry] = useState<FtpTelemetryFrame>(() =>
    dreamstimeFtpService.getTelemetry()
  );
  const [activeSubTab, setActiveSubTab] = useState<QueueSubTab>('all');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [previewModalItem, setPreviewModalItem] = useState<FtpQueueItem | null>(null);
  const [hasRecoverableSession, setHasRecoverableSession] = useState<boolean>(() =>
    dreamstimeFtpService.getHasRecoverableSession()
  );

  const storedProfile = useSqliteQuery(() => db.ftp.getProfile('dreamstime'), [], undefined, ['ftp']);

  // Site Settings Credential State (Plain FTP Port 21: Host, Username, Password)
  const [host, setHost] = useState('ftp.dreamstime.com');
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
      setHasRecoverableSession(dreamstimeFtpService.getHasRecoverableSession());
    };
    const unsub = dreamstimeFtpService.subscribe(sync);

    // Hydrate persisted queue from SQLite if orchestrator is currently empty on mount
    if (dreamstimeFtpService.getQueue().length === 0) {
      dreamstimeFtpService.hydrateFromDisk().catch(() => {});
    }

    return () => unsub();
  }, []);

  useEffect(() => {
    if (storedProfile) {
      setHost(storedProfile.host || 'ftp.dreamstime.com');
      if (storedProfile.username) {
        setUsername(storedProfile.username);
      }
      if (storedProfile.hasSavedPassword && !password) {
        setPassword('••••••••••••');
      }
    }
  }, [storedProfile?.updatedAt]);

  const handleSaveCredentials = async () => {
    setVaultStatus({
      type: 'testing',
      message: isAr ? 'جارٍ اختبار الاتصال وحفظ البيانات...' : 'Testing connection & saving...',
    });
    try {
      const cleanHost = host.trim() || 'ftp.dreamstime.com';
      const cleanUsername = username.trim();
      const passToSend = password === '••••••••••••' ? undefined : password;

      // 1. Test connection first
      const testRes = await dreamstimeFtpService.testDreamstimeConnection({
        protocol: 'ftp',
        host: cleanHost,
        port: 21,
        username: cleanUsername,
        password: passToSend,
      });

      if (!testRes.success) {
        setVaultStatus({
          type: 'error',
          message: testRes.error || (isAr ? 'فشل الاتصال بخادم FTP' : 'Connection failed'),
        });
        return;
      }

      // 2. Save on verified connection
      await dreamstimeFtpService.saveDreamstimeCredentials({
        protocol: 'ftp',
        host: cleanHost,
        port: 21,
        username: cleanUsername,
        password: passToSend,
        passiveMode: true,
      });

      setVaultStatus({
        type: 'ok',
        message: isAr ? 'تم الاتصال وحفظ البيانات بنجاح' : 'Connected & Saved Successfully',
      });

      setTimeout(() => {
        setIsSettingsOpen(false);
      }, 600);
    } catch (err: any) {
      setVaultStatus({
        type: 'error',
        message: err?.message || (isAr ? 'فشل الحفظ' : 'Failed to save credentials'),
      });
    }
  };

  const handleTestConnection = async () => {
    setVaultStatus({
      type: 'testing',
      message: isAr ? 'جارٍ اختبار الاتصال (Port 21)...' : 'Testing Plain FTP (Port 21)...',
    });
    try {
      const cleanHost = host.trim() || 'ftp.dreamstime.com';
      const cleanUsername = username.trim();
      const passToSend = password === '••••••••••••' ? undefined : password;

      const res = await dreamstimeFtpService.testDreamstimeConnection({
        protocol: 'ftp',
        host: cleanHost,
        port: 21,
        username: cleanUsername,
        password: passToSend,
      });

      if (res.success) {
        setVaultStatus({
          type: 'ok',
          message: isAr
            ? `متصل بنجاح (${res.latencyMs || 35}ms)`
            : `Connected (${res.latencyMs || 35}ms)`,
        });
      } else {
        setVaultStatus({
          type: 'error',
          message: res.error || (isAr ? 'فشل الاتصال' : 'Connection failed'),
        });
      }
    } catch (err: any) {
      setVaultStatus({
        type: 'error',
        message: err?.message || (isAr ? 'خطأ في الاتصال' : 'Connection error'),
      });
    }
  };

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    dreamstimeFtpService.addFiles(Array.from(fileList));
  };

  const handleAddFolderClick = async () => {
    if (telemetry.isRunning) return;
    const nativeItems = await dreamstimeFtpService.selectAndAddNativeFolder();
    if (nativeItems === null) {
      folderInputRef.current?.click();
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (!e.dataTransfer) return;
    const files = await extractFilesFromDataTransfer(e.dataTransfer);
    if (files.length > 0) {
      dreamstimeFtpService.addFiles(files);
    }
  };

  const handleClearAll = () => {
    setActiveSubTab('all');
    setPreviewModalItem(null);
    dreamstimeFtpService.clearQueue();
  };

  const handleOpenFileLocation = (localPath?: string) => {
    if (!localPath) return;
    try {
      const electronAPI = (window as any).electronAPI;
      if (typeof electronAPI?.shell?.showItemInFolder === 'function') {
        electronAPI.shell.showItemInFolder(localPath);
      } else if (typeof electronAPI?.showItemInFolder === 'function') {
        electronAPI.showItemInFolder(localPath);
      }
    } catch (err) {
      console.warn('Failed to open file location:', err);
    }
  };

  const succeededItems = queue.filter((i) => i.status === 'succeeded');
  const failedItems = queue.filter((i) => i.status === 'failed');
  const skippedItems = queue.filter((i) => i.status === 'skipped');
  const pendingUploadItems = queue.filter(
    (i) => i.status === 'queued' || i.status === 'retry' || i.status === 'retrying'
  );
  const isBatchFinished =
    telemetry.totalFiles > 0 &&
    telemetry.completedFiles === telemetry.totalFiles &&
    !telemetry.isRunning;

  const {
    elapsedSeconds,
    stableEtaSeconds,
    activeFileNumber,
  } = useFtpTelemetryMath(telemetry);

  const visibleQueue =
    activeSubTab === 'succeeded'
      ? succeededItems
      : activeSubTab === 'failed'
      ? failedItems
      : activeSubTab === 'skipped'
      ? skippedItems
      : queue;

  if (selectedAgency !== 'dreamstime') {
    return (
      <OneTwoThreeRfFtpUploaderView
        selectedAgency={selectedAgency}
        onSwitchAgency={handleAgencyChange}
      />
    );
  }

  return (
    <div
      data-testid="ftp-uploader-view"
      className="flex-1 min-h-0 h-full flex flex-col gap-3 overflow-hidden select-none"
    >
      {/* Hidden File & Folder Pickers - Always mounted for Dropzone & Top Toolbar */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,.bmp,.eps,.ai,.svg,.cdr,.mp4,.mov,.webm,.avi,.mkv,.m4v,.csv"
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files);
          e.currentTarget.value = '';
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        {...({ webkitdirectory: '', directory: '' } as any)}
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files);
          e.currentTarget.value = '';
        }}
      />

      {/* Top Header Bar: Title + Online Status (+ subtle ☕ when active) + Site Settings */}
      <div className="shrink-0 h-12 px-4 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {getPlatformLogo('dreamstime', 18)}
          <h1 className="text-sm font-bold tracking-tight text-foreground truncate whitespace-nowrap">
            {isAr ? 'رافع خادم Dreamstime FTP' : 'Dreamstime FTP Uploader'}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center p-0.5 rounded-lg bg-secondary border border-border text-xs mr-1 rtl:mr-0 rtl:ml-1">
            {(
              [
                { id: 'dreamstime', label: 'Dreamstime' },
                { id: '123rf', label: '123RF' },
                { id: 'vecteezy', label: 'Vecteezy' },
                { id: 'shutterstock', label: 'Shutterstock' },
                { id: 'adobe', label: 'Adobe Stock' },
              ] as const
            ).map((agency) => {
              const isActive = agency.id === 'dreamstime';
              return (
                <button
                  key={agency.id}
                  type="button"
                  onClick={() => handleAgencyChange(agency.id)}
                  className={`px-2 py-1 rounded-md transition flex items-center gap-1.5 ${
                    isActive
                      ? 'font-bold bg-card text-foreground shadow-xs cursor-default'
                      : 'text-muted-foreground hover:text-foreground cursor-pointer font-medium'
                  }`}
                >
                  {getPlatformLogo(agency.id, 13)}
                  <span className="hidden md:inline">{agency.label}</span>
                </button>
              );
            })}
          </div>
          {/* Subtle Keep Awake ☕ Icon (Only appears when actively uploading) */}
          {telemetry.isRunning && (
            <Tooltip
              content={
                isAr
                  ? 'حماية الجهاز من وضع السكون نشطة أثناء رفع الملفات'
                  : 'OS sleep prevention is active while uploading'
              }
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <Coffee className="w-3.5 h-3.5" />
              </div>
            </Tooltip>
          )}

          {/* Compact Connection Status Indicator with Shadcn Tooltip */}
          <Tooltip
            content={
              storedProfile?.username
                ? `${storedProfile.username}@${storedProfile.host || 'ftp.dreamstime.com'} (Port 21)`
                : isAr
                ? 'غير متصل - يرجى حفظ بيانات الدخول'
                : 'Offline - Please configure credentials'
            }
          >
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary/50 border border-border text-xs font-medium cursor-help">
              <span
                className={`w-2 h-2 rounded-full ${
                  storedProfile?.hasSavedPassword ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              <span className="font-mono">
                {storedProfile?.hasSavedPassword
                  ? isAr
                    ? 'متصل'
                    : 'Online'
                  : isAr
                  ? 'غير متصل'
                  : 'Offline'}
              </span>
            </div>
          </Tooltip>

          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="ftp-site-settings-btn"
            onClick={() => setIsSettingsOpen(true)}
            className="h-8 text-xs gap-1.5 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-primary" />
            <span>{isAr ? 'إعدادات الموقع' : 'Site Settings'}</span>
          </Button>
        </div>
      </div>

      {/* Full-Width Main Workspace */}
      <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
        {/* Progress & Controls Bar: Shown when queue has items */}
        {queue.length > 0 && (
          <div className="shrink-0 p-3.5 rounded-xl border border-border bg-card space-y-2.5">
            <div
              className="flex items-center justify-between gap-4 min-h-[36px] flex-wrap"
              dir={isAr ? 'rtl' : 'ltr'}
            >
              {/* Left: Visually Distinct Telemetry Badges (Flexbox gap-4) */}
              <div className="flex items-center gap-4 text-xs font-mono tabular-nums shrink-0 select-none">
                {telemetry.isRunning || telemetry.isPaused ? (
                  <div
                    data-testid="ftp-unified-progress-line"
                    className="flex items-center gap-4 flex-wrap"
                    dir="ltr"
                  >
                    {/* Files Badge: Neutral */}
                    <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-md bg-secondary/80 border border-border text-foreground font-mono text-xs tabular-nums shadow-xs whitespace-nowrap min-w-[125px]">
                      <span>📁</span>
                      <span>
                        {activeFileNumber} / {telemetry.totalFiles} {isAr ? 'ملفات' : 'Files'}
                      </span>
                    </div>

                    {/* Data Badge: Blue/Indigo subtle */}
                    <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-md bg-sky-500/10 border border-sky-500/25 text-sky-800 dark:text-sky-400 font-mono text-xs tabular-nums shadow-xs whitespace-nowrap min-w-[190px]">
                      <span>☁️</span>
                      <span>
                        {formatBytesPrecise(telemetry.batchBytesTransferred)} /{' '}
                        {formatBytesPrecise(telemetry.batchTotalBytes)}
                      </span>
                    </div>

                    {/* Speed Badge: Green/Emerald subtle (Rigid Fixed Width to Prevent Jitter) */}
                    <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-800 dark:text-emerald-400 font-mono text-xs tabular-nums shadow-xs whitespace-nowrap min-w-[135px]">
                      <span>⚡</span>
                      <span>
                        {telemetry.isPaused
                          ? '0.00 KB/s'
                          : formatSpeedPrecise(telemetry.speedBytesPerSec)}
                      </span>
                    </div>

                    {/* Time Left Badge: Orange/Amber subtle (Stabilized from Average Speed) */}
                    <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-400 font-mono text-xs tabular-nums shadow-xs whitespace-nowrap min-w-[125px]">
                      <span>⏳</span>
                      <span>
                        {telemetry.isPaused
                          ? '--:--:--'
                          : formatTimeLeftHms(stableEtaSeconds)}
                      </span>
                    </div>

                    {/* Time Elapsed Badge: Purple/Violet subtle */}
                    <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-md bg-purple-500/10 border border-purple-500/25 text-purple-800 dark:text-purple-400 font-mono text-xs tabular-nums shadow-xs whitespace-nowrap min-w-[135px]">
                      <span>⏱️</span>
                      <span>
                        {isAr ? 'المنقضي: ' : 'Elapsed: '}
                        {formatElapsedMmSs(elapsedSeconds)}
                      </span>
                    </div>
                  </div>
                ) : isBatchFinished ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-foreground font-sans">
                      {isAr ? 'اكتملت الدفعة —' : 'Batch Finished —'}
                    </span>
                    <div className="flex items-center gap-2 font-mono text-[11px]" dir="ltr">
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                        {isAr ? 'تم الرفع' : 'Uploaded'}: {telemetry.succeededFiles}
                      </span>
                      <span className="text-muted-foreground">|</span>
                      <span className="text-slate-600 dark:text-slate-400 font-bold">
                        {isAr ? 'تم التخطي (مكرر)' : 'Skipped'}: {telemetry.skippedFiles}
                      </span>
                      <span className="text-muted-foreground">|</span>
                      <span
                        className={`font-bold ${
                          telemetry.failedFiles > 0 ? 'text-destructive' : 'text-muted-foreground'
                        }`}
                      >
                        {isAr ? 'فشل' : 'Failed'}: {telemetry.failedFiles}
                      </span>
                      <span className="text-muted-foreground">
                        ({formatEtaSeconds(telemetry.totalDurationSeconds || 0)})
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5">
                    <span className="text-muted-foreground font-sans">
                      {isAr ? 'إجمالي الملفات في القائمة:' : 'Queued Files:'}
                    </span>
                    <span className="font-bold text-foreground font-mono" dir="ltr">
                      {telemetry.completedFiles} / {telemetry.totalFiles} (
                      {formatBytes(telemetry.batchTotalBytes)})
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-sans font-medium">
                      {storedProfile?.hasSavedPassword
                        ? isAr
                          ? '· متصل وجاهز للرفع'
                          : '· Connected & Ready'
                        : isAr
                        ? '· جاهز'
                        : '· Ready'}
                    </span>
                  </div>
                )}
              </div>

              {/* Right: Contextual Actions (Only rendered when queue.length > 0) */}
              <div className="flex items-center justify-end gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="ftp-add-files-btn"
                  disabled={telemetry.isRunning}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 text-xs gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إضافة ملفات' : 'Add Files'}</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="ftp-add-folder-btn"
                  disabled={telemetry.isRunning}
                  onClick={handleAddFolderClick}
                  className="h-8 text-xs gap-1.5 cursor-pointer shrink-0"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-primary" />
                  <span>{isAr ? 'إضافة مجلد' : 'Add Folder'}</span>
                </Button>

                {/* Retry All Failed */}
                {failedItems.length > 0 && !telemetry.isRunning && (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => dreamstimeFtpService.retryAllFailed()}
                    className="h-8 text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold cursor-pointer shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>
                      {isAr ? 'إعادة الفاشلة' : 'Retry Failed'} ({failedItems.length})
                    </span>
                  </Button>
                )}

                {/* Pause / Resume / Start Upload */}
                {telemetry.isRunning ? (
                  telemetry.isPaused ? (
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={() => dreamstimeFtpService.resumeBatch()}
                      className="h-8 text-xs gap-1.5 cursor-pointer shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{isAr ? 'استئناف' : 'Resume'}</span>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => dreamstimeFtpService.pauseBatch()}
                      className="h-8 text-xs gap-1.5 cursor-pointer shrink-0 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>{isAr ? 'إيقاف مؤقت' : 'Pause'}</span>
                    </Button>
                  )
                ) : (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    data-testid="ftp-start-upload-btn"
                    disabled={pendingUploadItems.length === 0}
                    onClick={() => dreamstimeFtpService.startBatchUpload()}
                    className={`h-8 text-xs gap-1.5 cursor-pointer font-semibold shrink-0 ${
                      hasRecoverableSession
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : ''
                    }`}
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>
                      {hasRecoverableSession
                        ? `${isAr ? 'استئناف الرفع' : 'Resume Upload'} (${pendingUploadItems.length})`
                        : `${isAr ? 'بدء الرفع' : 'Start Upload'} (${pendingUploadItems.length})`}
                    </span>
                  </Button>
                )}

                {/* Clear All: True Queue Reset (resets queue to [] and all global counters) */}
                {!telemetry.isRunning && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid="ftp-clear-all-btn"
                    onClick={handleClearAll}
                    className="h-8 text-xs gap-1.5 text-destructive/80 hover:text-destructive hover:bg-destructive/10 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isAr ? 'مسح الكل' : 'Clear All'}</span>
                  </Button>
                )}
              </div>
            </div>

            <Progress
              value={telemetry.batchPercent}
              className={`h-2 w-full ${
                isBatchFinished && telemetry.failedFiles > 0 ? 'bg-destructive/20' : ''
              }`}
            />
          </div>
        )}

        {/* Crash Recovery / Interrupted Session Banner */}
        {hasRecoverableSession && !telemetry.isRunning && pendingUploadItems.length > 0 && (
          <div
            data-testid="ftp-crash-recovery-banner"
            className="shrink-0 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200"
          >
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="font-semibold">
                {isAr
                  ? `تم استعادة الجلسة المتوقفة في وضع الإيقاف المؤقت — ${pendingUploadItems.length} ملفات جاهزة للاستئناف`
                  : `Interrupted session restored in Paused state — ${pendingUploadItems.length} file(s) ready to resume`}
              </span>
            </div>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => dreamstimeFtpService.startBatchUpload()}
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 cursor-pointer gap-1.5"
            >
              <Play className="w-3 h-3" />
              <span>{isAr ? 'استئناف الآن' : 'Resume Now'}</span>
            </Button>
          </div>
        )}

        {/* Sleek Minimalist Completion Alert Bar */}
        {isBatchFinished && queue.length > 0 && (() => {
          const totalSec = Math.max(0, Math.ceil(telemetry.totalDurationSeconds || 0));
          const mins = Math.floor(totalSec / 60);
          const secs = totalSec % 60;
          const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
          const isWarning = telemetry.failedFiles > 0;
          return (
            <div
              className={`shrink-0 px-3 py-1.5 rounded-lg border flex items-center justify-between text-sm transition-all ${
                isWarning
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
              }`}
              dir={isAr ? 'rtl' : 'ltr'}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 text-sm">
                  {isWarning ? '⚠️' : '✅'}
                </span>
                <span className="font-medium truncate">
                  {isAr
                    ? `اكتمل الرفع: ${telemetry.succeededFiles} نجاح، ${telemetry.skippedFiles || 0} تم تخطيه، ${telemetry.failedFiles} فشل (الوقت: ${timeFormatted})`
                    : `Upload Complete: ${telemetry.succeededFiles} Succeeded, ${telemetry.skippedFiles || 0} Skipped, ${telemetry.failedFiles} Failed (Time: ${timeFormatted})`}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="h-6 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 px-2 cursor-pointer gap-1 shrink-0"
              >
                <Trash2 className="w-3 h-3" />
                <span>{isAr ? 'مسح الكل' : 'Clear All'}</span>
              </Button>
            </div>
          );
        })()}

        {/* Queue Table or Empty State Dropzone */}
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
          {/* Sub-Tabs: Shown when queue has items */}
          {queue.length > 0 && (
            <div
              className="shrink-0 h-10 px-3 border-b border-border flex items-center justify-between gap-2"
              dir={isAr ? 'rtl' : 'ltr'}
            >
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('all')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                    activeSubTab === 'all'
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {isAr ? 'قائمة الانتظار' : 'Queue'} ({queue.length})
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
                  {isAr ? 'المكتملة' : 'Completed'} ({succeededItems.length})
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
                  {isAr ? 'الفاشلة' : 'Failed'} ({failedItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('skipped')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                    activeSubTab === 'skipped'
                      ? 'bg-slate-500 text-white font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {isAr ? 'المتخطاة' : 'Skipped'} ({skippedItems.length})
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto">
            {visibleQueue.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-4">
                <div className="w-full border-2 border-dashed border-border hover:border-primary/50 bg-card rounded-xl p-10 text-center transition space-y-3">
                  <div className="w-11 h-11 rounded-xl bg-secondary text-primary flex items-center justify-center mx-auto border border-border">
                    <CloudUpload className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      {queue.length === 0
                        ? isAr
                          ? 'اسحب الملفات أو المجلدات هنا لرفعها إلى Dreamstime'
                          : 'Drop Files or Shoot Folders Here'
                        : isAr
                        ? 'لا توجد ملفات في هذا التبويب'
                        : 'No files in this tab'}
                    </h3>
                    {queue.length === 0 && (
                      <p className="text-xs text-muted-foreground max-w-md mx-auto">
                        {isAr
                          ? 'يتم تلقائياً ربط أزواج الفيكتور (JPG + EPS) وترتيب الصور ثم الفيكتور ثم الفيديو'
                          : 'Automatically pairs JPG + EPS Vector Bundles and sorts Photos → Vectors → Videos'}
                      </p>
                    )}
                  </div>

                  {queue.length === 0 && (
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        data-testid="ftp-add-files-btn"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-8 px-3 text-xs gap-1.5 cursor-pointer font-semibold"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isAr ? 'إضافة ملفات' : 'Add Files'}</span>
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid="ftp-add-folder-btn"
                        onClick={handleAddFolderClick}
                        className="h-8 px-3 text-xs gap-1.5 cursor-pointer font-semibold"
                      >
                        <FolderPlus className="w-3.5 h-3.5 text-primary" />
                        <span>{isAr ? 'إضافة مجلد' : 'Add Folder'}</span>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <table
                className={`w-full border-collapse text-xs ${isAr ? 'text-right' : 'text-left'}`}
                dir={isAr ? 'rtl' : 'ltr'}
              >
                <thead className="sticky top-0 bg-card border-b border-border text-[11px] font-mono text-muted-foreground z-10">
                  <tr>
                    <th className="py-2 px-3">{isAr ? 'الملف' : 'File'}</th>
                    <th className="py-2 px-2.5">{isAr ? 'النوع' : 'Type'}</th>
                    <th className="py-2 px-2.5">{isAr ? 'الوجهة' : 'Destination'}</th>
                    <th className="py-2 px-2.5">{isAr ? 'الحجم' : 'Size'}</th>
                    <th className="py-2 px-2.5 w-48">{isAr ? 'التقدم' : 'Progress'}</th>
                    <th className="py-2 px-2.5">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className={`py-2 px-3 ${isAr ? 'text-left' : 'text-right'}`} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleQueue.map((item) => (
                    <tr key={item.id} className="hover:bg-secondary/30">
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {getMediaIcon(item)}
                          <Tooltip
                            side={isAr ? 'left' : 'right'}
                            className="p-3 bg-popover/95 backdrop-blur-md border border-border shadow-2xl rounded-xl pointer-events-auto max-w-[460px] w-[380px] sm:w-[440px]"
                            content={
                              <div
                                className="flex flex-col items-center gap-2 w-full text-center"
                                dir={isAr ? 'rtl' : 'ltr'}
                              >
                                {renderMediaPreviewContent(item, 'hover')}
                                <div className="flex flex-col items-center gap-0.5 w-full">
                                  <span
                                    className="text-xs font-mono text-foreground font-semibold break-all w-full text-center px-1"
                                    dir="ltr"
                                  >
                                    {item.displayName || item.filename}
                                  </span>
                                  <span className="text-[11px] font-mono text-muted-foreground">
                                    {getMediaTypeLabel(item, language)} · {formatBytes(item.fileSize)}
                                  </span>
                                </div>
                                {item.isVectorBundle && item.jpgPart && item.epsPart && (
                                  <div
                                    className="text-[10px] font-mono text-amber-400/90 text-center space-y-0.5 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1 w-full"
                                    dir="ltr"
                                  >
                                    <div>1) {item.jpgPart.filename} → /</div>
                                    <div>2) {item.epsPart.filename} → /additional</div>
                                  </div>
                                )}
                              </div>
                            }
                          >
                            <button
                              type="button"
                              onClick={() => setPreviewModalItem(item)}
                              className="flex items-center gap-1.5 cursor-pointer group min-w-0 text-left"
                            >
                              <span
                                className="font-mono text-xs text-foreground group-hover:text-primary transition truncate max-w-[320px]"
                                dir="ltr"
                              >
                                {item.displayName || item.filename}
                              </span>
                              {item.isVectorBundle && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-mono text-amber-300 shrink-0">
                                  JPG + EPS
                                </span>
                              )}
                              <Search className="w-3 h-3 text-muted-foreground ml-1 group-hover:text-primary transition shrink-0" />
                            </button>
                          </Tooltip>
                        </div>
                      </td>
                      <td className="py-2 px-2.5 text-muted-foreground font-medium">
                        {getMediaTypeLabel(item, language)}
                      </td>
                      <td className="py-2 px-2.5">
                        <span
                          dir="ltr"
                          className={`text-[11px] font-mono px-2 py-0.5 rounded border inline-block ${getRemoteFolderBadgeStyle(
                            item.remoteFolder,
                            item.isVectorBundle
                          )}`}
                        >
                          {item.isVectorBundle ? '/ → /additional' : item.remoteFolder}
                        </span>
                      </td>
                      <td
                        className="py-2 px-2.5 font-mono text-xs tabular-nums text-muted-foreground"
                        dir="ltr"
                      >
                        {formatBytes(item.fileSize)}
                      </td>
                      <td className="py-2 px-2.5">
                        <div className="flex items-center gap-2">
                          <Progress value={item.progressPercent} className="h-1.5 flex-1" />
                          <span
                            className={`text-[11px] font-mono tabular-nums text-muted-foreground w-8 ${
                              isAr ? 'text-left' : 'text-right'
                            }`}
                            dir="ltr"
                          >
                            {item.progressPercent}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-2.5 text-xs">
                        {item.status === 'succeeded' && (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {isAr ? 'تم الرفع' : 'Done'}
                          </span>
                        )}
                        {item.status === 'uploading' && (
                          <span className="inline-flex items-center gap-1 text-primary">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            {isAr ? 'جارٍ الرفع...' : 'Uploading'}
                          </span>
                        )}
                        {(item.status === 'retrying' || item.status === 'retry') && (
                          <span className="inline-flex items-center gap-1 text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {isAr
                              ? `إعادة محاولة (${item.retryCount}/${item.maxRetries})`
                              : `Retry ${item.retryCount}/${item.maxRetries}`}
                          </span>
                        )}
                        {item.status === 'queued' && (
                          <span className="text-muted-foreground">
                            {isAr ? 'في الانتظار' : 'Queued'}
                          </span>
                        )}
                        {item.status === 'skipped' && (
                          <Tooltip
                            content={
                              item.errorMessage ||
                              (isAr
                                ? 'تم التخطي: الملف موجود مسبقاً على خادم Dreamstime (550)'
                                : 'Skipped: File already exists on Dreamstime server (550)')
                            }
                          >
                            <span className="inline-flex items-center gap-1 text-slate-400 bg-slate-500/10 border border-slate-500/25 px-2 py-0.5 rounded text-[11px] font-medium cursor-help">
                              <span>🚫</span>
                              <span>{isAr ? 'تخطي' : 'Skipped'}</span>
                            </span>
                          </Tooltip>
                        )}
                        {item.status === 'failed' && (
                          <Tooltip
                            content={item.errorMessage || (isAr ? 'فشل الرفع' : 'Upload failed')}
                          >
                            <span className="inline-flex items-center gap-1 text-destructive font-medium cursor-help">
                              <XCircle className="w-3.5 h-3.5" />
                              {isAr ? 'فشل' : 'Failed'}
                            </span>
                          </Tooltip>
                        )}
                      </td>
                      <td className={`py-2 px-3 ${isAr ? 'text-left' : 'text-right'}`}>
                        <div
                          className={`flex items-center gap-1 ${
                            isAr ? 'justify-start' : 'justify-end'
                          }`}
                        >
                          {/* Individual Retry Button for Failed Items */}
                          {item.status === 'failed' && !telemetry.isRunning && (
                            <Tooltip
                              content={isAr ? 'إعادة محاولة هذا الملف' : 'Retry this file'}
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => dreamstimeFtpService.retrySingleItem(item.id)}
                                className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 gap-1 cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>{isAr ? 'إعادة' : 'Retry'}</span>
                              </Button>
                            </Tooltip>
                          )}
                          {/* Open File Location in Windows Explorer */}
                          {item.localPath && (
                            <Tooltip content={isAr ? 'فتح موقع الملف' : 'Open file location'}>
                              <button
                                type="button"
                                onClick={() => handleOpenFileLocation(item.localPath)}
                                className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer transition"
                                title={isAr ? 'فتح موقع الملف' : 'Open file location'}
                              >
                                <FolderOpen className="w-3.5 h-3.5" />
                              </button>
                            </Tooltip>
                          )}

                          {!telemetry.isRunning && (
                            <Tooltip content={isAr ? 'حذف من القائمة' : 'Remove from queue'}>
                              <button
                                type="button"
                                onClick={() => dreamstimeFtpService.removeItem(item.id)}
                                className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive cursor-pointer transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Media Lightbox Preview Modal (Opened on clicking filename or magnifier icon) */}
      {/* Media Preview Modal Dialog (Enlarged max-w-2xl / w-[650px]) */}
      <DialogRoot
        open={Boolean(previewModalItem)}
        onOpenChange={(open) => {
          if (!open) setPreviewModalItem(null);
        }}
      >
        <DialogContent
          className="fixed inset-0 m-auto h-fit max-h-[92vh] sm:max-w-2xl w-[95vw] md:w-[650px] overflow-hidden"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <DialogHeader className={isAr ? 'pe-2 ps-8' : 'pe-8 ps-2'}>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold font-mono" dir="ltr">
              {previewModalItem && getMediaIcon(previewModalItem)}
              <span className="truncate">
                {previewModalItem?.displayName || previewModalItem?.filename}
              </span>
            </DialogTitle>
          </DialogHeader>
          {previewModalItem && (
            <div className="space-y-3 py-2">
              <div className="w-full flex items-center justify-center overflow-hidden rounded-lg bg-black/40">
                {renderMediaPreviewContent(previewModalItem, 'modal')}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground font-mono px-1">
                <span>
                  {getMediaTypeLabel(previewModalItem, language)} ·{' '}
                  {formatBytes(previewModalItem.fileSize)}
                </span>
                <span dir="ltr">
                  {previewModalItem.isVectorBundle
                    ? '/ → /additional'
                    : previewModalItem.remotePath}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPreviewModalItem(null)}
              className="h-8 text-xs cursor-pointer"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>

      {/* Site Settings Modal: Plain FTP Port 21 (Host, Username, Password) */}
      <DialogRoot open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent
          className="fixed inset-0 m-auto h-fit max-h-[90vh] sm:max-w-md"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <DialogHeader className={isAr ? 'pe-2 ps-8' : 'pe-8 ps-2'}>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold">
              <Lock className="w-4 h-4 text-primary" />
              <span>
                {isAr
                  ? 'إعدادات خادم Dreamstime (FTP Site Settings)'
                  : 'Dreamstime FTP Site Settings'}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <span>{isAr ? 'الخادم' : 'Host'}</span>
                {isAr && (
                  <span className="text-muted-foreground font-mono text-[11px]" dir="ltr">
                    (Host)
                  </span>
                )}
              </label>
              <Input
                data-testid="ftp-host-input"
                dir="ltr"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="ftp.dreamstime.com"
                className="h-9 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <span>{isAr ? 'اسم المستخدم' : 'Username'}</span>
                {isAr && (
                  <span className="text-muted-foreground font-mono text-[11px]" dir="ltr">
                    (Username)
                  </span>
                )}
              </label>
              <Input
                data-testid="ftp-username-input"
                dir="ltr"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Dreamstime username"
                className="h-9 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <span>{isAr ? 'كلمة المرور' : 'Password'}</span>
                  {isAr && (
                    <span className="text-muted-foreground font-mono text-[11px]" dir="ltr">
                      (Password)
                    </span>
                  )}
                </label>
                {storedProfile?.hasSavedPassword && (
                  <span className="text-[11px] text-emerald-400 font-medium">
                    {isAr ? 'محفوظة في الخزنة الآمنة' : 'Saved in Secure Vault'}
                  </span>
                )}
              </div>
              <div className="relative">
                <Input
                  data-testid="ftp-password-input"
                  dir="ltr"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="FTP password"
                  className={`h-9 text-xs font-mono ${isAr ? 'pl-8' : 'pr-8'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className={`absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer ${
                    isAr ? 'left-2.5' : 'right-2.5'
                  }`}
                >
                  {showPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {vaultStatus.type !== 'idle' && (
              <p
                className={`text-xs font-medium ${
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

          <DialogFooter className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              <Server className="w-3.5 h-3.5" />
              <span>{isAr ? 'اختبار الاتصال' : 'Test Connection'}</span>
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsSettingsOpen(false)}
                className="h-8 text-xs cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleSaveCredentials}
                className="h-8 text-xs cursor-pointer font-semibold"
              >
                {isAr ? 'حفظ البيانات' : 'Save Credentials'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </div>
  );
};
