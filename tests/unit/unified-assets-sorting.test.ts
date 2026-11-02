import { describe, it, expect } from 'vitest';
import { sortUnifiedAssets, UnifiedAssetItem } from '../../src/hooks/useUnifiedAssets';

describe('Strict Natural Alphanumeric Sorting Logic (useUnifiedAssets.ts)', () => {
  const createMockRow = (
    id: string,
    filename: string,
    createdAt: number,
    status: UnifiedAssetItem['status'] = 'queued'
  ): UnifiedAssetItem => ({
    id,
    filename,
    thumbnailUrl: '',
    status,
    createdAt,
  });

  it('strictly sorts rows by natural alphanumeric filename as primary sort matching Windows File Explorer', () => {
    // Even if timestamps vary wildly (e.g. 001_ was muted or modified much later than 002_),
    // the list MUST remain strictly ordered by filename!
    const rows: UnifiedAssetItem[] = [
      createMockRow('id-3', '003_model_sitting.jpg', 1000),
      createMockRow('id-1', '001_model_portrait.jpg', 9999999), // modified much later
      createMockRow('id-2', '002_model_standing.jpg', 2000),
    ];

    const sorted = sortUnifiedAssets(rows);
    expect(sorted.map((r) => r.filename)).toEqual([
      '001_model_portrait.jpg',
      '002_model_standing.jpg',
      '003_model_sitting.jpg',
    ]);
  });

  it('applies natural numeric collation so item_2 precedes item_10 (matching OS explorer)', () => {
    const rows: UnifiedAssetItem[] = [
      createMockRow('id-10', 'item_10.jpg', 1000),
      createMockRow('id-2', 'item_2.jpg', 2000),
      createMockRow('id-1', 'item_1.jpg', 3000),
      createMockRow('id-20', 'item_20.jpg', 4000),
    ];

    const sorted = sortUnifiedAssets(rows);
    expect(sorted.map((r) => r.filename)).toEqual([
      'item_1.jpg',
      'item_2.jpg',
      'item_10.jpg',
      'item_20.jpg',
    ]);
  });

  it('correctly handles zero-padded sequential prefixes (e.g., 001_, 002_, 010_)', () => {
    const rows: UnifiedAssetItem[] = [
      createMockRow('id-3', '003_illustration.eps', 5000),
      createMockRow('id-10', '010_illustration.eps', 1000),
      createMockRow('id-1', '001_illustration.eps', 8000),
      createMockRow('id-2', '002_illustration.eps', 2000),
    ];

    const sorted = sortUnifiedAssets(rows);
    expect(sorted.map((r) => r.filename)).toEqual([
      '001_illustration.eps',
      '002_illustration.eps',
      '003_illustration.eps',
      '010_illustration.eps',
    ]);
  });

  it('falls back to createdAt ascending as secondary sort when filenames are identical', () => {
    const rows: UnifiedAssetItem[] = [
      createMockRow('id-late', 'duplicate_name.jpg', 5000),
      createMockRow('id-early', 'duplicate_name.jpg', 1000),
    ];

    const sorted = sortUnifiedAssets(rows);
    expect(sorted.map((r) => r.id)).toEqual(['id-early', 'id-late']);
  });

  it('uses deterministic ID comparison as tertiary tie-breaker when filename and timestamp are identical', () => {
    const identicalTime = 1700000000000;
    const rows: UnifiedAssetItem[] = [
      createMockRow('id-z', 'same_name.jpg', identicalTime),
      createMockRow('id-a', 'same_name.jpg', identicalTime),
      createMockRow('id-m', 'same_name.jpg', identicalTime),
    ];

    const sorted = sortUnifiedAssets(rows);
    expect(sorted.map((r) => r.id)).toEqual(['id-a', 'id-m', 'id-z']);
  });

  it('guarantees immutability and does not mutate the original input array', () => {
    const rows: UnifiedAssetItem[] = [
      createMockRow('id-2', 'b.jpg', 2000),
      createMockRow('id-1', 'a.jpg', 1000),
    ];
    const originalFirstId = rows[0].id;

    const sorted = sortUnifiedAssets(rows);
    expect(rows[0].id).toBe(originalFirstId); // original untouched
    expect(sorted[0].id).toBe('id-1');
  });
});
