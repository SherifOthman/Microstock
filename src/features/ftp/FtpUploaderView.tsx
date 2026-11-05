import React, { useEffect, useRef, useState } from 'react';
import { db, useSqliteQuery } from '../../db';
import {
  DreamstimeRemoteFolder,
  formatBytes,
  formatEtaSeconds,
  formatTransferSpeed,
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
  Coffee,
  Eye,
  EyeOff,
  FileImage,
  FileVideo,
  FolderPlus,
  Layers,
  Lock,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Settings,
  Square,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

type QueueSubTab = 'all' | 'succeeded' | 'failed' | 'skipped';

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

function getMediaTypeLabel(mediaType: FtpQueueItem['mediaType'], language: string): string {
  if (mediaType === 'vector') return language === 'ar' ? 'فيكتور' : 'Vector';
  if (mediaType === 'video') return language === 'ar' ? 'فيديو' : 'Video';
  return language === 'ar' ? 'صورة' : 'Photo';
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
    .map((item) => (typeof (item as any).webkitGetAsEntry === 'function' ? (item as any).webkitGetAsEntry() : null))
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

export const FtpUploaderView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const [queue, setQueue] = useState<FtpQueueItem[]>(() => dreamstimeFtpService.getQueue());
  const [telemetry, setTelemetry] = useState<FtpTelemetryFrame>(() =>
    dreamstimeFtpService.getTelemetry()
  );
  const [activeSubTab, setActiveSubTab] = useState<QueueSubTab>('all');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const storedProfile = useSqliteQuery(() => db.ftp.getProfile('dreamstime'), [], undefined);

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
    };
    const unsub = dreamstimeFtpService.subscribe(sync);
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

      // Keep password masked in input (do not clear field), automatically close modal
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

  const succeededItems = queue.filter((i) => i.status === 'succeeded');
  const failedItems = queue.filter((i) => i.status === 'failed');
  const skippedItems = queue.filter((i) => i.status === 'skipped');
  const pendingUploadItems = queue.filter(
    (i) => i.status === 'queued' || i.status === 'retry' || i.status === 'retrying'
  );

  const visibleQueue =
    activeSubTab === 'succeeded'
      ? succeededItems
      : activeSubTab === 'failed'
      ? failedItems
      : activeSubTab === 'skipped'
      ? skippedItems
      : queue;

  return (
    <div
      data-testid="ftp-uploader-view"
      className="flex-1 min-h-0 h-full flex flex-col gap-3 overflow-hidden select-none"
    >
      {/* Top Header Bar: Title + Online Status (+ subtle ☕ when active) + Site Settings */}
      <div className="shrink-0 h-12 px-4 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {getPlatformLogo('dreamstime', 18)}
          <h1 className="text-sm font-bold tracking-tight text-foreground truncate whitespace-nowrap">
            {isAr ? 'رافع خادم Dreamstime FTP' : 'Dreamstime FTP Uploader'}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
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

          {/* Compact Connection Status Pill with Shadcn Tooltip */}
          <Tooltip
            content={
              storedProfile?.username
                ? `${storedProfile.username}@${storedProfile.host || 'ftp.dreamstime.com'} (Port 21)`
                : isAr
                ? 'غير متصل - يرجى حفظ بيانات الدخول'
                : 'Offline - Please configure credentials'
            }
          >
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/50 border border-border text-xs font-medium cursor-help">
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
        {/* Progress & Controls Bar: Fixed Layout to Eliminate UI Shifts */}
        <div className="shrink-0 p-3.5 rounded-xl border border-border bg-card space-y-2.5">
          <div
            className="flex items-center justify-between gap-4 h-9"
            dir={isAr ? 'rtl' : 'ltr'}
          >
            {/* Left: Fixed Metrics Strip - shrink-0 so it NEVER shifts */}
            <div className="flex items-center gap-4 text-xs font-mono tabular-nums shrink-0 select-none">
              <div>
                <span className="text-muted-foreground">
                  {isAr ? 'إجمالي الملفات: ' : 'Total Files: '}
                </span>
                <span className="font-bold text-foreground">
                  {telemetry.completedFiles} / {telemetry.totalFiles} ({telemetry.batchPercent}%)
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {isAr ? 'سرعة الرفع: ' : 'Upload Speed: '}
                </span>
                <span className="font-bold text-emerald-400">
                  {telemetry.isRunning ? formatTransferSpeed(telemetry.speedBytesPerSec) : '0 KB/s'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {isAr ? 'الوقت المتبقي: ' : 'Time Remaining: '}
                </span>
                <span className="font-bold text-foreground">
                  {formatEtaSeconds(telemetry.etaSeconds)}
                </span>
              </div>
              <div className="text-muted-foreground font-sans text-xs">
                {telemetry.isRunning ? (
                  <span className="text-primary font-medium">
                    {isAr ? 'جارٍ الرفع...' : 'Uploading...'}
                  </span>
                ) : storedProfile?.hasSavedPassword ? (
                  <span className="text-emerald-400 font-medium">
                    {isAr ? 'متصل · جاهز للرفع' : 'Connected · Ready'}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {isAr ? 'جاهز' : 'Ready'}
                  </span>
                )}
              </div>
            </div>

            {/* Right: Actions Container with fixed min-width to prevent any layout shifts */}
            <div className="flex items-center justify-end gap-1.5 shrink-0 min-w-[340px]">
              {/* Hidden Pickers */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,.bmp,.eps,.ai,.svg,.cdr,.mp4,.mov,.webm,.avi,.mkv,.m4v"
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

              {/* Clear Completed */}
              {succeededItems.length > 0 && !telemetry.isRunning && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => dreamstimeFtpService.clearCompleted()}
                  className="h-8 text-xs gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground shrink-0"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {isAr ? 'مسح المكتملة' : 'Clear Completed'} ({succeededItems.length})
                  </span>
                </Button>
              )}

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

              {telemetry.isRunning ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => dreamstimeFtpService.abortBatch()}
                  className="h-8 text-xs gap-1.5 cursor-pointer shrink-0"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إيقاف' : 'Stop'}</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={pendingUploadItems.length === 0}
                  onClick={() => dreamstimeFtpService.startBatchUpload()}
                  className="h-8 text-xs gap-1.5 cursor-pointer font-semibold shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>
                    {isAr ? 'بدء الرفع' : 'Start Upload'} ({pendingUploadItems.length})
                  </span>
                </Button>
              )}

              {/* Clear All Queue - Isolated at the far end with Shadcn Tooltip */}
              {queue.length > 0 && !telemetry.isRunning && (
                <Tooltip content={isAr ? 'مسح كافة الملفات من القائمة' : 'Clear entire queue'}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => dreamstimeFtpService.clearQueue()}
                    className="h-8 px-2 text-muted-foreground hover:text-destructive cursor-pointer gap-1 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline text-xs">
                      {isAr ? 'مسح الكل' : 'Clear All'}
                    </span>
                  </Button>
                </Tooltip>
              )}
            </div>
          </div>

          <Progress value={telemetry.batchPercent} className="h-2 w-full" />
        </div>

        {/* Completion Banner with Session Summary Duration */}
        {telemetry.completedFiles > 0 &&
          telemetry.completedFiles === telemetry.totalFiles &&
          !telemetry.isRunning && (
            <div className="shrink-0 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-xs text-emerald-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="font-semibold">
                  {isAr
                    ? `اكتمل الرفع: ${telemetry.succeededFiles} نجاح${
                        telemetry.failedFiles > 0 ? `، ${telemetry.failedFiles} فشل` : ''
                      }${
                        (telemetry.skippedFiles || 0) > 0 ? `، ${telemetry.skippedFiles} تخطي` : ''
                      }. الوقت الإجمالي: ${formatEtaSeconds(telemetry.totalDurationSeconds || 0)}`
                    : `Upload Complete: ${telemetry.succeededFiles} succeeded${
                        telemetry.failedFiles > 0 ? `, ${telemetry.failedFiles} failed` : ''
                      }${
                        (telemetry.skippedFiles || 0) > 0 ? `, ${telemetry.skippedFiles} skipped` : ''
                      }. Total Time: ${formatEtaSeconds(telemetry.totalDurationSeconds || 0)}`}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dreamstimeFtpService.clearCompleted()}
                className="h-6 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 px-2 cursor-pointer"
              >
                {isAr ? 'مسح المكتملة' : 'Clear Completed'}
              </Button>
            </div>
          )}

        {/* Queue Table (Strictly Static Visual Array) */}
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
          {/* Sub-Tabs */}
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

            <span className="text-[11px] font-mono text-muted-foreground hidden sm:inline" dir="ltr">
              Photos → Vectors → Videos
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {visibleQueue.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <UploadCloud className="w-9 h-9 text-primary mb-2.5 opacity-80" />
                <h3 className="text-xs sm:text-sm font-semibold text-foreground">
                  {isAr ? 'اسحب الملفات أو المجلدات هنا' : 'Drop Files or Shoot Folders Here'}
                </h3>
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
                          {getMediaIcon(item.mediaType)}
                          <Tooltip
                            side="right"
                            className="p-1.5 bg-popover/95 backdrop-blur-sm border border-border shadow-xl rounded-lg pointer-events-auto"
                            content={
                              <div className="flex flex-col items-center gap-1.5 p-1 max-w-[200px]">
                                {item.fileObject || item.localPath ? (
                                  <img
                                    src={
                                      item.fileObject
                                        ? URL.createObjectURL(item.fileObject)
                                        : item.localPath
                                        ? `stockflow://local?path=${encodeURIComponent(item.localPath)}`
                                        : ''
                                    }
                                    alt={item.filename}
                                    className="w-44 h-28 object-cover rounded-md border border-border bg-black/40 shadow-inner"
                                    onError={(e) => {
                                      (e.currentTarget as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <div className="w-44 h-28 rounded-md border border-border bg-secondary flex items-center justify-center text-muted-foreground text-xs font-mono">
                                    No Preview
                                  </div>
                                )}
                                <span
                                  className="text-[10px] font-mono text-muted-foreground truncate max-w-[170px] text-center"
                                  dir="ltr"
                                >
                                  {item.filename}
                                </span>
                              </div>
                            }
                          >
                            <div className="flex items-center gap-1.5 cursor-pointer group min-w-0">
                              <span
                                className="font-mono text-xs text-foreground group-hover:text-primary transition truncate max-w-[320px]"
                                dir="ltr"
                              >
                                {item.filename}
                              </span>
                              <Search className="w-3 h-3 text-muted-foreground ml-2 group-hover:text-primary transition shrink-0" />
                            </div>
                          </Tooltip>
                        </div>
                      </td>
                      <td className="py-2 px-2.5 text-muted-foreground font-medium">
                        {getMediaTypeLabel(item.mediaType, language)}
                      </td>
                      <td className="py-2 px-2.5">
                        <span
                          dir="ltr"
                          className={`text-[11px] font-mono px-2 py-0.5 rounded border inline-block ${getRemoteFolderBadgeStyle(
                            item.remoteFolder
                          )}`}
                        >
                          {item.remoteFolder}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 font-mono text-xs tabular-nums text-muted-foreground" dir="ltr">
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
                              isAr
                                ? 'تم التخطي: الملف موجود مسبقاً أو السيرفر يرفض الاستقبال'
                                : 'Skipped: File already exists or server rejected'
                            }
                          >
                            <span className="inline-flex items-center gap-1 text-slate-400 bg-slate-500/10 border border-slate-500/25 px-2 py-0.5 rounded text-[11px] font-medium cursor-help">
                              <span>🚫</span>
                              <span>{isAr ? 'تخطي' : 'Skipped'}</span>
                            </span>
                          </Tooltip>
                        )}
                        {item.status === 'failed' && (
                          <Tooltip content={item.errorMessage || (isAr ? 'فشل الرفع' : 'Upload failed')}>
                            <span className="inline-flex items-center gap-1 text-destructive font-medium cursor-help">
                              <XCircle className="w-3.5 h-3.5" />
                              {isAr ? 'فشل' : 'Failed'}
                            </span>
                          </Tooltip>
                        )}
                      </td>
                      <td className={`py-2 px-3 ${isAr ? 'text-left' : 'text-right'}`}>
                        <div className={`flex items-center gap-1 ${isAr ? 'justify-start' : 'justify-end'}`}>
                          {/* Individual Retry Button for Failed Items with Shadcn Tooltip */}
                          {item.status === 'failed' && !telemetry.isRunning && (
                            <Tooltip content={isAr ? 'إعادة محاولة هذا الملف' : 'Retry this file'}>
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
                          {!telemetry.isRunning && (
                            <Tooltip content={isAr ? 'حذف من القائمة' : 'Remove from queue'}>
                              <button
                                type="button"
                                onClick={() => dreamstimeFtpService.removeItem(item.id)}
                                className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive cursor-pointer"
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

      {/* Site Settings Modal: Plain FTP Port 21 (Host, Username, Password) */}
      <DialogRoot open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-md" dir={isAr ? 'rtl' : 'ltr'}>
          <DialogHeader>
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
              <label className="text-xs font-medium text-foreground block">
                {isAr ? 'الخادم (Host)' : 'Host'}
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
              <label className="text-xs font-medium text-foreground block">
                {isAr ? 'اسم المستخدم (Username)' : 'Username'}
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
                <label className="text-xs font-medium text-foreground block">
                  {isAr ? 'كلمة المرور (Password)' : 'Password'}
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
