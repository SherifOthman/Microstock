import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractFilenameSequence,
  sortQueueItemsSequentially,
  QueueItem,
  BatchQueueService,
} from '../../src/services/queue/BatchQueueService';

describe('Strict Sequential Queue Processing & Sequence Extractor', () => {
  describe('extractFilenameSequence', () => {
    it('extracts sequence numbers with underscores (e.g. B01_NT_PH_001.jpg -> 1)', () => {
      expect(extractFilenameSequence('B01_NT_PH_001.jpg')).toBe(1);
      expect(extractFilenameSequence('asset_042.png')).toBe(42);
      expect(extractFilenameSequence('img_9999.eps')).toBe(9999);
    });

    it('extracts sequence numbers with hyphens (e.g. video-05.mp4 -> 5)', () => {
      expect(extractFilenameSequence('video-05.mp4')).toBe(5);
      expect(extractFilenameSequence('render-123.mov')).toBe(123);
    });

    it('extracts sequence numbers in parentheses (e.g. photo (3).jpg -> 3)', () => {
      expect(extractFilenameSequence('photo (3).jpg')).toBe(3);
    });

    it('extracts trailing sequence number directly attached to name', () => {
      expect(extractFilenameSequence('clip007.mp4')).toBe(7);
    });

    it('returns null if no number exists in filename', () => {
      expect(extractFilenameSequence('sunset_beach.jpg')).toBeNull();
      expect(extractFilenameSequence('vector_illustration.eps')).toBeNull();
    });
  });

  describe('sortQueueItemsSequentially', () => {
    it('sorts queue items in strict ascending sequence order', () => {
      const items: QueueItem[] = [
        { id: '4', filename: 'batch_004.jpg', status: 'ready', retryCount: 0 },
        { id: '1', filename: 'batch_001.jpg', status: 'ready', retryCount: 0 },
        { id: '3', filename: 'batch_003.jpg', status: 'ready', retryCount: 0 },
        { id: '2', filename: 'batch_002.jpg', status: 'ready', retryCount: 0 },
      ];

      const sorted = sortQueueItemsSequentially(items);
      expect(sorted.map((i) => i.filename)).toEqual([
        'batch_001.jpg',
        'batch_002.jpg',
        'batch_003.jpg',
        'batch_004.jpg',
      ]);
    });

    it('handles natural numeric sorting for names without delimiters (e.g. item2 before item10)', () => {
      const items: QueueItem[] = [
        { id: '10', filename: 'item10.jpg', status: 'ready', retryCount: 0 },
        { id: '2', filename: 'item2.jpg', status: 'ready', retryCount: 0 },
        { id: '1', filename: 'item1.jpg', status: 'ready', retryCount: 0 },
      ];

      const sorted = sortQueueItemsSequentially(items);
      expect(sorted.map((i) => i.filename)).toEqual([
        'item1.jpg',
        'item2.jpg',
        'item10.jpg',
      ]);
    });

    it('falls back to natural alphabetical order when no sequence numbers exist', () => {
      const items: QueueItem[] = [
        { id: 'z', filename: 'zebra.jpg', status: 'ready', retryCount: 0 },
        { id: 'a', filename: 'apple.jpg', status: 'ready', retryCount: 0 },
        { id: 'm', filename: 'mango.jpg', status: 'ready', retryCount: 0 },
      ];

      const sorted = sortQueueItemsSequentially(items);
      expect(sorted.map((i) => i.filename)).toEqual([
        'apple.jpg',
        'mango.jpg',
        'zebra.jpg',
      ]);
    });

    it('falls back to createdAt when filenames are identical', () => {
      const items: QueueItem[] = [
        { id: 'b', filename: 'image.jpg', status: 'ready', retryCount: 0, createdAt: 500 },
        { id: 'a', filename: 'image.jpg', status: 'ready', retryCount: 0, createdAt: 100 },
      ];

      const sorted = sortQueueItemsSequentially(items);
      expect(sorted.map((i) => i.id)).toEqual(['a', 'b']);
    });
  });
});
