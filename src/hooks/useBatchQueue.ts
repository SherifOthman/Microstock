/**
 * Custom Hook: useBatchQueue
 * Manages subscription to BatchQueueService and provides queue operations.
 */

import { useState, useEffect, useCallback } from 'react';
import { batchQueueService, QueueState } from '../services/queue/BatchQueueService';
import { KeywordPhrasing } from '../services/ai/metadataParser';

export function useBatchQueue() {
  const [queueState, setQueueState] = useState<QueueState>(() => batchQueueService.getState());

  useEffect(() => {
    const unsub = batchQueueService.subscribe((state) => {
      setQueueState({ ...state });
    });
    return unsub;
  }, []);

  const isRunning = queueState.status === 'running' || queueState.activeWorkers > 0;
  const isPaused = queueState.status === 'paused';

  const startQueue = useCallback(
    async (
      isAiGenerated = true,
      userPrompt?: string,
      modelName = 'Nano Banana',
      phrasing: KeywordPhrasing = 'mixed',
      titlePreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal'
    ) => {
      await batchQueueService.start(isAiGenerated, userPrompt, modelName, phrasing, titlePreset);
    },
    []
  );

  const pauseQueue = useCallback(() => {
    batchQueueService.pause();
  }, []);

  const resumeQueue = useCallback(
    (isAiGenerated = true, userPrompt?: string, modelName?: string) => {
      batchQueueService.resume(isAiGenerated, userPrompt, modelName);
    },
    []
  );

  const retryFailed = useCallback(
    async (
      isAiGenerated = true,
      userPrompt?: string,
      modelName?: string,
      phrasing: KeywordPhrasing = 'mixed',
      titlePreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal'
    ) => {
      await batchQueueService.retryFailed(isAiGenerated, userPrompt, modelName, phrasing, titlePreset);
    },
    []
  );

  const reprocessItem = useCallback(
    async (
      id: string,
      isAiGenerated = true,
      userPrompt?: string,
      modelName?: string,
      phrasing: KeywordPhrasing = 'mixed',
      titlePreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal'
    ) => {
      await batchQueueService.reprocessItem(id, isAiGenerated, userPrompt, modelName, phrasing, titlePreset);
    },
    []
  );

  const reprocessAll = useCallback(
    async (
      isAiGenerated = true,
      userPrompt?: string,
      modelName?: string,
      phrasing: KeywordPhrasing = 'mixed',
      titlePreset: 'optimal' | 'short' | 'standard' | 'extended' = 'optimal'
    ) => {
      await batchQueueService.reprocessAll(isAiGenerated, userPrompt, modelName, phrasing, titlePreset);
    },
    []
  );

  const clearQueue = useCallback(() => {
    batchQueueService.clear();
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    await batchQueueService.addFiles(files);
  }, []);

  const removeItem = useCallback((id: string) => {
    batchQueueService.removeItem(id);
  }, []);

  const showProgressBar =
    queueState.status === 'running' ||
    queueState.status === 'resizing' ||
    queueState.items.some((i) => i.status === 'processing');

  return {
    queueState,
    isRunning,
    isPaused,
    showProgressBar,
    startQueue,
    start: startQueue,
    pauseQueue,
    pause: pauseQueue,
    resumeQueue,
    resume: resumeQueue,
    retryFailed,
    reprocessItem,
    reprocessAll,
    clearQueue,
    clear: clearQueue,
    addFiles,
    remove: removeItem,
    removeItem,
  };
}
