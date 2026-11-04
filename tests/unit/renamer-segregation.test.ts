import { describe, it, expect } from 'vitest';
import { processFilesForSegregatedRenaming } from '../../src/services/cleaner/fileCleanerEngine';

describe('Tier 1 Unit: 6-Way Track Segregation & Vector Pairing', () => {
  describe('6-Way Output Folders & Nomenclature Codes', () => {
    it('routes AI photo to AI_Photos folder with B01_AI_PH_ prefix', () => {
      const files = [{ name: 'futuristic_neon_city_street.jpg', size: 1024 }];
      const result = processFilesForSegregatedRenaming(files, 'AI', 1);
      expect(result).toHaveLength(1);
      expect(result[0].track).toBe('AI_Photos');
      expect(result[0].targetFolder).toBe('AI_Photos');
      expect(result[0].newFilename).toMatch(/^B01_AI_PH_001_futuristic_neon_city_street\.jpg$/);
    });

    it('routes Native photo to Photos folder with B01_NT_PH_ prefix', () => {
      const files = [{ name: 'coffee_beans_roasting_pan.jpg', size: 1024 }];
      const result = processFilesForSegregatedRenaming(files, 'NATIVE', 1);
      expect(result).toHaveLength(1);
      expect(result[0].track).toBe('Photos');
      expect(result[0].targetFolder).toBe('Photos');
      expect(result[0].newFilename).toMatch(/^B01_NT_PH_001_coffee_beans_roasting_pan\.jpg$/);
    });

    it('routes AI video to AI_Videos folder with B01_AI_VD_ prefix', () => {
      const files = [{ name: 'glowing_cyberpunk_portal_4k.mp4', size: 2048 }];
      const result = processFilesForSegregatedRenaming(files, 'AI', 1);
      expect(result).toHaveLength(1);
      expect(result[0].track).toBe('AI_Videos');
      expect(result[0].targetFolder).toBe('AI_Videos');
      expect(result[0].newFilename).toMatch(/^B01_AI_VD_001_glowing_cyberpunk_portal\.mp4$/);
    });

    it('routes Native video to Videos folder with B01_NT_VD_ prefix', () => {
      const files = [{ name: 'drone_aerial_coastal_highway.mp4', size: 2048 }];
      const result = processFilesForSegregatedRenaming(files, 'NATIVE', 1);
      expect(result).toHaveLength(1);
      expect(result[0].track).toBe('Videos');
      expect(result[0].targetFolder).toBe('Videos');
      expect(result[0].newFilename).toMatch(/^B01_NT_VD_001_drone_aerial_coastal_highway\.mp4$/);
    });

    it('routes AI vector to AI_Vectors folder with B01_AI_VC_ prefix', () => {
      const files = [{ name: 'geometric_abstract_mandala.eps', size: 512 }];
      const result = processFilesForSegregatedRenaming(files, 'AI', 1);
      expect(result).toHaveLength(1);
      expect(result[0].track).toBe('AI_Vectors');
      expect(result[0].targetFolder).toBe('AI_Vectors');
      expect(result[0].newFilename).toMatch(/^B01_AI_VC_001_geometric_abstract_mandala\.eps$/);
    });

    it('routes Native vector to Vectors folder with B01_NT_VC_ prefix', () => {
      const files = [{ name: 'hand_drawn_business_icons.eps', size: 512 }];
      const result = processFilesForSegregatedRenaming(files, 'NATIVE', 1);
      expect(result).toHaveLength(1);
      expect(result[0].track).toBe('Vectors');
      expect(result[0].targetFolder).toBe('Vectors');
      expect(result[0].newFilename).toMatch(/^B01_NT_VC_001_hand_drawn_business_icons\.eps$/);
    });
  });

  describe('Independent Track Index Counters', () => {
    it('maintains independent counters for photos and videos within the same batch', () => {
      const files = [
        { name: 'sunset_over_mountains.jpg', size: 1000 },
        { name: 'golden_autumn_forest.jpg', size: 1000 },
        { name: 'ocean_waves_crashing.mp4', size: 5000 },
        { name: 'waterfall_in_jungle.mp4', size: 5000 },
      ];
      const result = processFilesForSegregatedRenaming(files, 'AI', 2);
      
      const photos = result.filter((r) => r.track === 'AI_Photos');
      const videos = result.filter((r) => r.track === 'AI_Videos');

      expect(photos[0].newFilename).toContain('B02_AI_PH_001_');
      expect(photos[1].newFilename).toContain('B02_AI_PH_002_');

      // Videos should start at 001, NOT 003
      expect(videos[0].newFilename).toContain('B02_AI_VD_001_');
      expect(videos[1].newFilename).toContain('B02_AI_VD_002_');
    });

    it('supports custom batch number padding (B05_...)', () => {
      const files = [{ name: 'sunny_meadow_wildflowers.jpg', size: 1000 }];
      const result = processFilesForSegregatedRenaming(files, 'NATIVE', 5);
      expect(result[0].newFilename).toContain('B05_NT_PH_001_');
    });
  });

  describe('Vector Pair Pairing (.eps + companion .jpg)', () => {
    it('assigns identical sequence numbers and base names to .eps and companion .jpg', () => {
      const files = [
        { name: 'infographic_banner_elements.eps', size: 500 },
        { name: 'infographic_banner_elements.jpg', size: 200 },
      ];
      const result = processFilesForSegregatedRenaming(files, 'AI', 1);
      
      expect(result).toHaveLength(2);
      const epsItem = result.find((r) => r.extension === 'eps');
      const jpgItem = result.find((r) => r.extension === 'jpg');

      expect(epsItem).toBeDefined();
      expect(jpgItem).toBeDefined();
      expect(epsItem?.newFilename).toBe('B01_AI_VC_001_infographic_banner_elements.eps');
      expect(jpgItem?.newFilename).toBe('B01_AI_VC_001_infographic_banner_elements.jpg');
      expect(jpgItem?.track).toBe('AI_Vectors');
      expect(jpgItem?.targetFolder).toBe('AI_Vectors');
    });
  });

  describe('Meaningless Files Routing to _Needs_Fixing', () => {
    it('routes purely numeric filename to _Needs_Fixing folder without consuming track counter', () => {
      const files = [
        { name: '425997637_1793366301908538.mp4', size: 3000 },
        { name: 'cyberpunk_city_drone_flight.mp4', size: 3000 },
      ];
      const result = processFilesForSegregatedRenaming(files, 'AI', 1);

      const invalidItem = result.find((r) => r.originalFilename.startsWith('425997637'));
      const validItem = result.find((r) => r.originalFilename.startsWith('cyberpunk'));

      expect(invalidItem?.needsFixing).toBe(true);
      expect(invalidItem?.targetFolder).toBe('_Needs_Fixing');
      expect(invalidItem?.newFilename).toBe('425997637_1793366301908538.mp4');

      // The valid video should still get index 001 because the invalid item did not consume it
      expect(validItem?.newFilename).toBe('B01_AI_VD_001_cyberpunk_city_drone_flight.mp4');
    });

    it('routes camera default IMG_0042.jpg to _Needs_Fixing', () => {
      const files = [{ name: 'IMG_0042.jpg', size: 1000 }];
      const result = processFilesForSegregatedRenaming(files, 'NATIVE', 1);
      expect(result[0].needsFixing).toBe(true);
      expect(result[0].targetFolder).toBe('_Needs_Fixing');
    });
  });

  describe('Idempotency & Already Formatted Detection', () => {
    it('skips renaming if file already has standardized nomenclature prefix', () => {
      const files = [
        { name: 'B01_AI_PH_001_futuristic_neon_city_street.jpg', size: 1024 },
        { name: 'another_valid_stock_image.jpg', size: 1024 },
      ];
      const result = processFilesForSegregatedRenaming(files, 'AI', 1);

      expect(result[0].isAlreadyFormatted).toBe(true);
      expect(result[0].status).toBe('skipped');
      expect(result[0].newFilename).toBe('B01_AI_PH_001_futuristic_neon_city_street.jpg');

      // Second file should get 001 because first file was skipped and not assigned a new index
      expect(result[1].newFilename).toBe('B01_AI_PH_001_another_valid_stock_image.jpg');
    });
  });

  describe('File Cleaner Asset Origin Toggle (Real vs AI) & Batch Continuation', () => {
    it('routes Real assets into Photos, Videos, Vectors and AI assets into AI_Photos, AI_Videos, AI_Vectors', async () => {
      const { processFilesForBatchIngest, calculateAllMediaSlots } = await import(
        '../../src/services/cleaner/fileCleanerEngine'
      );
      const { buildRenamedFilesFromCleanedItems } = await import(
        '../../src/features/cleaner/hooks/useFileCleaner'
      );

      const sampleFiles = [
        new File(['img'], 'golden_hour_desert_dunes.jpg', { type: 'image/jpeg' }),
        new File(['vid'], 'aerial_ocean_waves_4k.mp4', { type: 'video/mp4' }),
        new File(['vec'], 'minimalist_geometric_logo.eps', { type: 'application/postscript' }),
      ];

      const slots = calculateAllMediaSlots({}, 100);

      // 1. Real Origin
      const realItems = processFilesForBatchIngest(
        sampleFiles,
        { sortOrder: 'alphabetical', maxItemsPerBatch: 100, assetOrigin: 'real' },
        slots
      );
      expect(realItems.map((i) => i.subFolder).sort()).toEqual(['Photos', 'Vectors', 'Videos']);
      expect(realItems.every((i) => i.isAiGenerated === false && i.assetOrigin === 'real')).toBe(true);

      // 2. AI Origin
      const aiItems = processFilesForBatchIngest(
        sampleFiles,
        { sortOrder: 'alphabetical', maxItemsPerBatch: 100, assetOrigin: 'ai' },
        slots
      );
      expect(aiItems.map((i) => i.subFolder).sort()).toEqual(['AI_Photos', 'AI_Vectors', 'AI_Videos']);
      expect(aiItems.every((i) => i.isAiGenerated === true && i.assetOrigin === 'ai')).toBe(true);

      // 3. Handoff to Metadata Studio preserves __isAiGenerated and target path
      const handoffFiles = buildRenamedFilesFromCleanedItems(aiItems, 'C:/MasterStock');
      expect(handoffFiles).toHaveLength(3);
      for (const f of handoffFiles) {
        expect((f as any).__isAiGenerated).toBe(true);
        expect((f as any).__assetOrigin).toBe('ai');
        expect((f as any).__nativePath).toMatch(/^C:\/MasterStock\/AI\/AI_(Photos|Videos|Vectors)\/B01\//);
      }
    });

    it('strictly continues existing AI_Photos/B01 batch at B01_041 when 40 files exist on disk', async () => {
      const { processFilesForBatchIngest, calculateAllMediaSlots } = await import(
        '../../src/services/cleaner/fileCleanerEngine'
      );

      const slots = calculateAllMediaSlots(
        {
          Photos: [{ name: 'B01', number: 1, path: 'C:/Master/Photos/B01', fileCount: 10, highestIndex: 10 }],
          Videos: [],
          Vectors: [],
          AI_Photos: [{ name: 'B01', number: 1, path: 'C:/Master/AI_Photos/B01', fileCount: 40, highestIndex: 40 }],
          AI_Videos: [],
          AI_Vectors: [],
        },
        100
      );

      expect(slots.AI_Photos.slotLabel).toBe('B01_041');
      expect(slots.Photos.slotLabel).toBe('B01_011');

      const newAiPhoto = new File(['ai-img'], 'futuristic_hologram_interface.jpg', { type: 'image/jpeg' });
      const aiResult = processFilesForBatchIngest(
        [newAiPhoto],
        { sortOrder: 'alphabetical', maxItemsPerBatch: 100, assetOrigin: 'ai' },
        slots
      );

      expect(aiResult).toHaveLength(1);
      expect(aiResult[0].subFolder).toBe('AI_Photos');
      expect(aiResult[0].batchFolder).toBe('B01');
      expect(aiResult[0].batchIndex).toBe(41);
      expect(aiResult[0].cleanedName).toBe('B01_041_AI__futuristic_hologram_interface.jpg');
      expect(aiResult[0].relativePath).toBe('AI/AI_Photos/B01/B01_041_AI__futuristic_hologram_interface.jpg');
    });
    it('pairs EPS and JPG sharing the exact same base name into Vectors with synchronized names and no duplicate warning', async () => {
      const { processFilesForBatchIngest } = await import('../../src/services/cleaner/fileCleanerEngine');
      const epsFile = new File(['vector-content'], 'alpha_floral_ornament.eps', { type: 'application/postscript' });
      const jpgFile = new File(['preview-content'], 'alpha_floral_ornament.jpg', { type: 'image/jpeg' });
      const standalonePhoto = new File(['photo-content'], 'sunset_over_mountains.jpg', { type: 'image/jpeg' });
      const nextVector = new File(['vector-content-2'], 'geometric_mandala_pattern.eps', { type: 'application/postscript' });

      const results = processFilesForBatchIngest(
        [epsFile, jpgFile, standalonePhoto, nextVector],
        { sortOrder: 'alphabetical', maxItemsPerBatch: 100, assetOrigin: 'real' }
      );

      expect(results).toHaveLength(4);

      // 1. Paired EPS (alphabetically first: 'alpha')
      const pairedEps = results.find((r) => r.originalName === 'alpha_floral_ornament.eps')!;
      expect(pairedEps).toBeDefined();
      expect(pairedEps.subFolder).toBe('Vectors');
      expect(pairedEps.batchFolder).toBe('B01');
      expect(pairedEps.batchIndex).toBe(1);
      expect(pairedEps.cleanedName).toBe('B01_001__alpha_floral_ornament.eps');
      expect(pairedEps.relativePath).toBe('Real/Vectors/B01/B01_001__alpha_floral_ornament.eps');
      expect(pairedEps.isDuplicate).toBe(false);

      // 2. Paired JPG companion
      const pairedJpg = results.find((r) => r.originalName === 'alpha_floral_ornament.jpg')!;
      expect(pairedJpg).toBeDefined();
      expect(pairedJpg.subFolder).toBe('Vectors');
      expect(pairedJpg.batchFolder).toBe('B01');
      expect(pairedJpg.batchIndex).toBe(1); // Same index as EPS!
      expect(pairedJpg.cleanedName).toBe('B01_001__alpha_floral_ornament.jpg');
      expect(pairedJpg.relativePath).toBe('Real/Vectors/B01/B01_001__alpha_floral_ornament.jpg');
      expect(pairedJpg.isDuplicate).toBe(false); // Never false-flagged as duplicate!

      // 3. Next Vector ('geometric') advances sequence once from 1 -> 2
      const secondVector = results.find((r) => r.originalName === 'geometric_mandala_pattern.eps')!;
      expect(secondVector.subFolder).toBe('Vectors');
      expect(secondVector.batchIndex).toBe(2);
      expect(secondVector.cleanedName).toBe('B01_002__geometric_mandala_pattern.eps');

      // 4. Standalone JPG routes to Photos
      const photo = results.find((r) => r.originalName === 'sunset_over_mountains.jpg')!;
      expect(photo.subFolder).toBe('Photos');
      expect(photo.cleanedName).toBe('B01_001__sunset_over_mountains.jpg');
      expect(photo.relativePath).toBe('Real/Photos/B01/B01_001__sunset_over_mountains.jpg');
    });

    it('prevents double queueing in BatchQueueService when paired EPS and JPG are added', async () => {
      const { vi } = await import('vitest');
      const mediaExtractorModule = await import('../../src/utils/mediaExtractor');
      const { BatchQueueService } = await import('../../src/services/queue/BatchQueueService');
      const { formatVectorFilenameForPlatform } = await import('../../src/services/rules/platformTransformers');

      const extractSpy = vi.spyOn(mediaExtractorModule, 'extractMediaInfo').mockImplementation(async (file: File, companion?: File) => {
        const isVector = file.name.endsWith('.eps');
        return {
          mediaType: isVector ? 'vector' : 'image',
          thumbnailBase64: 'mockthumb',
          thumbnailDataUrl: 'data:image/jpeg;base64,mockthumb',
          originalSizeBytes: file.size,
          compressedSizeBytes: 1024,
          hasRealPreview: true,
          width: 2000,
          height: 2000,
        };
      });
      
      const service = BatchQueueService.getInstance();
      service.clear();

      const epsFile = new File(['eps-data'], 'B01_001__vintage_floral_ornament.eps', { type: 'application/postscript' });
      const jpgFile = new File(['jpg-preview'], 'B01_001__vintage_floral_ornament.jpg', { type: 'image/jpeg' });
      const photoFile = new File(['photo-data'], 'B01_001__sunset_over_mountains.jpg', { type: 'image/jpeg' });

      await service.addFiles([epsFile, jpgFile, photoFile]);
      extractSpy.mockRestore();

      const state = service.getState();
      // Should have only 2 items: 1 vector item + 1 standalone photo (the companion JPG is NOT queued independently)
      expect(state.items).toHaveLength(2);

      const vectorItem = state.items.find((i) => i.filename.endsWith('.eps'))!;
      expect(vectorItem).toBeDefined();
      expect(vectorItem.filename).toBe('B01_001__vintage_floral_ornament.eps');
      expect(vectorItem.mediaType).toBe('vector');

      // Verify Shutterstock CSV has only .eps, no .jpg
      const shutterstockRow = formatVectorFilenameForPlatform(vectorItem.filename, vectorItem.mediaType, 'shutterstock');
      expect(shutterstockRow).toBe('B01_001__vintage_floral_ornament.eps');

      // Verify Adobe Stock CSV has .eps
      const adobeRow = formatVectorFilenameForPlatform(vectorItem.filename, vectorItem.mediaType, 'adobe');
      expect(adobeRow).toBe('B01_001__vintage_floral_ornament.eps');

      // Verify Freepik CSV has companion .jpg
      const freepikRow = formatVectorFilenameForPlatform(vectorItem.filename, vectorItem.mediaType, 'freepik');
      expect(freepikRow).toBe('B01_001__vintage_floral_ornament.jpg');

      service.clear();
    });
  });
});
