import { LocalHardwareProfile, ModelInfo } from '../../types';
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

export interface ResolvedHardwareProfileSpec {
  configuredProfile: LocalHardwareProfile;
  effectiveTier: 'integrated' | 'dedicated';
  detectedGpuName: string;
  imageMaxDim: number;
  jpegQuality: number;
  maxTokens: number;
}

let cachedGpuDetection: { tier: 'integrated' | 'dedicated'; gpuName: string } | null = null;

/**
 * Inspects WebGL renderer and navigator hardware telemetry once to determine whether
 * the host machine uses an integrated GPU (e.g. Intel Iris Xe / UHD) or a dedicated GPU (e.g. RTX / RX / Apple M).
 */
export function detectLocalHardwareTier(): { tier: 'integrated' | 'dedicated'; gpuName: string } {
  if (cachedGpuDetection) return cachedGpuDetection;

  let gpuName = 'Integrated Graphics (Default)';
  let tier: 'integrated' | 'dedicated' = 'integrated';

  try {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      const gl =
        (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const rawRenderer = debugInfo
          ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '')
          : String(gl.getParameter(gl.RENDERER) || '');

        if (rawRenderer) {
          gpuName = rawRenderer
            .replace(/^ANGLE\s*\(/i, '')
            .replace(/\s*Direct3D.*$/i, '')
            .replace(/\)$/g, '')
            .trim();

          const isDedicated = /nvidia|geforce|rtx|gtx|quadro|radeon\s+rx|radeon\s+pro|apple\s+m[1-9]|arc\s+a[57]\d{2}/i.test(
            rawRenderer
          );
          const isIntegrated = /iris|uhd\s+graphics|hd\s+graphics|intel\(r\)|radeon\(tm\)\s+graphics|vega|swiftshader|llvmpipe|basic\s+render/i.test(
            rawRenderer
          );

          if (isDedicated && !isIntegrated) {
            tier = 'dedicated';
          } else {
            tier = 'integrated';
          }
        }
      }
    }
  } catch {
    // Fallback to integrated tier for maximum stability
  }

  cachedGpuDetection = { tier, gpuName };
  return cachedGpuDetection;
}

/**
 * Resolves the active Local AI hardware parameters based on user selection ('auto' | 'integrated' | 'dedicated').
 */
export function resolveHardwareProfileSpec(
  preferredProfile: LocalHardwareProfile = 'auto'
): ResolvedHardwareProfileSpec {
  const detected = detectLocalHardwareTier();
  const effectiveTier: 'integrated' | 'dedicated' =
    preferredProfile === 'auto' ? detected.tier : preferredProfile;

  if (effectiveTier === 'dedicated') {
    return {
      configuredProfile: preferredProfile,
      effectiveTier: 'dedicated',
      detectedGpuName: detected.gpuName,
      imageMaxDim: 512,
      jpegQuality: 0.82,
      maxTokens: 1100,
    };
  }

  return {
    configuredProfile: preferredProfile,
    effectiveTier: 'integrated',
    detectedGpuName: detected.gpuName,
    imageMaxDim: 384,
    jpegQuality: 0.72,
    maxTokens: 900,
  };
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
   * Downscales a 512px thumbnail to 384px @ 0.72 JPEG quality when running on an integrated GPU (e.g. Intel Iris Xe),
   * cutting vision encoder patch tokens by ~40% while keeping full 512px resolution on dedicated GPUs.
   */
  public async optimizeImageForLocalVision(
    imageBase64: string,
    hardwareProfile: LocalHardwareProfile = 'auto'
  ): Promise<string> {
    if (!imageBase64 || imageBase64.length < 4096) {
      return imageBase64;
    }

    const spec = resolveHardwareProfileSpec(hardwareProfile);
    if (spec.effectiveTier === 'dedicated' || typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
      return imageBase64;
    }

    let bitmap: ImageBitmap | null = null;
    const canvas = document.createElement('canvas');
    try {
      const cleanB64 = imageBase64.replace(/^data:image\/[^;]+;base64,/, '');
      const binaryStr = atob(cleanB64);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'image/jpeg' });
      bitmap = await createImageBitmap(blob);

      const origW = bitmap.width;
      const origH = bitmap.height;
      if (origW <= spec.imageMaxDim && origH <= spec.imageMaxDim) {
        return cleanB64;
      }

      let targetW = origW;
      let targetH = origH;
      if (origW > origH) {
        targetH = Math.max(1, Math.round((origH * spec.imageMaxDim) / origW));
        targetW = spec.imageMaxDim;
      } else {
        targetW = Math.max(1, Math.round((origW * spec.imageMaxDim) / origH));
        targetH = spec.imageMaxDim;
      }

      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return cleanB64;

      ctx.drawImage(bitmap, 0, 0, targetW, targetH);
      const dataUrl = canvas.toDataURL('image/jpeg', spec.jpegQuality);
      return dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    } catch {
      return imageBase64.replace(/^data:image\/[^;]+;base64,/, '');
    } finally {
      if (bitmap) {
        try {
          bitmap.close();
        } catch {}
      }
      canvas.width = 0;
      canvas.height = 0;
    }
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
   * Analyzes an image (or runs a fast text-only keyword top-up when imageBase64 is empty)
   * targeting the local LM Studio OpenAI-compatible endpoint with Liquid AI LFM3-VL-2B optimal sampling parameters.
   */
  async analyzeImage(
    baseUrl: string,
    modelId: string,
    imageBase64: string,
    prompt: string,
    systemPrompt?: string,
    signal?: AbortSignal,
    timeoutMs = 60000,
    hardwareProfile: LocalHardwareProfile = 'auto'
  ): Promise<string> {
    const normalizedUrl = this.normalizeBaseUrl(baseUrl);
    const chatEndpoint = `${normalizedUrl}/chat/completions`;
    const profileSpec = resolveHardwareProfileSpec(hardwareProfile);

    const messages: any[] = [];
    const effectiveSystemPrompt = systemPrompt || SYSTEM_LOCAL_VISION_PROMPT;
    if (effectiveSystemPrompt) {
      messages.push({ role: 'system', content: effectiveSystemPrompt });
    }

    if (imageBase64 && imageBase64.trim().length > 0) {
      const optimizedBase64 = await this.optimizeImageForLocalVision(imageBase64, hardwareProfile);
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${optimizedBase64}`,
            },
          },
        ],
      });
    } else {
      // Fast Text-Only Top-Up Mode (Skips vision encoder on integrated GPU)
      messages.push({
        role: 'user',
        content: prompt,
      });
    }

    // Official Liquid AI LFM3-VL-2B sampling parameters + low repeat_penalty (1.04)
    // to prevent premature JSON array bracket closure before 45-49 keywords are emitted
    const payload = {
      model: modelId || 'local-model',
      messages,
      temperature: 0.1,
      top_k: 50,
      min_p: 0.15,
      repeat_penalty: 1.04,
      max_tokens: imageBase64 ? profileSpec.maxTokens : 450,
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

