import { describe, it, expect } from 'vitest';
import { generatePlatformCsv } from '../../src/services/export/csvExporter';
import { MasterMetadataRecord } from '../../src/types';

describe('Magnific mixed media export check', () => {
  it('correctly exports non-video records even when photo has videoMeta dimensions attached', () => {
    const records: MasterMetadataRecord[] = [
      {
        id: '1',
        batchId: 'b1',
        filename: 'B01_001_AI_egyptian_koshari.jpg',
        mediaType: 'image',
        baseTitle: 'Traditional Egyptian Koshari Bowl',
        detailedDescription: 'Traditional Egyptian Koshari Bowl',
        rankedKeywords: ['egyptian', 'koshari'],
        status: 'completed',
        thumbnailBase64: '',
        isAiGenerated: true,
        videoMeta: { width: 1920, height: 1080 } as any, // width and height stored on draft
      },
      {
        id: '2',
        batchId: 'b1',
        filename: 'B01_001_AI_helmet.eps',
        mediaType: 'vector',
        baseTitle: 'Military Camouflage Helmet Vector Illustration',
        detailedDescription: 'Military Camouflage Helmet Vector Illustration',
        rankedKeywords: ['helmet', 'military'],
        status: 'completed',
        thumbnailBase64: '',
        isAiGenerated: true,
      },
      {
        id: '3',
        batchId: 'b1',
        filename: 'B01_001_AI_titanium_smartphone.mp4',
        mediaType: 'video',
        baseTitle: 'Modern Smartphone',
        detailedDescription: 'Modern Smartphone',
        rankedKeywords: ['smartphone'],
        status: 'completed',
        thumbnailBase64: '',
        isAiGenerated: true,
        videoMeta: { durationSeconds: 15, resolution: '1080p', width: 1920, height: 1080 },
      },
    ];

    const res = generatePlatformCsv('freepik', records, 'test_batch');
    expect(res.isBlocked).toBeFalsy();
    expect(res.rowCount).toBe(2);
    expect(res.csvString).toContain('B01_001_AI_egyptian_koshari.jpg');
    expect(res.csvString).toContain('B01_001_AI_helmet.jpg');
    expect(res.csvString).not.toContain('B01_001_AI_titanium_smartphone');
  });

  it('correctly blocks export when 100% of batch files are videos', () => {
    const videoOnlyRecords: MasterMetadataRecord[] = [
      {
        id: '3',
        batchId: 'b1',
        filename: 'B01_001_AI_titanium_smartphone.mp4',
        mediaType: 'video',
        baseTitle: 'Modern Smartphone',
        detailedDescription: 'Modern Smartphone',
        rankedKeywords: ['smartphone'],
        status: 'completed',
        thumbnailBase64: '',
        isAiGenerated: true,
        videoMeta: { durationSeconds: 15, resolution: '1080p' },
      },
    ];

    const res = generatePlatformCsv('freepik', videoOnlyRecords, 'test_batch');
    expect(res.isBlocked).toBe(true);
    expect(res.blockedReason).toContain('Magnific does not support video files');
  });
});
