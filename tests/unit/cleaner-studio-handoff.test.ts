import { describe, it, expect } from 'vitest';
import {
  buildRenamedFilesFromCleanedItems,
} from '../../src/features/cleaner/hooks/useFileCleaner';
import {
  processFilesForBatchIngest,
  CleanedFileItem,
  DEFAULT_CLEANER_OPTIONS,
} from '../../src/services/cleaner/fileCleanerEngine';
import { BatchQueueService } from '../../src/services/queue/BatchQueueService';

describe('Cleaner to Metadata Studio Handoff Suite', () => {
  it('buildRenamedFilesFromCleanedItems assigns correct path, __nativePath, and origin to synthetic files', () => {
    const rawPhoto = new File(['dummy-photo'], 'mountain_sunrise.jpg', { type: 'image/jpeg' });
    const rawAiPhoto = new File(['dummy-ai-photo'], 'cyberpunk_city_ai.jpg', { type: 'image/jpeg' });
    const rawVector = new File(['dummy-eps'], 'business_infographic.eps', { type: 'application/postscript' });

    const masterDir = 'C:/StockLibrary/Master';

    // Process items via cleaner engine
    const cleanedPhotos = processFilesForBatchIngest([rawPhoto], {
      ...DEFAULT_CLEANER_OPTIONS,
      assetOrigin: 'real',
    });
    const cleanedAiPhotos = processFilesForBatchIngest([rawAiPhoto], {
      ...DEFAULT_CLEANER_OPTIONS,
      assetOrigin: 'ai',
    });
    const cleanedVectors = processFilesForBatchIngest([rawVector], {
      ...DEFAULT_CLEANER_OPTIONS,
      assetOrigin: 'ai',
    });

    // Attach fake preview thumbnail to test preservation
    cleanedPhotos[0].thumbnailUrl = 'data:image/jpeg;base64,mockThumbnailData1';

    const allCleaned: CleanedFileItem[] = [...cleanedPhotos, ...cleanedAiPhotos, ...cleanedVectors];
    const preparedFiles = buildRenamedFilesFromCleanedItems(allCleaned, masterDir);

    expect(preparedFiles).toHaveLength(3);

    // 1. Real Photo
    const photoFile = preparedFiles[0];
    expect(photoFile.name).toMatch(/^B01_\d+__mountain_sunrise\.jpg$/);
    expect((photoFile as any).path).toContain('C:/StockLibrary/Master/Real/Photos/B01/');
    expect((photoFile as any).__nativePath).toEqual((photoFile as any).path);
    expect((photoFile as any).__isAiGenerated).toBe(false);
    expect((photoFile as any).__assetOrigin).toBe('real');
    expect((photoFile as any).__thumbnailUrl).toBe('data:image/jpeg;base64,mockThumbnailData1');

    // 2. AI Photo
    const aiFile = preparedFiles[1];
    expect(aiFile.name).toMatch(/^B01_\d+__cyberpunk_city_AI\.jpg$/);
    expect((aiFile as any).path).toContain('C:/StockLibrary/Master/AI/AI_Photos/B01/');
    expect((aiFile as any).__isAiGenerated).toBe(true);
    expect((aiFile as any).__assetOrigin).toBe('ai');

    // 3. AI Vector
    const vectorFile = preparedFiles[2];
    expect(vectorFile.name).toMatch(/^B01_\d+.*\.eps$/);
    expect((vectorFile as any).path).toContain('C:/StockLibrary/Master/AI/AI_Vectors/B01/');
    expect((vectorFile as any).__sourceMediaType).toBe('vector');
    expect((vectorFile as any).__companionJpgNativePath).toContain('C:/StockLibrary/Master/AI/AI_Vectors/B01/');
    expect((vectorFile as any).__companionJpgNativePath).toMatch(/\.jpg$/);
  });

  it('BatchQueueService ingests handoff files with explicit origin, native paths, and thumbnails', async () => {
    const queueService = BatchQueueService.getInstance();
    queueService.clear();

    const mockFile = new File(['image-content-bytes'], 'B01_001_AI__neon_cat.jpg', {
      type: 'image/jpeg',
    });
    const nativeDiskPath = 'D:/MasterStock/AI/AI_Photos/B01/B01_001_AI__neon_cat.jpg';
    const fakeThumbnail = 'data:image/jpeg;base64,thumb_test_abc123';

    Object.defineProperty(mockFile, 'path', { value: nativeDiskPath, enumerable: true });
    Object.defineProperty(mockFile, '__nativePath', { value: nativeDiskPath, enumerable: true });
    Object.defineProperty(mockFile, '__isAiGenerated', { value: true, enumerable: true });
    Object.defineProperty(mockFile, '__assetOrigin', { value: 'ai', enumerable: true });
    Object.defineProperty(mockFile, '__thumbnailUrl', { value: fakeThumbnail, enumerable: true });

    await queueService.addFiles([mockFile]);

    const state = queueService.getState();
    expect(state.items).toHaveLength(1);

    const queuedItem = state.items[0];
    expect(queuedItem.filename).toBe('B01_001_AI__neon_cat.jpg');
    expect(queuedItem.isAiGenerated).toBe(true);

    // Initial draft should immediately hold the native path and thumbnail
    expect(queuedItem.metadataRecord?.nativePath).toBe(nativeDiskPath);
    expect(queuedItem.thumbnailDataUrl).toBe(fakeThumbnail);

    queueService.clear();
  });
});
