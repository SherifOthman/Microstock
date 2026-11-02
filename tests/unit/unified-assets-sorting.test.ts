import { describe, it, expect } from 'vitest';
import { sortUnifiedAssets, UnifiedAssetItem } from '../../src/hooks/useUnifiedAssets';

describe('Strict Deterministic Sorting Logic (useUnifiedAssets.ts)', () => {
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

  it('strictly sorts rows chronologically by createdAt ascending', () => {
    const rows: UnifiedAssetItem[] = [
      createMockRow('id-3', 'img_c.jpg', 3000),
      createMockRow('id-1', 'img_a.jpg', 1000),
      createMockRow('id-2', 'img_b.jpg', 2000),
    ];

    const sorted = sortUnifiedAssets(rows);
    expect(sorted.map((r) => r.id)).toEqual(['id-1', 'id-2', 'id-3']);
  });

  it('applies natural alphanumeric sort as secondary fallback when createdAt timestamps are identical', () => {
    const identicalTime = 1700000000000;
    // Without natural numeric sorting, 'item_10' would sort before 'item_2'
    const rows: UnifiedAssetItem[] = [
      createMockRow('id-10', 'item_10.jpg', identicalTime),
      createMockRow('id-2', 'item_2.jpg', identicalTime),
      createMockRow('id-1', 'item_1.jpg', identicalTime),
      createMockRow('id-20', 'item_20.jpg', identicalTime),
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
    const identicalTime = 1700000000000;
    const rows: UnifiedAssetItem[] = [
      createMockRow('id-3', '003_illustration.eps', identicalTime),
      createMockRow('id-10', '010_illustration.eps', identicalTime),
      createMockRow('id-1', '001_illustration.eps', identicalTime),
      createMockRow('id-2', '002_illustration.eps', identicalTime),
    ];

    const sorted = sortUnifiedAssets(rows);
    expect(sorted.map((r) => r.filename)).toEqual([
      '001_illustration.eps',
      '002_illustration.eps',
      '003_illustration.eps',
      '010_illustration.eps',
    ]);
  });

  it('uses deterministic ID comparison as tertiary tie-breaker when timestamp and filename are identical', () => {
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

  it('preserves order of mixed media types (videos, vectors, photos) deterministically', () => {
    const baseTime = 1000;
    const rows: UnifiedAssetItem[] = [
      createMockRow('id-vector', '001_vector.eps', baseTime + 1),
      createMockRow('id-photo', '001_photo.jpg', baseTime),
      createMockRow('id-video', '001_video.mp4', baseTime + 2),
    ];

    const sorted = sortUnifiedAssets(rows);
    expect(sorted.map((r) => r.filename)).toEqual([
      '001_photo.jpg',
      '001_vector.eps',
      '001_video.mp4',
    ]);
  });
});
