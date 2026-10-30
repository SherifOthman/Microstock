import { ModelInfo, ProviderType } from '../../types';
import { IVisionProvider, ProviderTestResult } from './types';
import { PROVIDERS_META, TEST_PIXEL_BASE64 } from '../../constants/providers';

export class MistralAdapter implements IVisionProvider {
  readonly providerId: ProviderType = 'mistral';

  async testKey(apiKey: string, modelId?: string): Promise<ProviderTestResult> {
    const targetModel = modelId || PROVIDERS_META.mistral.defaultModelId;
    const cleanKey = apiKey.trim();
    const startTime = performance.now();

    try {
      const url = 'https://api.mistral.ai/v1/chat/completions';
      const payload = {
        model: targetModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Respond with OK if you see this 1x1 image.' },
              {
                type: 'image_url',
                image_url: `data:image/png;base64,${TEST_PIXEL_BASE64}`,
              },
            ],
          },
        ],
        max_tokens: 10,
        temperature: 0.1,
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cleanKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (!res.ok) {
        let errorMsg = `HTTP ${res.status} ${res.statusText}`;
        try {
          const errData = await res.json();
          if (errData.message) errorMsg = errData.message;
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

  async fetchModels(apiKey: string): Promise<ModelInfo[]> {
    const cleanKey = apiKey.trim();
    const url = 'https://api.mistral.ai/v1/models';

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${cleanKey}`,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch Mistral models: HTTP ${res.status}`);
    }

    const data = await res.json();
    const rawModels: any[] = data.data || [];

    // Filter to pixtral/vision models
    return rawModels
      .filter((m) => {
        const idLower = (m.id || '').toLowerCase();
        return idLower.includes('pixtral') || idLower.includes('vision');
      })
      .map((m) => ({
        id: m.id,
        name: m.id,
        isVision: true,
        description: m.description,
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
    const targetModel = modelId || PROVIDERS_META.mistral.defaultModelId;
    const url = 'https://api.mistral.ai/v1/chat/completions';

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
          image_url: `data:image/jpeg;base64,${imageBase64}`,
        },
      ],
    });

    const payload: any = {
      model: targetModel,
      messages,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      let errText = `HTTP ${res.status} ${res.statusText}`;
      let retryAfterSeconds: number | undefined;

      const retryHeader = res.headers.get('retry-after');
      if (retryHeader) retryAfterSeconds = parseInt(retryHeader, 10);

      try {
        const errJson = await res.json();
        if (errJson.message) errText = errJson.message;
      } catch {}

      const error: any = new Error(errText);
      error.status = res.status;
      error.retryAfterSeconds = retryAfterSeconds;
      throw error;
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error('Mistral returned an empty response content');
    }

    return text;
  }
}
