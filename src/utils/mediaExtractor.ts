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

/**
 * Extracts a video snapshot frame at 15-20% timestamp, duration, resolution,
 * and 2x2 multi-frame storyboard for Vision AI
 */
export async function processVideoFile(
  file: File,
  maxDim = 512,
  quality = 0.75
): Promise<ExtractedMediaInfo> {
  // First try 2x2 frame extractor
  try {
    const storyboard = await extractVideoStoryboard(file, 768, 432, quality);
    // Also inspect audio presence
    const audioInfo = await inspectVideoAudioTrack(file);

    return {
      mediaType: 'video',
      // For Vision API analysis: we pass the 2x2 storyboard image!
      thumbnailBase64: storyboard.storyboardBase64,
      // For UI card display: we use the representative frame
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
    console.warn('Storyboard extraction fallback:', storyboardErr);
  }

  // Fallback to single frame snapshot
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    let seeked = false;

    video.onloadedmetadata = () => {
      const targetTime = Math.min(Math.max(video.duration * 0.2, 1.0), Math.max(video.duration - 0.5, 0.1));
      video.currentTime = targetTime;
    };

    video.onseeked = async () => {
      if (seeked) return;
      seeked = true;

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
          URL.revokeObjectURL(objectUrl);
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

        URL.revokeObjectURL(objectUrl);

        const audioInfo = await inspectVideoAudioTrack(file);

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
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to decode video "${file.name}"`));
    };

    setTimeout(() => {
      if (!seeked) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`Video snapshot timed out for "${file.name}"`));
      }
    }, 6000);
  });
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
    // sourceTier 'vector' from Tier 3 fallback badge = no real preview (detected by white/dark bg + text badge size)
    // We distinguish by checking pathOpCount indirectly: Tier 3 has a dark background, Tier 1/2 has real artwork.
    // The engine exposes `sourceTier` — binary_preview and xmp are always real; 'vector' from Tier 1 is real.
    // The only fake is the Tier 3 badge, which epsEngine.ts returns with sourceTier 'vector' but writes
    // "EPS 10 VECTOR" text onto a dark canvas. We detect this via the sourceTier returned.
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
    console.warn('EPS rasterization fallback:', err);
  }

  // Draw clean vector asset placeholder canvas
  const canvas = document.createElement('canvas');
  canvas.width = maxDim;
  canvas.height = maxDim;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D unavailable');
  }

  // Stylish dark gradient background
  const grad = ctx.createLinearGradient(0, 0, maxDim, maxDim);
  grad.addColorStop(0, '#18181b');
  grad.addColorStop(1, '#09090b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, maxDim, maxDim);

  // Vector Badge Center
  ctx.fillStyle = '#6366f1';
  ctx.font = 'bold 36px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EPS VECTOR', maxDim / 2, maxDim / 2 - 20);

  ctx.fillStyle = '#a1a1aa';
  ctx.font = '16px sans-serif';
  ctx.fillText(file.name.slice(0, 30), maxDim / 2, maxDim / 2 + 25);

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
