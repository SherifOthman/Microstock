import { ApiKeyRecord, AppSettings, ProviderType } from '../../types';
import { db, getAllApiKeys, getAppSettings, updateApiKey } from '../../db';
import { getProviderAdapter } from '../providers';

export interface KeyRingStateListener {
  (keys: ApiKeyRecord[]): void;
}

export interface AcquireResult {
  keyRecord: ApiKeyRecord;
  release: (success: boolean, error?: any, latencyMs?: number) => Promise<void>;
}

export class KeyRingScheduler {
  private static instance: KeyRingScheduler;
  private keysCache: Map<string, ApiKeyRecord> = new Map();
  private listeners: Set<KeyRingStateListener> = new Set();
  private isInitialized = false;
  private autoMaintenanceTimer?: any;

  private constructor() {
    this.startMaintenanceLoop();
  }

  public static getInstance(): KeyRingScheduler {
    if (!KeyRingScheduler.instance) {
      KeyRingScheduler.instance = new KeyRingScheduler();
    }
    return KeyRingScheduler.instance;
  }

  /**
   * Initializes the scheduler by loading all keys from IndexedDB
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    await this.refreshKeys();
    this.isInitialized = true;
  }

  /**
   * Reloads keys from Dexie into the active memory cache
   */
  public async refreshKeys(): Promise<ApiKeyRecord[]> {
    const records = await getAllApiKeys();
    records.sort((a, b) => a.createdAt - b.createdAt);
    this.keysCache.clear();
    for (const record of records) {
      // Ensure in-memory activeRequests is 0 on fresh load
      this.keysCache.set(record.id, {
        ...record,
        activeRequests: 0,
        requestsInWindow: record.requestsInWindow || [],
      });
    }
    this.notifyListeners();
    return Array.from(this.keysCache.values());
  }

  /**
   * Subscribe to live state updates (cooldown countdowns, active in-flight counts, etc.)
   */
  public subscribe(listener: KeyRingStateListener): () => void {
    this.listeners.add(listener);
    listener(Array.from(this.keysCache.values()));
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const list = Array.from(this.keysCache.values());
    this.listeners.forEach((fn) => {
      try {
        fn(list);
      } catch (e) {
        console.error('Error notifying KeyRing listener', e);
      }
    });
  }

  /**
   * Background maintenance loop (runs every second):
   * Cleans sliding windows, auto-recovers expired cooldowns, resets daily quotas at midnight UTC.
   */
  private startMaintenanceLoop(): void {
    if (this.autoMaintenanceTimer) clearInterval(this.autoMaintenanceTimer);

    this.autoMaintenanceTimer = setInterval(() => {
      const now = Date.now();
      let hasChanges = false;

      for (const [id, key] of this.keysCache.entries()) {
        // 1. Purge sliding window timestamps older than 60s
        const windowThreshold = now - 60000;
        const validTimestamps = (key.requestsInWindow || []).filter((t) => t > windowThreshold);
        if (validTimestamps.length !== key.requestsInWindow.length) {
          key.requestsInWindow = validTimestamps;
          hasChanges = true;
        }

        // 2. Auto-recover per-minute cooldown
        if (key.status === 'cooling_down' && key.cooldownUntil && now >= key.cooldownUntil) {
          key.status = 'healthy';
          key.cooldownUntil = undefined;
          key.lastError = undefined;
          hasChanges = true;
          this.persistKeyUpdate(id, { status: 'healthy', cooldownUntil: undefined, lastError: undefined });
        }

        // 3. Auto-recover daily exhaustion
        if (key.status === 'exhausted_daily' && key.exhaustedUntil && now >= key.exhaustedUntil) {
          const nextMidnight = new Date();
          nextMidnight.setUTCHours(24, 0, 0, 0);

          key.status = 'healthy';
          key.exhaustedUntil = undefined;
          key.dailyRequestCount = 0;
          key.dailyResetTimestamp = nextMidnight.getTime();
          key.lastError = undefined;
          hasChanges = true;
          this.persistKeyUpdate(id, {
            status: 'healthy',
            exhaustedUntil: undefined,
            dailyRequestCount: 0,
            dailyResetTimestamp: nextMidnight.getTime(),
            lastError: undefined,
          });
        }
      }

      if (hasChanges) {
        this.notifyListeners();
      }
    }, 1000);
  }

  /**
   * Asynchronously acquires the best eligible key.
   * Enables TRUE PARALLEL EXECUTION across distinct keys:
   * A key is eligible if key.activeRequests === 0 (1 concurrent in-flight request per distinct key),
   * allowing up to N parallel requests across N healthy keys.
   *
   * In priority_tiered mode:
   * Cascades strictly according to settings.providerPriority. Provider #1 is exhausted/cooled down
   * before falling over to Provider #2, #3, etc.
   * On retry, excludeProviders allows skipping failed providers.
   */
  public async acquireKey(
    requestedProvider?: ProviderType,
    excludeProviders?: ProviderType[]
  ): Promise<AcquireResult> {
    await this.init();
    const settings = await getAppSettings();
    const acquireStartTime = Date.now();
    const maxWaitMs = 45000;

    while (true) {
      const now = Date.now();
      if (now - acquireStartTime > maxWaitMs) {
        throw new Error(
          'Key acquisition timed out: all available API keys are currently cooling down or pacing. Please wait or add another key.'
        );
      }
      let minWaitMs = Infinity;

      // 1. Filter all non-disabled/non-invalid candidate keys
      const candidateKeys = Array.from(this.keysCache.values()).filter((k) => {
        if (k.status === 'disabled' || k.status === 'invalid') return false;
        if (requestedProvider && k.providerId !== requestedProvider) return false;
        return true;
      });

      if (candidateKeys.length === 0) {
        throw new Error(
          requestedProvider
            ? `No available keys registered for provider "${requestedProvider}". Please add a key in Settings.`
            : 'No active API keys found. Please add at least one valid API key.'
        );
      }

      // If excludeProviders is provided (e.g. from failed retry attempt), filter out those providers.
      // If all candidate keys would be excluded, fallback to candidateKeys so queue doesn't lock.
      let pool = candidateKeys;
      if (excludeProviders && excludeProviders.length > 0) {
        const withoutExcluded = candidateKeys.filter((k) => !excludeProviders.includes(k.providerId));
        if (withoutExcluded.length > 0) {
          pool = withoutExcluded;
        }
      }

      // 2. In priority_tiered mode, isolate the highest-priority provider tier that is NOT cooling down/exhausted
      let activeKeys = pool;
      if (settings.routingStrategy === 'priority_tiered' && !requestedProvider) {
        const fullPriority = Array.from(
          new Set([...(settings.providerPriority || []), 'gemini', 'groq', 'openrouter', 'mistral', 'cloudflare'] as ProviderType[])
        );

        // Find the first provider tier that has keys in pool that are not currently in cooldown or daily exhausted
        let chosenTierProvider: ProviderType | null = null;
        for (const pid of fullPriority) {
          const tierKeys = pool.filter((k) => k.providerId === pid);
          if (tierKeys.length === 0) continue;

          // Check if any key in this tier is viable (healthy or only waiting on pacing/in-flight, NOT in active cooldown or daily exhausted)
          const hasViableKey = tierKeys.some((k) => {
            if (k.status === 'cooling_down' && k.cooldownUntil && k.cooldownUntil > now) return false;
            if (k.status === 'exhausted_daily' && k.exhaustedUntil && k.exhaustedUntil > now) return false;
            return true;
          });

          if (hasViableKey) {
            chosenTierProvider = pid;
            break;
          }
        }

        if (chosenTierProvider) {
          activeKeys = pool.filter((k) => k.providerId === chosenTierProvider);
        }
      }

      // 3. Evaluate immediate eligibility across activeKeys
      const eligibleKeys: { key: ApiKeyRecord; score: number }[] = [];

      for (const key of activeKeys) {
        // Skip keys currently executing a request (1 concurrent request per distinct key)
        if (key.activeRequests >= 1) continue;

        // Skip keys cooling down or exhausted
        if (key.status === 'cooling_down') {
          if (key.cooldownUntil && key.cooldownUntil > now) {
            const wait = key.cooldownUntil - now;
            if (wait < minWaitMs) minWaitMs = wait;
            continue;
          } else {
            key.status = 'healthy';
            key.cooldownUntil = undefined;
          }
        }

        if (key.status === 'exhausted_daily') {
          if (key.exhaustedUntil && key.exhaustedUntil > now) continue;
          key.status = 'healthy';
          key.dailyRequestCount = 0;
        }

        // Clean sliding window
        const windowThreshold = now - 60000;
        key.requestsInWindow = (key.requestsInWindow || []).filter((t) => t > windowThreshold);

        // RPM ceiling check
        if (key.requestsInWindow.length >= key.rpmLimit) {
          const oldest = key.requestsInWindow[0];
          const wait = oldest + 60000 - now + 50; // wait until oldest timestamp drops out of window
          if (wait > 0 && wait < minWaitMs) minWaitMs = wait;
          continue;
        }

        // Inter-request pacing interval: Delta t >= 60,000 / rpmLimit
        const minSpacingMs = Math.ceil(60000 / Math.max(1, key.rpmLimit));
        const timeSinceLastUsed = now - (key.lastUsedAt || 0);

        if (timeSinceLastUsed < minSpacingMs) {
          const wait = minSpacingMs - timeSinceLastUsed;
          if (wait > 0 && wait < minWaitMs) minWaitMs = wait;
          continue;
        }

        // Key is immediately eligible! Calculate utilization score S (lower is better)
        const utilizationScore = key.requestsInWindow.length / Math.max(1, key.rpmLimit);

        eligibleKeys.push({
          key,
          score: utilizationScore,
        });
      }

      // If at least one key is eligible right now, select the best one
      if (eligibleKeys.length > 0) {
        // Sort by score ascending; break ties with oldest lastUsedAt (fairness)
        eligibleKeys.sort((a, b) => {
          if (Math.abs(a.score - b.score) > 0.001) return a.score - b.score;
          return (a.key.lastUsedAt || 0) - (b.key.lastUsedAt || 0);
        });

        const selected = eligibleKeys[0].key;

        // Mark key as active
        selected.activeRequests += 1;
        selected.lastUsedAt = now;
        selected.requestsInWindow.push(now);
        selected.dailyRequestCount = (selected.dailyRequestCount || 0) + 1;

        this.notifyListeners();

        // Return lease with release callback
        return {
          keyRecord: selected,
          release: async (success: boolean, error?: any, latencyMs?: number) => {
            await this.releaseKey(selected.id, success, error, latencyMs);
          },
        };
      }

      // No key is ready right now; pause for minWaitMs without blocking
      const sleepTime = Math.min(Math.max(minWaitMs === Infinity ? 250 : minWaitMs, 50), 3000);
      await new Promise((resolve) => setTimeout(resolve, sleepTime));
    }
  }

  /**
   * Releases an acquired key lease, updating latency, cooldowns, and error states
   */
  private async releaseKey(
    keyId: string,
    success: boolean,
    error?: any,
    latencyMs?: number
  ): Promise<void> {
    const key = this.keysCache.get(keyId);
    if (!key) return;

    key.activeRequests = Math.max(0, key.activeRequests - 1);
    if (latencyMs !== undefined) key.lastLatencyMs = latencyMs;

    const now = Date.now();

    if (success) {
      key.lastError = undefined;
      await this.persistKeyUpdate(keyId, {
        activeRequests: key.activeRequests,
        lastLatencyMs: key.lastLatencyMs,
        lastUsedAt: key.lastUsedAt,
        requestsInWindow: key.requestsInWindow,
        dailyRequestCount: key.dailyRequestCount,
        lastError: undefined,
      });
    } else if (error) {
      const status = error.status || error.statusCode;
      const errorMsg = error.message || String(error);

      // Classify error type
      const isDailyQuota =
        status === 429 &&
        (errorMsg.toLowerCase().includes('quota') ||
          errorMsg.toLowerCase().includes('per-day') ||
          errorMsg.toLowerCase().includes('daily') ||
          errorMsg.includes('RESOURCE_EXHAUSTED'));

      const isRateLimit = status === 429 && !isDailyQuota;
      const isAuthOrModel = status === 401 || status === 403 || status === 404;

      if (isDailyQuota) {
        // Next midnight UTC
        const midnight = new Date();
        midnight.setUTCHours(24, 0, 0, 0);

        key.status = 'exhausted_daily';
        key.exhaustedUntil = midnight.getTime();
        key.lastError = `Daily quota exhausted: ${errorMsg}`;

        await this.persistKeyUpdate(keyId, {
          status: 'exhausted_daily',
          exhaustedUntil: key.exhaustedUntil,
          lastError: key.lastError,
        });
      } else if (isRateLimit) {
        // Specific cooldown timer
        const retrySeconds = error.retryAfterSeconds || 30;
        key.status = 'cooling_down';
        key.cooldownUntil = now + retrySeconds * 1000;
        key.lastError = `Rate limit hit (429). Cooldown: ${retrySeconds}s`;

        await this.persistKeyUpdate(keyId, {
          status: 'cooling_down',
          cooldownUntil: key.cooldownUntil,
          lastError: key.lastError,
        });
      } else if (isAuthOrModel) {
        key.status = 'invalid';
        key.lastError = `HTTP ${status}: ${errorMsg}`;

        await this.persistKeyUpdate(keyId, {
          status: 'invalid',
          lastError: key.lastError,
        });
      } else {
        key.lastError = errorMsg;
        await this.persistKeyUpdate(keyId, {
          lastError: key.lastError,
        });
      }
    }

    this.notifyListeners();
  }

  private async persistKeyUpdate(keyId: string, changes: Partial<ApiKeyRecord>): Promise<void> {
    try {
      await updateApiKey(keyId, changes);
    } catch (e) {
      console.error('Failed to persist key update in Dexie', e);
    }
  }

  /**
   * Resets all keys back to healthy status
   */
  public async resetAllCooldowns(): Promise<void> {
    const now = Date.now();
    for (const [id, key] of this.keysCache.entries()) {
      key.status = 'healthy';
      key.cooldownUntil = undefined;
      key.exhaustedUntil = undefined;
      key.requestsInWindow = [];
      key.activeRequests = 0;
      key.lastError = undefined;
      await this.persistKeyUpdate(id, {
        status: 'healthy',
        cooldownUntil: undefined,
        exhaustedUntil: undefined,
        requestsInWindow: [],
        activeRequests: 0,
        lastError: undefined,
      });
    }
    this.notifyListeners();
  }

  /**
   * Executes a live parallel health check on all healthy keys
   */
  public async testAllKeys(
    onProgress?: (tested: number, total: number, result: ApiKeyRecord) => void
  ): Promise<ApiKeyRecord[]> {
    await this.init();
    const keys = Array.from(this.keysCache.values()).filter((k) => k.status !== 'disabled');
    let testedCount = 0;

    const promises = keys.map(async (keyRecord) => {
      const adapter = getProviderAdapter(keyRecord.providerId);
      const testRes = await adapter.testKey(keyRecord.key, keyRecord.modelId);

      const updatedStatus = testRes.success
        ? 'healthy'
        : testRes.statusCode === 429
        ? 'cooling_down'
        : 'invalid';

      keyRecord.status = updatedStatus;
      keyRecord.lastLatencyMs = testRes.latencyMs;
      keyRecord.lastError = testRes.error;
      keyRecord.cooldownUntil =
        testRes.statusCode === 429 ? Date.now() + 30000 : undefined;

      await this.persistKeyUpdate(keyRecord.id, {
        status: keyRecord.status,
        lastLatencyMs: keyRecord.lastLatencyMs,
        lastError: keyRecord.lastError,
        cooldownUntil: keyRecord.cooldownUntil,
      });

      testedCount++;
      if (onProgress) onProgress(testedCount, keys.length, keyRecord);
    });

    await Promise.all(promises);
    this.notifyListeners();
    return Array.from(this.keysCache.values());
  }
}

export const keyRingScheduler = KeyRingScheduler.getInstance();
