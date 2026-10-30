/**
 * Video Frame Extractor & 2x2 Storyboard Grid Generator
 * 
 * Extracts 4 keyframes at 10%, 35%, 65%, and 90% of duration
 * Stitches them into a single 2x2 contact sheet JPEG (768x432) with corner badges F1-F4
 * Allows ANY Vision LLM to see temporal motion progression and subject in 1 cheap API call.
 */

export interface VideoStoryboardResult {
  storyboardBase64: string;
  storyboardDataUrl: string;
  thumbnailBase64: string;
  thumbnailDataUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  resolutionLabel: string;
}

function captureVideoFrame(video: HTMLVideoElement, timeSeconds: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    let handled = false;

    const onSeeked = () => {
      if (handled) return;
      handled = true;
      video.removeEventListener('seeked', onSeeked);

      try {
        const c = document.createElement('canvas');
        c.width = video.videoWidth || 640;
        c.height = video.videoHeight || 360;
        const ctx = c.getContext('2d');
        if (!ctx) return reject(new Error('Canvas 2D unavailable'));
        ctx.drawImage(video, 0, 0, c.width, c.height);
        resolve(c);
      } catch (err) {
        reject(err);
      }
    };

    video.addEventListener('seeked', onSeeked, { once: true });
    video.currentTime = Math.max(0.05, Math.min(timeSeconds, Math.max(0.1, video.duration - 0.1)));

    // Fallback timer
    setTimeout(() => {
      if (!handled) {
        handled = true;
        video.removeEventListener('seeked', onSeeked);
        const c = document.createElement('canvas');
        c.width = 640;
        c.height = 360;
        const ctx = c.getContext('2d');
        if (ctx) ctx.drawImage(video, 0, 0, c.width, c.height);
        resolve(c);
      }
    }, 3000);
  });
}

export async function extractVideoStoryboard(
  file: File,
  targetGridWidth = 768,
  targetGridHeight = 432,
  quality = 0.75
): Promise<VideoStoryboardResult> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    video.onloadedmetadata = async () => {
      try {
        const dur = video.duration || 5;
        const vWidth = video.videoWidth || 1920;
        const vHeight = video.videoHeight || 1080;

        // 4 Keyframe timestamps: 10%, 35%, 65%, 90%
        const t1 = dur * 0.1;
        const t2 = dur * 0.35;
        const t3 = dur * 0.65;
        const t4 = dur * 0.9;

        // Sequentially capture 4 frames
        const frame1 = await captureVideoFrame(video, t1);
        const frame2 = await captureVideoFrame(video, t2); // Representative thumbnail frame (35%)
        const frame3 = await captureVideoFrame(video, t3);
        const frame4 = await captureVideoFrame(video, t4);

        // Thumbnail Canvas (from Frame 2 at 35%)
        const thumbCanvas = document.createElement('canvas');
        const thumbMax = 512;
        let tw = vWidth;
        let th = vHeight;
        if (tw > thumbMax || th > thumbMax) {
          if (tw > th) {
            th = Math.round((th * thumbMax) / tw);
            tw = thumbMax;
          } else {
            tw = Math.round((tw * thumbMax) / th);
            th = thumbMax;
          }
        }
        thumbCanvas.width = tw;
        thumbCanvas.height = th;
        const tctx = thumbCanvas.getContext('2d');
        if (tctx) {
          tctx.drawImage(frame2, 0, 0, tw, th);
        }
        const thumbDataUrl = thumbCanvas.toDataURL('image/jpeg', quality);
        const thumbBase64 = thumbDataUrl.replace(/^data:image\/jpeg;base64,/, '');

        // 2x2 Storyboard Grid Canvas
        const gridCanvas = document.createElement('canvas');
        gridCanvas.width = targetGridWidth;
        gridCanvas.height = targetGridHeight;
        const gctx = gridCanvas.getContext('2d');
        if (!gctx) throw new Error('Grid Canvas 2D unavailable');

        // Dark dividing lines
        gctx.fillStyle = '#09090b';
        gctx.fillRect(0, 0, targetGridWidth, targetGridHeight);

        const halfW = Math.floor(targetGridWidth / 2);
        const halfH = Math.floor(targetGridHeight / 2);
        const pad = 1; // 1px separator line

        // Draw Top-Left (F1)
        gctx.drawImage(frame1, 0, 0, halfW - pad, halfH - pad);
        // Draw Top-Right (F2)
        gctx.drawImage(frame2, halfW + pad, 0, halfW - pad, halfH - pad);
        // Draw Bottom-Left (F3)
        gctx.drawImage(frame3, 0, halfH + pad, halfW - pad, halfH - pad);
        // Draw Bottom-Right (F4)
        gctx.drawImage(frame4, halfW + pad, halfH + pad, halfW - pad, halfH - pad);

        // Add subtle corner badges (F1, F2, F3, F4)
        const drawBadge = (label: string, x: number, y: number) => {
          gctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          gctx.fillRect(x, y, 26, 16);
          gctx.fillStyle = '#ffffff';
          gctx.font = 'bold 10px monospace';
          gctx.textAlign = 'center';
          gctx.textBaseline = 'middle';
          gctx.fillText(label, x + 13, y + 8);
        };

        drawBadge('F1', 4, 4);
        drawBadge('F2', halfW + pad + 4, 4);
        drawBadge('F3', 4, halfH + pad + 4);
        drawBadge('F4', halfW + pad + 4, halfH + pad + 4);

        const storyDataUrl = gridCanvas.toDataURL('image/jpeg', quality);
        const storyBase64 = storyDataUrl.replace(/^data:image\/jpeg;base64,/, '');

        // Resolution label
        let resLabel = `${vWidth}x${vHeight}`;
        if (vWidth >= 3840 || vHeight >= 2160) resLabel = '4K UHD';
        else if (vWidth >= 1920 || vHeight >= 1080) resLabel = '1080p FHD';
        else if (vWidth >= 1280 || vHeight >= 720) resLabel = '720p HD';

        URL.revokeObjectURL(objectUrl);

        resolve({
          storyboardBase64: storyBase64,
          storyboardDataUrl: storyDataUrl,
          thumbnailBase64: thumbBase64,
          thumbnailDataUrl: thumbDataUrl,
          durationSeconds: Math.round(dur),
          width: vWidth,
          height: vHeight,
          resolutionLabel: resLabel,
        });
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to decode video metadata for ${file.name}`));
    };
  });
}
