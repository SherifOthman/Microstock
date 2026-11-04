import { describe, it, expect } from 'vitest';
import {
  parseAndNormalizeAiMetadata,
} from '../../src/services/ai/metadataParser';
import {
  SYSTEM_VISION_PROMPT,
  buildVisionPrompt,
} from '../../src/services/ai/masterPrompt';
import {
  filterResolutionKeywords,
  deGlueCompoundWord,
  enforceKeywordLimit,
  rebalanceTopKeywords,
} from '../../src/utils/keywordUtils';
import {
  findDreamstimeCategoryId,
} from '../../src/constants/dreamstimeCategories';
import {
  SHUTTERSTOCK_IMAGE_CATEGORIES,
  SHUTTERSTOCK_VIDEO_CATEGORY_LIST,
  normalizeShutterstockCategories,
} from '../../src/constants/shutterstockCategories';
import { ADOBE_CATEGORIES } from '../../src/constants/adobeCategories';

describe('Tier 1 Unit: Metadata Guardrails & Microstock Validation', () => {
  describe('Resolution Guardrails (1080p vs 4K)', () => {
    it('removes 4k, uhd, and ultra hd tags when video is 1080p (1920x1080)', () => {
      const keywords = ['forest', 'river', '4k', 'ultra hd', 'uhd', 'nature', 'water', '1080p', 'fhd'];
      const filtered = filterResolutionKeywords(keywords, 1920, 1080, 'video');
      expect(filtered).not.toContain('4k');
      expect(filtered).not.toContain('ultra hd');
      expect(filtered).not.toContain('uhd');
      expect(filtered).toContain('1080p');
      expect(filtered).toContain('nature');
    });

    it('removes 1080p and fhd tags when video is 4K (3840x2160)', () => {
      const keywords = ['city', 'traffic', '4k', 'uhd', '1080p', 'full hd', 'fhd'];
      const filtered = filterResolutionKeywords(keywords, 3840, 2160, 'video');
      expect(filtered).not.toContain('1080p');
      expect(filtered).not.toContain('full hd');
      expect(filtered).not.toContain('fhd');
      expect(filtered).toContain('4k');
      expect(filtered).toContain('uhd');
    });

    it('strips all video resolution tags from still photos', () => {
      const keywords = ['portrait', 'studio', '4k', '1080p', 'uhd', 'photography'];
      const filtered = filterResolutionKeywords(keywords, 6000, 4000, 'photo');
      expect(filtered).not.toContain('4k');
      expect(filtered).not.toContain('1080p');
      expect(filtered).not.toContain('uhd');
      expect(filtered).toContain('portrait');
    });

    it('handles metadata parser auto-removal of 4K for 1080p video', () => {
      const rawAiResponse = JSON.stringify({
        base_title: 'Green Laser Scanning Carbon Fiber Surface',
        detailed_description: 'Macro video of high tech green laser beam scanning industrial carbon fiber panel.',
        ranked_keywords: [
          'laser', 'carbon fiber', '4k', '1080p', 'technology', 'industrial', 'scan', 'beam',
          'light', 'macro', 'surface', 'high tech', 'device', 'material', 'production'
        ],
        category_adobe: 19,
        category_shutterstock: ['Technology', 'Industrial'],
        dreamstime_category_1: 'Technology -> Laser',
        dreamstime_category_2: 'Industries -> Manufacturing',
      });

      const parsed = parseAndNormalizeAiMetadata(
        rawAiResponse,
        'laser_scan_1080p.mp4',
        '',
        'batch-1',
        true,
        'Google Nano Banana',
        'mixed',
        'video',
        '1080p',
        1920,
        1080
      );

      expect(parsed.rankedKeywords).not.toContain('4k');
      expect(parsed.rankedKeywords).toContain('1080p');
      expect(parsed.videoMeta?.resolution).toBe('1080p');
    });
  });

  describe('Dreamstime Categories & Domain Sanity', () => {
    it('never assigns Food & Beverages to bicycle / transportation assets', () => {
      const rawAiResponse = JSON.stringify({
        base_title: 'Vintage Bicycle Parked by Old Brick Wall',
        detailed_description: 'Classic road bike leaning against rustic brick wall in an urban alley.',
        ranked_keywords: [
          'bicycle', 'bike', 'urban', 'transportation', 'vintage', 'brick wall', 'street',
          'retro', 'wheels', 'cycling', 'classic', 'city', 'outdoor', 'parked', 'cyclist'
        ],
        category_adobe: 20,
        category_shutterstock: ['Transportation'],
        dreamstime_category_1: 'Industries -> Food & Beverages', // Simulated hallucination
        dreamstime_category_2: 'Food & Beverages',
      });

      const parsed = parseAndNormalizeAiMetadata(
        rawAiResponse,
        'vintage_bicycle_wall.jpg',
        '',
        'batch-1',
        false
      );

      expect(parsed.categories?.dreamstimeCategory1).not.toBe(127); // 127 is Food & Beverages
      expect(parsed.categories?.dreamstimeCategory2).not.toBe(127);
      expect(parsed.categories?.dreamstimeCategory1).toBe(98); // Industries -> Transportation
    });

    it('never assigns Food & Beverages to sports car tailpipe exhaust assets', () => {
      const rawAiResponse = JSON.stringify({
        base_title: 'Car Exhaust Flame Flickering from Sports Car Tailpipe at Night',
        detailed_description: 'Close-up video footage of a high performance car exhaust pipe emitting flames.',
        ranked_keywords: [
          'car', 'exhaust', 'flame', 'tailpipe', 'sports car', 'automotive', 'night',
          'power', 'motor', 'vehicle', 'speed', 'tuning', 'race', 'backfire', 'fire'
        ],
        category_adobe: 10,
        category_shutterstock: ['Industrial', 'Transportation'],
        dreamstime_category_1: 'Industries -> Food & Beverages', // Hallucination shown in user screenshot
        dreamstime_category_2: 'Food & Beverages',
      });

      const parsed = parseAndNormalizeAiMetadata(
        rawAiResponse,
        'car_exhaust_flame.mp4',
        '',
        'batch-1',
        true,
        'Google Nano Banana',
        'mixed',
        'video',
        '1080p',
        1920,
        1080
      );

      expect(parsed.categories?.dreamstimeCategory1).not.toBe(127);
      expect(parsed.categories?.dreamstimeCategory2).not.toBe(127);
      expect([98, 82, 156]).toContain(parsed.categories?.dreamstimeCategory1);
    });

    it('never assigns Computers to deep space or asteroid assets', () => {
      const rawAiResponse = JSON.stringify({
        base_title: 'Rotating Asteroid in Deep Space with Cratered Surface Texture',
        detailed_description: 'Cinematic video clip showing a large rocky asteroid rotating slowly against deep space.',
        ranked_keywords: [
          'asteroid', 'space', 'cosmos', 'universe', 'planet', 'astronomy', 'orbit',
          'deep space', 'galaxy', 'crater', 'celestial', 'meteor', 'rock', 'science', 'stellar'
        ],
        category_adobe: 16,
        category_shutterstock: ['Science', 'Backgrounds/Textures'],
        dreamstime_category_1: 'Technology -> Computers', // Hallucination shown in user screenshot
        dreamstime_category_2: 'Computers',
      });

      const parsed = parseAndNormalizeAiMetadata(
        rawAiResponse,
        'asteroid_space.mp4',
        '',
        'batch-1',
        true
      );

      expect(parsed.categories?.dreamstimeCategory1).not.toBe(105); // 105 is Computers
      expect(parsed.categories?.dreamstimeCategory2).not.toBe(105);
      expect([165, 209]).toContain(parsed.categories?.dreamstimeCategory1); // Planetarium (165) or Science (209)
    });

    it('assigns Category 3 = 212 (AI generated) if and only if isAiGenerated is true', () => {
      const keywords = ['test1', 'test2', 'test3', 'test4', 'test5', 'test6', 'test7', 'test8', 'test9', 'test10', 'test11'];
      const rawAi = JSON.stringify({ base_title: 'AI Asset Test', ranked_keywords: keywords });
      const aiParsed = parseAndNormalizeAiMetadata(rawAi, 'b1', 'ai_asset.jpg', '', true);
      const nativeParsed = parseAndNormalizeAiMetadata(rawAi, 'b1', 'native_asset.jpg', '', false);

      expect(aiParsed.categories?.dreamstimeCategory3).toBe(212);
      expect(nativeParsed.categories?.dreamstimeCategory3).toBe(0);
    });

    it('resolves valid Dreamstime string categories to official IDs', () => {
      expect(findDreamstimeCategoryId('Industries -> Transportation')).toBe(98);
      expect(findDreamstimeCategoryId('Abstract -> Planetarium')).toBe(165);
      expect(findDreamstimeCategoryId('Animals -> Wildlife')).toBe(168);
      expect(findDreamstimeCategoryId('Nature -> Landscapes')).toBe(146);
    });
  });

  describe('Shutterstock Categories Normalization (Video vs Image)', () => {
    it('maintains 26 valid Shutterstock Image categories', () => {
      expect(SHUTTERSTOCK_IMAGE_CATEGORIES.length).toBe(26);
      expect(SHUTTERSTOCK_IMAGE_CATEGORIES).toContain('Interiors');
      expect(SHUTTERSTOCK_IMAGE_CATEGORIES).toContain('Beauty/Fashion');
      expect(SHUTTERSTOCK_IMAGE_CATEGORIES).toContain('Celebrities');
    });

    it('maintains 19 valid Shutterstock Video categories', () => {
      expect(SHUTTERSTOCK_VIDEO_CATEGORY_LIST.length).toBe(19);
      expect(SHUTTERSTOCK_VIDEO_CATEGORY_LIST).not.toContain('Interiors');
      expect(SHUTTERSTOCK_VIDEO_CATEGORY_LIST).not.toContain('Beauty/Fashion');
      expect(SHUTTERSTOCK_VIDEO_CATEGORY_LIST).not.toContain('Vintage');
    });

    it('remaps forbidden video categories (Interiors -> Buildings/Landmarks)', () => {
      const normalized = normalizeShutterstockCategories(['Interiors'], true);
      expect(normalized).toContain('Buildings/Landmarks');
      expect(normalized).not.toContain('Interiors');
    });

    it('remaps forbidden video categories (Beauty/Fashion -> People)', () => {
      const normalized = normalizeShutterstockCategories(['Beauty/Fashion'], true);
      expect(normalized).toContain('People');
      expect(normalized).not.toContain('Beauty/Fashion');
    });

    it('keeps valid video categories unchanged (Technology, Industrial)', () => {
      const normalized = normalizeShutterstockCategories(['Technology', 'Industrial'], true);
      expect(normalized).toEqual(['Technology', 'Industrial']);
    });
  });

  describe('Keyword Limits & De-Gluer Processing', () => {
    it('strictly enforces the 49 keyword ceiling', () => {
      const fiftyKeywords = Array.from({ length: 60 }, (_, i) => `keyword${i + 1}`);
      const limited = enforceKeywordLimit(fiftyKeywords, 49);
      expect(limited).toHaveLength(49);
    });

    it('de-glues compound microstock words (solarenergy -> solar energy)', () => {
      expect(deGlueCompoundWord('solarenergy')).toBe('solar energy');
      expect(deGlueCompoundWord('coffeecup')).toBe('coffee cup');
      expect(deGlueCompoundWord('woodenbench')).toBe('wooden bench');
      expect(deGlueCompoundWord('smartwatch')).toBe('smart watch');
    });

    it('rebalances top 10 keywords placing high-priority terms first', () => {
      const keywords = ['background', 'modern', 'digital', 'coffee', 'cup', 'beans', 'mug', 'espresso', 'steam', 'table'];
      const rebalanced = rebalanceTopKeywords(keywords, 'Fresh Hot Espresso Coffee Cup with Rising Steam');
      expect(rebalanced[0]).toBe('coffee');
      expect(rebalanced.slice(0, 5)).toContain('cup');
      expect(rebalanced.slice(0, 5)).toContain('espresso');
    });
  });

  describe('Adobe Stock Categories Validation', () => {
    it('verifies all 21 Adobe stock categories match official specification', () => {
      expect(Object.keys(ADOBE_CATEGORIES)).toHaveLength(21);
      expect(ADOBE_CATEGORIES[1]).toBe('Animals');
      expect(ADOBE_CATEGORIES[7]).toBe('Food');
      expect(ADOBE_CATEGORIES[16]).toBe('Science');
      expect(ADOBE_CATEGORIES[19]).toBe('Technology');
      expect(ADOBE_CATEGORIES[20]).toBe('Transport');
    });
  });
  describe('Microstock Guidelines for Both Titles and Keywords (Vecteezy & Shutterstock Compliance)', () => {
    it('SYSTEM_VISION_PROMPT mandates rules for BOTH Titles and Keywords with all 5 constraints', () => {
      // Mandated for both titles and keywords
      expect(SYSTEM_VISION_PROMPT).toContain('MANDATORY FOR BOTH TITLES AND KEYWORDS');

      // 1. NO ASSET TYPE REDUNDANCY: file format and medium words
      expect(SYSTEM_VISION_PROMPT).toContain('NO ASSET TYPE REDUNDANCY (FOR BOTH TITLES AND KEYWORDS)');
      expect(SYSTEM_VISION_PROMPT).toContain('"vector", "eps", "illustration", "drawing", "clipart", "photo", "picture", "image", "jpg", "video", "footage", "clip", "mp4", "motion", "concept video", "commercial video"');

      // 2. NO TRADEMARKS
      expect(SYSTEM_VISION_PROMPT).toContain('NO TRADEMARKS (FOR BOTH TITLES AND KEYWORDS)');
      expect(SYSTEM_VISION_PROMPT).toContain('iPhone, Apple, Windows, Nike');

      // 3. NO CAMERA/TECH SPECS
      expect(SYSTEM_VISION_PROMPT).toContain('NO CAMERA SPECS / NO TECH SPECS (FOR BOTH TITLES AND KEYWORDS)');
      expect(SYSTEM_VISION_PROMPT).toContain('"4k", "8k", "60fps", "30fps", "1080p"');

      // 4. TITLES: Descriptive, natural, without prohibited terms
      expect(SYSTEM_VISION_PROMPT).toContain('TITLES must be highly descriptive, natural, commercial, and accurately describe the exact subject matter without using prohibited terms');

      // 5. KEYWORDS: Prevent repetitive variations of the same root word
      expect(SYSTEM_VISION_PROMPT).toContain('Prevent repetitive variations of the same root word');
      expect(SYSTEM_VISION_PROMPT).toContain('Who, What, Where, When, Why');
    });

    it('buildVisionPrompt for video enforces strict Vecteezy & Shutterstock rules for titles and keywords', () => {
      const prompt = buildVisionPrompt('drone_flight.mp4', '', 'video');
      expect(prompt).toContain('STRICT VECTEEZY & SHUTTERSTOCK COMPLIANCE (FOR BOTH TITLES AND KEYWORDS)');
      expect(prompt).toContain('NO ASSET TYPE REDUNDANCY');
      expect(prompt).toContain('"video", "footage", "clip", "mp4", "motion", "concept video", "commercial video"');
      expect(prompt).toContain('NO CAMERA/TECH SPECS');
      expect(prompt).toContain('TITLES: Must be highly descriptive, natural, and accurately describe the exact subject matter without using prohibited terms');
      expect(prompt).toContain('KEYWORDS: Prevent repetitive variations of the same root word');
    });

    it('buildVisionPrompt for vector enforces strict Vecteezy & Shutterstock rules for titles and keywords', () => {
      const prompt = buildVisionPrompt('business_icon.eps', '', 'vector');
      expect(prompt).toContain('STRICT VECTEEZY & SHUTTERSTOCK COMPLIANCE (FOR BOTH TITLES AND KEYWORDS)');
      expect(prompt).toContain('NO ASSET TYPE REDUNDANCY');
      expect(prompt).toContain('"vector", "eps", "illustration", "drawing", "clipart", "photo", "picture", "image", "jpg"');
      expect(prompt).toContain('NO TRADEMARKS');
      expect(prompt).toContain('NO CAMERA/TECH SPECS');
      expect(prompt).toContain('TITLES: Must be highly descriptive, natural, and accurately describe the exact subject matter without using prohibited terms');
      expect(prompt).toContain('KEYWORDS: Prevent repetitive variations of the same root word');
    });

    it('buildVisionPrompt for photo enforces strict Vecteezy & Shutterstock rules for titles and keywords', () => {
      const prompt = buildVisionPrompt('coffee_mug.jpg', '', 'image');
      expect(prompt).toContain('STRICT VECTEEZY & SHUTTERSTOCK COMPLIANCE (FOR BOTH TITLES AND KEYWORDS)');
      expect(prompt).toContain('NO ASSET TYPE REDUNDANCY');
      expect(prompt).toContain('"photo", "picture", "image", "jpg", "photograph", "video", "clip"');
      expect(prompt).toContain('NO CAMERA/TECH SPECS');
      expect(prompt).toContain('NO TRADEMARKS');
      expect(prompt).toContain('TITLES: Must be highly descriptive, natural, and accurately describe the exact subject matter without using prohibited terms');
      expect(prompt).toContain('KEYWORDS: Prevent repetitive variations of the same root word');
    });
  });
});