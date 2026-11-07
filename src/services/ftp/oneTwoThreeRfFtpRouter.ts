import { MediaType } from '../../types';

export type OneTwoThreeRfRemoteFolder = '/' | '/ai_image' | '/vector' | '/ai_video';
export type FtpProtocolType = 'ftp' | 'ftps' | 'sftp';
export type OneTwoThreeRfItemStatus =
  | 'queued'
  | 'uploading'
  | 'retrying'
  | 'succeeded'
  | 'failed'
  | 'skipped';

export const ONE_TWO_THREE_RF_FTP_HOST = 'ftp.123rf.com';
export const ONE_TWO_THREE_RF_FTP_PORT = 21;
export const ONE_TWO_THREE_RF_SFTP_HOST = 'footage.ftp.123rf.com';
export const ONE_TWO_THREE_RF_SFTP_PORT = 2022;

export const ONE_TWO_THREE_RF_MAX_RETRIES = 5;
export const ONE_TWO_THREE_RF_BACKOFF_SCHEDULE_MS = [2000, 5000, 10000, 30000, 60000] as const;

export interface OneTwoThreeRfBundlePart {
  filename: string;
  localPath?: string;
  fileSize: number;
  remoteFolder: '/vector';
  remotePath: string;
  fileObject?: File;
  uploaded: boolean;
  order: 1 | 2; // 1 = .jpg preview (MUST upload first), 2 = .eps companion
}

export interface OneTwoThreeRfQueueItem {
  id: string;
  filename: string;
  stemName: string;
  mediaType: MediaType;
  isVectorBundle: boolean;
  isAiGenerated: boolean;
  isAiIgnored: boolean; // TRUE for vectors because AI vectors are strictly forbidden on 123RF
  protocol: 'ftp' | 'sftp';
  host: string;
  port: number;
  remoteFolder: OneTwoThreeRfRemoteFolder;
  status: OneTwoThreeRfItemStatus;
  fileSize: number;
  bytesTransferred: number;
  progressPercent: number;
  localPath?: string;
  fileObject?: File;
  previewUrl?: string;
  jpgPart?: OneTwoThreeRfBundlePart;
  epsPart?: OneTwoThreeRfBundlePart;
  retryCount: number;
  maxRetries: number;
  errorCode?: string;
  errorMessage?: string;
  durationMs?: number;
  completedAt?: number;
}

export interface OneTwoThreeRfTelemetryFrame {
  sessionId: string;
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
  currentProtocol: 'ftp' | 'sftp';
  currentHost: string;
  currentRemoteFolder: OneTwoThreeRfRemoteFolder;
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

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v']);
const VECTOR_EXTENSIONS = new Set(['.eps', '.ai', '.svg', '.cdr']);
const JPG_PREVIEW_EXTENSIONS = new Set(['.jpg', '.jpeg']);

export function getFilenameStem(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0) return filename.toLowerCase();
  return filename.slice(0, lastDot).toLowerCase();
}

export function detect123RfMediaType(filename: string): MediaType {
  const ext = (filename.slice(filename.lastIndexOf('.')) || '').toLowerCase();
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (VECTOR_EXTENSIONS.has(ext)) return 'vector';
  return 'image';
}

export interface RouteResolution {
  protocol: 'ftp' | 'sftp';
  host: string;
  port: number;
  remoteFolder: OneTwoThreeRfRemoteFolder;
  isAiIgnored: boolean;
}

/**
 * Pure 123RF Route Resolver:
 * A. Photos (.jpg without .eps): Standard FTP (Port 21, ftp.123rf.com).
 *    If AI -> /ai_image/. If non-AI -> / (root).
 * B. Vectors (.eps + .jpg preview): Standard FTP (Port 21, ftp.123rf.com).
 *    Always /vector/ (AI toggle strictly ignored; AI vectors forbidden on 123RF).
 * C. Videos (.mp4, .mov): SFTP (Port 2022, footage.ftp.123rf.com).
 *    If AI -> /ai_video/. If non-AI -> / (root).
 */
export function resolve123RfRoute(
  mediaType: MediaType,
  isAiGenerated: boolean
): RouteResolution {
  if (mediaType === 'vector') {
    return {
      protocol: 'ftp',
      host: ONE_TWO_THREE_RF_FTP_HOST,
      port: ONE_TWO_THREE_RF_FTP_PORT,
      remoteFolder: '/vector',
      isAiIgnored: true, // Vectors strictly ignore AI flag on 123RF
    };
  }

  if (mediaType === 'video') {
    return {
      protocol: 'sftp',
      host: ONE_TWO_THREE_RF_SFTP_HOST,
      port: ONE_TWO_THREE_RF_SFTP_PORT,
      remoteFolder: isAiGenerated ? '/ai_video' : '/',
      isAiIgnored: false,
    };
  }

  // Default: Photo / Image
  return {
    protocol: 'ftp',
    host: ONE_TWO_THREE_RF_FTP_HOST,
    port: ONE_TWO_THREE_RF_FTP_PORT,
    remoteFolder: isAiGenerated ? '/ai_image' : '/',
    isAiIgnored: false,
  };
}

export interface RawInputMediaFile {
  name: string;
  size: number;
  path?: string;
  file?: File;
}

/**
 * Bundles raw input files for 123RF:
 * - Pairs companion .eps + .jpg files having the same stem into a single Vector Bundle.
 * - Enforces execution order: .jpg preview MUST upload first, followed by .eps companion.
 * - Assigns protocol, host, port, and remoteFolder according to media type & AI toggle.
 */
export function bundleAndRoute123RfQueue(
  rawFiles: RawInputMediaFile[],
  batchIsAiGenerated: boolean
): OneTwoThreeRfQueueItem[] {
  const epsMap = new Map<string, RawInputMediaFile>();
  const jpgMap = new Map<string, RawInputMediaFile>();
  const otherFiles: RawInputMediaFile[] = [];

  for (const f of rawFiles) {
    const ext = (f.name.slice(f.name.lastIndexOf('.')) || '').toLowerCase();
    const stem = getFilenameStem(f.name);
    if (ext === '.eps') {
      epsMap.set(stem, f);
    } else if (JPG_PREVIEW_EXTENSIONS.has(ext)) {
      jpgMap.set(stem, f);
    } else {
      otherFiles.push(f);
    }
  }

  const items: OneTwoThreeRfQueueItem[] = [];
  const processedJpgStems = new Set<string>();

  // 1. Process Vector Pairs (.eps + companion .jpg)
  for (const [stem, epsFile] of epsMap.entries()) {
    const matchingJpg = jpgMap.get(stem);
    if (matchingJpg) {
      processedJpgStems.add(stem);
      const totalSize = (matchingJpg.size || 0) + (epsFile.size || 0);
      const id = `123rf-vec-${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      items.push({
        id,
        filename: `${stem}.(jpg+eps)`,
        stemName: stem,
        mediaType: 'vector',
        isVectorBundle: true,
        isAiGenerated: false, // Vectors cannot be AI-generated on 123RF
        isAiIgnored: true,
        protocol: 'ftp',
        host: ONE_TWO_THREE_RF_FTP_HOST,
        port: ONE_TWO_THREE_RF_FTP_PORT,
        remoteFolder: '/vector',
        status: 'queued',
        fileSize: totalSize,
        bytesTransferred: 0,
        progressPercent: 0,
        localPath: epsFile.path,
        fileObject: epsFile.file,
        jpgPart: {
          filename: matchingJpg.name,
          localPath: matchingJpg.path,
          fileSize: matchingJpg.size || 0,
          remoteFolder: '/vector',
          remotePath: `/vector/${matchingJpg.name}`,
          fileObject: matchingJpg.file,
          uploaded: false,
          order: 1, // Preview first!
        },
        epsPart: {
          filename: epsFile.name,
          localPath: epsFile.path,
          fileSize: epsFile.size || 0,
          remoteFolder: '/vector',
          remotePath: `/vector/${epsFile.name}`,
          fileObject: epsFile.file,
          uploaded: false,
          order: 2, // Companion EPS second!
        },
        retryCount: 0,
        maxRetries: ONE_TWO_THREE_RF_MAX_RETRIES,
      });
    } else {
      // Standalone .eps without .jpg
      const id = `123rf-eps-${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      items.push({
        id,
        filename: epsFile.name,
        stemName: stem,
        mediaType: 'vector',
        isVectorBundle: false,
        isAiGenerated: false,
        isAiIgnored: true,
        protocol: 'ftp',
        host: ONE_TWO_THREE_RF_FTP_HOST,
        port: ONE_TWO_THREE_RF_FTP_PORT,
        remoteFolder: '/vector',
        status: 'queued',
        fileSize: epsFile.size || 0,
        bytesTransferred: 0,
        progressPercent: 0,
        localPath: epsFile.path,
        fileObject: epsFile.file,
        retryCount: 0,
        maxRetries: ONE_TWO_THREE_RF_MAX_RETRIES,
      });
    }
  }

  // 2. Process Unpaired JPGs (Standalone Photos)
  for (const [stem, jpgFile] of jpgMap.entries()) {
    if (processedJpgStems.has(stem)) continue;
    const route = resolve123RfRoute('image', batchIsAiGenerated);
    const id = `123rf-img-${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    items.push({
      id,
      filename: jpgFile.name,
      stemName: stem,
      mediaType: 'image',
      isVectorBundle: false,
      isAiGenerated: batchIsAiGenerated,
      isAiIgnored: false,
      protocol: route.protocol,
      host: route.host,
      port: route.port,
      remoteFolder: route.remoteFolder,
      status: 'queued',
      fileSize: jpgFile.size || 0,
      bytesTransferred: 0,
      progressPercent: 0,
      localPath: jpgFile.path,
      fileObject: jpgFile.file,
      retryCount: 0,
      maxRetries: ONE_TWO_THREE_RF_MAX_RETRIES,
    });
  }

  // 3. Process Other Files (Videos, Other Vector Formats)
  for (const f of otherFiles) {
    const stem = getFilenameStem(f.name);
    const mediaType = detect123RfMediaType(f.name);
    const route = resolve123RfRoute(mediaType, batchIsAiGenerated);
    const id = `123rf-${mediaType}-${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    items.push({
      id,
      filename: f.name,
      stemName: stem,
      mediaType,
      isVectorBundle: false,
      isAiGenerated: mediaType === 'vector' ? false : batchIsAiGenerated,
      isAiIgnored: mediaType === 'vector',
      protocol: route.protocol,
      host: route.host,
      port: route.port,
      remoteFolder: route.remoteFolder,
      status: 'queued',
      fileSize: f.size || 0,
      bytesTransferred: 0,
      progressPercent: 0,
      localPath: f.path,
      fileObject: f.file,
      retryCount: 0,
      maxRetries: ONE_TWO_THREE_RF_MAX_RETRIES,
    });
  }

  return items;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0 || !Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatSpeed(bps: number): string {
  if (bps <= 0 || !Number.isFinite(bps)) return '0 B/s';
  return `${formatBytes(bps)}/s`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || seconds < 0 || !Number.isFinite(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
