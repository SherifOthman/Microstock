import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HomeHubView } from '../../src/features/home/HomeHubView';
import { DistributionTrackerView } from '../../src/features/tracker/DistributionTrackerView';
import { FtpUploaderView } from '../../src/features/ftp/FtpUploaderView';
import { LanguageProvider } from '../../src/context/LanguageContext';
import {
  seedMassiveContributorPortfolio,
  getCleanAssetDisplayTitle,
} from '../../src/services/tracker/portfolioSeeder';
import { db } from '../../src/db';

function renderWithProviders(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe('Step 2 Self-Audit: 50-Asset Seeding & Visual-First UX Verification', () => {
  beforeEach(async () => {
    await db.masterRecords.clear();
  });

  it('1. seeds 50 realistic heterogeneous assets (20 New, 15 Pending Upload, 10 Accepted/Uploaded, 5 Rejected with reasons)', async () => {
    const res = await seedMassiveContributorPortfolio(50);
    expect(res.seededCount).toBe(50);

    const records = await db.masterRecords.toArray();
    expect(records).toHaveLength(50);

    const stats = await db.tracker.getStats();
    expect(stats.totalAssets).toBe(50);
    expect(stats.perAgencyStats.adobe.New).toBe(20);
    expect(stats.perAgencyStats.adobe['Pending Upload']).toBe(15);
    expect(
      stats.perAgencyStats.adobe.Accepted + stats.perAgencyStats.adobe.Uploaded
    ).toBe(10);
    expect(stats.perAgencyStats.adobe.Rejected).toBe(5);

    // Every seeded asset has a valid visual thumbnail data URI and clean human title
    for (const r of records) {
      expect(r.thumbnailBase64.startsWith('data:image/svg+xml')).toBe(true);
      const cleanTitle = getCleanAssetDisplayTitle(r);
      expect(cleanTitle).not.toMatch(/^B\d{2}_/i);
      expect(cleanTitle.length).toBeGreaterThan(10);
    }
  });

  it('2. audits HomeHubView (Overview): renders 6 Agency Readiness Cards with 1-click jump to Tracker Focus Mode and zero tutorial clutter', async () => {
    await seedMassiveContributorPortfolio(50);
    const onNavigate = vi.fn();

    const { container } = renderWithProviders(
      <HomeHubView onNavigate={onNavigate} />
    );

    // Wait for SQLite query hook to populate the 50 assets
    await waitFor(() => {
      expect(screen.getByText(/50 Assets in Vault/i)).toBeTruthy();
    });

    // Verify all 6 Agency Readiness Cards exist
    const adobeCard = screen.getByTestId('agency-readiness-card-adobe');
    const freepikCard = screen.getByTestId('agency-readiness-card-freepik');
    const shutterCard = screen.getByTestId('agency-readiness-card-shutterstock');
    const vecteezyCard = screen.getByTestId('agency-readiness-card-vecteezy');
    const dreamstimeCard = screen.getByTestId('agency-readiness-card-dreamstime');
    const rfCard = screen.getByTestId('agency-readiness-card-123rf');

    expect(adobeCard).toBeTruthy();
    expect(freepikCard).toBeTruthy();
    expect(shutterCard).toBeTruthy();
    expect(vecteezyCard).toBeTruthy();
    expect(dreamstimeCard).toBeTruthy();
    expect(rfCard).toBeTruthy();

    // Clicking Adobe Stock Readiness Card jumps straight to Tracker focused on 'adobe'
    fireEvent.click(adobeCard);
    expect(onNavigate).toHaveBeenCalledWith('tracker', 'adobe');

    // Verify analytics charts are present on Overview
    expect(screen.getByTestId('tracker-analytics-charts')).toBeTruthy();

    // Verify legacy clutter ("STEP 01", "Master Brain", "Ghostscript Pool") is 100% gone
    expect(container.textContent).not.toContain('STEP 01');
    expect(container.textContent).not.toContain('Master Brain');
    expect(container.textContent).not.toContain('Ghostscript Pool');
  });

  it('3. audits DistributionTrackerView: defaults to Visual Gallery Grid with single active agency status per card, clean titles, Open Master Folder, and toggles to Compact List', async () => {
    await seedMassiveContributorPortfolio(50);
    const onFixAndRequeue = vi.fn();

    const { container } = renderWithProviders(
      <DistributionTrackerView
        initialFocusAgency="adobe"
        onFixAndRequeue={onFixAndRequeue}
      />
    );

    // Wait for 50 gallery cards to render
    await waitFor(() => {
      expect(screen.getByTestId('tracker-gallery-grid')).toBeTruthy();
    });

    const firstCard = screen.getByTestId('gallery-card-vault_asset_001');
    expect(firstCard).toBeTruthy();

    // 1. Verify clean display title is shown instead of raw filename
    expect(firstCard.textContent).toContain(
      'Minimalist Travertine Kitchen Island Morning Sun'
    );
    expect(firstCard.textContent).not.toContain('B01_AI_PH_001_');

    // 2. Verify 50 keywords are NOT dumped inside the gallery card
    expect(firstCard.textContent).not.toContain('photovoltaic');
    expect(firstCard.textContent).toContain('45 tags');

    // 3. Verify ONLY the active agency status dropdown is rendered on the card (1 status trigger per card)
    const statusTrigger = screen.getByTestId('card-status-trigger-vault_asset_001');
    expect(statusTrigger.textContent).toContain('New');

    // 4. Verify Open Master Folder button and Export Adobe (20) button exist
    expect(screen.getByTestId('open-master-folder-btn')).toBeTruthy();
    const exportBtn = screen.getByTestId('export-active-agency-btn');
    expect(exportBtn.textContent).toContain('Export Adobe (20)');

    // 5. Verify Atomic Ingestion box is completely hidden when idle
    expect(screen.queryByTestId('slim-ingestion-progress')).toBeNull();
    expect(container.textContent).not.toContain('Atomic Ingestion');
    expect(container.textContent).not.toContain('Auto-Fill');

    // 6. Toggle to Clean Compact List View and verify it switches cleanly
    const listToggleBtn = screen.getByTestId('view-mode-list-btn');
    fireEvent.click(listToggleBtn);

    await waitFor(() => {
      expect(screen.getByTestId('tracker-compact-list')).toBeTruthy();
    });
  });

  it('4. audits FtpUploaderView: renders minimalist Dreamstime uploader without fault-injection or SQLite debug clutter', async () => {
    const { container } = renderWithProviders(<FtpUploaderView />);

    expect(screen.getByTestId('ftp-uploader-view')).toBeTruthy();
    expect(container.textContent).toContain('Dreamstime FTP Uploader');
    expect(container.textContent).toContain('Auto-Routing Rules');
    expect(container.textContent).toContain('/additional');
    expect(container.textContent).toContain('/video');

    // Verify debug clutter was removed
    expect(container.textContent).not.toContain('3x Exponential Backoff');
    expect(container.textContent).not.toContain('SQLite Audit Logs');
  });
});
