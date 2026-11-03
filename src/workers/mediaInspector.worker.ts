/**
 * Web Worker: Fast Binary Image Header Dimension Parser
 * Offloads JPEG, PNG, and WebP binary header slicing to a background Web Worker.
 */

import { parseImageHeaderBuffer } from '../utils/imageHeaderParser';
export { parseImageHeaderBuffer };

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

// Strict runtime isolation: Only bind message listeners when executing inside an authentic dedicated Web Worker
const isDedicatedWorker =
  typeof WorkerGlobalScope !== 'undefined' &&
  typeof self !== 'undefined' &&
  self instanceof WorkerGlobalScope &&
  typeof window === 'undefined';

if (isDedicatedWorker) {
  self.onmessage = (event: MessageEvent<MediaInspectRequest>) => {
    const { id, buffer } = event.data || {};
    if (!id || !buffer) return;

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
