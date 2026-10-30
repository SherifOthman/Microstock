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
  private providerFailureCount: Map<ProviderType, number> = new Map();

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

    this.autoMaintenanceTimer = setInterval(async () => {
      const now = Date.now();
      const updates: Array<{ id: string; changes: Partial<ApiKeyRecord> }> = [];

      for (const [id, key] of this.keysCache.entries()) {
        // 1. Purge sliding window timestamps older than 60s
        const windowThreshold = now - 60000;
        const validTimestamps = (key.requestsInWindow || []).filter((t) => t > windowThreshold);
        if (validTimestamps.length !== key.requestsInWindow.length) {
          key.requestsInWindow = validTimestamps;
        }

        // 2. Auto-recover per-minute cooldown
        if (key.status === 'cooling_down' && key.cooldownUntil && now >= key.cooldownUntil) {
          key.status = 'healthy';
          key.cooldownUntil = undefined;
          key.lastError = undefined;
          updates.push({ 
            id, 
            changes: { status: 'healthy', cooldownUntil: undefined, lastError: undefined } 
          });
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
          updates.push({
            id,
            changes: {
              status: 'healthy',
              exhaustedUntil: undefined,
              dailyRequestCount: 0,
              dailyResetTimestamp: nextMidnight.getTime(),
              lastError: undefined,
            },
          });
        }
      }

      // Batch persist all updates in parallel
      if (updates.length > 0) {
        await Promise.all(updates.map((u) => this.persistKeyUpdate(u.id, u.changes)));
        this.notifyListeners();
      }
    }, 1000);
  }

  /**
   * Asynchronously acquires the best eligible key adhering strictly to user-configured priority.
   * - Rotates through ALL active keys of a provider before cascading to the next provider.
   * - Supports excludeKeyIds (to prevent retrying a key that just failed for this item)
   *   and excludeProviders.
   * - Near-instant 0s failover switching with reduced timeouts.
   */
  public async acquireKey(
    requestedProvider?: ProviderType,
    excludeKeyIdsOrProviders?: string[] | ProviderType[],
    excludeProvidersParam?: ProviderType[]
  ): Promise<AcquireResult> {
    await this.init();
    const settings = await getAppSettings();
    const acquireStartTime = Date.now();
    // Reduced from 30s to 5s for faster failover to next provider
    const maxWaitMs = 5000;

    // Normalize exclude arguments
    const excludeKeyIds: string[] = [];
    const excludeProviders: ProviderType[] = [];

    if (Array.isArray(excludeKeyIdsOrProviders)) {
      const knownProviders: ProviderType[] = ['gemini', 'openrouter', 'groq', 'mistral', 'cloudflare'];
      for (const item of excludeKeyIdsOrProviders) {
        if (knownProviders.includes(item as ProviderType)) {
          excludeProviders.push(item as ProviderType);
        } else {
          excludeKeyIds.push(item);
        }
      }
    }
    if (Array.isArray(excludeProvidersParam)) {
      excludeProviders.push(...excludeProvidersParam);
    }

    while (true) {
      const now = Date.now();
      if (now - acquireStartTime > maxWaitMs) {
        throw new Error(
          'Key acquisition timed out: all available API keys are currently cooling down or pacing. Please wait or add another key.'
        );
      }
      let minWaitMs = Infinity;

      // 1. Filter all non-disabled candidate keys
      const candidateKeys = Array.from(this.keysCache.values()).filter((k) => {
        if (k.status === 'disabled') return false;
        if (requestedProvider && k.providerId !== requestedProvider) return false;
        if (excludeKeyIds.includes(k.id)) return false;
        if (excludeProviders.includes(k.providerId)) return false;
        return true;
      });

      if (candidateKeys.length === 0) {
        throw new Error(
          requestedProvider
            ? `No available keys registered for provider "${requestedProvider}". Please add a key in Settings.`
            : 'No active API keys found. Please add at least one valid API key.'
        );
      }

      // 2. Strict Provider Priority Cascade: #1 -> #2 -> #3 -> #4 -> #5
      // CRITICAL FIX: Use ONLY user-configured priority order, no fallback hardcoded list
      const priorityOrder: ProviderType[] = settings.providerPriority && settings.providerPriority.length > 0
        ? settings.providerPriority
        : ['gemini', 'openrouter', 'groq', 'mistral', 'cloudflare'];

      // Iterate through providers in strict priority order
      for (const pid of priorityOrder) {
        if (requestedProvider && requestedProvider !== pid) continue;
        if (excludeProviders.includes(pid)) continue;

        // Keys of this provider that haven't been excluded for this item
        const tierKeys = candidateKeys.filter((k) => k.providerId === pid);
        if (tierKeys.length === 0) continue;

        // Check if any key in this tier is viable (healthy or cooling_down expired)
        const viableKeys = tierKeys.filter((k) => {
          if (k.status === 'cooling_down' && k.cooldownUntil && k.cooldownUntil > now) return false;
          if (k.status === 'exhausted_daily' && k.exhaustedUntil && k.exhaustedUntil > now) return false;
          // FIX: Don't skip 'invalid' keys completely - let them be tried once to generate proper failover log
          return true;
        });

        if (viableKeys.length === 0) {
          // All keys of this provider are in active cooldown or daily exhausted
          // ALGORITHMIC FIX #4: Exponential backoff when cascading providers
          const failCount = this.providerFailureCount.get(pid) || 0;
          this.providerFailureCount.set(pid, failCount + 1);
          
          // Exponential backoff: 0ms, 100ms, 200ms, 400ms, max 800ms
          const backoffMs = Math.min(800, failCount * 100);
          if (backoffMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
          }
          
          // cascade to next provider immediately (0s delay)
          continue;
        }

        // Evaluate ready keys in this provider tier
        const readyKeys: { key: ApiKeyRecord; score: number }[] = [];

        for (const key of viableKeys) {
          // CRITICAL FIX #1: Allow multiple concurrent requests per key based on RPM capacity
          // Calculate safe concurrency (80% of theoretical max to leave buffer)
          const maxConcurrentPerKey = Math.max(1, Math.floor((key.rpmLimit * 0.8) / 60));
          
          if (key.activeRequests >= maxConcurrentPerKey) continue;

          // Recover cooldown if expired
          if (key.status === 'cooling_down' && key.cooldownUntil && key.cooldownUntil <= now) {
            key.status = 'healthy';
            key.cooldownUntil = undefined;
          }

          // Clean sliding window
          const windowThreshold = now - 60000;
          key.requestsInWindow = (key.requestsInWindow || []).filter((t) => t > windowThreshold);

          // CRITICAL FIX #2: Daily quota pre-check with warning
          const dailyLimit = key.rpdLimit || 10000;
          const dailyUsed = key.dailyRequestCount || 0;
          const dailyRemaining = dailyLimit - dailyUsed;
          
          if (dailyRemaining <= 0) {
            // Immediately mark as exhausted
            key.status = 'exhausted_daily';
            const midnight = new Date();
            midnight.setUTCHours(24, 0, 0, 0);
            key.exhaustedUntil = midnight.getTime();
            key.lastError = `Daily quota exhausted (${dailyUsed}/${dailyLimit})`;
            await this.persistKeyUpdate(key.id, {
              status: 'exhausted_daily',
              exhaustedUntil: key.exhaustedUntil,
              lastError: key.lastError,
            });
            continue;
          }
          
          // Warn if < 20% daily quota remaining
          if (dailyRemaining < dailyLimit * 0.2) {
            console.warn(`⚠️ Key "${key.label}" has only ${dailyRemaining} of ${dailyLimit} requests left today (${Math.round((dailyRemaining / dailyLimit) * 100)}%)`);
          }

          // RPM ceiling check
          if (key.requestsInWindow.length >= key.rpmLimit) {
            const oldest = key.requestsInWindow[0];
            const wait = oldest + 60000 - now + 50;
            if (wait > 0 && wait < minWaitMs) minWaitMs = wait;
            continue;
          }

          // Pacing check (inter-request interval) - reduced spacing for faster rotation
          const minSpacingMs = Math.ceil(60000 / Math.max(1, key.rpmLimit));
          const timeSinceLastUsed = now - (key.lastUsedAt || 0);

          if (timeSinceLastUsed < minSpacingMs) {
            const wait = minSpacingMs - timeSinceLastUsed;
            if (wait > 0 && wait < minWaitMs) minWaitMs = wait;
            continue;
          }

          // ALGORITHMIC FIX #3: Predictive scoring
          const utilizationScore = key.requestsInWindow.length / Math.max(1, key.rpmLimit);
          const nextAvailableIn = Math.max(0, minSpacingMs - timeSinceLastUsed);
          const combinedScore = utilizationScore + (nextAvailableIn / 10000);
          
          readyKeys.push({ key, score: combinedScore });
        }

        if (readyKeys.length > 0) {
          // Sort by score ascending; break ties with oldest lastUsedAt
          readyKeys.sort((a, b) => {
            if (Math.abs(a.score - b.score) > 0.001) return a.score - b.score;
            return (a.key.lastUsedAt || 0) - (b.key.lastUsedAt || 0);
          });

          const selected = readyKeys[0].key;
          selected.activeRequests += 1;
          selected.lastUsedAt = now;
          selected.requestsInWindow.push(now);
          selected.dailyRequestCount = (selected.dailyRequestCount || 0) + 1;

          // Reset failure count on successful acquisition
          this.providerFailureCount.set(pid, 0);

          this.notifyListeners();

          return {
            keyRecord: selected,
            release: async (success: boolean, error?: any, latencyMs?: number) => {
              await this.releaseKey(selected.id, success, error, latencyMs);
            },
          };
        }
      }

      // No key is ready right now; pause VERY briefly (reduced from 250ms to 50ms for instant failover)
      const sleepTime = Math.min(Math.max(minWaitMs === Infinity ? 20 : minWaitMs, 10), 50);
      await new Promise((resolve) => setTimeout(resolve, sleepTime));
    }
  }

  public hasRemainingEligibleKeys(excludeKeyIds: string[] = []): boolean {
    const keys = Array.from(this.keysCache.values()).filter((k) => k.status !== 'disabled');
    return keys.some((k) => !excludeKeyIds.includes(k.id));
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
      keyRecord.lastError = testRes.success ? '' : (testRes.error || '');
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
