import { MediaType, SupportedPlatform } from '../../types';

export type FtpProtocolType = 'ftp' | 'ftps' | 'sftp';
export type DreamstimeRemoteFolder = '/' | '/additional' | '/video';
export type FtpExecutionMode = 'live' | 'dry_run';
export type FtpQueueItemStatus = 'queued' | 'uploading' | 'retrying' | 'succeeded' | 'failed';
export type SimulatedFaultMode =
  | 'none'
  | 'transient_recover_on_retry_2'
  | 'persistent_fail_all_3'
  | 'persistent_fail_all_5';

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

export interface FtpQueueItem {
  id: string;
  filename: string;
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

/**
 * Deterministic file-extension router for Dreamstime FTP uploads:
 * - JPEGs / Raster (.jpg, .jpeg, .png, .webp) -> root `/`
 * - Vectors (.eps, .ai, .svg) -> `/additional`
 * - Videos (.mp4, .mov, .webm) -> `/video`
 */
export function resolveDreamstimeRoute(filename: string): DreamstimeRouteResolution {
  const cleanName = (filename || '').trim();
  const dotIdx = cleanName.lastIndexOf('.');
  const ext = dotIdx !== -1 ? cleanName.slice(dotIdx).toLowerCase() : '';

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

  if (RASTER_EXTENSIONS.has(ext)) {
    return {
      mediaType: 'image',
      remoteFolder: '/',
      remotePath: `/${cleanName}`,
      ruleLabel: 'Raster/JPEG → /',
    };
  }

  // Default fallback to root `/` for unknown extensions
  return {
    mediaType: 'image',
    remoteFolder: '/',
    remotePath: `/${cleanName}`,
    ruleLabel: 'Default → /',
  };
}

/**
 * Intelligent File Sorting Priority:
 * 0 = Photos (`image` -> `/`)
 * 1 = Vectors (`vector` -> `/additional`)
 * 2 = Videos (`video` -> `/video`)
 */
export function getMediaSortPriority(mediaType: MediaType): number {
  if (mediaType === 'image') return 0;
  if (mediaType === 'vector') return 1;
  return 2;
}

/**
 * Sorts FTP queue items so all Photos appear first, followed by Vectors, followed by Videos.
 * Preserves relative insertion order within the same media category.
 */
export function sortFtpQueueByMediaPriority<T extends { mediaType: MediaType }>(items: T[]): T[] {
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const prioDiff = getMediaSortPriority(a.item.mediaType) - getMediaSortPriority(b.item.mediaType);
      if (prioDiff !== 0) return prioDiff;
      return a.idx - b.idx;
    })
    .map((entry) => entry.item);
}

/**
 * Formats byte counts into human-readable KB / MB / GB strings with tabular alignment.
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
