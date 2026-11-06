import { ApiKeyRecord, AppSettings, ProviderType } from '../../types';
import { db, getAllApiKeys, getAppSettings, updateApiKey, migratePlaintextApiKeys, subscribeToDbChanges } from '../../db';
import { getProviderAdapter } from '../providers';
import { decryptSecret } from '../desktop/secureStorage';

export type RoutingStrategy = 'priority' | 'round_robin';

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
  private isPersistingInternal = 0;
  private autoMaintenanceTimer?: any;
  private providerFailureCount: Map<ProviderType, number> = new Map();
  private routingMode: RoutingStrategy = 'priority';

  private constructor() {
    this.startMaintenanceLoop();
    subscribeToDbChanges(() => {
      if (this.isPersistingInternal === 0) {
        this.refreshKeys().catch(() => {});
      }
    }, ['keys']);
  }

  public static getInstance(): KeyRingScheduler {
    if (!KeyRingScheduler.instance) {
      KeyRingScheduler.instance = new KeyRingScheduler();
    }
    return KeyRingScheduler.instance;
  }

  public getRoutingMode(): RoutingStrategy {
    return this.routingMode;
  }

  public setRoutingMode(mode: RoutingStrategy): void {
    this.routingMode = mode;
    this.notifyListeners();
  }

  public async updateProviderModel(providerId: ProviderType, modelId: string): Promise<void> {
    const updates: Promise<void>[] = [];
    for (const [id, key] of this.keysCache.entries()) {
      if (key.providerId === providerId) {
        key.modelId = modelId;
        updates.push(this.persistKeyUpdate(id, { modelId }));
      }
    }
    await Promise.all(updates);
    this.notifyListeners();
  }

  /**
   * Initializes the scheduler by loading all keys from SQLite
   */
  public async init(): Promise<void> {
    if (!this.isInitialized) {
      await migratePlaintextApiKeys();
      this.isInitialized = true;
    }
    await this.refreshKeys();
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
      let candidateKeys = Array.from(this.keysCache.values()).filter((k) => {
        if (k.status === 'disabled') return false;
        if (requestedProvider && k.providerId !== requestedProvider) return false;
        if (excludeKeyIds.includes(k.id)) return false;
        if (excludeProviders.includes(k.providerId)) return false;
        return true;
      });

      // Fallback: If all available keys were excluded by per-item retry history (e.g. during a network outage),
      // allow retrying candidate keys so the underlying network error is reported rather than a misleading "No keys" error
      if (candidateKeys.length === 0 && excludeKeyIds.length > 0) {
        candidateKeys = Array.from(this.keysCache.values()).filter((k) => {
          if (k.status === 'disabled') return false;
          if (requestedProvider && k.providerId !== requestedProvider) return false;
          if (excludeProviders.includes(k.providerId)) return false;
          return true;
        });
      }

      if (candidateKeys.length === 0) {
        throw new Error(
          requestedProvider
            ? `No available keys registered for provider "${requestedProvider}". Please add a key in Settings.`
            : 'No active API keys found. Please add at least one valid API key.'
        );
      }

      // 2. Determine Provider Evaluation Order
      // When routingStrategy === 'interleaved', sort providers by lowest active/recent usage so all providers share load.
      // When routingStrategy === 'priority_tiered', follow user-configured priorityOrder and cascade immediately when a tier is cooling down or excluded.
      const basePriorityOrder: ProviderType[] =
        settings.providerPriority && settings.providerPriority.length > 0
          ? settings.providerPriority
          : ['gemini', 'openrouter', 'groq', 'mistral', 'cloudflare'];

      // Ensure all 5 providers are represented in basePriorityOrder
      const allProviders: ProviderType[] = ['gemini', 'openrouter', 'groq', 'mistral', 'cloudflare'];
      for (const p of allProviders) {
        if (!basePriorityOrder.includes(p)) basePriorityOrder.push(p);
      }

      let priorityOrder = [...basePriorityOrder];
      if (settings.routingStrategy === 'interleaved' || this.routingMode === 'round_robin') {
        priorityOrder.sort((a, b) => {
          const aKeys = candidateKeys.filter((k) => k.providerId === a);
          const bKeys = candidateKeys.filter((k) => k.providerId === b);
          const aMinLastUsed = aKeys.length > 0 ? Math.min(...aKeys.map((k) => k.lastUsedAt || 0)) : Infinity;
          const bMinLastUsed = bKeys.length > 0 ? Math.min(...bKeys.map((k) => k.lastUsedAt || 0)) : Infinity;
          return aMinLastUsed - bMinLastUsed;
        });
      }

      // If excludeProviders filtered out all candidate keys, allow falling back to remaining candidate keys not in excludeKeyIds
      const hasKeysInNonExcludedProviders = candidateKeys.some((k) => !excludeProviders.includes(k.providerId));
      const effectiveExcludeProviders = hasKeysInNonExcludedProviders ? excludeProviders : [];

      // Iterate through providers in order
      for (const pid of priorityOrder) {
        if (requestedProvider && requestedProvider !== pid) continue;
        if (effectiveExcludeProviders.includes(pid)) continue;

        // Keys of this provider that haven't been excluded for this item
        const tierKeys = candidateKeys.filter((k) => k.providerId === pid);
        if (tierKeys.length === 0) continue;

        // Check if any key in this tier is viable (healthy or expired cooldown)
        const viableKeys = tierKeys.filter((k) => {
          if (k.status === 'cooling_down' && k.cooldownUntil && k.cooldownUntil > now) return false;
          if (k.status === 'exhausted_daily' && k.exhaustedUntil && k.exhaustedUntil > now) return false;
          return true;
        });

        if (viableKeys.length === 0) {
          // All keys of this provider are in active cooldown or daily exhausted -> cascade immediately to next provider!
          for (const k of tierKeys) {
            if (k.status === 'cooling_down' && k.cooldownUntil && k.cooldownUntil > now) {
              const wait = k.cooldownUntil - now;
              if (wait > 0 && wait < minWaitMs) minWaitMs = wait;
            }
          }
          continue;
        }

        // Evaluate ready keys in this provider tier
        const readyKeys: { key: ApiKeyRecord; score: number }[] = [];

        for (const key of viableKeys) {
          // Allow multiple concurrent requests per key based on RPM capacity
          const maxConcurrentPerKey = Math.max(1, Math.floor((key.rpmLimit * 0.8) / 60));

          if (key.activeRequests >= maxConcurrentPerKey) continue;

          // Recover cooldown if expired
          if (key.status === 'cooling_down' && key.cooldownUntil && key.cooldownUntil <= now) {
            key.status = 'healthy';
            key.cooldownUntil = undefined;
            key.lastError = undefined;
          }

          // Clean sliding window
          const windowThreshold = now - 60000;
          key.requestsInWindow = (key.requestsInWindow || []).filter((t) => t > windowThreshold);

          // Daily quota pre-check
          const dailyLimit = key.rpdLimit || 10000;
          const dailyUsed = key.dailyRequestCount || 0;
          const dailyRemaining = dailyLimit - dailyUsed;

          if (dailyRemaining <= 0) {
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

          // RPM ceiling check
          if (key.requestsInWindow.length >= key.rpmLimit) {
            const oldest = key.requestsInWindow[0];
            const wait = oldest + 60000 - now + 50;
            if (wait > 0 && wait < minWaitMs) minWaitMs = wait;
            continue;
          }

          // Pacing check (inter-request interval)
          const minSpacingMs = Math.ceil(60000 / Math.max(1, key.rpmLimit));
          const timeSinceLastUsed = now - (key.lastUsedAt || 0);

          if (timeSinceLastUsed < minSpacingMs) {
            const wait = minSpacingMs - timeSinceLastUsed;
            if (wait > 0 && wait < minWaitMs) minWaitMs = wait;
            continue;
          }

          // Predictive scoring: prefer least-recently used and lowest window utilization
          const utilizationScore = key.requestsInWindow.length / Math.max(1, key.rpmLimit);
          const nextAvailableIn = Math.max(0, minSpacingMs - timeSinceLastUsed);
          const combinedScore = utilizationScore + nextAvailableIn / 10000;

          readyKeys.push({ key, score: combinedScore });
        }

        if (readyKeys.length > 0) {
          // Sort by oldest lastUsedAt first so all keys within a provider rotate evenly (1 -> 2 -> 3 -> 4 -> 5)
          readyKeys.sort((a, b) => {
            const lastA = a.key.lastUsedAt || 0;
            const lastB = b.key.lastUsedAt || 0;
            if (lastA !== lastB) return lastA - lastB;
            return a.score - b.score;
          });

          const selected = readyKeys[0].key;
          selected.activeRequests += 1;
          selected.lastUsedAt = now;
          selected.requestsInWindow.push(now);
          selected.dailyRequestCount = (selected.dailyRequestCount || 0) + 1;

          this.providerFailureCount.set(pid, 0);
          this.notifyListeners();

          const plainKey = await decryptSecret(selected.key);
          const leasedRecord: ApiKeyRecord = {
            ...selected,
            key: plainKey,
          };

          return {
            keyRecord: leasedRecord,
            release: async (success: boolean, error?: any, latencyMs?: number) => {
              await this.releaseKey(selected.id, success, error, latencyMs);
            },
          };
        }
      }

      // Pause briefly before re-checking
      const sleepTime = Math.min(Math.max(minWaitMs === Infinity ? 25 : minWaitMs, 15), 50);
      await new Promise((resolve) => setTimeout(resolve, sleepTime));
    }
  }

  public hasRemainingEligibleKeys(excludeKeyIds: string[] = []): boolean {
    const keys = Array.from(this.keysCache.values()).filter((k) => k.status !== 'disabled');
    return keys.some((k) => !excludeKeyIds.includes(k.id));
  }

  /**
   * Releases an acquired key lease, updating latency, cooldowns, and error states.
   * When a model/provider returns 503 High Demand or Overloaded, all sibling keys using that
   * overloaded provider+model are placed into cooldown so the scheduler immediately cascades
   * to the next provider (e.g. OpenRouter, Groq, Mistral, Cloudflare).
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
      key.status = 'healthy';
      key.cooldownUntil = undefined;
      key.lastError = undefined;
      await this.persistKeyUpdate(keyId, {
        status: 'healthy',
        cooldownUntil: undefined,
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
      const errorMsgLower = errorMsg.toLowerCase();

      // Classify error type
      const isDailyQuota =
        status === 429 &&
        (errorMsgLower.includes('quota') ||
          errorMsgLower.includes('per-day') ||
          errorMsgLower.includes('daily') ||
          errorMsg.includes('RESOURCE_EXHAUSTED'));

      const isServerOverload =
        status === 503 ||
        status === 502 ||
        status === 504 ||
        errorMsgLower.includes('high demand') ||
        errorMsgLower.includes('spikes in demand') ||
        errorMsgLower.includes('overloaded') ||
        errorMsgLower.includes('service unavailable') ||
        errorMsgLower.includes('unavailable') ||
        errorMsgLower.includes('currently busy');

      const isRateLimit = status === 429 && !isDailyQuota && !isServerOverload;

      const isTimeout =
        status === 408 ||
        Boolean(error.isTimeout) ||
        error.name === 'TimeoutError' ||
        error.name === 'AbortError' ||
        errorMsgLower.includes('timed out') ||
        errorMsgLower.includes('signal timed out');

      const isAuthOrModel =
        (status === 401 || status === 403 || status === 404) &&
        !errorMsgLower.includes('high demand') &&
        !errorMsgLower.includes('rate limit');

      if (isDailyQuota) {
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
      } else if (isServerOverload) {
        // Model/Provider-wide high demand (e.g. Gemini 503 "This model is currently experiencing high demand").
        // Cool down this key AND all sibling keys of the same provider+model so we immediately fail over to the next provider!
        const retrySeconds = error.retryAfterSeconds || 30;
        const cooldownUntil = now + retrySeconds * 1000;
        const formattedErr = `Model experiencing high demand (${status || 503}). Cooldown: ${retrySeconds}s — cascading to backup provider.`;

        const siblingUpdates: Promise<void>[] = [];
        for (const [sibId, sibKey] of this.keysCache.entries()) {
          if (
            sibKey.providerId === key.providerId &&
            sibKey.modelId === key.modelId &&
            sibKey.status !== 'disabled' &&
            sibKey.status !== 'invalid'
          ) {
            sibKey.status = 'cooling_down';
            sibKey.cooldownUntil = cooldownUntil;
            sibKey.lastError = sibId === keyId ? formattedErr : `Provider model high demand (${retrySeconds}s cooldown)`;
            siblingUpdates.push(
              this.persistKeyUpdate(sibId, {
                status: 'cooling_down',
                cooldownUntil,
                lastError: sibKey.lastError,
              })
            );
          }
        }
        await Promise.all(siblingUpdates);
      } else if (isRateLimit) {
        const retrySeconds = error.retryAfterSeconds || 30;
        key.status = 'cooling_down';
        key.cooldownUntil = now + retrySeconds * 1000;
        key.lastError = `Rate limit hit (429). Cooldown: ${retrySeconds}s`;

        await this.persistKeyUpdate(keyId, {
          status: 'cooling_down',
          cooldownUntil: key.cooldownUntil,
          lastError: key.lastError,
        });
      } else if (isTimeout) {
        const retrySeconds = 20;
        key.status = 'cooling_down';
        key.cooldownUntil = now + retrySeconds * 1000;
        key.lastError = `Request timed out. Cooldown: ${retrySeconds}s`;

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
    this.isPersistingInternal++;
    try {
      await updateApiKey(keyId, changes);
    } catch (e) {
      console.error('Failed to persist key update in SQLite', e);
    } finally {
      this.isPersistingInternal = Math.max(0, this.isPersistingInternal - 1);
    }
  }

  /**
   * Resets all keys back to healthy status
   */
  public async resetAllCooldowns(): Promise<void> {
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
      const plainKey = await decryptSecret(keyRecord.key);
      const testRes = await adapter.testKey(plainKey, keyRecord.modelId);
      const errLower = (testRes.error || '').toLowerCase();
      const isTransientBusy =
        testRes.statusCode === 429 ||
        testRes.statusCode === 503 ||
        testRes.statusCode === 408 ||
        errLower.includes('high demand') ||
        errLower.includes('overloaded') ||
        errLower.includes('timed out');

      const updatedStatus = testRes.success
        ? 'healthy'
        : isTransientBusy
        ? 'cooling_down'
        : 'invalid';

      keyRecord.status = updatedStatus;
      keyRecord.lastLatencyMs = testRes.latencyMs;
      keyRecord.lastError = testRes.success ? '' : (testRes.error || '');
      keyRecord.cooldownUntil = isTransientBusy ? Date.now() + 20000 : undefined;

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
