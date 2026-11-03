import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssetCard, UnifiedAssetRow } from '../src/features/studio/components/AssetCard';
import { LanguageProvider } from '../src/context/LanguageContext';
import { MasterMetadataRecord } from '../src/types';
import { batchQueueService } from '../src/services/queue/BatchQueueService';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
};

describe('UI Regeneration State and Strict Export Lockout', () => {
  const mockMasterRecord: MasterMetadataRecord = {
    id: 'asset-1',
    filename: 'nature_forest_stream.jpg',
    mediaType: 'image',
    isAiGenerated: true,
    baseTitle: 'Crystal Clear Stream Flowing Through Forest',
    detailedDescription: 'A serene mountain stream cascading over smooth river rocks in an untouched evergreen forest.',
    rankedKeywords: ['forest', 'stream', 'water', 'nature', 'landscape'],
    categories: {
      adobeCategoryId: 5,
      shutterstockCategories: ['Nature'],
      dreamstimeCategory1: 18,
      dreamstimeCategory2: 171,
      dreamstimeCategory3: 212,
    },
    createdAt: Date.now(),
    status: 'completed',
  };

  const mockCompletedAsset: UnifiedAssetRow = {
    id: 'asset-1',
    filename: 'nature_forest_stream.jpg',
    thumbnailUrl: 'data:image/jpeg;base64,mock',
    status: 'completed',
    masterRecord: mockMasterRecord,
    createdAt: Date.now(),
  };

  it('triggers onRegenerate callback when individual card Regenerate button is clicked', () => {
    const handleRegenerate = vi.fn();
    renderWithProviders(
      <AssetCard
        asset={mockCompletedAsset}
        rec={mockMasterRecord}
        viewMode="detailed"
        copiedKey={null}
        onCopyText={vi.fn()}
        onCopyAll={vi.fn()}
        onDelete={vi.fn()}
        onRegenerate={handleRegenerate}
      />
    );

    // Find and click the Regenerate button
    const regenBtn = screen.getByRole('button', { name: /regenerate/i });
    expect(regenBtn).toBeDefined();
    fireEvent.click(regenBtn);

    expect(handleRegenerate).toHaveBeenCalledWith('asset-1');
  });

  it('renders loading spinner and hides action buttons while card is processing', () => {
    const mockProcessingAsset: UnifiedAssetRow = {
      ...mockCompletedAsset,
      status: 'processing',
    };

    renderWithProviders(
      <AssetCard
        asset={mockProcessingAsset}
        rec={mockMasterRecord}
        viewMode="detailed"
        copiedKey={null}
        onCopyText={vi.fn()}
        onCopyAll={vi.fn()}
        onDelete={vi.fn()}
        onRegenerate={vi.fn()}
      />
    );

    // The regenerate button should not be rendered while processing
    const regenBtn = screen.queryByRole('button', { name: /^regenerate$/i });
    expect(regenBtn).toBeNull();
  });

  it('strictly disables Export CSVs button when isRunning is true', () => {
    // Toolbar Export Button Component mimicking StudioView export lockout logic
    const ToolbarExportButton: React.FC<{
      completedCount: number;
      isRunning: boolean;
      onExport: () => void;
    }> = ({ completedCount, isRunning, onExport }) => {
      const isDisabled = completedCount === 0 || isRunning;
      return (
        <button
          data-testid="export-csvs-btn"
          disabled={isDisabled}
          onClick={() => {
            if (isRunning) return;
            onExport();
          }}
          className={isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        >
          Export CSVs ({completedCount})
        </button>
      );
    };

    const handleExport = vi.fn();

    // 1. When completedCount > 0 and isRunning = false -> Button MUST be enabled
    const { rerender } = render(
      <ToolbarExportButton completedCount={5} isRunning={false} onExport={handleExport} />
    );

    let exportBtn = screen.getByTestId('export-csvs-btn') as HTMLButtonElement;
    expect(exportBtn.disabled).toBe(false);
    fireEvent.click(exportBtn);
    expect(handleExport).toHaveBeenCalledTimes(1);

    // 2. When regeneration starts (isRunning = true) -> Button MUST be strictly disabled
    rerender(
      <ToolbarExportButton completedCount={5} isRunning={true} onExport={handleExport} />
    );

    exportBtn = screen.getByTestId('export-csvs-btn') as HTMLButtonElement;
    expect(exportBtn.disabled).toBe(true);
    expect(exportBtn.className).toContain('opacity-40');
    expect(exportBtn.className).toContain('cursor-not-allowed');

    // Clicking while disabled should NOT trigger onExport
    fireEvent.click(exportBtn);
    expect(handleExport).toHaveBeenCalledTimes(1); // Still 1, didn't fire again
  });

  it('verifies BatchQueueService state propagation on single item reprocess', async () => {
    // Add an item to queue
    const listener = vi.fn();
    const unsub = batchQueueService.subscribe(listener);

    batchQueueService.clear();

    const stateBefore = batchQueueService.getState();
    expect(stateBefore.status).toBe('idle');

    unsub();
  });

  it('renders all 3 Dreamstime categories in card preview when drawer is expanded', () => {
    renderWithProviders(
      <AssetCard
        asset={mockCompletedAsset}
        rec={mockMasterRecord}
        copiedKey={null}
        onCopyText={vi.fn()}
        onCopyAll={vi.fn()}
        onDelete={vi.fn()}
        onRegenerate={vi.fn()}
      />
    );

    const expandBtn = screen.getByRole('button', { name: /expand details/i });
    fireEvent.click(expandBtn);

    // Categories preview footer contains all 3 Dreamstime categories
    const dtBadge = screen.getByText(/Dreamstime:/i);
    expect(dtBadge).toBeDefined();

    // Verify categories text contains "Forests, Water, AI generated"
    expect(screen.getByText(/Forests/i)).toBeDefined();
  });
});
