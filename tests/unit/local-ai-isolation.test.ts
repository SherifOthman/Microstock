import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalAiAdapter, localAiAdapter } from '../../src/services/providers/localAi';
import { getAiExecutionMode, setAiExecutionMode, getLocalAiConfig, saveLocalAiConfig } from '../../src/db';

describe('Local LM Studio Integration with Strict Isolation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('LocalAiAdapter Base URL & Prompt Formatting', () => {
    it('normalizes base URLs by trimming whitespace and trailing slashes', () => {
      const adapter = new LocalAiAdapter();
      expect(adapter.normalizeBaseUrl('http://127.0.0.1:1234/v1/')).toBe('http://127.0.0.1:1234/v1');
      expect(adapter.normalizeBaseUrl('  http://localhost:1234/v1///  ')).toBe('http://localhost:1234/v1');
      expect(adapter.normalizeBaseUrl('')).toBe('http://127.0.0.1:1234/v1');
    });

    it('formats multipart Vision + Text chat completion payload matching OpenAI specification', async () => {
      const adapter = new LocalAiAdapter();
      let capturedUrl = '';
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any = null;

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        capturedBody = JSON.parse(init?.body as string);

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    base_title: 'Local AI Generated Title',
                    detailed_description: 'Detailed description from local vision model',
                    ranked_keywords: ['tag1', 'tag2'],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const response = await adapter.analyzeImage(
        'http://127.0.0.1:1234/v1',
        'lfm-3-vl-2b',
        'fakeBase64ImagePayload',
        'Generate stock metadata',
        'You are a microstock assistant.'
      );

      // Verify endpoint URL
      expect(capturedUrl).toBe('http://127.0.0.1:1234/v1/chat/completions');

      // Verify dummy authorization header
      expect(capturedHeaders['Authorization']).toBe('Bearer local-dummy-key');
      expect(capturedHeaders['Content-Type']).toBe('application/json');

      // Verify multipart payload structure
      expect(capturedBody.model).toBe('lfm-3-vl-2b');
      expect(capturedBody.temperature).toBe(0.2);
      expect(capturedBody.messages).toHaveLength(2);
      expect(capturedBody.messages[0]).toEqual({ role: 'system', content: 'You are a microstock assistant.' });
      expect(capturedBody.messages[1].role).toBe('user');
      expect(capturedBody.messages[1].content).toEqual([
        { type: 'text', text: 'Generate stock metadata' },
        {
          type: 'image_url',
          image_url: {
            url: 'data:image/jpeg;base64,fakeBase64ImagePayload',
          },
        },
      ]);

      expect(response).toContain('Local AI Generated Title');
    });

    it('testConnection pings /v1/models and parses available models correctly', async () => {
      const adapter = new LocalAiAdapter();

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (String(url).endsWith('/models')) {
          return new Response(
            JSON.stringify({
              object: 'list',
              data: [
                { id: 'lfm-3-vl-2b', object: 'model' },
                { id: 'qwen2.5-vl-7b-instruct', object: 'model' },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('Not Found', { status: 404 });
      });

      const result = await adapter.testConnection('http://127.0.0.1:1234/v1', 'lfm-3-vl-2b');
      expect(result.success).toBe(true);
      expect(result.detectedModels).toContain('lfm-3-vl-2b');
      expect(result.detectedModels).toContain('qwen2.5-vl-7b-instruct');
      expect(result.activeModel).toBe('lfm-3-vl-2b');
    });

    it('testConnection returns friendly offline diagnostic error when server is unreachable', async () => {
      const adapter = new LocalAiAdapter();

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));

      const result = await adapter.testConnection('http://127.0.0.1:1234/v1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Server unreachable at http://127.0.0.1:1234/v1');
      expect(result.error).toContain('Ensure LM Studio is open');
    });
  });

  describe('Persistent Settings: 1-Click Mode Switching', () => {
    it('saves and retrieves global AI execution mode persistently', async () => {
      await setAiExecutionMode('local');
      const mode = await getAiExecutionMode();
      expect(mode).toBe('local');

      await setAiExecutionMode('cloud');
      const restored = await getAiExecutionMode();
      expect(restored).toBe('cloud');
    });

    it('saves and retrieves local AI server configuration', async () => {
      await saveLocalAiConfig({
        baseUrl: 'http://localhost:5000/v1',
        modelId: 'custom-vision-v1',
        timeoutSeconds: 30,
      });

      const config = await getLocalAiConfig();
      expect(config.baseUrl).toBe('http://localhost:5000/v1');
      expect(config.modelId).toBe('custom-vision-v1');
      expect(config.timeoutSeconds).toBe(30);

      // Restore default
      await saveLocalAiConfig({
        baseUrl: 'http://127.0.0.1:1234/v1',
        modelId: 'default',
        timeoutSeconds: 45,
      });
    });
  });
});
