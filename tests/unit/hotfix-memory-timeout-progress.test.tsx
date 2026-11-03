import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GlobalProgressBanner } from '../../src/components/studio/GlobalProgressBanner';
import { QueueState } from '../../src/services/queue/BatchQueueService';
import { keyRingScheduler } from '../../src/services/scheduler/KeyRingScheduler';
import { db } from '../../src/db';
import { rasterizeEpsBufferDirect } from '../../src/services/eps/epsWorkerCore';
import { buildVisionPrompt } from '../../src/services/ai/masterPrompt';
import { parseAndNormalizeAiMetadata } from '../../src/services/ai/metadataParser';
import { KeyRingView } from '../../src/features/keyring/components/KeyRingView';
import { AssetCard } from '../../src/features/studio/components/AssetCard';
import { LanguageProvider } from '../../src/context/LanguageContext';

describe('Emergency Hotfix & Final UX Cleanup Suite', () => {
  beforeEach(async () => {
    await db.apiKeys.clear();
    await keyRingScheduler.refreshKeys();
  });

  it('AssetCard displays a "Has Audio!" warning badge when a video in Metadata Studio still contains an audio track', () => {
    render(
      <LanguageProvider>
        <AssetCard
          asset={{
            id: 'vid-audio-1',
            filename: 'B01_001__drone_flight.mp4',
            status: 'completed',
            createdAt: Date.now(),
            queueItem: {
              id: 'vid-audio-1',
              filename: 'B01_001__drone_flight.mp4',
              mediaType: 'video',
              hasAudio: true,
              status: 'completed',
              retryCount: 0,
            },
          }}
          rec={{
            id: 'vid-audio-1',
            batchId: 'b1',
            filename: 'B01_001__drone_flight.mp4',
            thumbnailBase64: '',
            mediaType: 'video',
            videoMeta: { hasAudio: true, resolution: '4K UHD' },
            isAiGenerated: false,
            baseTitle: 'Aerial Drone Flight Over Mountains',
            detailedDescription: 'Smooth 4K aerial drone flight over rocky mountain peaks at sunrise.',
            rankedKeywords: ['drone', 'aerial', 'mountains'],
            status: 'completed',
            createdAt: Date.now(),
          }}
          copiedKey={null}
          onCopyText={() => {}}
          onCopyAll={() => {}}
          onDelete={() => {}}
          onRegenerate={() => {}}
        />
      </LanguageProvider>
    );

    expect(screen.getByText('Has Audio!')).toBeTruthy();
  });

  it('Progress Bar strictly reflects (successful_items / total_items) * 100 and halts at 80% when 20 of 100 fail', () => {
    const mockQueueState: QueueState = {
      batchId: 'batch-1',
      batchName: 'Batch #1',
      status: 'completed',
      items: [],
      totalCount: 100,
      processedCount: 80,
      failedCount: 20,
      activeWorkers: 0,
      elapsedSeconds: 45,
    };

    render(<GlobalProgressBanner queueState={mockQueueState} showProgressBar={true} language="en" />);

    expect(screen.getByText('(80%)')).toBeTruthy();
    expect(screen.getByText('80/100 completed')).toBeTruthy();
    expect(screen.getByText('· 20 failed')).toBeTruthy();
  });

  it('KeyRingScheduler cools down all sibling Gemini keys on HTTP 503 High Demand and cascades to OpenRouter & Groq', async () => {
    const now = Date.now();
    // Add 3 Gemini keys on the same model + 1 OpenRouter key + 1 Groq key
    for (let i = 1; i <= 3; i++) {
      await db.apiKeys.put({
        id: `gemini-key-${i}`,
        providerId: 'gemini',
        key: `AIzaSyTestKey${i}000000000000000`,
        label: `Gemini Key ${i}`,
        modelId: 'gemini-3.1-flash-lite',
        rpmLimit: 15,
        rpdLimit: 1500,
        status: 'healthy',
        requestsInWindow: [],
        dailyRequestCount: 0,
        dailyResetTimestamp: now + 86400000,
        activeRequests: 0,
        lastUsedAt: 0,
        createdAt: now + i,
      });
    }
    await db.apiKeys.put({
      id: 'openrouter-key-1',
      providerId: 'openrouter',
      key: 'sk-or-v1-testopenrouterkey12345',
      label: 'OpenRouter Key #1',
      modelId: 'nvidia/nemotron-nano-12b-v2-vl:free',
      rpmLimit: 20,
      rpdLimit: 1000,
      status: 'healthy',
      requestsInWindow: [],
      dailyRequestCount: 0,
      dailyResetTimestamp: now + 86400000,
      activeRequests: 0,
      lastUsedAt: 0,
      createdAt: now + 10,
    });
    await db.apiKeys.put({
      id: 'groq-key-1',
      providerId: 'groq',
      key: 'gsk_testgroqkey1234567890',
      label: 'Groq Key #1',
      modelId: 'meta-llama/llama-4-scout-17b-16e-instruct',
      rpmLimit: 30,
      rpdLimit: 1000,
      status: 'healthy',
      requestsInWindow: [],
      dailyRequestCount: 0,
      dailyResetTimestamp: now + 86400000,
      activeRequests: 0,
      lastUsedAt: 0,
      createdAt: now + 20,
    });
    await keyRingScheduler.refreshKeys();

    // 1. Acquire first key (should be Gemini Key 1) and simulate HTTP 503 High Demand
    const lease1 = await keyRingScheduler.acquireKey();
    expect(lease1.keyRecord.providerId).toBe('gemini');
    const err503: any = new Error('This model is currently experiencing high demand. Spikes in demand are usually temporary.');
    err503.status = 503;
    await lease1.release(false, err503);

    // 2. Next acquireKey() must immediately cascade past all 3 Gemini keys to the next healthy provider (Groq/OpenRouter)
    const lease2 = await keyRingScheduler.acquireKey();
    expect(lease2.keyRecord.providerId).not.toBe('gemini');
    const secondProvider = lease2.keyRecord.providerId;
    expect(['groq', 'openrouter']).toContain(secondProvider);
    const errTimeout: any = new Error('Provider request timed out (20s): signal timed out');
    errTimeout.status = 408;
    errTimeout.isTimeout = true;
    await lease2.release(false, errTimeout);

    // 3. Next acquireKey() must cascade to the remaining healthy backup provider
    const lease3 = await keyRingScheduler.acquireKey();
    expect(lease3.keyRecord.providerId).not.toBe('gemini');
    expect(lease3.keyRecord.providerId).not.toBe(secondProvider);
    expect(['groq', 'openrouter']).toContain(lease3.keyRecord.providerId);
    await lease3.release(true);
  });

  it('KeyRingView renders Provider Tabs and shows only the active provider keys with normal un-hashed keys', async () => {
    const now = Date.now();
    await db.apiKeys.put({
      id: 'gemini-tab-key',
      providerId: 'gemini',
      key: 'AIzaSyNormalReadableGeminiKey999',
      label: 'My Gemini Key',
      modelId: 'gemini-3.1-flash-lite',
      rpmLimit: 15,
      rpdLimit: 1500,
      status: 'healthy',
      requestsInWindow: [],
      dailyRequestCount: 0,
      dailyResetTimestamp: now + 86400000,
      activeRequests: 0,
      lastUsedAt: 0,
      createdAt: now,
    });
    await db.apiKeys.put({
      id: 'groq-tab-key',
      providerId: 'groq',
      key: 'gsk_NormalReadableGroqKey888',
      label: 'My Groq Key',
      modelId: 'meta-llama/llama-4-scout-17b-16e-instruct',
      rpmLimit: 30,
      rpdLimit: 1000,
      status: 'healthy',
      requestsInWindow: [],
      dailyRequestCount: 0,
      dailyResetTimestamp: now + 86400000,
      activeRequests: 0,
      lastUsedAt: 0,
      createdAt: now + 1,
    });
    await keyRingScheduler.refreshKeys();

    render(
      <LanguageProvider>
        <KeyRingView />
      </LanguageProvider>
    );

    // Initially on Google Gemini tab: shows My Gemini Key, masked by default, and reveals on click
    await waitFor(() => {
      expect(screen.getByText('My Gemini Key')).toBeTruthy();
      expect(screen.getByText(/AIzaSy••••••••••••y999/)).toBeTruthy();
    });
    expect(screen.queryByText('My Groq Key')).toBeNull();

    // Toggle eye to reveal
    const showBtn = screen.getByTitle(/Show full key/i);
    fireEvent.click(showBtn);
    expect(screen.getByText('AIzaSyNormalReadableGeminiKey999')).toBeTruthy();

    // Click Groq tab: shows My Groq Key, hides My Gemini Key
    const groqTab = screen.getByRole('tab', { name: /Groq/i });
    fireEvent.click(groqTab);

    await waitFor(() => {
      expect(screen.getByText('My Groq Key')).toBeTruthy();
      expect(screen.getByText(/gsk_No••••••••••••y888/)).toBeTruthy();
    });
    expect(screen.queryByText('My Gemini Key')).toBeNull();
  });

  it('AI Vector Context Injection injects strict rule and strips photo/camera/photography from EPS vector metadata', () => {
    const prompt = buildVisionPrompt('vintage_badge_logo.eps', '', 'vector', 'mixed', 'optimal', true);
    expect(prompt).toContain(
      "CRITICAL NOTE: The attached image is a rasterized preview of a Vector/EPS illustration. You MUST generate keywords appropriate for vector graphics and illustrations. Do NOT use words like 'photo', 'camera', or 'photography'."
    );

    const rawAiJson = JSON.stringify({
      base_title: 'Vintage Badge Logo Stock Photo Isolated on White',
      detailed_description: 'High quality macro photograph of a vintage badge logo taken with a DSLR camera and bokeh lens.',
      ranked_keywords: [
        'vintage', 'badge', 'logo', 'emblem', 'retro', 'shield', 'crest', 'heraldry',
        'insignia', 'label', 'stamp', 'sticker', 'seal', 'ribbon', 'banner', 'classic',
        'ornate', 'luxury', 'gold', 'black', 'photo', 'photography', 'camera', 'dslr', 'bokeh'
      ],
      category_adobe: 8,
      category_shutterstock: ['Signs/Symbols', 'Arts'],
    });

    const parsed = parseAndNormalizeAiMetadata(
      rawAiJson,
      'vintage_badge_logo.eps',
      'data:image/jpeg;base64,xxx',
      'batch-vec',
      true,
      'Midjourney v6',
      'mixed',
      'vector'
    );

    expect(parsed.baseTitle.toLowerCase()).not.toContain('photo');
    expect(parsed.detailedDescription.toLowerCase()).not.toContain('photograph');
    expect(parsed.detailedDescription.toLowerCase()).not.toContain('camera');
    expect(parsed.rankedKeywords).not.toContain('photo');
    expect(parsed.rankedKeywords).not.toContain('photography');
    expect(parsed.rankedKeywords).not.toContain('camera');
    expect(parsed.rankedKeywords).not.toContain('dslr');
    expect(parsed.rankedKeywords).not.toContain('bokeh');
  });

  it('EPS rasterizer releases uncompressed canvas reference from EpsRenderResult after encoding', async () => {
    let createdCanvas: HTMLCanvasElement | null = null;
    const origCreateElement = document.createElement.bind(document);
    const spyCreate = vi.spyOn(document, 'createElement').mockImplementation((tagName: any) => {
      const el = origCreateElement(tagName);
      if (String(tagName).toLowerCase() === 'canvas') {
        createdCanvas = el as HTMLCanvasElement;
        (el as any).getContext = () => ({
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 1,
          font: '',
          textAlign: '',
          textBaseline: '',
          fillRect: () => {},
          strokeRect: () => {},
          fillText: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          closePath: () => {},
          fill: () => {},
          stroke: () => {},
          save: () => {},
          restore: () => {},
          translate: () => {},
          scale: () => {},
          transform: () => {},
          bezierCurveTo: () => {},
          drawImage: () => {},
        });
        (el as any).toDataURL = () => 'data:image/jpeg;base64,mockJpgData';
        (el as any).toBlob = (cb: any) => cb(new Blob(['mock'], { type: 'image/jpeg' }));
      }
      return el;
    });

    try {
      const sampleEps = new TextEncoder().encode(
        '%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 200 200\n0.2 0.4 0.8 setrgbcolor\n0 0 200 200 rectfill\n%%EOF'
      );
      const res = await rasterizeEpsBufferDirect(sampleEps.buffer, 'test_vector.eps', 384, 0.72);
      expect(res.width).toBe(384);
      expect(res.height).toBe(384);
      expect(res.canvas).toBeUndefined();
      expect(createdCanvas).not.toBeNull();
      expect(createdCanvas!.width).toBe(0);
      expect(createdCanvas!.height).toBe(0);
    } finally {
      spyCreate.mockRestore();
    }
  });
});

