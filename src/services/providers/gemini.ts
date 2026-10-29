import { ModelInfo, ProviderType } from '../../types';
import { IVisionProvider, ProviderTestResult } from './types';
import { PROVIDERS_META, TEST_PIXEL_BASE64 } from '../../constants/providers';

export class GeminiAdapter implements IVisionProvider {
  readonly providerId: ProviderType = 'gemini';

  async testKey(apiKey: string, modelId?: string): Promise<ProviderTestResult> {
    const targetModel = modelId || PROVIDERS_META.gemini.defaultModelId;
    const cleanKey = apiKey.trim();
    const startTime = performance.now();

    try {
      // Step 1: Validate key authorization & token calculation (matching FreeMetadata probe)
      const countUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:countTokens?key=${cleanKey}`;
      const countRes = await fetch(countUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hello' }] }] }),
        signal: AbortSignal.timeout(15000),
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (!countRes.ok) {
        let errorMsg = `HTTP ${countRes.status} ${countRes.statusText}`;
        try {
          const errData = await countRes.json();
          if (errData.error?.message) {
            errorMsg = errData.error.message;
          }
        } catch {}
        return {
          success: false,
          latencyMs,
          statusCode: countRes.status,
          error: errorMsg,
          modelUsed: targetModel,
        };
      }

      // Step 2: Key is authentic (200 OK). Now probe generateContent to check project tier
      const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${cleanKey}`;
      const genRes = await fetch(genUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Respond OK' }] }],
          generationConfig: { maxOutputTokens: 5, temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (genRes.ok) {
        return {
          success: true,
          latencyMs,
          statusCode: 200,
          modelUsed: targetModel,
        };
      }

      const genData = await genRes.json().catch(() => ({}));
      const genError = genData.error?.message || '';

      // If Google returned free tier restricted for this project
      if (genError.includes('free tier is not available for this project')) {
        return {
          success: true, // Key is valid and authenticated
          latencyMs,
          statusCode: 200,
          modelUsed: targetModel,
          warning: 'Key verified & active (countTokens OK). Note: Google restricted free generation on this project (Verify birthdate on your Google Account or generate a fresh key in AI Studio, or use OpenRouter/Groq).',
        };
      }

      return {
        success: false,
        latencyMs,
        statusCode: genRes.status,
        error: genError || `HTTP ${genRes.status}`,
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;

    const res = await fetch(url);
    if (!res.ok) {
      let errText = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.error?.message) errText = errJson.error.message;
      } catch {}
      throw new Error(`Failed to fetch Gemini models: ${errText}`);
    }

    const data = await res.json();
    const rawModels: any[] = data.models || [];

    // Filter to generative models (gemini) supporting generateContent, excluding discontinued models
    const freePriority = [
      'gemini-3.1-flash-lite',
      'gemini-3.1-flash-lite-preview',
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite',
    ];

    return rawModels
      .filter((m) => {
        const name = (m.name || '').toLowerCase();
        const cleanId = name.replace(/^models\//, '');
        const methods = m.supportedGenerationMethods || [];
        // Skip discontinued or non-gemini models
        if (cleanId.includes('2.5') || cleanId.includes('1.5') || cleanId.includes('tts') || cleanId.includes('transcribe')) {
          return false;
        }
        return name.includes('gemini') && methods.includes('generateContent');
      })
      .map((m) => {
        const cleanId = m.name.replace(/^models\//, '');
        const isVision = true;
        let displayName = m.displayName || cleanId;
        if (cleanId === 'gemini-3.1-flash-lite') displayName = 'Gemini 3.1 Lite - 15 (Free)';
        else if (cleanId === 'gemini-3.1-flash-lite-preview') displayName = 'Gemini 3.1 Lite Preview (Free)';
        else if (cleanId === 'gemini-3.8-flash') displayName = 'Gemini 3.8 Flash (15 RPM)';
        else if (cleanId === 'gemini-3.5-flash-lite') displayName = 'Gemini 3.5 Flash Lite (Free)';

        return {
          id: cleanId,
          name: displayName,
          isVision,
          description: m.description,
          contextLength: m.inputTokenLimit,
        };
      })
      .sort((a, b) => {
        const aIdx = freePriority.indexOf(a.id);
        const bIdx = freePriority.indexOf(b.id);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
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
    const targetModel = modelId || PROVIDERS_META.gemini.defaultModelId;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${cleanKey}`;

    const payload: any = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    };

    if (systemPrompt) {
      payload.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(35000),
    });

    if (!res.ok) {
      let errText = `HTTP ${res.status} ${res.statusText}`;
      let retryAfterSeconds: number | undefined;

      try {
        const errJson = await res.json();
        if (errJson.error?.message) {
          errText = errJson.error.message;
        }
        if (errText.includes('free tier is not available for this project')) {
          errText = 'Google Gemini restriction: Free tier is disabled for this project. Fix: 1) Verify birthdate in Google Account (Personal Info > Birthday), 2) Or create a new project in Google AI Studio, 3) Or use Free OpenRouter / Groq.';
        }
        // Extract retry delay from Gemini error details if present
        if (Array.isArray(errJson.error?.details)) {
          for (const d of errJson.error.details) {
            if (d.retryDelay) {
              const match = String(d.retryDelay).match(/(\d+(\.\d+)?)s/);
              if (match) retryAfterSeconds = Math.ceil(parseFloat(match[1]));
            }
          }
        }
      } catch {}

      const error: any = new Error(errText);
      error.status = res.status;
      error.retryAfterSeconds = retryAfterSeconds;
      throw error;
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Gemini returned an empty response candidate');
    }

    return text;
  }
}
