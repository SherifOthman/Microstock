import { describe, it, expect } from 'vitest';
import {
  findDreamstimeCategoryId,
  mapToDreamstimeCategories,
  getDreamstimeCategoryName,
} from '../src/constants/categories';
import { parseAndNormalizeAiMetadata } from '../src/services/ai/metadataParser';

describe('Dreamstime Category Resolution and Domain Sanity', () => {
  it('correctly resolves Dreamstime string category names to official IDs', () => {
    expect(findDreamstimeCategoryId('Nature -> Forests')).toBe(18);
    expect(findDreamstimeCategoryId('Nature -> Sea & Ocean')).toBe(19);
    expect(findDreamstimeCategoryId('Industries -> Transportation')).toBe(98);
    expect(findDreamstimeCategoryId('Abstract -> Backgrounds')).toBe(112);
    expect(findDreamstimeCategoryId('Illustrations & Clipart -> AI generated')).toBe(212);
  });

  it('maps Transportation/Vehicles away from Food & Beverages even if AI hallucinates food', () => {
    const carMapping = mapToDreamstimeCategories(20, ['Industrial', 'Transportation'], false, 'Car Exhaust Flame');
    expect(carMapping.cat1).toBe(98); // Industries -> Transportation
    expect([82, 156]).toContain(carMapping.cat2);
    expect(carMapping.cat1).not.toBe(127); // NOT Food & Beverages
    expect(carMapping.cat2).not.toBe(127);

    const bicycleMapping = mapToDreamstimeCategories(18, ['Sports/Recreation'], false, 'Mountain Bicycle Cycling');
    expect([98, 156]).toContain(bicycleMapping.cat1);
    expect([98, 156]).toContain(bicycleMapping.cat2);
    expect(bicycleMapping.cat1).not.toBe(127);
    expect(bicycleMapping.cat2).not.toBe(127);
  });

  it('enforces strict domain sanity in metadataParser for vehicle images', () => {
    // Simulate AI hallucinating Food & Beverages (127) for a sports car
    const rawAiHallucination = JSON.stringify({
      base_title: 'Car Exhaust Flame Flickering from Sports Car Tailpipe',
      detailed_description: 'Close-up video of sports car exhaust with vibrant flame flickering.',
      ranked_keywords: ['exhaust', 'flame', 'car', 'sports car', 'speed', 'turbo', 'engine', 'tailpipe', 'fire', 'night'],
      category_adobe: 20,
      category_shutterstock: ['Industrial', 'Transportation'],
      dreamstime_category_1: 'Industries -> Food & Beverages',
      dreamstime_category_2: 'Nature -> Fruits & Vegetables',
    });

    const record = parseAndNormalizeAiMetadata(
      rawAiHallucination,
      'sports_car_exhaust.mp4',
      'data:image/jpeg;base64,mock',
      'batch-1',
      true,
      'Google Nano Banana',
      'mixed',
      'video'
    );

    expect(record.categories?.dreamstimeCategory1).toBe(98); // Overridden to Transportation
    expect(record.categories?.dreamstimeCategory2).toBe(156); // Overridden to Sports
    expect(record.categories?.dreamstimeCategory1).not.toBe(127);
    expect(record.categories?.dreamstimeCategory2).not.toBe(127);
    expect(record.categories?.dreamstimeCategory3).toBe(212); // AI generated
  });

  it('maps Deep Space / Asteroids to Planetarium or Science', () => {
    const spaceMapping = mapToDreamstimeCategories(16, ['Science'], false, 'Rotating Asteroid in Deep Space');
    expect(spaceMapping.cat1).toBe(165); // Abstract -> Planetarium
    expect(spaceMapping.cat2).toBe(209); // Technology -> Science
  });

  it('getDreamstimeCategoryName formats category names cleanly', () => {
    expect(getDreamstimeCategoryName(98)).toBe('Transportation');
    expect(getDreamstimeCategoryName(156)).toBe('Sports');
    expect(getDreamstimeCategoryName(212)).toBe('AI generated');
    expect(getDreamstimeCategoryName(0)).toBe('');
    expect(getDreamstimeCategoryName(undefined)).toBe('');
  });
});
