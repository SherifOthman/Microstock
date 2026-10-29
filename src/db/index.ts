import Dexie, { type EntityTable } from 'dexie';
import {
  ApiKeyRecord,
  AppSettings,
  AssetTrackerRecord,
  BatchRecord,
  MasterMetadataRecord,
  PlatformLimitConfig,
  PlatformStatusInfo,
  PlatformUploadStatus,
  ProviderType,
  SupportedPlatform,
} from '../types';
import { PROVIDERS_META, PROVIDER_ORDER } from '../constants/providers';

export interface SettingItem {
  key: string;
  value: any;
}

export class StockAssistantDB extends Dexie {
  apiKeys!: EntityTable<ApiKeyRecord, 'id'>;
  batches!: EntityTable<BatchRecord, 'id'>;
  masterRecords!: EntityTable<MasterMetadataRecord, 'id'>;
  settings!: EntityTable<SettingItem, 'key'>;
  trackerRecords!: EntityTable<AssetTrackerRecord, 'id'>;

  constructor() {
    super('StockAssistantDB');
    this.version(1).stores({
      apiKeys: 'id, providerId, status, lastUsedAt, createdAt',
      batches: 'id, createdAt, status',
      masterRecords: 'id, batchId, filename, status, isAiGenerated, createdAt',
      settings: 'key',
    });
    this.version(2).stores({
      trackerRecords: 'id, filename, mediaType, updatedAt, createdAt',
    });
  }
}

export const db = new StockAssistantDB();

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
  await db.apiKeys.put(record);
}

export async function bulkInsertApiKeys(records: ApiKeyRecord[]): Promise<void> {
  await db.apiKeys.bulkPut(records);
}

export async function updateApiKey(id: string, changes: Partial<ApiKeyRecord>): Promise<void> {
  await db.apiKeys.update(id, changes);
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

  // Restore settings if present
  if (data.settings) {
    await saveAppSettings(data.settings);
  }

  // Insert or overwrite keys
  await db.apiKeys.bulkPut(data.keys);
  return { importedCount: data.keys.length };
}

// ============================================================================
// Stock Distribution Tracker Operations
// ============================================================================

export function createInitialPlatformStatuses(): Record<SupportedPlatform, PlatformStatusInfo> {
  const now = Date.now();
  return {
    adobe: { status: 'not_uploaded', updatedAt: now },
    freepik: { status: 'not_uploaded', updatedAt: now },
    shutterstock: { status: 'not_uploaded', updatedAt: now },
    vecteezy: { status: 'not_uploaded', updatedAt: now },
    dreamstime: { status: 'not_uploaded', updatedAt: now },
    '123rf': { status: 'not_uploaded', updatedAt: now },
  };
}

export async function getAllTrackerRecords(): Promise<AssetTrackerRecord[]> {
  const records = await db.trackerRecords.toArray();
  return records.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getTrackerRecord(id: string): Promise<AssetTrackerRecord | undefined> {
  return await db.trackerRecords.get(id);
}

export async function saveTrackerRecord(record: AssetTrackerRecord): Promise<void> {
  await db.trackerRecords.put(record);
}

export async function bulkSaveTrackerRecords(records: AssetTrackerRecord[]): Promise<void> {
  await db.trackerRecords.bulkPut(records);
}

export async function updateAssetPlatformStatus(
  id: string,
  platform: SupportedPlatform,
  status: PlatformUploadStatus,
  notes?: string
): Promise<void> {
  const existing = await db.trackerRecords.get(id);
  if (!existing) return;

  const now = Date.now();
  const updatedPlatforms = {
    ...existing.platforms,
    [platform]: {
      status,
      updatedAt: now,
      notes: notes !== undefined ? notes : existing.platforms[platform]?.notes,
    },
  };

  await db.trackerRecords.update(id, {
    platforms: updatedPlatforms,
    updatedAt: now,
  });
}

export async function bulkUpdateAssetPlatformStatus(
  ids: string[],
  platform: SupportedPlatform,
  status: PlatformUploadStatus
): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.trackerRecords, async () => {
    for (const id of ids) {
      const existing = await db.trackerRecords.get(id);
      if (existing) {
        existing.platforms[platform] = {
          status,
          updatedAt: now,
        };
        existing.updatedAt = now;
        await db.trackerRecords.put(existing);
      }
    }
  });
}

export async function deleteTrackerRecord(id: string): Promise<void> {
  await db.trackerRecords.delete(id);
}

export async function bulkDeleteTrackerRecords(ids: string[]): Promise<void> {
  await db.trackerRecords.bulkDelete(ids);
}

export async function exportTrackerBackup(): Promise<string> {
  const records = await getAllTrackerRecords();
  const settings = await getAppSettings();
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      platformLimits: settings.platformLimits,
      trackerRecords: records,
    },
    null,
    2
  );
}

export async function importTrackerBackup(jsonString: string): Promise<{ importedCount: number }> {
  const data = JSON.parse(jsonString);
  if (!data.trackerRecords || !Array.isArray(data.trackerRecords)) {
    throw new Error('Invalid tracker backup format: missing trackerRecords array');
  }

  if (data.platformLimits) {
    await saveAppSettings({ platformLimits: data.platformLimits });
  }

  await db.trackerRecords.bulkPut(data.trackerRecords);
  return { importedCount: data.trackerRecords.length };
}
