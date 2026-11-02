/**
 * Custom Hook: useUnifiedAssets
 * Merges Dexie DB masterRecords with in-memory queue items,
 * enforcing in-place updates and strict chronological sorting by createdAt.
 */

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { MasterMetadataRecord } from '../types';
import { QueueState } from '../services/queue/BatchQueueService';
import { UnifiedAssetRow } from '../features/studio/components/AssetCard';

export type UnifiedAssetItem = UnifiedAssetRow;

export interface UnifiedAssetsResult {
  unifiedAssets: UnifiedAssetRow[];
  filteredAssets: UnifiedAssetRow[];
  completedCount: number;
  pendingCount: number;
  brandNewPendingCount: number;
  failedCount: number;
}

export function useUnifiedAssets(
  queueState: QueueState,
  searchQuery = '',
  statusFilter = 'all'
): UnifiedAssetsResult {
  const liveRecords = useLiveQuery(() => db.masterRecords.toArray(), []) || [];

  return useMemo(() => {
    const rowMap = new Map<string, UnifiedAssetRow>();

    // 1. Populate from in-memory queue items
    queueState.items.forEach((item) => {
      const status: UnifiedAssetRow['status'] =
        item.status === 'processing'
          ? 'processing'
          : item.status === 'error'
          ? 'error'
          : item.status === 'completed'
          ? 'completed'
          : 'queued';

      rowMap.set(item.filename, {
        id: item.id,
        filename: item.filename,
        thumbnailUrl: item.thumbnailDataUrl || (item.thumbnailBase64 ? `data:image/jpeg;base64,${item.thumbnailBase64}` : ''),
        status,
        queueItem: item,
        masterRecord: item.metadataRecord,
        error: item.error,
        createdAt: item.createdAt || Date.now(),
        isRetry: item.isRetry,
      });
    });

    // 2. Merge with persistent DB records
    liveRecords.forEach((rec) => {
      const recStatus: UnifiedAssetRow['status'] =
        rec.status === 'error'
          ? 'error'
          : rec.status === 'processing'
          ? 'processing'
          : rec.status === 'pending'
          ? 'queued'
          : rec.baseTitle
          ? 'completed'
          : 'queued';

      const recIsRetry = rec.status === 'error' || Boolean(rec.errorMessage);

      const existing = rowMap.get(rec.filename);
      if (existing) {
        existing.masterRecord = rec;
        if (recIsRetry) existing.isRetry = true;

        if (queueState.status === 'running' || queueState.status === 'resizing') {
          // If in-memory is completed or error, reflect it (do NOT override if actively queued or processing!)
          if (rec.baseTitle && existing.status !== 'processing' && existing.status !== 'queued') {
            existing.status = 'completed';
          }
        } else {
          // When queue is idle, adopt status from DB (unless in-memory item was just queued for re-processing)
          if (existing.status !== 'queued' && existing.status !== 'processing') {
            existing.status = recStatus;
          }
          if (rec.errorMessage && !existing.error) {
            existing.error = rec.errorMessage;
          }
        }
        if (!existing.thumbnailUrl) existing.thumbnailUrl = rec.thumbnailBase64;
        if (rec.createdAt) existing.createdAt = rec.createdAt;
      } else {
        rowMap.set(rec.filename, {
          id: rec.id,
          filename: rec.filename,
          thumbnailUrl: rec.thumbnailBase64,
          status: recStatus,
          masterRecord: rec,
          error: rec.errorMessage,
          createdAt: rec.createdAt || Date.now(),
          isRetry: recIsRetry,
        });
      }
    });

    // Strict in-place chronological sort by createdAt ascending (immutable position)
    const allRows = Array.from(rowMap.values()).sort((a, b) => {
      const timeDiff = a.createdAt - b.createdAt;
      if (timeDiff !== 0) return timeDiff;
      return a.filename.localeCompare(b.filename);
    });

    // Filter by search query & status filter
    const query = searchQuery.trim().toLowerCase();
    const filteredAssets = allRows.filter((asset) => {
      if (statusFilter !== 'all' && asset.status !== statusFilter) {
        return false;
      }
      if (!query) return true;
      const fnMatch = asset.filename.toLowerCase().includes(query);
      const titleMatch = asset.masterRecord?.baseTitle?.toLowerCase().includes(query);
      const descMatch = asset.masterRecord?.detailedDescription?.toLowerCase().includes(query);
      const kwMatch = asset.masterRecord?.rankedKeywords?.some((k) => k.toLowerCase().includes(query));
      return fnMatch || titleMatch || descMatch || kwMatch;
    });

    const completedCount = allRows.filter((a) => a.status === 'completed' || Boolean(a.masterRecord?.baseTitle)).length;
    const pendingCount = allRows.filter((a) => a.status === 'queued' || a.status === 'processing').length;
    const brandNewPendingCount = allRows.filter((a) => (a.status === 'queued' || a.status === 'processing') && !a.isRetry).length;
    const failedCount = allRows.filter((a) => a.status === 'error').length;

    return {
      unifiedAssets: allRows,
      filteredAssets,
      completedCount,
      pendingCount,
      brandNewPendingCount,
      failedCount,
    };
  }, [liveRecords, queueState.items, queueState.status, searchQuery, statusFilter]);
}
