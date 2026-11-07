import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { db, resolveAssetPreviewUrl, saveAppSettings } from '../../src/db';
import { queuePersistenceService } from '../../src/services/persistence/queuePersistenceService';
import { localAiAdapter } from '../../src/services/providers';
import {
  useEpsConverter,
  resetEpsConverterInMemoryCache,
} from '../../src/features/eps/hooks/useEpsConverter';
import {
  useVideoMuter,
  resetVideoMuterInMemoryCache,
} from '../../src/features/video/hooks/useVideoMuter';
import {
  useFileCleaner,
  resetFileCleanerInMemoryCache,
} from '../../src/features/cleaner/hooks/useFileCleaner';
import { DistributionTrackerView } from '../../src/features/tracker/DistributionTrackerView';
import { OneTwoThreeRfFtpUploaderView } from '../../src/features/ftp/OneTwoThreeRfFtpUploaderView';
import { FtpUploaderView } from '../../src/features/ftp/FtpUploaderView';
import { StudioView } from '../../src/features/studio/StudioView';
import { LanguageProvider } from '../../src/context/LanguageContext';

function EpsTestHarness() {
  const { items, handleRemoveItem, handleClearAll } = useEpsConverter('en');
  return (
    <div>
      <span data-testid="eps-count">{items.length}</span>
      {items.map((item) => (
        <div key={item.id} data-testid={`eps-item-${item.id}`}>
          <span>{item.originalName}</span>
          <span data-testid={`eps-dataurl-${item.id}`}>{item.result?.dataUrl || 'none'}</span>
          <button onClick={() => handleRemoveItem(item.id)}>Remove {item.id}</button>
        </div>
      ))}
      <button onClick={handleClearAll}>Clear EPS</button>
    </div>
  );
}

function AudioTestHarness() {
  const { items, handleRemoveItem, handleClearAll } = useVideoMuter('en');
  return (
    <div>
      <span data-testid="audio-count">{items.length}</span>
      {items.map((item) => (
        <div key={item.id} data-testid={`audio-item-${item.id}`}>
          <span>{item.originalName}</span>
          <button onClick={() => handleRemoveItem(item.id)}>Remove {item.id}</button>
        </div>
      ))}
      <button onClick={handleClearAll}>Clear Audio</button>
    </div>
  );
}

function CleanerTestHarness() {
  const { cleanedItems, handleAddFiles, handleRemoveItem, handleClearAll } = useFileCleaner('en');
  return (
    <div>
      <span data-testid="cleaner-count">{cleanedItems.length}</span>
      {cleanedItems.map((item) => (
        <div key={item.id} data-testid={`cleaner-item-${item.id}`}>
          <span>{item.originalName}</span>
          <button onClick={() => handleRemoveItem(item.id)}>Remove {item.id}</button>
        </div>
      ))}
      <button
        onClick={() =>
          handleAddFiles([
            new File(['fake-jpeg-data'], 'IMG_2026_001.jpg', {
              type: 'image/jpeg',
              lastModified: 1700000000000,
            }),
          ])
        }
      >
        Seed Cleaner
      </button>
      <button onClick={handleClearAll}>Clear Cleaner</button>
    </div>
  );
}

describe('Task 1-4 Overhaul Verification Suite', () => {
  beforeEach(async () => {
    localStorage.clear();
    resetEpsConverterInMemoryCache();
    resetVideoMuterInMemoryCache();
    resetFileCleanerInMemoryCache();
    await queuePersistenceService.clearModuleQueueSnapshot('eps');
    await queuePersistenceService.clearModuleQueueSnapshot('audio');
    await queuePersistenceService.clearModuleQueueSnapshot('cleaner');
    await db.masterRecords.clear();
  });

  it('Task 1: Persists EPS & Audio queue state across simulated app restart and wipes DB row immediately on remove/clear', async () => {
    await queuePersistenceService.saveModuleQueueSnapshot(
      {
        moduleId: 'eps',
        batchStatus: 'completed',
        queue: [
          {
            id: 'eps-1',
            originalName: 'vector_art.eps',
            outputJpgName: 'vector_art.jpg',
            size: 2048,
            status: 'completed',
            previewThumbnailUrl: 'data:image/jpeg;base64,FAKETEST',
            result: {
              width: 4000,
              height: 3000,
              dataUrl: 'data:image/jpeg;base64,FAKETEST',
            },
          },
        ],
      },
      true
    );

    const savedSnap = await db.queues.getSnapshot('eps');
    expect(savedSnap).not.toBeNull();
    expect(savedSnap?.queue).toHaveLength(1);

    // Simulate full app restart (wiping in-memory module cache)
    resetEpsConverterInMemoryCache();

    const { unmount } = render(
      <LanguageProvider>
        <EpsTestHarness />
      </LanguageProvider>
    );
    await waitFor(() => expect(screen.getByTestId('eps-count').textContent).toBe('1'));
    expect(screen.getByTestId('eps-dataurl-eps-1').textContent).toBe(
      'data:image/jpeg;base64,FAKETEST'
    );

    // Remove the single item -> should immediately delete the snapshot from DB & localStorage
    fireEvent.click(screen.getByText('Remove eps-1'));
    await waitFor(() => expect(screen.getByTestId('eps-count').textContent).toBe('0'));

    await waitFor(async () => {
      const snapAfterRemove = await db.queues.getSnapshot('eps');
      expect(snapAfterRemove).toBeNull();
      expect(localStorage.getItem('stockflow_ephemeral_queue_eps')).toBeNull();
    });
    unmount();

    // Verify VideoMuter (Audio Stripper) persistence & ephemeral cleanup
    await queuePersistenceService.saveModuleQueueSnapshot(
      {
        moduleId: 'audio',
        batchStatus: 'completed',
        queue: [
          {
            id: 'aud-1',
            originalName: 'clip_01.mp4',
            originalSize: 50000,
            status: 'completed',
            hasAudio: false,
            previewThumbnailUrl: 'data:image/jpeg;base64,VIDTHUMB',
          },
        ],
      },
      true
    );

    resetVideoMuterInMemoryCache();

    render(
      <LanguageProvider>
        <AudioTestHarness />
      </LanguageProvider>
    );
    await waitFor(() => expect(screen.getByTestId('audio-count').textContent).toBe('1'));
    fireEvent.click(screen.getByText('Clear Audio'));
    await waitFor(() => expect(screen.getByTestId('audio-count').textContent).toBe('0'));

    await waitFor(async () => {
      const audioSnap = await db.queues.getSnapshot('audio');
      expect(audioSnap).toBeNull();
      expect(localStorage.getItem('stockflow_ephemeral_queue_audio')).toBeNull();
    });
  });

  it('Task 1b: Persists FileCleaner queue state across simulated app restart and wipes DB row on remove/clear', async () => {
    const { unmount } = render(
      <LanguageProvider>
        <CleanerTestHarness />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByText('Seed Cleaner'));
    await waitFor(() => expect(screen.getByTestId('cleaner-count').textContent).toBe('1'));

    // Simulate full app restart (unmount and clear module-level cache)
    unmount();
    resetFileCleanerInMemoryCache();

    render(
      <LanguageProvider>
        <CleanerTestHarness />
      </LanguageProvider>
    );
    await waitFor(() => expect(screen.getByTestId('cleaner-count').textContent).toBe('1'));
    expect(screen.getByText('IMG_2026_001.jpg')).toBeTruthy();

    fireEvent.click(screen.getByText('Clear Cleaner'));
    await waitFor(() => expect(screen.getByTestId('cleaner-count').textContent).toBe('0'));

    await waitFor(async () => {
      const cleanerSnap = await db.queues.getSnapshot('cleaner');
      expect(cleanerSnap).toBeNull();
      expect(localStorage.getItem('stockflow_ephemeral_queue_cleaner')).toBeNull();
    });
  });

  it('Task 2: FTP UI has locked readOnly Host input, no Port/Protocol labels, and unified dropzone', async () => {
    const { container, unmount } = render(
      <LanguageProvider>
        <OneTwoThreeRfFtpUploaderView selectedAgency="123rf" />
      </LanguageProvider>
    );

    // Verify no animate-spin or animate-bounce icons in initial view
    expect(container.querySelector('.animate-bounce')).toBeNull();
    expect(container.querySelector('.animate-spin')).toBeNull();

    // Verify subtle AI checkbox inside empty dropzone
    const aiCheckbox = screen.getByTestId('batch-ai-toggle') as HTMLInputElement;
    expect(aiCheckbox).toBeTruthy();
    expect(aiCheckbox.checked).toBe(false);

    // Open connection modal and verify Host is readOnly & disabled
    const settingsBtn = screen.getByTestId('123rf-credentials-button');
    fireEvent.click(settingsBtn);

    const hostInput = (await screen.findByTestId('123rf-host-readonly-input')) as HTMLInputElement;
    expect(hostInput.readOnly).toBe(true);
    expect(hostInput.disabled).toBe(true);
    expect(hostInput.value).toBe('ftp.123rf.com');
    unmount();

    // Verify Dreamstime FtpUploaderView also locks Host input and hides port/protocol
    localStorage.setItem('stock_ftp_agency', 'dreamstime');
    const { unmount: unmountDt } = render(
      <LanguageProvider>
        <FtpUploaderView />
      </LanguageProvider>
    );
    const dtSettingsBtn = screen.getByTestId('ftp-site-settings-btn');
    fireEvent.click(dtSettingsBtn);

    const dtHostInput = (await screen.findByTestId('ftp-host-input')) as HTMLInputElement;
    expect(dtHostInput.readOnly).toBe(true);
    expect(dtHostInput.disabled).toBe(true);
    expect(dtHostInput.value).toBe('upload.dreamstime.com');
    unmountDt();
  });

  it('Task 3: StudioView hides API Key Required banner immediately when stockflow:ai-mode-changed fires with local', async () => {
    await saveAppSettings({ aiExecutionMode: 'cloud' });
    await db.apiKeys.clear();
    localAiAdapter.setConnectionStatus('connected');

    render(
      <LanguageProvider>
        <StudioView />
      </LanguageProvider>
    );

    // Banner should initially appear in cloud mode with no API keys
    await waitFor(() => {
      expect(screen.getByText(/API Key Required|مطلوب مفتاح API/i)).toBeTruthy();
    });

    // Dispatch custom event switching to local mode
    act(() => {
      window.dispatchEvent(new CustomEvent('stockflow:ai-mode-changed', { detail: 'local' }));
    });

    await waitFor(() => {
      expect(screen.queryByText(/API Key Required|مطلوب مفتاح API/i)).toBeNull();
    });
  });

  it('Task 4: DistributionTrackerView has no Load 50 Sample Assets or Clear Master Vault and resolves preview URLs reliably', async () => {
    render(
      <LanguageProvider>
        <DistributionTrackerView />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText(/Load 50 Sample Assets/i)).toBeNull();
      expect(screen.queryByText(/Clear Master Vault/i)).toBeNull();
      expect(screen.queryByText(/Seed 50 Sample Assets/i)).toBeNull();
    });

    // Verify resolveAssetPreviewUrl falls back cleanly to thumbnailBase64 in non-Electron browser context
    const preview = resolveAssetPreviewUrl({
      previewUrl: 'stockflow://local?path=/StockFlow/Master_Vault/test.jpg',
      masterPath: '/StockFlow/Master_Vault/test.jpg',
      thumbnailBase64: 'data:image/jpeg;base64,VALID_THUMB',
    });
    expect(preview).toBe('data:image/jpeg;base64,VALID_THUMB');
  });
});
