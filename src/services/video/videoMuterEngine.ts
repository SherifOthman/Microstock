import JSZip from 'jszip';
import fileSaver from 'file-saver';
import { cleanRawFilename } from '../cleaner/fileCleanerEngine';
const saveAs = (fileSaver as any).saveAs || fileSaver;

export interface VideoInspectionResult {
  id: string;
  file: File;
  originalName: string;
  outputName: string;
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

/**
 * Fast binary inspection of MP4/MOV container to detect presence of audio and video tracks
 * Uses direct MP4 atom parsing for accurate audio track detection
 */
export async function inspectVideoAudioTrack(file: File): Promise<{
  hasAudio: boolean;
  audioTrackCount: number;
  videoTrackCount: number;
  durationSeconds?: number;
}> {
  try {
    // Read the first 16MB which typically contains the moov atom (faststart) or full file if < 16MB
    const readSize = Math.min(file.size, 16 * 1024 * 1024);
    const buffer = await file.slice(0, readSize).arrayBuffer();
    let data = new Uint8Array(buffer);

    const topBoxes = parseBoxes(data, 0, data.length);
    let moov = topBoxes.find((b) => b.type === 'moov');

    // If moov is at the end of file (common in some camera recordings), read the last 16MB
    if (!moov && file.size > 16 * 1024 * 1024) {
      const tailStart = Math.max(0, file.size - 16 * 1024 * 1024);
      const tailBuf = await file.slice(tailStart, file.size).arrayBuffer();
      const tailData = new Uint8Array(tailBuf);
      const tailBoxes = parseBoxes(tailData, 0, tailData.length);
      const tailMoov = tailBoxes.find((b) => b.type === 'moov');

      if (tailMoov) {
        // Read full moov exactly
        const exactMoovBuf = await file
          .slice(tailStart + tailMoov.offset, tailStart + tailMoov.offset + tailMoov.size)
          .arrayBuffer();
        data = new Uint8Array(exactMoovBuf);
        moov = { type: 'moov', offset: 0, size: data.length, headerLen: tailMoov.headerLen };
      }
    }

    if (moov) {
      const moovBoxes = parseBoxes(data, moov.offset + moov.headerLen, moov.offset + moov.size);
      let audioTracks = 0;
      let videoTracks = 0;

      for (const b of moovBoxes) {
        if (b.type === 'trak') {
          const trakBoxes = parseBoxes(data, b.offset + b.headerLen, b.offset + b.size);
          const mdia = trakBoxes.find((x) => x.type === 'mdia');
          if (mdia) {
            const mdiaBoxes = parseBoxes(data, mdia.offset + mdia.headerLen, mdia.offset + mdia.size);
            const hdlr = mdiaBoxes.find((x) => x.type === 'hdlr');
            if (hdlr && hdlr.offset + hdlr.headerLen + 12 <= data.length) {
              const htype = String.fromCharCode(
                data[hdlr.offset + hdlr.headerLen + 8],
                data[hdlr.offset + hdlr.headerLen + 9],
                data[hdlr.offset + hdlr.headerLen + 10],
                data[hdlr.offset + hdlr.headerLen + 11]
              );

              if (htype === 'soun') {
                // Verify that the audio track actually has real audio samples (not an empty dummy track with 0 samples)
                let hasRealSamples = true;
                const minf = mdiaBoxes.find((x) => x.type === 'minf');
                if (minf) {
                  const minfBoxes = parseBoxes(data, minf.offset + minf.headerLen, minf.offset + minf.size);
                  const stbl = minfBoxes.find((x) => x.type === 'stbl');
                  if (stbl) {
                    const stblBoxes = parseBoxes(data, stbl.offset + stbl.headerLen, stbl.offset + stbl.size);
                    const stsz = stblBoxes.find((x) => x.type === 'stsz');
                    if (stsz && stsz.offset + stsz.headerLen + 12 <= data.length) {
                      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
                      const sampleCount = view.getUint32(stsz.offset + stsz.headerLen + 8);
                      if (sampleCount === 0) {
                        hasRealSamples = false;
                      }
                    } else {
                      const stts = stblBoxes.find((x) => x.type === 'stts');
                      if (stts && stts.offset + stts.headerLen + 8 <= data.length) {
                        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
                        const entryCount = view.getUint32(stts.offset + stts.headerLen + 4);
                        if (entryCount === 0) {
                          hasRealSamples = false;
                        }
                      }
                    }
                  }
                }

                if (hasRealSamples) {
                  audioTracks++;
                }
              } else if (htype === 'vide') {
                videoTracks++;
              }
            }
          }
        }
      }

      return {
        hasAudio: audioTracks > 0,
        audioTrackCount: audioTracks,
        videoTrackCount: videoTracks,
      };
    }
  } catch (err) {
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
 * Losslessly removes audio tracks from an MP4/MOV file in milliseconds without re-encoding
 */
export async function stripAudioTrackLossless(file: File): Promise<Blob> {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);

  const topBoxes = parseBoxes(data, 0, data.length);
  const moov = topBoxes.find((b) => b.type === 'moov');

  if (!moov) {
    throw new Error('Unable to locate moov atom in MP4/MOV container. File may be fragmented or non-standard.');
  }

  const moovBoxes = parseBoxes(data, moov.offset + moov.headerLen, moov.offset + moov.size);
  let audioTracksMuted = 0;

  for (const b of moovBoxes) {
    if (b.type === 'trak') {
      const trakBoxes = parseBoxes(data, b.offset + b.headerLen, b.offset + b.size);
      const mdia = trakBoxes.find((x) => x.type === 'mdia');
      if (mdia) {
        const mdiaBoxes = parseBoxes(data, mdia.offset + mdia.headerLen, mdia.offset + mdia.size);
        const hdlr = mdiaBoxes.find((x) => x.type === 'hdlr');
        if (hdlr && hdlr.offset + hdlr.headerLen + 12 <= data.length) {
          const htype = String.fromCharCode(
            data[hdlr.offset + hdlr.headerLen + 8],
            data[hdlr.offset + hdlr.headerLen + 9],
            data[hdlr.offset + hdlr.headerLen + 10],
            data[hdlr.offset + hdlr.headerLen + 11]
          );

          if (htype === 'soun') {
            // Replace 'trak' with 'free' atom in-place
            // Standard ISOBMFF specification: FreeSpaceBox ('free') is ignored by all decoders
            // and chunk offsets (stco/co64) for the video track remain 100% mathematically exact!
            data[b.offset + 4] = 0x66; // 'f'
            data[b.offset + 5] = 0x72; // 'r'
            data[b.offset + 6] = 0x65; // 'e'
            data[b.offset + 7] = 0x65; // 'e'
            audioTracksMuted++;
          }
        }
      }
    }
  }

  return new Blob([data], { type: file.type || 'video/mp4' });
}

/**
 * Saves muted videos directly to a folder via File System Access API
 * INCLUDES ALL VIDEOS: already-silent ones use original file, muted ones use processed blob
 */
export async function saveMutedVideosToDirectory(
  items: VideoInspectionResult[],
  folderName = '_Muted_Videos',
  onProgress?: (done: number, total: number) => void
): Promise<{ success: boolean; savedCount: number; error?: string }> {
  try {
    if (!('showDirectoryPicker' in window)) {
      throw new Error('File System Access API not supported in this browser. Please use ZIP download.');
    }

    // Include ALL videos that were uploaded (don't filter out any)
    // - already_silent: use original file (no audio to remove)
    // - muted: use mutedBlob (audio was stripped)
    // - ready/error: use original file (user wants them anyway for stock upload)
    if (items.length === 0) {
      throw new Error('No videos to save. Please add videos first.');
    }

    const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    const targetDir = folderName ? await dirHandle.getDirectoryHandle(folderName, { create: true }) : dirHandle;

    let saved = 0;
    for (const item of items) {
      const blob = item.mutedBlob || item.file;
      const filename = item.outputName.trim();
      const fileHandle = await targetDir.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      saved++;
      onProgress?.(saved, items.length);
    }

    return { success: true, savedCount: saved };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, savedCount: 0, error: 'User cancelled folder selection.' };
    }
    return { success: false, savedCount: 0, error: err.message || 'Failed to save videos.' };
  }
}

/**
 * Downloads muted videos as a single .ZIP archive
 * INCLUDES ALL VIDEOS: already-silent ones use original file, muted ones use processed blob
 */
export async function downloadMutedVideosAsZip(
  items: VideoInspectionResult[],
  zipFilename = 'Muted_Microstock_Videos.zip',
  onProgress?: (percent: number) => void
): Promise<void> {
  const zip = new JSZip();

  // Include ALL videos that were uploaded (don't filter out any)
  // - already_silent: use original file (no audio to remove)
  // - muted: use mutedBlob (audio was stripped)
  // - ready/error: use original file (user wants them in the ZIP anyway for stock upload)
  for (const item of items) {
    const blob = item.mutedBlob || item.file;
    zip.file(item.outputName, blob);
  }

  if (items.length === 0) {
    throw new Error('No videos to export. Please add videos first.');
  }

  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'STORE', // Videos are already compressed; STORE is ultra-fast
    },
    (metadata) => {
      onProgress?.(Math.round(metadata.percent));
    }
  );

  saveAs(zipBlob, zipFilename);
}
