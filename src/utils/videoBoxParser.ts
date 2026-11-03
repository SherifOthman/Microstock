/**
 * Lossless ISOBMFF MP4/MOV Audio Track Inspector & Atom Stripper (Pure Utility)
 * Runs binary box traversal and 'trak' -> 'free' atom mutation.
 * Environment-agnostic: Runs in Node, Web Worker, or Browser Main Thread.
 */

export interface Box {
  type: string;
  offset: number;
  size: number;
  headerLen: number;
}

export function parseIsoBoxes(data: Uint8Array, start: number, end: number): Box[] {
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
      const high = BigInt(view.getUint32(pos + 8));
      const low = BigInt(view.getUint32(pos + 12));
      actualSize = Number((high << 32n) | low);
      headerLen = 16;
    } else if (rawSize === 0) {
      actualSize = end - pos;
    }

    if (actualSize <= 0 || pos + actualSize > end) {
      break;
    }

    boxes.push({ type: btype, offset: pos, size: actualSize, headerLen });
    pos += actualSize;
  }

  return boxes;
}

export function inspectMoovBytes(data: Uint8Array): {
  foundMoov: boolean;
  hasAudio: boolean;
  audioTrackCount: number;
  videoTrackCount: number;
} {
  const topBoxes = parseIsoBoxes(data, 0, data.length);
  const moov = topBoxes.find((b) => b.type === 'moov');
  if (!moov) {
    return { foundMoov: false, hasAudio: false, audioTrackCount: 0, videoTrackCount: 0 };
  }

  const moovBoxes = parseIsoBoxes(data, moov.offset + moov.headerLen, moov.offset + moov.size);
  let audioTracks = 0;
  let videoTracks = 0;

  for (const b of moovBoxes) {
    if (b.type === 'trak') {
      const trakBoxes = parseIsoBoxes(data, b.offset + b.headerLen, b.offset + b.size);

      let trackEnabled = true;
      let trackDuration = 1;
      const tkhd = trakBoxes.find((x) => x.type === 'tkhd');
      if (tkhd && tkhd.offset + tkhd.headerLen + 24 <= data.length) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const version = data[tkhd.offset + tkhd.headerLen];
        const flags =
          (data[tkhd.offset + tkhd.headerLen + 1] << 16) |
          (data[tkhd.offset + tkhd.headerLen + 2] << 8) |
          data[tkhd.offset + tkhd.headerLen + 3];
        trackEnabled = (flags & 0x01) !== 0;

        if (version === 0 && tkhd.offset + tkhd.headerLen + 24 <= data.length) {
          trackDuration = view.getUint32(tkhd.offset + tkhd.headerLen + 20);
        } else if (version === 1 && tkhd.offset + tkhd.headerLen + 32 <= data.length) {
          const high = view.getUint32(tkhd.offset + tkhd.headerLen + 24);
          const low = view.getUint32(tkhd.offset + tkhd.headerLen + 28);
          trackDuration = high > 0 ? high : low;
        }
      }

      const mdia = trakBoxes.find((x) => x.type === 'mdia');
      if (mdia) {
        const mdiaBoxes = parseIsoBoxes(data, mdia.offset + mdia.headerLen, mdia.offset + mdia.size);

        let mediaDuration = 1;
        const mdhd = mdiaBoxes.find((x) => x.type === 'mdhd');
        if (mdhd && mdhd.offset + mdhd.headerLen + 20 <= data.length) {
          const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
          const version = data[mdhd.offset + mdhd.headerLen];
          if (version === 0) {
            mediaDuration = view.getUint32(mdhd.offset + mdhd.headerLen + 16);
          } else if (version === 1 && mdhd.offset + mdhd.headerLen + 28 <= data.length) {
            const high = view.getUint32(mdhd.offset + mdhd.headerLen + 20);
            const low = view.getUint32(mdhd.offset + mdhd.headerLen + 24);
            mediaDuration = high > 0 ? high : low;
          }
        }

        const hdlr = mdiaBoxes.find((x) => x.type === 'hdlr');
        if (hdlr && hdlr.offset + hdlr.headerLen + 12 <= data.length) {
          const htype = String.fromCharCode(
            data[hdlr.offset + hdlr.headerLen + 8],
            data[hdlr.offset + hdlr.headerLen + 9],
            data[hdlr.offset + hdlr.headerLen + 10],
            data[hdlr.offset + hdlr.headerLen + 11]
          );

          if (htype === 'soun') {
            let hasRealSamples = false;

            if (trackEnabled && trackDuration > 0 && mediaDuration > 0) {
              const minf = mdiaBoxes.find((x) => x.type === 'minf');
              if (minf) {
                const minfBoxes = parseIsoBoxes(data, minf.offset + minf.headerLen, minf.offset + minf.size);
                const stbl = minfBoxes.find((x) => x.type === 'stbl');
                if (stbl) {
                  const stblBoxes = parseIsoBoxes(data, stbl.offset + stbl.headerLen, stbl.offset + stbl.size);
                  const stsz = stblBoxes.find((x) => x.type === 'stsz');
                  if (stsz && stsz.offset + stsz.headerLen + 12 <= data.length) {
                    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
                    const sampleCount = view.getUint32(stsz.offset + stsz.headerLen + 8);
                    if (sampleCount > 0) hasRealSamples = true;
                  } else {
                    const stts = stblBoxes.find((x) => x.type === 'stts');
                    if (stts && stts.offset + stts.headerLen + 8 <= data.length) {
                      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
                      const entryCount = view.getUint32(stts.offset + stts.headerLen + 4);
                      if (entryCount > 0) hasRealSamples = true;
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
    foundMoov: true,
    hasAudio: audioTracks > 0,
    audioTrackCount: audioTracks,
    videoTrackCount: videoTracks,
  };
}

export function stripAudioFromBufferInPlace(buffer: ArrayBuffer): ArrayBuffer {
  const data = new Uint8Array(buffer);
  const topBoxes = parseIsoBoxes(data, 0, data.length);
  const moov = topBoxes.find((b) => b.type === 'moov');

  if (!moov) {
    throw new Error('Unable to locate moov atom in MP4/MOV container. File may be fragmented or non-standard.');
  }

  const moovBoxes = parseIsoBoxes(data, moov.offset + moov.headerLen, moov.offset + moov.size);

  for (const b of moovBoxes) {
    if (b.type === 'trak') {
      const trakBoxes = parseIsoBoxes(data, b.offset + b.headerLen, b.offset + b.size);
      const mdia = trakBoxes.find((x) => x.type === 'mdia');
      if (mdia) {
        const mdiaBoxes = parseIsoBoxes(data, mdia.offset + mdia.headerLen, mdia.offset + mdia.size);
        const hdlr = mdiaBoxes.find((x) => x.type === 'hdlr');
        if (hdlr && hdlr.offset + hdlr.headerLen + 12 <= data.length) {
          const htype = String.fromCharCode(
            data[hdlr.offset + hdlr.headerLen + 8],
            data[hdlr.offset + hdlr.headerLen + 9],
            data[hdlr.offset + hdlr.headerLen + 10],
            data[hdlr.offset + hdlr.headerLen + 11]
          );

          if (htype === 'soun') {
            data[b.offset + 4] = 0x66; // 'f'
            data[b.offset + 5] = 0x72; // 'r'
            data[b.offset + 6] = 0x65; // 'e'
            data[b.offset + 7] = 0x65; // 'e'
          }
        }
      }
    }
  }

  return buffer;
}
