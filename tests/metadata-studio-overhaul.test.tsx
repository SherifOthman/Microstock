import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssetCard, UnifiedAssetRow } from '../src/features/studio/components/AssetCard';
import { StudioToolbar } from '../src/components/studio/StudioToolbar';
import { LanguageProvider } from '../src/context/LanguageContext';
import { MasterMetadataRecord } from '../src/types';
import { BatchQueueService } from '../src/services/queue/BatchQueueService';
import {
  validateMinimumKeywords,
  mergeUniqueRankedKeywords,
  MIN_REQUIRED_KEYWORDS,
  MAX_LOCAL_KEYWORDS,
  parseAndNormalizeAiMetadata,
} from '../src/services/ai/metadataParser';
import { localAiAdapter } from '../src/services/providers';
import { resolveHardwareProfileSpec } from '../src/services/providers/localAi';
import { LocalAiSettingsPanel } from '../src/features/keyring/components/LocalAiSettingsPanel';
import * as dbModule from '../src/db';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
};

describe('Metadata Studio 5-Point Overhaul (Local AI Optimization)', () => {
  const queue = BatchQueueService.getInstance();

  beforeEach(async () => {
    queue.clear();
    await dbModule.db.masterRecords.clear();
    vi.restoreAllMocks();
  });

  it('1. Enforces 45+ Keywords validation and formats exact system retry message', () => {
    const shortList = Array.from({ length: 27 }, (_, i) => `keyword${i + 1}`);
    const validation = validateMinimumKeywords(shortList);

    expect(validation.isValid).toBe(false);
    expect(validation.count).toBe(27);
    expect(validation.retryMessage).toBe(
      'You only provided 27 keywords. You MUST provide at least 45 keywords.'
    );

    const fullList = Array.from({ length: MIN_REQUIRED_KEYWORDS }, (_, i) => `tag${i + 1}`);
    const validResult = validateMinimumKeywords(fullList);
    expect(validResult.isValid).toBe(true);
    expect(validResult.count).toBe(45);

    const merged = mergeUniqueRankedKeywords(
      ['sunset', 'beach', 'ocean'],
      ['Ocean', 'waves', 'horizon']
    );
    expect(merged).toEqual(['sunset', 'beach', 'ocean', 'waves', 'horizon']);
  });

  it('2. Triggers capped text-only top-up retry with injected system message when local model returns < 45 keywords', async () => {
    vi.spyOn(dbModule, 'getAppSettings').mockResolvedValue({
      id: 'global',
      aiExecutionMode: 'local',
      localAiConfig: {
        baseUrl: 'http://127.0.0.1:1234/v1',
        modelId: 'lfm3-vl-2b',
        timeoutSeconds: 60,
        hardwareProfile: 'integrated',
      },
    } as any);

    const kws26 = Array.from({ length: 26 }, (_, i) => `word${i + 1}`);
    const topUp24 = Array.from({ length: 24 }, (_, i) => `extra${i + 1}`);

    const analyzeSpy = vi
      .spyOn(localAiAdapter, 'analyzeImage')
      .mockResolvedValueOnce(
        JSON.stringify({
          base_title: 'Golden Sunset Over Calm Ocean Horizon',
          detailed_description: 'A scenic golden sunset reflecting on calm ocean water.',
          ranked_keywords: kws26,
          category_adobe: 11,
          category_shutterstock: ['Nature'],
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          additional_keywords: topUp24,
        })
      );

    await dbModule.db.masterRecords.put({
      id: 'local-item-1',
      filename: 'B01_001.jpg',
      thumbnailBase64: 'data:image/jpeg;base64,dGVzdA==',
      isAiGenerated: false,
      baseTitle: '',
      detailedDescription: '',
      rankedKeywords: [],
      categories: { adobeCategoryId: 11, shutterstockCategories: ['Nature'] },
      status: 'pending',
      createdAt: 1000,
    });

    await queue.reprocessItem('local-item-1', false);

    // Wait for sequential worker to finish
    await vi.waitFor(
      () => {
        const state = queue.getState();
        const item = state.items.find((i) => i.id === 'local-item-1');
        expect(item?.status).toBe('completed');
      },
      { timeout: 3000 }
    );

    expect(analyzeSpy).toHaveBeenCalledTimes(2);
    // Second call must be a fast text-only top-up (empty imageBase64) and contain the injected system message
    const secondCallImageBase64 = analyzeSpy.mock.calls[1][2];
    const secondCallSystemPrompt = analyzeSpy.mock.calls[1][4];
    expect(secondCallImageBase64).toBe('');
    expect(secondCallSystemPrompt).toContain(
      'You only provided 26 keywords. You MUST provide at least 45 keywords.'
    );

    const saved = await dbModule.db.masterRecords.get('local-item-1');
    expect(saved?.baseTitle).toBe('Golden Sunset Over Calm Ocean Horizon');
    expect(saved?.rankedKeywords.length).toBeGreaterThanOrEqual(45);
    expect(saved?.rankedKeywords.length).toBeLessThanOrEqual(MAX_LOCAL_KEYWORDS);
  });

  it('3. Enforces strict sequential queue (1 item Generating, remaining items Queued) when clicking generate on 3 items', async () => {
    vi.spyOn(dbModule, 'getAppSettings').mockResolvedValue({
      id: 'global',
      aiExecutionMode: 'local',
      localAiConfig: {
        baseUrl: 'http://127.0.0.1:1234/v1',
        modelId: 'lfm3-vl-2b',
        timeoutSeconds: 60,
      },
    } as any);

    let resolveFirstItem!: (val: string) => void;
    const kws45 = Array.from({ length: 45 }, (_, i) => `tag${i + 1}`);

    vi.spyOn(localAiAdapter, 'analyzeImage').mockImplementation(() => {
      return new Promise<string>((resolve) => {
        resolveFirstItem = resolve;
      });
    });

    for (let i = 1; i <= 3; i++) {
      await dbModule.db.masterRecords.put({
        id: `seq-${i}`,
        filename: `B01_00${i}.jpg`,
        thumbnailBase64: 'data:image/jpeg;base64,dGVzdA==',
        isAiGenerated: false,
        baseTitle: 'Previous Title',
        detailedDescription: 'Previous Desc',
        rankedKeywords: kws45,
        categories: { adobeCategoryId: 11, shutterstockCategories: ['Nature'] },
        status: 'completed',
        createdAt: 1000 + i,
      });
    }

    // User clicks regenerate on all 3 items rapidly
    await queue.reprocessItem('seq-1', false);
    await queue.reprocessItem('seq-2', false);
    await queue.reprocessItem('seq-3', false);

    // Wait until the first item is picked up by dispatchLoop
    await vi.waitFor(() => {
      const state = queue.getState();
      const processingItems = state.items.filter((i) => i.status === 'processing');
      expect(processingItems.length).toBe(1);
    });

    const midState = queue.getState();
    const item1 = midState.items.find((i) => i.id === 'seq-1');
    const item2 = midState.items.find((i) => i.id === 'seq-2');
    const item3 = midState.items.find((i) => i.id === 'seq-3');

    // Strictly 1 item is processing ("Generating..."), while the other 2 remain 'ready' ("Queued")
    expect(item1?.status).toBe('processing');
    expect(item2?.status).toBe('ready');
    expect(item3?.status).toBe('ready');

    // Clean up
    if (resolveFirstItem) {
      resolveFirstItem(
        JSON.stringify({
          base_title: 'Done',
          detailed_description: 'Done',
          ranked_keywords: kws45,
        })
      );
    }
    queue.clear();
  });

  it('4. Immediately aborts in-flight generation when removeItem is called', async () => {
    vi.spyOn(dbModule, 'getAppSettings').mockResolvedValue({
      id: 'global',
      aiExecutionMode: 'local',
      localAiConfig: {
        baseUrl: 'http://127.0.0.1:1234/v1',
        modelId: 'lfm3-vl-2b',
        timeoutSeconds: 60,
      },
    } as any);

    let capturedSignal: AbortSignal | undefined;
    vi.spyOn(localAiAdapter, 'analyzeImage').mockImplementation(
      (_url, _model, _img, _prompt, _sys, signal) => {
        capturedSignal = signal;
        return new Promise<string>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new Error('Aborted'));
          });
        });
      }
    );

    await dbModule.db.masterRecords.put({
      id: 'abort-item-1',
      filename: 'B01_001.jpg',
      thumbnailBase64: 'data:image/jpeg;base64,dGVzdA==',
      isAiGenerated: false,
      baseTitle: '',
      detailedDescription: '',
      rankedKeywords: [],
      categories: { adobeCategoryId: 11, shutterstockCategories: ['Nature'] },
      status: 'pending',
      createdAt: 1000,
    });

    await queue.reprocessItem('abort-item-1', false);

    await vi.waitFor(() => {
      expect(capturedSignal).toBeDefined();
    });

    expect(capturedSignal?.aborted).toBe(false);

    // User clicks Remove/Trash on the active item
    queue.removeItem('abort-item-1');

    expect(capturedSignal?.aborted).toBe(true);
    expect(queue.getState().items.find((i) => i.id === 'abort-item-1')).toBeUndefined();
    expect(queue.getState().status).toBe('idle');
  });

  it('5. Displays visual performance timer badge "Ready (14s)" on completed AssetCard and renders responsive StudioToolbar', () => {
    const recWithLatency: MasterMetadataRecord = {
      id: 'perf-1',
      filename: 'B01_001.jpg',
      mediaType: 'image',
      isAiGenerated: false,
      baseTitle: 'Mountain Peak at Sunrise',
      detailedDescription: 'A crisp view of a snow-covered mountain peak at sunrise.',
      rankedKeywords: ['mountain', 'sunrise', 'peak'],
      categories: { adobeCategoryId: 11, shutterstockCategories: ['Nature'] },
      aiGenerationInfo: {
        prompt: 'Mountain Peak at Sunrise',
        model: 'lfm3-vl-2b',
        provider: 'LM Studio',
        latencyMs: 14200,
      },
      status: 'completed',
      createdAt: 1000,
    };

    const assetRow: UnifiedAssetRow = {
      id: 'perf-1',
      filename: 'B01_001.jpg',
      thumbnailUrl: 'data:image/jpeg;base64,mock',
      status: 'completed',
      masterRecord: recWithLatency,
      createdAt: 1000,
    };

    renderWithProviders(
      <div>
        <StudioToolbar
          searchQuery=""
          onSearchChange={vi.fn()}
          totalAssetsCount={10}
          completedCount={5}
          pendingCount={5}
          brandNewPendingCount={5}
          failedCount={0}
          isRunning={false}
          isPaused={false}
          hasHealthyKeys={true}
          mediaTypeFilter="all"
          onMediaTypeFilterChange={vi.fn()}
          mediaTypeCounts={{ image: 6, video: 2, vector: 2 }}
          distinctMediaTypesCount={3}
          onStartQueue={vi.fn()}
          onPauseQueue={vi.fn()}
          onResumeQueue={vi.fn()}
          onRetryFailed={vi.fn()}
          onRegenerateAll={vi.fn()}
          onExportCsvs={vi.fn()}
          onClearAll={vi.fn()}
          t={{}}
        />
        <AssetCard
          asset={assetRow}
          rec={recWithLatency}
          copiedKey={null}
          onCopyText={vi.fn()}
          onCopyAll={vi.fn()}
          onDelete={vi.fn()}
          onRegenerate={vi.fn()}
        />
      </div>
    );

    const readyBadge = screen.getByTestId('asset-ready-badge-perf-1');
    expect(readyBadge.textContent).toContain('(14s)');
    expect(screen.getByText('Photos')).toBeDefined();
    expect(screen.getByText('Videos')).toBeDefined();
    expect(screen.getByText('Vectors')).toBeDefined();
  });

  it('6. Merges 4 categorized keyword buckets for LFM3-VL-2B and strictly caps at 49 keywords', () => {
    const raw4BucketJson = JSON.stringify({
      base_title: 'Fresh Organic Coffee Beans On Wooden Table',
      detailed_description: 'Close up of roasted organic coffee beans scattered on a rustic wooden surface.',
      subject_keywords: Array.from({ length: 14 }, (_, i) => `subject${i + 1}`),
      concept_keywords: Array.from({ length: 14 }, (_, i) => `concept${i + 1}`),
      mood_style_keywords: Array.from({ length: 14 }, (_, i) => `mood${i + 1}`),
      setting_color_keywords: Array.from({ length: 14 }, (_, i) => `setting${i + 1}`),
      category_adobe: 7,
      category_shutterstock: ['Food and Drink', 'Objects'],
    });

    const parsed = parseAndNormalizeAiMetadata(raw4BucketJson);
    expect(parsed.baseTitle).toBe('Fresh Organic Coffee Beans On Wooden Table');
    expect(parsed.rankedKeywords.length).toBe(MAX_LOCAL_KEYWORDS);
    expect(parsed.rankedKeywords.length).toBe(49);
    expect(parsed.rankedKeywords[0]).toBe('subject1');
  });

  it('7. Resolves hardware profile specs and renders LFM3-VL-2B tuning checklist in LocalAiSettingsPanel', async () => {
    const integratedSpec = resolveHardwareProfileSpec('integrated');
    const dedicatedSpec = resolveHardwareProfileSpec('dedicated');

    expect(integratedSpec.imageMaxDim).toBe(384);
    expect(integratedSpec.jpegQuality).toBe(0.72);
    expect(dedicatedSpec.imageMaxDim).toBe(512);
    expect(dedicatedSpec.jpegQuality).toBe(0.82);

    renderWithProviders(<LocalAiSettingsPanel />);

    const checklist = await screen.findByTestId('lfm3-tuning-checklist');
    expect(checklist).toBeDefined();
    expect(screen.getByText(/LM Studio Optimal Setup Checklist/i)).toBeDefined();
    expect(screen.getByText(/Context Length: 4096/i)).toBeDefined();
    expect(screen.getByText(/GPU Offload: Max \(24\)/i)).toBeDefined();
  });
});

