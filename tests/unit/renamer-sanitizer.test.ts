import { describe, it, expect } from 'vitest';
import {
  sanitizeRenamerFilename,
  smartTruncate,
  stripDanglingWords,
} from '../../src/utils/renamerSanitizer';

describe('Tier 1 Unit: Renamer Sanitizer & RegEx Cleanse', () => {
  describe('Bug 1: Multi-Pass Embedded Hex Hashes & Trailing ID Removal', () => {
    it('strips hex hash before resolution token (311e93b6_1080p)', () => {
      const result = sanitizeRenamerFilename('Green_laser_scanning_carbon_fiber_311e93b6_1080p.mp4');
      expect(result.cleanBase).toBe('green_laser_scanning_carbon_fiber');
      expect(result.detectedHash).toBe('311e93b6');
      expect(result.needsFixing).toBe(false);
    });

    it('strips hex hash before resolution token (33dc072c_1080p)', () => {
      const result = sanitizeRenamerFilename('Glowing_ember_line_creeping_hori_33dc072c_1080p.mp4');
      expect(result.cleanBase).toBe('glowing_ember_line_creeping_hori');
      expect(result.detectedHash).toBe('33dc072c');
    });

    it('strips trailing hex hash without resolution token (e9949579)', () => {
      const result = sanitizeRenamerFilename('Abstract_digital_particles_wave_e9949579.mp4');
      expect(result.cleanBase).toBe('abstract_digital_particles_wave');
      expect(result.detectedHash).toBe('e9949579');
    });

    it('strips 8-character hex hash before 4K token (3388947c_4k)', () => {
      const result = sanitizeRenamerFilename('Futuristic_hud_interface_overlay_3388947c_4k.mp4');
      expect(result.cleanBase).toBe('futuristic_hud_interface_overlay');
      expect(result.detectedHash).toBe('3388947c');
    });

    it('strips trailing 8-character hex hash from mov file (fa99701b)', () => {
      const result = sanitizeRenamerFilename('Hologram_ai_brain_circuit_fa99701b.mov');
      expect(result.cleanBase).toBe('hologram_ai_brain_circuit');
      expect(result.detectedHash).toBe('fa99701b');
    });

    it('strips 8-character hex hash before 1080p (ad5b02e0_1080p)', () => {
      const result = sanitizeRenamerFilename('Golden_glitter_bokeh_background_ad5b02e0_1080p.mp4');
      expect(result.cleanBase).toBe('golden_glitter_bokeh_background');
      expect(result.detectedHash).toBe('ad5b02e0');
    });

    it('strips 8-character hex hash before 2160p (cb9c8051_2160p)', () => {
      const result = sanitizeRenamerFilename('Water_droplets_condensing_on_glass_cb9c8051_2160p.mp4');
      expect(result.cleanBase).toBe('water_droplets_condensing_on_glass');
      expect(result.detectedHash).toBe('cb9c8051');
    });

    it('strips trailing hex hash (a9608e40)', () => {
      const result = sanitizeRenamerFilename('Cyberpunk_neon_city_street_rain_a9608e40.mp4');
      expect(result.cleanBase).toBe('cyberpunk_neon_city_street_rain');
      expect(result.detectedHash).toBe('a9608e40');
    });

    it('strips hex hash with trailing version number (_9710797b_1)', () => {
      const result = sanitizeRenamerFilename('Fluid_smoke_explosion_dark_9710797b_1.mp4');
      expect(result.cleanBase).toBe('fluid_smoke_explosion_dark');
      expect(result.detectedHash).toBe('9710797b');
    });

    it('strips UUID-like 32-character MD5 hex hash', () => {
      const result = sanitizeRenamerFilename('Mountain_sunset_aerial_view_c4ca4238a0b923820dcc509a6f75849b.jpg');
      expect(result.cleanBase).toBe('mountain_sunset_aerial_view');
      expect(result.detectedHash).toBeTruthy();
    });

    it('strips mid-string embedded hex hash correctly', () => {
      const result = sanitizeRenamerFilename('Coffee_311e93b6_beans_roasting.jpg');
      expect(result.cleanBase).toBe('coffee_beans_roasting');
    });

    it('strips multiple consecutive hash tokens', () => {
      const result = sanitizeRenamerFilename('vintage_car_drive_a1b2c3d4_e5f6a7b8_1080p.mp4');
      expect(result.cleanBase).toBe('vintage_car_drive');
    });
  });

  describe('Bug 2: Meaningless / Purely Numeric Filenames (_Needs_Fixing)', () => {
    it('flags purely numeric timestamp filenames (425997637_1793366301908538.mp4)', () => {
      const result = sanitizeRenamerFilename('425997637_1793366301908538.mp4');
      expect(result.needsFixing).toBe(true);
      expect(result.cleanBase).toBe('425997637_1793366301908538');
    });

    it('flags camera default filenames with < 2 words (IMG_9082.JPG)', () => {
      const result = sanitizeRenamerFilename('IMG_9082.JPG');
      expect(result.needsFixing).toBe(true);
    });

    it('flags purely numeric underscore separated numbers (12345_67890.mp4)', () => {
      const result = sanitizeRenamerFilename('12345_67890.mp4');
      expect(result.needsFixing).toBe(true);
    });

    it('flags video default filenames (VID_20261101_152300.mp4)', () => {
      const result = sanitizeRenamerFilename('VID_20261101_152300.mp4');
      expect(result.needsFixing).toBe(true);
    });

    it('flags drone camera default filenames (DJI_0042.MP4)', () => {
      const result = sanitizeRenamerFilename('DJI_0042.MP4');
      expect(result.needsFixing).toBe(true);
    });

    it('flags single word filenames with digits (001_photo.jpg)', () => {
      const result = sanitizeRenamerFilename('001_photo.jpg');
      expect(result.needsFixing).toBe(true);
    });

    it('flags short meaningless 2-letter fragments (ab_cd.jpg)', () => {
      const result = sanitizeRenamerFilename('ab_cd.jpg');
      expect(result.needsFixing).toBe(true);
    });

    it('accepts valid 2-word filenames with words >= 3 chars (red_car.jpg)', () => {
      const result = sanitizeRenamerFilename('red_car.jpg');
      expect(result.needsFixing).toBe(false);
      expect(result.cleanBase).toBe('red_car');
    });

    it('accepts valid 3-word descriptive filenames (wooden_coffee_table.jpg)', () => {
      const result = sanitizeRenamerFilename('wooden_coffee_table.jpg');
      expect(result.needsFixing).toBe(false);
      expect(result.cleanBase).toBe('wooden_coffee_table');
    });
  });

  describe('Bug 3: Word-Boundary Truncation & Dangling Fragment Cleanse', () => {
    it('truncates at word boundary without chopping mid-word', () => {
      const str = 'melted_chocolate_flowing_over_bread_delicious_studio';
      // Truncate to 35 chars
      const truncated = smartTruncate(str, 35);
      expect(truncated.endsWith('_br')).toBe(false);
      expect(truncated).toBe('melted_chocolate_flowing_over_bread');
    });

    it('strips dangling prepositions when truncation lands on preposition', () => {
      const str = 'autumn_forest_landscape_with';
      const cleaned = stripDanglingWords(str);
      expect(cleaned).toBe('autumn_forest_landscape');
    });

    it('strips dangling "in", "for", "of", "on", "at", "and", "the", "a"', () => {
      expect(stripDanglingWords('sunset_over_the')).toBe('sunset');
      expect(stripDanglingWords('portrait_of_a')).toBe('portrait');
      expect(stripDanglingWords('businessman_working_in')).toBe('businessman_working');
      expect(stripDanglingWords('gifts_wrapped_for')).toBe('gifts_wrapped');
    });

    it('strips dangling incomplete word fragments like _br, _b, _w, _u', () => {
      expect(stripDanglingWords('melted_chocolate_flowing_over_br')).toBe('melted_chocolate_flowing');
      expect(stripDanglingWords('waterfall_splashing_in_w')).toBe('waterfall_splashing');
      expect(stripDanglingWords('modern_kitchen_interior_b')).toBe('modern_kitchen_interior');
    });

    it('handles strings already shorter than max length without modification', () => {
      const str = 'blue_sky_clouds';
      expect(smartTruncate(str, 50)).toBe('blue_sky_clouds');
    });
  });

  describe('Nomenclature Idempotency & Re-entrancy', () => {
    it('recognizes already formatted AI video filename', () => {
      const result = sanitizeRenamerFilename('B01_AI_VD_001_green_laser_scanning_carbon_fiber.mp4');
      expect(result.isAlreadyFormatted).toBe(true);
      expect(result.cleanBase).toBe('green_laser_scanning_carbon_fiber');
    });

    it('recognizes already formatted Native photo filename', () => {
      const result = sanitizeRenamerFilename('B02_NT_PH_042_wooden_coffee_table.jpg');
      expect(result.isAlreadyFormatted).toBe(true);
      expect(result.cleanBase).toBe('wooden_coffee_table');
    });

    it('recognizes already formatted AI vector filename', () => {
      const result = sanitizeRenamerFilename('B03_AI_VC_007_abstract_geometric_pattern.eps');
      expect(result.isAlreadyFormatted).toBe(true);
      expect(result.cleanBase).toBe('abstract_geometric_pattern');
    });

    it('does not double prepend batch prefix to already formatted file', () => {
      const result = sanitizeRenamerFilename('B01_001__midjourney_coffee_cup.jpg');
      expect(result.isAlreadyFormatted).toBe(true);
      expect(result.cleanBase).toBe('coffee_cup');
    });
  });
});
