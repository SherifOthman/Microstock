import { describe, it, expect } from 'vitest';
import { generatePlatformCsv } from '../../src/services/export/csvExporter';
import { getUniversalTransformOptions } from '../../src/services/rules/platformTransformers';
import { MasterMetadataRecord } from '../../src/types';

describe('Tier 2 Integration: Multi-Platform CSV Generation & Compliance', () => {
  const mockRecords: MasterMetadataRecord[] = [
    {
      id: 'rec-1',
      filename: 'modern_solar_panel_installation.jpg',
      batchId: 'batch-1',
      thumbnailBase64: '',
      isAiGenerated: true,
      baseTitle: 'Modern Photovoltaic Solar Panel Array on Industrial Roof',
      detailedDescription: 'Aerial view of commercial photovoltaic solar panel installation on warehouse roof at sunrise.',
      rankedKeywords: [
        'solar panel', 'photovoltaic', 'solar energy', 'renewable energy', 'green power',
        'clean energy', 'electricity', 'sustainable', 'industrial', 'rooftop', 'aerial view',
        'sunrise', 'commercial building', 'modern', 'blue', 'power generation'
      ],
      categories: {
        adobeCategoryId: 19, // Technology
        shutterstockCategories: ['Technology', 'Industrial'],
        dreamstimeCategory1: 105, // Technology -> Computers / Energy
        dreamstimeCategory2: 95,
        dreamstimeCategory3: 212, // AI generated
      },
      aiGenerationInfo: {
        prompt: 'Aerial photo of commercial solar panel array on roof, cinematic lighting',
        model: 'Google Nano Banana',
      },
      status: 'completed',
      createdAt: 1000,
    },
    {
      id: 'rec-2',
      filename: 'fresh_espresso_coffee_cup.jpg',
      batchId: 'batch-1',
      thumbnailBase64: '',
      isAiGenerated: false,
      baseTitle: 'Hot Steaming Espresso Coffee Cup on Rustic Wooden Table',
      detailedDescription: 'Close-up of ceramic cup filled with dark espresso coffee with thick crema on wooden desk.',
      rankedKeywords: [
        'coffee', 'espresso', 'cup', 'crema', 'caffeine', 'mug', 'wooden table', 'hot drink',
        'beverage', 'morning', 'breakfast', 'rustic', 'ceramic', 'dark roast'
      ],
      categories: {
        adobeCategoryId: 7, // Food
        shutterstockCategories: ['Food and drink'],
        dreamstimeCategory1: 127, // Industries -> Food & Beverages
        dreamstimeCategory2: 171,
        dreamstimeCategory3: 0,
      },
      status: 'completed',
      createdAt: 2000,
    },
  ];

  describe('Adobe Stock CSV Specification', () => {
    it('generates Adobe Stock CSV with exact header columns', () => {
      const result = generatePlatformCsv('adobe', mockRecords, 'test_batch');
      expect(result.isBlocked).toBeFalsy();
      const lines = result.csvString.split(/\r?\n/).filter(Boolean);
      expect(lines[0]).toBe('Filename,Title,Keywords,Category,Releases');
    });

    it('contains numeric category ID and comma-separated keywords in double quotes', () => {
      const result = generatePlatformCsv('adobe', mockRecords, 'test_batch');
      const lines = result.csvString.split(/\r?\n/).filter(Boolean);
      const row1 = lines[1];
      expect(row1).toContain('modern_solar_panel_installation.jpg');
      expect(row1).toContain(',19,'); // Adobe category 19
      expect(row1).toContain('"solar panel, photovoltaic,');
    });

    it('limits keywords to max 49 for Adobe Stock', () => {
      const result = generatePlatformCsv('adobe', mockRecords, 'test_batch');
      const lines = result.csvString.split(/\r?\n/).filter(Boolean);
      // Keywords are enclosed in quotes
      const match = lines[1].match(/"([^"]+)"/);
      expect(match).toBeTruthy();
      const kws = match![1].split(', ');
      expect(kws.length).toBeLessThanOrEqual(49);
    });
  });

  describe('Shutterstock CSV Specification', () => {
    it('generates Shutterstock CSV with exact header columns', () => {
      const result = generatePlatformCsv('shutterstock', mockRecords, 'test_batch');
      expect(result.isBlocked).toBeFalsy();
      const lines = result.csvString.split(/\r?\n/).filter(Boolean);
      expect(lines[0]).toContain('Filename,Description,Keywords,Categories');
    });

    it('formats categories with comma and NO space (e.g. "Technology,Industrial")', () => {
      const result = generatePlatformCsv('shutterstock', mockRecords, 'test_batch');
      const lines = result.csvString.split(/\r?\n/).filter(Boolean);
      expect(lines[1]).toContain('"Technology,Industrial"');
      expect(lines[2]).toContain('Food and drink');
    });

    it('ensures description does not exceed 200 characters', () => {
      const result = generatePlatformCsv('shutterstock', mockRecords, 'test_batch');
      const lines = result.csvString.split(/\r?\n/).filter(Boolean);
      for (let i = 1; i < lines.length; i++) {
        // Description is in column index 1
        const cols = lines[i].split('","');
        const desc = cols[1];
        if (desc) {
          expect(desc.length).toBeLessThanOrEqual(200);
        }
      }
    });
  });

  describe('Freepik CSV Specification', () => {
    it('caps AI asset keywords at 49 to allow Freepik portal to auto-append _ai_generated', () => {
      const result = generatePlatformCsv('freepik', mockRecords, 'test_batch');
      const lines = result.csvString.split(/\r?\n/).filter(Boolean);

      // Semicolon delimited
      const row1Cols = lines[1].split(';');
      const keywordsRow1 = row1Cols[2].split(', ');
      expect(keywordsRow1.length).toBeLessThanOrEqual(49);
    });

    it('populates Prompt and Model columns for AI assets and leaves empty for native', () => {
      const result = generatePlatformCsv('freepik', mockRecords, 'test_batch');
      const lines = result.csvString.split(/\r?\n/).filter(Boolean);

      // Header should contain Prompt and Model
      expect(lines[0]).toContain('Prompt');
      expect(lines[0]).toContain('Model');

      // Row 1 has prompt and model
      expect(lines[1]).toContain('Google Nano Banana');

      // Row 2 does not have model
      const row2Cols = lines[2].split(';');
      // Prompt (index 3) and Model (index 4) should be empty
      expect(row2Cols[3]).toBe('');
      expect(row2Cols[4]).toBe('');
    });
  });

  describe('Dreamstime CSV Specification', () => {
    it('generates Dreamstime CSV with numeric categories', () => {
      const result = generatePlatformCsv('dreamstime', mockRecords, 'test_batch');
      expect(result.isBlocked).toBeFalsy();
      const lines = result.csvString.split(/\r?\n/).filter(Boolean);

      // Dreamstime has Category 1, Category 2, Category 3
      expect(lines[0]).toContain('Category 1');
      expect(lines[0]).toContain('Category 2');
      expect(lines[0]).toContain('Category 3');

      // AI item has 212 for Category 3
      expect(lines[1]).toContain('212');
    });
  });

  describe('Vecteezy CSV Specification', () => {
    it('generates Vecteezy CSV with License column', () => {
      const result = generatePlatformCsv('vecteezy', mockRecords, 'test_batch');
      expect(result.isBlocked).toBeFalsy();
      const lines = result.csvString.split(/\r?\n/).filter(Boolean);
      expect(lines[0]).toContain('License');
      expect(lines[1]).toMatch(/Pro|Free/i);
    });
  });

  describe('123RF CSV Specification', () => {
    it('generates 123RF CSV with country code column', () => {
      const result = generatePlatformCsv('123rf', mockRecords, 'test_batch');
      expect(result.isBlocked).toBeFalsy();
      const lines = result.csvString.split(/\r?\n/).filter(Boolean);
      expect(lines[0].toLowerCase()).toContain('country');
    });
  });
});
