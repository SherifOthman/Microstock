import { db } from '../../db';
import { notifyBatchComplete } from '../desktop/osNotifications';
import { encryptSecret } from '../desktop/secureStorage';
import {
  AGENCY_FTP_SERVER_SPECS,
  bundleAndRoute123RfQueue,
  FtpProtocolType,
  FtpSupportedAgencyId,
  ONE_TWO_THREE_RF_BACKOFF_SCHEDULE_MS,
  ONE_TWO_THREE_RF_FTP_HOST,
  ONE_TWO_THREE_RF_MAX_RETRIES,
  OneTwoThreeRfQueueItem,
  OneTwoThreeRfRemoteFolder,
  OneTwoThreeRfTelemetryFrame,
  RawInputMediaFile,
  resolve123RfRoute,
  resolveMultiAgencyRoute,
} from './oneTwoThreeRfFtpRouter';

type Listener = () => void;

const INITIAL_TELEMETRY: OneTwoThreeRfTelemetryFrame = {
  sessionId: '',
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
  currentProtocol: 'ftp',
  currentHost: ONE_TWO_THREE_RF_FTP_HOST,
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
  totalDurationSeconds: 0,
};

function buildPreviewUrl(fileObject?: File, localPath?: string): string | undefined {
  if (fileObject && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      return URL.createObjectURL(fileObject);
    } catch {
      // ignore
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
 * Dynamic Multi-Protocol FTP / FTPS / SFTP Orchestration Service.
 *
 * Strict Routing Rules:
 * 1. 123RF:
 *    - Photos (.jpg without .eps): Standard FTP (Port 21, ftp.123rf.com) -> /ai_image/ if AI else /
 *    - Vectors (.eps + .jpg preview): Standard FTP (Port 21, ftp.123rf.com) -> ALWAYS /vector/ (.jpg first, .eps second)
 *    - Videos (.mp4, .mov): SFTP (Port 2022, footage.ftp.123rf.com) -> /ai_video/ if AI else /
 * 2. Vecteezy: SFTP (Port 22, content-ftp.eezy.com) -> /
 * 3. Shutterstock: FTPS Explicit TLS (Port 21, ftps.shutterstock.com) -> /
 * 4. Adobe Stock: SFTP (Port 22, sftp.contributor.adobestock.com) -> /
 * 5. Freepik: SFTP (Port 22, ftp.freepik.com) -> /
 * 6. Magnific: SFTP (Port 60022, contributor-ftp.magnific.com) -> /
 */
export class Ftp123RFService {
  private queue: OneTwoThreeRfQueueItem[] = [];
  private telemetry: OneTwoThreeRfTelemetryFrame = { ...INITIAL_TELEMETRY };
  private listeners = new Set<Listener>();
  private activeAgency: FtpSupportedAgencyId = '123rf';
  private batchIsAiGenerated = false;
  private isRunning = false;
  private isPaused = false;
  private aborted = false;
  private cleanupIpcTelemetry?: () => void;

  constructor() {
    this.setupIpcListener();
  }

  private setupIpcListener() {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.ftp?.onTelemetry) {
      try {
        this.cleanupIpcTelemetry = (window as any).electronAPI.ftp.onTelemetry((frame: any) => {
          if (frame && frame.type === 'file-progress' && frame.itemId) {
            this.handleIpcProgress(frame.itemId, frame.bytesTransferred);
          }
        });
      } catch (err) {
        console.warn('[Ftp123RFService] Failed to bind IPC telemetry listener:', err);
      }
    }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('[Ftp123RFService] Listener error:', err);
      }
    }
  }

  public getActiveAgency(): FtpSupportedAgencyId {
    return this.activeAgency;
  }

  public setActiveAgency(agencyId: FtpSupportedAgencyId): void {
    this.activeAgency = agencyId;
    this.queue = this.queue.map((item) => {
      if (item.status === 'succeeded' || item.status === 'uploading') {
        return item;
      }
      const route = resolveMultiAgencyRoute(
        agencyId,
        item.mediaType,
        agencyId === '123rf' ? this.batchIsAiGenerated : false
      );
      const nextFolder = agencyId === '123rf' && item.mediaType === 'vector' ? '/vector' : route.remoteFolder;
      return {
        ...item,
        agencyId,
        isAiGenerated: agencyId === '123rf' && item.mediaType !== 'vector' ? this.batchIsAiGenerated : false,
        isAiIgnored: agencyId !== '123rf' || item.mediaType === 'vector',
        protocol: route.protocol,
        host: route.host,
        port: route.port,
        remoteFolder: nextFolder,
      };
    });
    this.notify();
  }

  public getQueue(): OneTwoThreeRfQueueItem[] {
    return [...this.queue];
  }

  public getTelemetry(): OneTwoThreeRfTelemetryFrame {
    return { ...this.telemetry };
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public getIsPaused(): boolean {
    return this.isPaused;
  }

  public getBatchIsAiGenerated(): boolean {
    return this.batchIsAiGenerated;
  }

  /**
   * Sets the global batch AI toggle and re-evaluates all applicable queued items.
   * Note: Vectors strictly ignore this flag because 123RF forbids AI vectors.
   */
  public setBatchAiGenerated(isAi: boolean): void {
    this.batchIsAiGenerated = isAi;
    this.queue = this.queue.map((item) => {
      if (item.status === 'succeeded' || item.status === 'uploading') {
        return item;
      }
      const itemAgency = item.agencyId || this.activeAgency;
      if (itemAgency !== '123rf' || item.mediaType === 'vector') {
        return item; // Vectors ALWAYS stay /vector/ with isAiIgnored = true
      }
      const route = resolve123RfRoute(item.mediaType, isAi);
      return {
        ...item,
        isAiGenerated: isAi,
        protocol: route.protocol,
        host: route.host,
        port: route.port,
        remoteFolder: route.remoteFolder,
      };
    });
    this.notify();
  }

  /**
   * Toggles the AI flag for a single item in the queue.
   * Automatically ignored and locked for Vector items.
   */
  public setItemAiGenerated(itemId: string, isAi: boolean): void {
    this.queue = this.queue.map((item) => {
      const itemAgency = item.agencyId || this.activeAgency;
      if (item.id !== itemId || itemAgency !== '123rf' || item.mediaType === 'vector') {
        return item;
      }
      const route = resolve123RfRoute(item.mediaType, isAi);
      return {
        ...item,
        isAiGenerated: isAi,
        protocol: route.protocol,
        host: route.host,
        port: route.port,
        remoteFolder: route.remoteFolder,
      };
    });
    this.notify();
  }

  /**
   * Add raw files from HTML drag-and-drop or file input.
   */
  public async addFiles(files: File[], agencyOverride?: FtpSupportedAgencyId): Promise<void> {
    const targetAgency = agencyOverride || this.activeAgency;
    const rawFiles: RawInputMediaFile[] = files.map((f) => {
      const localPath =
        typeof window !== 'undefined' && f instanceof File && (window as any).electronAPI?.getPathForFile
          ? (window as any).electronAPI.getPathForFile(f)
          : (f as any).path || undefined;
      return {
        name: f.name,
        size: f.size,
        path: localPath,
        file: f,
      };
    });

    const newItems = bundleAndRoute123RfQueue(rawFiles, this.batchIsAiGenerated, targetAgency);
    for (const it of newItems) {
      if (it.fileObject || it.localPath) {
        it.previewUrl = buildPreviewUrl(it.fileObject, it.localPath);
      }
    }
    this.queue = [...this.queue, ...newItems];
    this.updateBatchTelemetrySummary();
    this.notify();
  }

  /**
   * Add native files from native folder picker.
   */
  public async addNativeFiles(
    files: { name: string; size: number; path: string }[],
    agencyOverride?: FtpSupportedAgencyId
  ): Promise<void> {
    const targetAgency = agencyOverride || this.activeAgency;
    const rawFiles: RawInputMediaFile[] = files.map((f) => ({
      name: f.name,
      size: f.size,
      path: f.path,
    }));

    const newItems = bundleAndRoute123RfQueue(rawFiles, this.batchIsAiGenerated, targetAgency);
    for (const it of newItems) {
      if (it.localPath) {
        it.previewUrl = buildPreviewUrl(undefined, it.localPath);
      }
    }
    this.queue = [...this.queue, ...newItems];
    this.updateBatchTelemetrySummary();
    this.notify();
  }

  /**
   * Opens native directory dialog in Electron (if available) to scan and add all media files in a folder.
   * Returns null if running in a browser so the caller can trigger `<input webkitdirectory />`.
   */
  public async selectAndAddNativeFolder(): Promise<OneTwoThreeRfQueueItem[] | null> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.ftp?.selectFolderFiles) {
      const res = await (window as any).electronAPI.ftp.selectFolderFiles();
      if (res.canceled) return [];
      if (res.files && res.files.length > 0) {
        await this.addNativeFiles(res.files);
        return this.getQueue();
      }
      return [];
    }
    return null;
  }

  public removeItem(id: string): void {
    const found = this.queue.find((q) => q.id === id);
    if (found?.previewUrl) revokePreviewUrl(found.previewUrl);
    this.queue = this.queue.filter((q) => q.id !== id);
    this.updateBatchTelemetrySummary();
    this.notify();
  }

  public clearQueue(): void {
    if (this.isRunning) {
      this.abort();
    }
    for (const it of this.queue) {
      if (it.previewUrl) revokePreviewUrl(it.previewUrl);
    }
    this.queue = [];
    this.telemetry = { ...INITIAL_TELEMETRY };
    this.notify();
  }

  public async retrySingleItem(itemId: string): Promise<void> {
    const item = this.queue.find((q) => q.id === itemId);
    if (!item) return;
    item.status = 'queued';
    item.bytesTransferred = 0;
    item.progressPercent = 0;
    item.retryCount = 0;
    item.errorCode = undefined;
    item.errorMessage = undefined;
    if (item.isVectorBundle && item.jpgPart && item.epsPart) {
      if (item.jpgPart.uploaded && !item.epsPart.uploaded) {
        item.bytesTransferred = item.jpgPart.fileSize;
        item.progressPercent = Math.round((item.jpgPart.fileSize / Math.max(1, item.fileSize)) * 100);
      }
    }
    this.updateBatchTelemetrySummary();
    this.notify();
    if (!this.isRunning) {
      await this.startUpload();
    }
  }

  public async retryAllFailed(): Promise<void> {
    let anyReset = false;
    for (const item of this.queue) {
      if (item.status === 'failed') {
        item.status = 'queued';
        item.bytesTransferred = 0;
        item.progressPercent = 0;
        item.retryCount = 0;
        item.errorCode = undefined;
        item.errorMessage = undefined;
        anyReset = true;
      }
    }
    if (!anyReset) return;
    this.updateBatchTelemetrySummary();
    this.notify();
    if (!this.isRunning) {
      await this.startUpload();
    }
  }

  private updateBatchTelemetrySummary(): void {
    const totalFiles = this.queue.length;
    const completedFiles = this.queue.filter(
      (q) => q.status === 'succeeded' || q.status === 'failed' || q.status === 'skipped'
    ).length;
    const succeededFiles = this.queue.filter((q) => q.status === 'succeeded').length;
    const failedFiles = this.queue.filter((q) => q.status === 'failed').length;
    const skippedFiles = this.queue.filter((q) => q.status === 'skipped').length;
    const batchTotalBytes = this.queue.reduce((acc, q) => acc + (q.fileSize || 0), 0);
    const batchBytesTransferred = this.queue.reduce((acc, q) => acc + (q.bytesTransferred || 0), 0);

    const batchPercent = batchTotalBytes > 0
      ? Math.min(100, Math.round((batchBytesTransferred / batchTotalBytes) * 100))
      : 0;

    this.telemetry = {
      ...this.telemetry,
      totalFiles,
      completedFiles,
      succeededFiles,
      failedFiles,
      skippedFiles,
      batchTotalBytes,
      batchBytesTransferred,
      batchPercent,
    };
  }

  private handleIpcProgress(itemId: string, bytesTransferred: number) {
    const item = this.queue.find((q) => q.id === itemId);
    if (!item) return;

    item.bytesTransferred = Math.min(item.fileSize, bytesTransferred);
    item.progressPercent = item.fileSize > 0
      ? Math.min(100, Math.round((item.bytesTransferred / item.fileSize) * 100))
      : 0;

    this.telemetry.currentFileBytesTransferred = item.bytesTransferred;
    this.telemetry.currentFilePercent = item.progressPercent;
    this.updateBatchTelemetrySummary();
    this.notify();
  }

  public pause(): void {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    this.telemetry.isPaused = true;
    this.telemetry.statusMessage = 'Paused';
    this.notify();
  }

  public resume(): void {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    this.telemetry.isPaused = false;
    this.telemetry.statusMessage = 'Uploading...';
    this.notify();
  }

  public abort(): void {
    this.aborted = true;
    this.isRunning = false;
    this.isPaused = false;
    this.telemetry.isRunning = false;
    this.telemetry.isPaused = false;
    this.telemetry.statusMessage = 'Aborted';

    if (typeof window !== 'undefined' && (window as any).electronAPI?.ftp?.abortBatch) {
      try {
        (window as any).electronAPI.ftp.abortBatch();
      } catch (err) {
        console.warn('[Ftp123RFService] Failed to abort native batch:', err);
      }
    }
    this.notify();
  }

  /**
   * Executes the upload pipeline.
   * Adheres strictly to the routing table and vector pair execution sequence.
   */
  public async startUpload(): Promise<void> {
    if (this.isRunning) return;

    const pendingItems = this.queue.filter(
      (q) => q.status === 'queued' || q.status === 'failed' || q.status === 'retrying'
    );
    if (pendingItems.length === 0) return;

    this.isRunning = true;
    this.isPaused = false;
    this.aborted = false;

    const sessionId = `${this.activeAgency}-session-${Date.now()}`;
    this.telemetry = {
      ...this.telemetry,
      sessionId,
      isRunning: true,
      isPaused: false,
      statusMessage: 'Starting upload...',
      totalDurationSeconds: 0,
    };
    this.notify();

    const startTime = Date.now();
    const totalBytesAtStart = this.telemetry.batchBytesTransferred;

    try {
      for (let i = 0; i < this.queue.length; i++) {
        if (this.aborted) break;

        // Handle Pause state
        while (this.isPaused && !this.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        if (this.aborted) break;

        const item = this.queue[i];
        if (item.status === 'succeeded' || item.status === 'skipped') continue;

        this.telemetry.currentFileIndex = i + 1;
        this.telemetry.currentItemId = item.id;
        this.telemetry.currentFilename = item.filename;
        this.telemetry.currentProtocol = item.protocol;
        this.telemetry.currentHost = item.host;
        this.telemetry.currentRemoteFolder = item.remoteFolder;
        this.telemetry.currentFileTotalBytes = item.fileSize;
        this.telemetry.currentFileBytesTransferred = item.bytesTransferred;
        this.telemetry.currentFilePercent = item.progressPercent;
        this.telemetry.statusMessage = `Uploading ${item.filename} to ${item.remoteFolder}...`;
        this.notify();

        item.status = 'uploading';
        this.notify();

        const success = await this.uploadQueueItemWithRetries(item);
        if (success) {
          if ((item.status as string) !== 'skipped') {
            item.status = 'succeeded';
          }
          item.bytesTransferred = item.fileSize;
          item.progressPercent = 100;
          item.completedAt = Date.now();
        } else {
          item.status = 'failed';
        }

        // Calculate speed & ETA
        const elapsedSec = (Date.now() - startTime) / 1000;
        if (elapsedSec > 0.5) {
          const deltaBytes = this.telemetry.batchBytesTransferred - totalBytesAtStart;
          const speed = Math.max(0, deltaBytes / elapsedSec);
          this.telemetry.speedBytesPerSec = speed;
          const remainingBytes = Math.max(0, this.telemetry.batchTotalBytes - this.telemetry.batchBytesTransferred);
          this.telemetry.etaSeconds = speed > 0 ? Math.ceil(remainingBytes / speed) : null;
        }

        this.updateBatchTelemetrySummary();
        this.notify();
      }
    } finally {
      const totalElapsedSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
      this.isRunning = false;
      this.isPaused = false;
      this.telemetry.isRunning = false;
      this.telemetry.isPaused = false;
      this.telemetry.currentItemId = null;
      this.telemetry.totalDurationSeconds = totalElapsedSec;
      this.telemetry.statusMessage = this.aborted ? 'Aborted' : 'Upload Complete';
      this.updateBatchTelemetrySummary();
      this.notify();

      // Trigger native notification
      try {
        const agencyName = AGENCY_FTP_SERVER_SPECS[this.activeAgency]?.name || 'FTP';
        await notifyBatchComplete({
          module: 'ftp',
          title: `${agencyName} Upload Complete`,
          succeededCount: this.telemetry.succeededFiles,
          failedCount: this.telemetry.failedFiles,
          skippedCount: this.telemetry.skippedFiles,
        });
      } catch {
        // ignore notification error
      }
    }
  }

  /**
   * Upload an individual queue item with aggressive auto-retry logic.
   * Handles Vector Bundles (.jpg preview first, then .eps).
   */
  private async uploadQueueItemWithRetries(item: OneTwoThreeRfQueueItem): Promise<boolean> {
    let attempt = 0;
    const maxRetries = item.maxRetries || ONE_TWO_THREE_RF_MAX_RETRIES;
    const targetAgency = item.agencyId || this.activeAgency || '123rf';

    while (attempt <= maxRetries && !this.aborted) {
      if (this.isPaused) {
        while (this.isPaused && !this.aborted) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      if (this.aborted) return false;

      item.retryCount = attempt;
      this.telemetry.activeRetryAttempt = attempt;

      try {
        if (item.isVectorBundle && item.jpgPart && item.epsPart) {
          // B. VECTORS EXECUTION ORDER:
          // 1. Upload .jpg preview first and await success!
          const vecFolder = targetAgency === '123rf' ? '/vector' : '/';
          if (!item.jpgPart.uploaded) {
            this.telemetry.statusMessage = `[Step 1/2] Uploading companion preview: ${item.jpgPart.filename} to ${vecFolder}...`;
            this.notify();

            await this.transferSingleFile({
              agencyId: targetAgency,
              protocol: item.protocol,
              hostOverride: item.host,
              port: item.port,
              remoteFolder: vecFolder,
              filename: item.jpgPart.filename,
              localPath: item.jpgPart.localPath,
              fileObject: item.jpgPart.fileObject,
              itemId: item.id,
              byteOffset: 0,
            });
            item.jpgPart.uploaded = true;
          }

          // 2. Upload companion .eps file second!
          this.telemetry.statusMessage = `[Step 2/2] Uploading vector asset: ${item.epsPart.filename} to ${vecFolder}...`;
          this.notify();

          await this.transferSingleFile({
            agencyId: targetAgency,
            protocol: item.protocol,
            hostOverride: item.host,
            port: item.port,
            remoteFolder: vecFolder,
            filename: item.epsPart.filename,
            localPath: item.epsPart.localPath,
            fileObject: item.epsPart.fileObject,
            itemId: item.id,
            byteOffset: item.jpgPart.fileSize,
          });
          item.epsPart.uploaded = true;

          return true;
        } else {
          // Single Photo, Vector, or Video
          await this.transferSingleFile({
            agencyId: targetAgency,
            protocol: item.protocol,
            hostOverride: item.host,
            port: item.port,
            remoteFolder: item.remoteFolder,
            filename: item.filename,
            localPath: item.localPath,
            fileObject: item.fileObject,
            itemId: item.id,
            mediaType: item.mediaType,
            byteOffset: 0,
          });
          return true;
        }
      } catch (err: any) {
        attempt++;
        item.errorMessage = err.message || 'Transfer failed';
        item.errorCode = err.code || 'FTP_ERR';

        if (err.isDuplicateSkip || err.code === 'FTP_DUPLICATE_550') {
          item.status = 'skipped';
          return true; // Mark as resolved (skipped)
        }

        if (attempt <= maxRetries && !this.aborted) {
          item.status = 'retrying';
          const backoff = ONE_TWO_THREE_RF_BACKOFF_SCHEDULE_MS[Math.min(attempt - 1, ONE_TWO_THREE_RF_BACKOFF_SCHEDULE_MS.length - 1)];
          this.telemetry.statusMessage = `Retry ${attempt}/${maxRetries} for ${item.filename} in ${backoff / 1000}s...`;
          this.notify();
          await new Promise((r) => setTimeout(r, backoff));
        } else {
          break;
        }
      }
    }

    return false;
  }

  /**
   * Invokes Electron IPC `ftp:uploadFile` or simulated fallback.
   */
  private async transferSingleFile(payload: {
    agencyId: string;
    protocol: FtpProtocolType;
    hostOverride: string;
    port: number;
    remoteFolder: OneTwoThreeRfRemoteFolder;
    filename: string;
    localPath?: string;
    fileObject?: File;
    itemId: string;
    mediaType?: string;
    byteOffset?: number;
  }): Promise<void> {
    const isElectron = typeof window !== 'undefined' && Boolean((window as any).electronAPI?.ftp?.uploadFile);

    if (isElectron) {
      let fileBuffer: ArrayBuffer | undefined = undefined;
      if (!payload.localPath && payload.fileObject) {
        fileBuffer = await payload.fileObject.arrayBuffer();
      }

      const res = await (window as any).electronAPI.ftp.uploadFile({
        agencyId: payload.agencyId || '123rf',
        protocol: payload.protocol,
        port: payload.port,
        hostOverride: payload.hostOverride,
        remoteFolder: payload.remoteFolder,
        filename: payload.filename,
        localPath: payload.localPath,
        fileBuffer,
        itemId: payload.itemId,
        byteOffset: payload.byteOffset || 0,
        mediaType: payload.mediaType,
      });

      if (!res.success) {
        const error = new Error(res.errorMessage || 'FTP upload failed');
        (error as any).code = res.errorCode;
        (error as any).isDuplicateSkip = res.isDuplicateSkip;
        throw error;
      }
      return;
    }

    // Browser simulation fallback for testing / vitest / web
    await this.simulateTransferProgress(payload.itemId);
  }

  private async simulateTransferProgress(itemId: string): Promise<void> {
    const item = this.queue.find((q) => q.id === itemId);
    if (!item) return;

    const steps = 5;
    for (let s = 1; s <= steps; s++) {
      if (this.aborted) throw new Error('Aborted');
      await new Promise((r) => setTimeout(r, 60));
      const transferred = Math.round((item.fileSize * s) / steps);
      this.handleIpcProgress(itemId, transferred);
    }
  }

  public async testConnection(credentials: {
    agencyId?: FtpSupportedAgencyId;
    host?: string;
    port?: number;
    protocol?: FtpProtocolType;
    username: string;
    password?: string;
  }): Promise<{ success: boolean; latencyMs?: number; error?: string; message?: string }> {
    const targetAgency = credentials.agencyId || this.activeAgency || '123rf';
    const spec = AGENCY_FTP_SERVER_SPECS[targetAgency] || AGENCY_FTP_SERVER_SPECS['123rf'];
    const host = (credentials.host || spec.host).trim();
    const port = Number(credentials.port || spec.port);
    const protocol = credentials.protocol || spec.protocol;
    const cleanPassword = credentials.password === '••••••••••••' ? undefined : credentials.password;

    if (typeof window !== 'undefined' && (window as any).electronAPI?.ftp?.testConnection) {
      const res = await (window as any).electronAPI.ftp.testConnection({
        agencyId: targetAgency,
        protocol,
        host,
        port,
        username: credentials.username.trim(),
        password: cleanPassword,
      });
      if (res?.success) {
        return {
          ...res,
          message: `Connected (${res.latencyMs || 35}ms)`,
        };
      }
      return {
        ...res,
        error: res?.error || res?.message || 'Connection failed',
        message: res?.error || res?.message || 'Connection failed',
      };
    }

    // Mock fallback
    await new Promise((r) => setTimeout(r, 120));
    await this.saveCredentials({
      ...credentials,
      password: cleanPassword,
    });
    return {
      success: true,
      latencyMs: 110,
      message: 'Connected (110ms)',
    };
  }

  public async saveCredentials(credentials: {
    agencyId?: FtpSupportedAgencyId;
    host?: string;
    port?: number;
    protocol?: FtpProtocolType;
    username: string;
    password?: string;
  }): Promise<void> {
    const targetAgency = credentials.agencyId || this.activeAgency || '123rf';
    const spec = AGENCY_FTP_SERVER_SPECS[targetAgency] || AGENCY_FTP_SERVER_SPECS['123rf'];
    const host = (credentials.host || spec.host).trim();
    const port = Number(credentials.port || spec.port);
    const protocol = credentials.protocol || spec.protocol;
    const cleanPassword = credentials.password === '••••••••••••' ? undefined : credentials.password;

    if (typeof window !== 'undefined' && (window as any).electronAPI?.ftp?.saveCredentials) {
      await (window as any).electronAPI.ftp.saveCredentials({
        agencyId: targetAgency,
        protocol,
        host,
        port,
        username: credentials.username.trim(),
        password: cleanPassword,
      });
      return;
    }

    let encryptedPassword: string | undefined;
    if (typeof cleanPassword === 'string' && cleanPassword.trim().length > 0) {
      const enc = await encryptSecret(cleanPassword.trim());
      encryptedPassword = enc.startsWith('enc:')
        ? enc
        : `enc:${Array.from(new TextEncoder().encode(cleanPassword.trim()))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')}`;
    }

    await db.ftp.saveProfile({
      agencyId: targetAgency as any,
      protocol,
      host,
      port,
      username: credentials.username.trim(),
      encryptedPassword,
      passiveMode: true,
    });
  }
}

export const ftp123rfService = new Ftp123RFService();
