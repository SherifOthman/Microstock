/**
 * Web Worker: Lossless ISOBMFF MP4/MOV Audio Track Inspector & Atom Stripper
 * Runs binary box traversal and 'trak' -> 'free' atom mutation off the UI thread
 * using zero-copy Transferable ArrayBuffers.
 */

import { parseIsoBoxes, inspectMoovBytes, stripAudioFromBufferInPlace } from '../utils/videoBoxParser';
export { parseIsoBoxes, inspectMoovBytes, stripAudioFromBufferInPlace };

// Strict runtime isolation: Only bind message listeners when executing inside an authentic dedicated Web Worker
const isDedicatedWorker =
  typeof WorkerGlobalScope !== 'undefined' &&
  typeof self !== 'undefined' &&
  self instanceof WorkerGlobalScope &&
  typeof window === 'undefined';

if (isDedicatedWorker) {
  self.onmessage = (event: MessageEvent<any>) => {
    const { id, action, buffer } = event.data || {};
    if (!id) return;

    try {
      if (action === 'inspect') {
        const result = inspectMoovBytes(new Uint8Array(buffer));
        (self as any).postMessage({ id, ok: true, result });
      } else if (action === 'strip') {
        const mutedBuffer = stripAudioFromBufferInPlace(buffer);
        (self as any).postMessage({ id, ok: true, buffer: mutedBuffer }, [mutedBuffer]);
      }
    } catch (err: any) {
      (self as any).postMessage({ id, ok: false, error: err?.message || String(err) });
    }
  };
}
