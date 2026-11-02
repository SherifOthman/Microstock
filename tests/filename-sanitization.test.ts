import { describe, it, expect } from 'vitest';
import { cleanFilenameHint } from '../src/services/ai/masterPrompt';
import { parseAndNormalizeAiMetadata } from '../src/services/ai/metadataParser';
import { cleanOriginalBaseName, getFuzzyNormalizedBaseName } from '../src/services/cleaner/fileCleanerEngine';

describe('Filename Hash and Alphanumeric ID Sanitization', () => {
  it('strips trailing hex hashes like _33dc072c, _a9608e40 from filename hints', () => {
    expect(cleanFilenameHint('car_exhaust_33dc072c.mp4')).toBe('car exhaust');
    expect(cleanFilenameHint('asteroid_in_deep_space_a9608e40.mp4')).toBe('asteroid in deep space');
    expect(cleanFilenameHint('sunset_landscape_9710797b_1.jpg')).toBe('sunset landscape');
  });

  it('strips hyphenated hashes and versions like -33dc072c-v2', () => {
    expect(cleanFilenameHint('sports_car_flame-33dc072c-v2.mov')).toBe('sports car flame');
    expect(cleanFilenameHint('modern_architecture_b48f9021_01.jpg')).toBe('modern architecture');
  });

  it('handles hybrid batch naming with double underscore', () => {
    expect(cleanFilenameHint('B01_001__midjourney_coffee_cup_a9608e40.jpg')).toBe('coffee cup');
    expect(cleanFilenameHint('B02_045__sports_car_exhaust_9710797b_1.mp4')).toBe('sports car exhaust');
  });

  it('strips hash leakage from baseTitle in metadataParser', () => {
    const rawAiWithHash = JSON.stringify({
      base_title: 'Car Exhaust Flame Flickering 33dc072c',
      detailed_description: 'A sports car exhaust emitting flames at night.',
      ranked_keywords: ['exhaust', 'flame', 'car', 'sports car', 'speed', 'turbo', 'tailpipe', 'fire', 'engine', 'night'],
      category_adobe: 20,
      category_shutterstock: ['Industrial', 'Transportation'],
      dreamstime_category_1: 'Industries -> Transportation',
    });

    const record = parseAndNormalizeAiMetadata(
      rawAiWithHash,
      'car_exhaust_33dc072c.mp4',
      'data:image/jpeg;base64,mock',
      'batch-1',
      true,
      'Google Nano Banana',
      'mixed',
      'video'
    );

    expect(record.baseTitle).not.toContain('33dc072c');
    expect(record.baseTitle).toBe('Car Exhaust Flame Flickering');
  });

  it('fileCleanerEngine strips hex hashes and versions', () => {
    expect(cleanOriginalBaseName('car_exhaust_33dc072c.mp4')).toBe('car_exhaust');
    expect(cleanOriginalBaseName('sports_car_9710797b_1.jpg')).toBe('sports_car');
    expect(getFuzzyNormalizedBaseName('mountain_lake_a9608e40_upscayl.jpg')).toBe('mountain lake');
  });
});
