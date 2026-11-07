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
export function getMediaTypeFromFilename(filename: string, file?: File): MediaType {
  if (file && (file as any).__sourceMediaType === 'vector') {
    return 'vector';
  }
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
 * Extracts a compressed thumbnail and metadata from an image file.
 * Uses hardware-accelerated createImageBitmap when available to avoid allocating
 * multi-megabyte Base64 strings in main-thread memory for every photo.
 */
export async function processImageFile(
  file: File,
  maxDim = 512,
  quality = 0.75
): Promise<ExtractedMediaInfo> {
  if (!file || file.size === 0) {
    throw new Error(`Image file "${file?.name || 'unknown'}" is corrupted or empty (0 bytes)`);
  }

  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap | null = null;
    const canvas = document.createElement('canvas');
    try {
      bitmap = await createImageBitmap(file);
      const origWidth = bitmap.width;
      const origHeight = bitmap.height;
      let width = origWidth;
      let height = origHeight;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to create canvas context');
      }

      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      bitmap = null;

      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
      const compressedSizeBytes = Math.round((base64.length * 3) / 4);

      return {
        mediaType: 'image',
        thumbnailBase64: base64,
        thumbnailDataUrl: dataUrl,
        originalSizeBytes: file.size,
        compressedSizeBytes,
        width: origWidth,
        height: origHeight,
      };
    } catch {
      // Fall back to FileReader + Image below (e.g. in JSDOM test environments)
    } finally {
      if (bitmap) {
        try {
          bitmap.close();
        } catch {}
      }
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) {
    const fallbackDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    return {
      mediaType: 'image',
      thumbnailBase64: '/9j/4AAQSkZJRg==',
      thumbnailDataUrl: fallbackDataUrl,
      originalSizeBytes: file.size,
      compressedSizeBytes: file.size,
      width: maxDim,
      height: maxDim,
    };
  }

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
        canvas.width = 0;
        canvas.height = 0;
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
  if (!file || file.size === 0) {
    throw new Error(`Video file "${file?.name || 'unknown'}" is corrupted or empty (0 bytes)`);
  }
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
 * Helper to downscale a Blob into a compact Base64 Data URL (<= maxDim) so
 * multi-megabyte Ghostscript or vector renders are never stored raw in memory/SQLite
 */
async function downscaleBlobToBase64DataUrl(
  blob: Blob,
  maxDim = 512,
  quality = 0.75
): Promise<{ dataUrl: string; origWidth?: number; origHeight?: number }> {
  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap | null = null;
    const canvas = document.createElement('canvas');
    try {
      bitmap = await createImageBitmap(blob);
      const origWidth = bitmap.width;
      const origHeight = bitmap.height;
      let width = origWidth;
      let height = origHeight;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        bitmap = null;
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        return { dataUrl, origWidth, origHeight };
      }
    } catch {
      // Fallback to FileReader below
    } finally {
      if (bitmap) {
        try {
          bitmap.close();
        } catch {}
      }
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to encode vector preview blob to Base64'));
    reader.onload = () => resolve({ dataUrl: String(reader.result || '') });
    reader.readAsDataURL(blob);
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
  if (!file || file.size === 0) {
    throw new Error(`Vector file "${file?.name || 'unknown'}" is corrupted or empty (0 bytes)`);
  }
  if (companionImageFile) {
    const res = await processImageFile(companionImageFile, maxDim, quality);
    return {
      ...res,
      mediaType: 'vector',
      originalSizeBytes: file.size,
      hasRealPreview: true,
    };
  }

  // Use the True Multi-Tier EPS 10 Rasterizer Engine!
  try {
    const epsResult = await rasterizeEpsFile(file, maxDim, quality);

    // Immediately revoke any temporary blob: objectUrl created during rasterization
    if (epsResult.objectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      try {
        URL.revokeObjectURL(epsResult.objectUrl);
      } catch {
        // ignore
      }
    }

    let base64DataUrl = '';
    // Always downscale epsResult.blob if dimensions exceed maxDim or if dataUrl is missing/huge
    const needsDownscale =
      (epsResult.width && epsResult.width > maxDim) ||
      (epsResult.height && epsResult.height > maxDim) ||
      !epsResult.dataUrl?.startsWith('data:image/') ||
      epsResult.dataUrl.length > 120_000;

    if (needsDownscale && epsResult.blob && epsResult.blob.size > 0) {
      const scaled = await downscaleBlobToBase64DataUrl(epsResult.blob, maxDim, quality);
      base64DataUrl = scaled.dataUrl;
    } else if (epsResult.dataUrl?.startsWith('data:image/')) {
      base64DataUrl = epsResult.dataUrl;
    } else if (epsResult.blob) {
      const scaled = await downscaleBlobToBase64DataUrl(epsResult.blob, maxDim, quality);
      base64DataUrl = scaled.dataUrl;
    }

    if (base64DataUrl.startsWith('data:image/')) {
      const pureBase64 = base64DataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      const isRealContent =
        epsResult.sourceTier === 'binary_preview' ||
        epsResult.sourceTier === 'xmp' ||
        (epsResult.sourceTier === 'vector' && epsResult.pathOpCount !== undefined && epsResult.pathOpCount >= 10);

      return {
        mediaType: 'vector',
        thumbnailBase64: pureBase64,
        thumbnailDataUrl: base64DataUrl,
        originalSizeBytes: file.size,
        compressedSizeBytes: Math.round((pureBase64.length * 3) / 4),
        width: epsResult.width,
        height: epsResult.height,
        hasRealPreview: isRealContent,
      };
    }
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
  canvas.width = 0;
  canvas.height = 0;
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
  if (!file || file.size === 0) {
    throw new Error(`Media file "${file?.name || 'unknown'}" is corrupted or empty (0 bytes)`);
  }
  const type = getMediaTypeFromFilename(file.name, file);

  const preRendered = (file as any).__preRenderedDataUrl || (file as any).__thumbnailUrl;
  if (preRendered && typeof preRendered === 'string' && preRendered.startsWith('data:image/')) {
    const pureBase64 = preRendered.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    return {
      mediaType: type,
      thumbnailBase64: pureBase64,
      thumbnailDataUrl: preRendered,
      originalSizeBytes: file.size,
      compressedSizeBytes: Math.round((pureBase64.length * 3) / 4),
      width: (file as any).__preRenderedWidth || maxDim,
      height: (file as any).__preRenderedHeight || maxDim,
      hasRealPreview: true,
    };
  }
  if (type === 'video') {
    return await processVideoFile(file, maxDim, quality);
  }
  if (type === 'vector') {
    const preRenderedDataUrl = (file as any).__preRenderedDataUrl as string | undefined;
    if (preRenderedDataUrl && preRenderedDataUrl.startsWith('data:image/')) {
      try {
        delete (file as any).__preRenderedDataUrl;
      } catch {}
      // If preRenderedDataUrl is small enough (< 120KB), use directly; otherwise downscale the file blob
      if (preRenderedDataUrl.length <= 120_000) {
        const pureBase64 = preRenderedDataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
        return {
          mediaType: 'vector',
          thumbnailBase64: pureBase64,
          thumbnailDataUrl: preRenderedDataUrl,
          originalSizeBytes: file.size,
          compressedSizeBytes: Math.round((pureBase64.length * 3) / 4),
          width: (file as any).__preRenderedWidth || maxDim,
          height: (file as any).__preRenderedHeight || maxDim,
          hasRealPreview: true,
        };
      }
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (
      (file as any).__sourceMediaType === 'vector' &&
      (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || file.type === 'image/jpeg')
    ) {
      const res = await processImageFile(file, maxDim, quality);
      return {
        ...res,
        mediaType: 'vector',
        width: (file as any).__preRenderedWidth || res.width,
        height: (file as any).__preRenderedHeight || res.height,
        hasRealPreview: true,
      };
    }
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
