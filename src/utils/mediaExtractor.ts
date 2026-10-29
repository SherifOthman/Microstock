import { MediaType } from '../types';

export interface ExtractedMediaInfo {
  mediaType: MediaType;
  thumbnailBase64: string;
  thumbnailDataUrl: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  videoDurationSeconds?: number;
  videoResolution?: string;
  width?: number;
  height?: number;
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
 * Extracts a video snapshot frame at 15-20% timestamp, duration, and resolution
 */
export async function processVideoFile(
  file: File,
  maxDim = 512,
  quality = 0.75
): Promise<ExtractedMediaInfo> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    let seeked = false;

    video.onloadedmetadata = () => {
      // Seek to 1.5 seconds or 20% of duration to get a representative content frame (avoiding black first frame)
      const targetTime = Math.min(Math.max(video.duration * 0.2, 1.0), Math.max(video.duration - 0.5, 0.1));
      video.currentTime = targetTime;
    };

    video.onseeked = () => {
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

        // Calculate resolution label (e.g. 4K UHD, 1080p FHD, etc.)
        let resLabel = `${vWidth}x${vHeight}`;
        if (vWidth >= 3840 || vHeight >= 2160) {
          resLabel = '4K UHD';
        } else if (vWidth >= 1920 || vHeight >= 1080) {
          resLabel = '1080p FHD';
        } else if (vWidth >= 1280 || vHeight >= 720) {
          resLabel = '720p HD';
        }

        URL.revokeObjectURL(objectUrl);

        resolve({
          mediaType: 'video',
          thumbnailBase64: base64,
          thumbnailDataUrl: dataUrl,
          originalSizeBytes: file.size,
          compressedSizeBytes,
          videoDurationSeconds: Math.round(video.duration || 0),
          videoResolution: resLabel,
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

    // Timeout safety fallback (5 seconds)
    setTimeout(() => {
      if (!seeked) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`Video snapshot timed out for "${file.name}"`));
      }
    }, 6000);
  });
}

/**
 * Handles EPS / Vector files with custom placeholder badge or embedded SVG
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

  // Grid pattern
  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = 1;
  const step = 32;
  for (let x = 0; x < maxDim; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, maxDim);
    ctx.stroke();
  }
  for (let y = 0; y < maxDim; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(maxDim, y);
    ctx.stroke();
  }

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
