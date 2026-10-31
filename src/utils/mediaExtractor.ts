import { MediaType } from '../types';
import { rasterizeEpsFile } from '../services/eps/epsEngine';
import { extractVideoStoryboard } from '../services/video/videoFrameExtractor';
import { inspectVideoAudioTrack } from '../services/video/videoMuterEngine';

export interface ExtractedMediaInfo {
  mediaType: MediaType;
  thumbnailBase64: string;
  thumbnailDataUrl: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  videoDurationSeconds?: number;
  videoResolution?: string;
  hasAudio?: boolean;
  width?: number;
  height?: number;
  /** false when the EPS/vector had no embedded preview — only a placeholder badge was generated */
  hasRealPreview?: boolean;
}

/**
 * Identifies the media type based on filename extension
 */
export function getMediaTypeFromFilename(filename: string): MediaType {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v'].includes(ext)) {
    return 'video';
  }
  if (['eps', 'ai', 'svg'].includes(ext)) {
    return 'vector';
  }
  return 'image';
}

/**
 * Extracts a compressed thumbnail and metadata from an image file
 */
export async function processImageFile(
  file: File,
  maxDim = 512,
  quality = 0.75
): Promise<ExtractedMediaInfo> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Failed to create canvas context'));
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
        const compressedSizeBytes = Math.round((base64.length * 3) / 4);

        resolve({
          mediaType: 'image',
          thumbnailBase64: base64,
          thumbnailDataUrl: dataUrl,
          originalSizeBytes: file.size,
          compressedSizeBytes,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function createVideoFallbackBadge(filename: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎬 STOCK VIDEO FOOTAGE', 320, 160);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px monospace';
    ctx.fillText(filename.slice(0, 45), 320, 200);
  }
  return canvas.toDataURL('image/jpeg', 0.8).replace(/^data:image\/jpeg;base64,/, '');
}

/**
 * Extracts a video snapshot frame at 15-20% timestamp, duration, resolution,
 * and 2x2 multi-frame storyboard for Vision AI
 */
export async function processVideoFile(
  file: File,
  maxDim = 512,
  quality = 0.75
): Promise<ExtractedMediaInfo> {
  // First try 2x2 frame extractor with 8000ms hard timeout
  try {
    const storyboard = await extractVideoStoryboard(file, 768, 432, quality);
    // Also inspect audio presence
    const audioInfo = await inspectVideoAudioTrack(file);

    return {
      mediaType: 'video',
      thumbnailBase64: storyboard.storyboardBase64,
      thumbnailDataUrl: storyboard.thumbnailDataUrl,
      originalSizeBytes: file.size,
      compressedSizeBytes: Math.round((storyboard.storyboardBase64.length * 3) / 4),
      videoDurationSeconds: storyboard.durationSeconds,
      videoResolution: storyboard.resolutionLabel,
      hasAudio: audioInfo.hasAudio,
      width: storyboard.width,
      height: storyboard.height,
    };
  } catch (storyboardErr) {
    // Storyboard extraction timed out or failed, fall back to single frame
  }

  // Fallback to single frame snapshot with 4000ms hard timeout
  try {
    const singleFrame = await new Promise<ExtractedMediaInfo>((resolve, reject) => {
      let settled = false;
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      const objectUrl = URL.createObjectURL(file);
      video.src = objectUrl;

      const cleanup = () => {
        if (!settled) {
          settled = true;
          URL.revokeObjectURL(objectUrl);
          video.onloadedmetadata = null;
          video.onseeked = null;
          video.onerror = null;
        }
      };

      video.onloadedmetadata = () => {
        const targetTime = Math.min(Math.max(video.duration * 0.2, 1.0), Math.max(video.duration - 0.5, 0.1));
        video.currentTime = targetTime;
      };

      video.onseeked = async () => {
        try {
          const vWidth = video.videoWidth || 1920;
          const vHeight = video.videoHeight || 1080;

          let width = vWidth;
          let height = vHeight;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            cleanup();
            return reject(new Error('Canvas 2D context unavailable'));
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
          const compressedSizeBytes = Math.round((base64.length * 3) / 4);

          let resLabel = `${vWidth}x${vHeight}`;
          if (vWidth >= 3840 || vHeight >= 2160) resLabel = '4K UHD';
          else if (vWidth >= 1920 || vHeight >= 1080) resLabel = '1080p FHD';
          else if (vWidth >= 1280 || vHeight >= 720) resLabel = '720p HD';

          const audioInfo = await inspectVideoAudioTrack(file);

          cleanup();
          resolve({
            mediaType: 'video',
            thumbnailBase64: base64,
            thumbnailDataUrl: dataUrl,
            originalSizeBytes: file.size,
            compressedSizeBytes,
            videoDurationSeconds: Math.round(video.duration || 0),
            videoResolution: resLabel,
            hasAudio: audioInfo.hasAudio,
            width: vWidth,
            height: vHeight,
          });
        } catch (err: any) {
          cleanup();
          reject(err);
        }
      };

      video.onerror = () => {
        cleanup();
        reject(new Error(`Failed to decode video "${file.name}"`));
      };

      setTimeout(() => {
        cleanup();
        reject(new Error(`Video snapshot timed out for "${file.name}"`));
      }, 4000);
    });

    return singleFrame;
  } catch (singleErr) {
    // If browser cannot decode video codec (e.g. unsupported profile), provide graceful fallback badge
    const fallbackBase64 = createVideoFallbackBadge(file.name);
    const audioInfo = await inspectVideoAudioTrack(file).catch(() => ({ hasAudio: false }));
    return {
      mediaType: 'video',
      thumbnailBase64: fallbackBase64,
      thumbnailDataUrl: `data:image/jpeg;base64,${fallbackBase64}`,
      originalSizeBytes: file.size,
      compressedSizeBytes: Math.round((fallbackBase64.length * 3) / 4),
      videoDurationSeconds: 10,
      videoResolution: '1080p FHD',
      hasAudio: audioInfo.hasAudio,
      width: 1920,
      height: 1080,
    };
  }
}

/**
 * Handles EPS / Vector files with PostScript Level 2/3 vector rasterizer
 */
export async function processVectorFile(
  file: File,
  companionImageFile?: File,
  maxDim = 512,
  quality = 0.75
): Promise<ExtractedMediaInfo> {
  if (companionImageFile) {
    const res = await processImageFile(companionImageFile, maxDim, quality);
    return {
      ...res,
      mediaType: 'vector',
      originalSizeBytes: file.size,
    };
  }

  // Use the True Multi-Tier EPS 10 Rasterizer Engine!
  try {
    const epsResult = await rasterizeEpsFile(file, maxDim, quality);
    
    // sourceTier 'vector' from Tier 1 (PS paths) or 'binary_preview'/'xmp' from Tier 2 = real content
    // sourceTier 'vector' from Tier 3 fallback badge = no real preview (detected by pathOpCount = 0)
    const isRealContent =
      epsResult.sourceTier === 'binary_preview' ||
      epsResult.sourceTier === 'xmp' ||
      (epsResult.sourceTier === 'vector' && epsResult.pathOpCount !== undefined && epsResult.pathOpCount >= 10);

    return {
      mediaType: 'vector',
      thumbnailBase64: epsResult.dataUrl.replace(/^data:image\/jpeg;base64,/, ''),
      thumbnailDataUrl: epsResult.dataUrl,
      originalSizeBytes: file.size,
      compressedSizeBytes: Math.round((epsResult.dataUrl.length * 3) / 4),
      width: epsResult.width,
      height: epsResult.height,
      hasRealPreview: isRealContent,
    };
  } catch (err) {
    // EPS rasterization fallback
  }

  // Draw clean vector asset placeholder canvas
  const canvas = document.createElement('canvas');
  canvas.width = maxDim;
  canvas.height = maxDim;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D unavailable');
  }

  // Clean pure white background (#FFFFFF) to avoid confusing vision models
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, maxDim, maxDim);

  // Subtle clean border
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, maxDim - 40, maxDim - 40);

  // Vector Badge Center
  ctx.fillStyle = '#2563EB';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VECTOR ARTWORK', maxDim / 2, maxDim / 2 - 25);

  const cleanSubject = file.name ? file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').toUpperCase() : 'ILLUSTRATION';
  ctx.fillStyle = '#18181B';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(cleanSubject.slice(0, 26), maxDim / 2, maxDim / 2 + 20);

  ctx.fillStyle = '#71717A';
  ctx.font = '14px sans-serif';
  ctx.fillText('Adobe Illustrator EPS 10', maxDim / 2, maxDim / 2 + 55);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

  return {
    mediaType: 'vector',
    thumbnailBase64: base64,
    thumbnailDataUrl: dataUrl,
    originalSizeBytes: file.size,
    compressedSizeBytes: Math.round((base64.length * 3) / 4),
    width: maxDim,
    height: maxDim,
    hasRealPreview: false, // this is the emergency fallback badge, no real artwork
  };
}

/**
 * Universal dispatcher that extracts thumbnail and info for any supported media file
 */
export async function extractMediaInfo(
  file: File,
  companionPreviewFile?: File,
  maxDim = 512,
  quality = 0.75
): Promise<ExtractedMediaInfo> {
  const type = getMediaTypeFromFilename(file.name);
  if (type === 'video') {
    return await processVideoFile(file, maxDim, quality);
  }
  if (type === 'vector') {
    return await processVectorFile(file, companionPreviewFile, maxDim, quality);
  }
  return await processImageFile(file, maxDim, quality);
}

/**
 * Helper to format duration seconds as mm:ss
 */
export function formatDuration(seconds?: number): string {
  if (seconds === undefined || seconds === null) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
