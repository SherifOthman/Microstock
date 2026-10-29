import React, { useEffect, useState } from 'react';
import { ApiKeyRecord, AppSettings, ProviderType } from '../../../types';
import { AddKeyDialog } from './AddKeyDialog';
import { PriorityCascadeCard } from './PriorityCascadeCard';
import {
  getAllApiKeys,
  getAppSettings,
  updateApiKey,
} from '../../../db';
import { keyRingScheduler } from '../../../services/scheduler/KeyRingScheduler';

export const KeyRingView: React.FC = () => {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isAddKeyDialogOpen, setIsAddKeyDialogOpen] = useState<boolean>(false);
  const [bulkProviderTarget, setBulkProviderTarget] = useState<ProviderType>('gemini');
  const [isTestingAll, setIsTestingAll] = useState<boolean>(false);

  useEffect(() => {
    getAppSettings().then(setSettings);
    const unsubscribe = keyRingScheduler.subscribe((updated) => setKeys([...updated]));
    keyRingScheduler.init();

    // Auto-migrate any legacy/deprecated model names
    getAllApiKeys().then(async (allKeys) => {
      let migrated = false;
      for (const k of allKeys) {
        if (
          k.providerId === 'gemini' &&
          (k.modelId.includes('1.5') || k.modelId.includes('2.5') || k.modelId === 'gemini-3.8-flash')
        ) {
          await updateApiKey(k.id, {
            modelId: 'gemini-3.1-flash-lite',
            status: 'healthy',
            lastError: undefined,
          });
          migrated = true;
        }
      }
      if (migrated) {
        keyRingScheduler.refreshKeys();
      }
    });

    return () => unsubscribe();
  }, []);

  const handleTestAllKeys = async () => {
    setIsTestingAll(true);
    try {
      await keyRingScheduler.testAllKeys();
    } finally {
      setIsTestingAll(false);
    }
  };

  const handleOpenAddKey = (provider: ProviderType) => {
    setBulkProviderTarget(provider);
    setIsAddKeyDialogOpen(true);
  };

  return (
    <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
      {/* Unified Collapsible Provider Priority Accordion Stack */}
      <PriorityCascadeCard
        settings={settings}
        keys={keys}
        onSettingsUpdate={(updated) => setSettings(updated)}
        onAddKey={handleOpenAddKey}
        onTestAll={handleTestAllKeys}
        isTestingAll={isTestingAll}
      />

      {/* Add Keys & Verification Dialog */}
      <AddKeyDialog
        open={isAddKeyDialogOpen}
        initialProvider={bulkProviderTarget}
        onClose={() => setIsAddKeyDialogOpen(false)}
        onSuccess={() => {
          keyRingScheduler.refreshKeys();
        }}
      />
    </div>
  );
};
