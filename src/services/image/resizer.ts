export interface ResizedImageResult {
  base64DataUrl: string;
  base64Pure: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Resizes any image file (JPEG, PNG, WebP, AVIF, etc.) client-side in memory
 * down to max dimension (e.g. 512px) at specified JPEG quality (e.g. 0.75).
 * Leaves the original file completely untouched.
 */
export async function resizeImageToThumbnail(
  file: File,
  maxDimension = 512,
  quality = 0.75
): Promise<ResizedImageResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error(`Failed to read file "${file.name}"`));

    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error(`Failed to decode image "${file.name}"`));

      img.onload = () => {
        try {
          let { width, height } = img;

          // Calculate aspect ratio downsampling
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          // OffscreenCanvas or standard Canvas
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get 2D canvas context'));
            return;
          }

          // High quality image smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Export as compressed JPEG
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64Pure = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');

          // Approximate size in bytes
          const sizeBytes = Math.round((base64Pure.length * 3) / 4);

          resolve({
            base64DataUrl: dataUrl,
            base64Pure,
            width,
            height,
            sizeBytes,
          });
        } catch (err) {
          reject(err);
        }
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}
