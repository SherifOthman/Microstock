import { ModelInfo } from '../../types';
import { combineAbortSignals } from './types';
import { SYSTEM_LOCAL_VISION_PROMPT } from '../ai/masterPrompt';

export interface LocalConnectionTestResult {
  success: boolean;
  latencyMs: number;
  detectedModels: string[];
  activeModel?: string;
  error?: string;
  statusCode?: number;
}

export class LocalAiAdapter {
  readonly providerId = 'local' as const;

  /**
   * Normalizes the base URL by trimming whitespace and stripping trailing slashes.
   */
  public normalizeBaseUrl(url: string): string {
    const trimmed = (url || '').trim();
    if (!trimmed) return 'http://127.0.0.1:1234/v1';
    return trimmed.replace(/\/+$/, '');
  }

  /**
   * Tests connectivity to the local LM Studio server via the standard GET /v1/models endpoint.
   */
  async testConnection(baseUrl: string, preferredModel?: string): Promise<LocalConnectionTestResult> {
    const normalizedUrl = this.normalizeBaseUrl(baseUrl);
    const modelsEndpoint = `${normalizedUrl}/models`;
    const startTime = performance.now();

    try {
      const res = await fetch(modelsEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer local-dummy-key',
        },
        signal: AbortSignal.timeout(6000),
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
          detectedModels: [],
          error: errorMsg,
        };
      }

      const data = await res.json().catch(() => null);
      const rawList: any[] = Array.isArray(data?.data) ? data.data : [];
      const detectedModels = rawList.map((m) => m?.id || String(m)).filter(Boolean);

      const activeModel =
        (preferredModel && detectedModels.includes(preferredModel) ? preferredModel : detectedModels[0]) ||
        'local-model';

      return {
        success: true,
        latencyMs,
        statusCode: 200,
        detectedModels,
        activeModel,
      };
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - startTime);
      let errorMsg = err.message || 'Cannot reach local server';
      if (err.name === 'TimeoutError' || String(errorMsg).includes('timed out')) {
        errorMsg = `Connection timed out (6s). Check if LM Studio is running on ${normalizedUrl}`;
      } else if (
        String(errorMsg).includes('ECONNREFUSED') ||
        String(errorMsg).includes('Failed to fetch') ||
        String(errorMsg).includes('NetworkError')
      ) {
        errorMsg = `Server unreachable at ${normalizedUrl}. Ensure LM Studio is open and the Local Server is running (Developer / Local Server tab).`;
      }

      return {
        success: false,
        latencyMs,
        detectedModels: [],
        error: errorMsg,
      };
    }
  }

  /**
   * Fetches models currently available or loaded in LM Studio.
   */
  async fetchModels(baseUrl: string): Promise<ModelInfo[]> {
    const normalizedUrl = this.normalizeBaseUrl(baseUrl);
    const modelsEndpoint = `${normalizedUrl}/models`;

    const res = await fetch(modelsEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer local-dummy-key',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch models from ${normalizedUrl}: HTTP ${res.status}`);
    }

    const data = await res.json();
    const rawList: any[] = Array.isArray(data?.data) ? data.data : [];
    return rawList.map((m) => ({
      id: m.id || String(m),
      name: m.id || String(m),
      isVision: true, // Treat loaded local models as multimodal
    }));
  }

  /**
   * Analyzes an image with an OpenAI-compatible multimodal prompt targeting the local endpoint.
   * Uses 100% standard OpenAI message format for flawless compatibility with vision models.
   */
  async analyzeImage(
    baseUrl: string,
    modelId: string,
    imageBase64: string,
    prompt: string,
    systemPrompt?: string,
    signal?: AbortSignal,
    timeoutMs = 60000
  ): Promise<string> {
    const normalizedUrl = this.normalizeBaseUrl(baseUrl);
    const chatEndpoint = `${normalizedUrl}/chat/completions`;

    const messages: any[] = [];
    const effectiveSystemPrompt = systemPrompt || SYSTEM_LOCAL_VISION_PROMPT;
    if (effectiveSystemPrompt) {
      messages.push({ role: 'system', content: effectiveSystemPrompt });
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

    const payload = {
      model: modelId || 'local-model',
      messages,
      temperature: 0.2,
      max_tokens: 1500,
    };

    const { signal: combinedSignal, cleanup } = combineAbortSignals(signal, timeoutMs);

    let res: Response;
    try {
      res = await fetch(chatEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer local-dummy-key',
        },
        body: JSON.stringify(payload),
        signal: combinedSignal,
      });
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError' || msg.toLowerCase().includes('timed out')) {
        const timeoutErr: any = new Error(
          `Local LM Studio inference timed out after ${Math.round(timeoutMs / 1000)}s (${modelId || 'local-model'}). Local models may need smaller context or GPU acceleration.`
        );
        timeoutErr.status = 408;
        timeoutErr.isTimeout = true;
        throw timeoutErr;
      }
      if (msg.includes('ECONNREFUSED') || msg.includes('Failed to fetch')) {
        throw new Error(`Cannot reach LM Studio on ${normalizedUrl}. Ensure the local server is started.`);
      }
      throw err;
    } finally {
      cleanup();
    }

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status} ${res.statusText}`;
      try {
        const errJson = await res.json();
        if (errJson.error?.message) {
          errorMsg = errJson.error.message;
        }
      } catch {}
      throw new Error(`LM Studio error: ${errorMsg}`);
    }

    const data = await res.json();
    let content = data.choices?.[0]?.message?.content || '';
    const reasoningContent = data.choices?.[0]?.message?.reasoning_content || '';

    // Fallback: If content is empty/truncated but model emitted JSON in reasoning_content
    if (!content.trim() && reasoningContent.trim()) {
      const jsonBlockMatch =
        reasoningContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
        reasoningContent.match(/(\{[\s\S]*\})/);
      if (jsonBlockMatch) {
        content = jsonBlockMatch[1] || jsonBlockMatch[0];
      } else {
        content = reasoningContent;
      }
    }

    // Strip any leaked <think>...</think> chain-of-thought blocks
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    if (!content) {
      if (data.error?.message) {
        throw new Error(`LM Studio error: ${data.error.message}`);
      }
      throw new Error('LM Studio returned empty completion content');
    }

    return content;
  }
}

export const localAiAdapter = new LocalAiAdapter();
