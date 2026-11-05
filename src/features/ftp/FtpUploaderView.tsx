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
import {
  DialogContent,
  DialogDescription,
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
  Server,
  Settings,
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
      message: language === 'ar' ? 'جارٍ التحقق والاتصال...' : 'Testing connection...',
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
          message: testRes.error || (language === 'ar' ? 'فشل الاتصال بخادم FTP' : 'Connection failed'),
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
        message: language === 'ar' ? 'تم التحقق وحفظ البيانات بنجاح' : 'Connected & Saved Successfully',
      });

      // Keep password masked in input (do not clear field), automatically close modal
      setTimeout(() => {
        setIsSettingsOpen(false);
      }, 500);
    } catch (err: any) {
      setVaultStatus({
        type: 'error',
        message: err?.message || (language === 'ar' ? 'فشل الحفظ' : 'Failed to save credentials'),
      });
    }
  };

  const handleTestConnection = async () => {
    setVaultStatus({
      type: 'testing',
      message: language === 'ar' ? 'جارٍ اختبار الاتصال عبر Port 21...' : 'Testing Plain FTP (Port 21)...',
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
          message: language === 'ar'
            ? `متصل بنجاح (${res.latencyMs || 35}ms)`
            : `Connected (${res.latencyMs || 35}ms)`,
        });
      } else {
        setVaultStatus({
          type: 'error',
          message: res.error || (language === 'ar' ? 'فشل الاتصال' : 'Connection failed'),
        });
      }
    } catch (err: any) {
      setVaultStatus({
        type: 'error',
        message: err?.message || (language === 'ar' ? 'خطأ في الاتصال' : 'Connection error'),
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

  const isKeepAwake = dreamstimeFtpService.isKeepAwakeActive();

  return (
    <div
      data-testid="ftp-uploader-view"
      className="flex-1 min-h-0 h-full flex flex-col gap-3 overflow-hidden select-none"
    >
      {/* Top Header Bar: Title + Auto-Routing Summary + Keep Awake + Site Settings */}
      <div className="shrink-0 h-12 px-4 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {getPlatformLogo('dreamstime', 18)}
          <h1 className="text-sm font-bold tracking-tight text-foreground truncate">
            {language === 'ar' ? 'رافع Dreamstime FTP' : 'Dreamstime FTP Uploader'}
          </h1>

          {/* Auto-Routing Rules Summary */}
          <div
            dir="ltr"
            className="hidden md:flex items-center gap-2 pl-3 border-l border-border text-xs"
          >
            <span className="text-muted-foreground font-medium">Auto-Routing Rules:</span>
            <span className="px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/25 font-mono text-sky-400">
              Photos → / ({rootCount})
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 font-mono text-amber-400">
              Vectors → /additional ({vectorCount})
            </span>
            <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/25 font-mono text-purple-400">
              Videos → /video ({videoCount})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* OS Power Management: Keep Awake Toggle */}
          <button
            type="button"
            onClick={async () => {
              const next = !dreamstimeFtpService.isKeepAwakeActive();
              await dreamstimeFtpService.setKeepAwake(next);
              setTelemetry({ ...dreamstimeFtpService.getTelemetry() });
            }}
            title={
              language === 'ar'
                ? 'منع وضع السكون أثناء تشغيل المهام (Keep Awake)'
                : 'Prevents system sleep while active (Keep Awake)'
            }
            className={`h-8 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
              isKeepAwake
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-secondary/40 text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            <Coffee className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {language === 'ar' ? 'مستمر بدون نوم' : 'Keep Awake'}
            </span>
          </button>

          {storedProfile?.username && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono" dir="ltr">
              <span
                className={`w-2 h-2 rounded-full ${
                  storedProfile.hasSavedPassword ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              {storedProfile.username}@{storedProfile.host || 'ftp.dreamstime.com'}
            </span>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="ftp-site-settings-btn"
            onClick={() => setIsSettingsOpen(true)}
            className="h-8 text-xs gap-1.5 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-primary" />
            <span>{language === 'ar' ? 'إعدادات الموقع' : 'Site Settings'}</span>
          </Button>
        </div>
      </div>

      {/* Full-Width Main Workspace */}
      <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
        {/* Progress & Controls Bar */}
        <div className="shrink-0 p-3.5 rounded-xl border border-border bg-card space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3" dir="ltr">
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
              <div>
                <span className="text-muted-foreground">
                  {language === 'ar' ? 'إجمالي الملفات: ' : 'Total Files: '}
                </span>
                <span className="font-bold text-foreground">
                  {telemetry.completedFiles} / {telemetry.totalFiles} ({telemetry.batchPercent}%)
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {language === 'ar' ? 'سرعة الرفع: ' : 'Upload Speed: '}
                </span>
                <span className="font-bold text-emerald-400">
                  {telemetry.isRunning ? formatTransferSpeed(telemetry.speedBytesPerSec) : '0 KB/s'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {language === 'ar' ? 'الوقت المتبقي: ' : 'Time Remaining: '}
                </span>
                <span className="font-bold text-foreground">
                  {formatEtaSeconds(telemetry.etaSeconds)}
                </span>
              </div>
              {telemetry.statusMessage && (
                <span className="text-muted-foreground truncate max-w-md hidden xl:inline">
                  {telemetry.statusMessage}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
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
                className="h-8 text-xs gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'إضافة ملفات' : 'Add Files'}</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="ftp-add-folder-btn"
                disabled={telemetry.isRunning}
                onClick={handleAddFolderClick}
                className="h-8 text-xs gap-1.5 cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5 text-primary" />
                <span>{language === 'ar' ? 'إضافة مجلد' : 'Add Folder'}</span>
              </Button>

              {/* Clear Completed */}
              {succeededItems.length > 0 && !telemetry.isRunning && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => dreamstimeFtpService.clearCompleted()}
                  className="h-8 text-xs gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{language === 'ar' ? 'مسح المكتملة' : 'Clear Completed'} ({succeededItems.length})</span>
                </Button>
              )}

              {/* Retry All Failed */}
              {failedItems.length > 0 && !telemetry.isRunning && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => dreamstimeFtpService.retryAllFailed()}
                  className="h-8 text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'إعادة الفاشلة' : 'Retry Failed'} ({failedItems.length})</span>
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
                  <span>{language === 'ar' ? 'إيقاف' : 'Stop'}</span>
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
                  <span>{language === 'ar' ? 'بدء الرفع' : 'Start Upload'} ({queuedItems.length})</span>
                </Button>
              )}

              {queue.length > 0 && !telemetry.isRunning && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => dreamstimeFtpService.clearQueue()}
                  className="h-8 px-2 text-muted-foreground hover:text-destructive cursor-pointer"
                  title={language === 'ar' ? 'مسح القائمة كاملة' : 'Clear Queue'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>

          <Progress value={telemetry.batchPercent} className="h-2" />
        </div>

        {/* Completion Banner */}
        {telemetry.completedFiles > 0 &&
          telemetry.completedFiles === telemetry.totalFiles &&
          !telemetry.isRunning && (
            <div className="shrink-0 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-xs text-emerald-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="font-semibold">
                  {language === 'ar'
                    ? `اكتمل الرفع: نجح ${telemetry.succeededFiles} ملف${telemetry.failedFiles > 0 ? `، وفشل ${telemetry.failedFiles} ملف` : ''}.`
                    : `Upload Complete: ${telemetry.succeededFiles} uploaded${telemetry.failedFiles > 0 ? `, ${telemetry.failedFiles} failed` : ''}.`}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dreamstimeFtpService.clearCompleted()}
                className="h-6 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 px-2 cursor-pointer"
              >
                {language === 'ar' ? 'مسح المكتملة' : 'Clear Completed'}
              </Button>
            </div>
          )}

        {/* Queue Table */}
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
            dir="ltr"
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
                {language === 'ar' ? 'قائمة الانتظار' : 'Queue'} ({queue.length})
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
                {language === 'ar' ? 'المكتملة' : 'Completed'} ({succeededItems.length})
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
                {language === 'ar' ? 'الفاشلة' : 'Failed'} ({failedItems.length})
              </button>
            </div>

            <span className="text-[11px] font-mono text-muted-foreground hidden sm:inline">
              Photos → Vectors → Videos
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {visibleQueue.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <UploadCloud className="w-9 h-9 text-primary mb-2.5 opacity-80" />
                <h3 className="text-xs sm:text-sm font-semibold text-foreground">
                  {language === 'ar' ? 'اسحب الملفات أو المجلدات هنا' : 'Drop Files or Shoot Folders Here'}
                </h3>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs" dir="ltr">
                <thead className="sticky top-0 bg-card border-b border-border text-[11px] font-mono text-muted-foreground z-10">
                  <tr>
                    <th className="py-2 px-3">{language === 'ar' ? 'الملف' : 'File'}</th>
                    <th className="py-2 px-2.5">{language === 'ar' ? 'النوع' : 'Type'}</th>
                    <th className="py-2 px-2.5">{language === 'ar' ? 'الوجهة' : 'Destination'}</th>
                    <th className="py-2 px-2.5">{language === 'ar' ? 'الحجم' : 'Size'}</th>
                    <th className="py-2 px-2.5 w-48">{language === 'ar' ? 'التقدم' : 'Progress'}</th>
                    <th className="py-2 px-2.5">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                    <th className="py-2 px-3 text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleQueue.map((item) => (
                    <tr key={item.id} className="hover:bg-secondary/30">
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {getMediaIcon(item.mediaType)}
                          <span className="font-mono text-xs text-foreground truncate max-w-[340px]">
                            {item.filename}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-2.5 text-muted-foreground font-medium">
                        {getMediaTypeLabel(item.mediaType, language)}
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
                            {language === 'ar' ? 'تم الرفع' : 'Done'}
                          </span>
                        )}
                        {item.status === 'uploading' && (
                          <span className="inline-flex items-center gap-1 text-primary">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            {language === 'ar' ? 'جارٍ الرفع...' : 'Uploading'}
                          </span>
                        )}
                        {item.status === 'retrying' && (
                          <span className="inline-flex items-center gap-1 text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {language === 'ar'
                              ? `محاولة ${item.retryCount}/${item.maxRetries}`
                              : `Retry ${item.retryCount}/${item.maxRetries}`}
                          </span>
                        )}
                        {item.status === 'queued' && (
                          <span className="text-muted-foreground">
                            {language === 'ar' ? 'في الانتظار' : 'Queued'}
                          </span>
                        )}
                        {item.status === 'failed' && (
                          <span
                            className="inline-flex items-center gap-1 text-destructive font-medium cursor-help"
                            title={item.errorMessage}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            {language === 'ar' ? 'فشل' : 'Failed'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Individual Retry Button for Failed Items */}
                          {item.status === 'failed' && !telemetry.isRunning && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => dreamstimeFtpService.retrySingleItem(item.id)}
                              className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 gap-1 cursor-pointer"
                              title={language === 'ar' ? 'إعادة محاولة هذا الملف' : 'Retry this file'}
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>{language === 'ar' ? 'إعادة' : 'Retry'}</span>
                            </Button>
                          )}
                          {!telemetry.isRunning && (
                            <button
                              type="button"
                              onClick={() => dreamstimeFtpService.removeItem(item.id)}
                              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive cursor-pointer"
                              title={language === 'ar' ? 'حذف من القائمة' : 'Remove'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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

      {/* Site Settings Modal (Plain FTP Port 21: Host, Username, Password) */}
      <DialogRoot open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-md" dir="ltr">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold">
              <Lock className="w-4 h-4 text-primary" />
              <span>{language === 'ar' ? 'إعدادات خادم Dreamstime FTP' : 'Dreamstime FTP Site Settings'}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Standard Plain FTP (Port 21). Passwords are encrypted locally via Electron safeStorage.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground block">
                {language === 'ar' ? 'الخادم (Host)' : 'Host'}
              </label>
              <Input
                data-testid="ftp-host-input"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="ftp.dreamstime.com"
                className="h-9 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground block">
                {language === 'ar' ? 'اسم المستخدم (Username)' : 'Username'}
              </label>
              <Input
                data-testid="ftp-username-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Dreamstime username"
                className="h-9 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground block">
                  {language === 'ar' ? 'كلمة المرور (Password)' : 'Password'}
                </label>
                {storedProfile?.hasSavedPassword && (
                  <span className="text-[11px] text-emerald-400 font-medium">
                    {language === 'ar' ? 'محفوظة في الخزنة الآمنة' : 'Saved in Secure Vault'}
                  </span>
                )}
              </div>
              <div className="relative">
                <Input
                  data-testid="ftp-password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="FTP password"
                  className="h-9 text-xs font-mono pr-8"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
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

          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              <Server className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'اختبار الاتصال' : 'Test Connection'}</span>
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsSettingsOpen(false)}
                className="h-8 text-xs cursor-pointer"
              >
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleSaveCredentials}
                className="h-8 text-xs cursor-pointer font-semibold"
              >
                {language === 'ar' ? 'حفظ البيانات' : 'Save Credentials'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </div>
  );
};
