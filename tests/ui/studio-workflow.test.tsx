import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StudioToolbar } from '../../src/components/studio/StudioToolbar';
import { GlobalProgressBanner } from '../../src/components/studio/GlobalProgressBanner';
import { AssetCard } from '../../src/features/studio/components/AssetCard';
import { LanguageProvider } from '../../src/context/LanguageContext';
import { MasterMetadataRecord } from '../../src/types';

describe('Tier 3 UI State & Studio Workflow Tests', () => {
  const defaultToolbarProps = {
    searchQuery: '',
    onSearchChange: vi.fn(),
    totalAssetsCount: 5,
    completedCount: 5,
    pendingCount: 0,
    brandNewPendingCount: 0,
    failedCount: 0,
    isRunning: false,
    isPaused: false,
    hasHealthyKeys: true,
    onStartQueue: vi.fn(),
    onPauseQueue: vi.fn(),
    onResumeQueue: vi.fn(),
    onRetryFailed: vi.fn(),
    onRegenerateAll: vi.fn(),
    onExportCsvs: vi.fn(),
    onClearAll: vi.fn(),
    t: {},
  };

  describe('Strict Export Lockout Mechanism', () => {
    it('strictly disables "Export CSVs" button when queue is actively running', () => {
      render(
        <LanguageProvider>
          <StudioToolbar {...defaultToolbarProps} isRunning={true} completedCount={5} />
        </LanguageProvider>
      );

      const exportBtn = screen.getByRole('button', { name: /export csvs/i }) as HTMLButtonElement;
      expect(exportBtn.disabled).toBe(true);
    });

    it('strictly disables "Export CSVs" button when completedCount is 0', () => {
      render(
        <LanguageProvider>
          <StudioToolbar {...defaultToolbarProps} isRunning={false} completedCount={0} />
        </LanguageProvider>
      );

      const exportBtn = screen.getByRole('button', { name: /export csvs/i }) as HTMLButtonElement;
      expect(exportBtn.disabled).toBe(true);
    });

    it('enables "Export CSVs" button only when completedCount > 0 AND isRunning is false', () => {
      render(
        <LanguageProvider>
          <StudioToolbar {...defaultToolbarProps} isRunning={false} completedCount={5} />
        </LanguageProvider>
      );

      const exportBtn = screen.getByRole('button', { name: /export csvs/i }) as HTMLButtonElement;
      expect(exportBtn.disabled).toBe(false);
    });
  });

  describe('Global Action Buttons & State Separation', () => {
    it('disables "Start Generation" when isRunning is true', () => {
      render(
        <LanguageProvider>
          <StudioToolbar {...defaultToolbarProps} isRunning={true} brandNewPendingCount={2} />
        </LanguageProvider>
      );

      const startBtn = screen.getByRole('button', { name: /start generation/i }) as HTMLButtonElement;
      expect(startBtn.disabled).toBe(true);
    });

    it('renders "Regenerate All" button when completedCount > 0 and calls onRegenerateAll', () => {
      const onRegenerateAll = vi.fn();
      render(
        <LanguageProvider>
          <StudioToolbar {...defaultToolbarProps} completedCount={3} onRegenerateAll={onRegenerateAll} />
        </LanguageProvider>
      );

      const regenAllBtn = screen.getByRole('button', { name: /regenerate all/i });
      expect(regenAllBtn).toBeTruthy();
      fireEvent.click(regenAllBtn);
      expect(onRegenerateAll).toHaveBeenCalledTimes(1);
    });

    it('renders "Retry Failed" button when failedCount > 0 and calls onRetryFailed', () => {
      const onRetryFailed = vi.fn();
      render(
        <LanguageProvider>
          <StudioToolbar {...defaultToolbarProps} failedCount={2} onRetryFailed={onRetryFailed} />
        </LanguageProvider>
      );

      const retryBtn = screen.getByRole('button', { name: /retry/i });
      expect(retryBtn).toBeTruthy();
      fireEvent.click(retryBtn);
      expect(onRetryFailed).toHaveBeenCalledTimes(1);
    });

    it('triggers search query input changes', () => {
      const onSearchChange = vi.fn();
      render(
        <LanguageProvider>
          <StudioToolbar {...defaultToolbarProps} onSearchChange={onSearchChange} />
        </LanguageProvider>
      );

      const input = screen.getByPlaceholderText(/filter|search/i);
      fireEvent.change(input, { target: { value: 'sunset' } });
      expect(onSearchChange).toHaveBeenCalledWith('sunset');
    });
  });

  describe('GlobalProgressBanner State & Rendering', () => {
    it('renders progress bar with accurate progress percentage', () => {
      render(
        <GlobalProgressBanner
          queueState={{
            status: 'running',
            totalCount: 10,
            processedCount: 5,
            failedCount: 0,
            activeWorkers: 2,
            elapsedSeconds: 45,
            items: [],
          }}
          showProgressBar={true}
        />
      );

      expect(screen.getByText(/5\/10 completed/i)).toBeTruthy();
      expect(screen.getByText(/2 active/i)).toBeTruthy();
      expect(screen.getByText(/0:45/i)).toBeTruthy();
    });

    it('renders failed count badge and retry button when failedCount > 0', () => {
      const onRetryFailed = vi.fn();
      render(
        <GlobalProgressBanner
          queueState={{
            status: 'running',
            totalCount: 10,
            processedCount: 6,
            failedCount: 2,
            activeWorkers: 1,
            elapsedSeconds: 60,
            items: [],
          }}
          showProgressBar={true}
          onRetryFailed={onRetryFailed}
        />
      );

      expect(screen.getByText(/2 failed/i)).toBeTruthy();
      const retryBtn = screen.getByRole('button', { name: /retry failed/i });
      fireEvent.click(retryBtn);
      expect(onRetryFailed).toHaveBeenCalledTimes(1);
    });
  });

  describe('Unified Single-Row AssetCard & Expandable Drawer', () => {
    const mockRec: MasterMetadataRecord = {
      id: 'asset-card-test',
      filename: 'solar_panel.jpg',
      batchId: 'b1',
      thumbnailBase64: '',
      isAiGenerated: true,
      baseTitle: 'Solar Panel Array on Commercial Roof',
      detailedDescription: 'Commercial rooftop solar panel installation.',
      rankedKeywords: ['solar', 'panel', 'energy'],
      categories: {
        adobeCategoryId: 19,
        shutterstockCategories: ['Technology', 'Industrial'],
        dreamstimeCategory1: 95,
        dreamstimeCategory2: 99,
        dreamstimeCategory3: 212,
      },
      status: 'completed',
      createdAt: 1000,
    };

    const asset = {
      id: 'asset-card-test',
      filename: 'solar_panel.jpg',
      status: 'completed' as const,
      masterRecord: mockRec,
      createdAt: 1000,
    };

    it('renders dense single-row inline title and keyword count by default', () => {
      render(
        <LanguageProvider>
          <AssetCard
            asset={asset}
            rec={mockRec}
            selectedPlatforms={['adobe', 'shutterstock', 'dreamstime']}
            copiedKey={null}
            onCopyText={vi.fn()}
            onCopyAll={vi.fn()}
            onDelete={vi.fn()}
            onRegenerate={vi.fn()}
          />
        </LanguageProvider>
      );

      expect(screen.getByDisplayValue('Solar Panel Array on Commercial Roof')).toBeTruthy();
      expect(screen.getByText(/3 tags/i)).toBeTruthy();
      expect(screen.queryByText(/Dreamstime:/i)).toBeNull();
    });

    it('expands drawer on chevron click to show full editable Description textarea and agency categories', () => {
      render(
        <LanguageProvider>
          <AssetCard
            asset={asset}
            rec={mockRec}
            selectedPlatforms={['adobe', 'shutterstock', 'dreamstime']}
            copiedKey={null}
            onCopyText={vi.fn()}
            onCopyAll={vi.fn()}
            onDelete={vi.fn()}
            onRegenerate={vi.fn()}
          />
        </LanguageProvider>
      );

      const expandBtn = screen.getByRole('button', { name: /expand details/i });
      fireEvent.click(expandBtn);

      expect(screen.getByDisplayValue('Commercial rooftop solar panel installation.')).toBeTruthy();
      expect(screen.getByText(/Adobe:/i)).toBeTruthy();
      expect(screen.getByText(/Shutterstock:/i)).toBeTruthy();
      expect(screen.getByText(/Dreamstime:/i)).toBeTruthy();
    });
  });
});
