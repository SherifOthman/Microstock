import { MediaType, SupportedPlatform } from '../../types';

export type FtpProtocolType = 'ftp' | 'ftps' | 'sftp';
export type DreamstimeRemoteFolder = '/' | '/additional' | '/video';
export type FtpExecutionMode = 'live' | 'dry_run';
export type FtpQueueItemStatus =
  | 'queued'
  | 'uploading'
  | 'retrying'
  | 'retry'
  | 'succeeded'
  | 'failed'
  | 'skipped';
export type SimulatedFaultMode =
  | 'none'
  | 'transient_recover_on_retry_2'
  | 'persistent_fail_all_3'
  | 'persistent_fail_all_5'
  | 'permanent_550_skip';

/**
 * 5x Aggressive Auto-Retry Schedule (2s -> 5s -> 10s -> 30s -> 60s)
 */
export const FTP_MAX_RETRIES_PER_FILE = 5;
export const FTP_RETRY_BACKOFF_SCHEDULE_MS = [2000, 5000, 10000, 30000, 60000] as const;

export interface FtpCredentialProfile {
  agencyId: SupportedPlatform;
  protocol: FtpProtocolType;
  host: string;
  port: number;
  username: string;
  encryptedPassword?: string;
  hasSavedPassword: boolean;
  passiveMode: boolean;
  lastVerifiedAt?: number;
  updatedAt: number;
}

export interface FtpBundlePart {
  filename: string;
  localPath?: string;
  fileSize: number;
  remoteFolder: DreamstimeRemoteFolder;
  remotePath: string;
  fileObject?: File;
  uploaded: boolean;
}

export interface FtpQueueItem {
  id: string;
  filename: string;
  displayName?: string;
  stemName?: string;
  isVectorBundle?: boolean;
  jpgPart?: FtpBundlePart;
  epsPart?: FtpBundlePart;
  previewUrl?: string;
  localPath?: string;
  fileSize: number;
  mediaType: MediaType;
  remoteFolder: DreamstimeRemoteFolder;
  remotePath: string;
  status: FtpQueueItemStatus;
  bytesTransferred: number;
  progressPercent: number;
  retryCount: number;
  maxRetries: number;
  errorCode?: string;
  errorMessage?: string;
  durationMs?: number;
  completedAt?: number;
  fileObject?: File;
}

export interface FtpTelemetryFrame {
  sessionId: string;
  mode: FtpExecutionMode;
  isRunning: boolean;
  isPaused: boolean;
  totalFiles: number;
  completedFiles: number;
  succeededFiles: number;
  failedFiles: number;
  skippedFiles: number;
  currentFileIndex: number;
  currentItemId: string | null;
  currentFilename: string;
  currentRemoteFolder: DreamstimeRemoteFolder;
  currentFileBytesTransferred: number;
  currentFileTotalBytes: number;
  currentFilePercent: number;
  batchBytesTransferred: number;
  batchTotalBytes: number;
  batchPercent: number;
  speedBytesPerSec: number;
  etaSeconds: number | null;
  activeRetryAttempt: number;
  totalDurationSeconds?: number;
  statusMessage?: string;
}

export interface FtpSessionRecord {
  id: string;
  agencyId: SupportedPlatform;
  mode: FtpExecutionMode;
  status: 'running' | 'completed' | 'partial_failure' | 'aborted';
  totalFiles: number;
  succeededFiles: number;
  failedFiles: number;
  totalBytes: number;
  averageSpeedBps: number;
  startedAt: number;
  completedAt?: number;
}

export interface FtpTransferLogRecord {
  id: string;
  sessionId: string;
  agencyId: SupportedPlatform;
  filename: string;
  localPath?: string;
  fileSize: number;
  mediaType: MediaType;
  remoteDirectory: DreamstimeRemoteFolder;
  remotePath: string;
  status: FtpQueueItemStatus;
  retryCount: number;
  errorCode?: string;
  errorMessage?: string;
  durationMs: number;
  completedAt: number;
}

export interface DreamstimeRouteResolution {
  mediaType: MediaType;
  remoteFolder: DreamstimeRemoteFolder;
  remotePath: string;
  ruleLabel: string;
}

const RASTER_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp']);
const VECTOR_EXTENSIONS = new Set(['.eps', '.ai', '.svg', '.cdr']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v']);

export function getFileExtension(filename: string): string {
  const cleanName = (filename || '').trim();
  const dotIdx = cleanName.lastIndexOf('.');
  return dotIdx !== -1 ? cleanName.slice(dotIdx).toLowerCase() : '';
}

export function getFilenameStem(filename: string): string {
  const cleanName = (filename || '').trim();
  const dotIdx = cleanName.lastIndexOf('.');
  return dotIdx !== -1 ? cleanName.slice(0, dotIdx) : cleanName;
}

export function isJpgPreviewExtension(filename: string): boolean {
  const ext = getFileExtension(filename);
  return ext === '.jpg' || ext === '.jpeg';
}

export function isVectorExtension(filename: string): boolean {
  return VECTOR_EXTENSIONS.has(getFileExtension(filename));
}

/**
 * Deterministic file-extension router for Dreamstime FTP uploads:
 * - JPEGs / Raster (.jpg, .jpeg, .png, .webp) -> root `/`
 * - Vectors (.eps, .ai, .svg) -> `/additional`
 * - Videos (.mp4, .mov, .webm) -> `/video`
 */
export function resolveDreamstimeRoute(filename: string): DreamstimeRouteResolution {
  const cleanName = (filename || '').trim();
  const ext = getFileExtension(cleanName);

  if (VECTOR_EXTENSIONS.has(ext)) {
    return {
      mediaType: 'vector',
      remoteFolder: '/additional',
      remotePath: `/additional/${cleanName}`,
      ruleLabel: 'Vector → /additional',
    };
  }

  if (VIDEO_EXTENSIONS.has(ext)) {
    return {
      mediaType: 'video',
      remoteFolder: '/video',
      remotePath: `/video/${cleanName}`,
      ruleLabel: 'Video → /video',
    };
  }

  if (ext === '.csv') {
    return {
      mediaType: 'image',
      remoteFolder: '/',
      remotePath: `/${cleanName}`,
      ruleLabel: 'CSV Metadata → /',
    };
  }

  if (RASTER_EXTENSIONS.has(ext)) {
    return {
      mediaType: 'image',
      remoteFolder: '/',
      remotePath: `/${cleanName}`,
      ruleLabel: 'Raster/JPEG → /',
    };
  }

  return {
    mediaType: 'image',
    remoteFolder: '/',
    remotePath: `/${cleanName}`,
    ruleLabel: 'Default → /',
  };
}

/**
 * Intelligent File Sorting Priority:
 * 0 = Standalone Photos (`image` -> `/`)
 * 1 = Vector Bundles (`JPG + EPS`) & Standalone Vectors (`vector` -> `/additional`)
 * 2 = Videos (`video` -> `/video`)
 */
export function getMediaSortPriority(
  mediaType: MediaType,
  isVectorBundle?: boolean
): number {
  if (isVectorBundle || mediaType === 'vector') return 1;
  if (mediaType === 'image') return 0;
  return 2;
}

/**
 * Sorts FTP queue items so all Standalone Photos appear first, followed by Vector Bundles / Vectors, followed by Videos.
 * Preserves relative insertion order within the same category.
 */
export function sortFtpQueueByMediaPriority<
  T extends { mediaType: MediaType; isVectorBundle?: boolean }
>(items: T[]): T[] {
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const prioDiff =
        getMediaSortPriority(a.item.mediaType, a.item.isVectorBundle) -
        getMediaSortPriority(b.item.mediaType, b.item.isVectorBundle);
      if (prioDiff !== 0) return prioDiff;
      return a.idx - b.idx;
    })
    .map((entry) => entry.item);
}

/**
 * Formats byte counts into compact human-readable KB / MB / GB strings (1 decimal place for table cells).
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

/**
 * High-precision 2-decimal byte formatter for the unified progress telemetry bar
 * (e.g., `687.73 KB`, `5.49 MB`, `1.24 GB`).
 */
export function formatBytesPrecise(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0.00 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

/**
 * Formats transfer speed in bytes/sec into `X.X MB/s` or `XXX KB/s`.
 */
export function formatTransferSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0 KB/s';
  const mbps = bytesPerSec / (1024 * 1024);
  if (mbps >= 1.0) {
    return `${mbps.toFixed(1)} MB/s`;
  }
  const kbps = bytesPerSec / 1024;
  return `${Math.round(kbps)} KB/s`;
}

/**
 * High-precision 2-decimal speed formatter for the unified progress telemetry bar
 * (e.g., `625.03 KB/s` or `1.48 MB/s`).
 */
export function formatSpeedPrecise(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0.00 KB/s';
  const mbps = bytesPerSec / (1024 * 1024);
  if (mbps >= 1.0) {
    return `${mbps.toFixed(2)} MB/s`;
  }
  const kbps = bytesPerSec / 1024;
  return `${kbps.toFixed(2)} KB/s`;
}

/**
 * Formats ETA seconds into `mm:ss` or `Xh Ym`.
 */
export function formatEtaSeconds(etaSeconds: number | null): string {
  if (etaSeconds === null || !Number.isFinite(etaSeconds) || etaSeconds < 0) {
    return '--:--';
  }
  const totalSec = Math.ceil(etaSeconds);
  if (totalSec === 0) return '00:00';
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) {
    return `${hours}h ${String(mins).padStart(2, '0')}m`;
  }
  return `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

/**
 * Formats time left into strict `HH:MM:SS` format (e.g. `00:01:01`).
 */
export function formatTimeLeftHms(etaSeconds: number | null): string {
  if (etaSeconds === null || !Number.isFinite(etaSeconds) || etaSeconds < 0) {
    return '--:--:--';
  }
  const totalSec = Math.max(0, Math.ceil(etaSeconds));
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Produces the unified single-line professional upload telemetry string:
 * `Upload progress: 1/5 files - 687.73 KB / 5.49 MB @ 625.03 KB/s Time left: 00:01:01`
 */
export function formatUnifiedUploadProgressLine(
  telemetry: FtpTelemetryFrame,
  isAr = false
): string {
  const activeFileNumber = Math.min(
    telemetry.totalFiles,
    Math.max(1, telemetry.currentFileIndex || telemetry.completedFiles + 1)
  );
  const transferredStr = formatBytesPrecise(telemetry.batchBytesTransferred);
  const totalStr = formatBytesPrecise(telemetry.batchTotalBytes);
  const speedStr = telemetry.isPaused
    ? '0.00 KB/s'
    : formatSpeedPrecise(telemetry.speedBytesPerSec);
  const timeLeftStr = telemetry.isPaused
    ? '--:--:--'
    : formatTimeLeftHms(telemetry.etaSeconds);

  if (isAr) {
    return `تقدم الرفع: ${activeFileNumber}/${telemetry.totalFiles} ملفات - ${transferredStr} / ${totalStr} @ ${speedStr} الوقت المتبقي: ${timeLeftStr}`;
  }
  return `Upload progress: ${activeFileNumber}/${telemetry.totalFiles} files - ${transferredStr} / ${totalStr} @ ${speedStr} Time left: ${timeLeftStr}`;
}
