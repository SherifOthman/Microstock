import { db } from '../../db';
import { notifyBatchComplete } from '../desktop/osNotifications';
import {
  bundleAndRoute123RfQueue,
  detect123RfMediaType,
  formatBytes,
  formatEta,
  formatSpeed,
  ONE_TWO_THREE_RF_BACKOFF_SCHEDULE_MS,
  ONE_TWO_THREE_RF_FTP_HOST,
  ONE_TWO_THREE_RF_FTP_PORT,
  ONE_TWO_THREE_RF_MAX_RETRIES,
  ONE_TWO_THREE_RF_SFTP_HOST,
  ONE_TWO_THREE_RF_SFTP_PORT,
  OneTwoThreeRfQueueItem,
  OneTwoThreeRfRemoteFolder,
  OneTwoThreeRfTelemetryFrame,
  RawInputMediaFile,
  resolve123RfRoute,
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
 * 123RF Dynamic Multi-Protocol FTP/SFTP Orchestration Service.
 * 
 * Strict Routing Rules:
 * A. Photos (.jpg without .eps): Standard FTP (Port 21, ftp.123rf.com)
 *    - isAiGenerated === true  -> /ai_image/
 *    - isAiGenerated === false -> / (root)
 * B. Vectors (.eps + .jpg preview): Standard FTP (Port 21, ftp.123rf.com)
 *    - ALWAYS /vector/ (AI toggle is strictly ignored)
 *    - Execution Order: .jpg preview MUST upload first, await success, then companion .eps uploads!
 * C. Videos (.mp4, .mov, etc.): SFTP (Port 2022, footage.ftp.123rf.com)
 *    - isAiGenerated === true  -> /ai_video/
 *    - isAiGenerated === false -> / (root)
 */
export class Ftp123RFService {
  private queue: OneTwoThreeRfQueueItem[] = [];
  private telemetry: OneTwoThreeRfTelemetryFrame = { ...INITIAL_TELEMETRY };
  private listeners = new Set<Listener>();
  private batchIsAiGenerated = false;
  private isRunning = false;
  private isPaused = false;
  private aborted = false;
  private activeUploadPromise: Promise<void> | null = null;
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
      if (item.mediaType === 'vector') {
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
      if (item.id !== itemId || item.mediaType === 'vector') {
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
  public async addFiles(files: File[]): Promise<void> {
    const rawFiles: RawInputMediaFile[] = files.map((f) => ({
      name: f.name,
      size: f.size,
      path: (f as any).path || undefined,
      file: f,
    }));

    const newItems = bundleAndRoute123RfQueue(rawFiles, this.batchIsAiGenerated);
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
  public async addNativeFiles(files: { name: string; size: number; path: string }[]): Promise<void> {
    const rawFiles: RawInputMediaFile[] = files.map((f) => ({
      name: f.name,
      size: f.size,
      path: f.path,
    }));

    const newItems = bundleAndRoute123RfQueue(rawFiles, this.batchIsAiGenerated);
    for (const it of newItems) {
      if (it.localPath) {
        it.previewUrl = buildPreviewUrl(undefined, it.localPath);
      }
    }
    this.queue = [...this.queue, ...newItems];
    this.updateBatchTelemetrySummary();
    this.notify();
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
   * Executes the 123RF upload pipeline.
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

    const sessionId = `123rf-session-${Date.now()}`;
    this.telemetry = {
      ...this.telemetry,
      sessionId,
      isRunning: true,
      isPaused: false,
      statusMessage: 'Starting upload...',
    };
    this.notify();

    const startTime = Date.now();
    let totalBytesAtStart = this.telemetry.batchBytesTransferred;

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
        this.telemetry.statusMessage = `Uploading ${item.filename} to ${item.remoteFolder} via ${item.protocol.toUpperCase()}...`;
        this.notify();

        item.status = 'uploading';
        this.notify();

        const success = await this.uploadQueueItemWithRetries(item);
        if (success) {
          item.status = 'succeeded';
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
      this.isRunning = false;
      this.isPaused = false;
      this.telemetry.isRunning = false;
      this.telemetry.isPaused = false;
      this.telemetry.currentItemId = null;
      this.telemetry.statusMessage = this.aborted ? 'Aborted' : 'Upload Complete';
      this.updateBatchTelemetrySummary();
      this.notify();

      // Trigger native notification
      try {
        await notifyBatchComplete({
          module: 'ftp',
          title: '123RF Upload Complete',
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
          if (!item.jpgPart.uploaded) {
            this.telemetry.statusMessage = `[Step 1/2] Uploading companion preview: ${item.jpgPart.filename} to /vector/...`;
            this.notify();

            await this.transferSingleFile({
              agencyId: '123rf',
              protocol: 'ftp',
              hostOverride: ONE_TWO_THREE_RF_FTP_HOST,
              port: ONE_TWO_THREE_RF_FTP_PORT,
              remoteFolder: '/vector',
              filename: item.jpgPart.filename,
              localPath: item.jpgPart.localPath,
              fileObject: item.jpgPart.fileObject,
              itemId: item.id,
              byteOffset: 0,
            });
            item.jpgPart.uploaded = true;
          }

          // 2. Upload companion .eps file second!
          this.telemetry.statusMessage = `[Step 2/2] Uploading vector asset: ${item.epsPart.filename} to /vector/...`;
          this.notify();

          await this.transferSingleFile({
            agencyId: '123rf',
            protocol: 'ftp',
            hostOverride: ONE_TWO_THREE_RF_FTP_HOST,
            port: ONE_TWO_THREE_RF_FTP_PORT,
            remoteFolder: '/vector',
            filename: item.epsPart.filename,
            localPath: item.epsPart.localPath,
            fileObject: item.epsPart.fileObject,
            itemId: item.id,
            byteOffset: item.jpgPart.fileSize,
          });
          item.epsPart.uploaded = true;

          return true;
        } else {
          // Single Photo or Video
          await this.transferSingleFile({
            agencyId: '123rf',
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
    protocol: 'ftp' | 'sftp';
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
        agencyId: '123rf',
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
    username: string;
    password?: string;
  }): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.ftp?.testConnection) {
      return await (window as any).electronAPI.ftp.testConnection({
        agencyId: '123rf',
        host: ONE_TWO_THREE_RF_FTP_HOST,
        port: ONE_TWO_THREE_RF_FTP_PORT,
        username: credentials.username,
        password: credentials.password,
      });
    }

    // Mock fallback
    await new Promise((r) => setTimeout(r, 500));
    return { success: true, latencyMs: 145 };
  }

  public async saveCredentials(credentials: {
    username: string;
    password?: string;
  }): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.ftp?.saveCredentials) {
      await (window as any).electronAPI.ftp.saveCredentials({
        agencyId: '123rf',
        protocol: 'ftp',
        host: ONE_TWO_THREE_RF_FTP_HOST,
        port: ONE_TWO_THREE_RF_FTP_PORT,
        username: credentials.username,
        password: credentials.password,
      });
    }
  }
}

export const ftp123rfService = new Ftp123RFService();
