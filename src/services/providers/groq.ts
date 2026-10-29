import { ModelInfo, ProviderType } from '../../types';
import { IVisionProvider, ProviderTestResult } from './types';
import { PROVIDERS_META, TEST_PIXEL_BASE64 } from '../../constants/providers';

export class GroqAdapter implements IVisionProvider {
  readonly providerId: ProviderType = 'groq';

  async testKey(apiKey: string, modelId?: string): Promise<ProviderTestResult> {
    const targetModel = modelId || PROVIDERS_META.groq.defaultModelId;
    const cleanKey = apiKey.trim();
    const startTime = performance.now();

    try {
      const url = 'https://api.groq.com/openai/v1/chat/completions';
      const payload = {
        model: targetModel,
        messages: [
          {
            role: 'user',
            content: 'Respond with OK',
          },
        ],
        max_tokens: 5,
        temperature: 0.1,
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cleanKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (!res.ok) {
        let errorMsg = `HTTP ${res.status} ${res.statusText}`;
        try {
          const errData = await res.json();
          if (errData.error?.message) {
            errorMsg = errData.error.message;
          }
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
        errorMsg = 'Verification timed out (30s). Groq endpoint took too long to respond.';
      }
      return {
        success: false,
        latencyMs: Math.round(performance.now() - startTime),
        error: errorMsg,
        modelUsed: targetModel,
      };
    }
  }

  async fetchModels(apiKey: string): Promise<ModelInfo[]> {
    const cleanKey = apiKey.trim();
    const url = 'https://api.groq.com/openai/v1/models';

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${cleanKey}`,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      let errText = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.error?.message) errText = errJson.error.message;
      } catch {}
      throw new Error(`Failed to fetch Groq models: ${errText}`);
    }

    const data = await res.json();
    const rawModels: any[] = data.data || [];

    // Filter to active Groq vision models (qwen/qwen3.8-27b is the sole multimodal model)
    const visionModels = rawModels.filter((m) => {
      const idLower = (m.id || '').toLowerCase();
      return idLower === 'qwen/qwen3.8-27b' || idLower.includes('vision') || idLower.includes('vl');
    });

    if (visionModels.length === 0) {
      return [
        {
          id: 'qwen/qwen3.8-27b',
          name: 'Qwen 3.8 27B Vision (Free)',
          isVision: true,
          contextLength: 32768,
        },
      ];
    }

    return visionModels
      .map((m) => ({
        id: m.id,
        name: m.id === 'qwen/qwen3.8-27b' ? 'Qwen 3.8 27B Vision (Free)' : m.id,
        isVision: true,
        contextLength: m.context_window,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async analyzeImage(
    apiKey: string,
    modelId: string,
    imageBase64: string,
    prompt: string,
    systemPrompt?: string
  ): Promise<string> {
    const cleanKey = apiKey.trim();
    const targetModel = modelId || PROVIDERS_META.groq.defaultModelId;
    const url = 'https://api.groq.com/openai/v1/chat/completions';

    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${imageBase64}`,
          },
        },
      ],
    });

    const payload: any = {
      model: targetModel,
      messages,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cleanKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000),
      });
    } catch (err: any) {
      if (err.name === 'TimeoutError' || String(err.message).includes('timed out')) {
        throw new Error(`Groq inference timed out after 60s (${targetModel}). Failover will switch to backup.`);
      }
      throw err;
    }

    if (!res.ok) {
      let errText = `HTTP ${res.status} ${res.statusText}`;
      let retryAfterSeconds: number | undefined;

      const retryHeader = res.headers.get('retry-after');
      const resetHeader = res.headers.get('x-ratelimit-reset-requests');

      if (retryHeader) {
        retryAfterSeconds = parseInt(retryHeader, 10);
      } else if (resetHeader) {
        // e.g., '14s' or '14.2s'
        const match = resetHeader.match(/(\d+(\.\d+)?)s?/);
        if (match) retryAfterSeconds = Math.ceil(parseFloat(match[1]));
      }

      try {
        const errJson = await res.json();
        if (errJson.error?.message) {
          errText = errJson.error.message;
        }
      } catch {}

      const error: any = new Error(errText);
      error.status = res.status;
      error.retryAfterSeconds = retryAfterSeconds;
      throw error;
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error('Groq returned an empty response content');
    }

    return text;
  }
}
