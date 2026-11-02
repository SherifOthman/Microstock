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
});
