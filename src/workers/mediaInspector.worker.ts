/**
 * Web Worker: Fast Binary Image Header Dimension Parser
 * Parses JPEG (SOF0-SOF15), PNG (IHDR), and WebP (VP8 / VP8L / VP8X) dimensions
 * from a 64 KB binary slice without decoding full pixel buffers.
 */

export interface MediaInspectRequest {
  id: number;
  buffer: ArrayBuffer;
  ext: string;
}

export interface MediaInspectResponse {
  id: number;
  width?: number;
  height?: number;
  parsed: boolean;
}

function parsePngDimensions(data: Uint8Array, view: DataView): { width: number; height: number } | null {
  if (
    data.length >= 24 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    if (width > 0 && height > 0) {
      return { width, height };
    }
  }
  return null;
}

function parseWebpDimensions(data: Uint8Array, view: DataView): { width: number; height: number } | null {
  if (
    data.length >= 30 &&
    data[0] === 0x52 && // 'R'
    data[1] === 0x49 && // 'I'
    data[2] === 0x46 && // 'F'
    data[3] === 0x46 && // 'F'
    data[8] === 0x57 && // 'W'
    data[9] === 0x45 && // 'E'
    data[10] === 0x42 && // 'B'
    data[11] === 0x50 // 'P'
  ) {
    const chunkType = String.fromCharCode(data[12], data[13], data[14], data[15]);
    if (chunkType === 'VP8 ' && data.length >= 30) {
      const width = view.getUint16(26, true) & 0x3fff;
      const height = view.getUint16(28, true) & 0x3fff;
      if (width > 0 && height > 0) return { width, height };
    } else if (chunkType === 'VP8L' && data.length >= 25) {
      const b0 = data[21];
      const b1 = data[22];
      const b2 = data[23];
      const b3 = data[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      if (width > 0 && height > 0) return { width, height };
    } else if (chunkType === 'VP8X' && data.length >= 30) {
      const width = 1 + (data[24] | (data[25] << 8) | (data[26] << 16));
      const height = 1 + (data[27] | (data[28] << 8) | (data[29] << 16));
      if (width > 0 && height > 0) return { width, height };
    }
  }
  return null;
}

function parseJpegDimensions(data: Uint8Array, view: DataView): { width: number; height: number } | null {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 9 <= data.length) {
    if (data[offset] !== 0xff) {
      offset++;
      continue;
    }

    // Skip repeated 0xFF padding bytes
    while (offset < data.length && data[offset] === 0xff) {
      offset++;
    }
    if (offset >= data.length) break;

    const marker = data[offset];
    offset++;

    // Standalone markers without length
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      continue;
    }

    if (offset + 2 > data.length) break;
    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2) break;

    // SOF0..SOF15 markers (excluding DHT=0xC4, JPG=0xC8, DAC=0xCC)
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      if (offset + 7 <= data.length) {
        const height = view.getUint16(offset + 3, false);
        const width = view.getUint16(offset + 5, false);
        if (width > 0 && height > 0) {
          return { width, height };
        }
      }
      break;
    }

    offset += segmentLength;
  }

  return null;
}

export function parseImageHeaderBuffer(buffer: ArrayBuffer): { width: number; height: number } | null {
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);

  return (
    parseJpegDimensions(data, view) ||
    parsePngDimensions(data, view) ||
    parseWebpDimensions(data, view)
  );
}

if (typeof self !== 'undefined' && typeof (self as any).onmessage !== 'undefined') {
  self.onmessage = (event: MessageEvent<MediaInspectRequest>) => {
    const { id, buffer } = event.data;
    try {
      const dims = parseImageHeaderBuffer(buffer);
      const response: MediaInspectResponse = dims
        ? { id, width: dims.width, height: dims.height, parsed: true }
        : { id, parsed: false };
      (self as any).postMessage(response);
    } catch {
      const response: MediaInspectResponse = { id, parsed: false };
      (self as any).postMessage(response);
    }
  };
}
