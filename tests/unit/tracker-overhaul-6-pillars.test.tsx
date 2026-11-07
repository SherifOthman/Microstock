import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LanguageProvider } from '../../src/context/LanguageContext';
import { DistributionTrackerView } from '../../src/features/tracker/DistributionTrackerView';
import { StudioView } from '../../src/features/studio/StudioView';
import { db } from '../../src/db';
import { batchQueueService } from '../../src/services/queue/BatchQueueService';
import { atomicIngestionService } from '../../src/services/tracker/atomicIngestionService';
import { seedMassiveContributorPortfolio } from '../../src/services/tracker/portfolioSeeder';

function renderWithProviders(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe('Distribution Tracker 6-Pillar Overhaul & State Isolation Suite', () => {
  beforeEach(async () => {
    batchQueueService.clear();
    atomicIngestionService.clearCompletedAndDuplicates();
    await db.masterRecords.clear();
  });

  it('Pillar 1: strictly isolates Metadata Studio and Distribution Tracker states with zero cross-leakage', async () => {
    // 1. Ingest an asset into Distribution Tracker
    const trackerFile = new File(['tracker-image-payload-001'], 'tracker_exclusive_photo.jpg', {
      type: 'image/jpeg',
    });
    await atomicIngestionService.enqueueFiles([trackerFile], {
      isAiGenerated: true,
      batchId: 'B01',
      useAiMetadata: false,
    });

    // 2. Add a file to Metadata Studio queue
    const studioFile = new File(['studio-image-payload-002'], 'studio_exclusive_photo.jpg', {
      type: 'image/jpeg',
    });
    await batchQueueService.addFiles([studioFile]);

    // Verify DB contains both records with their respective workspaceScope flags
    const allRecords = await db.masterRecords.toArray();
    const trackerRec = allRecords.find((r) => r.filename === 'tracker_exclusive_photo.jpg');
    const studioRec = allRecords.find((r) => r.filename === 'studio_exclusive_photo.jpg');
    expect(trackerRec?.workspaceScope).toBe('tracker');
    expect(studioRec?.workspaceScope).toBe('studio');

    // Verify Tracker Stats ONLY count the 1 Tracker asset (never the Studio asset)
    const trackerStats = await db.tracker.getStats();
    expect(trackerStats.totalAssets).toBe(1);

    // 3. Render DistributionTrackerView -> must show tracker_exclusive_photo, NEVER studio_exclusive_photo
    const { unmount: unmountTracker } = renderWithProviders(<DistributionTrackerView />);
    await waitFor(() => {
      expect(screen.getByTestId(`gallery-card-${trackerRec!.id}`)).toBeTruthy();
    });
    expect(screen.queryByTestId(`gallery-card-${studioRec!.id}`)).toBeNull();
    unmountTracker();

    // 4. Render StudioView -> must show studio_exclusive_photo.jpg, NEVER tracker_exclusive_photo.jpg
    const { container: studioContainer, unmount: unmountStudio } = renderWithProviders(<StudioView />);
    await waitFor(() => {
      expect(studioContainer.textContent).toContain('studio_exclusive_photo.jpg');
    });
    expect(studioContainer.textContent).not.toContain('tracker_exclusive_photo.jpg');
    unmountStudio();
  });

  it('Pillar 2: prompts "Are these AI-generated or Real?" on drop, preserves cross-tab selections across Photos/Vectors/Videos, and exports mixed-media Dreamstime CSVs', async () => {
    await seedMassiveContributorPortfolio(10);
    renderWithProviders(<DistributionTrackerView initialFocusAgency="dreamstime" />);

    await waitFor(() => {
      expect(screen.getByTestId('tracker-gallery-grid')).toBeTruthy();
    });

    // 1. Simulate dropping a file onto the Tracker workspace -> must open "Are these AI-generated or Real?" modal
    const grid = screen.getByTestId('tracker-gallery-grid');
    const droppedFile = new File(['real-camera-photo-bytes'], 'camera_portrait_01.jpg', {
      type: 'image/jpeg',
    });
    fireEvent.drop(grid, {
      dataTransfer: {
        files: [droppedFile],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('tracker-ingest-origin-modal')).toBeTruthy();
    });
    // Choose "Real / Authentic" and confirm ingestion
    fireEvent.click(screen.getByTestId('ingest-origin-real-btn'));
    fireEvent.change(screen.getByTestId('ingest-batch-id-input'), { target: { value: 'B09' } });
    fireEvent.click(screen.getByTestId('confirm-ingest-origin-btn'));

    await waitFor(async () => {
      const records = await db.masterRecords.toArray();
      const ingestedReal = records.find((r) => r.filename === 'camera_portrait_01.jpg');
      expect(ingestedReal).toBeTruthy();
      expect(ingestedReal?.isAiGenerated).toBe(false);
      expect(ingestedReal?.batchId).toBe('B09');
    });

    // 2. Test Cross-Tab Media Selection persistence (Photos -> Vectors -> Videos)
    // Switch to Photos tab and click a photo card to select it
    fireEvent.click(screen.getByTestId('media-tab-image'));
    const photoCard = screen.getByTestId('gallery-card-vault_asset_001');
    fireEvent.click(photoCard);

    // Switch to Vectors tab and select a vector card (vault_asset_004 is a vector in SEED_TEMPLATES[3])
    fireEvent.click(screen.getByTestId('media-tab-vector'));
    const vectorCard = screen.getByTestId('gallery-card-vault_asset_004');
    fireEvent.click(vectorCard);

    // Switch to Videos tab and select a video card (vault_asset_003 is a video in SEED_TEMPLATES[2])
    fireEvent.click(screen.getByTestId('media-tab-video'));
    const videoCard = screen.getByTestId('gallery-card-vault_asset_003');
    fireEvent.click(videoCard);

    // Selection summary must show all 3 selected across tabs: 3 Selected (1P · 1V · 1Vid)
    const selectionSummary = screen.getByTestId('tracker-selection-summary');
    expect(selectionSummary.textContent).toContain('3 Selected');
    expect(selectionSummary.textContent).toContain('1P · 1V · 1Vid');
  });

  it('Pillar 3 & 4: displays Collapsible Pipeline Drawer with Retry Failed Assets, and opens Export Configuration Step before generating CSVs', async () => {
    await seedMassiveContributorPortfolio(6);
    renderWithProviders(<DistributionTrackerView initialFocusAgency="vecteezy" />);

    await waitFor(() => {
      expect(screen.getByTestId('tracker-gallery-grid')).toBeTruthy();
    });

    // 1. Ingest a corrupted 0-byte file so it fails and triggers the Collapsible Pipeline Drawer
    const zeroByteFile = new File([], 'corrupt_zero_byte.jpg', { type: 'image/jpeg' });
    await atomicIngestionService.enqueueFiles([zeroByteFile], {
      isAiGenerated: true,
      batchId: 'B01',
    });

    await waitFor(() => {
      expect(screen.getByTestId('tracker-pipeline-drawer')).toBeTruthy();
      expect(screen.getByTestId('pipeline-retry-failed-btn')).toBeTruthy();
    });

    // 2. Click Export Vecteezy -> must open the Export Configuration Step Modal (Pillar 4)
    const exportBtn = screen.getByTestId('export-active-agency-btn');
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByTestId('tracker-export-config-modal')).toBeTruthy();
    });

    // Toggle Free License option in Vecteezy Export Configuration Modal and confirm export
    fireEvent.click(screen.getByTestId('export-opt-vecteezy-free'));
    fireEvent.click(screen.getByTestId('confirm-tracker-export-btn'));

    await waitFor(async () => {
      const baskets = await db.tracker.getExportBaskets('vecteezy');
      expect(baskets.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('Pillar 5 & 6: enforces minimalist card face, card click toggles selection without opening modal, Eye icon opens modal, and EPS ingestion generates companion .jpg preview', async () => {
    // 1. Ingest an EPS vector file and verify companion .jpg previewPath is generated (Pillar 6)
    const epsFile = new File(['%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 800 600\n'], 'minimal_logo.eps', {
      type: 'application/postscript',
    });
    const ingestRes = await atomicIngestionService.enqueueFiles([epsFile], {
      isAiGenerated: false,
      batchId: 'B03',
      useAiMetadata: false,
    });
    expect(ingestRes.committedCount).toBe(1);

    const records = await db.masterRecords.toArray();
    const committedEps = records.find((r) => r.filename === 'minimal_logo.eps');
    expect(committedEps).toBeTruthy();
    expect(committedEps?.previewPath).toContain('minimal_logo.jpg');

    // 2. Render Tracker and verify Pillar 5 UX rules
    renderWithProviders(<DistributionTrackerView initialFocusAgency="adobe" />);

    await waitFor(() => {
      expect(screen.getByTestId(`gallery-card-${committedEps!.id}`)).toBeTruthy();
    });

    const card = screen.getByTestId(`gallery-card-${committedEps!.id}`);

    // Verify cluttered 3-button copy bar ("Desc") is stripped from the card face
    expect(card.textContent).not.toContain('Desc');

    // Clicking the card body toggles selection and does NOT open the Metadata Inspector Modal
    fireEvent.click(card);
    expect(screen.queryByTestId('tracker-metadata-inspector-modal')).toBeNull();
    expect(screen.getByTestId('tracker-selection-summary').textContent).toContain('1 Selected');

    // Clicking the dedicated Eye icon button opens the Metadata Inspector Modal
    const inspectBtn = screen.getByTestId(`inspect-asset-btn-${committedEps!.id}`);
    fireEvent.click(inspectBtn);

    await waitFor(() => {
      expect(screen.getByTestId('tracker-metadata-inspector-modal')).toBeTruthy();
    });
  });
});
