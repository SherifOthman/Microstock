import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import {
  resolve123RfRoute,
  resolveMultiAgencyRoute,
  bundleAndRoute123RfQueue,
  AGENCY_FTP_SERVER_SPECS,
  ONE_TWO_THREE_RF_FTP_HOST,
  ONE_TWO_THREE_RF_FTP_PORT,
  ONE_TWO_THREE_RF_SFTP_HOST,
  ONE_TWO_THREE_RF_SFTP_PORT,
  VECTEEZY_SFTP_HOST,
  VECTEEZY_SFTP_PORT,
  SHUTTERSTOCK_FTPS_HOST,
  SHUTTERSTOCK_FTPS_PORT,
  ADOBE_STOCK_SFTP_HOST,
  ADOBE_STOCK_SFTP_PORT,
  MAGNIFIC_SFTP_HOST,
  MAGNIFIC_SFTP_PORT,
} from '../../src/services/ftp/oneTwoThreeRfFtpRouter';
import { ftp123rfService, getFtpAgencyModuleId } from '../../src/services/ftp/Ftp123RFService';
import { OneTwoThreeRfFtpUploaderView } from '../../src/features/ftp/OneTwoThreeRfFtpUploaderView';
import {
  SUPPORTED_FTP_AGENCIES,
  resolveEffectiveFtpPreviewUrl,
} from '../../src/features/ftp/components/FtpSharedComponents';
import { LanguageProvider } from '../../src/context/LanguageContext';

describe('Multi-Protocol FTP Architecture, Isolation & Agency Rules', () => {
  beforeEach(() => {
    for (const agency of ['123rf', 'magnific', 'vecteezy', 'shutterstock', 'adobe'] as const) {
      ftp123rfService.clearQueue(agency);
    }
    ftp123rfService.setActiveAgency('123rf');
    ftp123rfService.setBatchAiGenerated(false);
  });

  it('1. 123RF Routing: Photos (.jpg), Vectors (/vector/), and Videos (SFTP:2022)', () => {
    // Non-AI Photo
    const nonAiRoute = resolve123RfRoute('image', false);
    expect(nonAiRoute.protocol).toBe('ftp');
    expect(nonAiRoute.host).toBe(ONE_TWO_THREE_RF_FTP_HOST);
    expect(nonAiRoute.port).toBe(ONE_TWO_THREE_RF_FTP_PORT);
    expect(nonAiRoute.remoteFolder).toBe('/');
    expect(nonAiRoute.isAiIgnored).toBe(false);

    // AI Photo
    const aiRoute = resolve123RfRoute('image', true);
    expect(aiRoute.protocol).toBe('ftp');
    expect(aiRoute.host).toBe(ONE_TWO_THREE_RF_FTP_HOST);
    expect(aiRoute.port).toBe(ONE_TWO_THREE_RF_FTP_PORT);
    expect(aiRoute.remoteFolder).toBe('/ai_image');
    expect(aiRoute.isAiIgnored).toBe(false);

    // Vector (AI flag strictly ignored)
    const vectorRouteAi = resolve123RfRoute('vector', true);
    expect(vectorRouteAi.protocol).toBe('ftp');
    expect(vectorRouteAi.remoteFolder).toBe('/vector');
    expect(vectorRouteAi.isAiIgnored).toBe(true);

    // Video (SFTP port 2022)
    const videoAi = resolve123RfRoute('video', true);
    expect(videoAi.protocol).toBe('sftp');
    expect(videoAi.host).toBe(ONE_TWO_THREE_RF_SFTP_HOST);
    expect(videoAi.port).toBe(ONE_TWO_THREE_RF_SFTP_PORT);
    expect(videoAi.remoteFolder).toBe('/ai_video');
  });

  it('2. Bug 1 — Queue Isolation Across Agencies & Unique SQLite moduleId per Tab', async () => {
    expect(getFtpAgencyModuleId('dreamstime')).toBe('ftp');
    expect(getFtpAgencyModuleId('123rf')).toBe('ftp_123rf');
    expect(getFtpAgencyModuleId('magnific')).toBe('ftp_magnific');
    expect(getFtpAgencyModuleId('vecteezy')).toBe('ftp_vecteezy');
    expect(getFtpAgencyModuleId('shutterstock')).toBe('ftp_shutterstock');
    expect(getFtpAgencyModuleId('adobe')).toBe('ftp_adobe');

    // Add files to Shutterstock
    await ftp123rfService.addFiles(
      [new File(['shutterstock photo'], 'ss_exclusive.jpg', { type: 'image/jpeg' })],
      'shutterstock'
    );

    expect(ftp123rfService.getQueue('shutterstock').length).toBe(1);
    expect(ftp123rfService.getQueue('shutterstock')[0].filename).toBe('ss_exclusive.jpg');

    // Verify zero queue leakage into Adobe Stock, Vecteezy, 123RF, or Magnific
    expect(ftp123rfService.getQueue('adobe').length).toBe(0);
    expect(ftp123rfService.getQueue('vecteezy').length).toBe(0);
    expect(ftp123rfService.getQueue('123rf').length).toBe(0);
    expect(ftp123rfService.getQueue('magnific').length).toBe(0);

    // Switch active agency to Adobe Stock and verify active queue is empty
    ftp123rfService.setActiveAgency('adobe');
    expect(ftp123rfService.getQueue().length).toBe(0);

    // Switch back to Shutterstock and verify its queue is intact
    ftp123rfService.setActiveAgency('shutterstock');
    expect(ftp123rfService.getQueue().length).toBe(1);
    expect(ftp123rfService.getQueue()[0].filename).toBe('ss_exclusive.jpg');
  });

  it('3. Bug 2 — Pairing Agencies (123RF, Magnific) vs. Standalone EPS Agencies (Shutterstock, Adobe Stock, Vecteezy)', () => {
    const rawFiles = [
      { name: 'b01_001_vector.jpg', size: 500_000, path: '/vault/b01_001_vector.jpg' },
      { name: 'b01_001_vector.eps', size: 2_000_000, path: '/vault/b01_001_vector.eps' },
      { name: 'b01_037_standalone_photo.jpg', size: 800_000, path: '/vault/b01_037_standalone_photo.jpg' },
    ];

    // A. Pairing Agencies: 123RF and Magnific pair .jpg + .eps (.jpg order 1, .eps order 2)
    for (const pairingAgency of ['123rf', 'magnific'] as const) {
      const pairedQueue = bundleAndRoute123RfQueue(rawFiles, false, pairingAgency);
      expect(pairedQueue.length).toBe(2); // 1 standalone photo + 1 vector pair

      const vecPair = pairedQueue.find((q) => q.mediaType === 'vector');
      expect(vecPair).toBeDefined();
      expect(vecPair?.isVectorBundle).toBe(true);
      expect(vecPair?.jpgPart?.filename).toBe('b01_001_vector.jpg');
      expect(vecPair?.jpgPart?.order).toBe(1);
      expect(vecPair?.epsPart?.filename).toBe('b01_001_vector.eps');
      expect(vecPair?.epsPart?.order).toBe(2);
    }

    // B. Standalone Agencies: Shutterstock, Adobe Stock, Vecteezy skip companion .jpg and queue ONLY .eps
    for (const standaloneAgency of ['shutterstock', 'adobe', 'vecteezy'] as const) {
      const standaloneQueue = bundleAndRoute123RfQueue(rawFiles, false, standaloneAgency);
      expect(standaloneQueue.length).toBe(2); // 1 standalone photo + 1 standalone .eps (companion .jpg excluded!)

      const vecItem = standaloneQueue.find((q) => q.mediaType === 'vector');
      expect(vecItem).toBeDefined();
      expect(vecItem?.isVectorBundle).toBe(false);
      expect(vecItem?.filename).toBe('b01_001_vector.eps');
      expect(vecItem?.jpgPart).toBeUndefined();
      expect(vecItem?.epsPart).toBeUndefined();
      // Companion .jpg path is still retained on previewLocalPath for thumbnail rendering!
      expect(vecItem?.previewLocalPath).toBe('/vault/b01_001_vector.jpg');

      // Ensure companion .jpg was NOT queued as a photo
      const photoItems = standaloneQueue.filter((q) => q.mediaType === 'image');
      expect(photoItems.length).toBe(1);
      expect(photoItems[0].filename).toBe('b01_037_standalone_photo.jpg');
    }
  });

  it('4. Bug 3 — Standardize Queue Sorting Order: 1. Photos (.jpg), 2. Vectors (.eps/pairs), 3. Videos (.mp4/.mov), 4. Metadata (.csv)', () => {
    const unsortedFiles = [
      { name: 'metadata.csv', size: 4096, path: '/vault/metadata.csv' },
      { name: 'clip_01.mp4', size: 10_000_000, path: '/vault/clip_01.mp4' },
      { name: 'art_01.eps', size: 2_000_000, path: '/vault/art_01.eps' },
      { name: 'art_01.jpg', size: 500_000, path: '/vault/art_01.jpg' },
      { name: 'photo_01.jpg', size: 1_500_000, path: '/vault/photo_01.jpg' },
    ];

    // Check sorting on Pairing Agency (123RF)
    const queue123rf = bundleAndRoute123RfQueue(unsortedFiles, false, '123rf');
    expect(queue123rf.map((i) => i.filename)).toEqual([
      'photo_01.jpg',
      'art_01.(jpg+eps)',
      'clip_01.mp4',
      'metadata.csv',
    ]);

    // Check sorting on Standalone EPS Agency (Shutterstock)
    const queueShutterstock = bundleAndRoute123RfQueue(unsortedFiles, false, 'shutterstock');
    expect(queueShutterstock.map((i) => i.filename)).toEqual([
      'photo_01.jpg',
      'art_01.eps',
      'clip_01.mp4',
      'metadata.csv',
    ]);
  });

  it('5. Bug 4 — EPS Thumbnail Rendering Resolves Companion .jpg Preview Instead of Raw .eps Path', async () => {
    await ftp123rfService.addNativeFiles(
      [
        { name: 'b01_001_car.jpg', size: 400_000, path: 'C:\\Shoot\\b01_001_car.jpg' },
        { name: 'b01_001_car.eps', size: 3_200_000, path: 'C:\\Shoot\\b01_001_car.eps' },
      ],
      'shutterstock'
    );

    const ssQueue = ftp123rfService.getQueue('shutterstock');
    expect(ssQueue.length).toBe(1);
    expect(ssQueue[0].filename).toBe('b01_001_car.eps');
    expect(ssQueue[0].previewUrl).toContain(encodeURIComponent('C:\\Shoot\\b01_001_car.jpg'));
    expect(ssQueue[0].previewUrl).not.toContain('.eps');

    // Also verify UI helper rewrites any raw .eps stockflow:// URL to its .jpg sibling
    const resolvedFromRawEps = resolveEffectiveFtpPreviewUrl({
      id: 'test-eps',
      filename: 'icon_set.eps',
      mediaType: 'vector',
      remoteFolder: '/',
      fileSize: 1000,
      bytesTransferred: 0,
      progressPercent: 0,
      status: 'queued',
      retryCount: 0,
      maxRetries: 5,
      localPath: 'C:\\Shoot\\icon_set.eps',
    });
    expect(resolvedFromRawEps).toBe(
      `stockflow://local?path=${encodeURIComponent('C:\\Shoot\\icon_set.jpg')}`
    );
  });

  it('6. Bug 5 — Freepik FTP Tab Purged (Magnific SFTP 60022 Preserved) & 123RF AI Batch State Isolated', async () => {
    const agencyIds = SUPPORTED_FTP_AGENCIES.map((a) => a.id);
    expect(agencyIds).not.toContain('freepik');
    expect(agencyIds).toEqual([
      'dreamstime',
      '123rf',
      'magnific',
      'vecteezy',
      'shutterstock',
      'adobe',
    ]);
    expect((AGENCY_FTP_SERVER_SPECS as any).freepik).toBeUndefined();

    const magnificRoute = resolveMultiAgencyRoute('magnific', 'image', true);
    expect(magnificRoute.protocol).toBe('sftp');
    expect(magnificRoute.host).toBe(MAGNIFIC_SFTP_HOST);
    expect(magnificRoute.port).toBe(MAGNIFIC_SFTP_PORT);
    expect(magnificRoute.port).toBe(60022);

    const vecteezyRoute = resolveMultiAgencyRoute('vecteezy', 'image', true);
    expect(vecteezyRoute.protocol).toBe('sftp');
    expect(vecteezyRoute.host).toBe(VECTEEZY_SFTP_HOST);
    expect(vecteezyRoute.port).toBe(VECTEEZY_SFTP_PORT);

    const shutterstockRoute = resolveMultiAgencyRoute('shutterstock', 'video', true);
    expect(shutterstockRoute.protocol).toBe('ftps');
    expect(shutterstockRoute.host).toBe(SHUTTERSTOCK_FTPS_HOST);
    expect(shutterstockRoute.port).toBe(SHUTTERSTOCK_FTPS_PORT);
    expect(shutterstockRoute.explicitTls).toBe(true);

    const adobeRoute = resolveMultiAgencyRoute('adobe', 'vector', false);
    expect(adobeRoute.protocol).toBe('sftp');
    expect(adobeRoute.host).toBe(ADOBE_STOCK_SFTP_HOST);
    expect(adobeRoute.port).toBe(ADOBE_STOCK_SFTP_PORT);

    // Enable 123RF AI Batch toggle and verify it only affects 123RF
    ftp123rfService.setBatchAiGenerated(true);
    expect(ftp123rfService.getBatchIsAiGenerated('123rf')).toBe(true);
    expect(ftp123rfService.getBatchIsAiGenerated('magnific')).toBe(false);
    expect(ftp123rfService.getBatchIsAiGenerated('shutterstock')).toBe(false);
  });

  it('7. UI renders AI Toggle on 123RF and dynamically updates destination routing for photos and videos while keeping vectors in /vector/', async () => {
    render(
      <LanguageProvider>
        <OneTwoThreeRfFtpUploaderView selectedAgency="123rf" />
      </LanguageProvider>
    );

    const toggle = screen.getByTestId('batch-ai-toggle') as HTMLInputElement;
    expect(toggle).toBeDefined();
    expect(toggle.checked).toBe(false);

    await act(async () => {
      await ftp123rfService.addFiles(
        [
          new File(['photo content'], 'landscape.jpg', { type: 'image/jpeg' }),
          new File(['vector jpg preview'], 'logo.jpg', { type: 'image/jpeg' }),
          new File(['vector eps binary'], 'logo.eps', { type: 'application/postscript' }),
          new File(['video content'], 'ocean.mp4', { type: 'video/mp4' }),
        ],
        '123rf'
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Folder: \/vector/i)).toBeDefined();
      expect(screen.getAllByText(/Folder: \//i).length).toBeGreaterThanOrEqual(2);
    });

    const activeToggle = screen.getByTestId('batch-ai-toggle') as HTMLInputElement;
    act(() => {
      fireEvent.click(activeToggle);
    });
    expect(activeToggle.checked).toBe(true);

    await waitFor(() => {
      expect(screen.getByText(/Folder: \/ai_image/i)).toBeDefined();
      expect(screen.getByText(/Folder: \/ai_video/i)).toBeDefined();
      expect(screen.getByText(/Folder: \/vector/i)).toBeDefined();
      expect(screen.getByText(/Non-AI Vector/i)).toBeDefined();
    });
  });

  it('8. FTP Credentials Persistence Across All Stock Agencies & App Reopen', async () => {
    const { db } = await import('../../src/db');
    const { dreamstimeFtpService } = await import('../../src/services/ftp/ftpClientService');

    // 1. Save Dreamstime credentials
    await dreamstimeFtpService.saveDreamstimeCredentials({
      host: 'upload.dreamstime.com',
      username: 'dt_studio_user',
      password: 'dt_secret_password',
    });

    // 2. Save credentials for all other stock agencies
    const agenciesToTest = [
      { id: '123rf' as const, user: 'user_123rf', pass: 'pass_123rf' },
      { id: 'magnific' as const, user: 'user_magnific', pass: 'pass_magnific' },
      { id: 'vecteezy' as const, user: 'user_vecteezy', pass: 'pass_vecteezy' },
      { id: 'shutterstock' as const, user: 'user_shutterstock', pass: 'pass_shutterstock' },
      { id: 'adobe' as const, user: 'user_adobe', pass: 'pass_adobe' },
    ];

    for (const agency of agenciesToTest) {
      await ftp123rfService.saveCredentials({
        agencyId: agency.id,
        username: agency.user,
        password: agency.pass,
      });
    }

    // 3. Verify each agency profile is persisted in db.ftp and localStorage
    const dtProfile = await db.ftp.getProfile('dreamstime');
    expect(dtProfile.username).toBe('dt_studio_user');
    expect(dtProfile.hasSavedPassword).toBe(true);

    for (const agency of agenciesToTest) {
      const prof = await db.ftp.getProfile(agency.id);
      expect(prof.username).toBe(agency.user);
      expect(prof.hasSavedPassword).toBe(true);

      const rawLocal = window.localStorage.getItem(`stockflow_ftp_profile_${agency.id}`);
      expect(rawLocal).toBeTruthy();
      const parsedLocal = JSON.parse(rawLocal!);
      expect(parsedLocal.username).toBe(agency.user);
      expect(parsedLocal.hasSavedPassword).toBe(true);
    }

    // 4. Mount OneTwoThreeRfFtpUploaderView for Shutterstock (simulating app reopen) and verify Online status + prefilled credentials
    const { unmount } = render(
      <LanguageProvider>
        <OneTwoThreeRfFtpUploaderView selectedAgency="shutterstock" />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Online')).toBeDefined();
    });

    // Open Site Settings modal and verify saved username & masked password are populated
    fireEvent.click(screen.getByTestId('123rf-credentials-button'));

    await waitFor(() => {
      const userInp = screen.getByTestId('ftp-username-input') as HTMLInputElement;
      const passInp = screen.getByTestId('ftp-password-input') as HTMLInputElement;
      expect(userInp.value).toBe('user_shutterstock');
      expect(passInp.value).toBe('••••••••••••');
    });

    unmount();
  });
});

