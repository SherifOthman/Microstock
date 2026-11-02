import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BatchTypeSelectorModal } from '../../src/components/renamer/BatchTypeSelectorModal';
import { RenamerPreviewTable } from '../../src/components/renamer/RenamerPreviewTable';
import { RenamerFileItem } from '../../src/types/renamer';

describe('Tier 3 UI State: Renamer Workflow & Segregation Components', () => {
  describe('BatchTypeSelectorModal Gatekeeper', () => {
    it('renders gatekeeper modal with both AI and Native choices', () => {
      render(
        <BatchTypeSelectorModal
          open={true}
          onClose={vi.fn()}
          onSelectType={vi.fn()}
          filesCount={10}
        />
      );

      expect(screen.getByText(/Microstock Renamer Gatekeeper/i)).toBeTruthy();
      expect(screen.getByText(/AI-Generated/i)).toBeTruthy();
      expect(screen.getByText(/Native \/ Standard/i)).toBeTruthy();
    });

    it('triggers onSelectType with "AI" when AI option is clicked', () => {
      const onSelectType = vi.fn();
      render(
        <BatchTypeSelectorModal
          open={true}
          onClose={vi.fn()}
          onSelectType={onSelectType}
          filesCount={5}
        />
      );

      const aiCard = screen.getByText(/AI-Generated/i).closest('button');
      expect(aiCard).toBeTruthy();
      fireEvent.click(aiCard!);
      expect(onSelectType).toHaveBeenCalledWith('AI');
    });

    it('triggers onSelectType with "NATIVE" when Native option is clicked', () => {
      const onSelectType = vi.fn();
      render(
        <BatchTypeSelectorModal
          open={true}
          onClose={vi.fn()}
          onSelectType={onSelectType}
          filesCount={5}
        />
      );

      const nativeCard = screen.getByText(/Native \/ Standard/i).closest('button');
      expect(nativeCard).toBeTruthy();
      fireEvent.click(nativeCard!);
      expect(onSelectType).toHaveBeenCalledWith('NATIVE');
    });

    it('triggers onClose when Cancel button is clicked', () => {
      const onClose = vi.fn();
      render(
        <BatchTypeSelectorModal
          open={true}
          onClose={onClose}
          onSelectType={vi.fn()}
          filesCount={3}
        />
      );

      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('RenamerPreviewTable Component', () => {
    const mockItems: RenamerFileItem[] = [
      {
        id: '1',
        originalFile: { name: 'neon_city_night.jpg', size: 1000 },
        originalName: 'neon_city_night.jpg',
        cleanName: 'neon_city_night',
        mediaType: 'photo',
        batchType: 'AI',
        track: 'AI_Photos',
        batchNumber: 1,
        sequenceNumber: 1,
        proposedFilename: 'B01_AI_PH_001_neon_city_night.jpg',
        newFilename: 'B01_AI_PH_001_neon_city_night.jpg',
        targetFolder: 'AI_Photos',
        needsFixing: false,
        status: 'pending',
      },
      {
        id: '2',
        originalFile: { name: '425997637_1793366301908538.mp4', size: 2000 },
        originalName: '425997637_1793366301908538.mp4',
        cleanName: '425997637_1793366301908538',
        mediaType: 'video',
        batchType: 'AI',
        track: 'AI_Videos',
        batchNumber: 1,
        sequenceNumber: 0,
        proposedFilename: '425997637_1793366301908538.mp4',
        newFilename: '425997637_1793366301908538.mp4',
        targetFolder: '_Needs_Fixing',
        needsFixing: true,
        fixingReason: 'Filename does not contain descriptive words.',
        status: 'pending',
      },
      {
        id: '3',
        originalFile: { name: 'B01_AI_PH_005_already_done.jpg', size: 1000 },
        originalName: 'B01_AI_PH_005_already_done.jpg',
        cleanName: 'already_done',
        mediaType: 'photo',
        batchType: 'AI',
        track: 'AI_Photos',
        batchNumber: 1,
        sequenceNumber: 0,
        proposedFilename: 'B01_AI_PH_005_already_done.jpg',
        newFilename: 'B01_AI_PH_005_already_done.jpg',
        targetFolder: 'AI_Photos',
        needsFixing: false,
        isAlreadyFormatted: true,
        status: 'skipped',
      },
    ];

    const mockStats = {
      total: 3,
      ready: 1,
      needsFixing: 1,
      alreadyFormatted: 1,
      vectorPairs: 0,
    };

    it('renders preview table with files and target folders', () => {
      render(
        <RenamerPreviewTable
          items={mockItems}
          batchType="AI"
          stats={mockStats}
          isRenaming={false}
          onExecute={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText('neon_city_night.jpg')).toBeTruthy();
      expect(screen.getByText('B01_AI_PH_001_neon_city_night.jpg')).toBeTruthy();
      expect(screen.getAllByText(/AI_Photos\//i).length).toBeGreaterThan(0);
    });

    it('renders _Needs_Fixing badge for items failing word criteria', () => {
      render(
        <RenamerPreviewTable
          items={mockItems}
          batchType="AI"
          stats={mockStats}
          isRenaming={false}
          onExecute={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText('_Needs_Fixing')).toBeTruthy();
      expect(screen.getByText(/_Needs_Fixing\//i)).toBeTruthy();
    });

    it('renders Skipped badge for already formatted items', () => {
      render(
        <RenamerPreviewTable
          items={mockItems}
          batchType="AI"
          stats={mockStats}
          isRenaming={false}
          onExecute={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText('Skipped')).toBeTruthy();
    });

    it('disables Apply Renaming button when ready stats count is 0', () => {
      render(
        <RenamerPreviewTable
          items={mockItems}
          batchType="AI"
          stats={{ ...mockStats, ready: 0 }}
          isRenaming={false}
          onExecute={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const applyBtn = screen.getByRole('button', { name: /apply renaming/i }) as HTMLButtonElement;
      expect(applyBtn.disabled).toBe(true);
    });

    it('enables Apply Renaming button when ready count > 0 and calls onExecute', () => {
      const onExecute = vi.fn();
      render(
        <RenamerPreviewTable
          items={mockItems}
          batchType="AI"
          stats={mockStats}
          isRenaming={false}
          onExecute={onExecute}
          onCancel={vi.fn()}
        />
      );

      const applyBtn = screen.getByRole('button', { name: /apply renaming/i }) as HTMLButtonElement;
      expect(applyBtn.disabled).toBe(false);
      fireEvent.click(applyBtn);
      expect(onExecute).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when Cancel & Clear button is clicked', () => {
      const onCancel = vi.fn();
      render(
        <RenamerPreviewTable
          items={mockItems}
          batchType="AI"
          stats={mockStats}
          isRenaming={false}
          onExecute={vi.fn()}
          onCancel={onCancel}
        />
      );

      const cancelBtn = screen.getByRole('button', { name: /cancel & clear/i });
      fireEvent.click(cancelBtn);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('shows loading spinner on execute button when isRenaming is true', () => {
      render(
        <RenamerPreviewTable
          items={mockItems}
          batchType="AI"
          stats={mockStats}
          isRenaming={true}
          onExecute={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText(/Renaming Files\.\.\./i)).toBeTruthy();
      const renamingBtn = screen.getByRole('button', { name: /renaming files/i }) as HTMLButtonElement;
      expect(renamingBtn.disabled).toBe(true);
    });
  });
});
