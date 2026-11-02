import { describe, it, expect } from 'vitest';
import { parseAndNormalizeAiMetadata } from '../src/services/ai/metadataParser';
import { buildVisionPrompt } from '../src/services/ai/masterPrompt';

describe('Video Resolution Keyword Guardrails (1080p vs 4K)', () => {
  const sampleKeywordsWith4K = [
    'exhaust',
    'flame',
    'car',
    'speed',
    '4k',
    'uhd',
    '8k',
    'ultra hd',
    'night',
    'automotive',
    'tailpipe',
    'fire',
    'engine',
    'racing',
    'motion',
  ];

  it('strictly purges 4K, UHD, 8K keywords from 1080p video metadata', () => {
    const rawAiOutput = JSON.stringify({
      base_title: 'Car Exhaust Flame Flickering at Night',
      detailed_description: 'High performance car exhaust flickering flames on road at night.',
      ranked_keywords: sampleKeywordsWith4K,
      category_adobe: 20,
      category_shutterstock: ['Industrial', 'Transportation'],
      dreamstime_category_1: 'Industries -> Transportation',
    });

    const record = parseAndNormalizeAiMetadata(
      rawAiOutput,
      'car_exhaust_1080p.mp4',
      'data:image/jpeg;base64,mock',
      'batch-1',
      true,
      'Google Nano Banana',
      'mixed',
      'video',
      '1080p',
      1920,
      1080
    );

    const kws = record.rankedKeywords.map((k) => k.toLowerCase());
    expect(kws).not.toContain('4k');
    expect(kws).not.toContain('uhd');
    expect(kws).not.toContain('8k');
    expect(kws).not.toContain('ultra hd');
    expect(kws).toContain('exhaust');
    expect(kws).toContain('flame');
  });

  it('guarantees 4K keyword is present for genuine 4K video (3840x2160)', () => {
    const rawAiOutputWithout4K = JSON.stringify({
      base_title: 'Rotating Asteroid in Deep Space',
      detailed_description: 'Rocky cratered asteroid tumbling slowly in deep space vacuum.',
      ranked_keywords: [
        'asteroid',
        'space',
        'meteor',
        'cosmos',
        'planet',
        'universe',
        'galaxy',
        'astronomy',
        'orbit',
        'science',
        'dark',
        'celestial',
      ],
      category_adobe: 16,
      category_shutterstock: ['Science', 'Technology'],
      dreamstime_category_1: 'Abstract -> Planetarium',
    });

    const record = parseAndNormalizeAiMetadata(
      rawAiOutputWithout4K,
      'asteroid_4k.mp4',
      'data:image/jpeg;base64,mock',
      'batch-1',
      true,
      'Google Nano Banana',
      'mixed',
      'video',
      '4K UHD',
      3840,
      2160
    );

    const kws = record.rankedKeywords.map((k) => k.toLowerCase());
    expect(kws).toContain('4k');
    expect(record.videoMeta?.width).toBe(3840);
    expect(record.videoMeta?.resolution).toBe('4K UHD');
  });

  it('buildVisionPrompt generates strict anti-4k instruction for 1080p videos', () => {
    const prompt1080 = buildVisionPrompt(
      'forest_drone_1080p.mp4',
      '',
      'video',
      'mixed',
      'optimal',
      true,
      '1080p',
      1920,
      1080
    );
    expect(prompt1080).toContain('strictly 1080p Full HD');
    expect(prompt1080).toContain('DO NOT output "4k"');

    const prompt4k = buildVisionPrompt(
      'forest_drone_4k.mp4',
      '',
      'video',
      'mixed',
      'optimal',
      true,
      '4K UHD',
      3840,
      2160
    );
    expect(prompt4k).toContain('genuine 4K UHD');
    expect(prompt4k).toContain('"4k"');
  });
});
