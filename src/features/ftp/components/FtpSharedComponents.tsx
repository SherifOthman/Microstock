import React, { useEffect, useRef, useState } from 'react';
import {
  formatBytes,
  formatBytesPrecise,
  formatEtaSeconds,
  formatSpeedPrecise,
  formatTimeLeftHms,
} from '../../../services/ftp/dreamstimeFtpRouter';
import { FtpSupportedAgencyId } from '../../../services/ftp/oneTwoThreeRfFtpRouter';
import { Progress } from '../../../components/ui/progress';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Tooltip } from '../../../components/ui/tooltip';
import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '../../../components/ui/dialog';
import { getPlatformLogo } from '../../../components/icons/StockLogos';
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

export type QueueSubTab = 'all' | 'succeeded' | 'failed' | 'skipped';

export const SUPPORTED_FTP_AGENCIES: { id: FtpSupportedAgencyId; label: string }[] = [
  { id: 'dreamstime', label: 'Dreamstime' },
  { id: '123rf', label: '123RF' },
  { id: 'freepik', label: 'Freepik' },
  { id: 'magnific', label: 'Magnific' },
  { id: 'vecteezy', label: 'Vecteezy' },
  { id: 'shutterstock', label: 'Shutterstock' },
  { id: 'adobe', label: 'Adobe Stock' },
];

export interface UnifiedFtpItemView {
  id: string;
  filename: string;
  displayName?: string;
  mediaType: 'image' | 'vector' | 'video';
  isVectorBundle?: boolean;
  isAiGenerated?: boolean;
  isAiIgnored?: boolean;
  remoteFolder: string;
  remotePath?: string;
  fileSize: number;
  bytesTransferred: number;
  progressPercent: number;
  status: 'queued' | 'uploading' | 'retry' | 'retrying' | 'succeeded' | 'failed' | 'skipped';
  retryCount: number;
  maxRetries: number;
  errorMessage?: string;
  localPath?: string;
  previewUrl?: string;
  jpgPart?: {
    filename: string;
    remoteFolder: string;
  };
  epsPart?: {
    filename: string;
    remoteFolder: string;
  };
}

export interface UnifiedFtpTelemetry {
  isRunning: boolean;
  isPaused: boolean;
  totalFiles: number;
  completedFiles: number;
  succeededFiles: number;
  failedFiles: number;
  skippedFiles: number;
  currentFileIndex: number;
  batchBytesTransferred: number;
  batchTotalBytes: number;
  batchPercent: number;
  speedBytesPerSec: number;
  etaSeconds: number | null;
  totalDurationSeconds?: number;
}

export function getRemoteFolderBadgeStyle(
  folder: string,
  isVectorBundle?: boolean
): string {
  if (isVectorBundle) {
    return 'bg-amber-500/15 text-amber-300 border-amber-500/35';
  }
  switch (folder) {
    case '/additional':
    case '/vector':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case '/video':
    case '/ai_video':
      return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    case '/ai_image':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case '/':
    default:
      return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
  }
}

export function getMediaIcon(item: UnifiedFtpItemView) {
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

export function getMediaTypeLabel(item: UnifiedFtpItemView, language: string): string {
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

export function renderMediaPreviewContent(item: UnifiedFtpItemView, size: 'hover' | 'modal') {
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

export async function extractFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
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

export function useFtpTelemetryMath(telemetry: UnifiedFtpTelemetry) {
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
    elapsedSeconds,
    averageSpeedBps,
    stableEtaSeconds,
    totalRemainingBytes,
    activeFileNumber,
  };
}

export const FtpTopHeaderBar: React.FC<{
  selectedAgency: FtpSupportedAgencyId;
  agencyName: string;
  agencyHost: string;
  isAr: boolean;
  isRunning: boolean;
  storedUsername?: string;
  hasSavedPassword?: boolean;
  onSelectAgency?: (agency: FtpSupportedAgencyId) => void;
  onOpenSettings: () => void;
}> = ({
  selectedAgency,
  agencyName,
  agencyHost,
  isAr,
  isRunning,
  storedUsername,
  hasSavedPassword,
  onSelectAgency,
  onOpenSettings,
}) => {
  return (
    <div className="shrink-0 h-12 px-4 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {getPlatformLogo(selectedAgency, 18)}
        <h1 className="text-sm font-bold tracking-tight text-foreground truncate whitespace-nowrap">
          {isAr ? `رافع خادم ${agencyName} FTP` : `${agencyName} FTP Uploader`}
        </h1>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {onSelectAgency && (
          <div className="flex items-center p-0.5 rounded-lg bg-secondary border border-border text-xs mr-1 rtl:mr-0 rtl:ml-1">
            {SUPPORTED_FTP_AGENCIES.map((agency) => {
              const isActive = agency.id === selectedAgency;
              return (
                <button
                  key={agency.id}
                  type="button"
                  onClick={() => onSelectAgency(agency.id)}
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
        )}

        {isRunning && (
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

        {/* Compact Connection Status Indicator: Strictly Online/Offline (never raw email) */}
        <Tooltip
          content={
            storedUsername
              ? `${storedUsername}@${agencyHost}`
              : isAr
              ? 'غير متصل - يرجى حفظ بيانات الدخول'
              : 'Offline - Please configure credentials'
          }
        >
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary/50 border border-border text-xs font-medium cursor-help">
            <span
              className={`w-2 h-2 rounded-full ${
                hasSavedPassword ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span className="font-mono">
              {hasSavedPassword
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
          data-testid={selectedAgency === 'dreamstime' ? 'ftp-site-settings-btn' : '123rf-credentials-button'}
          onClick={onOpenSettings}
          className="h-8 text-xs gap-1.5 cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5 text-primary" />
          <span>{isAr ? 'إعدادات الموقع' : 'Site Settings'}</span>
        </Button>
      </div>
    </div>
  );
};

export const FtpProgressAndControlsBar: React.FC<{
  telemetry: UnifiedFtpTelemetry;
  activeFileNumber: number;
  stableEtaSeconds: number | null;
  elapsedSeconds: number;
  isBatchFinished: boolean;
  hasSavedPassword?: boolean;
  hasRecoverableSession?: boolean;
  failedCount: number;
  pendingCount: number;
  isAr: boolean;
  extraControls?: React.ReactNode;
  onAddFilesClick: () => void;
  onAddFolderClick: () => void;
  onRetryFailedClick: () => void;
  onPauseClick: () => void;
  onResumeClick: () => void;
  onStartUploadClick: () => void;
  onClearAllClick: () => void;
}> = ({
  telemetry,
  activeFileNumber,
  stableEtaSeconds,
  elapsedSeconds,
  isBatchFinished,
  hasSavedPassword,
  hasRecoverableSession,
  failedCount,
  pendingCount,
  isAr,
  extraControls,
  onAddFilesClick,
  onAddFolderClick,
  onRetryFailedClick,
  onPauseClick,
  onResumeClick,
  onStartUploadClick,
  onClearAllClick,
}) => {
  return (
    <div className="shrink-0 p-3.5 rounded-xl border border-border bg-card space-y-2.5">
      <div
        className="flex items-center justify-between gap-4 min-h-[36px] flex-wrap"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        {/* Left: Visually Distinct Telemetry Badges */}
        <div className="flex items-center gap-4 text-xs font-mono tabular-nums shrink-0 select-none">
          {telemetry.isRunning || telemetry.isPaused ? (
            <div
              data-testid="ftp-unified-progress-line"
              className="flex items-center gap-4 flex-wrap"
              dir="ltr"
            >
              <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-md bg-secondary/80 border border-border text-foreground font-mono text-xs tabular-nums shadow-xs whitespace-nowrap min-w-[125px]">
                <span>📁</span>
                <span>
                  {activeFileNumber} / {telemetry.totalFiles} {isAr ? 'ملفات' : 'Files'}
                </span>
              </div>

              <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-md bg-sky-500/10 border border-sky-500/25 text-sky-800 dark:text-sky-400 font-mono text-xs tabular-nums shadow-xs whitespace-nowrap min-w-[190px]">
                <span>☁️</span>
                <span>
                  {formatBytesPrecise(telemetry.batchBytesTransferred)} /{' '}
                  {formatBytesPrecise(telemetry.batchTotalBytes)}
                </span>
              </div>

              <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-800 dark:text-emerald-400 font-mono text-xs tabular-nums shadow-xs whitespace-nowrap min-w-[135px]">
                <span>⚡</span>
                <span>
                  {telemetry.isPaused
                    ? '0.00 KB/s'
                    : formatSpeedPrecise(telemetry.speedBytesPerSec)}
                </span>
              </div>

              <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-400 font-mono text-xs tabular-nums shadow-xs whitespace-nowrap min-w-[125px]">
                <span>⏳</span>
                <span>
                  {telemetry.isPaused
                    ? '--:--:--'
                    : formatTimeLeftHms(stableEtaSeconds)}
                </span>
              </div>

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
                {hasSavedPassword
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

        {/* Right: Contextual Actions */}
        <div className="flex items-center justify-end gap-1.5 shrink-0 flex-wrap">
          {extraControls}

          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="ftp-add-files-btn"
            disabled={telemetry.isRunning}
            onClick={onAddFilesClick}
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
            onClick={onAddFolderClick}
            className="h-8 text-xs gap-1.5 cursor-pointer shrink-0"
          >
            <FolderPlus className="w-3.5 h-3.5 text-primary" />
            <span>{isAr ? 'إضافة مجلد' : 'Add Folder'}</span>
          </Button>

          {failedCount > 0 && !telemetry.isRunning && (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onRetryFailedClick}
              className="h-8 text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>
                {isAr ? 'إعادة الفاشلة' : 'Retry Failed'} ({failedCount})
              </span>
            </Button>
          )}

          {telemetry.isRunning ? (
            telemetry.isPaused ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={onResumeClick}
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
                onClick={onPauseClick}
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
              disabled={pendingCount === 0}
              onClick={onStartUploadClick}
              className={`h-8 text-xs gap-1.5 cursor-pointer font-semibold shrink-0 ${
                hasRecoverableSession
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : ''
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              <span>
                {hasRecoverableSession
                  ? `${isAr ? 'استئناف الرفع' : 'Resume Upload'} (${pendingCount})`
                  : `${isAr ? 'بدء الرفع' : 'Start Upload'} (${pendingCount})`}
              </span>
            </Button>
          )}

          {!telemetry.isRunning && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="ftp-clear-all-btn"
              onClick={onClearAllClick}
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
  );
};

export const FtpCompletionAlertBar: React.FC<{
  telemetry: UnifiedFtpTelemetry;
  isAr: boolean;
  onClearAll: () => void;
}> = ({ telemetry, isAr, onClearAll }) => {
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
        <span className="shrink-0 text-sm">{isWarning ? '⚠️' : '✅'}</span>
        <span className="font-medium truncate">
          {isAr
            ? `اكتمل الرفع: ${telemetry.succeededFiles} نجاح، ${telemetry.skippedFiles || 0} تم تخطيه، ${telemetry.failedFiles} فشل (الوقت: ${timeFormatted})`
            : `Upload Complete: ${telemetry.succeededFiles} Succeeded, ${telemetry.skippedFiles || 0} Skipped, ${telemetry.failedFiles} Failed (Time: ${timeFormatted})`}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClearAll}
        className="h-6 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 px-2 cursor-pointer gap-1 shrink-0"
      >
        <Trash2 className="w-3 h-3" />
        <span>{isAr ? 'مسح الكل' : 'Clear All'}</span>
      </Button>
    </div>
  );
};

export const FtpEmptyDropzone: React.FC<{
  agencyName: string;
  isAr: boolean;
  isDraggingOver: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onAddFilesClick: () => void;
  onAddFolderClick: () => void;
  extraControls?: React.ReactNode;
}> = ({
  agencyName,
  isAr,
  isDraggingOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onAddFilesClick,
  onAddFolderClick,
  extraControls,
}) => {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`border-2 border-dashed rounded-xl p-10 text-center transition space-y-3 bg-card ${
        isDraggingOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
      }`}
    >
      <div className="w-11 h-11 rounded-xl bg-secondary text-primary flex items-center justify-center mx-auto border border-border">
        <CloudUpload className="w-5 h-5" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">
          {isAr
            ? `اسحب الملفات أو المجلدات هنا لرفعها إلى ${agencyName}`
            : `Drop files or folders here to upload to ${agencyName}`}
        </h3>
      </div>
      {extraControls}
      <div className="flex items-center justify-center gap-2 pt-1">
        <Button
          type="button"
          variant="default"
          size="sm"
          data-testid="ftp-add-files-btn"
          onClick={onAddFilesClick}
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
          onClick={onAddFolderClick}
          className="h-8 px-3 text-xs gap-1.5 cursor-pointer font-semibold"
        >
          <FolderPlus className="w-3.5 h-3.5 text-primary" />
          <span>{isAr ? 'إضافة مجلد' : 'Add Folder'}</span>
        </Button>
      </div>
    </div>
  );
};

export const FtpQueueTableWorkspace: React.FC<{
  agencyId: FtpSupportedAgencyId;
  agencyName: string;
  queue: UnifiedFtpItemView[];
  visibleQueue: UnifiedFtpItemView[];
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  activeSubTab: QueueSubTab;
  onSelectSubTab: (tab: QueueSubTab) => void;
  isDraggingOver: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  isRunning: boolean;
  language: string;
  isAr: boolean;
  onPreviewItem: (item: UnifiedFtpItemView) => void;
  onRetrySingleItem: (id: string) => void;
  onOpenFileLocation: (localPath?: string) => void;
  onRemoveItem: (id: string) => void;
}> = ({
  agencyId,
  agencyName,
  queue,
  visibleQueue,
  succeededCount,
  failedCount,
  skippedCount,
  activeSubTab,
  onSelectSubTab,
  isDraggingOver,
  onDragOver,
  onDragLeave,
  onDrop,
  isRunning,
  language,
  isAr,
  onPreviewItem,
  onRetrySingleItem,
  onOpenFileLocation,
  onRemoveItem,
}) => {
  const isDreamstime = agencyId === 'dreamstime';

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex-1 min-h-0 rounded-xl border bg-card flex flex-col overflow-hidden transition-colors ${
        isDraggingOver ? 'border-primary bg-primary/5' : 'border-border'
      }`}
    >
      {/* Sub-Tabs: Identical across all FTP servers */}
      <div
        className="shrink-0 h-10 px-3 border-b border-border flex items-center justify-between gap-2"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSelectSubTab('all')}
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
            onClick={() => onSelectSubTab('succeeded')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
              activeSubTab === 'succeeded'
                ? 'bg-emerald-500 text-black font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {isAr ? 'المكتملة' : 'Completed'} ({succeededCount})
          </button>
          <button
            type="button"
            onClick={() => onSelectSubTab('failed')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
              activeSubTab === 'failed'
                ? 'bg-destructive text-destructive-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {isAr ? 'الفاشلة' : 'Failed'} ({failedCount})
          </button>
          <button
            type="button"
            onClick={() => onSelectSubTab('skipped')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
              activeSubTab === 'skipped'
                ? 'bg-slate-500 text-white font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {isAr ? 'المتخطاة' : 'Skipped'} ({skippedCount})
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {visibleQueue.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-10 text-center">
            <h3 className="text-sm font-semibold text-foreground">
              {isAr ? 'لا توجد ملفات في هذا التبويب' : 'No files in this tab'}
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
                                <div>1) {item.jpgPart.filename} → {item.jpgPart.remoteFolder}</div>
                                <div>2) {item.epsPart.filename} → {item.epsPart.remoteFolder}</div>
                              </div>
                            )}
                          </div>
                        }
                      >
                        <button
                          type="button"
                          onClick={() => onPreviewItem(item)}
                          className="flex items-center gap-1.5 cursor-pointer group min-w-0 text-left flex-wrap"
                        >
                          <span
                            className="font-mono text-xs text-foreground group-hover:text-primary transition truncate max-w-[300px]"
                            dir="ltr"
                          >
                            {item.displayName || item.filename}
                          </span>
                          {item.isVectorBundle && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-mono text-amber-300 shrink-0">
                              JPG + EPS
                            </span>
                          )}
                          {agencyId === '123rf' && item.isVectorBundle && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                              Non-AI Vector
                            </span>
                          )}
                          {agencyId === '123rf' && item.isAiGenerated && !item.isVectorBundle && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[10px] font-semibold text-purple-600 dark:text-purple-400 shrink-0">
                              AI-Generated
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
                      {isDreamstime
                        ? item.isVectorBundle
                          ? '/ → /additional'
                          : item.remoteFolder
                        : `Folder: ${item.remoteFolder}`}
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
                        <RefreshCw className="w-3 h-3" />
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
                            ? `تم التخطي: الملف موجود مسبقاً على خادم ${agencyName} (550)`
                            : `Skipped: File already exists on ${agencyName} server (550)`)
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
                      {item.status === 'failed' && !isRunning && (
                        <Tooltip content={isAr ? 'إعادة محاولة هذا الملف' : 'Retry this file'}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onRetrySingleItem(item.id)}
                            className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>{isAr ? 'إعادة' : 'Retry'}</span>
                          </Button>
                        </Tooltip>
                      )}
                      {item.localPath && (
                        <Tooltip content={isAr ? 'فتح موقع الملف' : 'Open file location'}>
                          <button
                            type="button"
                            onClick={() => onOpenFileLocation(item.localPath)}
                            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer transition"
                            title={isAr ? 'فتح موقع الملف' : 'Open file location'}
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      )}
                      {!isRunning && (
                        <Tooltip content={isAr ? 'حذف من القائمة' : 'Remove from queue'}>
                          <button
                            type="button"
                            onClick={() => onRemoveItem(item.id)}
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
  );
};

export const FtpMediaLightboxModal: React.FC<{
  item: UnifiedFtpItemView | null;
  onClose: () => void;
  language: string;
  isAr: boolean;
}> = ({ item, onClose, language, isAr }) => {
  return (
    <DialogRoot
      open={Boolean(item)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="fixed inset-0 m-auto h-fit max-h-[92vh] sm:max-w-2xl w-[95vw] md:w-[650px] overflow-hidden"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        <DialogHeader className={isAr ? 'pe-2 ps-8' : 'pe-8 ps-2'}>
          <DialogTitle className="flex items-center gap-2 text-sm font-bold font-mono" dir="ltr">
            {item && getMediaIcon(item)}
            <span className="truncate">{item?.displayName || item?.filename}</span>
          </DialogTitle>
        </DialogHeader>
        {item && (
          <div className="space-y-3 py-2">
            <div className="w-full flex items-center justify-center overflow-hidden rounded-lg bg-black/40">
              {renderMediaPreviewContent(item, 'modal')}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground font-mono px-1">
              <span>
                {getMediaTypeLabel(item, language)} · {formatBytes(item.fileSize)}
              </span>
              <span dir="ltr">
                {item.remotePath || item.remoteFolder}
              </span>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 text-xs cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export const FtpSiteSettingsModal: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyId: FtpSupportedAgencyId;
  agencyName: string;
  host: string;
  username: string;
  onUsernameChange: (val: string) => void;
  password: string;
  onPasswordChange: (val: string) => void;
  hasSavedPassword?: boolean;
  vaultStatus: {
    type: 'idle' | 'saving' | 'testing' | 'ok' | 'error';
    message?: string;
  };
  isAr: boolean;
  onTestConnection: () => void;
  onSaveCredentials: () => void;
}> = ({
  open,
  onOpenChange,
  agencyId,
  agencyName,
  host,
  username,
  onUsernameChange,
  password,
  onPasswordChange,
  hasSavedPassword,
  vaultStatus,
  isAr,
  onTestConnection,
  onSaveCredentials,
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="fixed inset-0 m-auto h-fit max-h-[90vh] sm:max-w-md"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        <DialogHeader className={isAr ? 'pe-2 ps-8' : 'pe-8 ps-2'}>
          <DialogTitle className="flex items-center gap-2 text-sm font-bold">
            <Lock className="w-4 h-4 text-primary" />
            <span>
              {isAr
                ? `إعدادات الاتصال بـ ${agencyName}`
                : `${agencyName} Connection Settings`}
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
              data-testid={agencyId === 'dreamstime' ? 'ftp-host-input' : '123rf-host-readonly-input'}
              dir="ltr"
              value={host}
              readOnly
              disabled
              className="h-9 text-xs font-mono bg-muted/50 cursor-not-allowed select-all opacity-80"
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
              onChange={(e) => onUsernameChange(e.target.value)}
              placeholder={isAr ? 'اسم المستخدم' : `${agencyName} username`}
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
              {hasSavedPassword && (
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
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder={hasSavedPassword ? '••••••••••••' : (isAr ? 'أدخل كلمة المرور' : 'FTP password')}
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
            <div
              className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 font-medium ${
                vaultStatus.type === 'ok'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : vaultStatus.type === 'error'
                  ? 'bg-destructive/10 text-destructive border-destructive/30'
                  : 'bg-secondary/60 text-foreground border-border'
              }`}
            >
              {vaultStatus.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
              ) : vaultStatus.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 shrink-0 text-destructive" />
              ) : (
                <Server className="w-4 h-4 shrink-0 text-primary" />
              )}
              <span>
                {vaultStatus.message ||
                  (vaultStatus.type === 'ok'
                    ? isAr
                      ? 'متصل بنجاح'
                      : 'Connected Successfully'
                    : vaultStatus.type === 'error'
                    ? isAr
                      ? 'فشل الاتصال'
                      : 'Connection failed'
                    : isAr
                    ? 'جارٍ الاتصال...'
                    : 'Connecting...')}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={vaultStatus.type === 'testing' || vaultStatus.type === 'saving'}
            onClick={onTestConnection}
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
              onClick={() => onOpenChange(false)}
              className="h-8 text-xs cursor-pointer"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={vaultStatus.type === 'testing' || vaultStatus.type === 'saving'}
              onClick={onSaveCredentials}
              className="h-8 text-xs cursor-pointer font-semibold"
            >
              {isAr ? 'حفظ البيانات' : 'Save Credentials'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};
