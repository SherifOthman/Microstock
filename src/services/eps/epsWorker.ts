/// <reference lib="webworker" />
import { rasterizeEpsBufferDirect } from './epsWorkerCore';

export interface EpsWorkerMessageData {
  id: string;
  type: 'rasterize';
  buffer: ArrayBuffer;
  filename: string;
  maxDim?: number;
  quality?: number;
}

self.onmessage = async (e: MessageEvent<EpsWorkerMessageData>) => {
  const { id, type, buffer, filename, maxDim, quality } = e.data || {};
  if (type !== 'rasterize') return;

  try {
    const renderRes = await rasterizeEpsBufferDirect(buffer, filename, maxDim, quality);
    
    // Canvas itself cannot be cloned or transferred across worker boundaries.
    // Transfer dataUrl, blob, dimensions, sourceTier, boundingBox, pathOpCount.
    self.postMessage({
      id,
      success: true,
      result: {
        width: renderRes.width,
        height: renderRes.height,
        dataUrl: renderRes.dataUrl,
        blob: renderRes.blob,
        sourceTier: renderRes.sourceTier,
        boundingBox: renderRes.boundingBox,
        pathOpCount: renderRes.pathOpCount,
      },
    });
  } catch (err: any) {
    self.postMessage({
      id,
      success: false,
      error: err?.message || 'EPS vector rasterization failed in Web Worker',
    });
  }
};
