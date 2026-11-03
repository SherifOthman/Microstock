import { useState, useEffect, useRef } from 'react';
import {
  ApiKeyRecord,
  AppSettings,
  BatchRecord,
  MasterMetadataRecord,
  PlatformLimitConfig,
  ProviderType,
  SupportedPlatform,
} from '../types';
import { PROVIDERS_META } from '../constants/providers';
import { encryptSecret } from '../services/desktop/secureStorage';

export interface SettingItem {
  key: string;
  value: any;
}

// ============================================================================
// Reactive Change Notification Bus (Throttled to prevent render storms)
// ============================================================================
type DbChangeListener = () => void;
const dbListeners = new Set<DbChangeListener>();
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
let lastNotifyTime = 0;
const THROTTLE_MS = 120;

export function subscribeToDbChanges(listener: DbChangeListener): () => void {
  dbListeners.add(listener);
  return () => {
    dbListeners.delete(listener);
  };
}

export function notifyDbChanged(immediate = false): void {
  const fire = () => {
    lastNotifyTime = Date.now();
    notifyTimer = null;
    dbListeners.forEach((fn) => {
      try {
        fn();
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
    notifyTimer = setTimeout(fire, Math.max(16, THROTTLE_MS - elapsed));
  }
}

/**
 * Reactive hook for querying the SQLite IPC bridge (drop-in replacement for useLiveQuery)
 */
export function useSqliteQuery<T>(
  querier: () => Promise<T> | T,
  deps: any[] = [],
  defaultValue?: T
): T | undefined {
  const [data, setData] = useState<T | undefined>(defaultValue);
  const mountedRef = useRef(true);
  const querierRef = useRef(querier);
  querierRef.current = querier;

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    const runQuery = async () => {
      try {
        const res = await querierRef.current();
        if (!cancelled && mountedRef.current) {
          setData(res);
        }
      } catch (err) {
        console.warn('[useSqliteQuery] Query failed:', err);
      }
    };

    runQuery();
    const unsub = subscribeToDbChanges(runQuery);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      unsub();
    };
  }, deps);

  return data;
}

// ============================================================================
// In-Memory Fallback Store (Used when running Vitest unit tests outside Electron)
// ============================================================================
const testMemoryStore = {
  masterRecords: new Map<string, MasterMetadataRecord>(),
  apiKeys: new Map<string, ApiKeyRecord>(),
  batches: new Map<string, BatchRecord>(),
  settings: new Map<string, SettingItem>(),
};

async function invokeDbRpc(method: string, ...args: any[]): Promise<any> {
  if (typeof window !== 'undefined' && window.electronAPI?.db?.invoke) {
    return await window.electronAPI.db.invoke(method, ...args);
  }

  // Fallback for Node / Vitest unit test environments
  switch (method) {
    case 'getDbInfo':
      return { dbPath: ':memory:', engine: 'test-memory' };
    case 'getMasterRecords':
      return Array.from(testMemoryStore.masterRecords.values()).sort(
        (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
      );
    case 'getMasterRecord':
      return testMemoryStore.masterRecords.get(args[0]);
    case 'countMasterRecords':
      return testMemoryStore.masterRecords.size;
    case 'putMasterRecord': {
      const rec = args[0] as MasterMetadataRecord;
      testMemoryStore.masterRecords.set(rec.id, { ...rec });
      return rec.id;
    }
    case 'bulkPutMasterRecords': {
      for (const r of (args[0] || []) as MasterMetadataRecord[]) {
        testMemoryStore.masterRecords.set(r.id, { ...r });
      }
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
    case 'deleteMasterRecord':
      testMemoryStore.masterRecords.delete(args[0]);
      return;
    case 'bulkDeleteMasterRecords':
      for (const id of args[0] || []) testMemoryStore.masterRecords.delete(id);
      return;
    case 'clearMasterRecords':
      testMemoryStore.masterRecords.clear();
      return;
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
    default:
      return undefined;
  }
}

// ============================================================================
// SQLite Relational Client Bridge (Drop-in Async Table Interface)
// ============================================================================
export class StockFlowSqliteDB {
  masterRecords = {
    toArray: async (): Promise<MasterMetadataRecord[]> => {
      return (await invokeDbRpc('getMasterRecords')) || [];
    },
    orderBy: (_field: keyof MasterMetadataRecord) => ({
      toArray: async (): Promise<MasterMetadataRecord[]> => {
        return (await invokeDbRpc('getMasterRecords')) || [];
      },
    }),
    filter: (predicate: (rec: MasterMetadataRecord) => boolean) => ({
      toArray: async (): Promise<MasterMetadataRecord[]> => {
        const all: MasterMetadataRecord[] = (await invokeDbRpc('getMasterRecords')) || [];
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
          notifyDbChanged(true);
        },
      }),
    }),
    put: async (record: ApiKeyRecord): Promise<string> => {
      const id = await invokeDbRpc('putApiKey', record);
      notifyDbChanged();
      return id;
    },
    bulkPut: async (records: ApiKeyRecord[]): Promise<void> => {
      await invokeDbRpc('bulkPutApiKeys', records);
      notifyDbChanged(true);
    },
    update: async (id: string, changes: Partial<ApiKeyRecord>): Promise<number> => {
      const res = await invokeDbRpc('updateApiKey', id, changes);
      notifyDbChanged();
      return res;
    },
    delete: async (id: string): Promise<void> => {
      await invokeDbRpc('deleteApiKey', id);
      notifyDbChanged(true);
    },
    clear: async (): Promise<void> => {
      await invokeDbRpc('clearApiKeys');
      notifyDbChanged(true);
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
      notifyDbChanged();
      return id;
    },
    delete: async (id: string): Promise<void> => {
      await invokeDbRpc('deleteBatch', id);
      notifyDbChanged();
    },
    clear: async (): Promise<void> => {
      await invokeDbRpc('clearBatches');
      notifyDbChanged();
    },
  };

  settings = {
    get: async (key: string): Promise<SettingItem | undefined> => {
      return await invokeDbRpc('getSetting', key);
    },
    put: async (item: SettingItem): Promise<string> => {
      const k = await invokeDbRpc('putSetting', item);
      notifyDbChanged();
      return k;
    },
    clear: async (): Promise<void> => {
      await invokeDbRpc('clearSettings');
      notifyDbChanged();
    },
  };

  async transaction<T>(_mode: string, _table: any, scope: () => Promise<T>): Promise<T> {
    const res = await scope();
    notifyDbChanged();
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
  return updated;
}

// API Keys Operations
export async function getAllApiKeys(): Promise<ApiKeyRecord[]> {
  const records = await db.apiKeys.toArray();
  return records.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getApiKeysByProvider(providerId: ProviderType): Promise<ApiKeyRecord[]> {
  const records = await db.apiKeys.where('providerId').equals(providerId).toArray();
  return records.sort((a, b) => a.createdAt - b.createdAt);
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
