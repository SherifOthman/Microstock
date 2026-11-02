import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseEpsBoundingBox,
  cmykToRgb,
} from '../../src/services/eps/epsEngine';
import {
  getMediaTypeFromFilename,
  processVectorFile,
} from '../../src/utils/mediaExtractor';

describe('EPS 10 Vector Parser & Rendering Fallbacks (epsEngine.ts & mediaExtractor.ts)', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;
  const originalImage = global.Image;

  beforeEach(() => {
    HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation((callback: any) => {
      callback(new Blob(['mock-blob'], { type: 'image/jpeg' }));
    });

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      fillStyle: '',
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      font: '',
      textAlign: '',
    } as any);

    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,mockCanvasBase64Data');

    // Mock Image class to trigger onload in JSDOM
    (global as any).Image = class MockImage {
      naturalWidth = 800;
      naturalHeight = 600;
      width = 800;
      height = 600;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_val: string) {
        setTimeout(() => this.onload && this.onload(), 10);
      }
    };
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
    global.Image = originalImage;
    vi.restoreAllMocks();
  });

  describe('cmykToRgb() Color Conversion', () => {
    it('accurately converts primary CMYK values to sRGB integers', () => {
      // Pure White (0, 0, 0, 0)
      expect(cmykToRgb(0, 0, 0, 0)).toEqual([255, 255, 255]);

      // Pure Black (0, 0, 0, 1)
      expect(cmykToRgb(0, 0, 0, 1)).toEqual([0, 0, 0]);

      // Pure Cyan (1, 0, 0, 0)
      expect(cmykToRgb(1, 0, 0, 0)).toEqual([0, 255, 255]);

      // Pure Magenta (0, 1, 0, 0)
      expect(cmykToRgb(0, 1, 0, 0)).toEqual([255, 0, 255]);

      // Pure Yellow (0, 0, 1, 0)
      expect(cmykToRgb(0, 0, 1, 0)).toEqual([255, 255, 0]);

      // 50% Neutral Gray (0, 0, 0, 0.5)
      expect(cmykToRgb(0, 0, 0, 0.5)).toEqual([128, 128, 128]);
    });

    it('clamps out-of-range inputs strictly to [0, 255]', () => {
      expect(cmykToRgb(1.5, 0, 0, 0)).toEqual([0, 255, 255]);
      expect(cmykToRgb(-0.5, 0, 0, 0)).toEqual([255, 255, 255]);
    });
  });

  describe('parseEpsBoundingBox() Coordinate Extraction', () => {
    it('parses standard integer %%BoundingBox header', () => {
      const header = `%!PS-Adobe-3.0 EPSF-3.0
%%Creator: Adobe Illustrator(R) 10.0
%%Title: business_icons.eps
%%BoundingBox: 0 0 800 600
%%EndComments`;

      const bbox = parseEpsBoundingBox(header);
      expect(bbox).not.toBeNull();
      expect(bbox?.llx).toBe(0);
      expect(bbox?.lly).toBe(0);
      expect(bbox?.urx).toBe(800);
      expect(bbox?.ury).toBe(600);
      expect(bbox?.width).toBe(800);
      expect(bbox?.height).toBe(600);
    });

    it('prefers %%HiResBoundingBox with decimal coordinates when present', () => {
      const header = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 100 100
%%HiResBoundingBox: 0.25 0.50 1024.75 768.50
%%EndComments`;

      const bbox = parseEpsBoundingBox(header);
      expect(bbox).not.toBeNull();
      expect(bbox?.llx).toBe(0.25);
      expect(bbox?.lly).toBe(0.50);
      expect(bbox?.urx).toBe(1024.75);
      expect(bbox?.ury).toBe(768.50);
      expect(bbox?.width).toBe(1024.5);
      expect(bbox?.height).toBe(768);
    });

    it('correctly calculates width and height for negative coordinate offsets', () => {
      const header = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: -150 -75 450 325`;

      const bbox = parseEpsBoundingBox(header);
      expect(bbox).not.toBeNull();
      expect(bbox?.llx).toBe(-150);
      expect(bbox?.lly).toBe(-75);
      expect(bbox?.urx).toBe(450);
      expect(bbox?.ury).toBe(325);
      expect(bbox?.width).toBe(600); // 450 - (-150) = 600
      expect(bbox?.height).toBe(400); // 325 - (-75) = 400
    });

    it('returns null on invalid or missing bounding box', () => {
      expect(parseEpsBoundingBox('Not a postscript file')).toBeNull();
      expect(parseEpsBoundingBox('%%BoundingBox: 0 0 0 0')).toBeNull(); // zero dimensions
    });
  });

  describe('getMediaTypeFromFilename() Vector Detection', () => {
    it('correctly identifies vector formats', () => {
      expect(getMediaTypeFromFilename('logo.eps')).toBe('vector');
      expect(getMediaTypeFromFilename('artwork.EPS')).toBe('vector');
      expect(getMediaTypeFromFilename('design.ai')).toBe('vector');
      expect(getMediaTypeFromFilename('illustration.svg')).toBe('vector');

      // Photos
      expect(getMediaTypeFromFilename('photo.jpg')).toBe('image');
      expect(getMediaTypeFromFilename('image.png')).toBe('image');

      // Videos
      expect(getMediaTypeFromFilename('clip.mp4')).toBe('video');
      expect(getMediaTypeFromFilename('footage.mov')).toBe('video');
    });
  });

  describe('processVectorFile() Pairing & Fallback Badging', () => {
    it('generates clean placeholder badge when no companion preview raster is provided', async () => {
      const epsContent = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 500 500
%%EndComments`;
      const epsFile = new File([epsContent], 'isolated_icon.eps', { type: 'application/postscript' });

      const info = await processVectorFile(epsFile);
      expect(info.mediaType).toBe('vector');
      expect(info.hasRealPreview).toBe(false); // No companion raster
      expect(info.thumbnailBase64).toBeTruthy();
      expect(info.thumbnailDataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
      expect(info.width).toBe(512);
      expect(info.height).toBe(512);
    });

    it('extracts artwork from companion raster .jpg when provided', async () => {
      const epsFile = new File(['mock-eps'], 'banner_vector.eps', { type: 'application/postscript' });
      
      // Minimal 1x1 white JPEG base64
      const whiteJpgBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
      const jpgBuffer = Buffer.from(whiteJpgBase64, 'base64');
      const companionJpg = new File([jpgBuffer], 'banner_vector.jpg', { type: 'image/jpeg' });

      const info = await processVectorFile(epsFile, companionJpg);
      expect(info.mediaType).toBe('vector');
      expect(info.hasRealPreview).toBe(true); // Artwork present from companion JPG!
      expect(info.thumbnailBase64).toBeTruthy();
    });
  });
});
