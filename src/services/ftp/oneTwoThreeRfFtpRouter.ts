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

export const VECTEEZY_SFTP_HOST = 'content-ftp.eezy.com';
export const VECTEEZY_SFTP_PORT = 22;

export const SHUTTERSTOCK_FTPS_HOST = 'ftps.shutterstock.com';
export const SHUTTERSTOCK_FTPS_PORT = 21;

export const ADOBE_STOCK_SFTP_HOST = 'sftp.contributor.adobestock.com';
export const ADOBE_STOCK_SFTP_PORT = 22;

export const DREAMSTIME_FTP_HOST = 'ftp.dreamstime.com';
export const DREAMSTIME_FTP_PORT = 21;

export type FtpSupportedAgencyId = 'dreamstime' | '123rf' | 'vecteezy' | 'shutterstock' | 'adobe';

export interface AgencyFtpServerSpec {
  agencyId: FtpSupportedAgencyId;
  name: string;
  protocol: FtpProtocolType;
  host: string;
  port: number;
  explicitTls?: boolean;
  rootFolder: string;
}

export const AGENCY_FTP_SERVER_SPECS: Record<FtpSupportedAgencyId, AgencyFtpServerSpec> = {
  dreamstime: {
    agencyId: 'dreamstime',
    name: 'Dreamstime',
    protocol: 'ftp',
    host: DREAMSTIME_FTP_HOST,
    port: DREAMSTIME_FTP_PORT,
    rootFolder: '/',
  },
  '123rf': {
    agencyId: '123rf',
    name: '123RF',
    protocol: 'ftp',
    host: ONE_TWO_THREE_RF_FTP_HOST,
    port: ONE_TWO_THREE_RF_FTP_PORT,
    rootFolder: '/',
  },
  vecteezy: {
    agencyId: 'vecteezy',
    name: 'Vecteezy',
    protocol: 'sftp',
    host: VECTEEZY_SFTP_HOST,
    port: VECTEEZY_SFTP_PORT,
    rootFolder: '/',
  },
  shutterstock: {
    agencyId: 'shutterstock',
    name: 'Shutterstock',
    protocol: 'ftps',
    host: SHUTTERSTOCK_FTPS_HOST,
    port: SHUTTERSTOCK_FTPS_PORT,
    explicitTls: true,
    rootFolder: '/',
  },
  adobe: {
    agencyId: 'adobe',
    name: 'Adobe Stock',
    protocol: 'sftp',
    host: ADOBE_STOCK_SFTP_HOST,
    port: ADOBE_STOCK_SFTP_PORT,
    rootFolder: '/',
  },
};

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
  agencyId?: FtpSupportedAgencyId;
  filename: string;
  stemName: string;
  mediaType: MediaType;
  isVectorBundle: boolean;
  isAiGenerated: boolean;
  isAiIgnored: boolean; // TRUE for vectors because AI vectors are strictly forbidden on 123RF
  protocol: FtpProtocolType;
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
  currentProtocol: FtpProtocolType;
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
  protocol: FtpProtocolType;
  host: string;
  port: number;
  remoteFolder: OneTwoThreeRfRemoteFolder;
  isAiIgnored: boolean;
  explicitTls?: boolean;
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

/**
 * Multi-Agency Route Resolver for 123RF, Vecteezy, Shutterstock, Adobe Stock, and Dreamstime:
 * - 123RF: Dynamic FTP (Port 21) / SFTP (Port 2022) & AI folder routing (/ai_image, /vector, /ai_video, /)
 * - Vecteezy: SFTP (Port 22, content-ftp.eezy.com) -> /
 * - Shutterstock: FTPS Explicit TLS (Port 21, ftps.shutterstock.com) -> /
 * - Adobe Stock: SFTP (Port 22, sftp.contributor.adobestock.com) -> /
 */
export function resolveMultiAgencyRoute(
  agencyId: FtpSupportedAgencyId,
  mediaType: MediaType,
  isAiGenerated: boolean
): RouteResolution {
  if (agencyId === '123rf') {
    return resolve123RfRoute(mediaType, isAiGenerated);
  }
  const spec = AGENCY_FTP_SERVER_SPECS[agencyId] || AGENCY_FTP_SERVER_SPECS['123rf'];
  return {
    protocol: spec.protocol,
    host: spec.host,
    port: spec.port,
    remoteFolder: '/',
    isAiIgnored: true,
    explicitTls: spec.explicitTls,
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
  batchIsAiGenerated: boolean,
  agencyId: FtpSupportedAgencyId = '123rf'
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
    const vecRoute = resolveMultiAgencyRoute(agencyId, 'vector', batchIsAiGenerated);
    const vecFolder = (agencyId === '123rf' ? '/vector' : '/') as any;

    if (matchingJpg) {
      processedJpgStems.add(stem);
      const totalSize = (matchingJpg.size || 0) + (epsFile.size || 0);
      const id = `${agencyId}-vec-${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      items.push({
        id,
        agencyId,
        filename: `${stem}.(jpg+eps)`,
        stemName: stem,
        mediaType: 'vector',
        isVectorBundle: true,
        isAiGenerated: false, // Vectors cannot be AI-generated on 123RF
        isAiIgnored: true,
        protocol: vecRoute.protocol,
        host: vecRoute.host,
        port: vecRoute.port,
        remoteFolder: vecFolder,
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
          remoteFolder: vecFolder,
          remotePath: vecFolder === '/' ? `/${matchingJpg.name}` : `${vecFolder}/${matchingJpg.name}`,
          fileObject: matchingJpg.file,
          uploaded: false,
          order: 1, // Preview first!
        },
        epsPart: {
          filename: epsFile.name,
          localPath: epsFile.path,
          fileSize: epsFile.size || 0,
          remoteFolder: vecFolder,
          remotePath: vecFolder === '/' ? `/${epsFile.name}` : `${vecFolder}/${epsFile.name}`,
          fileObject: epsFile.file,
          uploaded: false,
          order: 2, // Companion EPS second!
        },
        retryCount: 0,
        maxRetries: ONE_TWO_THREE_RF_MAX_RETRIES,
      });
    } else {
      // Standalone .eps without .jpg
      const id = `${agencyId}-eps-${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      items.push({
        id,
        agencyId,
        filename: epsFile.name,
        stemName: stem,
        mediaType: 'vector',
        isVectorBundle: false,
        isAiGenerated: false,
        isAiIgnored: true,
        protocol: vecRoute.protocol,
        host: vecRoute.host,
        port: vecRoute.port,
        remoteFolder: vecFolder,
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
    const route = resolveMultiAgencyRoute(agencyId, 'image', batchIsAiGenerated);
    const id = `${agencyId}-img-${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    items.push({
      id,
      agencyId,
      filename: jpgFile.name,
      stemName: stem,
      mediaType: 'image',
      isVectorBundle: false,
      isAiGenerated: agencyId === '123rf' ? batchIsAiGenerated : false,
      isAiIgnored: agencyId !== '123rf',
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
    const route = resolveMultiAgencyRoute(agencyId, mediaType, batchIsAiGenerated);
    const id = `${agencyId}-${mediaType}-${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    items.push({
      id,
      agencyId,
      filename: f.name,
      stemName: stem,
      mediaType,
      isVectorBundle: false,
      isAiGenerated: agencyId === '123rf' && mediaType !== 'vector' ? batchIsAiGenerated : false,
      isAiIgnored: agencyId !== '123rf' || mediaType === 'vector',
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
