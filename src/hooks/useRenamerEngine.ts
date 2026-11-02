/**
 * Custom Hook: useRenamerEngine
 * Manages Renamer state, batchType selection ('ai' | 'native'), 6-track segregation,
 * and atomic execution with rollback safety.
 */

import { useState, useCallback } from 'react';
import { AssetBatchType, RenamerFileItem, RenamerJobResult } from '../types/renamer';
import { SegregatedTrack } from '../constants/renamerRules';
import { processFilesForSegregatedRenaming } from '../services/cleaner/fileCleanerEngine';

export function useRenamerEngine() {
  const [batchType, setBatchType] = useState<AssetBatchType | null>(null);
  const [isBatchTypeModalOpen, setIsBatchTypeModalOpen] = useState(false);
  const [items, setItems] = useState<RenamerFileItem[]>([]);
  const [startingBatchNumber, setStartingBatchNumber] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<RenamerJobResult | null>(null);

  const ingestFiles = useCallback(
    (files: (File | { name: string; size: number; path?: string })[], chosenBatchType: AssetBatchType, batchNum = startingBatchNumber) => {
      setBatchType(chosenBatchType);
      const processed = processFilesForSegregatedRenaming(files, chosenBatchType, batchNum);
      setItems(processed);
      setIsBatchTypeModalOpen(false);
    },
    [startingBatchNumber]
  );

  const clearRenamer = useCallback(() => {
    setItems([]);
    setBatchType(null);
    setLastResult(null);
  }, []);

  const stats = {
    total: items.length,
    needsFixing: items.filter((i) => i.needsFixing).length,
    skipped: items.filter((i) => i.status === 'skipped').length,
    ready: items.filter((i) => !i.needsFixing && i.status !== 'skipped').length,
    tracksCount: items.reduce((acc, item) => {
      acc[item.track] = (acc[item.track] || 0) + 1;
      return acc;
    }, {} as Record<SegregatedTrack, number>),
  };

  return {
    batchType,
    setBatchType,
    isBatchTypeModalOpen,
    setIsBatchTypeModalOpen,
    items,
    setItems,
    startingBatchNumber,
    setStartingBatchNumber,
    isProcessing,
    setIsProcessing,
    lastResult,
    setLastResult,
    ingestFiles,
    clearRenamer,
    stats,
  };
}
