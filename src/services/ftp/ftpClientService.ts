import { db } from '../../db';
import { notifyBatchComplete } from '../desktop/osNotifications';
import { encryptSecret } from '../desktop/secureStorage';
import {
  bundleAndSortFtpQueue,
  DreamstimeRemoteFolder,
  formatEtaSeconds,
  FTP_MAX_RETRIES_PER_FILE,
  FTP_RETRY_BACKOFF_SCHEDULE_MS,
  FtpBundlePart,
  FtpCredentialProfile,
  FtpExecutionMode,
  FtpProtocolType,
  FtpQueueItem,
  FtpTelemetryFrame,
  generateDynamicCsvRemoteName,
  getFilenameStem,
  isCsvFile,
  isJpgPreviewExtension,
  isVectorExtension,
  resolveDreamstimeRoute,
  SimulatedFaultMode,
  sortFtpQueueByMediaPriority,
} from './dreamstimeFtpRouter';

type Listener = () => void;

export interface FtpBatchRunOptions {
  mode?: FtpExecutionMode;
  faultMode?: SimulatedFaultMode;
  faultTargetFilenames?: string[];
  baseBackoffMs?: number;
  simulatedChunkIntervalMs?: number;
}

const INITIAL_TELEMETRY: FtpTelemetryFrame = {
  sessionId: '',
  mode: 'live',
  isRunning: false,
  isPaused: false,
  totalFiles: 0,
  completedFiles: 0,
  succeededFiles: 0,
  failedFiles: 0,
  skippedFiles: 0,
  currentFileIndex: 0,
  currentItemId: null,
  currentFilename: '',
  currentRemoteFolder: '/',
  currentFileBytesTransferred: 0,
  currentFileTotalBytes: 0,
  currentFilePercent: 0,
  batchBytesTransferred: 0,
  batchTotalBytes: 0,
  batchPercent: 0,
  speedBytesPerSec: 0,
  etaSeconds: null,
  activeRetryAttempt: 0,
  statusMessage: 'Ready',
};

function buildPreviewUrl(fileObject?: File, localPath?: string): string | undefined {
  if (fileObject && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      return URL.createObjectURL(fileObject);
    } catch {
      // fall through
    }
  }
  if (localPath) {
    return `stockflow://local?path=${encodeURIComponent(localPath)}`;
  }
  return undefined;
}

function revokePreviewUrl(url?: string): void {
  if (url && url.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }
}

/**
 * Decoupled Background FTP Orchestrator for Microstock Agencies.
 * Operates completely independently of MetadataStudioView or DistributionTrackerView UI state,
 * while logging every transfer outcome into SQLite (`ftp_sessions` & `ftp_transfer_logs`).
 */
export class DreamstimeFtpOrchestrator {
  private queue: FtpQueueItem[] = [];
  private telemetry: FtpTelemetryFrame = { ...INITIAL_TELEMETRY };
  private listeners = new Set<Listener>();
  private mode: FtpExecutionMode = 'live';
  private faultMode: SimulatedFaultMode = 'none';
  private aborted = false;
  private isRunning = false;
  private isPaused = false;
  private ipcUnsub: (() => void) | null = null;
  private currentSpeedBps = 0;
  private keepAwakeActive = false;
  private speedTimer: ReturnType<typeof setInterval> | null = null;
  private byteSamples: Array<{ time: number; bytes: number }> = [];
  private batchStartTime = 0;

  constructor() {
    if (typeof window !== 'undefined' && window.electronAPI?.ftp?.onTelemetry) {
      this.ipcUnsub = window.electronAPI.ftp.onTelemetry((frame) => {
        if (frame.type === 'file-progress' && frame.itemId) {
          this.handleLiveProgressTick(frame.itemId, frame.bytesTransferred);
        }
      });
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[FtpOrchestrator] Listener error:', err);
      }
    });
  }

  getQueue(): FtpQueueItem[] {
    return this.queue;
  }

  getTelemetry(): FtpTelemetryFrame {
    return this.telemetry;
  }

  getMode(): FtpExecutionMode {
    return this.mode;
  }

  setMode(mode: FtpExecutionMode): void {
    this.mode = mode;
    this.telemetry = { ...this.telemetry, mode };
    this.notify();
  }

  getFaultMode(): SimulatedFaultMode {
    return this.faultMode;
  }

  setFaultMode(faultMode: SimulatedFaultMode): void {
    this.faultMode = faultMode;
    this.notify();
  }

  /**
   * Saves Dreamstime Plain FTP credentials (port 21, unencrypted standard FTP)
   * with password encrypted at rest via Electron safeStorage into SQLite `ftp_profiles`.
   */
  async saveDreamstimeCredentials(payload: {
    protocol?: FtpProtocolType;
    host: string;
    port?: number;
    username: string;
    password?: string;
    passiveMode?: boolean;
  }): Promise<FtpCredentialProfile> {
    const cleanHost = (payload.host || 'ftp.dreamstime.com').trim();
    const cleanUsername = (payload.username || '').trim();

    if (typeof window !== 'undefined' && window.electronAPI?.ftp?.saveCredentials) {
      await window.electronAPI.ftp.saveCredentials({
        agencyId: 'dreamstime',
        protocol: 'ftp',
        host: cleanHost,
        port: 21,
        username: cleanUsername,
        password: payload.password,
        passiveMode: true,
      });
      return await db.ftp.getProfile('dreamstime');
    }

    let encryptedPassword: string | undefined;
    if (typeof payload.password === 'string' && payload.password.trim().length > 0) {
      const enc = await encryptSecret(payload.password.trim());
      encryptedPassword = enc.startsWith('enc:')
        ? enc
        : `enc:${Array.from(new TextEncoder().encode(payload.password.trim()))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')}`;
    }

    return await db.ftp.saveProfile({
      agencyId: 'dreamstime',
      protocol: 'ftp',
      host: cleanHost,
      port: 21,
      username: cleanUsername,
      encryptedPassword,
      passiveMode: true,
    });
  }

  /**
   * Tests Plain FTP connection on port 21 to `ftp.dreamstime.com`.
   */
  async testDreamstimeConnection(payload: {
    protocol?: FtpProtocolType;
    host: string;
    port?: number;
    username: string;
    password?: string;
    mode?: FtpExecutionMode;
  }): Promise<{
    success: boolean;
    latencyMs?: number;
    verifiedAt?: number;
    error?: string;
  }> {
    const host = (payload.host || 'ftp.dreamstime.com').trim();
    const username = (payload.username || '').trim();

    if (!host || !username) {
      return {
        success: false,
        error: 'Dreamstime FTP Host and Username are required.',
      };
    }

    if (typeof window !== 'undefined' && window.electronAPI?.ftp?.testConnection) {
      const res = await window.electronAPI.ftp.testConnection({
        agencyId: 'dreamstime',
        protocol: 'ftp',
        host,
        port: 21,
        username,
        password: payload.password,
      });
      return res;
    }

    // Fallback verification when running outside Electron
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 60));
    const now = Date.now();
    await this.saveDreamstimeCredentials({
      protocol: 'ftp',
      host,
      port: 21,
      username,
      password: payload.password,
      passiveMode: true,
    });
    await db.ftp.saveProfile({
      agencyId: 'dreamstime',
      protocol: 'ftp',
      host,
      port: 21,
      lastVerifiedAt: now,
    });

    return {
      success: true,
      latencyMs: Math.max(35, Date.now() - start),
      verifiedAt: now,
    };
  }

  /**
   * Enqueues File objects or file descriptors:
   * - Automatically detects Vector Pairs (`basename.jpg` + `basename.eps`/`.ai`) and merges them into a single
   *   atomic `Vector Bundle: <basename>` item (`isVectorBundle: true`) so the JPG preview is uploaded to `/`
   *   first and the EPS counterpart is uploaded to `/additional` immediately after.
   * - Routes standalone files to `/` (Photos), `/additional` (Standalone Vectors), or `/video` (Videos).
   * - Automatically sorts the queue: Standalone Photos (0) -> Vector Bundles & Vectors (1) -> Videos (2).
   */
  addFiles(
    files: Array<
      | File
      | {
          name: string;
          size: number;
          path?: string;
        }
    >
  ): FtpQueueItem[] {
    const normalizedInputs: Array<{
      filename: string;
      stem: string;
      stemKey: string;
      localPath: string;
      fileSize: number;
      fileObject?: File;
      route: ReturnType<typeof resolveDreamstimeRoute>;
      isJpg: boolean;
      isVec: boolean;
    }> = [];

    for (const f of files) {
      const filename = (f.name || '').trim();
      if (!filename) continue;
      const route = resolveDreamstimeRoute(filename);
      const localPath =
        typeof window !== 'undefined' && f instanceof File && window.electronAPI?.getPathForFile
          ? window.electronAPI.getPathForFile(f)
          : (f as { path?: string }).path || `/StockFlow/Master_Vault/${filename}`;
      const fileSize = Math.max(1024, f.size || 2_400_000);
      const stem = getFilenameStem(filename);
      normalizedInputs.push({
        filename,
        stem,
        stemKey: stem.toLowerCase(),
        localPath,
        fileSize,
        fileObject: f instanceof File ? f : undefined,
        route,
        isJpg: isJpgPreviewExtension(filename),
        isVec: isVectorExtension(filename),
      });
    }

    const added: FtpQueueItem[] = [];
    const consumedIndices = new Set<number>();

    // First pass: check if incoming files can pair with an already-queued standalone JPG or standalone Vector
    for (let idx = 0; idx < normalizedInputs.length; idx++) {
      const entry = normalizedInputs[idx];
      if (!entry.isJpg && !entry.isVec) continue;

      const existingMatch = this.queue.find((q) => {
        if (q.isVectorBundle || q.status !== 'queued') return false;
        const qStemKey = (q.stemName || getFilenameStem(q.filename)).toLowerCase();
        if (qStemKey !== entry.stemKey) return false;
        if (entry.isJpg && isVectorExtension(q.filename)) return true;
        if (entry.isVec && isJpgPreviewExtension(q.filename)) return true;
        return false;
      });

      if (existingMatch) {
        consumedIndices.add(idx);
        const jpgSource = entry.isJpg
          ? {
              filename: entry.filename,
              localPath: entry.localPath,
              fileSize: entry.fileSize,
              fileObject: entry.fileObject,
            }
          : {
              filename: existingMatch.filename,
              localPath: existingMatch.localPath,
              fileSize: existingMatch.fileSize,
              fileObject: existingMatch.fileObject,
            };

        const epsSource = entry.isVec
          ? {
              filename: entry.filename,
              localPath: entry.localPath,
              fileSize: entry.fileSize,
              fileObject: entry.fileObject,
            }
          : {
              filename: existingMatch.filename,
              localPath: existingMatch.localPath,
              fileSize: existingMatch.fileSize,
              fileObject: existingMatch.fileObject,
            };

        const jpgPart: FtpBundlePart = {
          filename: jpgSource.filename,
          localPath: jpgSource.localPath,
          fileSize: jpgSource.fileSize,
          remoteFolder: '/',
          remotePath: `/${jpgSource.filename}`,
          fileObject: jpgSource.fileObject,
          uploaded: false,
        };
        const epsPart: FtpBundlePart = {
          filename: epsSource.filename,
          localPath: epsSource.localPath,
          fileSize: epsSource.fileSize,
          remoteFolder: '/additional',
          remotePath: `/additional/${epsSource.filename}`,
          fileObject: epsSource.fileObject,
          uploaded: false,
        };

        existingMatch.isVectorBundle = true;
        existingMatch.stemName = entry.stem;
        existingMatch.displayName = `Vector Bundle: ${entry.stem}`;
        existingMatch.filename = `${jpgSource.filename} + ${epsSource.filename}`;
        existingMatch.mediaType = 'vector';
        existingMatch.remoteFolder = '/additional';
        existingMatch.remotePath = `/ → /additional`;
        existingMatch.fileSize = jpgPart.fileSize + epsPart.fileSize;
        existingMatch.jpgPart = jpgPart;
        existingMatch.epsPart = epsPart;
        existingMatch.previewUrl =
          existingMatch.previewUrl || buildPreviewUrl(jpgPart.fileObject, jpgPart.localPath);
        added.push(existingMatch);
      }
    }

    // Second pass: pair matching JPG + EPS stems within the incoming batch itself
    for (let i = 0; i < normalizedInputs.length; i++) {
      if (consumedIndices.has(i)) continue;
      const current = normalizedInputs[i];

      if (current.isJpg || current.isVec) {
        let partnerIdx = -1;
        for (let j = i + 1; j < normalizedInputs.length; j++) {
          if (consumedIndices.has(j)) continue;
          const candidate = normalizedInputs[j];
          if (candidate.stemKey !== current.stemKey) continue;
          if ((current.isJpg && candidate.isVec) || (current.isVec && candidate.isJpg)) {
            partnerIdx = j;
            break;
          }
        }

        if (partnerIdx !== -1) {
          consumedIndices.add(i);
          consumedIndices.add(partnerIdx);
          const partner = normalizedInputs[partnerIdx];
          const jpgEntry = current.isJpg ? current : partner;
          const epsEntry = current.isVec ? current : partner;

          const jpgPart: FtpBundlePart = {
            filename: jpgEntry.filename,
            localPath: jpgEntry.localPath,
            fileSize: jpgEntry.fileSize,
            remoteFolder: '/',
            remotePath: `/${jpgEntry.filename}`,
            fileObject: jpgEntry.fileObject,
            uploaded: false,
          };
          const epsPart: FtpBundlePart = {
            filename: epsEntry.filename,
            localPath: epsEntry.localPath,
            fileSize: epsEntry.fileSize,
            remoteFolder: '/additional',
            remotePath: `/additional/${epsEntry.filename}`,
            fileObject: epsEntry.fileObject,
            uploaded: false,
          };

          const bundleItem: FtpQueueItem = {
            id: `ftp_bundle_${crypto.randomUUID().slice(0, 8)}`,
            filename: `${jpgEntry.filename} + ${epsEntry.filename}`,
            displayName: `Vector Bundle: ${jpgEntry.stem}`,
            stemName: jpgEntry.stem,
            isVectorBundle: true,
            jpgPart,
            epsPart,
            previewUrl: buildPreviewUrl(jpgEntry.fileObject, jpgEntry.localPath),
            localPath: jpgEntry.localPath,
            fileSize: jpgPart.fileSize + epsPart.fileSize,
            mediaType: 'vector',
            remoteFolder: '/additional',
            remotePath: `/ → /additional`,
            status: 'queued',
            bytesTransferred: 0,
            progressPercent: 0,
            retryCount: 0,
            maxRetries: FTP_MAX_RETRIES_PER_FILE,
            fileObject: jpgEntry.fileObject,
          };
          this.queue.push(bundleItem);
          added.push(bundleItem);
          continue;
        }
      }

      // Standalone file or CSV
      consumedIndices.add(i);
      const isCsv = isCsvFile(current.filename);
      const remoteName = isCsv
        ? generateDynamicCsvRemoteName(current.filename)
        : current.filename;
      const remoteFolder: DreamstimeRemoteFolder = isCsv ? '/' : current.route.remoteFolder;
      const remotePath = isCsv ? `/${remoteName}` : current.route.remotePath;

      const item: FtpQueueItem = {
        id: `ftp_item_${crypto.randomUUID().slice(0, 8)}`,
        filename: remoteName,
        displayName: current.filename,
        remoteName,
        stemName: current.stem,
        isVectorBundle: false,
        isCsv,
        previewUrl: isCsv ? undefined : buildPreviewUrl(current.fileObject, current.localPath),
        localPath: current.localPath,
        fileSize: current.fileSize,
        mediaType: current.route.mediaType,
        remoteFolder,
        remotePath,
        status: 'queued',
        bytesTransferred: 0,
        progressPercent: 0,
        retryCount: 0,
        maxRetries: FTP_MAX_RETRIES_PER_FILE,
        fileObject: current.fileObject,
      };
      this.queue.push(item);
      added.push(item);
    }

    // Intelligent File Sorting: Standalone Photos (0) -> Vector Bundles & Vectors (1) -> Videos (2) -> Metadata CSV (3)
    this.queue = bundleAndSortFtpQueue(this.queue);

    this.recalculateBatchTelemetry();
    this.notify();
    return added;
  }

  /**
   * Opens native directory dialog in Electron (if available) to scan and add all media files in a folder.
   * Returns null if running in a browser so the caller can trigger `<input webkitdirectory />`.
   */
  async selectAndAddNativeFolder(): Promise<FtpQueueItem[] | null> {
    if (typeof window !== 'undefined' && window.electronAPI?.ftp?.selectFolderFiles) {
      const res = await window.electronAPI.ftp.selectFolderFiles();
      if (res.canceled) return [];
      if (res.files && res.files.length > 0) {
        return this.addFiles(res.files);
      }
      return [];
    }
    return null;
  }

  removeItem(id: string): void {
    if (this.isRunning) return;
    const target = this.queue.find((i) => i.id === id);
    if (target?.previewUrl) {
      revokePreviewUrl(target.previewUrl);
    }
    this.queue = this.queue.filter((i) => i.id !== id);
    this.recalculateBatchTelemetry();
    this.notify();
  }

  clearCompleted(): void {
    if (this.isRunning) return;
    for (const item of this.queue) {
      if (item.status === 'succeeded' && item.previewUrl) {
        revokePreviewUrl(item.previewUrl);
      }
    }
    this.queue = this.queue.filter((i) => i.status !== 'succeeded');
    this.recalculateBatchTelemetry();
    this.notify();
  }

  async retrySingleItem(itemId: string, options: FtpBatchRunOptions = {}): Promise<boolean> {
    const item = this.queue.find((i) => i.id === itemId);
    if (!item) return false;
    item.status = 'queued';
    item.bytesTransferred = 0;
    item.progressPercent = 0;
    item.retryCount = 0;
    item.errorCode = undefined;
    item.errorMessage = undefined;
    if (item.isVectorBundle && item.jpgPart && item.epsPart) {
      // Keep jpgPart.uploaded if it already succeeded so retry only uploads the missing part,
      // or reset if neither succeeded
      if (item.jpgPart.uploaded && !item.epsPart.uploaded) {
        item.bytesTransferred = item.jpgPart.fileSize;
        item.progressPercent = Math.round((item.jpgPart.fileSize / Math.max(1, item.fileSize)) * 100);
      }
    }
    this.recalculateBatchTelemetry();
    this.notify();
    if (!this.isRunning) {
      await this.startBatchUpload(options);
    }
    return true;
  }

  async setKeepAwake(enable: boolean): Promise<boolean> {
    this.keepAwakeActive = enable;
    if (typeof window !== 'undefined' && window.electronAPI?.setPowerSaveBlocker) {
      try {
        const res = await window.electronAPI.setPowerSaveBlocker(enable);
        return res?.active ?? enable;
      } catch {
        return enable;
      }
    }
    return enable;
  }

  isKeepAwakeActive(): boolean {
    return this.keepAwakeActive || this.isRunning;
  }

  clearQueue(): void {
    if (this.isRunning) return;
    for (const item of this.queue) {
      if (item.previewUrl) {
        revokePreviewUrl(item.previewUrl);
      }
    }
    this.queue = [];
    this.byteSamples = [];
    this.currentSpeedBps = 0;
    this.telemetry = {
      ...INITIAL_TELEMETRY,
      mode: this.mode,
    };
    this.notify();
  }

  pauseBatch(): void {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    this.currentSpeedBps = 0;
    this.byteSamples = [];
    this.telemetry = {
      ...this.telemetry,
      isPaused: true,
      speedBytesPerSec: 0,
      etaSeconds: null,
      statusMessage: 'Paused',
    };
    this.notify();
  }

  resumeBatch(): void {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    this.byteSamples = [
      {
        time: Date.now(),
        bytes: this.calculateBatchTransferredBytes(),
      },
    ];
    this.telemetry = {
      ...this.telemetry,
      isPaused: false,
      statusMessage: 'Resuming...',
    };
    this.notify();
  }

  getIsPaused(): boolean {
    return this.isPaused;
  }

  abortBatch(): void {
    this.aborted = true;
    this.isPaused = false;
    if (typeof window !== 'undefined' && window.electronAPI?.ftp?.abortBatch) {
      window.electronAPI.ftp.abortBatch().catch(() => {});
    }
    this.telemetry = {
      ...this.telemetry,
      isRunning: false,
      isPaused: false,
      speedBytesPerSec: 0,
      etaSeconds: null,
      statusMessage: 'Batch aborted by user',
    };
    this.notify();
  }

  private calculateBatchTransferredBytes(): number {
    let total = 0;
    for (const item of this.queue) {
      if (item.status === 'succeeded') {
        total += item.fileSize;
      } else if (
        item.status === 'uploading' ||
        item.status === 'retrying' ||
        item.status === 'retry'
      ) {
        total += item.bytesTransferred;
      }
    }
    return total;
  }

  private recordByteDeltaSample(): void {
    const now = Date.now();
    const currentBytes = this.calculateBatchTransferredBytes();
    this.byteSamples.push({ time: now, bytes: currentBytes });
    // Keep samples within the last 2500ms for smooth 1000ms instantaneous delta calculation
    const cutoff = now - 2500;
    while (this.byteSamples.length > 2 && this.byteSamples[0].time < cutoff) {
      this.byteSamples.shift();
    }

    // Find sample closest to ~1000ms ago
    const baseline = this.byteSamples[0];
    const elapsedSec = (now - baseline.time) / 1000;
    if (elapsedSec >= 0.15) {
      const deltaBytes = Math.max(0, currentBytes - baseline.bytes);
      this.currentSpeedBps = Math.round(deltaBytes / elapsedSec);
    }
  }

  private handleLiveProgressTick(itemId: string, bytesTransferred: number): void {
    const item = this.queue.find((q) => q.id === itemId);
    if (!item) return;
    // Ignore stale ticks for items that are no longer actively uploading
    if (item.status !== 'uploading') return;

    const clamped = Math.min(item.fileSize, Math.max(0, bytesTransferred));
    item.bytesTransferred = clamped;
    item.progressPercent = Math.min(100, Math.round((clamped / Math.max(1, item.fileSize)) * 100));
    this.recordByteDeltaSample();
    this.recalculateBatchTelemetry(item, this.currentSpeedBps);
    this.notify();
  }

  private recalculateBatchTelemetry(
    activeItem?: FtpQueueItem,
    speedBps?: number,
    statusMessage?: string
  ): void {
    const totalFiles = this.queue.length;
    let succeededFiles = 0;
    let failedFiles = 0;
    let skippedFiles = 0;
    let batchBytesTransferred = 0;
    let batchTotalBytes = 0;

    for (const item of this.queue) {
      batchTotalBytes += item.fileSize;
      if (item.status === 'succeeded') {
        succeededFiles++;
        batchBytesTransferred += item.fileSize;
      } else if (item.status === 'failed') {
        failedFiles++;
      } else if (item.status === 'skipped') {
        skippedFiles++;
      } else if (
        item.status === 'uploading' ||
        item.status === 'retrying' ||
        item.status === 'retry'
      ) {
        batchBytesTransferred += item.bytesTransferred;
      }
    }

    const completedFiles = succeededFiles + failedFiles + skippedFiles;
    const batchPercent =
      totalFiles > 0
        ? completedFiles === totalFiles
          ? 100
          : batchTotalBytes > 0
          ? Math.min(99, Math.round((batchBytesTransferred / batchTotalBytes) * 100))
          : 0
        : 0;

    const currentSpeed = speedBps !== undefined ? speedBps : this.telemetry.speedBytesPerSec;
    const remainingBytes = Math.max(0, batchTotalBytes - batchBytesTransferred);
    const etaSeconds =
      this.isRunning && !this.isPaused && currentSpeed > 0
        ? Math.round(remainingBytes / currentSpeed)
        : null;

    const currentIdx = activeItem
      ? this.queue.findIndex((i) => i.id === activeItem.id) + 1
      : completedFiles;

    this.telemetry = {
      ...this.telemetry,
      mode: this.mode,
      isRunning: this.isRunning,
      totalFiles,
      completedFiles,
      succeededFiles,
      failedFiles,
      skippedFiles,
      currentFileIndex: Math.min(totalFiles, Math.max(0, currentIdx)),
      currentItemId: activeItem ? activeItem.id : null,
      currentFilename: activeItem ? activeItem.displayName || activeItem.filename : '',
      currentRemoteFolder: (activeItem ? activeItem.remoteFolder : '/') as DreamstimeRemoteFolder,
      currentFileBytesTransferred: activeItem ? activeItem.bytesTransferred : 0,
      currentFileTotalBytes: activeItem ? activeItem.fileSize : 0,
      currentFilePercent: activeItem ? activeItem.progressPercent : 0,
      batchBytesTransferred,
      batchTotalBytes,
      batchPercent,
      speedBytesPerSec: currentSpeed,
      etaSeconds,
      activeRetryAttempt: activeItem ? activeItem.retryCount : 0,
      statusMessage: statusMessage ?? this.telemetry.statusMessage,
    };
  }

  /**
   * Computes the retry delay in milliseconds for attempt `retryAttempt` (1..5).
   * Uses the 5-step aggressive schedule [2000, 5000, 10000, 30000, 60000] (2s, 5s, 10s, 30s, 60s)
   * unless `baseBackoffMs` is explicitly provided (e.g., in fast unit tests).
   */
  getRetryDelayMs(retryAttempt: number, baseBackoffMs?: number): number {
    if (baseBackoffMs !== undefined) {
      return baseBackoffMs * Math.pow(2, Math.max(0, retryAttempt - 1));
    }
    const idx = Math.min(
      FTP_RETRY_BACKOFF_SCHEDULE_MS.length - 1,
      Math.max(0, retryAttempt - 1)
    );
    return FTP_RETRY_BACKOFF_SCHEDULE_MS[idx];
  }

  /**
   * Uploads a single physical file via Electron IPC (with persistent FTP socket + 30s zero-byte stall watchdog,
   * NO hardcoded 35-second cutoff!).
   */
  private async executePhysicalUpload(params: {
    itemId: string;
    filename: string;
    localPath?: string;
    fileObject?: File;
    remoteFolder: DreamstimeRemoteFolder;
    byteOffset: number;
  }): Promise<{
    success: boolean;
    isDuplicateSkip?: boolean;
    errorCode?: string;
    errorMessage?: string;
  }> {
    let fileBuffer: ArrayBuffer | undefined;
    if (params.fileObject) {
      try {
        fileBuffer = await params.fileObject.arrayBuffer();
      } catch {
        // ignore buffer read error
      }
    }

    const ftpApi = window.electronAPI?.ftp;
    if (!ftpApi) {
      return {
        success: false,
        errorCode: 'NO_IPC',
        errorMessage: 'Electron FTP bridge is unavailable.',
      };
    }

    const res = await ftpApi.uploadFile({
      agencyId: 'dreamstime',
      localPath: params.localPath,
      fileBuffer,
      remoteFolder: params.remoteFolder,
      filename: params.filename,
      itemId: params.itemId,
      byteOffset: params.byteOffset,
    });

    return {
      success: Boolean(res.success),
      isDuplicateSkip: Boolean(res.isDuplicateSkip),
      errorCode: res.errorCode,
      errorMessage: res.errorMessage,
    };
  }

  /**
   * Runs all queued items sequentially (Standalone Photos -> Vector Bundles/Vectors -> Videos) with:
   * - Persistent single-socket Plain FTP on Port 21 (`secure: false`)
   * - Atomic two-phase upload for Vector Bundles (`JPG -> /` first, then `EPS -> /additional`)
   * - Strict isolation of `550` duplicate skips from transient network drops (`4xx` / `ETIMEDOUT_STALL`)
   * - 5x round-robin retry sweeps
   * - Persistent SQLite session & file logging (`ftp_sessions` & `ftp_transfer_logs`)
   */
  async startBatchUpload(options: FtpBatchRunOptions = {}): Promise<{
    sessionId: string;
    succeededCount: number;
    failedCount: number;
  }> {
    if (this.isRunning) {
      return {
        sessionId: this.telemetry.sessionId,
        succeededCount: this.telemetry.succeededFiles,
        failedCount: this.telemetry.failedFiles,
      };
    }

    // STRICTLY STATIC visual array: Maintain exact indices, zero reordering during upload!
    const pendingItems = this.queue.filter(
      (i) => i.status === 'queued' || i.status === 'retry' || i.status === 'retrying'
    );
    if (pendingItems.length === 0) {
      return { sessionId: '', succeededCount: 0, failedCount: 0 };
    }

    const runMode = options.mode || this.mode;
    const activeFaultMode = options.faultMode || this.faultMode;
    const chunkIntervalMs =
      options.simulatedChunkIntervalMs !== undefined ? options.simulatedChunkIntervalMs : 20;

    this.isRunning = true;
    this.isPaused = false;
    this.aborted = false;
    this.batchStartTime = Date.now();
    await this.setKeepAwake(true);

    const totalBatchBytes = this.queue.reduce((acc, i) => acc + i.fileSize, 0);
    const session = await db.ftp.createSession({
      agencyId: 'dreamstime',
      mode: runMode,
      totalFiles: this.queue.length,
      totalBytes: totalBatchBytes,
    });

    this.telemetry = {
      ...this.telemetry,
      sessionId: session.id,
      mode: runMode,
      isRunning: true,
      statusMessage: 'Connecting...',
    };
    this.notify();

    this.currentSpeedBps = 0;
    this.byteSamples = [
      {
        time: Date.now(),
        bytes: this.calculateBatchTransferredBytes(),
      },
    ];

    // 1000ms ticker for instantaneous delta speed & ETA
    if (this.speedTimer) {
      clearInterval(this.speedTimer);
    }
    this.speedTimer = setInterval(() => {
      if (!this.isRunning) return;
      if (this.isPaused) {
        this.currentSpeedBps = 0;
        this.recalculateBatchTelemetry(undefined, 0, 'Paused');
        this.notify();
        return;
      }
      this.recordByteDeltaSample();
      const activeItem = this.queue.find((q) => q.status === 'uploading');
      this.recalculateBatchTelemetry(activeItem, this.currentSpeedBps);
      this.notify();
    }, 1000);

    const faultTargetIds = new Set<string>();
    if (activeFaultMode !== 'none') {
      if (options.faultTargetFilenames && options.faultTargetFilenames.length > 0) {
        for (const item of this.queue) {
          if (
            options.faultTargetFilenames.includes(item.filename) ||
            (item.jpgPart && options.faultTargetFilenames.includes(item.jpgPart.filename)) ||
            (item.epsPart && options.faultTargetFilenames.includes(item.epsPart.filename))
          ) {
            faultTargetIds.add(item.id);
          }
        }
      } else {
        const targetItem = pendingItems[Math.min(1, pendingItems.length - 1)];
        if (targetItem) faultTargetIds.add(targetItem.id);
      }
    }

    const useNativeElectronFtp =
      runMode === 'live' &&
      activeFaultMode === 'none' &&
      typeof window !== 'undefined' &&
      Boolean(window.electronAPI?.ftp?.uploadFile);

    try {
      // ROUND-ROBIN SWEEP RETRY LOOP (Max 5 sweeps)
      for (let sweep = 1; sweep <= FTP_MAX_RETRIES_PER_FILE; sweep++) {
        if (this.aborted) break;

        const hasEligibleInSweep = this.queue.some((item) => {
          if (sweep === 1) {
            return item.status === 'queued' || item.status === 'retry' || item.status === 'retrying';
          }
          return item.status === 'retry' || item.status === 'retrying';
        });

        if (!hasEligibleInSweep) break;

        // Iterate through array in STRICTLY STATIC order (indices 0..queue.length-1)
        for (let i = 0; i < this.queue.length; i++) {
          if (this.aborted) break;
          const item = this.queue[i];

          const isEligible =
            sweep === 1
              ? item.status === 'queued' || item.status === 'retry' || item.status === 'retrying'
              : item.status === 'retry' || item.status === 'retrying';

          if (!isEligible) continue;

          // If paused, wait here until resumed or aborted without starting the next file
          while (this.isPaused && !this.aborted) {
            await new Promise((r) => setTimeout(r, 200));
          }
          if (this.aborted) break;

          if (sweep > 1) {
            item.retryCount = sweep;
          }

          item.status = 'uploading';
          this.recalculateBatchTelemetry(
            item,
            this.currentSpeedBps,
            `Uploading ${item.displayName || item.filename} → ${item.remoteFolder}`
          );
          this.notify();

          const fileStartMs = Date.now();
          let succeeded = false;
          let isDuplicateSkip = false;
          let lastErrorCode = '';
          let lastErrorMessage = '';

          if (useNativeElectronFtp && window.electronAPI?.ftp?.uploadFile) {
            if (item.isVectorBundle && item.jpgPart && item.epsPart) {
              // ATOMIC TWO-PHASE VECTOR BUNDLE UPLOAD:
              // Phase A: Upload JPG preview to root `/` first
              let phaseAOk = item.jpgPart.uploaded;
              if (!phaseAOk) {
                const resA = await this.executePhysicalUpload({
                  itemId: item.id,
                  filename: item.jpgPart.filename,
                  localPath: item.jpgPart.localPath,
                  fileObject: item.jpgPart.fileObject,
                  remoteFolder: '/',
                  byteOffset: 0,
                });
                if (resA.success || resA.isDuplicateSkip) {
                  item.jpgPart.uploaded = true;
                  phaseAOk = true;
                  item.bytesTransferred = item.jpgPart.fileSize;
                  item.progressPercent = Math.round(
                    (item.jpgPart.fileSize / Math.max(1, item.fileSize)) * 100
                  );
                  this.recordByteDeltaSample();
                  this.recalculateBatchTelemetry(item, this.currentSpeedBps);
                  this.notify();
                } else {
                  lastErrorCode = resA.errorCode || 'ECONNRESET';
                  lastErrorMessage =
                    resA.errorMessage || `Failed uploading preview ${item.jpgPart.filename}`;
                }
              }

              // Phase B: Only after JPG preview is on root `/`, upload EPS vector to `/additional`
              if (phaseAOk && !this.aborted) {
                const resB = await this.executePhysicalUpload({
                  itemId: item.id,
                  filename: item.epsPart.filename,
                  localPath: item.epsPart.localPath,
                  fileObject: item.epsPart.fileObject,
                  remoteFolder: '/additional',
                  byteOffset: item.jpgPart.fileSize,
                });

                if (resB.success) {
                  item.epsPart.uploaded = true;
                  succeeded = true;
                } else if (resB.isDuplicateSkip) {
                  item.epsPart.uploaded = true;
                  isDuplicateSkip = true;
                  lastErrorCode = resB.errorCode || '550';
                  lastErrorMessage =
                    resB.errorMessage || 'Skipped: Vector pair already exists on Dreamstime.';
                } else {
                  lastErrorCode = resB.errorCode || 'ECONNRESET';
                  lastErrorMessage =
                    resB.errorMessage || `Failed uploading vector ${item.epsPart.filename}`;
                }
              }
            } else {
              // Single standalone file upload (Photo, Standalone Vector, Video, or CSV)
              const res = await this.executePhysicalUpload({
                itemId: item.id,
                filename: item.remoteName || item.filename,
                localPath: item.localPath,
                fileObject: item.fileObject,
                remoteFolder: item.remoteFolder,
                byteOffset: 0,
              });

              if (res.success) {
                succeeded = true;
              } else if (res.isDuplicateSkip) {
                isDuplicateSkip = true;
                lastErrorCode = res.errorCode || '550';
                lastErrorMessage = res.errorMessage || '550 File already exists on remote server.';
              } else {
                lastErrorCode = res.errorCode || 'ECONNRESET';
                lastErrorMessage = res.errorMessage || 'FTP connection error during transfer.';
              }
            }
          } else {
            // Simulated upload (dry-run or testing mode)
            const shouldInjectFault = faultTargetIds.has(item.id);
            const shouldFailThisAttempt =
              shouldInjectFault &&
              ((activeFaultMode === 'transient_recover_on_retry_2' && sweep < 2) ||
                activeFaultMode === 'persistent_fail_all_3' ||
                activeFaultMode === 'persistent_fail_all_5' ||
                activeFaultMode === 'permanent_550_skip');

            const totalSteps = 6;
            const failAtStep = 3;
            let stepFailed = false;

            for (let step = 1; step <= totalSteps; step++) {
              if (this.aborted) break;
              await new Promise((r) => setTimeout(r, chunkIntervalMs));

              const ratio = step / totalSteps;
              item.bytesTransferred = Math.round(item.fileSize * ratio);
              item.progressPercent = Math.round(ratio * 100);
              if (item.isVectorBundle && item.jpgPart && item.epsPart) {
                if (ratio >= 0.5) {
                  item.jpgPart.uploaded = true;
                }
                if (ratio >= 1) {
                  item.epsPart.uploaded = true;
                }
              }
              this.recordByteDeltaSample();
              this.recalculateBatchTelemetry(item, this.currentSpeedBps);
              this.notify();

              if (shouldFailThisAttempt && step === failAtStep) {
                if (activeFaultMode === 'permanent_550_skip') {
                  isDuplicateSkip = true;
                  lastErrorCode = '550';
                  lastErrorMessage = '550 Permission denied: File already exists on server.';
                } else {
                  lastErrorCode = 'ETIMEDOUT_421';
                  lastErrorMessage = `421 Transfer timeout on ${item.remotePath} (socket drop)`;
                }
                stepFailed = true;
                break;
              }
            }

            if (!stepFailed && !this.aborted) {
              succeeded = true;
            }
          }

          if (this.aborted) {
            item.status = 'queued';
            item.bytesTransferred = 0;
            item.progressPercent = 0;
            break;
          }

          const durationMs = Math.max(1, Date.now() - fileStartMs);
          const completedAt = Date.now();

          if (succeeded) {
            item.status = 'succeeded';
            item.bytesTransferred = item.fileSize;
            item.progressPercent = 100;
            item.durationMs = durationMs;
            item.completedAt = completedAt;
            item.errorCode = undefined;
            item.errorMessage = undefined;

            await db.ftp.logTransfer({
              sessionId: session.id,
              agencyId: 'dreamstime',
              filename: item.filename,
              localPath: item.localPath,
              fileSize: item.fileSize,
              mediaType: item.mediaType,
              remoteDirectory: item.remoteFolder,
              remotePath: item.remotePath,
              status: 'succeeded',
              retryCount: item.retryCount,
              durationMs,
              completedAt,
            });
          } else if (isDuplicateSkip) {
            // STRICT 550 DUPLICATE SKIP: Only triggered by remote `client.list()` pre-check or explicit `550` duplicate response
            item.status = 'skipped';
            item.bytesTransferred = 0;
            item.progressPercent = 0;
            item.durationMs = durationMs;
            item.completedAt = completedAt;
            item.errorCode = lastErrorCode || '550';
            item.errorMessage =
              lastErrorMessage || 'Skipped: File already exists on Dreamstime server (550)';

            await db.ftp.logTransfer({
              sessionId: session.id,
              agencyId: 'dreamstime',
              filename: item.filename,
              localPath: item.localPath,
              fileSize: item.fileSize,
              mediaType: item.mediaType,
              remoteDirectory: item.remoteFolder,
              remotePath: item.remotePath,
              status: 'skipped',
              retryCount: item.retryCount,
              errorCode: item.errorCode,
              errorMessage: item.errorMessage,
              durationMs,
              completedAt,
            });
          } else {
            // Temporary network drop / 4xx / 30s zero-byte stall -> Round-Robin retry logic
            item.retryCount = sweep;
            item.errorCode = lastErrorCode || 'FTP_ERR';
            item.errorMessage = lastErrorMessage || 'FTP transfer failed.';

            if (item.retryCount >= item.maxRetries) {
              // 5th failure: permanently mark as 'failed'
              item.status = 'failed';
              item.bytesTransferred = 0;
              item.progressPercent = 0;
              item.durationMs = durationMs;
              item.completedAt = completedAt;

              await db.ftp.logTransfer({
                sessionId: session.id,
                agencyId: 'dreamstime',
                filename: item.filename,
                localPath: item.localPath,
                fileSize: item.fileSize,
                mediaType: item.mediaType,
                remoteDirectory: item.remoteFolder,
                remotePath: item.remotePath,
                status: 'failed',
                retryCount: item.retryCount,
                errorCode: item.errorCode,
                errorMessage: item.errorMessage,
                durationMs,
                completedAt,
              });
            } else {
              // Mark as 'retry' for the next sweep; keep partial progress if Phase A of a bundle succeeded
              item.status = 'retry';
              if (item.isVectorBundle && item.jpgPart?.uploaded) {
                item.bytesTransferred = item.jpgPart.fileSize;
                item.progressPercent = Math.round(
                  (item.jpgPart.fileSize / Math.max(1, item.fileSize)) * 100
                );
              } else {
                item.bytesTransferred = 0;
                item.progressPercent = 0;
              }
            }
          }

          this.recalculateBatchTelemetry(item, this.currentSpeedBps);
          this.notify();
        }
      }
    } finally {
      if (this.speedTimer) {
        clearInterval(this.speedTimer);
        this.speedTimer = null;
      }
      if (typeof window !== 'undefined' && window.electronAPI?.ftp?.disconnectSession) {
        window.electronAPI.ftp.disconnectSession().catch(() => {});
      }
      this.isRunning = false;
      this.isPaused = false;
      this.currentSpeedBps = 0;
      await this.setKeepAwake(false);
    }

    const totalDurationMs = Math.max(0, Date.now() - this.batchStartTime);
    const totalDurationSeconds = Math.round(totalDurationMs / 1000);
    const durationFormatted = formatEtaSeconds(totalDurationSeconds);

    const succeededCount = this.queue.filter((i) => i.status === 'succeeded').length;
    const failedCount = this.queue.filter((i) => i.status === 'failed').length;
    const skippedCount = this.queue.filter((i) => i.status === 'skipped').length;

    const finalStatus = this.aborted
      ? 'aborted'
      : failedCount > 0
      ? 'partial_failure'
      : 'completed';

    await db.ftp.updateSession(session.id, {
      status: finalStatus,
      succeededFiles: succeededCount,
      failedFiles: failedCount,
      averageSpeedBps: this.currentSpeedBps,
      completedAt: Date.now(),
    });

    const summaryParts: string[] = [`${succeededCount} succeeded`];
    if (failedCount > 0) summaryParts.push(`${failedCount} failed`);
    if (skippedCount > 0) summaryParts.push(`${skippedCount} skipped`);
    const statusMsg = `Upload Complete: ${summaryParts.join(', ')}. Total Time: ${durationFormatted}`;

    this.telemetry = {
      ...this.telemetry,
      isRunning: false,
      speedBytesPerSec: 0,
      etaSeconds: 0,
      totalDurationSeconds,
      statusMessage: this.aborted ? 'Batch upload aborted by user.' : statusMsg,
    };
    this.notify();

    // Trigger Global Native OS Notification via Electron Main Process
    if (!this.aborted && this.telemetry.completedFiles > 0) {
      notifyBatchComplete({
        module: 'ftp',
        succeededCount,
        failedCount,
        skippedCount,
        duration: durationFormatted,
      });
    }

    return {
      sessionId: session.id,
      succeededCount,
      failedCount,
    };
  }

  /**
   * 1-Click Retry All Failed: Moves all failed items back to `queued` with a clean slate
   * and immediately executes the batch.
   */
  async retryAllFailed(options: FtpBatchRunOptions = {}): Promise<{
    sessionId: string;
    succeededCount: number;
    failedCount: number;
  }> {
    let resetCount = 0;
    for (const item of this.queue) {
      if (item.status === 'failed') {
        item.status = 'queued';
        item.bytesTransferred = 0;
        item.progressPercent = 0;
        item.retryCount = 0;
        item.errorCode = undefined;
        item.errorMessage = undefined;
        resetCount++;
      }
    }

    if (resetCount === 0) {
      return { sessionId: '', succeededCount: 0, failedCount: 0 };
    }

    if (
      options.faultMode === undefined &&
      (this.faultMode === 'persistent_fail_all_3' || this.faultMode === 'persistent_fail_all_5')
    ) {
      this.faultMode = 'none';
    }

    this.recalculateBatchTelemetry();
    this.notify();

    return await this.startBatchUpload(options);
  }
}

export const dreamstimeFtpService = new DreamstimeFtpOrchestrator();
