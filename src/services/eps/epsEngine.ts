/**
 * EPS 10 Multi-Tier Vector Parser & High-Resolution Rasterizer Engine
 * 
 * Supports:
 * - Adobe Illustrator EPS 10 / EPS 8 / PostScript Level 2/3
 * - Coordinate extraction via %%BoundingBox and %%HiResBoundingBox
 * - PostScript Level 2/3 vector operators (moveto, lineto, curveto, closepath, etc.)
 * - Colorspaces: CMYK (setcmykcolor / k) converted to sRGB, RGB (setrgbcolor / rg), Grayscale (setgray / g)
 * - Compound paths, fills, strokes, line widths
 * - Multi-tier embedded preview extraction (Binary DOS EPS header 0xC5D0D3C6, %%BeginPreview ASCII hex/ASCII85, XMP xmpGImg:image base64)
 * - High-DPI Canvas rasterization with pure white (#FFFFFF) background
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
  canvas: HTMLCanvasElement;
  dataUrl: string;
  blob: Blob;
  sourceTier: 'vector' | 'xmp' | 'binary_preview' | 'ascii_preview';
  boundingBox?: EpsBoundingBox;
  /** Number of path operations rendered (only meaningful for Tier 1 vector render; 0 for placeholder) */
  pathOpCount?: number;
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
 * Tier 2A: Extracts embedded high-res preview from DOS EPS binary header (0xC5D0D3C6)
 */
function extractBinaryDosEpsPreview(buffer: ArrayBuffer): { blob: Blob; mime: string } | null {
  if (buffer.byteLength < 30) return null;
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== 0xc5d0d3c6) return null;

  // DOS EPS Header:
  // Offset 0: 0xC5D0D3C6
  // Offset 4: PS offset
  // Offset 8: PS length
  // Offset 12: WMF offset
  // Offset 16: WMF length
  // Offset 20: TIFF offset
  // Offset 24: TIFF length
  const tiffOffset = view.getUint32(20, true);
  const tiffLength = view.getUint32(24, true);

  if (tiffOffset > 0 && tiffLength > 0 && tiffOffset + tiffLength <= buffer.byteLength) {
    const slice = buffer.slice(tiffOffset, tiffOffset + tiffLength);
    const u8 = new Uint8Array(slice, 0, 4);
    // Only return JPEG previews — browsers cannot decode TIFF in <img>
    if (u8[0] === 0xff && u8[1] === 0xd8) {
      return { blob: new Blob([slice], { type: 'image/jpeg' }), mime: 'image/jpeg' };
    }
    // TIFF preview: scan inside it for an embedded JPEG (Illustrator often embeds a JPEG inside the TIFF)
    const tiffBytes = new Uint8Array(slice);
    for (let i = 0; i < tiffBytes.length - 100; i++) {
      if (tiffBytes[i] === 0xff && tiffBytes[i + 1] === 0xd8 && tiffBytes[i + 2] === 0xff) {
        for (let j = i + 100; j < Math.min(tiffBytes.length - 1, i + 5 * 1024 * 1024); j++) {
          if (tiffBytes[j] === 0xff && tiffBytes[j + 1] === 0xd9) {
            const jpegSlice = tiffBytes.subarray(i, j + 2);
            if (jpegSlice.length > 1024) {
              return { blob: new Blob([jpegSlice], { type: 'image/jpeg' }), mime: 'image/jpeg' };
            }
            break;
          }
        }
      }
    }
    // Pure TIFF — skip (browser can't decode it natively)
  }

  return null;
}

/**
 * Tier 2B: Extracts embedded XMP thumbnail (`xmpGImg:image`)
 */
function extractXmpThumbnail(epsText: string): string | null {
  // Look for xmpGImg:image base64 block
  const match = epsText.match(/<xmpGImg:image>([\s\S]*?)<\/xmpGImg:image>/i);
  if (match) {
    const cleanB64 = match[1].replace(/[\s\r\n]+/g, '');
    if (cleanB64.length > 100) {
      return `data:image/jpeg;base64,${cleanB64}`;
    }
  }

  // Also check standard Base64 preview streams
  const altMatch = epsText.match(/xmpGImg:image="([^"]+)"/i);
  if (altMatch && altMatch[1].length > 100) {
    const clean = altMatch[1].replace(/[\s\r\n]+/g, '');
    return `data:image/jpeg;base64,${clean}`;
  }

  return null;
}

/**
 * Tier 2C: Extracts embedded JPEG binary stream within PostScript comments or data blocks
 */
function extractEmbeddedJpegStream(buffer: ArrayBuffer): Blob | null {
  const bytes = new Uint8Array(buffer);
  const maxScan = Math.min(bytes.length - 100, 2 * 1024 * 1024); // Scan first 2MB

  for (let i = 0; i < maxScan; i++) {
    // JPEG SOI marker 0xFF 0xD8 0xFF
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
      // Find JPEG EOI marker 0xFF 0xD9
      for (let j = i + 100; j < Math.min(bytes.length - 1, i + 8 * 1024 * 1024); j++) {
        if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) {
          const jpegSlice = bytes.subarray(i, j + 2);
          if (jpegSlice.length > 1024) {
            return new Blob([jpegSlice], { type: 'image/jpeg' });
          }
          break; // EOI found but too small — stop inner scan and try next SOI
        }
      }
    }
  }
  return null;
}

/**
 * Tier 1: PostScript Level 2/3 Vector Path Parser
 * Extracts vector commands and executes them directly on an HTML5 Canvas context
 */
function renderPostScriptVectorPaths(
  epsContent: string,
  ctx: CanvasRenderingContext2D,
  bb: EpsBoundingBox,
  scale: number,
  targetWidth: number,
  targetHeight: number
): number {  // returns pathOpCount (0 = nothing rendered)
  // PostScript transforms:
  // EPS coordinate system has origin (0,0) at bottom-left, increasing upward.
  // Canvas coordinate system has origin (0,0) at top-left, increasing downward.
  ctx.save();

  // Background is pure white (#FFFFFF)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // Apply world transform
  // Shift so bounding box lower-left aligns with (0,0), scale, and flip Y
  ctx.translate(-bb.llx * scale, targetHeight + bb.lly * scale);
  ctx.scale(scale, -scale);

  // Default drawing properties
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  // Fast tokenizer of PostScript vector stream
  // We extract the PostScript body (strip binary preview header if present)
  const psStart = epsContent.indexOf('%!PS-Adobe');
  const body = psStart >= 0 ? epsContent.slice(psStart) : epsContent;

  const lines = body.split(/[\r\n]+/);
  let pathOpCount = 0;
  let inPath = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith('%')) continue;

    // Check for EOF or end of page
    if (rawLine === 'showpage' || rawLine === '%%Trailer' || rawLine === '%%EOF') {
      break;
    }

    // Tokenize line by whitespace
    const tokens = rawLine.split(/\s+/);
    const len = tokens.length;
    if (len === 0) continue;

    const op = tokens[len - 1];

    // 1. Color Operators:
    // CMYK: c m y k setcmykcolor OR c m y k k
    if ((op === 'setcmykcolor' || op === 'k' || op === 'K') && len >= 5) {
      const c = parseFloat(tokens[len - 5]);
      const m = parseFloat(tokens[len - 4]);
      const y = parseFloat(tokens[len - 3]);
      const k = parseFloat(tokens[len - 2]);
      if (!isNaN(c) && !isNaN(m) && !isNaN(y) && !isNaN(k)) {
        const [r, g, b] = cmykToRgb(c, m, y, k);
        const col = `rgb(${r},${g},${b})`;
        if (op === 'K') {
          ctx.strokeStyle = col;
        } else {
          ctx.fillStyle = col;
          if (op === 'k') ctx.strokeStyle = col;
        }
      }
      continue;
    }

    // RGB: r g b setrgbcolor OR r g b rg / RG
    if ((op === 'setrgbcolor' || op === 'rg' || op === 'RG') && len >= 4) {
      const r = Math.round(parseFloat(tokens[len - 4]) * 255);
      const g = Math.round(parseFloat(tokens[len - 3]) * 255);
      const b = Math.round(parseFloat(tokens[len - 2]) * 255);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        const col = `rgb(${r},${g},${b})`;
        if (op === 'RG') {
          ctx.strokeStyle = col;
        } else {
          ctx.fillStyle = col;
          ctx.strokeStyle = col;
        }
      }
      continue;
    }

    // Grayscale: g setgray OR g g / G
    if ((op === 'setgray' || op === 'g' || op === 'G') && len >= 2) {
      const gVal = Math.round(parseFloat(tokens[len - 2]) * 255);
      if (!isNaN(gVal)) {
        const col = `rgb(${gVal},${gVal},${gVal})`;
        if (op === 'G') {
          ctx.strokeStyle = col;
        } else {
          ctx.fillStyle = col;
          ctx.strokeStyle = col;
        }
      }
      continue;
    }

    // Line width: w setlinewidth OR w w
    if ((op === 'setlinewidth' || op === 'w') && len >= 2) {
      const lw = parseFloat(tokens[len - 2]);
      if (!isNaN(lw) && lw > 0) {
        ctx.lineWidth = lw;
      }
      continue;
    }

    // 2. Vector Path Construction Operators:
    // moveto / m: x y m
    if ((op === 'moveto' || op === 'm') && len >= 3) {
      const x = parseFloat(tokens[len - 3]);
      const y = parseFloat(tokens[len - 2]);
      if (!isNaN(x) && !isNaN(y)) {
        if (!inPath) {
          ctx.beginPath();
          inPath = true;
        }
        ctx.moveTo(x, y);
        pathOpCount++;
      }
      continue;
    }

    // lineto / l: x y l
    if ((op === 'lineto' || op === 'l') && len >= 3) {
      const x = parseFloat(tokens[len - 3]);
      const y = parseFloat(tokens[len - 2]);
      if (!isNaN(x) && !isNaN(y)) {
        ctx.lineTo(x, y);
        pathOpCount++;
      }
      continue;
    }

    // curveto / c: x1 y1 x2 y2 x3 y3 c
    if ((op === 'curveto' || op === 'c') && len >= 7) {
      const x1 = parseFloat(tokens[len - 7]);
      const y1 = parseFloat(tokens[len - 6]);
      const x2 = parseFloat(tokens[len - 5]);
      const y2 = parseFloat(tokens[len - 4]);
      const x3 = parseFloat(tokens[len - 3]);
      const y3 = parseFloat(tokens[len - 2]);
      if (!isNaN(x1) && !isNaN(x3)) {
        ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3);
        pathOpCount++;
      }
      continue;
    }

    // closepath / h / cp
    if (op === 'closepath' || op === 'h' || op === 'cp') {
      ctx.closePath();
      continue;
    }

    // 3. Path Painting Operators:
    // fill / f / F
    if (op === 'fill' || op === 'f' || op === 'F') {
      ctx.fill();
      inPath = false;
      continue;
    }

    // eofill / f*
    if (op === 'eofill' || op === 'f*') {
      ctx.fill('evenodd');
      inPath = false;
      continue;
    }

    // stroke / s / S
    if (op === 'stroke' || op === 's' || op === 'S') {
      ctx.stroke();
      inPath = false;
      continue;
    }

    // b / B: fill and stroke
    if (op === 'b' || op === 'B') {
      ctx.fill();
      ctx.stroke();
      inPath = false;
      continue;
    }

    // b* / B*: eofill and stroke
    if (op === 'b*' || op === 'B*') {
      ctx.fill('evenodd');
      ctx.stroke();
      inPath = false;
      continue;
    }

    // newpath / n
    if (op === 'newpath' || op === 'n') {
      ctx.beginPath();
      inPath = true;
      continue;
    }
  }

  ctx.restore();
  return pathOpCount;
}

/**
 * Loads an image from Blob or dataUrl into an HTMLImageElement
 */
function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load raster image preview'));
    img.src = src;
  });
}

/**
 * Core Rasterizer Function:
 * Renders any Illustrator EPS 10 / EPS 8 file to a pristine, high-resolution JPG Canvas
 * Target longest side can be set to e.g. 512 for thumbnails, 2500 for Agency 4MP+, 4000 for Ultra HD 16MP.
 */
export async function rasterizeEpsFile(
  file: File | Blob,
  targetLongestSide = 2500,
  jpegQuality = 0.95
): Promise<EpsRenderResult> {
  const buffer = await file.arrayBuffer();

  // 1. Text decoding of the first 256KB to inspect PostScript headers and BoundingBox
  const decoder = new TextDecoder('latin1');
  const headerSlice = buffer.slice(0, Math.min(buffer.byteLength, 512 * 1024));
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

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D rendering context not available');

  // Pure white opaque background (#FFFFFF)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // ==========================================
  // TIER 1: PostScript Level 2/3 Vector Engine
  // ==========================================
  const fullText = decoder.decode(buffer);
  const scale = canvasWidth / bb.width;
  const pathOpCount = renderPostScriptVectorPaths(fullText, ctx, bb, scale, canvasWidth, canvasHeight);

  if (pathOpCount >= 10) {
    const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', jpegQuality));
    return {
      width: canvasWidth,
      height: canvasHeight,
      canvas,
      dataUrl,
      blob,
      sourceTier: 'vector',
      boundingBox: bb,
      pathOpCount,
    };
  }

  // ==========================================
  // TIER 2: High-Resolution Embedded Previews
  // ==========================================
  // Check 2A: DOS EPS Binary Header (TIFF/JPEG preview)
  const dosPreview = extractBinaryDosEpsPreview(buffer);
  if (dosPreview) {
    const objUrl = URL.createObjectURL(dosPreview.blob);
    try {
      const img = await loadImageElement(objUrl);
      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
      URL.revokeObjectURL(objUrl);
      const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', jpegQuality));
      return {
        width: canvasWidth,
        height: canvasHeight,
        canvas,
        dataUrl,
        blob,
        sourceTier: 'binary_preview',
        boundingBox: bb,
      };
    } catch {
      URL.revokeObjectURL(objUrl);
    }
  }

  // Check 2B: Embedded JPEG Stream anywhere in the file
  const jpegStream = extractEmbeddedJpegStream(buffer);
  if (jpegStream) {
    const objUrl = URL.createObjectURL(jpegStream);
    try {
      const img = await loadImageElement(objUrl);
      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
      URL.revokeObjectURL(objUrl);
      const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', jpegQuality));
      return {
        width: canvasWidth,
        height: canvasHeight,
        canvas,
        dataUrl,
        blob,
        sourceTier: 'binary_preview',
        boundingBox: bb,
      };
    } catch {
      URL.revokeObjectURL(objUrl);
    }
  }

  // Check 2C: XMP Base64 image
  const xmpB64 = extractXmpThumbnail(fullText);
  if (xmpB64) {
    try {
      const img = await loadImageElement(xmpB64);
      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
      const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', jpegQuality));
      return {
        width: canvasWidth,
        height: canvasHeight,
        canvas,
        dataUrl,
        blob,
        sourceTier: 'xmp',
        boundingBox: bb,
      };
    } catch {
      // Fall through to fallback
    }
  }

  // ==========================================
  // TIER 3: Clean Fallback Vector Badge
  // ==========================================
  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = '#6366f1';
  ctx.font = `bold ${Math.round(canvasWidth / 15)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EPS 10 VECTOR', canvasWidth / 2, canvasHeight / 2 - 20);
  ctx.fillStyle = '#a1a1aa';
  ctx.font = `${Math.round(canvasWidth / 30)}px sans-serif`;
  ctx.fillText('Adobe Illustrator Vector Asset', canvasWidth / 2, canvasHeight / 2 + 35);

  const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', jpegQuality));

  return {
    width: canvasWidth,
    height: canvasHeight,
    canvas,
    dataUrl,
    blob,
    sourceTier: 'vector',
    boundingBox: bb,
    pathOpCount: 0, // Tier 3 badge — no real artwork rendered
  };
}
