import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { StudioView } from '../../src/features/studio/StudioView';
import { LanguageProvider } from '../../src/context/LanguageContext';
import * as dbModule from '../../src/db';
import { localAiAdapter } from '../../src/services/providers';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
};

describe('StudioView: API Key Warning Banner & Navigation Flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localAiAdapter.setConnectionStatus('untested');
  });

  it('1. Cloud Mode: Shows "API Key Required" when 0 active keys exist, and navigates to Settings "keys" tab on click', async () => {
    vi.spyOn(dbModule, 'getAppSettings').mockResolvedValue({
      id: 'global',
      aiExecutionMode: 'cloud',
    } as any);

    vi.spyOn(dbModule.db.apiKeys, 'toArray').mockResolvedValue([]);

    const onOpenKeyRing = vi.fn();

    renderWithProviders(<StudioView onOpenKeyRing={onOpenKeyRing} />);

    await waitFor(() => {
      expect(screen.getByText(/API Key Required|مطلوب مفتاح API/i)).toBeDefined();
    });

    const manageBtn = screen.getByTestId('banner-manage-keys-button');
    fireEvent.click(manageBtn);

    expect(onOpenKeyRing).toHaveBeenCalledTimes(1);

    // Assert KeyRingModal overlay is NOT in the DOM
    expect(screen.queryByRole('dialog', { name: /API KeyRing & Failover/i })).toBeNull();
  });

  it('2. Local AI Mode: Shows "Local AI Server Unreachable" when local server is unreachable/untested', async () => {
    vi.spyOn(dbModule, 'getAppSettings').mockResolvedValue({
      id: 'global',
      aiExecutionMode: 'local',
      localAiConfig: {
        baseUrl: 'http://127.0.0.1:1234/v1',
        modelId: 'default',
        timeoutSeconds: 300,
      },
    } as any);

    vi.spyOn(localAiAdapter, 'testConnection').mockResolvedValue({
      success: false,
      latencyMs: 0,
      detectedModels: [],
      error: 'Connection refused',
    });

    localAiAdapter.setConnectionStatus('unreachable');

    renderWithProviders(<StudioView />);

    await waitFor(() => {
      expect(
        screen.getByText(/Local AI Server Unreachable|خادم الذكاء الاصطناعي المحلي غير متصل/i)
      ).toBeDefined();
      expect(
        screen.getByText(/Please start LM Studio and test connection in Settings|يرجى تشغيل LM Studio واختبار الاتصال في الإعدادات/i)
      ).toBeDefined();
    });
  });

  it('3. Local AI Mode: Warning banner disappears when Local AI status is explicitly connected/ready', async () => {
    vi.spyOn(dbModule, 'getAppSettings').mockResolvedValue({
      id: 'global',
      aiExecutionMode: 'local',
      localAiConfig: {
        baseUrl: 'http://127.0.0.1:1234/v1',
        modelId: 'default',
        timeoutSeconds: 300,
      },
    } as any);

    localAiAdapter.setConnectionStatus('connected');

    renderWithProviders(<StudioView />);

    await waitFor(() => {
      expect(
        screen.queryByText(/Local AI Server Unreachable|خادم الذكاء الاصطناعي المحلي غير متصل/i)
      ).toBeNull();
      expect(
        screen.queryByText(/API Key Required|مطلوب مفتاح API/i)
      ).toBeNull();
    });
  });

  it('4. KeyRingView: Switching between Cloud and Local AI tabs explicitly calls saveAppSettings to mutate SQLite', async () => {
    const saveSettingsSpy = vi.spyOn(dbModule, 'saveAppSettings').mockResolvedValue({} as any);
    const { KeyRingView } = await import('../../src/features/keyring/components/KeyRingView');

    renderWithProviders(<KeyRingView />);

    const localTab = screen.getByTestId('local-ai-tab');
    await waitFor(() => expect(localTab).toBeDefined());
    fireEvent.click(localTab);

    expect(saveSettingsSpy).toHaveBeenCalledWith({ aiExecutionMode: 'local' });

    const cloudTab = screen.getByTestId('cloud-apis-tab');
    fireEvent.click(cloudTab);

    expect(saveSettingsSpy).toHaveBeenCalledWith({ aiExecutionMode: 'cloud' });
  });

  it('5. Dynamic Event: StudioView immediately updates isLocalMode on stockflow:ai-mode-changed', async () => {
    vi.spyOn(dbModule, 'getAppSettings').mockResolvedValue({
      id: 'global',
      aiExecutionMode: 'cloud',
    } as any);
    vi.spyOn(dbModule.db.apiKeys, 'toArray').mockResolvedValue([]);
    localAiAdapter.setConnectionStatus('connected');

    renderWithProviders(<StudioView />);

    await waitFor(() => {
      expect(screen.getByText(/API Key Required|مطلوب مفتاح API/i)).toBeDefined();
    });

    // Fire the stockflow:ai-mode-changed event with 'local'
    act(() => {
      window.dispatchEvent(new CustomEvent('stockflow:ai-mode-changed', { detail: 'local' }));
    });

    // Banner should immediately disappear because Local AI is connected!
    await waitFor(() => {
      expect(screen.queryByText(/API Key Required|مطلوب مفتاح API/i)).toBeNull();
    });
  });
});
