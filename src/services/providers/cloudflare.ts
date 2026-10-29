import { ModelInfo, ProviderType } from '../../types';
import { IVisionProvider, ProviderTestResult } from './types';
import { PROVIDERS_META, TEST_PIXEL_BASE64 } from '../../constants/providers';

export class CloudflareAdapter implements IVisionProvider {
  readonly providerId: ProviderType = 'cloudflare';

  /**
   * Cloudflare requires an Account ID and an API Token.
   * Can be provided as "accountId:apiToken" or resolved from localStorage if entered separately.
   */
  public parseCredentials(apiKey: string): { accountId: string; apiToken: string } {
    const trimmed = apiKey.trim();
    const parts = trimmed.split(':');
    if (parts.length >= 2) {
      return { accountId: parts[0].trim(), apiToken: parts.slice(1).join(':').trim() };
    }

    // Fallback: check localStorage for saved Cloudflare Account ID
    const savedAccountId = typeof window !== 'undefined' ? localStorage.getItem('stock_cf_account_id') || '' : '';
    if (savedAccountId && trimmed) {
      return { accountId: savedAccountId.trim(), apiToken: trimmed };
    }

    return { accountId: '', apiToken: trimmed };
  }

  async testKey(apiKey: string, modelId?: string): Promise<ProviderTestResult> {
    const targetModel = modelId || PROVIDERS_META.cloudflare.defaultModelId;
    const { accountId, apiToken } = this.parseCredentials(apiKey);
    const startTime = performance.now();

    if (!accountId || !apiToken) {
      return {
        success: false,
        latencyMs: 0,
        error: 'Cloudflare requires both Account ID and API Token.',
        modelUsed: targetModel,
      };
    }

    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${targetModel}`;
      const payload = {
        prompt: 'Reply with OK if you see this 1x1 image.',
        image: Array.from(Uint8Array.from(atob(TEST_PIXEL_BASE64), (c) => c.charCodeAt(0))),
        max_tokens: 10,
      };

      let res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      // Handle Meta / Llama model license agreement prompt ('agree') automatically
      if (!res.ok) {
        try {
          const errData = await res.json();
          const errMsg = errData.errors?.[0]?.message || '';
          if (res.status === 403 && (errMsg.includes("'agree'") || errData.errors?.[0]?.code === 5016)) {
            // Submit agreement prompt
            await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiToken}`,
              },
              body: JSON.stringify({ prompt: 'agree' }),
              signal: AbortSignal.timeout(15000),
            });

            // Re-attempt verification
            res = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiToken}`,
              },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(30000),
            });
          }
        } catch {}
      }

      const latencyMs = Math.round(performance.now() - startTime);

      if (!res.ok) {
        let errorMsg = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          if (errData.errors?.[0]?.message) errorMsg = errData.errors[0].message;
        } catch {}
        return {
          success: false,
          latencyMs,
          statusCode: res.status,
          error: errorMsg,
          modelUsed: targetModel,
        };
      }

      return {
        success: true,
        latencyMs,
        statusCode: 200,
        modelUsed: targetModel,
      };
    } catch (err: any) {
      let errorMsg = err.message || 'Network connection failed';
      if (err.name === 'TimeoutError' || String(errorMsg).includes('timed out')) {
        errorMsg = 'Cloudflare verification timed out (30s).';
      }
      return {
        success: false,
        latencyMs: Math.round(performance.now() - startTime),
        error: errorMsg,
        modelUsed: targetModel,
      };
    }
  }

  async fetchModels(apiKey?: string): Promise<ModelInfo[]> {
    const verifiedModels: ModelInfo[] = [
      {
        id: '@cf/meta/llama-3.2-11b-vision-instruct',
        name: 'Meta Llama 3.2 11B Vision Instruct (Recommended • Fast & Free)',
        isVision: true,
        contextLength: 8192,
        description: 'Multimodal vision model by Meta hosted on Cloudflare edge LPUs.',
      },
      {
        id: '@cf/llava-hf/llava-1.5-7b-hf',
        name: 'LLaVA 1.5 7B Vision (HuggingFace Multimodal)',
        isVision: true,
        contextLength: 4096,
        description: 'Visual reasoning and feature extraction model.',
      },
    ];

    if (!apiKey) return verifiedModels;

    const { accountId, apiToken } = this.parseCredentials(apiKey);
    if (!accountId || !apiToken) return verifiedModels;

    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json();
        const rawList = data.result || [];
        const visionList = rawList
          .filter((m: any) =>
            m.name === '@cf/meta/llama-3.2-11b-vision-instruct' ||
            m.name === '@cf/llava-hf/llava-1.5-7b-hf' ||
            (m.name?.includes('vision') && !m.name?.includes('awq'))
          )
          .map((m: any) => ({
            id: m.name,
            name: m.name === '@cf/meta/llama-3.2-11b-vision-instruct'
              ? 'Meta Llama 3.2 11B Vision Instruct (Recommended)'
              : m.name === '@cf/llava-hf/llava-1.5-7b-hf'
              ? 'LLaVA 1.5 7B Vision (HuggingFace)'
              : m.name,
            isVision: true,
            description: m.description,
          }));

        if (visionList.length > 0) return visionList;
      }
    } catch {}

    return verifiedModels;
  }

  async analyzeImage(
    apiKey: string,
    modelId: string,
    imageBase64: string,
    prompt: string
  ): Promise<string> {
    const targetModel = modelId || PROVIDERS_META.cloudflare.defaultModelId;
    const { accountId, apiToken } = this.parseCredentials(apiKey);

    if (!accountId || !apiToken) {
      throw new Error('Cloudflare requires both Account ID and API Token.');
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${targetModel}`;
    const payload = {
      prompt,
      image: Array.from(Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0))),
    };

    let res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    });

    // Auto-agree handling if encountered during inference
    if (!res.ok && res.status === 403) {
      try {
        const errJson = await res.json();
        if (errJson.errors?.[0]?.message?.includes("'agree'")) {
          await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiToken}`,
            },
            body: JSON.stringify({ prompt: 'agree' }),
          });
          // Retry inference
          res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiToken}`,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(60000),
          });
        }
      } catch {}
    }

    if (!res.ok) {
      let errText = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.errors?.[0]?.message) errText = errJson.errors[0].message;
      } catch {}
      throw new Error(`Cloudflare Workers AI Error: ${errText}`);
    }

    const data = await res.json();
    const result = data.result?.response || data.result?.description || JSON.stringify(data.result);
    return result;
  }
}
