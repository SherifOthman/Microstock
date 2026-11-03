import { saveFilesToLocalDirectory, FileToSave } from '../desktop/desktopFs';
import { inspectMoovBytes, stripAudioFromBufferInPlace } from '../../utils/videoBoxParser';

export interface VideoInspectionResult {
  id: string;
  file: File;
  originalName: string;
  outputName?: string;
  size: number;
  hasAudio: boolean;
  audioTrackCount: number;
  videoTrackCount: number;
  status: 'idle' | 'analyzing' | 'ready' | 'muting' | 'muted' | 'already_silent' | 'error';
  errorMessage?: string;
  mutedBlob?: Blob;
  durationSeconds?: number;
  resolution?: string;
  thumbnailUrl?: string;
}

interface Box {
  type: string;
  offset: number;
  size: number;
  headerLen: number;
}

function parseBoxes(data: Uint8Array, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = start;

  while (pos + 8 <= end) {
    const rawSize = view.getUint32(pos);
    const btype = String.fromCharCode(
      data[pos + 4],
      data[pos + 5],
      data[pos + 6],
      data[pos + 7]
    );

    let actualSize = rawSize;
    let headerLen = 8;

    if (rawSize === 1 && pos + 16 <= end) {
      // 64-bit large box size
      const high = BigInt(view.getUint32(pos + 8));
      const low = BigInt(view.getUint32(pos + 12));
      actualSize = Number((high << 32n) | low);
      headerLen = 16;
    } else if (rawSize === 0) {
      // Box extends to end of file
      actualSize = end - pos;
    }

    if (actualSize <= 0 || pos + actualSize > end) {
      // Corrupt or truncated box boundary
      break;
    }

    boxes.push({ type: btype, offset: pos, size: actualSize, headerLen });
    pos += actualSize;
  }

  return boxes;
}

// Web Worker Pool for off-main-thread MP4/MOV atom parsing & lossless stripping
const VIDEO_WORKER_POOL_SIZE = 2;
let videoWorkers: Worker[] = [];
let videoWorkerIdx = 0;
let videoJobId = 1;
const videoPendingJobs = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

function getNextVideoWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  // In Vitest / JSDOM, Worker may not be a real browser worker
  if ((globalThis as any).__vitest_worker__ || (typeof process !== 'undefined' && process.env?.VITEST)) {
    return null;
  }
  if (videoWorkers.length === 0) {
    try {
      for (let i = 0; i < VIDEO_WORKER_POOL_SIZE; i++) {
        const w = new Worker(new URL('../../workers/videoMuter.worker.ts', import.meta.url), {
          type: 'module',
        });
        w.onmessage = (e) => {
          const { id, ok, result, buffer, error } = e.data || {};
          const job = videoPendingJobs.get(id);
          if (job) {
            videoPendingJobs.delete(id);
            if (ok) {
              job.resolve(buffer ?? result);
            } else {
              job.reject(new Error(error || 'Video worker failed'));
            }
          }
        };
        videoWorkers.push(w);
      }
    } catch {
      videoWorkers = [];
      return null;
    }
  }
  const worker = videoWorkers[videoWorkerIdx % videoWorkers.length];
  videoWorkerIdx = (videoWorkerIdx + 1) % videoWorkers.length;
  return worker;
}

async function runInspectInWorker(buffer: ArrayBuffer): Promise<{
  foundMoov: boolean;
  hasAudio: boolean;
  audioTrackCount: number;
  videoTrackCount: number;
}> {
  const worker = getNextVideoWorker();
  if (worker) {
    try {
      return await new Promise((resolve, reject) => {
        const id = videoJobId++;
        const timer = setTimeout(() => {
          if (videoPendingJobs.has(id)) {
            videoPendingJobs.delete(id);
            reject(new Error('Worker inspect timeout'));
          }
        }, 3000);
        videoPendingJobs.set(id, {
          resolve: (res) => {
            clearTimeout(timer);
            resolve(res);
          },
          reject: (err) => {
            clearTimeout(timer);
            reject(err);
          },
        });
        worker.postMessage({ id, action: 'inspect', buffer }, [buffer]);
      });
    } catch {
      // Fallback below
    }
  }
  return inspectMoovBytes(new Uint8Array(buffer));
}

/**
 * Fast binary inspection of MP4/MOV container to detect presence of audio and video tracks
 * Uses direct MP4 atom parsing for accurate audio track detection
 */
export async function inspectVideoAudioTrack(file: File): Promise<{
  hasAudio: boolean;
  audioTrackCount: number;
  videoTrackCount: number;
  durationSeconds?: number;
  isCorrupt?: boolean;
  error?: string;
}> {
  if (!file || file.size === 0) {
    return {
      hasAudio: false,
      audioTrackCount: 0,
      videoTrackCount: 0,
      durationSeconds: 0,
      isCorrupt: true,
      error: `Video file "${file?.name || 'unknown'}" is empty (0 bytes)`,
    };
  }
  // 1. Native Desktop ffprobe Bridge (Electron / Tauri / Node)
  if (typeof window !== 'undefined') {
    const desktopApi = (window as any).electronAPI || (window as any).__TAURI__;
    if (desktopApi?.probeAudio) {
      try {
        const nativeResult = await desktopApi.probeAudio(file);
        if (nativeResult && typeof nativeResult.hasAudio === 'boolean') {
          return nativeResult;
        }
      } catch (err) {
        console.warn('[VideoAudio] Native probeAudio fallback to ISOBMFF parser:', err);
      }
    }
  }

  // 2. Strict ISOBMFF Box Parser (Offloaded to Web Worker Pool)
  try {
    // Read the first 16MB which typically contains the moov atom (faststart) or full file if < 16MB
    const readSize = Math.min(file.size, 16 * 1024 * 1024);
    const headBuffer = await file.slice(0, readSize).arrayBuffer();
    const headInspect = await runInspectInWorker(headBuffer);

    if (headInspect.foundMoov) {
      return {
        hasAudio: headInspect.hasAudio,
        audioTrackCount: headInspect.audioTrackCount,
        videoTrackCount: headInspect.videoTrackCount,
      };
    }

    // If moov is at the end of file (common in some camera recordings), read the last 16MB
    if (file.size > 16 * 1024 * 1024) {
      const tailStart = Math.max(0, file.size - 16 * 1024 * 1024);
      const tailBuf = await file.slice(tailStart, file.size).arrayBuffer();
      const tailData = new Uint8Array(tailBuf);
      const tailBoxes = parseBoxes(tailData, 0, tailData.length);
      const tailMoov = tailBoxes.find((b) => b.type === 'moov');

      if (tailMoov) {
        const exactMoovBuf = await file
          .slice(tailStart + tailMoov.offset, tailStart + tailMoov.offset + tailMoov.size)
          .arrayBuffer();
        const tailInspect = await runInspectInWorker(exactMoovBuf);
        if (tailInspect.foundMoov) {
          return {
            hasAudio: tailInspect.hasAudio,
            audioTrackCount: tailInspect.audioTrackCount,
            videoTrackCount: tailInspect.videoTrackCount,
          };
        }
      }
    }
  } catch {
    // Binary MP4 inspection fallback
  }

  // Fallback: Use HTML5 video element audio check wrapped in a 3000ms safety timeout
  return new Promise((resolve) => {
    let resolved = false;
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    video.src = url;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        URL.revokeObjectURL(url);
        video.onloadedmetadata = null;
        video.onerror = null;
      }
    };

    video.onloadedmetadata = () => {
      cleanup();
      const audioTracks = (video as any).audioTracks;
      const hasAudio =
        audioTracks !== undefined
          ? audioTracks.length > 0
          : (video as any).mozHasAudio !== undefined
          ? (video as any).mozHasAudio
          : (video as any).webkitAudioDecodedByteCount > 0;

      resolve({
        hasAudio: Boolean(hasAudio),
        audioTrackCount: hasAudio ? 1 : 0,
        videoTrackCount: 1,
        durationSeconds: Math.round(video.duration || 0),
      });
    };

    video.onerror = () => {
      cleanup();
      resolve({ hasAudio: false, audioTrackCount: 0, videoTrackCount: 1 });
    };

    setTimeout(() => {
      if (!resolved) {
        cleanup();
        resolve({ hasAudio: false, audioTrackCount: 0, videoTrackCount: 1 });
      }
    }, 3000);
  });
}

/**
 * Losslessly removes audio tracks from an MP4/MOV file in milliseconds without re-encoding.
 * Offloads binary mutation to a Web Worker using zero-copy Transferable ArrayBuffers.
 */
export async function stripAudioTrackLossless(file: File): Promise<Blob> {
  if (!file || file.size === 0) {
    throw new Error(`Cannot mute 0-byte video file "${file?.name || 'unknown'}"`);
  }
  const buffer = await file.arrayBuffer();
  const worker = getNextVideoWorker();

  if (worker) {
    try {
      const mutedBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const id = videoJobId++;
        videoPendingJobs.set(id, { resolve, reject });
        worker.postMessage({ id, action: 'strip', buffer }, [buffer]);
      });
      return new Blob([mutedBuffer], { type: file.type || 'video/mp4' });
    } catch (err) {
      throw err;
    }
  }

  const mutedBuffer = stripAudioFromBufferInPlace(buffer);
  return new Blob([mutedBuffer], { type: file.type || 'video/mp4' });
}

/**
 * Saves muted videos directly to a folder via Native Desktop File System (or File System Access API)
 * 
 * STRICT RULE: Guarantees 100% of files processed are saved to the output directory:
 * - already_silent: saved using original file (no audio to remove)
 * - muted: saved using processed mutedBlob (audio was stripped)
 * - ready/idle/error: saved using original file so ZERO files are dropped
 */
export async function saveMutedVideosToDirectory(
  items: VideoInspectionResult[],
  folderName = '_Muted_Videos',
  onProgress?: (done: number, total: number) => void
): Promise<{ success: boolean; savedCount: number; error?: string; canceled?: boolean }> {
  if (items.length === 0) {
    throw new Error('No videos to save. Please add videos first.');
  }

  // 100% Guaranteed Export: Every single video in the batch is preserved
  // STRICT RULE: Filename goes in as filename.ext and is saved as exactly filename.ext (zero renaming / suffixes)
  const filesToSave: FileToSave[] = items.map((item) => {
    const filename = item.originalName.trim();
    if (item.mutedBlob) {
      return {
        name: filename,
        data: item.mutedBlob,
      };
    } else {
      if (item.status === 'error') {
        console.warn(`[VideoMuter] Video "${item.originalName}" had processing error: ${item.errorMessage || 'unknown'}. Preserving original file under 100% export rule.`);
      }
      return {
        name: filename,
        data: item.file,
      };
    }
  });

  const res = await saveFilesToLocalDirectory(filesToSave, {
    folderName,
    onProgress: (done, total) => onProgress?.(done, total),
  });

  return {
    success: res.success,
    savedCount: res.savedCount,
    error: res.error,
    canceled: res.canceled,
  };
}
