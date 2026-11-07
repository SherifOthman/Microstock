import { MediaType } from '../../types';
import { bundleAndSortFtpQueue, isCsvFile } from './dreamstimeFtpRouter';

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

export const MAGNIFIC_SFTP_HOST = 'contributor-ftp.magnific.com';
export const MAGNIFIC_SFTP_PORT = 60022;

export const DREAMSTIME_FTP_HOST = 'upload.dreamstime.com';
export const DREAMSTIME_FTP_PORT = 21;

export type FtpSupportedAgencyId =
  | 'dreamstime'
  | '123rf'
  | 'magnific'
  | 'vecteezy'
  | 'shutterstock'
  | 'adobe';

/**
 * Pairing Agencies (Upload both: .jpg preview first, then .eps):
 * Dreamstime, 123RF, and Magnific.
 */
export const PAIRING_FTP_AGENCIES: ReadonlySet<FtpSupportedAgencyId> = new Set<FtpSupportedAgencyId>([
  'dreamstime',
  '123rf',
  'magnific',
]);

/**
 * Standalone Agencies (Upload ONLY .eps; skip companion .jpg from upload queue):
 * Shutterstock, Adobe Stock, and Vecteezy.
 */
export const STANDALONE_EPS_FTP_AGENCIES: ReadonlySet<FtpSupportedAgencyId> = new Set<FtpSupportedAgencyId>([
  'shutterstock',
  'adobe',
  'vecteezy',
]);

export function isPairingVectorAgency(agencyId: FtpSupportedAgencyId): boolean {
  return PAIRING_FTP_AGENCIES.has(agencyId);
}

export function isStandaloneEpsAgency(agencyId: FtpSupportedAgencyId): boolean {
  return STANDALONE_EPS_FTP_AGENCIES.has(agencyId);
}

export function deriveCompanionJpgPath(filePath?: string): string | undefined {
  if (!filePath || typeof filePath !== 'string') return undefined;
  if (/\.(eps|ai|cdr)$/i.test(filePath)) {
    return filePath.replace(/\.(eps|ai|cdr)$/i, '.jpg');
  }
  return filePath;
}

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
  magnific: {
    agencyId: 'magnific',
    name: 'Magnific',
    protocol: 'sftp',
    host: MAGNIFIC_SFTP_HOST,
    port: MAGNIFIC_SFTP_PORT,
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
  remoteFolder: OneTwoThreeRfRemoteFolder;
  remotePath: string;
  fileObject?: File;
  uploaded: boolean;
  order: 1 | 2; // 1 = .jpg preview (MUST upload first), 2 = .eps companion
}

export interface OneTwoThreeRfQueueItem {
  id: string;
  agencyId?: FtpSupportedAgencyId;
  filename: string;
  displayName?: string;
  stemName: string;
  mediaType: MediaType;
  isVectorBundle: boolean;
  isCsv?: boolean;
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
  previewLocalPath?: string;
  previewFileObject?: File;
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
  totalDurationSeconds?: number;
  batchIsAiGenerated?: boolean;
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
 * Multi-Agency Route Resolver for 123RF, Magnific, Vecteezy, Shutterstock, Adobe Stock, and Dreamstime:
 * - 123RF: Dynamic FTP (Port 21) / SFTP (Port 2022) & AI folder routing (/ai_image, /vector, /ai_video, /)
 * - Magnific: SFTP (Port 60022, contributor-ftp.magnific.com) -> /
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
 * Agency-aware bundler, filter, and sorter for FTP queues:
 * - Pairing Agencies (`Dreamstime`, `123RF`, `Magnific`):
 *   Pairs companion `.eps` + `.jpg` files sharing the same stem into a single Vector Bundle
 *   where `.jpg` preview uploads first (`order: 1`) and `.eps` uploads second (`order: 2`).
 * - Standalone Agencies (`Shutterstock`, `Adobe Stock`, `Vecteezy`):
 *   Detects if a `.jpg` is a companion preview for an `.eps` (matching stem) and strictly
 *   excludes/skips the `.jpg` from the upload queue so ONLY the `.eps` is queued and uploaded,
 *   while retaining the `.jpg` reference for thumbnail rendering (`previewFileObject` / `previewLocalPath`).
 * - Standardizes final queue sorting order across ALL agencies:
 *   1. Photos (`.jpg`) -> 2. Vectors (`.eps` or pairs) -> 3. Videos (`.mp4`, `.mov`) -> 4. Metadata (`.csv`).
 */
export function bundleAndRoute123RfQueue(
  rawFiles: RawInputMediaFile[],
  batchIsAiGenerated: boolean,
  agencyId: FtpSupportedAgencyId = '123rf'
): OneTwoThreeRfQueueItem[] {
  const effectiveBatchIsAi = agencyId === '123rf' ? Boolean(batchIsAiGenerated) : false;
  const shouldPairVectors = isPairingVectorAgency(agencyId);

  const epsMap = new Map<string, RawInputMediaFile>();
  const jpgMap = new Map<string, RawInputMediaFile>();
  const otherFiles: RawInputMediaFile[] = [];

  for (const f of rawFiles) {
    const ext = (f.name.slice(f.name.lastIndexOf('.')) || '').toLowerCase();
    const stem = getFilenameStem(f.name);
    if (VECTOR_EXTENSIONS.has(ext)) {
      epsMap.set(stem, f);
    } else if (JPG_PREVIEW_EXTENSIONS.has(ext)) {
      jpgMap.set(stem, f);
    } else {
      otherFiles.push(f);
    }
  }

  const items: OneTwoThreeRfQueueItem[] = [];
  const processedJpgStems = new Set<string>();

  // 1. Process Vectors (.eps + optional companion .jpg)
  for (const [stem, epsFile] of epsMap.entries()) {
    const matchingJpg = jpgMap.get(stem);
    const vecRoute = resolveMultiAgencyRoute(agencyId, 'vector', effectiveBatchIsAi);
    const vecFolder: OneTwoThreeRfRemoteFolder = agencyId === '123rf' ? '/vector' : '/';

    if (matchingJpg) {
      // Always mark matchingJpg stem as processed so it is never queued as a standalone photo
      processedJpgStems.add(stem);

      if (shouldPairVectors) {
        // Pairing Agency (123RF, Magnific, Dreamstime): Queue as paired Vector Bundle (JPG first, EPS second)
        const totalSize = (matchingJpg.size || 0) + (epsFile.size || 0);
        const id = `${agencyId}-vec-${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        items.push({
          id,
          agencyId,
          filename: `${stem}.(jpg+eps)`,
          displayName: `${stem}.(jpg+eps)`,
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
          localPath: epsFile.path || matchingJpg.path,
          fileObject: epsFile.file,
          previewLocalPath: matchingJpg.path,
          previewFileObject: matchingJpg.file,
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
        // Standalone EPS Agency (Shutterstock, Adobe Stock, Vecteezy):
        // Strictly exclude/skip the companion .jpg from uploading, queue ONLY the .eps,
        // and bind the companion .jpg for UI preview rendering!
        const id = `${agencyId}-eps-${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        items.push({
          id,
          agencyId,
          filename: epsFile.name,
          displayName: epsFile.name,
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
          previewLocalPath: matchingJpg.path || deriveCompanionJpgPath(epsFile.path),
          previewFileObject: matchingJpg.file,
          retryCount: 0,
          maxRetries: ONE_TWO_THREE_RF_MAX_RETRIES,
        });
      }
    } else {
      // Standalone .eps without .jpg in the current selection
      const id = `${agencyId}-eps-${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      items.push({
        id,
        agencyId,
        filename: epsFile.name,
        displayName: epsFile.name,
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
        previewLocalPath: deriveCompanionJpgPath(epsFile.path),
        retryCount: 0,
        maxRetries: ONE_TWO_THREE_RF_MAX_RETRIES,
      });
    }
  }

  // 2. Process Unpaired JPGs (Standalone Photos)
  for (const [stem, jpgFile] of jpgMap.entries()) {
    if (processedJpgStems.has(stem)) continue;
    const route = resolveMultiAgencyRoute(agencyId, 'image', effectiveBatchIsAi);
    const id = `${agencyId}-img-${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    items.push({
      id,
      agencyId,
      filename: jpgFile.name,
      displayName: jpgFile.name,
      stemName: stem,
      mediaType: 'image',
      isVectorBundle: false,
      isAiGenerated: agencyId === '123rf' ? effectiveBatchIsAi : false,
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
      previewLocalPath: jpgFile.path,
      previewFileObject: jpgFile.file,
      retryCount: 0,
      maxRetries: ONE_TWO_THREE_RF_MAX_RETRIES,
    });
  }

  // 3. Process Other Files (Videos, CSV Metadata, Other Rasters)
  for (const f of otherFiles) {
    const stem = getFilenameStem(f.name);
    const csv = isCsvFile(f.name);
    const mediaType: MediaType = csv ? 'image' : detect123RfMediaType(f.name);
    const route = resolveMultiAgencyRoute(agencyId, mediaType, effectiveBatchIsAi);
    const remoteFolder: OneTwoThreeRfRemoteFolder = csv ? '/' : route.remoteFolder;
    const id = `${agencyId}-${csv ? 'csv' : mediaType}-${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    items.push({
      id,
      agencyId,
      filename: f.name,
      displayName: f.name,
      stemName: stem,
      mediaType,
      isVectorBundle: false,
      isCsv: csv,
      isAiGenerated: agencyId === '123rf' && !csv && mediaType !== 'vector' ? effectiveBatchIsAi : false,
      isAiIgnored: agencyId !== '123rf' || csv || mediaType === 'vector',
      protocol: csv ? AGENCY_FTP_SERVER_SPECS[agencyId].protocol : route.protocol,
      host: csv ? AGENCY_FTP_SERVER_SPECS[agencyId].host : route.host,
      port: csv ? AGENCY_FTP_SERVER_SPECS[agencyId].port : route.port,
      remoteFolder,
      status: 'queued',
      fileSize: f.size || 0,
      bytesTransferred: 0,
      progressPercent: 0,
      localPath: f.path,
      fileObject: f.file,
      previewLocalPath: csv ? undefined : f.path,
      previewFileObject: csv ? undefined : f.file,
      retryCount: 0,
      maxRetries: ONE_TWO_THREE_RF_MAX_RETRIES,
    });
  }

  // 4. Standardize Queue Sorting Order:
  // 1. Photos (.jpg) -> 2. Vectors (.eps or pairs) -> 3. Videos (.mp4, .mov) -> 4. Metadata (.csv)
  return bundleAndSortFtpQueue(items);
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
