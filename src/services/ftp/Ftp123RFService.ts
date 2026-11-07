import { db } from '../../db';
import { notifyBatchComplete } from '../desktop/osNotifications';
import { encryptSecret } from '../desktop/secureStorage';
import {
  FtpAgencyPersistenceModuleId,
  queuePersistenceService,
} from '../persistence/queuePersistenceService';
import { bundleAndSortFtpQueue } from './dreamstimeFtpRouter';
import {
  AGENCY_FTP_SERVER_SPECS,
  bundleAndRoute123RfQueue,
  deriveCompanionJpgPath,
  FtpProtocolType,
  FtpSupportedAgencyId,
  isPairingVectorAgency,
  isStandaloneEpsAgency,
  ONE_TWO_THREE_RF_BACKOFF_SCHEDULE_MS,
  ONE_TWO_THREE_RF_FTP_HOST,
  ONE_TWO_THREE_RF_MAX_RETRIES,
  OneTwoThreeRfQueueItem,
  OneTwoThreeRfRemoteFolder,
  OneTwoThreeRfTelemetryFrame,
  RawInputMediaFile,
  resolve123RfRoute,
} from './oneTwoThreeRfFtpRouter';

type Listener = () => void;

function createInitialTelemetry(agencyId: FtpSupportedAgencyId = '123rf'): OneTwoThreeRfTelemetryFrame {
  const spec = AGENCY_FTP_SERVER_SPECS[agencyId] || AGENCY_FTP_SERVER_SPECS['123rf'];
  return {
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
    currentProtocol: spec.protocol,
    currentHost: spec.host,
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
    batchIsAiGenerated: false,
  };
}

export function getFtpAgencyModuleId(agencyId: FtpSupportedAgencyId): FtpAgencyPersistenceModuleId {
  switch (agencyId) {
    case '123rf':
      return 'ftp_123rf';
    case 'magnific':
      return 'ftp_magnific';
    case 'vecteezy':
      return 'ftp_vecteezy';
    case 'shutterstock':
      return 'ftp_shutterstock';
    case 'adobe':
      return 'ftp_adobe';
    case 'dreamstime':
    default:
      return 'ftp';
  }
}

function isNonRenderableVectorFilename(nameOrPath?: string): boolean {
  if (!nameOrPath) return false;
  return /\.(eps|ai|cdr)$/i.test(nameOrPath.trim());
}

export function buildItemPreviewUrl(item: {
  fileObject?: File;
  localPath?: string;
  previewFileObject?: File;
  previewLocalPath?: string;
  jpgPart?: { fileObject?: File; localPath?: string };
  isCsv?: boolean;
  filename?: string;
}): string | undefined {
  if (item.isCsv || (item.filename && item.filename.toLowerCase().endsWith('.csv'))) {
    return undefined;
  }

  // 1. Prefer explicit companion JPG File object (for Vector Pairs & Standalone EPS with companion JPG)
  const companionFile = item.previewFileObject || item.jpgPart?.fileObject;
  if (
    companionFile &&
    !isNonRenderableVectorFilename(companionFile.name) &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  ) {
    try {
      return URL.createObjectURL(companionFile);
    } catch {
      // ignore
    }
  }

  // 2. Next, check primary fileObject ONLY if it is NOT an .eps / .ai / .cdr binary
  if (
    item.fileObject &&
    !isNonRenderableVectorFilename(item.fileObject.name) &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  ) {
    try {
      return URL.createObjectURL(item.fileObject);
    } catch {
      // ignore
    }
  }

  // 3. Resolve disk path (preferring companion .jpg path or deriving sibling .jpg from .eps path)
  const rawDiskPath = item.previewLocalPath || item.jpgPart?.localPath || item.localPath;
  if (rawDiskPath) {
    const rasterDiskPath = deriveCompanionJpgPath(rawDiskPath) || rawDiskPath;
    if (!isNonRenderableVectorFilename(rasterDiskPath)) {
      return `stockflow://local?path=${encodeURIComponent(rasterDiskPath)}`;
    }
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

interface AgencyQueueState {
  agencyId: FtpSupportedAgencyId;
  moduleId: FtpAgencyPersistenceModuleId;
  queue: OneTwoThreeRfQueueItem[];
  telemetry: OneTwoThreeRfTelemetryFrame;
  batchIsAiGenerated: boolean;
  isRunning: boolean;
  isPaused: boolean;
  aborted: boolean;
  hasRecoverableSession: boolean;
  hydrated: boolean;
}

/**
 * Dynamic Multi-Protocol FTP / FTPS / SFTP Orchestration Service with Per-Agency State Isolation.
 *
 * Strict Routing & Vector Rules:
 * 1. 123RF (`ftp_123rf`):
 *    - Photos (.jpg without .eps): Standard FTP (Port 21, ftp.123rf.com) -> /ai_image/ if AI else /
 *    - Vectors (.eps + .jpg preview): Paired Vector Bundle, Standard FTP (Port 21, ftp.123rf.com) -> ALWAYS /vector/ (.jpg first, .eps second)
 *    - Videos (.mp4, .mov): SFTP (Port 2022, footage.ftp.123rf.com) -> /ai_video/ if AI else /
 * 2. Magnific (`ftp_magnific`): SFTP (Port 60022, contributor-ftp.magnific.com) -> / (Paired Vector Bundle: .jpg first, .eps second)
 * 3. Vecteezy (`ftp_vecteezy`): SFTP (Port 22, content-ftp.eezy.com) -> / (Standalone EPS ONLY; companion .jpg skipped)
 * 4. Shutterstock (`ftp_shutterstock`): FTPS Explicit TLS (Port 21, ftps.shutterstock.com) -> / (Standalone EPS ONLY; companion .jpg skipped)
 * 5. Adobe Stock (`ftp_adobe`): SFTP (Port 22, sftp.contributor.adobestock.com) -> / (Standalone EPS ONLY; companion .jpg skipped)
 */
export class Ftp123RFService {
  private agencyStates = new Map<FtpSupportedAgencyId, AgencyQueueState>();
  private listeners = new Set<Listener>();
  private activeAgency: FtpSupportedAgencyId = '123rf';
  private cleanupIpcTelemetry?: () => void;

  constructor() {
    this.setupIpcListener();
  }

  private getState(agencyId: FtpSupportedAgencyId = this.activeAgency): AgencyQueueState {
    let state = this.agencyStates.get(agencyId);
    if (!state) {
      state = {
        agencyId,
        moduleId: getFtpAgencyModuleId(agencyId),
        queue: [],
        telemetry: createInitialTelemetry(agencyId),
        batchIsAiGenerated: false,
        isRunning: false,
        isPaused: false,
        aborted: false,
        hasRecoverableSession: false,
        hydrated: false,
      };
      this.agencyStates.set(agencyId, state);
    }
    return state;
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

  /**
   * Switches the active agency context without leaking or mutating queues across agencies.
   */
  public setActiveAgency(agencyId: FtpSupportedAgencyId): void {
    this.activeAgency = agencyId;
    const state = this.getState(agencyId);
    if (!state.hydrated && state.queue.length === 0) {
      this.hydrateFromDisk(agencyId).catch(() => {});
    }
    this.notify();
  }

  public getQueue(agencyId: FtpSupportedAgencyId = this.activeAgency): OneTwoThreeRfQueueItem[] {
    return [...this.getState(agencyId).queue];
  }

  public getTelemetry(agencyId: FtpSupportedAgencyId = this.activeAgency): OneTwoThreeRfTelemetryFrame {
    return { ...this.getState(agencyId).telemetry };
  }

  public getIsRunning(agencyId: FtpSupportedAgencyId = this.activeAgency): boolean {
    return this.getState(agencyId).isRunning;
  }

  public getIsPaused(agencyId: FtpSupportedAgencyId = this.activeAgency): boolean {
    return this.getState(agencyId).isPaused;
  }

  public getHasRecoverableSession(agencyId: FtpSupportedAgencyId = this.activeAgency): boolean {
    return this.getState(agencyId).hasRecoverableSession;
  }

  /**
   * Returns the AI-Generated Batch toggle state.
   * Strictly isolated to 123RF; always returns false for other agencies.
   */
  public getBatchIsAiGenerated(agencyId: FtpSupportedAgencyId = this.activeAgency): boolean {
    if (agencyId !== '123rf') return false;
    return this.getState('123rf').batchIsAiGenerated;
  }

  /**
   * Sets the 123RF batch AI toggle and re-evaluates ONLY queued items in `ftp_123rf`.
   * Note: Vectors strictly ignore this flag because 123RF forbids AI vectors.
   */
  public setBatchAiGenerated(isAi: boolean): void {
    const state = this.getState('123rf');
    state.batchIsAiGenerated = Boolean(isAi);
    state.telemetry.batchIsAiGenerated = state.batchIsAiGenerated;
    state.queue = state.queue.map((item) => {
      if (item.status === 'succeeded' || item.status === 'uploading') {
        return item;
      }
      if (item.mediaType === 'vector' || item.isCsv) {
        return item; // Vectors ALWAYS stay /vector/ with isAiIgnored = true
      }
      const route = resolve123RfRoute(item.mediaType, state.batchIsAiGenerated);
      return {
        ...item,
        isAiGenerated: state.batchIsAiGenerated,
        protocol: route.protocol,
        host: route.host,
        port: route.port,
        remoteFolder: route.remoteFolder,
      };
    });
    this.persistQueueState('123rf', true).catch(() => {});
    this.notify();
  }

  /**
   * Toggles the AI flag for a single item in the 123RF queue.
   * Automatically ignored and locked for Vector items and non-123RF agencies.
   */
  public setItemAiGenerated(itemId: string, isAi: boolean): void {
    const state = this.getState('123rf');
    state.queue = state.queue.map((item) => {
      if (item.id !== itemId || item.mediaType === 'vector' || item.isCsv) {
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
    this.persistQueueState('123rf', true).catch(() => {});
    this.notify();
  }

  /**
   * Persists a specific agency's queue & telemetry snapshot into `local_queues.sqlite`
   * under its strictly unique `moduleId` (`ftp_123rf`, `ftp_magnific`, `ftp_vecteezy`, `ftp_shutterstock`, `ftp_adobe`).
   */
  public async persistQueueState(
    agencyId: FtpSupportedAgencyId = this.activeAgency,
    immediate = false
  ): Promise<void> {
    const state = this.getState(agencyId);
    const pendingCount = state.queue.filter(
      (i) => i.status === 'queued' || i.status === 'uploading' || i.status === 'retrying'
    ).length;

    const batchStatus = state.isRunning
      ? state.isPaused
        ? 'paused'
        : 'running'
      : state.hasRecoverableSession && pendingCount > 0
      ? 'paused'
      : state.queue.length > 0 && pendingCount === 0
      ? 'completed'
      : 'idle';

    await queuePersistenceService.saveModuleQueueSnapshot(
      {
        moduleId: state.moduleId,
        sessionId: state.telemetry.sessionId || undefined,
        batchStatus,
        agencyId,
        queue: state.queue,
        telemetry: {
          ...state.telemetry,
          batchIsAiGenerated: agencyId === '123rf' ? state.batchIsAiGenerated : false,
        },
      },
      immediate
    );
  }

  /**
   * Hydrates a specific agency's queue from `local_queues.sqlite` using its dedicated `moduleId`.
   */
  public async hydrateFromDisk(
    agencyId: FtpSupportedAgencyId = this.activeAgency
  ): Promise<{
    restored: boolean;
    wasInterrupted: boolean;
    recoverablePendingCount: number;
  }> {
    const state = this.getState(agencyId);
    if (state.isRunning) {
      return {
        restored: false,
        wasInterrupted: false,
        recoverablePendingCount: 0,
      };
    }

    state.hydrated = true;
    const hydrated = await queuePersistenceService.hydrateModuleQueueSnapshot<
      OneTwoThreeRfQueueItem,
      OneTwoThreeRfTelemetryFrame
    >(state.moduleId);

    if (!hydrated || hydrated.queue.length === 0) {
      state.hasRecoverableSession = false;
      return {
        restored: false,
        wasInterrupted: false,
        recoverablePendingCount: 0,
      };
    }

    // Ensure previewUrl is resolved from companion JPG if available and sort deterministically
    const restoredItems = hydrated.queue.map((item) => {
      const nextPreviewUrl = item.previewUrl && !isNonRenderableVectorFilename(item.previewUrl)
        ? item.previewUrl
        : buildItemPreviewUrl(item);
      return {
        ...item,
        agencyId,
        previewUrl: nextPreviewUrl,
      };
    });

    state.queue = bundleAndSortFtpQueue(restoredItems);
    state.hasRecoverableSession = hydrated.wasInterrupted && hydrated.recoverablePendingCount > 0;
    if (agencyId === '123rf' && typeof hydrated.telemetry?.batchIsAiGenerated === 'boolean') {
      state.batchIsAiGenerated = hydrated.telemetry.batchIsAiGenerated;
    }
    this.updateBatchTelemetrySummary(agencyId);
    this.notify();

    return {
      restored: true,
      wasInterrupted: hydrated.wasInterrupted,
      recoverablePendingCount: hydrated.recoverablePendingCount,
    };
  }

  /**
   * Merges newly ingested items into an agency's existing queue while enforcing:
   * - Standalone EPS agencies (`shutterstock`, `adobe`, `vecteezy`): if a companion `.jpg` was added earlier
   *   and its matching `.eps` is added now (or vice versa), exclude the `.jpg` from the upload queue and
   *   attach its preview to the `.eps` item.
   * - Pairing agencies (`123rf`, `magnific`, `dreamstime`): if a standalone `.jpg` was added earlier and its
   *   matching `.eps` is added now (or vice versa), combine them into a Vector Bundle (`.jpg` order 1, `.eps` order 2).
   * - Deterministic 4-tier sorting (`Photo -> Vector -> Video -> CSV`).
   */
  private mergeItemsIntoAgencyQueue(
    agencyId: FtpSupportedAgencyId,
    existingQueue: OneTwoThreeRfQueueItem[],
    incomingItems: OneTwoThreeRfQueueItem[]
  ): OneTwoThreeRfQueueItem[] {
    const nextQueue = [...existingQueue];
    const shouldPair = isPairingVectorAgency(agencyId);
    const shouldSkipJpgForEps = isStandaloneEpsAgency(agencyId);

    for (const incoming of incomingItems) {
      if (shouldSkipJpgForEps) {
        // Case 1: Incoming is a standalone .eps and an unpaired .jpg with the same stem is already queued
        if (incoming.mediaType === 'vector' && !incoming.isVectorBundle) {
          const existingJpgIdx = nextQueue.findIndex(
            (q) =>
              q.status === 'queued' &&
              q.mediaType === 'image' &&
              !q.isCsv &&
              q.stemName === incoming.stemName
          );
          if (existingJpgIdx !== -1) {
            const existingJpg = nextQueue[existingJpgIdx];
            incoming.previewFileObject =
              incoming.previewFileObject || existingJpg.previewFileObject || existingJpg.fileObject;
            incoming.previewLocalPath =
              incoming.previewLocalPath || existingJpg.previewLocalPath || existingJpg.localPath;
            incoming.previewUrl = incoming.previewUrl || existingJpg.previewUrl || buildItemPreviewUrl(incoming);
            nextQueue.splice(existingJpgIdx, 1);
          }
        }
        // Case 2: Incoming is a standalone .jpg and a .eps with the same stem is already in the queue
        if (incoming.mediaType === 'image' && !incoming.isCsv) {
          const existingEps = nextQueue.find(
            (q) => q.mediaType === 'vector' && q.stemName === incoming.stemName
          );
          if (existingEps) {
            existingEps.previewFileObject =
              existingEps.previewFileObject || incoming.previewFileObject || incoming.fileObject;
            existingEps.previewLocalPath =
              existingEps.previewLocalPath || incoming.previewLocalPath || incoming.localPath;
            existingEps.previewUrl =
              incoming.previewUrl || buildItemPreviewUrl(existingEps) || existingEps.previewUrl;
            // Skip queueing the companion .jpg for upload on standalone EPS agencies!
            continue;
          }
        }
      } else if (shouldPair) {
        // Pairing agency incremental merge: pair a newly dropped .eps with an already-queued standalone .jpg or vice versa
        if (
          !incoming.isVectorBundle &&
          !incoming.isCsv &&
          (incoming.mediaType === 'vector' || incoming.mediaType === 'image')
        ) {
          const targetPartnerType = incoming.mediaType === 'vector' ? 'image' : 'vector';
          const partnerIdx = nextQueue.findIndex(
            (q) =>
              q.status === 'queued' &&
              !q.isVectorBundle &&
              !q.isCsv &&
              q.mediaType === targetPartnerType &&
              q.stemName === incoming.stemName
          );
          if (partnerIdx !== -1) {
            const partner = nextQueue[partnerIdx];
            const jpgSource = incoming.mediaType === 'image' ? incoming : partner;
            const epsSource = incoming.mediaType === 'vector' ? incoming : partner;
            const vecFolder: OneTwoThreeRfRemoteFolder = agencyId === '123rf' ? '/vector' : '/';
            const combinedSize = (jpgSource.fileSize || 0) + (epsSource.fileSize || 0);

            const bundled: OneTwoThreeRfQueueItem = {
              ...epsSource,
              id: `${agencyId}-vec-${incoming.stemName}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              agencyId,
              filename: `${incoming.stemName}.(jpg+eps)`,
              displayName: `${incoming.stemName}.(jpg+eps)`,
              stemName: incoming.stemName,
              mediaType: 'vector',
              isVectorBundle: true,
              isAiGenerated: false,
              isAiIgnored: true,
              remoteFolder: vecFolder,
              fileSize: combinedSize,
              bytesTransferred: 0,
              progressPercent: 0,
              localPath: epsSource.localPath || jpgSource.localPath,
              fileObject: epsSource.fileObject,
              previewLocalPath: jpgSource.previewLocalPath || jpgSource.localPath,
              previewFileObject: jpgSource.previewFileObject || jpgSource.fileObject,
              previewUrl: jpgSource.previewUrl || buildItemPreviewUrl(jpgSource),
              jpgPart: {
                filename: jpgSource.filename,
                localPath: jpgSource.localPath,
                fileSize: jpgSource.fileSize || 0,
                remoteFolder: vecFolder,
                remotePath: vecFolder === '/' ? `/${jpgSource.filename}` : `${vecFolder}/${jpgSource.filename}`,
                fileObject: jpgSource.fileObject,
                uploaded: false,
                order: 1,
              },
              epsPart: {
                filename: epsSource.filename,
                localPath: epsSource.localPath,
                fileSize: epsSource.fileSize || 0,
                remoteFolder: vecFolder,
                remotePath: vecFolder === '/' ? `/${epsSource.filename}` : `${vecFolder}/${epsSource.filename}`,
                fileObject: epsSource.fileObject,
                uploaded: false,
                order: 2,
              },
            };
            nextQueue.splice(partnerIdx, 1, bundled);
            continue;
          }
        }
      }

      nextQueue.push(incoming);
    }

    return bundleAndSortFtpQueue(nextQueue);
  }

  /**
   * Add raw files from HTML drag-and-drop or file input to the target agency's isolated queue.
   */
  public async addFiles(files: File[], agencyOverride?: FtpSupportedAgencyId): Promise<void> {
    const targetAgency = agencyOverride || this.activeAgency;
    const state = this.getState(targetAgency);
    state.hydrated = true;

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

    const isAi = targetAgency === '123rf' ? state.batchIsAiGenerated : false;
    const newItems = bundleAndRoute123RfQueue(rawFiles, isAi, targetAgency);
    for (const it of newItems) {
      it.previewUrl = buildItemPreviewUrl(it);
    }

    state.queue = this.mergeItemsIntoAgencyQueue(targetAgency, state.queue, newItems);
    this.updateBatchTelemetrySummary(targetAgency);
    this.persistQueueState(targetAgency, true).catch(() => {});
    this.notify();
  }

  /**
   * Add native files from native folder picker to the target agency's isolated queue.
   */
  public async addNativeFiles(
    files: { name: string; size: number; path: string }[],
    agencyOverride?: FtpSupportedAgencyId
  ): Promise<void> {
    const targetAgency = agencyOverride || this.activeAgency;
    const state = this.getState(targetAgency);
    state.hydrated = true;

    const rawFiles: RawInputMediaFile[] = files.map((f) => ({
      name: f.name,
      size: f.size,
      path: f.path,
    }));

    const isAi = targetAgency === '123rf' ? state.batchIsAiGenerated : false;
    const newItems = bundleAndRoute123RfQueue(rawFiles, isAi, targetAgency);
    for (const it of newItems) {
      it.previewUrl = buildItemPreviewUrl(it);
    }

    state.queue = this.mergeItemsIntoAgencyQueue(targetAgency, state.queue, newItems);
    this.updateBatchTelemetrySummary(targetAgency);
    this.persistQueueState(targetAgency, true).catch(() => {});
    this.notify();
  }

  /**
   * Opens native directory dialog in Electron (if available) to scan and add all media files in a folder.
   * Returns null if running in a browser so the caller can trigger `<input webkitdirectory />`.
   */
  public async selectAndAddNativeFolder(
    agencyOverride?: FtpSupportedAgencyId
  ): Promise<OneTwoThreeRfQueueItem[] | null> {
    const targetAgency = agencyOverride || this.activeAgency;
    if (typeof window !== 'undefined' && (window as any).electronAPI?.ftp?.selectFolderFiles) {
      const res = await (window as any).electronAPI.ftp.selectFolderFiles();
      if (res.canceled) return [];
      if (res.files && res.files.length > 0) {
        await this.addNativeFiles(res.files, targetAgency);
        return this.getQueue(targetAgency);
      }
      return [];
    }
    return null;
  }

  public removeItem(id: string, agencyOverride?: FtpSupportedAgencyId): void {
    const targetAgency = agencyOverride || this.activeAgency;
    const state = this.getState(targetAgency);
    const found = state.queue.find((q) => q.id === id);
    if (found?.previewUrl) revokePreviewUrl(found.previewUrl);
    state.queue = state.queue.filter((q) => q.id !== id);
    if (state.queue.length === 0) {
      state.hasRecoverableSession = false;
    }
    this.updateBatchTelemetrySummary(targetAgency);
    this.persistQueueState(targetAgency, true).catch(() => {});
    this.notify();
  }

  public clearQueue(agencyOverride?: FtpSupportedAgencyId): void {
    const targetAgency = agencyOverride || this.activeAgency;
    const state = this.getState(targetAgency);
    if (state.isRunning) {
      this.abort(targetAgency);
    }
    for (const it of state.queue) {
      if (it.previewUrl) revokePreviewUrl(it.previewUrl);
    }
    state.queue = [];
    state.hasRecoverableSession = false;
    state.telemetry = {
      ...createInitialTelemetry(targetAgency),
      batchIsAiGenerated: targetAgency === '123rf' ? state.batchIsAiGenerated : false,
    };
    queuePersistenceService.clearModuleQueueSnapshot(state.moduleId).catch(() => {});
    this.notify();
  }

  public async retrySingleItem(itemId: string, agencyOverride?: FtpSupportedAgencyId): Promise<void> {
    const targetAgency = agencyOverride || this.activeAgency;
    const state = this.getState(targetAgency);
    const item = state.queue.find((q) => q.id === itemId);
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
    this.updateBatchTelemetrySummary(targetAgency);
    this.persistQueueState(targetAgency, true).catch(() => {});
    this.notify();
    if (!state.isRunning) {
      await this.startUpload(targetAgency);
    }
  }

  public async retryAllFailed(agencyOverride?: FtpSupportedAgencyId): Promise<void> {
    const targetAgency = agencyOverride || this.activeAgency;
    const state = this.getState(targetAgency);
    let anyReset = false;
    for (const item of state.queue) {
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
    this.updateBatchTelemetrySummary(targetAgency);
    this.persistQueueState(targetAgency, true).catch(() => {});
    this.notify();
    if (!state.isRunning) {
      await this.startUpload(targetAgency);
    }
  }

  private updateBatchTelemetrySummary(agencyId: FtpSupportedAgencyId = this.activeAgency): void {
    const state = this.getState(agencyId);
    const totalFiles = state.queue.length;
    const completedFiles = state.queue.filter(
      (q) => q.status === 'succeeded' || q.status === 'failed' || q.status === 'skipped'
    ).length;
    const succeededFiles = state.queue.filter((q) => q.status === 'succeeded').length;
    const failedFiles = state.queue.filter((q) => q.status === 'failed').length;
    const skippedFiles = state.queue.filter((q) => q.status === 'skipped').length;
    const batchTotalBytes = state.queue.reduce((acc, q) => acc + (q.fileSize || 0), 0);
    const batchBytesTransferred = state.queue.reduce((acc, q) => acc + (q.bytesTransferred || 0), 0);

    const batchPercent =
      batchTotalBytes > 0
        ? Math.min(100, Math.round((batchBytesTransferred / batchTotalBytes) * 100))
        : 0;

    state.telemetry = {
      ...state.telemetry,
      totalFiles,
      completedFiles,
      succeededFiles,
      failedFiles,
      skippedFiles,
      batchTotalBytes,
      batchBytesTransferred,
      batchPercent,
      batchIsAiGenerated: agencyId === '123rf' ? state.batchIsAiGenerated : false,
    };
  }

  private handleIpcProgress(itemId: string, bytesTransferred: number) {
    for (const [agencyId, state] of this.agencyStates.entries()) {
      const item = state.queue.find((q) => q.id === itemId);
      if (!item) continue;

      item.bytesTransferred = Math.min(item.fileSize, bytesTransferred);
      item.progressPercent =
        item.fileSize > 0
          ? Math.min(100, Math.round((item.bytesTransferred / item.fileSize) * 100))
          : 0;

      state.telemetry.currentFileBytesTransferred = item.bytesTransferred;
      state.telemetry.currentFilePercent = item.progressPercent;
      this.updateBatchTelemetrySummary(agencyId);
      this.notify();
      break;
    }
  }

  public pause(agencyOverride?: FtpSupportedAgencyId): void {
    const targetAgency = agencyOverride || this.activeAgency;
    const state = this.getState(targetAgency);
    if (!state.isRunning || state.isPaused) return;
    state.isPaused = true;
    state.telemetry.isPaused = true;
    state.telemetry.statusMessage = 'Paused';
    this.persistQueueState(targetAgency, true).catch(() => {});
    this.notify();
  }

  public resume(agencyOverride?: FtpSupportedAgencyId): void {
    const targetAgency = agencyOverride || this.activeAgency;
    const state = this.getState(targetAgency);
    if (!state.isRunning || !state.isPaused) return;
    state.isPaused = false;
    state.telemetry.isPaused = false;
    state.telemetry.statusMessage = 'Uploading...';
    this.persistQueueState(targetAgency, true).catch(() => {});
    this.notify();
  }

  public abort(agencyOverride?: FtpSupportedAgencyId): void {
    const targetAgency = agencyOverride || this.activeAgency;
    const state = this.getState(targetAgency);
    state.aborted = true;
    state.isRunning = false;
    state.isPaused = false;
    state.telemetry.isRunning = false;
    state.telemetry.isPaused = false;
    state.telemetry.statusMessage = 'Aborted';

    if (typeof window !== 'undefined' && (window as any).electronAPI?.ftp?.abortBatch) {
      try {
        (window as any).electronAPI.ftp.abortBatch();
      } catch (err) {
        console.warn('[Ftp123RFService] Failed to abort native batch:', err);
      }
    }
    this.persistQueueState(targetAgency, true).catch(() => {});
    this.notify();
  }

  /**
   * Executes the upload pipeline for the specified agency.
   * Ensures queue sorting (1. Photos -> 2. Vectors -> 3. Videos -> 4. CSV) and vector execution order.
   */
  public async startUpload(agencyOverride?: FtpSupportedAgencyId): Promise<void> {
    const targetAgency = agencyOverride || this.activeAgency;
    const state = this.getState(targetAgency);
    if (state.isRunning) return;

    state.queue = bundleAndSortFtpQueue(state.queue);

    const pendingItems = state.queue.filter(
      (q) => q.status === 'queued' || q.status === 'failed' || q.status === 'retrying'
    );
    if (pendingItems.length === 0) return;

    state.isRunning = true;
    state.isPaused = false;
    state.aborted = false;
    state.hasRecoverableSession = false;

    const sessionId = `${targetAgency}-session-${Date.now()}`;
    state.telemetry = {
      ...state.telemetry,
      sessionId,
      isRunning: true,
      isPaused: false,
      statusMessage: 'Starting upload...',
      totalDurationSeconds: 0,
    };
    await this.persistQueueState(targetAgency, true);
    this.notify();

    const startTime = Date.now();
    const totalBytesAtStart = state.telemetry.batchBytesTransferred;

    try {
      for (let i = 0; i < state.queue.length; i++) {
        if (state.aborted) break;

        while (state.isPaused && !state.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        if (state.aborted) break;

        const item = state.queue[i];
        if (item.status === 'succeeded' || item.status === 'skipped') continue;

        state.telemetry.currentFileIndex = i + 1;
        state.telemetry.currentItemId = item.id;
        state.telemetry.currentFilename = item.filename;
        state.telemetry.currentProtocol = item.protocol;
        state.telemetry.currentHost = item.host;
        state.telemetry.currentRemoteFolder = item.remoteFolder;
        state.telemetry.currentFileTotalBytes = item.fileSize;
        state.telemetry.currentFileBytesTransferred = item.bytesTransferred;
        state.telemetry.currentFilePercent = item.progressPercent;
        state.telemetry.statusMessage = `Uploading ${item.filename} to ${item.remoteFolder}...`;
        this.notify();

        item.status = 'uploading';
        this.persistQueueState(targetAgency, false).catch(() => {});
        this.notify();

        const success = await this.uploadQueueItemWithRetries(targetAgency, item);
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

        const elapsedSec = (Date.now() - startTime) / 1000;
        if (elapsedSec > 0.5) {
          const deltaBytes = state.telemetry.batchBytesTransferred - totalBytesAtStart;
          const speed = Math.max(0, deltaBytes / elapsedSec);
          state.telemetry.speedBytesPerSec = speed;
          const remainingBytes = Math.max(
            0,
            state.telemetry.batchTotalBytes - state.telemetry.batchBytesTransferred
          );
          state.telemetry.etaSeconds = speed > 0 ? Math.ceil(remainingBytes / speed) : null;
        }

        this.updateBatchTelemetrySummary(targetAgency);
        await this.persistQueueState(targetAgency, true);
        this.notify();
      }
    } finally {
      const totalElapsedSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
      state.isRunning = false;
      state.isPaused = false;
      state.telemetry.isRunning = false;
      state.telemetry.isPaused = false;
      state.telemetry.currentItemId = null;
      state.telemetry.totalDurationSeconds = totalElapsedSec;
      state.telemetry.statusMessage = state.aborted ? 'Aborted' : 'Upload Complete';
      this.updateBatchTelemetrySummary(targetAgency);
      await this.persistQueueState(targetAgency, true);
      this.notify();

      try {
        const agencyName = AGENCY_FTP_SERVER_SPECS[targetAgency]?.name || 'FTP';
        await notifyBatchComplete({
          module: 'ftp',
          title: `${agencyName} Upload Complete`,
          succeededCount: state.telemetry.succeededFiles,
          failedCount: state.telemetry.failedFiles,
          skippedCount: state.telemetry.skippedFiles,
        });
      } catch {
        // ignore notification error
      }
    }
  }

  /**
   * Upload an individual queue item with aggressive auto-retry logic.
   * Handles Vector Bundles (.jpg preview first, then .eps) for pairing agencies,
   * and standalone .eps files for standalone agencies.
   */
  private async uploadQueueItemWithRetries(
    targetAgency: FtpSupportedAgencyId,
    item: OneTwoThreeRfQueueItem
  ): Promise<boolean> {
    const state = this.getState(targetAgency);
    let attempt = 0;
    const maxRetries = item.maxRetries || ONE_TWO_THREE_RF_MAX_RETRIES;

    while (attempt <= maxRetries && !state.aborted) {
      if (state.isPaused) {
        while (state.isPaused && !state.aborted) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      if (state.aborted) return false;

      item.retryCount = attempt;
      state.telemetry.activeRetryAttempt = attempt;

      try {
        if (item.isVectorBundle && item.jpgPart && item.epsPart && isPairingVectorAgency(targetAgency)) {
          // B. VECTORS EXECUTION ORDER (Pairing Agencies: 123RF, Magnific, Dreamstime):
          // 1. Upload .jpg preview first and await success!
          const vecFolder: OneTwoThreeRfRemoteFolder = targetAgency === '123rf' ? '/vector' : '/';
          if (!item.jpgPart.uploaded) {
            state.telemetry.statusMessage = `[Step 1/2] Uploading companion preview: ${item.jpgPart.filename} to ${vecFolder}...`;
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
          state.telemetry.statusMessage = `[Step 2/2] Uploading vector asset: ${item.epsPart.filename} to ${vecFolder}...`;
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
          // Single Photo, Standalone EPS Vector, Video, or CSV
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

        if (attempt <= maxRetries && !state.aborted) {
          item.status = 'retrying';
          const backoff =
            ONE_TWO_THREE_RF_BACKOFF_SCHEDULE_MS[
              Math.min(attempt - 1, ONE_TWO_THREE_RF_BACKOFF_SCHEDULE_MS.length - 1)
            ];
          state.telemetry.statusMessage = `Retry ${attempt}/${maxRetries} for ${item.filename} in ${backoff / 1000}s...`;
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
    agencyId: FtpSupportedAgencyId;
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
    const isElectron =
      typeof window !== 'undefined' && Boolean((window as any).electronAPI?.ftp?.uploadFile);

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
    await this.simulateTransferProgress(payload.agencyId, payload.itemId);
  }

  private async simulateTransferProgress(
    agencyId: FtpSupportedAgencyId,
    itemId: string
  ): Promise<void> {
    const state = this.getState(agencyId);
    const item = state.queue.find((q) => q.id === itemId);
    if (!item) return;

    const steps = 5;
    for (let s = 1; s <= steps; s++) {
      if (state.aborted) throw new Error('Aborted');
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
    const cleanPassword =
      credentials.password === '••••••••••••' ? undefined : credentials.password;

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
        await this.saveCredentials({
          agencyId: targetAgency,
          host,
          port,
          protocol,
          username: credentials.username.trim(),
          password: cleanPassword,
          lastVerifiedAt: res.verifiedAt || Date.now(),
        });
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
      lastVerifiedAt: Date.now(),
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
    lastVerifiedAt?: number;
  }): Promise<void> {
    const targetAgency = credentials.agencyId || this.activeAgency || '123rf';
    const spec = AGENCY_FTP_SERVER_SPECS[targetAgency] || AGENCY_FTP_SERVER_SPECS['123rf'];
    const host = (credentials.host || spec.host).trim();
    const port = Number(credentials.port || spec.port);
    const protocol = credentials.protocol || spec.protocol;
    const cleanPassword =
      credentials.password === '••••••••••••' ? undefined : credentials.password;

    let encryptedPassword: string | undefined;
    if (typeof cleanPassword === 'string' && cleanPassword.trim().length > 0) {
      const enc = await encryptSecret(cleanPassword.trim());
      encryptedPassword = enc.startsWith('enc:')
        ? enc
        : `enc:${Array.from(new TextEncoder().encode(cleanPassword.trim()))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')}`;
    }

    if (typeof window !== 'undefined' && (window as any).electronAPI?.ftp?.saveCredentials) {
      try {
        await (window as any).electronAPI.ftp.saveCredentials({
          agencyId: targetAgency,
          protocol,
          host,
          port,
          username: credentials.username.trim(),
          password: cleanPassword,
          lastVerifiedAt: credentials.lastVerifiedAt,
        });
      } catch (err) {
        console.warn('[Ftp123RFService] Native ftp.saveCredentials warning:', err);
      }
    }

    await db.ftp.saveProfile({
      agencyId: targetAgency,
      protocol,
      host,
      port,
      username: credentials.username.trim(),
      encryptedPassword,
      passiveMode: true,
      lastVerifiedAt: credentials.lastVerifiedAt,
    });
  }
}

export const ftp123rfService = new Ftp123RFService();
