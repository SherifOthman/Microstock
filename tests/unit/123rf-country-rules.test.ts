import { describe, it, expect } from 'vitest';
import { COUNTRIES } from '../../src/constants/countries';
import { transformFor123rf } from '../../src/services/rules/platformTransformers';
import { generatePlatformCsv } from '../../src/services/export/csvExporter';
import { MasterMetadataRecord } from '../../src/types';
import Papa from 'papaparse';

describe('123RF Country Options & Universal Schema Rules', () => {
  const mockImageRecord: MasterMetadataRecord = {
    id: 'test-img-1',
    filename: 'desert_pyramid_model_041.jpg',
    mediaType: 'photo',
    baseTitle: 'Majestic Giza Pyramid at Golden Sunset',
    detailedDescription: 'Stunning aerial view of the ancient Great Pyramid of Giza under clear sky.',
    rankedKeywords: ['egypt', 'pyramid', 'giza', 'cairo', 'desert', 'ancient', 'monument', 'historical'],
    categories: { adobeCategoryId: 18 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const mockVideoRecord: MasterMetadataRecord = {
    id: 'test-vid-1',
    filename: 'nile_river_cruise_4k.mp4',
    mediaType: 'video',
    baseTitle: 'Traditional Felucca Sailing on River Nile',
    detailedDescription: 'Scenic boat cruise along the calm River Nile during dusk with city skyline.',
    rankedKeywords: ['nile', 'river', 'cruise', 'boat', 'egypt', 'water', 'sunset', 'travel'],
    videoMeta: {
      durationSeconds: 15,
      resolution: '4K',
      width: 3840,
      height: 2160,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  describe('Comprehensive Country Catalog (ISO 3166-1 alpha-2)', () => {
    it('covers all official countries and territories (at least 245+ entries)', () => {
      expect(COUNTRIES.length).toBeGreaterThanOrEqual(245);
    });

    it('contains Egypt with code "EG"', () => {
      const egypt = COUNTRIES.find((c) => c.code === 'EG');
      expect(egypt).toBeDefined();
      expect(egypt?.name).toBe('Egypt');
    });

    it('ensures every country code is exactly 2 uppercase letters and has a valid name', () => {
      for (const c of COUNTRIES) {
        expect(c.code).toMatch(/^[A-Z]{2}$/);
        expect(c.name.trim().length).toBeGreaterThan(0);
      }
    });

    it('contains no duplicate country codes', () => {
      const codes = COUNTRIES.map((c) => c.code);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });

  describe('123RF Default Country Behavior (Egypt Default)', () => {
    it('defaults to Egypt ("EG") when options are undefined', () => {
      const rows = transformFor123rf([mockImageRecord]);
      expect(rows).toHaveLength(1);
      expect(rows[0].country).toBe('EG');
    });

    it('defaults to Egypt ("EG") when countryCode option is omitted', () => {
      const rows = transformFor123rf([mockImageRecord], {});
      expect(rows[0].country).toBe('EG');
    });

    it('uses Egypt ("EG") when explicitly specified', () => {
      const rows = transformFor123rf([mockImageRecord], { countryCode: 'EG' });
      expect(rows[0].country).toBe('EG');
    });
  });

  describe('123RF Optional Country Support (No Country / Empty Option)', () => {
    it('allows omitting the country completely when countryCode is empty string ""', () => {
      const rows = transformFor123rf([mockImageRecord], { countryCode: '' });
      expect(rows[0].country).toBe('');
    });

    it('allows omitting the country when countryCode is "none"', () => {
      const rows = transformFor123rf([mockImageRecord], { countryCode: 'none' });
      expect(rows[0].country).toBe('');
    });

    it('exports CSV with empty country field matching 123RF optional "--Country--" feature', () => {
      const result = generatePlatformCsv('123rf', [mockImageRecord], 'batch_01', {
        '123rf': { countryCode: '' },
      });

      expect(result.isBlocked).toBeFalsy();
      const parsed = Papa.parse<string[]>(result.csvString.trim());
      expect(parsed.data[0]).toEqual(['oldfilename', '123rf_filename', 'description', 'keywords', 'country']);
      // Data row should have empty string for country (column 4)
      expect(parsed.data[1][4]).toBe('');
    });
  });

  describe('Parity Verification with sample_image.csv and sample_footage.csv', () => {
    it('generates the exact 5-column schema matching 123RF official sample CSVs', () => {
      const result = generatePlatformCsv('123rf', [mockImageRecord, mockVideoRecord], 'batch_test', {
        '123rf': { countryCode: 'EG' },
      });

      const parsed = Papa.parse<string[]>(result.csvString.trim());
      const headers = parsed.data[0];

      // Exact columns from sample_image.csv and sample_footage.csv:
      // "oldfilename","123rf_filename","description","keywords","country"
      expect(headers).toEqual(['oldfilename', '123rf_filename', 'description', 'keywords', 'country']);
    });

    it('treats Images and Videos identically with the same 5 columns (No split required for 123RF)', () => {
      const imageResult = generatePlatformCsv('123rf', [mockImageRecord], 'batch_img');
      const videoResult = generatePlatformCsv('123rf', [mockVideoRecord], 'batch_vid');

      const parsedImg = Papa.parse<string[]>(imageResult.csvString.trim());
      const parsedVid = Papa.parse<string[]>(videoResult.csvString.trim());

      expect(parsedImg.data[0]).toEqual(parsedVid.data[0]);
      expect(imageResult.additionalResults).toBeUndefined(); // Unlike Dreamstime, 123RF needs NO split
    });

    it('preserves file extension in oldfilename for videos (e.g. .mp4 / .mov) and images (.jpg)', () => {
      const rows = transformFor123rf([mockImageRecord, mockVideoRecord]);
      expect(rows[0].oldfilename).toBe('desert_pyramid_model_041.jpg');
      expect(rows[1].oldfilename).toBe('nile_river_cruise_4k.mp4');
      expect(rows[0]['123rf_filename']).toBe('');
      expect(rows[1]['123rf_filename']).toBe('');
    });
  });

  describe('Search & Letter Filtering Algorithm (123RF Combobox Behavior)', () => {
    it('filters and prioritizes countries starting with the typed letter "e"', () => {
      const query = 'e'.toLowerCase();
      const startsWithName = COUNTRIES.filter((c) => c.name.toLowerCase().startsWith(query));
      const egypt = startsWithName.find((c) => c.code === 'EG');

      expect(egypt).toBeDefined();
      expect(startsWithName.length).toBeGreaterThan(0);
      // All items in startsWithName must actually start with "e"
      for (const item of startsWithName) {
        expect(item.name.toLowerCase().startsWith('e')).toBe(true);
      }
    });

    it('matches exact country code and full name case-insensitively (e.g. "eg" or "EGYPT")', () => {
      const q1 = 'eg'.toLowerCase();
      const matchByCode = COUNTRIES.find((c) => c.code.toLowerCase() === q1 || c.name.toLowerCase().startsWith(q1));
      expect(matchByCode?.code).toBe('EG');

      const q2 = 'EGYPT'.toLowerCase();
      const matchByName = COUNTRIES.find((c) => c.name.toLowerCase() === q2);
      expect(matchByName?.code).toBe('EG');
    });

    it('handles multi-word queries like "United" or "Saudi"', () => {
      const unitedMatches = COUNTRIES.filter((c) => c.name.toLowerCase().startsWith('united'));
      expect(unitedMatches.map((c) => c.code)).toEqual(
        expect.arrayContaining(['AE', 'GB', 'US'])
      );
    });
  });
});
