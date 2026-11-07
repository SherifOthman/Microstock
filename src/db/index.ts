import { useState, useEffect, useRef } from 'react';
import {
  AgencyTrackingRecord,
  AiExecutionMode,
  ApiKeyRecord,
  AppSettings,
  BackupLogRecord,
  BatchRecord,
  ExportBasketRecord,
  LocalAiConfig,
  MasterMetadataRecord,
  PlatformLimitConfig,
  ProviderType,
  RejectionReasonRecord,
  SupportedPlatform,
  TrackerAgencyStatus,
  TrackerSummaryStats,
  WorkspacePathsInfo,
} from '../types';
import {
  FtpCredentialProfile,
  FtpSessionRecord,
  FtpTransferLogRecord,
} from '../services/ftp/dreamstimeFtpRouter';
import { PROVIDERS_META } from '../constants/providers';
import { encryptSecret, decryptSecret } from '../services/desktop/secureStorage';

export interface SettingItem {
  key: string;
  value: any;
}

// ============================================================================
// Reactive Change Notification Bus (Scoped & Throttled to prevent IPC storms)
// ============================================================================
export type DbChangeScope = 'all' | 'master' | 'ftp' | 'keys' | 'settings';
type DbChangeListener = (scopes: Set<DbChangeScope>) => void;

const dbListeners = new Set<DbChangeListener>();
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
let lastNotifyTime = 0;
let pendingScopes = new Set<DbChangeScope>();
const THROTTLE_MS = 150;

// In-flight deduplication for heavy full-table getMasterRecords IPC calls
let inFlightMasterRecordsPromise: Promise<MasterMetadataRecord[]> | null = null;
let cachedMasterRecords: MasterMetadataRecord[] | null = null;
let cachedMasterRecordsAt = 0;
const MASTER_CACHE_TTL_MS = 120;

export function invalidateMasterRecordsCache(): void {
  cachedMasterRecords = null;
  cachedMasterRecordsAt = 0;
  inFlightMasterRecordsPromise = null;
}

export function resolveAssetPreviewUrl(rec?: Partial<MasterMetadataRecord> | null): string {
  if (!rec) return '';
  const hasElectronProtocol =
    typeof window !== 'undefined' && Boolean((window as any).electronAPI);
  if (rec.previewUrl && typeof rec.previewUrl === 'string' && rec.previewUrl.trim()) {
    const trimmedPreview = rec.previewUrl.trim();
    if (
      !trimmedPreview.startsWith('stockflow://') ||
      hasElectronProtocol ||
      !rec.thumbnailBase64
    ) {
      return trimmedPreview;
    }
  }
  const diskPath = rec.previewPath || rec.masterPath || rec.originalPath || rec.nativePath;
  const trimmedDiskPath = typeof diskPath === 'string' ? diskPath.trim() : '';
  const isRenderableImageFile =
    Boolean(trimmedDiskPath) &&
    /\.(jpe?g|png|webp|gif|bmp|svg|avif)$/i.test(trimmedDiskPath) &&
    !trimmedDiskPath.startsWith('/StockFlow/');

  if (hasElectronProtocol && isRenderableImageFile) {
    return `stockflow://local?path=${encodeURIComponent(trimmedDiskPath)}`;
  }

  if (rec.thumbnailBase64 && typeof rec.thumbnailBase64 === 'string' && rec.thumbnailBase64.trim()) {
    const thumb = rec.thumbnailBase64.trim();
    return thumb.startsWith('data:') || thumb.startsWith('stockflow://') || thumb.startsWith('blob:') || thumb.startsWith('http')
      ? thumb
      : `data:image/jpeg;base64,${thumb}`;
  }

  if (trimmedDiskPath && isRenderableImageFile) {
    return `stockflow://local?path=${encodeURIComponent(trimmedDiskPath)}`;
  }
  if (trimmedDiskPath && !rec.thumbnailBase64 && /\.(jpe?g|png|webp|gif|bmp|svg|avif)$/i.test(trimmedDiskPath)) {
    return `stockflow://local?path=${encodeURIComponent(trimmedDiskPath)}`;
  }
  return '';
}

export function subscribeToDbChanges(
  listener: () => void,
  watchScopes: DbChangeScope[] = ['all', 'master', 'ftp', 'keys', 'settings']
): () => void {
  const wrapped: DbChangeListener = (firedScopes) => {
    if (firedScopes.has('all') || watchScopes.includes('all')) {
      listener();
      return;
    }
    for (const s of watchScopes) {
      if (firedScopes.has(s)) {
        listener();
        return;
      }
    }
  };
  dbListeners.add(wrapped);
  return () => {
    dbListeners.delete(wrapped);
  };
}

export function notifyDbChanged(immediate = false, scope: DbChangeScope = 'master'): void {
  if (scope === 'master' || scope === 'all') {
    invalidateMasterRecordsCache();
  }
  pendingScopes.add(scope);

  const fire = () => {
    lastNotifyTime = Date.now();
    notifyTimer = null;
    const scopesToEmit = new Set(pendingScopes);
    pendingScopes.clear();
    dbListeners.forEach((fn) => {
      try {
        fn(scopesToEmit);
      } catch (e) {
        console.error('[SQLite Bridge] Listener error:', e);
      }
    });
  };

  if (immediate) {
    if (notifyTimer) {
      clearTimeout(notifyTimer);
      notifyTimer = null;
    }
    fire();
    return;
  }

  const elapsed = Date.now() - lastNotifyTime;
  if (elapsed >= THROTTLE_MS && !notifyTimer) {
    fire();
  } else if (!notifyTimer) {
    notifyTimer = setTimeout(fire, Math.max(24, THROTTLE_MS - elapsed));
  }
}

/**
 * Reactive hook for querying the SQLite IPC bridge (drop-in replacement for useLiveQuery)
 */
export function useSqliteQuery<T>(
  querier: () => Promise<T> | T,
  deps: any[] = [],
  defaultValue?: T,
  watchScopes: DbChangeScope[] = ['all', 'master', 'ftp', 'keys', 'settings']
): T | undefined {
  const [data, setData] = useState<T | undefined>(defaultValue);
  const mountedRef = useRef(true);
  const querierRef = useRef(querier);
  querierRef.current = querier;
  const inFlightRef = useRef(false);
  const queuedRerunRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    const runQuery = async () => {
      if (cancelled || !mountedRef.current) return;
      if (inFlightRef.current) {
        queuedRerunRef.current = true;
        return;
      }
      inFlightRef.current = true;
      try {
        const res = await querierRef.current();
        if (!cancelled && mountedRef.current) {
          setData(res);
        }
      } catch (err) {
        console.warn('[useSqliteQuery] Query failed:', err);
      } finally {
        inFlightRef.current = false;
        if (queuedRerunRef.current && !cancelled && mountedRef.current) {
          queuedRerunRef.current = false;
          runQuery();
        }
      }
    };

    runQuery();
    const unsub = subscribeToDbChanges(runQuery, watchScopes);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      queuedRerunRef.current = false;
      unsub();
    };
  }, deps);

  return data;
}

const ALL_AGENCIES: SupportedPlatform[] = [
  'adobe',
  'freepik',
  'shutterstock',
  'vecteezy',
  'dreamstime',
  '123rf',
];

const DEFAULT_TEST_REJECTION_REASONS: RejectionReasonRecord[] = [
  {
    id: 'rej_tech_quality',
    agencyId: 'all',
    code: 'TECH_QUALITY',
    title: 'Technical Quality / Artifacts',
    description: 'Chromatic aberration, sensor noise, compression artifacts, or AI anatomy/blending flaws.',
    severity: 'fixable',
    usageCount: 0,
    isActive: true,
    createdAt: 1000,
    updatedAt: 1000,
  },
  {
    id: 'rej_similar_content',
    agencyId: 'all',
    code: 'SIMILAR_DUPLICATE',
    title: 'Similar / Duplicate Submission',
    description: 'Asset is too visually or conceptually similar to files already in queue or portfolio.',
    severity: 'standard',
    usageCount: 0,
    isActive: true,
    createdAt: 1000,
    updatedAt: 1000,
  },
  {
    id: 'rej_ip_trademark',
    agencyId: 'all',
    code: 'IP_TRADEMARK',
    title: 'Intellectual Property / Trademark',
    description: 'Contains recognizable brand logos, copyrighted designs, or protected architecture.',
    severity: 'permanent_ban_risk',
    usageCount: 0,
    isActive: true,
    createdAt: 1000,
    updatedAt: 1000,
  },
  {
    id: 'rej_missing_release',
    agencyId: 'all',
    code: 'MISSING_RELEASE',
    title: 'Missing Model / Property Release',
    description: 'Recognizable face or private property requires a signed release or Editorial flag.',
    severity: 'fixable',
    usageCount: 0,
    isActive: true,
    createdAt: 1000,
    updatedAt: 1000,
  },
];

// ============================================================================
// In-Memory Fallback Store (Used when running Vitest unit tests outside Electron)
// ============================================================================
const testMemoryStore = {
  masterRecords: new Map<string, MasterMetadataRecord>(),
  agencyTracking: new Map<string, AgencyTrackingRecord>(),
  rejectionDictionary: new Map<string, RejectionReasonRecord>(
    DEFAULT_TEST_REJECTION_REASONS.map((r) => [r.id, { ...r }])
  ),
  exportBaskets: new Map<string, ExportBasketRecord>(),
  backupLogs: [] as BackupLogRecord[],
  isUserDataDirty: false,
  masterVaultDir: '/StockFlow/Master_Vault',
  backupsDir: '/StockFlow/backups',
  apiKeys: new Map<string, ApiKeyRecord>(),
  batches: new Map<string, BatchRecord>(),
  settings: new Map<string, SettingItem>(),
  ftpProfiles: new Map<string, FtpCredentialProfile>([
    [
      'dreamstime',
      {
        agencyId: 'dreamstime',
        protocol: 'ftps',
        host: 'upload.dreamstime.com',
        port: 21,
        username: '',
        encryptedPassword: '',
        hasSavedPassword: false,
        passiveMode: true,
        updatedAt: Date.now(),
      },
    ],
  ]),
  ftpSessions: new Map<string, FtpSessionRecord>(),
  ftpTransferLogs: [] as FtpTransferLogRecord[],
  persistentTaskQueues: new Map<
    string,
    {
      moduleId: string;
      sessionId?: string;
      batchStatus: string;
      agencyId: string;
      queue: any[];
      telemetry: Record<string, any>;
      updatedAt: number;
    }
  >(),
};

function ensureTestAgencyTracking(assetId: string, now = Date.now()): Record<SupportedPlatform, AgencyTrackingRecord> {
  const result = {} as Record<SupportedPlatform, AgencyTrackingRecord>;
  for (const agencyId of ALL_AGENCIES) {
    const key = `${assetId}::${agencyId}`;
    let rec = testMemoryStore.agencyTracking.get(key);
    if (!rec) {
      rec = {
        id: `${assetId}_${agencyId}`,
        assetId,
        agencyId,
        status: 'New',
        rejectionCount: 0,
        scrapedDownloads: 0,
        scrapedEarningsCents: 0,
        scrapedViews: 0,
        createdAt: now,
        updatedAt: now,
      };
      testMemoryStore.agencyTracking.set(key, rec);
    }
    const reason = rec.rejectionReasonId
      ? testMemoryStore.rejectionDictionary.get(rec.rejectionReasonId)
      : undefined;
    result[agencyId] = {
      ...rec,
      rejectionReasonTitle: reason ? reason.title : rec.rejectionReasonTitle,
    };
  }
  return result;
}

function recordTestBackup(triggerEvent: BackupLogRecord['triggerEvent']): BackupLogRecord {
  const now = Date.now();
  const log: BackupLogRecord = {
    id: crypto.randomUUID(),
    triggerEvent,
    backupFilePath: `${testMemoryStore.backupsDir}/userdata_backup_${now}_${triggerEvent}.sqlite`,
    fileSizeBytes: 8192,
    assetCountSnapshot: testMemoryStore.masterRecords.size,
    durationMs: 2,
    createdAt: now,
  };
  testMemoryStore.backupLogs.unshift(log);
  testMemoryStore.isUserDataDirty = false;
  if (testMemoryStore.backupLogs.length > 30) {
    testMemoryStore.backupLogs.length = 30;
  }
  return log;
}

export async function invokeFallbackDbRpc(method: string, ...args: any[]): Promise<any> {
  // Fallback for Browser Preview & Node / Vitest unit test environments
  switch (method) {
    case 'getDbInfo':
      return {
        dbPath: '/StockFlow/userdata.sqlite',
        queuesDbPath: '/StockFlow/local_queues.sqlite',
        baseDir: '/StockFlow',
        masterVaultDir: testMemoryStore.masterVaultDir,
        exportBasketsDir: '/StockFlow/Export_Baskets',
        backupsDir: testMemoryStore.backupsDir,
        isUserDataDirty: testMemoryStore.isUserDataDirty,
        engine: 'test-memory',
      };
    case 'getWorkspacePaths':
      return {
        baseDir: '/StockFlow',
        dbPath: '/StockFlow/userdata.sqlite',
        queuesDbPath: '/StockFlow/local_queues.sqlite',
        masterVaultDir: testMemoryStore.masterVaultDir,
        tempStagingDir: '/StockFlow/.stockflow_temp',
        exportBasketsDir: '/StockFlow/Export_Baskets',
        backupsDir: testMemoryStore.backupsDir,
        isUserDataDirty: testMemoryStore.isUserDataDirty,
        hasBackupToday: testMemoryStore.backupLogs.length > 0,
        userDataSizeBytes: 24576,
        queuesSizeBytes: 8192,
      } satisfies WorkspacePathsInfo;
    case 'setMasterWorkspaceFolder': {
      const folder = String(args[0] || '/StockFlow/Master_Vault').trim();
      testMemoryStore.masterVaultDir = folder;
      testMemoryStore.settings.set('master_workspace_folder', {
        key: 'master_workspace_folder',
        value: folder,
      });
      testMemoryStore.isUserDataDirty = true;
      return invokeFallbackDbRpc('getWorkspacePaths');
    }
    case 'setCustomBackupDirectory': {
      const folder = String(args[0] || '/StockFlow/backups').trim();
      testMemoryStore.backupsDir = folder;
      testMemoryStore.settings.set('custom_backup_dir', {
        key: 'custom_backup_dir',
        value: folder,
      });
      testMemoryStore.isUserDataDirty = true;
      return invokeFallbackDbRpc('getWorkspacePaths');
    }
    case 'performQuitBackupIfNeeded': {
      if (!testMemoryStore.isUserDataDirty) {
        return { skipped: true, reason: 'not_dirty' };
      }
      const todayStr = new Date().toISOString().slice(0, 10);
      const alreadyToday = testMemoryStore.backupLogs.some(
        (b) => new Date(b.createdAt).toISOString().slice(0, 10) === todayStr
      );
      if (alreadyToday) {
        return { skipped: true, reason: 'already_backed_up_today' };
      }
      const backup = recordTestBackup('app_quit');
      return { skipped: false, backup };
    }
    case 'getMasterRecords':
      return Array.from(testMemoryStore.masterRecords.values())
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        .map((r) => ({
          ...r,
          agencyTrackings: ensureTestAgencyTracking(r.id, r.createdAt),
        }));
    case 'getMasterRecord': {
      const rec = testMemoryStore.masterRecords.get(args[0]);
      if (!rec) return undefined;
      return {
        ...rec,
        agencyTrackings: ensureTestAgencyTracking(rec.id, rec.createdAt),
      };
    }
    case 'countMasterRecords':
      return testMemoryStore.masterRecords.size;
    case 'putMasterRecord': {
      const rec = args[0] as MasterMetadataRecord;
      const agencyTrackings = ensureTestAgencyTracking(rec.id, rec.createdAt || Date.now());
      testMemoryStore.masterRecords.set(rec.id, { ...rec, agencyTrackings });
      return rec.id;
    }
    case 'bulkPutMasterRecords': {
      for (const r of (args[0] || []) as MasterMetadataRecord[]) {
        const agencyTrackings = ensureTestAgencyTracking(r.id, r.createdAt || Date.now());
        testMemoryStore.masterRecords.set(r.id, { ...r, agencyTrackings });
      }
      recordTestBackup('batch_metadata');
      return;
    }
    case 'updateMasterRecord': {
      const [id, changes] = args;
      const existing = testMemoryStore.masterRecords.get(id);
      if (!existing) return 0;
      testMemoryStore.masterRecords.set(id, { ...existing, ...changes, id });
      return 1;
    }
    case 'modifyAllMasterRecords': {
      const changes = args[0] || {};
      for (const [id, rec] of testMemoryStore.masterRecords.entries()) {
        testMemoryStore.masterRecords.set(id, { ...rec, ...changes });
      }
      return;
    }
    case 'deleteMasterRecord': {
      const id = args[0];
      testMemoryStore.masterRecords.delete(id);
      for (const agencyId of ALL_AGENCIES) {
        testMemoryStore.agencyTracking.delete(`${id}::${agencyId}`);
      }
      return;
    }
    case 'bulkDeleteMasterRecords':
      for (const id of args[0] || []) {
        testMemoryStore.masterRecords.delete(id);
        for (const agencyId of ALL_AGENCIES) {
          testMemoryStore.agencyTracking.delete(`${id}::${agencyId}`);
        }
      }
      return;
    case 'clearMasterRecords':
      testMemoryStore.masterRecords.clear();
      testMemoryStore.agencyTracking.clear();
      return;
    case 'checkDuplicateHash': {
      const fileHash = args[0];
      if (!fileHash) return { isDuplicate: false };
      for (const rec of testMemoryStore.masterRecords.values()) {
        if (rec.workspaceScope === 'studio') continue;
        if (rec.fileHash && rec.fileHash === fileHash) {
          return { isDuplicate: true, existingAssetId: rec.id, existingFilename: rec.filename };
        }
      }
      return { isDuplicate: false };
    }
    case 'stageAndHashFile': {
      const { sourcePath, fileBuffer, fileSize: explicitFileSize, filename, batchId = 'batch_default' } = args[0] || {};
      let hexHash = '';
      let fileSize = typeof explicitFileSize === 'number' ? explicitFileSize : 0;
      if (fileBuffer && fileBuffer.byteLength > 0) {
        const bytes = new Uint8Array(fileBuffer);
        fileSize = bytes.byteLength;
        let h1 = 0xdeadbeef ^ fileSize;
        let h2 = 0x41c6ce57 ^ fileSize;
        for (let i = 0; i < bytes.length; i++) {
          const ch = bytes[i];
          h1 = Math.imul(h1 ^ ch, 2654435761);
          h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        hexHash = `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}${fileSize.toString(16).padStart(8, '0')}`;
      } else {
        const seed = String(sourcePath || filename || Date.now());
        if (typeof explicitFileSize !== 'number') {
          fileSize = fileBuffer && fileBuffer.byteLength === 0 ? 0 : 1024;
        }
        let acc = 2166136261;
        for (let i = 0; i < seed.length; i++) {
          acc ^= seed.charCodeAt(i);
          acc = Math.imul(acc, 16777619);
        }
        hexHash = `${(acc >>> 0).toString(16).padStart(8, '0')}a4f19c2e`;
      }

      for (const rec of testMemoryStore.masterRecords.values()) {
        if (rec.workspaceScope === 'studio') continue;
        if (rec.fileHash && rec.fileHash === hexHash) {
          return {
            success: true,
            isDuplicate: true,
            fileHash: hexHash,
            fileSize,
            existingAssetId: rec.id,
            existingFilename: rec.filename,
          };
        }
      }

      return {
        success: true,
        isDuplicate: false,
        tempFilePath: `/StockFlow/.stockflow_temp/${batchId}/${filename || 'temp.bin'}`,
        fileHash: hexHash,
        fileSize,
      };
    }
    case 'commitAtomicallyToMasterVault': {
      const { record, previewBuffer, triggerBackup } = args[0] || {};
      const agencyTrackings = ensureTestAgencyTracking(record.id, record.createdAt || Date.now());
      const baseStem = (record.filename || 'asset').replace(/\.[^.]+$/, '');
      const computedPreviewPath =
        previewBuffer && record.mediaType === 'vector'
          ? `/StockFlow/Master_Vault/${baseStem}.jpg`
          : record.previewPath;
      const committed: MasterMetadataRecord = {
        ...record,
        workspaceScope: record.workspaceScope || 'tracker',
        masterPath: record.masterPath || `/StockFlow/Master_Vault/${record.filename}`,
        previewPath: computedPreviewPath,
        pipelineStage: 'committed',
        status: 'completed',
        agencyTrackings,
      };
      testMemoryStore.masterRecords.set(record.id, committed);
      if (triggerBackup) {
        recordTestBackup('batch_ingest');
      }
      return committed;
    }
    case 'rollbackIngestedItem': {
      const { assetId } = args[0] || {};
      if (assetId) {
        testMemoryStore.masterRecords.delete(assetId);
        for (const agencyId of ALL_AGENCIES) {
          testMemoryStore.agencyTracking.delete(`${assetId}::${agencyId}`);
        }
      }
      return { rolledBack: true };
    }
    case 'getRejectionDictionary': {
      const agencyId = args[0];
      const all = Array.from(testMemoryStore.rejectionDictionary.values()).filter((r) => r.isActive);
      if (agencyId && agencyId !== 'all') {
        return all.filter((r) => r.agencyId === 'all' || r.agencyId === agencyId);
      }
      return all;
    }
    case 'addRejectionReason': {
      const { agencyId = 'all', title, description = '', severity = 'standard', code } = args[0] || {};
      const now = Date.now();
      const id = `rej_${crypto.randomUUID().slice(0, 8)}`;
      const rec: RejectionReasonRecord = {
        id,
        agencyId,
        code,
        title: String(title || '').trim(),
        description: String(description || '').trim(),
        severity,
        usageCount: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      testMemoryStore.rejectionDictionary.set(id, rec);
      return rec;
    }
    case 'createExportBasket': {
      const { agencyId, basketName, assetIds, csvFilename } = args[0] || {};
      const now = Date.now();
      const basketId = `basket_${crypto.randomUUID().slice(0, 8)}`;
      const cleanName = (basketName || `${agencyId}_batch`).replace(/[^a-zA-Z0-9_-]/g, '_');
      const stagingFolderPath = `/StockFlow/Export_Baskets/${cleanName}_${basketId}`;
      const basket: ExportBasketRecord = {
        id: basketId,
        agencyId,
        basketName: cleanName,
        stagingFolderPath,
        csvFilePath: csvFilename ? `${stagingFolderPath}/${csvFilename}` : undefined,
        itemCount: assetIds.length,
        status: 'pending_reconciliation',
        createdAt: now,
      };
      testMemoryStore.exportBaskets.set(basketId, basket);
      for (const assetId of assetIds) {
        ensureTestAgencyTracking(assetId, now);
        const key = `${assetId}::${agencyId}`;
        const existing = testMemoryStore.agencyTracking.get(key)!;
        testMemoryStore.agencyTracking.set(key, {
          ...existing,
          status: 'Pending Upload',
          exportBasketId: basketId,
          stagedFilePath: `${stagingFolderPath}/${testMemoryStore.masterRecords.get(assetId)?.filename || assetId}`,
          submissionBatchName: cleanName,
          exportedAt: now,
          updatedAt: now,
        });
      }
      recordTestBackup('batch_export');
      return basket;
    }
    case 'getExportBaskets': {
      const agencyId = args[0];
      const all = Array.from(testMemoryStore.exportBaskets.values()).sort((a, b) => b.createdAt - a.createdAt);
      return agencyId ? all.filter((b) => b.agencyId === agencyId) : all;
    }
    case 'reconcileAgencyStatuses': {
      const { assetIds = [], agencyId, targetStatus, rejectionReasonId, customRejectionNote } = args[0] || {};
      const now = Date.now();
      const matchedReason = rejectionReasonId
        ? testMemoryStore.rejectionDictionary.get(rejectionReasonId)
        : undefined;
      for (const assetId of assetIds) {
        ensureTestAgencyTracking(assetId, now);
        const key = `${assetId}::${agencyId}`;
        const existing = testMemoryStore.agencyTracking.get(key)!;
        const isRejected = targetStatus === 'Rejected';
        const isReverted = targetStatus === 'New';
        testMemoryStore.agencyTracking.set(key, {
          ...existing,
          status: targetStatus,
          rejectionReasonId: isRejected ? rejectionReasonId : isReverted ? undefined : existing.rejectionReasonId,
          rejectionReasonTitle: isRejected
            ? matchedReason?.title || existing.rejectionReasonTitle
            : isReverted
            ? undefined
            : existing.rejectionReasonTitle,
          customRejectionNote: isRejected ? customRejectionNote : isReverted ? undefined : existing.customRejectionNote,
          rejectionCount: isRejected ? (existing.rejectionCount || 0) + 1 : existing.rejectionCount || 0,
          uploadedAt: targetStatus === 'Uploaded' ? now : existing.uploadedAt,
          acceptedAt: targetStatus === 'Accepted' ? now : existing.acceptedAt,
          rejectedAt: isRejected ? now : existing.rejectedAt,
          updatedAt: now,
        });
      }
      if (targetStatus === 'Rejected' && matchedReason) {
        matchedReason.usageCount += assetIds.length;
      }
      recordTestBackup('batch_reconcile');
      return { updatedCount: assetIds.length };
    }
    case 'getTrackerStats': {
      const records = Array.from(testMemoryStore.masterRecords.values()).filter(
        (r) => r.workspaceScope !== 'studio'
      );
      const perAgencyStats = {} as TrackerSummaryStats['perAgencyStats'];
      for (const agencyId of ALL_AGENCIES) {
        perAgencyStats[agencyId] = {
          New: 0,
          'Pending Upload': 0,
          Uploaded: 0,
          'In Review': 0,
          Accepted: 0,
          Rejected: 0,
        };
      }
      let newCount = 0;
      let pendingUploadCount = 0;
      let uploadedCount = 0;
      let inReviewCount = 0;
      let acceptedCount = 0;
      let rejectedCount = 0;

      for (const rec of records) {
        const map = ensureTestAgencyTracking(rec.id, rec.createdAt);
        for (const agencyId of ALL_AGENCIES) {
          const st = map[agencyId]?.status || 'New';
          perAgencyStats[agencyId][st]++;
          if (st === 'New') newCount++;
          else if (st === 'Pending Upload') pendingUploadCount++;
          else if (st === 'Uploaded') uploadedCount++;
          else if (st === 'In Review') inReviewCount++;
          else if (st === 'Accepted') acceptedCount++;
          else if (st === 'Rejected') rejectedCount++;
        }
      }
      return {
        totalAssets: records.length,
        newCount,
        pendingUploadCount,
        uploadedCount,
        inReviewCount,
        acceptedCount,
        rejectedCount,
        perAgencyStats,
        lastBackup: testMemoryStore.backupLogs[0],
        backupCount: testMemoryStore.backupLogs.length,
      } satisfies TrackerSummaryStats;
    }
    case 'performHotBackup':
      return recordTestBackup(args[0] || 'manual');
    case 'getBackupLogs':
      return testMemoryStore.backupLogs.slice(0, args[0] || 30);
    case 'getApiKeys':
      return Array.from(testMemoryStore.apiKeys.values()).sort(
        (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
      );
    case 'getApiKey':
      return testMemoryStore.apiKeys.get(args[0]);
    case 'putApiKey': {
      const rec = args[0] as ApiKeyRecord;
      testMemoryStore.apiKeys.set(rec.id, { ...rec });
      return rec.id;
    }
    case 'bulkPutApiKeys': {
      for (const r of (args[0] || []) as ApiKeyRecord[]) {
        testMemoryStore.apiKeys.set(r.id, { ...r });
      }
      return;
    }
    case 'updateApiKey': {
      const [id, changes] = args;
      const existing = testMemoryStore.apiKeys.get(id);
      if (!existing) return 0;
      testMemoryStore.apiKeys.set(id, { ...existing, ...changes, id });
      return 1;
    }
    case 'deleteApiKey':
      testMemoryStore.apiKeys.delete(args[0]);
      return;
    case 'deleteApiKeysByProvider': {
      const providerId = args[0];
      for (const [id, rec] of testMemoryStore.apiKeys.entries()) {
        if (rec.providerId === providerId) testMemoryStore.apiKeys.delete(id);
      }
      return;
    }
    case 'clearApiKeys':
      testMemoryStore.apiKeys.clear();
      return;
    case 'getBatches':
      return Array.from(testMemoryStore.batches.values()).sort(
        (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
      );
    case 'getBatch':
      return testMemoryStore.batches.get(args[0]);
    case 'putBatch': {
      const rec = args[0] as BatchRecord;
      testMemoryStore.batches.set(rec.id, { ...rec });
      return rec.id;
    }
    case 'deleteBatch':
      testMemoryStore.batches.delete(args[0]);
      return;
    case 'clearBatches':
      testMemoryStore.batches.clear();
      return;
    case 'getSetting':
      return testMemoryStore.settings.get(args[0]);
    case 'putSetting': {
      const item = args[0] as SettingItem;
      testMemoryStore.settings.set(item.key, { key: item.key, value: item.value });
      return item.key;
    }
    case 'clearSettings':
      testMemoryStore.settings.clear();
      return;
    case 'getFtpProfile': {
      const agencyId = args[0] || 'dreamstime';
      const defaultSpec =
        agencyId === '123rf'
          ? { protocol: 'ftp' as const, host: 'ftp.123rf.com', port: 21 }
          : agencyId === 'vecteezy'
          ? { protocol: 'sftp' as const, host: 'content-ftp.eezy.com', port: 22 }
          : agencyId === 'shutterstock'
          ? { protocol: 'ftps' as const, host: 'ftps.shutterstock.com', port: 21 }
          : agencyId === 'adobe'
          ? { protocol: 'sftp' as const, host: 'sftp.contributor.adobestock.com', port: 22 }
          : agencyId === 'magnific'
          ? { protocol: 'sftp' as const, host: 'contributor-ftp.magnific.com', port: 60022 }
          : { protocol: 'ftp' as const, host: 'upload.dreamstime.com', port: 21 };

      let p = testMemoryStore.ftpProfiles.get(agencyId);
      if (!p || (!p.username && !p.encryptedPassword)) {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            const raw = window.localStorage.getItem(`stockflow_ftp_profile_${agencyId}`);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === 'object' && (parsed.username || parsed.encryptedPassword || parsed.hasSavedPassword)) {
                p = {
                  agencyId,
                  protocol: parsed.protocol || defaultSpec.protocol,
                  host: parsed.host || defaultSpec.host,
                  port: Number(parsed.port || defaultSpec.port),
                  username: parsed.username || '',
                  encryptedPassword: parsed.encryptedPassword || '',
                  hasSavedPassword: Boolean(parsed.encryptedPassword || parsed.hasSavedPassword),
                  passiveMode: true,
                  lastVerifiedAt: parsed.lastVerifiedAt,
                  updatedAt: parsed.updatedAt || Date.now(),
                };
                testMemoryStore.ftpProfiles.set(agencyId, p);
              }
            }
          }
        } catch {
          // ignore
        }
      }
      if (!p) {
        p = {
          agencyId,
          protocol: defaultSpec.protocol,
          host: defaultSpec.host,
          port: defaultSpec.port,
          username: '',
          encryptedPassword: '',
          hasSavedPassword: false,
          passiveMode: true,
          updatedAt: Date.now(),
        };
        testMemoryStore.ftpProfiles.set(agencyId, p);
      }
      return {
        ...p,
        protocol: p.protocol || defaultSpec.protocol,
        host: p.host || defaultSpec.host,
        port: p.port || defaultSpec.port,
        hasSavedPassword: Boolean(p.encryptedPassword || p.hasSavedPassword),
      };
    }
    case 'saveFtpProfile': {
      const payload = args[0] || {};
      const agencyId = payload.agencyId || 'dreamstime';
      const defaultSpec =
        agencyId === '123rf'
          ? { protocol: 'ftp' as const, host: 'ftp.123rf.com', port: 21 }
          : agencyId === 'vecteezy'
          ? { protocol: 'sftp' as const, host: 'content-ftp.eezy.com', port: 22 }
          : agencyId === 'shutterstock'
          ? { protocol: 'ftps' as const, host: 'ftps.shutterstock.com', port: 21 }
          : agencyId === 'adobe'
          ? { protocol: 'sftp' as const, host: 'sftp.contributor.adobestock.com', port: 22 }
          : agencyId === 'magnific'
          ? { protocol: 'sftp' as const, host: 'contributor-ftp.magnific.com', port: 60022 }
          : { protocol: 'ftp' as const, host: 'upload.dreamstime.com', port: 21 };

      let existing = testMemoryStore.ftpProfiles.get(agencyId);
      if (!existing || (!existing.username && !existing.encryptedPassword)) {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            const raw = window.localStorage.getItem(`stockflow_ftp_profile_${agencyId}`);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === 'object') {
                existing = parsed;
              }
            }
          }
        } catch {
          // ignore
        }
      }
      const now = Date.now();
      const nextEncrypted =
        typeof payload.encryptedPassword === 'string' && payload.encryptedPassword.length > 0
          ? payload.encryptedPassword
          : existing?.encryptedPassword || '';
      const updated: FtpCredentialProfile = {
        agencyId,
        protocol: payload.protocol || existing?.protocol || defaultSpec.protocol,
        host: (payload.host ?? existing?.host ?? defaultSpec.host).trim(),
        port: Number(payload.port || existing?.port || defaultSpec.port),
        username: (payload.username ?? existing?.username ?? '').trim(),
        encryptedPassword: nextEncrypted,
        hasSavedPassword: Boolean(nextEncrypted || existing?.hasSavedPassword),
        passiveMode: true,
        lastVerifiedAt: payload.lastVerifiedAt ?? existing?.lastVerifiedAt,
        updatedAt: now,
      };
      testMemoryStore.ftpProfiles.set(agencyId, updated);
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(`stockflow_ftp_profile_${agencyId}`, JSON.stringify(updated));
        }
      } catch {
        // ignore
      }
      return updated;
    }
    case 'createFtpSession': {
      const payload = args[0] || {};
      const now = Date.now();
      const id = payload.id || `ftp_sess_${crypto.randomUUID().slice(0, 8)}`;
      const session: FtpSessionRecord = {
        id,
        agencyId: payload.agencyId || 'dreamstime',
        mode: payload.mode || 'dry_run',
        status: 'running',
        totalFiles: payload.totalFiles || 0,
        succeededFiles: 0,
        failedFiles: 0,
        totalBytes: payload.totalBytes || 0,
        averageSpeedBps: 0,
        startedAt: now,
      };
      testMemoryStore.ftpSessions.set(id, session);
      return session;
    }
    case 'updateFtpSession': {
      const [id, changes] = args;
      const existing = testMemoryStore.ftpSessions.get(id);
      if (!existing) return null;
      const updated: FtpSessionRecord = {
        ...existing,
        ...changes,
        id,
      };
      testMemoryStore.ftpSessions.set(id, updated);
      if (changes?.status === 'completed' || changes?.status === 'partial_failure') {
        recordTestBackup('ftp_batch_complete');
      }
      return updated;
    }
    case 'getFtpSessions': {
      const agencyId = args[0];
      const limit = args[1] || 20;
      const all = Array.from(testMemoryStore.ftpSessions.values()).sort(
        (a, b) => b.startedAt - a.startedAt
      );
      const filtered = agencyId ? all.filter((s) => s.agencyId === agencyId) : all;
      return filtered.slice(0, limit);
    }
    case 'logFtpTransfer': {
      const payload = args[0] || {};
      const now = Date.now();
      const rec: FtpTransferLogRecord = {
        id: payload.id || `ftp_log_${crypto.randomUUID().slice(0, 8)}`,
        sessionId: payload.sessionId || 'session_default',
        agencyId: payload.agencyId || 'dreamstime',
        filename: payload.filename || '',
        localPath: payload.localPath,
        fileSize: payload.fileSize || 0,
        mediaType: payload.mediaType || 'image',
        remoteDirectory: payload.remoteDirectory || '/',
        remotePath: payload.remotePath || `/${payload.filename || ''}`,
        status: payload.status || 'succeeded',
        retryCount: payload.retryCount || 0,
        errorCode: payload.errorCode,
        errorMessage: payload.errorMessage,
        durationMs: payload.durationMs || 0,
        completedAt: payload.completedAt || now,
      };
      testMemoryStore.ftpTransferLogs.unshift(rec);
      if (testMemoryStore.ftpTransferLogs.length > 500) {
        testMemoryStore.ftpTransferLogs.length = 500;
      }
      return rec;
    }
    case 'getFtpTransferLogs': {
      const { agencyId, sessionId, limit = 100 } = args[0] || {};
      let list = [...testMemoryStore.ftpTransferLogs];
      if (agencyId) list = list.filter((l) => l.agencyId === agencyId);
      if (sessionId) list = list.filter((l) => l.sessionId === sessionId);
      return list.slice(0, limit);
    }
    case 'clearFtpLogs': {
      const agencyId = args[0];
      if (agencyId) {
        testMemoryStore.ftpTransferLogs = testMemoryStore.ftpTransferLogs.filter(
          (l) => l.agencyId !== agencyId
        );
        for (const [k, v] of testMemoryStore.ftpSessions.entries()) {
          if (v.agencyId === agencyId) testMemoryStore.ftpSessions.delete(k);
        }
      } else {
        testMemoryStore.ftpTransferLogs = [];
        testMemoryStore.ftpSessions.clear();
      }
      return { cleared: true };
    }
    case 'saveQueueSnapshot': {
      const payload = args[0] || {};
      const moduleId = String(payload.moduleId || 'ftp').trim();
      const now = Date.now();
      const queue =
        typeof payload.queueJson === 'string'
          ? JSON.parse(payload.queueJson || '[]')
          : Array.isArray(payload.queue)
          ? JSON.parse(JSON.stringify(payload.queue))
          : [];
      const telemetry =
        typeof payload.telemetryJson === 'string'
          ? JSON.parse(payload.telemetryJson || '{}')
          : payload.telemetry
          ? JSON.parse(JSON.stringify(payload.telemetry))
          : {};
      const rec = {
        moduleId,
        sessionId: payload.sessionId || undefined,
        batchStatus: payload.batchStatus || 'idle',
        agencyId: payload.agencyId || 'dreamstime',
        queue,
        telemetry,
        updatedAt: payload.updatedAt || now,
      };
      testMemoryStore.persistentTaskQueues.set(moduleId, rec);
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(`stockflow_ephemeral_queue_${moduleId}`, JSON.stringify(rec));
        }
      } catch {
        // ignore storage quota errors
      }
      return {
        moduleId: rec.moduleId,
        sessionId: rec.sessionId,
        batchStatus: rec.batchStatus,
        agencyId: rec.agencyId,
        updatedAt: rec.updatedAt,
      };
    }
    case 'getQueueSnapshot': {
      const moduleId = String(args[0] || 'ftp').trim();
      let rec = testMemoryStore.persistentTaskQueues.get(moduleId);
      if (!rec && typeof window !== 'undefined' && window.localStorage) {
        try {
          const raw = window.localStorage.getItem(`stockflow_ephemeral_queue_${moduleId}`);
          if (raw) {
            rec = JSON.parse(raw);
            if (rec) {
              testMemoryStore.persistentTaskQueues.set(moduleId, rec);
            }
          }
        } catch {
          // ignore
        }
      }
      if (!rec) return null;
      return JSON.parse(JSON.stringify(rec));
    }
    case 'clearQueueSnapshot': {
      const moduleId = String(args[0] || 'ftp').trim();
      testMemoryStore.persistentTaskQueues.delete(moduleId);
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(`stockflow_ephemeral_queue_${moduleId}`);
        }
      } catch {
        // ignore
      }
      return { cleared: true, moduleId };
    }
    default:
      return undefined;
  }
}

async function invokeDbRpc(method: string, ...args: any[]): Promise<any> {
  if (typeof window !== 'undefined' && window.electronAPI?.db?.invoke) {
    return await window.electronAPI.db.invoke(method, ...args);
  }
  return await invokeFallbackDbRpc(method, ...args);
}

async function fetchMasterRecordsDeduplicated(): Promise<MasterMetadataRecord[]> {
  const now = Date.now();
  if (cachedMasterRecords && now - cachedMasterRecordsAt < MASTER_CACHE_TTL_MS) {
    return cachedMasterRecords;
  }
  if (inFlightMasterRecordsPromise) {
    return inFlightMasterRecordsPromise;
  }
  inFlightMasterRecordsPromise = (async () => {
    try {
      const res: MasterMetadataRecord[] = (await invokeDbRpc('getMasterRecords')) || [];
      cachedMasterRecords = res;
      cachedMasterRecordsAt = Date.now();
      return res;
    } finally {
      inFlightMasterRecordsPromise = null;
    }
  })();
  return inFlightMasterRecordsPromise;
}

// ============================================================================
// SQLite Relational Client Bridge (Drop-in Async Table Interface)
// ============================================================================
export class StockFlowSqliteDB {
  masterRecords = {
    toArray: async (): Promise<MasterMetadataRecord[]> => {
      return await fetchMasterRecordsDeduplicated();
    },
    orderBy: (_field: keyof MasterMetadataRecord) => ({
      toArray: async (): Promise<MasterMetadataRecord[]> => {
        return await fetchMasterRecordsDeduplicated();
      },
    }),
    filter: (predicate: (rec: MasterMetadataRecord) => boolean) => ({
      toArray: async (): Promise<MasterMetadataRecord[]> => {
        const all: MasterMetadataRecord[] = await fetchMasterRecordsDeduplicated();
        return all.filter(predicate);
      },
    }),
    toCollection: () => ({
      modify: async (changes: Partial<MasterMetadataRecord>): Promise<void> => {
        await invokeDbRpc('modifyAllMasterRecords', changes);
        notifyDbChanged();
      },
    }),
    count: async (): Promise<number> => {
      return (await invokeDbRpc('countMasterRecords')) || 0;
    },
    get: async (id: string): Promise<MasterMetadataRecord | undefined> => {
      return await invokeDbRpc('getMasterRecord', id);
    },
    put: async (record: MasterMetadataRecord): Promise<string> => {
      const id = await invokeDbRpc('putMasterRecord', record);
      notifyDbChanged();
      return id;
    },
    bulkPut: async (records: MasterMetadataRecord[]): Promise<void> => {
      await invokeDbRpc('bulkPutMasterRecords', records);
      notifyDbChanged();
    },
    update: async (id: string, changes: Partial<MasterMetadataRecord>): Promise<number> => {
      const res = await invokeDbRpc('updateMasterRecord', id, changes);
      notifyDbChanged();
      return res;
    },
    delete: async (id: string): Promise<void> => {
      await invokeDbRpc('deleteMasterRecord', id);
      notifyDbChanged(true);
    },
    bulkDelete: async (ids: string[]): Promise<void> => {
      await invokeDbRpc('bulkDeleteMasterRecords', ids);
      notifyDbChanged(true);
    },
    clear: async (): Promise<void> => {
      await invokeDbRpc('clearMasterRecords');
      notifyDbChanged(true);
    },
  };

  tracker = {
    getWorkspacePaths: async (): Promise<WorkspacePathsInfo> => {
      return await invokeDbRpc('getWorkspacePaths');
    },
    setMasterWorkspaceFolder: async (folderPath: string): Promise<WorkspacePathsInfo> => {
      const res = await invokeDbRpc('setMasterWorkspaceFolder', folderPath);
      notifyDbChanged(true, 'settings');
      notifyDbChanged(true, 'master');
      return res;
    },
    setCustomBackupDirectory: async (folderPath: string): Promise<WorkspacePathsInfo> => {
      const res = await invokeDbRpc('setCustomBackupDirectory', folderPath);
      notifyDbChanged(true, 'settings');
      return res;
    },
    performQuitBackupIfNeeded: async (): Promise<{
      skipped: boolean;
      reason?: string;
      backup?: BackupLogRecord | null;
    }> => {
      const res = await invokeDbRpc('performQuitBackupIfNeeded');
      notifyDbChanged(true, 'settings');
      return res;
    },
    getStats: async (): Promise<TrackerSummaryStats> => {
      return await invokeDbRpc('getTrackerStats');
    },
    checkDuplicateHash: async (
      fileHash: string
    ): Promise<{ isDuplicate: boolean; existingAssetId?: string; existingFilename?: string }> => {
      return await invokeDbRpc('checkDuplicateHash', fileHash);
    },
    stageAndHashFile: async (payload: {
      sourcePath?: string;
      fileBuffer?: ArrayBuffer;
      fileSize?: number;
      filename: string;
      batchId?: string;
    }): Promise<{
      success: boolean;
      isDuplicate?: boolean;
      tempFilePath?: string;
      fileHash?: string;
      fileSize?: number;
      existingAssetId?: string;
      existingFilename?: string;
      error?: string;
    }> => {
      return await invokeDbRpc('stageAndHashFile', payload);
    },
    commitAtomicallyToMasterVault: async (payload: {
      record: MasterMetadataRecord;
      tempFilePath?: string;
      previewBuffer?: ArrayBuffer;
      mutedVideoBuffer?: ArrayBuffer;
      triggerBackup?: boolean;
    }): Promise<MasterMetadataRecord> => {
      const res = await invokeDbRpc('commitAtomicallyToMasterVault', payload);
      notifyDbChanged(true, 'master');
      return res;
    },
    rollbackIngestedItem: async (payload: {
      assetId?: string;
      tempFilePath?: string;
      previewTempPath?: string;
    }): Promise<{ rolledBack: boolean }> => {
      const res = await invokeDbRpc('rollbackIngestedItem', payload);
      notifyDbChanged(true, 'master');
      return res;
    },
    getRejectionDictionary: async (agencyId?: SupportedPlatform | 'all'): Promise<RejectionReasonRecord[]> => {
      return (await invokeDbRpc('getRejectionDictionary', agencyId)) || [];
    },
    addRejectionReason: async (payload: {
      agencyId: SupportedPlatform | 'all';
      title: string;
      description?: string;
      severity?: 'fixable' | 'standard' | 'permanent_ban_risk';
      code?: string;
    }): Promise<RejectionReasonRecord> => {
      const res = await invokeDbRpc('addRejectionReason', payload);
      notifyDbChanged(true, 'master');
      return res;
    },
    createExportBasket: async (payload: {
      agencyId: SupportedPlatform;
      basketName?: string;
      assetIds: string[];
      csvFilename: string;
      csvContent: string;
      additionalCsvs?: Array<{ filename: string; csvString: string }>;
    }): Promise<ExportBasketRecord> => {
      const res = await invokeDbRpc('createExportBasket', payload);
      notifyDbChanged(true, 'master');
      return res;
    },
    getExportBaskets: async (agencyId?: SupportedPlatform): Promise<ExportBasketRecord[]> => {
      return (await invokeDbRpc('getExportBaskets', agencyId)) || [];
    },
    reconcileAgencyStatuses: async (payload: {
      assetIds: string[];
      agencyId: SupportedPlatform;
      targetStatus: TrackerAgencyStatus;
      rejectionReasonId?: string | null;
      customRejectionNote?: string | null;
      agencyUrl?: string | null;
      agencyAssetId?: string | null;
    }): Promise<{ updatedCount: number }> => {
      const res = await invokeDbRpc('reconcileAgencyStatuses', payload);
      notifyDbChanged(true, 'master');
      return res;
    },
    performHotBackup: async (
      triggerEvent: BackupLogRecord['triggerEvent'] = 'manual'
    ): Promise<BackupLogRecord | null> => {
      const res = await invokeDbRpc('performHotBackup', triggerEvent);
      notifyDbChanged(true, 'settings');
      notifyDbChanged(true, 'master');
      return res;
    },
    getBackupLogs: async (limit = 30): Promise<BackupLogRecord[]> => {
      return (await invokeDbRpc('getBackupLogs', limit)) || [];
    },
  };

  ftp = {
    getProfile: async (agencyId: SupportedPlatform | string = 'dreamstime'): Promise<FtpCredentialProfile> => {
      const rpcRes = (await invokeDbRpc('getFtpProfile', agencyId)) as FtpCredentialProfile | undefined;
      let localProfile: Partial<FtpCredentialProfile> | null = null;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const raw = window.localStorage.getItem(`stockflow_ftp_profile_${agencyId}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              localProfile = parsed;
            }
          }
        }
      } catch {
        // ignore
      }

      if (rpcRes && (rpcRes.username || rpcRes.hasSavedPassword)) {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            const mergedToStore = {
              ...localProfile,
              ...rpcRes,
              encryptedPassword: rpcRes.encryptedPassword || localProfile?.encryptedPassword || '',
              hasSavedPassword: Boolean(
                rpcRes.hasSavedPassword || rpcRes.encryptedPassword || localProfile?.encryptedPassword
              ),
            };
            window.localStorage.setItem(
              `stockflow_ftp_profile_${agencyId}`,
              JSON.stringify(mergedToStore)
            );
          }
        } catch {
          // ignore
        }
        return rpcRes;
      }

      // If backend SQLite / memory store returned empty credentials on startup, auto-restore from localStorage
      if (localProfile && (localProfile.username || localProfile.encryptedPassword || localProfile.hasSavedPassword)) {
        const restored = await invokeDbRpc('saveFtpProfile', {
          agencyId,
          protocol: localProfile.protocol || rpcRes?.protocol,
          host: localProfile.host || rpcRes?.host,
          port: localProfile.port || rpcRes?.port,
          username: localProfile.username || '',
          encryptedPassword: localProfile.encryptedPassword || '',
          passiveMode: true,
          lastVerifiedAt: localProfile.lastVerifiedAt,
        });
        return {
          ...restored,
          username: localProfile.username || restored?.username || '',
          hasSavedPassword: Boolean(
            restored?.hasSavedPassword ||
              localProfile.encryptedPassword ||
              localProfile.hasSavedPassword
          ),
        };
      }

      return rpcRes!;
    },
    saveProfile: async (payload: {
      agencyId?: SupportedPlatform | string;
      protocol?: 'ftp' | 'ftps' | 'sftp';
      host?: string;
      port?: number;
      username?: string;
      encryptedPassword?: string;
      passiveMode?: boolean;
      lastVerifiedAt?: number;
    }): Promise<FtpCredentialProfile> => {
      const agencyId = payload.agencyId || 'dreamstime';
      let existingLocal: Partial<FtpCredentialProfile> | null = null;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const raw = window.localStorage.getItem(`stockflow_ftp_profile_${agencyId}`);
          if (raw) {
            existingLocal = JSON.parse(raw);
          }
        }
      } catch {
        // ignore
      }

      const mergedPayload = {
        ...payload,
        agencyId,
        username: payload.username ?? existingLocal?.username,
        encryptedPassword:
          typeof payload.encryptedPassword === 'string' && payload.encryptedPassword.length > 0
            ? payload.encryptedPassword
            : existingLocal?.encryptedPassword,
      };

      const res = await invokeDbRpc('saveFtpProfile', mergedPayload);

      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const toStore = {
            ...existingLocal,
            ...res,
            ...mergedPayload,
            hasSavedPassword: Boolean(
              res?.hasSavedPassword ||
                mergedPayload.encryptedPassword ||
                existingLocal?.hasSavedPassword
            ),
            updatedAt: Date.now(),
          };
          window.localStorage.setItem(`stockflow_ftp_profile_${agencyId}`, JSON.stringify(toStore));
        }
      } catch {
        // ignore
      }

      notifyDbChanged(true, 'ftp');
      return res;
    },
    createSession: async (payload: {
      id?: string;
      agencyId?: SupportedPlatform | string;
      mode?: 'live' | 'dry_run';
      totalFiles: number;
      totalBytes: number;
    }): Promise<FtpSessionRecord> => {
      const res = await invokeDbRpc('createFtpSession', payload);
      notifyDbChanged(true, 'ftp');
      return res;
    },
    updateSession: async (
      id: string,
      changes: Partial<FtpSessionRecord>
    ): Promise<FtpSessionRecord | null> => {
      const res = await invokeDbRpc('updateFtpSession', id, changes);
      notifyDbChanged(false, 'ftp');
      return res;
    },
    getSessions: async (agencyId?: SupportedPlatform | string, limit = 20): Promise<FtpSessionRecord[]> => {
      return (await invokeDbRpc('getFtpSessions', agencyId, limit)) || [];
    },
    logTransfer: async (payload: Omit<FtpTransferLogRecord, 'id' | 'completedAt'> & { id?: string; completedAt?: number }): Promise<FtpTransferLogRecord> => {
      const res = await invokeDbRpc('logFtpTransfer', payload);
      notifyDbChanged(false, 'ftp');
      return res;
    },
    getTransferLogs: async (options?: {
      agencyId?: SupportedPlatform | string;
      sessionId?: string;
      limit?: number;
    }): Promise<FtpTransferLogRecord[]> => {
      return (await invokeDbRpc('getFtpTransferLogs', options || {})) || [];
    },
    clearLogs: async (agencyId?: SupportedPlatform | string): Promise<{ cleared: boolean }> => {
      const res = await invokeDbRpc('clearFtpLogs', agencyId);
      notifyDbChanged(true, 'ftp');
      return res;
    },
  };

  queues = {
    saveSnapshot: async <TItem = any, TTelemetry = Record<string, any>>(payload: {
      moduleId: string;
      sessionId?: string;
      batchStatus: 'idle' | 'running' | 'paused' | 'completed';
      agencyId?: SupportedPlatform | string;
      queue: TItem[];
      telemetry?: TTelemetry;
      updatedAt?: number;
    }): Promise<{
      moduleId: string;
      sessionId?: string;
      batchStatus: string;
      agencyId: string;
      updatedAt: number;
    }> => {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(
            `stockflow_ephemeral_queue_${payload.moduleId}`,
            JSON.stringify({
              ...payload,
              updatedAt: payload.updatedAt || Date.now(),
            })
          );
        }
      } catch {
        // ignore
      }
      return await invokeDbRpc('saveQueueSnapshot', payload);
    },
    getSnapshot: async <TItem = any, TTelemetry = Record<string, any>>(
      moduleId: string = 'ftp'
    ): Promise<{
      moduleId: string;
      sessionId?: string;
      batchStatus: 'idle' | 'running' | 'paused' | 'completed';
      agencyId: SupportedPlatform | string;
      queue: TItem[];
      telemetry: TTelemetry;
      updatedAt: number;
    } | null> => {
      const rpcSnap = await invokeDbRpc('getQueueSnapshot', moduleId);
      if (rpcSnap && Array.isArray(rpcSnap.queue) && rpcSnap.queue.length > 0) {
        return rpcSnap;
      }
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const raw = window.localStorage.getItem(`stockflow_ephemeral_queue_${moduleId}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.queue) && parsed.queue.length > 0) {
              return parsed;
            }
          }
        }
      } catch {
        // ignore
      }
      return rpcSnap || null;
    },
    clearSnapshot: async (
      moduleId: string = 'ftp'
    ): Promise<{ cleared: boolean; moduleId: string }> => {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(`stockflow_ephemeral_queue_${moduleId}`);
        }
      } catch {
        // ignore
      }
      return await invokeDbRpc('clearQueueSnapshot', moduleId);
    },
  };

  apiKeys = {
    toArray: async (): Promise<ApiKeyRecord[]> => {
      return (await invokeDbRpc('getApiKeys')) || [];
    },
    get: async (id: string): Promise<ApiKeyRecord | undefined> => {
      return await invokeDbRpc('getApiKey', id);
    },
    where: (field: keyof ApiKeyRecord) => ({
      equals: (val: any) => ({
        toArray: async (): Promise<ApiKeyRecord[]> => {
          const all: ApiKeyRecord[] = (await invokeDbRpc('getApiKeys')) || [];
          return all.filter((k) => k[field] === val);
        },
        delete: async (): Promise<void> => {
          if (field === 'providerId') {
            await invokeDbRpc('deleteApiKeysByProvider', val);
          } else {
            const all: ApiKeyRecord[] = (await invokeDbRpc('getApiKeys')) || [];
            for (const k of all) {
              if (k[field] === val) await invokeDbRpc('deleteApiKey', k.id);
            }
          }
      notifyDbChanged(true, 'keys');
        },
      }),
    }),
    put: async (record: ApiKeyRecord): Promise<string> => {
      const id = await invokeDbRpc('putApiKey', record);
      notifyDbChanged(true, 'keys');
      return id;
    },
    bulkPut: async (records: ApiKeyRecord[]): Promise<void> => {
      await invokeDbRpc('bulkPutApiKeys', records);
      notifyDbChanged(true, 'keys');
    },
    update: async (id: string, changes: Partial<ApiKeyRecord>): Promise<number> => {
      const res = await invokeDbRpc('updateApiKey', id, changes);
      notifyDbChanged(true, 'keys');
      return res;
    },
    delete: async (id: string): Promise<void> => {
      await invokeDbRpc('deleteApiKey', id);
      notifyDbChanged(true, 'keys');
    },
    clear: async (): Promise<void> => {
      await invokeDbRpc('clearApiKeys');
      notifyDbChanged(true, 'keys');
    },
  };

  batches = {
    toArray: async (): Promise<BatchRecord[]> => {
      return (await invokeDbRpc('getBatches')) || [];
    },
    get: async (id: string): Promise<BatchRecord | undefined> => {
      return await invokeDbRpc('getBatch', id);
    },
    put: async (record: BatchRecord): Promise<string> => {
      const id = await invokeDbRpc('putBatch', record);
      notifyDbChanged(false, 'master');
      return id;
    },
    delete: async (id: string): Promise<void> => {
      await invokeDbRpc('deleteBatch', id);
      notifyDbChanged(false, 'master');
    },
    clear: async (): Promise<void> => {
      await invokeDbRpc('clearBatches');
      notifyDbChanged(false, 'master');
    },
  };

  settings = {
    get: async (key: string): Promise<SettingItem | undefined> => {
      return await invokeDbRpc('getSetting', key);
    },
    put: async (item: SettingItem): Promise<string> => {
      const k = await invokeDbRpc('putSetting', item);
      notifyDbChanged(true, 'settings');
      return k;
    },
    clear: async (): Promise<void> => {
      await invokeDbRpc('clearSettings');
      notifyDbChanged(true, 'settings');
    },
  };

  async transaction<T>(_mode: string, _table: any, scope: () => Promise<T>): Promise<T> {
    const res = await scope();
    notifyDbChanged(true, 'all');
    return res;
  }
}

export const db = new StockFlowSqliteDB();

export const DEFAULT_PLATFORM_LIMITS: Record<SupportedPlatform, PlatformLimitConfig> = {
  adobe: {
    platformId: 'adobe',
    name: 'Adobe Stock',
    defaultBatchLimit: 50,
    limitPeriod: 'batch',
    description: 'Adobe Stock recommends 50-100 files per upload batch to prevent queue throttling.',
  },
  freepik: {
    platformId: 'freepik',
    name: 'Freepik',
    defaultBatchLimit: 20,
    limitPeriod: 'daily',
    description: 'Freepik limits daily uploads (Level 1: 20/day, Level 2: 50/day, Level 3: 100/day).',
  },
  shutterstock: {
    platformId: 'shutterstock',
    name: 'Shutterstock',
    defaultBatchLimit: 100,
    limitPeriod: 'batch',
    description: 'Shutterstock allows up to 500 files per batch, but 50-100 processes smoothest.',
  },
  vecteezy: {
    platformId: 'vecteezy',
    name: 'Vecteezy',
    defaultBatchLimit: 30,
    limitPeriod: 'daily',
    description: 'Vecteezy sets a daily limit of 30-50 pending review assets for new contributors.',
  },
  dreamstime: {
    platformId: 'dreamstime',
    name: 'Dreamstime',
    defaultBatchLimit: 50,
    limitPeriod: 'weekly',
    description: 'Dreamstime dynamic weekly upload ratio depends on your approval rating percentage.',
  },
  '123rf': {
    platformId: '123rf',
    name: '123RF',
    defaultBatchLimit: 100,
    limitPeriod: 'batch',
    description: '123RF bulk FTP uploads typically process in 100-image batches.',
  },
};

export const DEFAULT_SETTINGS: AppSettings = {
  routingStrategy: 'priority_tiered',
  providerPriority: ['gemini', 'groq', 'openrouter', 'mistral', 'cloudflare'],
  concurrencyLimit: 5,
  autoRetryOn429: true,
  maxRetriesPerImage: 3,
  thumbnailQuality: 0.75,
  thumbnailMaxSize: 512,
  defaultAiPrompt: 'professional microstock photo, high resolution, commercial quality',
  defaultAiModelName: 'Midjourney v6',
  providerModels: {
    gemini: 'gemini-3.1-flash-lite',
    groq: 'qwen/qwen3.8-27b',
    openrouter: 'google/gemini-2.0-flash-exp:free',
    mistral: 'pixtral-12b-2409',
    cloudflare: '@cf/meta/llama-3.2-11b-vision-instruct',
  },
  aiExecutionMode: 'cloud',
  localAiConfig: {
    baseUrl: 'http://127.0.0.1:1234/v1',
    modelId: 'default',
    timeoutSeconds: 300,
    hardwareProfile: 'auto',
  },
};

// Settings API
export async function getAppSettings(): Promise<AppSettings> {
  const item = await db.settings.get('app_settings');
  if (!item) {
    await db.settings.put({ key: 'app_settings', value: DEFAULT_SETTINGS });
    return DEFAULT_SETTINGS;
  }
  const merged: AppSettings = { ...DEFAULT_SETTINGS, ...item.value };
  if (!merged.providerPriority || !Array.isArray(merged.providerPriority) || merged.providerPriority.length === 0) {
    merged.providerPriority = DEFAULT_SETTINGS.providerPriority;
  }
  return merged;
}

export async function saveAppSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getAppSettings();
  const updated = { ...current, ...settings };
  await db.settings.put({ key: 'app_settings', value: updated });
  notifyDbChanged(true, 'settings');
  return updated;
}

export async function getAiExecutionMode(): Promise<AiExecutionMode> {
  const settings = await getAppSettings();
  return settings.aiExecutionMode || 'cloud';
}

export async function setAiExecutionMode(mode: AiExecutionMode): Promise<void> {
  await saveAppSettings({ aiExecutionMode: mode });
  notifyDbChanged(true, 'settings');
}

export async function getLocalAiConfig(): Promise<LocalAiConfig> {
  const settings = await getAppSettings();
  return settings.localAiConfig || DEFAULT_SETTINGS.localAiConfig!;
}

export async function saveLocalAiConfig(config: Partial<LocalAiConfig>): Promise<LocalAiConfig> {
  const current = await getLocalAiConfig();
  const updated: LocalAiConfig = { ...current, ...config };
  await saveAppSettings({ localAiConfig: updated });
  notifyDbChanged(true, 'settings');
  return updated;
}

// Universal Desktop SQLite Settings Storage
export async function getDesktopSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const item = await db.settings.get(key);
    if (item && item.value !== undefined && item.value !== null) {
      return item.value as T;
    }
  } catch (err) {
    console.warn('[DB] getDesktopSetting failed:', err);
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        try {
          return JSON.parse(stored) as T;
        } catch {
          return stored as unknown as T;
        }
      }
    }
  } catch {}
  return fallback;
}

export async function setDesktopSetting<T>(key: string, value: T): Promise<void> {
  try {
    await db.settings.put({ key, value });
  } catch (err) {
    console.warn('[DB] setDesktopSetting failed:', err);
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  } catch {}
}

// API Keys Operations
export async function getAllApiKeys(): Promise<ApiKeyRecord[]> {
  const records = await db.apiKeys.toArray();
  const decrypted = await Promise.all(
    records.map(async (r) => ({
      ...r,
      key: await decryptSecret(r.key),
    }))
  );
  return decrypted.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getApiKeysByProvider(providerId: ProviderType): Promise<ApiKeyRecord[]> {
  const records = await db.apiKeys.where('providerId').equals(providerId).toArray();
  const decrypted = await Promise.all(
    records.map(async (r) => ({
      ...r,
      key: await decryptSecret(r.key),
    }))
  );
  return decrypted.sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveApiKey(record: ApiKeyRecord): Promise<void> {
  const encKey = await encryptSecret(record.key);
  await db.apiKeys.put({ ...record, key: encKey });
}

export async function bulkInsertApiKeys(records: ApiKeyRecord[]): Promise<void> {
  const encRecords = await Promise.all(
    records.map(async (r) => ({
      ...r,
      key: await encryptSecret(r.key),
    }))
  );
  await db.apiKeys.bulkPut(encRecords);
}

export async function updateApiKey(id: string, changes: Partial<ApiKeyRecord>): Promise<void> {
  if (changes.key) {
    changes.key = await encryptSecret(changes.key);
  }
  await db.apiKeys.update(id, changes);
}

/**
 * Auto-migrates any plaintext API keys stored in SQLite to OS-level DPAPI encrypted format
 */
export async function migratePlaintextApiKeys(): Promise<void> {
  try {
    const keys = await db.apiKeys.toArray();
    for (const k of keys) {
      if (k.key && !k.key.startsWith('enc:')) {
        const encKey = await encryptSecret(k.key);
        if (encKey !== k.key) {
          await db.apiKeys.update(k.id, { key: encKey });
        }
      }
    }
  } catch (err) {
    console.warn('[DB] Plaintext key migration failed:', err);
  }
}

export async function removeApiKey(id: string): Promise<void> {
  await db.apiKeys.delete(id);
}

export async function removeAllKeysForProvider(providerId: ProviderType): Promise<void> {
  await db.apiKeys.where('providerId').equals(providerId).delete();
}

export async function resetAllKeyCooldowns(): Promise<void> {
  const keys = await db.apiKeys.toArray();
  for (const k of keys) {
    if (k.status === 'cooling_down' || k.status === 'exhausted_daily') {
      await db.apiKeys.update(k.id, {
        status: 'healthy',
        cooldownUntil: undefined,
        exhaustedUntil: undefined,
        requestsInWindow: [],
        dailyRequestCount: 0,
        activeRequests: 0,
      });
    }
  }
}

// Key Creation Helper
export function createApiKeyRecord(
  providerId: ProviderType,
  key: string,
  label?: string,
  modelId?: string,
  customRpm?: number,
  customRpd?: number
): ApiKeyRecord {
  const meta = PROVIDERS_META[providerId];
  const now = Date.now();
  const cleanKey = key.trim();

  // Reset at midnight UTC
  const tomorrowMidnight = new Date();
  tomorrowMidnight.setUTCHours(24, 0, 0, 0);

  return {
    id: crypto.randomUUID(),
    providerId,
    key: cleanKey,
    label: label || `${meta.name} Key #${Math.floor(1000 + Math.random() * 9000)}`,
    modelId: modelId || meta.defaultModelId,
    rpmLimit: customRpm || meta.defaultRpm,
    rpdLimit: customRpd || meta.defaultRpd,
    status: 'healthy',
    requestsInWindow: [],
    dailyRequestCount: 0,
    dailyResetTimestamp: tomorrowMidnight.getTime(),
    activeRequests: 0,
    lastUsedAt: 0,
    createdAt: now,
  };
}

// Backup & Restore
export interface KeyRingBackup {
  version: number;
  exportedAt: string;
  settings: AppSettings;
  keys: ApiKeyRecord[];
}

export async function exportKeyRingBackup(): Promise<string> {
  const keys = await getAllApiKeys();
  const settings = await getAppSettings();
  const backup: KeyRingBackup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    keys,
  };
  return JSON.stringify(backup, null, 2);
}

export async function importKeyRingBackup(jsonString: string): Promise<{ importedCount: number }> {
  const data = JSON.parse(jsonString) as KeyRingBackup;
  if (!data.keys || !Array.isArray(data.keys)) {
    throw new Error('Invalid backup file format: missing keys array');
  }

  if (data.settings) {
    await saveAppSettings(data.settings);
  }

  await db.apiKeys.bulkPut(data.keys);
  return { importedCount: data.keys.length };
}
