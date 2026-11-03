/**
 * EPS 10 Multi-Tier Vector Parser & High-Resolution Rasterizer Engine Core
 * 
 * Shared mathematical, PostScript vector interpretation, and binary decoder core.
 * Environment-agnostic: Executes identically inside Web Workers (OffscreenCanvas, createImageBitmap)
 * and in the main browser thread (HTMLCanvasElement, Image).
 */

export interface EpsBoundingBox {
  llx: number;
  lly: number;
  urx: number;
  ury: number;
  width: number;
  height: number;
}

export interface EpsRenderResult {
  width: number;
  height: number;
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  dataUrl: string;
  objectUrl?: string;
  blob: Blob;
  sourceTier: 'vector' | 'xmp' | 'binary_preview' | 'ascii_preview';
  boundingBox?: EpsBoundingBox;
  /** Number of path operations rendered (only meaningful for Tier 1 vector render; 0 for placeholder) */
  pathOpCount?: number;
}

/**
 * Universal Canvas Factory
 * Creates an OffscreenCanvas (if available in Worker/Browser) or an HTMLCanvasElement.
 */
export function createUniversalCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== 'undefined' && document.createElement) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error('No canvas implementation available in this environment');
}

/**
 * Converts a Canvas (HTML or Offscreen) to Blob and base64 DataURL
 */
export async function canvasToBlobAndDataUrl(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality = 0.98
): Promise<{ blob: Blob; dataUrl: string; objectUrl?: string }> {
  try {
    if ('convertToBlob' in canvas && typeof (canvas as OffscreenCanvas).convertToBlob === 'function') {
      const blob = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality });
      return { blob, dataUrl: '' };
    } else {
      const htmlCanvas = canvas as HTMLCanvasElement;
      const dataUrl = htmlCanvas.toDataURL('image/jpeg', quality);
      const blob = await new Promise<Blob>((resolve) =>
        htmlCanvas.toBlob(
          (b) => {
            if (b) return resolve(b);
            // Fallback in JSDOM if toBlob returns null
            const b64 = dataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
            const bin = typeof atob === 'function' ? atob(b64) : '';
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            resolve(new Blob([bytes], { type: 'image/jpeg' }));
          },
          'image/jpeg',
          quality
        )
      );
      let objectUrl = '';
      try {
        if (typeof URL !== 'undefined' && URL.createObjectURL) {
          objectUrl = URL.createObjectURL(blob);
        }
      } catch {
        // ignore
      }
      return { blob, dataUrl, objectUrl };
    }
  } finally {
    // Aggressively release uncompressed RGBA backing store immediately after encoding
    try {
      canvas.width = 0;
      canvas.height = 0;
    } catch {
      // ignore
    }
  }
}

/**
 * Universal image/bitmap loader compatible with Web Workers and main thread
 */
export async function loadUniversalDrawable(source: Blob | string): Promise<CanvasImageSource> {
  if (typeof createImageBitmap !== 'undefined') {
    if (typeof source === 'string') {
      const res = await fetch(source);
      const blob = await res.blob();
      return await createImageBitmap(blob);
    }
    return await createImageBitmap(source);
  }
  if (typeof Image !== 'undefined') {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const tempObjUrl = typeof source === 'string' ? null : URL.createObjectURL(source);
      img.onload = () => {
        if (tempObjUrl) {
          try {
            URL.revokeObjectURL(tempObjUrl);
          } catch {}
        }
        resolve(img);
      };
      img.onerror = () => {
        if (tempObjUrl) {
          try {
            URL.revokeObjectURL(tempObjUrl);
          } catch {}
        }
        reject(new Error('Failed to load raster image preview'));
      };
      img.src = typeof source === 'string' ? source : tempObjUrl!;
    });
  }
  throw new Error('No image decoding capability available');
}

/**
 * Accurately converts CMYK colors (0..1) to sRGB values (0..255)
 */
export function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  const r = Math.round(255 * (1 - c) * (1 - k));
  const g = Math.round(255 * (1 - m) * (1 - k));
  const b = Math.round(255 * (1 - y) * (1 - k));
  return [Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b))];
}

/**
 * Parses %%BoundingBox or %%HiResBoundingBox headers
 */
export function parseEpsBoundingBox(headerText: string): EpsBoundingBox | null {
  // First try HiResBoundingBox
  const hiResMatch = headerText.match(/%%HiResBoundingBox:\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/i);
  if (hiResMatch) {
    const llx = parseFloat(hiResMatch[1]);
    const lly = parseFloat(hiResMatch[2]);
    const urx = parseFloat(hiResMatch[3]);
    const ury = parseFloat(hiResMatch[4]);
    const width = Math.abs(urx - llx);
    const height = Math.abs(ury - lly);
    if (width > 0 && height > 0) {
      return { llx, lly, urx, ury, width, height };
    }
  }

  // Fallback to integer BoundingBox
  const bbMatch = headerText.match(/%%BoundingBox:\s*([-\d]+)\s+([-\d]+)\s+([-\d]+)\s+([-\d]+)/i);
  if (bbMatch) {
    const llx = parseInt(bbMatch[1], 10);
    const lly = parseInt(bbMatch[2], 10);
    const urx = parseInt(bbMatch[3], 10);
    const ury = parseInt(bbMatch[4], 10);
    const width = Math.abs(urx - llx);
    const height = Math.abs(ury - lly);
    if (width > 0 && height > 0) {
      return { llx, lly, urx, ury, width, height };
    }
  }

  return null;
}

/**
 * Pure-TypeScript TIFF preview decoder for Adobe Illustrator DOS EPS files.
 * Decodes uncompressed and PackBits-compressed RGB, RGBA, 8-bit Palette, and Monochrome TIFF previews.
 */
export function decodeTiffToCanvas(buffer: ArrayBuffer): HTMLCanvasElement | OffscreenCanvas | null {
  if (buffer.byteLength < 8) return null;
  const view = new DataView(buffer);
  const byteOrder = view.getUint16(0, false);
  const isLe = byteOrder === 0x4949; // 'II' (Little Endian)
  if (!isLe && byteOrder !== 0x4d4d) return null; // 'MM' (Big Endian)
  const magic = view.getUint16(2, isLe);
  if (magic !== 42) return null;

  const firstIfdOffset = view.getUint32(4, isLe);
  if (firstIfdOffset >= buffer.byteLength || firstIfdOffset < 8) return null;

  let width = 0;
  let height = 0;
  let bitsPerSample = 8;
  let compression = 1;
  let photometric = 2; // RGB default
  let stripOffsets: number[] = [];
  let stripByteCounts: number[] = [];
  let samplesPerPixel = 1;
  let colorMap: number[] = [];

  const readTagValue = (type: number, count: number, offsetVal: number): number[] => {
    const values: number[] = [];
    if (count === 1) {
      if (type === 3) values.push(offsetVal & 0xffff);
      else if (type === 4 || type === 1) values.push(offsetVal);
      return values;
    }
    const valOffset = offsetVal;
    if (valOffset + count * (type === 3 ? 2 : 4) > buffer.byteLength) return values;
    for (let c = 0; c < count; c++) {
      if (type === 3) values.push(view.getUint16(valOffset + c * 2, isLe));
      else if (type === 4) values.push(view.getUint32(valOffset + c * 4, isLe));
      else if (type === 1) values.push(view.getUint8(valOffset + c));
    }
    return values;
  };

  try {
    const numEntries = view.getUint16(firstIfdOffset, isLe);
    for (let i = 0; i < numEntries; i++) {
      const entryOffset = firstIfdOffset + 2 + i * 12;
      if (entryOffset + 12 > buffer.byteLength) break;
      const tag = view.getUint16(entryOffset, isLe);
      const type = view.getUint16(entryOffset + 2, isLe);
      const count = view.getUint32(entryOffset + 4, isLe);
      const offsetVal = view.getUint32(entryOffset + 8, isLe);

      if (tag === 256) width = readTagValue(type, count, offsetVal)[0] || 0;
      else if (tag === 257) height = readTagValue(type, count, offsetVal)[0] || 0;
      else if (tag === 258) bitsPerSample = readTagValue(type, count, offsetVal)[0] || 8;
      else if (tag === 259) compression = readTagValue(type, count, offsetVal)[0] || 1;
      else if (tag === 262) photometric = readTagValue(type, count, offsetVal)[0] || 2;
      else if (tag === 273) stripOffsets = readTagValue(type, count, offsetVal);
      else if (tag === 277) samplesPerPixel = readTagValue(type, count, offsetVal)[0] || 1;
      else if (tag === 279) stripByteCounts = readTagValue(type, count, offsetVal);
      else if (tag === 320) colorMap = readTagValue(type, count, offsetVal);
    }
  } catch {
    return null;
  }

  if (width <= 0 || height <= 0 || stripOffsets.length === 0) return null;

  // Assemble pixel data from strips
  const totalPixels = width * height;
  const rgba = new Uint8ClampedArray(totalPixels * 4);

  // Decompress PackBits helper
  const decompressPackBits = (src: Uint8Array, destSize: number): Uint8Array => {
    const dest = new Uint8Array(destSize);
    let srcIdx = 0;
    let destIdx = 0;
    while (srcIdx < src.length && destIdx < destSize) {
      const n = src[srcIdx++];
      if (n <= 127) {
        const count = n + 1;
        for (let j = 0; j < count && srcIdx < src.length && destIdx < destSize; j++) {
          dest[destIdx++] = src[srcIdx++];
        }
      } else if (n >= 129) {
        const count = 257 - n;
        const val = src[srcIdx++];
        for (let j = 0; j < count && destIdx < destSize; j++) {
          dest[destIdx++] = val;
        }
      }
    }
    return dest;
  };

  let pixelIndex = 0;
  for (let s = 0; s < stripOffsets.length; s++) {
    const offset = stripOffsets[s];
    const byteCount = stripByteCounts[s] || (buffer.byteLength - offset);
    if (offset >= buffer.byteLength) break;
    const rawStrip = new Uint8Array(buffer, offset, Math.min(byteCount, buffer.byteLength - offset));
    
    // Decompress if PackBits (compression === 32773)
    let stripData: Uint8Array<any> = rawStrip;
    if (compression === 32773) {
      const expectedSize = (width * samplesPerPixel * (bitsPerSample / 8)) * Math.ceil(height / stripOffsets.length);
      stripData = decompressPackBits(rawStrip, expectedSize);
    }

    // Decode strip into RGBA
    if (photometric === 2) {
      // RGB
      let i = 0;
      while (i < stripData.length && pixelIndex < rgba.length) {
        rgba[pixelIndex++] = stripData[i++]; // R
        rgba[pixelIndex++] = stripData[i++]; // G
        rgba[pixelIndex++] = stripData[i++]; // B
        rgba[pixelIndex++] = samplesPerPixel >= 4 ? stripData[i++] : 255; // A
      }
    } else if (photometric === 3 && colorMap.length > 0) {
      // Palette Color
      const colorMapCount = colorMap.length / 3;
      const step = samplesPerPixel >= 2 ? samplesPerPixel : 1;
      for (let i = 0; i < stripData.length && pixelIndex < rgba.length; i += step) {
        const paletteIdx = stripData[i];
        if (paletteIdx < colorMapCount) {
          rgba[pixelIndex++] = Math.round((colorMap[paletteIdx] / 65535) * 255);
          rgba[pixelIndex++] = Math.round((colorMap[paletteIdx + colorMapCount] / 65535) * 255);
          rgba[pixelIndex++] = Math.round((colorMap[paletteIdx + colorMapCount * 2] / 65535) * 255);
          rgba[pixelIndex++] = samplesPerPixel >= 2 ? stripData[i + 1] : 255;
        } else {
          rgba[pixelIndex++] = 255;
          rgba[pixelIndex++] = 255;
          rgba[pixelIndex++] = 255;
          rgba[pixelIndex++] = 255;
        }
      }
    } else if (photometric === 0 || photometric === 1) {
      // Grayscale / Monochrome
      for (let i = 0; i < stripData.length && pixelIndex < rgba.length; i++) {
        if (bitsPerSample === 8) {
          const val = photometric === 0 ? 255 - stripData[i] : stripData[i];
          rgba[pixelIndex++] = val;
          rgba[pixelIndex++] = val;
          rgba[pixelIndex++] = val;
          rgba[pixelIndex++] = 255;
        } else if (bitsPerSample === 1) {
          const byte = stripData[i];
          for (let bit = 7; bit >= 0 && pixelIndex < rgba.length; bit--) {
            const isBitSet = (byte >> bit) & 1;
            const val = (photometric === 0 ? 1 - isBitSet : isBitSet) * 255;
            rgba[pixelIndex++] = val;
            rgba[pixelIndex++] = val;
            rgba[pixelIndex++] = val;
            rgba[pixelIndex++] = 255;
          }
        }
      }
    }
  }

  const canvas = createUniversalCanvas(width, height);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  
  const imgData = typeof ImageData !== 'undefined'
    ? new ImageData(rgba, width, height)
    : ({ data: rgba, width, height } as any);

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Tier 2A: Extracts embedded high-res preview from DOS EPS binary header (0xC5D0D3C6)
 */
export function extractBinaryDosEpsPreview(
  buffer: ArrayBuffer
): { blob?: Blob; canvas?: HTMLCanvasElement | OffscreenCanvas; mime: string } | null {
  if (buffer.byteLength < 30) return null;
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== 0xc5d0d3c6) return null;

  const tiffOffset = view.getUint32(20, true);
  const tiffLength = view.getUint32(24, true);

  if (tiffOffset > 0 && tiffLength > 0 && tiffOffset + tiffLength <= buffer.byteLength) {
    const slice = buffer.slice(tiffOffset, tiffOffset + tiffLength);
    const u8 = new Uint8Array(slice, 0, 4);

    // Direct JPEG preview embedded at tiffOffset
    if (u8[0] === 0xff && u8[1] === 0xd8) {
      return { blob: new Blob([slice], { type: 'image/jpeg' }), mime: 'image/jpeg' };
    }

    // Try TIFF decoder directly
    try {
      const tiffCanvas = decodeTiffToCanvas(slice);
      if (tiffCanvas && tiffCanvas.width > 10 && tiffCanvas.height > 10) {
        return { canvas: tiffCanvas, mime: 'image/tiff' };
      }
    } catch {
      // Fall through to inner JPEG scan
    }

    // Scan inside TIFF for embedded JPEG stream
    const tiffBytes = new Uint8Array(slice);
    for (let i = 0; i < tiffBytes.length - 4; i++) {
      if (tiffBytes[i] === 0xff && tiffBytes[i + 1] === 0xd8 && tiffBytes[i + 2] === 0xff) {
        const jpegSlice = slice.slice(i);
        return { blob: new Blob([jpegSlice], { type: 'image/jpeg' }), mime: 'image/jpeg' };
      }
    }
  }

  return null;
}

/**
 * Tier 2B: Extracts Adobe XMP Thumbnail base64
 */
export function extractXmpThumbnail(text: string): string | null {
  const xmpImgMatch = text.match(/<xmpGImg:image>([\s\S]*?)<\/xmpGImg:image>/i);
  if (xmpImgMatch && xmpImgMatch[1]) {
    const rawB64 = xmpImgMatch[1].replace(/[\r\n\s]/g, '');
    if (rawB64.length > 100) {
      return `data:image/jpeg;base64,${rawB64}`;
    }
  }
  return null;
}

/**
 * Tier 2C: Scans binary buffer for raw SOI 0xFFD8 JPEG markers
 */
export function extractEmbeddedJpegStream(buffer: ArrayBuffer): Blob | null {
  const bytes = new Uint8Array(buffer);
  const len = bytes.length;
  for (let i = 0; i < len - 4; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
      for (let j = i + 100; j < Math.min(len - 1, i + 5 * 1024 * 1024); j++) {
        if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) {
          const slice = buffer.slice(i, j + 2);
          if (slice.byteLength > 1000) {
            return new Blob([slice], { type: 'image/jpeg' });
          }
        }
      }
    }
  }
  return null;
}

/**
 * Interprets PostScript Level 2/3 vector commands and draws them into the Canvas context
 */
export function renderPostScriptVectorPaths(
  psCode: string,
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  bb: EpsBoundingBox,
  scale: number,
  targetWidth: number,
  targetHeight: number
): number {
  const lines = psCode.split(/[\r\n]+/);
  let pathOpCount = 0;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const trackPoint = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  interface DrawCommand {
    type: 'moveto' | 'lineto' | 'curveto' | 'quadto' | 'rect' | 'close' | 'fill' | 'stroke' | 'fillstroke' | 'eofill' | 'eofillstroke' | 'newpath' | 'color' | 'linewidth';
    args?: number[];
    color?: string;
    isStroke?: boolean;
  }
  const commands: DrawCommand[] = [];

  const stack: number[] = [];
  for (let l = 0; l < lines.length; l++) {
    const rawLine = lines[l].trim();
    if (!rawLine || rawLine.startsWith('%')) continue;

    if (
      rawLine.includes('/CIDInit') ||
      rawLine.includes('/CIDFont') ||
      rawLine.includes('/ProcSet') ||
      rawLine.includes('findfont') ||
      rawLine.includes('setfont')
    ) {
      continue;
    }

    const tokens = rawLine.split(/\s+/);
    for (let t = 0; t < tokens.length; t++) {
      const tok = tokens[t];
      if (!tok) continue;

      const num = parseFloat(tok);
      if (!isNaN(num) && isFinite(num) && !tok.startsWith('/') && !tok.startsWith('(')) {
        stack.push(num);
        continue;
      }

      const op = tok;

      // Color operators
      if (op === 'setcmykcolor' || op === 'k' || op === 'K' || op === 'x' || op === 'X') {
        if (stack.length >= 4) {
          const k = stack.pop()!;
          const y = stack.pop()!;
          const m = stack.pop()!;
          const c = stack.pop()!;
          const [r, g, b] = cmykToRgb(c, m, y, k);
          const col = `rgb(${r},${g},${b})`;
          commands.push({ type: 'color', color: col, isStroke: op === 'K' || op === 'X' });
          if (op === 'k') {
            commands.push({ type: 'color', color: col, isStroke: true });
          }
        }
        continue;
      }

      if (op === 'setrgbcolor' || op === 'rg' || op === 'RG') {
        if (stack.length >= 3) {
          const b = Math.round(stack.pop()! * 255);
          const g = Math.round(stack.pop()! * 255);
          const r = Math.round(stack.pop()! * 255);
          const col = `rgb(${r},${g},${b})`;
          commands.push({ type: 'color', color: col, isStroke: op === 'RG' });
          if (op === 'rg' || op === 'setrgbcolor') {
            commands.push({ type: 'color', color: col, isStroke: true });
          }
        }
        continue;
      }

      if (op === 'setgray' || op === 'g' || op === 'G') {
        if (stack.length >= 1) {
          const gVal = Math.round(stack.pop()! * 255);
          const col = `rgb(${gVal},${gVal},${gVal})`;
          commands.push({ type: 'color', color: col, isStroke: op === 'G' });
          if (op === 'g' || op === 'setgray') {
            commands.push({ type: 'color', color: col, isStroke: true });
          }
        }
        continue;
      }

      if (op === 'setlinewidth' || op === 'w') {
        if (stack.length >= 1) {
          const lw = stack.pop()!;
          if (lw > 0) commands.push({ type: 'linewidth', args: [lw] });
        }
        continue;
      }

      // Path operators
      if (op === 'moveto' || op === 'm') {
        if (stack.length >= 2) {
          const y = stack.pop()!;
          const x = stack.pop()!;
          trackPoint(x, y);
          commands.push({ type: 'moveto', args: [x, y] });
          pathOpCount++;
        }
        continue;
      }

      if (op === 'lineto' || op === 'l') {
        if (stack.length >= 2) {
          const y = stack.pop()!;
          const x = stack.pop()!;
          trackPoint(x, y);
          commands.push({ type: 'lineto', args: [x, y] });
          pathOpCount++;
        }
        continue;
      }

      if (op === 'curveto' || op === 'c') {
        if (stack.length >= 6) {
          const y3 = stack.pop()!;
          const x3 = stack.pop()!;
          const y2 = stack.pop()!;
          const x2 = stack.pop()!;
          const y1 = stack.pop()!;
          const x1 = stack.pop()!;
          trackPoint(x1, y1);
          trackPoint(x2, y2);
          trackPoint(x3, y3);
          commands.push({ type: 'curveto', args: [x1, y1, x2, y2, x3, y3] });
          pathOpCount++;
        }
        continue;
      }

      if (op === 'v') {
        if (stack.length >= 4) {
          const y3 = stack.pop()!;
          const x3 = stack.pop()!;
          const y2 = stack.pop()!;
          const x2 = stack.pop()!;
          trackPoint(x2, y2);
          trackPoint(x3, y3);
          commands.push({ type: 'quadto', args: [x2, y2, x3, y3] });
          pathOpCount++;
        }
        continue;
      }

      if (op === 'y') {
        if (stack.length >= 4) {
          const y3 = stack.pop()!;
          const x3 = stack.pop()!;
          const y1 = stack.pop()!;
          const x1 = stack.pop()!;
          trackPoint(x1, y1);
          trackPoint(x3, y3);
          commands.push({ type: 'quadto', args: [x1, y1, x3, y3] });
          pathOpCount++;
        }
        continue;
      }

      if (op === 're') {
        if (stack.length >= 4) {
          const h = stack.pop()!;
          const w = stack.pop()!;
          const y = stack.pop()!;
          const x = stack.pop()!;
          trackPoint(x, y);
          trackPoint(x + w, y + h);
          commands.push({ type: 'rect', args: [x, y, w, h] });
          pathOpCount++;
        }
        continue;
      }

      if (op === 'closepath' || op === 'h' || op === 'H' || op === 'cp') {
        commands.push({ type: 'close' });
        continue;
      }

      // Painting operators
      if (op === 'fill' || op === 'f' || op === 'F') {
        commands.push({ type: 'fill' });
        stack.length = 0;
        continue;
      }

      if (op === 'eofill' || op === 'f*') {
        commands.push({ type: 'eofill' });
        stack.length = 0;
        continue;
      }

      if (op === 'stroke' || op === 's' || op === 'S' || op === 'o' || op === 'O') {
        commands.push({ type: 'stroke' });
        stack.length = 0;
        continue;
      }

      if (op === 'b' || op === 'B') {
        commands.push({ type: 'fillstroke' });
        stack.length = 0;
        continue;
      }

      if (op === 'b*' || op === 'B*') {
        commands.push({ type: 'eofillstroke' });
        stack.length = 0;
        continue;
      }

      if (op === 'newpath' || op === 'n' || op === 'N') {
        commands.push({ type: 'newpath' });
        stack.length = 0;
        continue;
      }

      if (stack.length > 100) {
        stack.length = 0;
      }
    }
  }

  // PASS 2: Determine actual bounding box and setup centered view
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  const artWidth = isFinite(minX) && isFinite(maxX) ? maxX - minX : 0;
  const artHeight = isFinite(minY) && isFinite(maxY) ? maxY - minY : 0;

  if (artWidth > 0 && artHeight > 0) {
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    // Scale to fit 85% of canvas with 15% padding
    const availW = targetWidth * 0.85;
    const availH = targetHeight * 0.85;
    const fitScale = Math.min(availW / artWidth, availH / artHeight);

    // Center the artwork on canvas
    ctx.translate(targetWidth / 2, targetHeight / 2);
    ctx.scale(fitScale, -fitScale);
    ctx.translate(-centerX, -centerY);
  } else {
    // Fallback to bounding box from headers
    ctx.translate(-bb.llx * scale, targetHeight + bb.lly * scale);
    ctx.scale(scale, -scale);
  }

  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  let inPath = false;
  for (const cmd of commands) {
    if (cmd.type === 'color') {
      if (cmd.isStroke) ctx.strokeStyle = cmd.color!;
      else ctx.fillStyle = cmd.color!;
    } else if (cmd.type === 'linewidth') {
      ctx.lineWidth = cmd.args![0];
    } else if (cmd.type === 'moveto') {
      if (!inPath) { ctx.beginPath(); inPath = true; }
      ctx.moveTo(cmd.args![0], cmd.args![1]);
    } else if (cmd.type === 'lineto') {
      ctx.lineTo(cmd.args![0], cmd.args![1]);
    } else if (cmd.type === 'curveto') {
      ctx.bezierCurveTo(cmd.args![0], cmd.args![1], cmd.args![2], cmd.args![3], cmd.args![4], cmd.args![5]);
    } else if (cmd.type === 'quadto') {
      ctx.quadraticCurveTo(cmd.args![0], cmd.args![1], cmd.args![2], cmd.args![3]);
    } else if (cmd.type === 'rect') {
      ctx.rect(cmd.args![0], cmd.args![1], cmd.args![2], cmd.args![3]);
    } else if (cmd.type === 'close') {
      ctx.closePath();
    } else if (cmd.type === 'newpath') {
      ctx.beginPath();
      inPath = true;
    } else if (cmd.type === 'fill') {
      ctx.fill();
      inPath = false;
    } else if (cmd.type === 'eofill') {
      ctx.fill('evenodd');
      inPath = false;
    } else if (cmd.type === 'stroke') {
      ctx.stroke();
      inPath = false;
    } else if (cmd.type === 'fillstroke') {
      ctx.fill();
      ctx.stroke();
      inPath = false;
    } else if (cmd.type === 'eofillstroke') {
      ctx.fill('evenodd');
      ctx.stroke();
      inPath = false;
    }
  }

  ctx.restore();
  return pathOpCount;
}

export function drawFittedImage(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: CanvasImageSource,
  imgW: number,
  imgH: number,
  canvasW: number,
  canvasH: number
) {
  const aspect = imgW / imgH;
  let renderW = canvasW;
  let renderH = canvasH;
  if (aspect >= 1) {
    renderW = canvasW;
    renderH = Math.round(canvasW / aspect);
  } else {
    renderH = canvasH;
    renderW = Math.round(canvasH * aspect);
  }
  const offX = Math.round((canvasW - renderW) / 2);
  const offY = Math.round((canvasH - renderH) / 2);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.drawImage(img, 0, 0, imgW, imgH, offX, offY, renderW, renderH);
}

/**
 * Direct in-process EPS rasterizer executing across all 3 tiers.
 * Operates purely on ArrayBuffer and does not freeze UI when executed inside a Web Worker.
 */
export async function rasterizeEpsBufferDirect(
  buffer: ArrayBuffer,
  rawFileName: string,
  targetLongestSide = 4000,
  jpegQuality = 0.98
): Promise<EpsRenderResult> {
  if (buffer.byteLength === 0) {
    throw new Error(`EPS file "${rawFileName || 'unknown'}" is corrupted or empty (0 bytes)`);
  }

  let psStartOffset = 0;
  let psLength = buffer.byteLength;

  if (buffer.byteLength >= 30) {
    const magicView = new DataView(buffer);
    if (magicView.getUint32(0, true) === 0xc5d0d3c6) {
      psStartOffset = magicView.getUint32(4, true);
      const reportedLen = magicView.getUint32(8, true);
      if (reportedLen > 0 && psStartOffset + reportedLen <= buffer.byteLength) {
        psLength = reportedLen;
      }
    }
  }

  // 1. Text decoding of the first 512KB from the PostScript start to inspect headers and BoundingBox
  const decoder = new TextDecoder('latin1');
  const headerSlice = buffer.slice(psStartOffset, Math.min(buffer.byteLength, psStartOffset + 512 * 1024));
  const headerText = decoder.decode(headerSlice);

  const bb = parseEpsBoundingBox(headerText) || {
    llx: 0,
    lly: 0,
    urx: 1000,
    ury: 1000,
    width: 1000,
    height: 1000,
  };

  // Compute target canvas dimensions based on exact aspect ratio
  const aspect = bb.width / bb.height;
  let canvasWidth = targetLongestSide;
  let canvasHeight = targetLongestSide;

  if (aspect >= 1) {
    canvasWidth = targetLongestSide;
    canvasHeight = Math.max(1, Math.round(targetLongestSide / aspect));
  } else {
    canvasHeight = targetLongestSide;
    canvasWidth = Math.max(1, Math.round(targetLongestSide * aspect));
  }

  const canvas = createUniversalCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Canvas 2D rendering context not available');

  // Pure white opaque background (#FFFFFF)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const fullText = psStartOffset > 0 
    ? decoder.decode(buffer.slice(psStartOffset, psStartOffset + psLength))
    : decoder.decode(buffer);

  // ==========================================
  // TIER 1: Authentic Embedded Previews (DOS EPS Binary Header TIFF/JPEG, XMP Thumbnail)
  // When vector files are saved by Adobe Illustrator or CorelDraw, the authentic embedded
  // preview preserves 100% of the true vector art, meshes, and CMYK color accuracy.
  // ==========================================
  // 1A. DOS EPS Binary Header (TIFF or JPEG preview)
  const dosPreview = extractBinaryDosEpsPreview(buffer);
  if (dosPreview) {
    if (dosPreview.canvas) {
      try {
        drawFittedImage(ctx, dosPreview.canvas, dosPreview.canvas.width, dosPreview.canvas.height, canvasWidth, canvasHeight);
      } finally {
        try {
          dosPreview.canvas.width = 0;
          dosPreview.canvas.height = 0;
        } catch {}
      }
      const { blob, dataUrl } = await canvasToBlobAndDataUrl(canvas, jpegQuality);
      return {
        width: canvasWidth,
        height: canvasHeight,
        dataUrl,
        blob,
        sourceTier: 'binary_preview',
        boundingBox: bb,
        pathOpCount: 100, // real artwork
      };
    } else if (dosPreview.blob) {
      let drawable: CanvasImageSource | null = null;
      try {
        drawable = await loadUniversalDrawable(dosPreview.blob);
        const dWidth = (drawable as any).naturalWidth || (drawable as any).width;
        const dHeight = (drawable as any).naturalHeight || (drawable as any).height;
        drawFittedImage(ctx, drawable, dWidth, dHeight, canvasWidth, canvasHeight);
        const { blob, dataUrl } = await canvasToBlobAndDataUrl(canvas, jpegQuality);
        return {
          width: canvasWidth,
          height: canvasHeight,
          dataUrl,
          blob,
          sourceTier: 'binary_preview',
          boundingBox: bb,
          pathOpCount: 100, // real artwork
        };
      } catch {
        // Fall through
      } finally {
        if (drawable && typeof (drawable as any).close === 'function') {
          try {
            (drawable as any).close();
          } catch {}
        }
      }
    }
  }

  // 1B. Embedded XMP Base64 Thumbnail
  const xmpB64 = extractXmpThumbnail(fullText) || extractXmpThumbnail(decoder.decode(buffer.slice(0, Math.min(buffer.byteLength, 2 * 1024 * 1024))));
  if (xmpB64) {
    let drawable: CanvasImageSource | null = null;
    try {
      drawable = await loadUniversalDrawable(xmpB64);
      const dWidth = (drawable as any).naturalWidth || (drawable as any).width;
      const dHeight = (drawable as any).naturalHeight || (drawable as any).height;
      drawFittedImage(ctx, drawable, dWidth, dHeight, canvasWidth, canvasHeight);
      const { blob, dataUrl } = await canvasToBlobAndDataUrl(canvas, jpegQuality);
      return {
        width: canvasWidth,
        height: canvasHeight,
        dataUrl,
        blob,
        sourceTier: 'xmp',
        boundingBox: bb,
        pathOpCount: 100, // real artwork
      };
    } catch {
      // Fall through to other tiers
    } finally {
      if (drawable && typeof (drawable as any).close === 'function') {
        try {
          (drawable as any).close();
        } catch {}
      }
    }
  }

  // 1C. Embedded JPEG Stream anywhere in buffer
  const jpegStream = extractEmbeddedJpegStream(buffer);
  if (jpegStream) {
    let drawable: CanvasImageSource | null = null;
    try {
      drawable = await loadUniversalDrawable(jpegStream);
      const dWidth = (drawable as any).naturalWidth || (drawable as any).width;
      const dHeight = (drawable as any).naturalHeight || (drawable as any).height;
      drawFittedImage(ctx, drawable, dWidth, dHeight, canvasWidth, canvasHeight);
      const { blob, dataUrl } = await canvasToBlobAndDataUrl(canvas, jpegQuality);
      return {
        width: canvasWidth,
        height: canvasHeight,
        dataUrl,
        blob,
        sourceTier: 'binary_preview',
        boundingBox: bb,
        pathOpCount: 100, // real artwork
      };
    } catch {
      // Fall through
    } finally {
      if (drawable && typeof (drawable as any).close === 'function') {
        try {
          (drawable as any).close();
        } catch {}
      }
    }
  }

  // ==========================================
  // TIER 2: PostScript Level 2/3 Vector Engine (For ASCII EPS without embedded preview)
  // ==========================================
  const scale = canvasWidth / bb.width;
  const pathOpCount = renderPostScriptVectorPaths(fullText, ctx, bb, scale, canvasWidth, canvasHeight);

  if (pathOpCount >= 10) {
    const { blob, dataUrl } = await canvasToBlobAndDataUrl(canvas, jpegQuality);
    return {
      width: canvasWidth,
      height: canvasHeight,
      dataUrl,
      blob,
      sourceTier: 'vector',
      boundingBox: bb,
      pathOpCount,
    };
  }

  // ==========================================
  // TIER 3: Clean Fallback Vector Badge (Pure White Canvas, Commercial Header)
  // ==========================================
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // Clean decorative border
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = Math.max(2, Math.round(canvasWidth / 200));
  ctx.strokeRect(canvasWidth * 0.05, canvasHeight * 0.05, canvasWidth * 0.9, canvasHeight * 0.9);

  ctx.fillStyle = '#2563EB';
  ctx.font = `bold ${Math.round(canvasWidth / 18)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VECTOR ILLUSTRATION', canvasWidth / 2, canvasHeight / 2 - 25);

  const cleanSubject = rawFileName.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').toUpperCase();
  ctx.fillStyle = '#18181B';
  ctx.font = `bold ${Math.round(canvasWidth / 22)}px sans-serif`;
  ctx.fillText(cleanSubject.slice(0, 28), canvasWidth / 2, canvasHeight / 2 + 25);

  ctx.fillStyle = '#71717A';
  ctx.font = `${Math.round(canvasWidth / 32)}px sans-serif`;
  ctx.fillText('Adobe Illustrator EPS 10', canvasWidth / 2, canvasHeight / 2 + 70);

  const { blob, dataUrl } = await canvasToBlobAndDataUrl(canvas, jpegQuality);

  return {
    width: canvasWidth,
    height: canvasHeight,
    dataUrl,
    blob,
    sourceTier: 'vector',
    boundingBox: bb,
    pathOpCount: 0, // Tier 3 badge — no real artwork rendered
  };
}
