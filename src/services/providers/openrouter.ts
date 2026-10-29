import { ModelInfo, ProviderType } from '../../types';
import { IVisionProvider, ProviderTestResult } from './types';
import { PROVIDERS_META, TEST_PIXEL_BASE64 } from '../../constants/providers';

export class OpenRouterAdapter implements IVisionProvider {
  readonly providerId: ProviderType = 'openrouter';

  async testKey(apiKey: string, modelId?: string): Promise<ProviderTestResult> {
    let targetModel = modelId || PROVIDERS_META.openrouter.defaultModelId;
    if (targetModel.startsWith('openrouter/free')) {
      targetModel = PROVIDERS_META.openrouter.defaultModelId;
    }
    const cleanKey = apiKey.trim();
    const startTime = performance.now();

    try {
      const url = 'https://openrouter.ai/api/v1/chat/completions';
      const payload = {
        model: targetModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Respond with OK if you see this image.' },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${TEST_PIXEL_BASE64}`,
                },
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
          'HTTP-Referer': 'https://stockassistant.local',
          'X-Title': 'Stock Assistant Microstock Generator',
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
        errorMsg = 'Verification timed out (30s). OpenRouter is currently slow or routing is busy.';
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
    const url = 'https://openrouter.ai/api/v1/models';
    const headers: Record<string, string> = {
      'HTTP-Referer': 'https://stockassistant.local',
      'X-Title': 'Stock Assistant Microstock Generator',
    };
    if (apiKey?.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      throw new Error(`Failed to fetch OpenRouter models: HTTP ${res.status}`);
    }

    const data = await res.json();
    const rawModels: any[] = data.data || [];

    // Filter to vision models: input_modalities includes 'image', or description/name has vision/multimodal
    // Explicitly exclude 'openrouter/free' because it is a text-only dynamic router
    const visionModels = rawModels.filter((m) => {
      if ((m.id || '').startsWith('openrouter/free')) return false;
      const modalities = m.architecture?.input_modalities || [];
      const idLower = (m.id || '').toLowerCase();
      const descLower = (m.description || '').toLowerCase();

      return (
        modalities.includes('image') ||
        idLower.includes('vision') ||
        idLower.includes('vl') ||
        idLower.includes('flash') ||
        idLower.includes('pixtral') ||
        descLower.includes('vision') ||
        descLower.includes('multimodal')
      );
    });

    // Filter to free vision models first (matching user request for free models)
    const freeVisionModels = visionModels.filter(
      (m) =>
        m.id.includes(':free') ||
        (m.pricing && m.pricing.prompt === '0' && m.pricing.completion === '0')
    );

    const candidates = freeVisionModels.length > 0 ? freeVisionModels : visionModels;

    return candidates
      .map((m) => {
        const isFree = m.pricing?.prompt === '0' || m.id.includes(':free');
        const priceTag = isFree
          ? 'Free'
          : `$${Number(m.pricing?.prompt || 0) * 1000000}/M tokens`;

        return {
          id: m.id,
          name: `${m.name || m.id} (${priceTag})`,
          isVision: true,
          description: m.description,
          contextLength: m.context_length,
          pricing: {
            prompt: String(m.pricing?.prompt || ''),
            completion: String(m.pricing?.completion || ''),
          },
        };
      })
      .sort((a, b) => {
        // Prioritize verified multimodal vision models at the top
        const visionPriority = [
          'google/gemini-2.0-flash-exp:free',
          'meta-llama/llama-3.2-11b-vision-instruct:free',
          'qwen/qwen-2.5-vl-72b-instruct:free',
          'mistralai/pixtral-12b:free',
        ];
        const idxA = visionPriority.indexOf(a.id);
        const idxB = visionPriority.indexOf(b.id);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;

        if (a.id.includes(':free') && !b.id.includes(':free')) return -1;
        if (!a.id.includes(':free') && b.id.includes(':free')) return 1;
        return a.id.localeCompare(b.id);
      });
  }

  async analyzeImage(
    apiKey: string,
    modelId: string,
    imageBase64: string,
    prompt: string,
    systemPrompt?: string
  ): Promise<string> {
    const cleanKey = apiKey.trim();
    let targetModel = modelId || PROVIDERS_META.openrouter.defaultModelId;
    if (targetModel.startsWith('openrouter/free')) {
      targetModel = PROVIDERS_META.openrouter.defaultModelId;
    }
    const url = 'https://openrouter.ai/api/v1/chat/completions';

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
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cleanKey}`,
          'HTTP-Referer': 'https://stockassistant.local',
          'X-Title': 'Stock Assistant Microstock Generator',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000),
      });
    } catch (err: any) {
      if (err.name === 'TimeoutError' || String(err.message).includes('timed out')) {
        throw new Error(`OpenRouter inference timed out after 60s (${targetModel}). Failover will switch to backup.`);
      }
      throw err;
    }

    if (!res.ok) {
      let errText = `HTTP ${res.status} ${res.statusText}`;
      let retryAfterSeconds: number | undefined;

      const retryHeader = res.headers.get('retry-after');
      if (retryHeader) {
        retryAfterSeconds = parseInt(retryHeader, 10);
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
    const choice = data.choices?.[0]?.message;
    const text = choice?.content || choice?.reasoning || (choice as any)?.text;

    if (!text) {
      throw new Error('OpenRouter returned an empty message content');
    }

    return text;
  }
}
