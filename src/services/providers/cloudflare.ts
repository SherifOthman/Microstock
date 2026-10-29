import { ModelInfo, ProviderType } from '../../types';
import { IVisionProvider, ProviderTestResult } from './types';
import { PROVIDERS_META, TEST_PIXEL_BASE64 } from '../../constants/providers';

export class CloudflareAdapter implements IVisionProvider {
  readonly providerId: ProviderType = 'cloudflare';

  // Cloudflare requires an Account ID and API Token, typically passed as account_id:api_token in the key field
  private parseCredentials(apiKey: string): { accountId: string; apiToken: string } {
    const parts = apiKey.trim().split(':');
    if (parts.length >= 2) {
      return { accountId: parts[0].trim(), apiToken: parts.slice(1).join(':').trim() };
    }
    return { accountId: '', apiToken: apiKey.trim() };
  }

  async testKey(apiKey: string, modelId?: string): Promise<ProviderTestResult> {
    const targetModel = modelId || PROVIDERS_META.cloudflare.defaultModelId;
    const { accountId, apiToken } = this.parseCredentials(apiKey);
    const startTime = performance.now();

    if (!accountId || !apiToken) {
      return {
        success: false,
        latencyMs: 0,
        error: 'Cloudflare requires "AccountID:APIToken" format in the key field.',
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

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

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
      return {
        success: false,
        latencyMs: Math.round(performance.now() - startTime),
        error: err.message || 'Network connection failed',
        modelUsed: targetModel,
      };
    }
  }

  async fetchModels(): Promise<ModelInfo[]> {
    return [
      {
        id: '@cf/meta/llama-3.2-11b-vision-instruct',
        name: 'Meta Llama 3.2 11B Vision Instruct',
        isVision: true,
        contextLength: 8192,
      },
    ];
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
      throw new Error('Cloudflare requires "AccountID:APIToken" format');
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${targetModel}`;
    const payload = {
      prompt,
      image: Array.from(Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0))),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(35000),
    });

    if (!res.ok) {
      let errText = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.errors?.[0]?.message) errText = errJson.errors[0].message;
      } catch {}
      throw new Error(errText);
    }

    const data = await res.json();
    const result = data.result?.response || data.result?.description || JSON.stringify(data.result);
    return result;
  }
}
