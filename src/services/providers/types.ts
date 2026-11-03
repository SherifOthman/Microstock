import { ModelInfo, ProviderType } from '../../types';

export interface ProviderTestResult {
  success: boolean;
  latencyMs: number;
  error?: string;
  warning?: string;
  statusCode?: number;
  modelUsed: string;
}

export interface IVisionProvider {
  readonly providerId: ProviderType;
  testKey(apiKey: string, modelId?: string): Promise<ProviderTestResult>;
  fetchModels(apiKey: string): Promise<ModelInfo[]>;
  analyzeImage(
    apiKey: string,
    modelId: string,
    imageBase64: string,
    prompt: string,
    systemPrompt?: string,
    signal?: AbortSignal
  ): Promise<string>;
}

/**
 * Combines an optional caller AbortSignal with a hard timeout signal, returning a cleanup function
 * to clear internal timers and prevent memory leaks.
 */
export function combineAbortSignals(
  externalSignal?: AbortSignal,
  timeoutMs = 20000
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    const timeoutErr = new Error(`AI Provider request timed out (${Math.round(timeoutMs / 1000)}s) — signal timed out`);
    timeoutErr.name = 'TimeoutError';
    (timeoutErr as any).status = 408;
    (timeoutErr as any).isTimeout = true;
    controller.abort(timeoutErr);
  }, timeoutMs);

  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason || new Error('Request aborted'));
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      controller.abort(externalSignal.reason || new Error('Request aborted'));
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    },
  };
}

