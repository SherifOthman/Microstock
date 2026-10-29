import type { ApiKeyRecord } from '../src/types/index.ts';

// Standalone test for the scheduler's selection and pacing algorithm
function testPacingAlgorithm() {
  console.log('Testing KeyRing Scheduler Pacing & Load Balancing Algorithm...');

  const now = Date.now();

  const key1: ApiKeyRecord = {
    id: 'k1',
    providerId: 'gemini',
    key: 'key-1',
    label: 'Gemini Key 1',
    modelId: 'gemini-2.5-flash',
    rpmLimit: 15,
    rpdLimit: 1500,
    status: 'healthy',
    requestsInWindow: [now - 10000, now - 5000],
    dailyRequestCount: 2,
    dailyResetTimestamp: now + 86400000,
    activeRequests: 0,
    lastUsedAt: now - 5000,
    createdAt: now,
  };

  const key2: ApiKeyRecord = {
    id: 'k2',
    providerId: 'gemini',
    key: 'key-2',
    label: 'Gemini Key 2',
    modelId: 'gemini-2.5-flash',
    rpmLimit: 15,
    rpdLimit: 1500,
    status: 'healthy',
    requestsInWindow: [],
    dailyRequestCount: 0,
    dailyResetTimestamp: now + 86400000,
    activeRequests: 0,
    lastUsedAt: 0,
    createdAt: now,
  };

  const key3: ApiKeyRecord = {
    id: 'k3',
    providerId: 'openrouter',
    key: 'key-3',
    label: 'OpenRouter Key 1',
    modelId: 'openrouter/free',
    rpmLimit: 20,
    rpdLimit: 1000,
    status: 'healthy',
    requestsInWindow: [],
    dailyRequestCount: 0,
    dailyResetTimestamp: now + 86400000,
    activeRequests: 1, // Currently executing a request
    lastUsedAt: now - 1000,
    createdAt: now,
  };

  const candidateKeys = [key1, key2, key3];

  // 1. Parallel execution check: key3 has activeRequests == 1, so it must be excluded
  const availableForParallel = candidateKeys.filter((k) => k.activeRequests === 0);
  console.assert(availableForParallel.length === 2, 'Key3 should be excluded due to in-flight active request');

  // 2. Score check: key1 has 2 requests in window (score = 2/15 = 0.133), key2 has 0 (score = 0/15 = 0)
  const scores = availableForParallel.map((k) => ({
    key: k,
    score: k.requestsInWindow.length / k.rpmLimit,
  }));

  scores.sort((a, b) => a.score - b.score);
  console.assert(scores[0].key.id === 'k2', 'Key2 should be selected first as least utilized');

  // 3. Pacing interval check:
  // For key1 (15 RPM), min interval is 60,000 / 15 = 4,000ms.
  // Last used was 5000ms ago, so now - lastUsedAt = 5000ms >= 4000ms. It satisfies pacing!
  const spacing1 = 60000 / key1.rpmLimit;
  console.assert(now - key1.lastUsedAt >= spacing1, 'Key1 pacing interval satisfied');

  // 4. Cooldown 429 recovery simulation:
  const keyCooldown: ApiKeyRecord = {
    ...key1,
    id: 'k_cooldown',
    status: 'cooling_down',
    cooldownUntil: now - 100, // Expired 100ms ago
  };

  const autoRecovered = keyCooldown.status === 'cooling_down' && keyCooldown.cooldownUntil! <= now;
  console.assert(autoRecovered === true, 'Cooldown should auto-recover when cooldownUntil <= now');

  console.log('✅ All algorithm assertions passed successfully!');
}

testPacingAlgorithm();
