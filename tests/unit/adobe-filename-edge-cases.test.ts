import { describe, it, expect } from 'vitest';
import {
  sanitizeExportFilename,
  sanitizeForVecteezyWeb,
  formatAdobeFilename,
  transformForAdobeStock,
  transformForFreepik,
  transformForDreamstime,
} from '../../src/services/rules/platformTransformers';
import { generatePlatformCsv } from '../../src/services/export/csvExporter';
import { MasterMetadataRecord } from '../../src/types';

describe('Microstock Platform CSV Rules & Filename Edge Cases (platformTransformers.ts)', () => {
  describe('sanitizeExportFilename() Ellipsis & Diacritic Normalization', () => {
    it('replaces Unicode ellipsis (…) with underscore and strips non-ASCII accents', () => {
      // The real filename from the user screenshot: "Açai_bowl_wi..._2K_20261015115529.jpg"
      const messyFilename = 'Açaí_bowl_with_toppings…2K_20261015115529.jpg';
      const clean = sanitizeExportFilename(messyFilename);

      expect(clean).toBe('Acai_bowl_with_toppings_2K_20261015115529.jpg');
      expect(clean).not.toContain('…');
      expect(clean).not.toContain('ç');
      expect(clean).not.toContain('í');
    });

    it('normalizes French, German, Spanish accents cleanly to ASCII', () => {
      expect(sanitizeExportFilename('München_café_español_naïve.jpg')).toBe(
        'Munchen_cafe_espanol_naive.jpg'
      );
    });

    it('returns empty string if filename is empty, undefined or null', () => {
      expect(sanitizeExportFilename('')).toBe('');
      expect(sanitizeExportFilename(null as any)).toBe('');
      expect(sanitizeExportFilename(undefined as any)).toBe('');
    });
  });

  describe('sanitizeForVecteezyWeb() Web Uploader Parity', () => {
    it('preserves hyphens (-) while stripping spaces and underscores', () => {
      const input = 'modern_solar - panel_rooftop installation.jpg';
      const result = sanitizeForVecteezyWeb(input);

      // Spaces and underscores stripped, but hyphen intact
      expect(result).toBe('modernsolar-panelrooftopinstallation.jpg');
      expect(result).toContain('-');
      expect(result).not.toContain('_');
      expect(result).not.toContain(' ');
    });

    it('strips special symbols while retaining extension', () => {
      const input = 'cool_vector!@#$%-art (1).eps';
      const result = sanitizeForVecteezyWeb(input);

      expect(result).toBe('coolvector-art1.eps');
      expect(result.endsWith('.eps')).toBe(true);
    });
  });

  describe('Adobe Stock CRLF (\r\n) Line Ending & 25-Keyword SEO Ceiling', () => {
    const mockRecord: MasterMetadataRecord = {
      id: 'rec-1',
      filename: 'autumn_forest_lake.jpg',
      mediaType: 'image',
      isAiGenerated: false,
      baseTitle: 'Peaceful Autumn Forest Lake with Golden Foliage Reflections at Sunset',
      detailedDescription: 'Detailed landscape photo of serene autumn trees reflecting on calm lake water.',
      rankedKeywords: Array.from({ length: 60 }, (_, i) => `keyword${i + 1}`),
      categories: {
        adobeCategoryId: 11, // Landscapes
      },
      createdAt: Date.now(),
      status: 'completed',
    };

    it('strictly caps Adobe Stock keywords at 25 for SEO ranking', () => {
      const rows = transformForAdobeStock([mockRecord]);
      expect(rows).toHaveLength(1);
      const keywords = String(rows[0].Keywords).split(', ');
      expect(keywords.length).toBe(25);
      expect(keywords[0]).toBe('keyword1');
      expect(keywords[24]).toBe('keyword25');
    });

    it('formatAdobeFilename preserves exact disk filename byte-for-byte', () => {
      expect(formatAdobeFilename('Açaí_bowl_with_toppings.jpg', 'image')).toBe('Açaí_bowl_with_toppings.jpg');
      expect(formatAdobeFilename('München_café.png', 'image')).toBe('München_café.png');
      expect(formatAdobeFilename('C:\\path\\to\\B01_005__chalet.jpg', 'image')).toBe('B01_005__chalet.jpg');
    });

    it('formatAdobeFilename forces .eps extension for vector mediaType', () => {
      expect(formatAdobeFilename('B01_001__artwork.jpg', 'vector')).toBe('B01_001__artwork.eps');
      expect(formatAdobeFilename('B01_001__artwork.eps', 'vector')).toBe('B01_001__artwork.eps');
      expect(formatAdobeFilename('art_sample.ai', 'vector')).toBe('art_sample.eps');
    });

    it('generatePlatformCsv for Adobe Stock produces CRLF and trailing newline', () => {
      const exportResult = generatePlatformCsv('adobe', [mockRecord], 'batch_01');
      expect(exportResult.csvString).toContain('\r\n');
      expect(exportResult.csvString.endsWith('\r\n')).toBe(true);

      const lines = exportResult.csvString.split('\r\n').filter(Boolean);
      expect(lines.length).toBe(2); // Header line + 1 Data row
      expect(lines[0]).toBe('Filename,Title,Keywords,Category,Releases');
      expect(lines[1].startsWith('autumn_forest_lake.jpg')).toBe(true);
    });
  });

  describe('Freepik Video Exclusion Rule', () => {
    it('strictly excludes video files from Freepik image CSV exports', () => {
      const records: MasterMetadataRecord[] = [
        {
          id: '1',
          filename: 'photo.jpg',
          mediaType: 'image',
          isAiGenerated: true,
          baseTitle: 'Photo asset',
          detailedDescription: 'Photo description.',
          rankedKeywords: ['tag1', 'tag2'],
          status: 'completed',
          createdAt: Date.now(),
        },
        {
          id: '2',
          filename: 'drone_video.mp4',
          mediaType: 'video',
          isAiGenerated: true,
          baseTitle: 'Video asset',
          detailedDescription: 'Video description.',
          rankedKeywords: ['tag1', 'tag2'],
          status: 'completed',
          createdAt: Date.now(),
        },
        {
          id: '3',
          filename: 'vector.eps',
          mediaType: 'vector',
          isAiGenerated: false,
          baseTitle: 'Vector asset',
          detailedDescription: 'Vector description.',
          rankedKeywords: ['tag1', 'tag2'],
          status: 'completed',
          createdAt: Date.now(),
        },
      ];

      const rows = transformForFreepik(records);
      expect(rows).toHaveLength(2); // Only photo and vector, drone_video.mp4 excluded!
      const filenames = rows.map((r) => r['File name']);
      expect(filenames).toContain('photo.jpg');
      expect(filenames).toContain('vector.jpg');
      expect(filenames).not.toContain('drone_video.mp4');
    });
  });

  describe('Dreamstime Length & AI Disclosure Rules', () => {
    it('guarantees Dreamstime description is strictly longer than Title and ends with period', () => {
      const record: MasterMetadataRecord = {
        id: '1',
        filename: 'car.jpg',
        mediaType: 'image',
        isAiGenerated: true,
        baseTitle: 'A very long title that exceeds the short description',
        detailedDescription: 'Short desc',
        rankedKeywords: ['car', 'speed'],
        categories: {
          dreamstimeCategory1: 98,
        },
        status: 'completed',
        createdAt: Date.now(),
      };

      const rows = transformForDreamstime([record], { isAiGenerated: true });
      expect(rows).toHaveLength(1);
      const row = rows[0];

      const title = String(row['Image Name']);
      const desc = String(row.Description);

      expect(desc.length).toBeGreaterThan(title.length);
      expect(desc.endsWith('.')).toBe(true);
      expect(desc.toLowerCase()).toContain('ai-generated');
    });
  });
});
