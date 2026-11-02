import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  inspectVideoAudioTrack,
  stripAudioTrackLossless,
  saveMutedVideosToDirectory,
  VideoInspectionResult,
} from '../../src/services/video/videoMuterEngine';

// Helper to build ISOBMFF box binary
function makeBox(type: string, payload: Uint8Array): Uint8Array {
  const size = 8 + payload.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, size);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(payload, 8);
  return out;
}

function concatBuffers(...bufs: Uint8Array[]): Uint8Array {
  const total = bufs.reduce((acc, b) => acc + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of bufs) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
}

describe('Forensic Video Audio Track Inspection & Lossless Muter (videoMuterEngine.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('ISOBMFF Box Parsing & Audio Sample Detection', () => {
    it('detects genuine audio track when soun hdlr has stsz with sampleCount > 0', async () => {
      // 1. stsz box: 4 bytes version/flags, 4 bytes sample_size, 4 bytes sample_count (5)
      const stszPayload = new Uint8Array(12);
      const stszView = new DataView(stszPayload.buffer);
      stszView.setUint32(8, 5); // sampleCount = 5
      const stszBox = makeBox('stsz', stszPayload);

      // 2. stbl box containing stsz
      const stblBox = makeBox('stbl', stszBox);

      // 3. minf box containing stbl
      const minfBox = makeBox('minf', stblBox);

      // 4. hdlr box with component subtype 'soun' (at offset 8 in payload)
      const hdlrPayload = new Uint8Array(16);
      hdlrPayload[8] = 's'.charCodeAt(0);
      hdlrPayload[9] = 'o'.charCodeAt(0);
      hdlrPayload[10] = 'u'.charCodeAt(0);
      hdlrPayload[11] = 'n'.charCodeAt(0);
      const hdlrBox = makeBox('hdlr', hdlrPayload);

      // 5. tkhd box with enabled flag (flag & 0x01 = 1) and duration = 100
      const tkhdPayload = new Uint8Array(32);
      tkhdPayload[3] = 1; // flags: enabled
      const tkhdView = new DataView(tkhdPayload.buffer);
      tkhdView.setUint32(20, 100); // duration = 100
      const tkhdBox = makeBox('tkhd', tkhdPayload);

      // 6. mdhd box with duration = 100
      const mdhdPayload = new Uint8Array(24);
      const mdhdView = new DataView(mdhdPayload.buffer);
      mdhdView.setUint32(16, 100);
      const mdhdBox = makeBox('mdhd', mdhdPayload);

      // 7. mdia box containing mdhd, hdlr, minf
      const mdiaBox = makeBox('mdia', concatBuffers(mdhdBox, hdlrBox, minfBox));

      // 8. trak box containing tkhd and mdia
      const audioTrak = makeBox('trak', concatBuffers(tkhdBox, mdiaBox));

      // 9. moov box containing audio trak
      const moovBox = makeBox('moov', audioTrak);

      // 10. ftyp box
      const ftypBox = makeBox('ftyp', new Uint8Array([0x69, 0x73, 0x6f, 0x6d]));

      const fullFileBytes = concatBuffers(ftypBox, moovBox);
      const testFile = new File([fullFileBytes], 'audio_video.mp4', { type: 'video/mp4' });

      const result = await inspectVideoAudioTrack(testFile);
      expect(result.hasAudio).toBe(true);
      expect(result.audioTrackCount).toBe(1);
    });

    it('rejects dummy/silent audio track when stsz sampleCount is 0 (AI video false positive protection)', async () => {
      // Dummy audio track with sampleCount = 0
      const stszPayload = new Uint8Array(12);
      const stszView = new DataView(stszPayload.buffer);
      stszView.setUint32(8, 0); // sampleCount = 0!
      const stszBox = makeBox('stsz', stszPayload);

      const stblBox = makeBox('stbl', stszBox);
      const minfBox = makeBox('minf', stblBox);

      const hdlrPayload = new Uint8Array(16);
      hdlrPayload[8] = 's'.charCodeAt(0);
      hdlrPayload[9] = 'o'.charCodeAt(0);
      hdlrPayload[10] = 'u'.charCodeAt(0);
      hdlrPayload[11] = 'n'.charCodeAt(0);
      const hdlrBox = makeBox('hdlr', hdlrPayload);

      const tkhdPayload = new Uint8Array(32);
      tkhdPayload[3] = 1;
      const tkhdView = new DataView(tkhdPayload.buffer);
      tkhdView.setUint32(20, 100);
      const tkhdBox = makeBox('tkhd', tkhdPayload);

      const mdhdPayload = new Uint8Array(24);
      const mdhdView = new DataView(mdhdPayload.buffer);
      mdhdView.setUint32(16, 100);
      const mdhdBox = makeBox('mdhd', mdhdPayload);

      const mdiaBox = makeBox('mdia', concatBuffers(mdhdBox, hdlrBox, minfBox));
      const dummyAudioTrak = makeBox('trak', concatBuffers(tkhdBox, mdiaBox));
      const moovBox = makeBox('moov', dummyAudioTrak);
      const ftypBox = makeBox('ftyp', new Uint8Array([0x69, 0x73, 0x6f, 0x6d]));

      const fullFileBytes = concatBuffers(ftypBox, moovBox);
      const testFile = new File([fullFileBytes], 'ai_dummy_audio.mp4', { type: 'video/mp4' });

      const result = await inspectVideoAudioTrack(testFile);
      expect(result.hasAudio).toBe(false);
      expect(result.audioTrackCount).toBe(0);
    });
  });

  describe('stripAudioTrackLossless()', () => {
    it('losslessly mutates audio trak box header into a free atom in-place', async () => {
      // Build a minimal moov with an audio trak
      const hdlrPayload = new Uint8Array(16);
      hdlrPayload[8] = 's'.charCodeAt(0);
      hdlrPayload[9] = 'o'.charCodeAt(0);
      hdlrPayload[10] = 'u'.charCodeAt(0);
      hdlrPayload[11] = 'n'.charCodeAt(0);
      const hdlrBox = makeBox('hdlr', hdlrPayload);
      const mdiaBox = makeBox('mdia', hdlrBox);
      const audioTrak = makeBox('trak', mdiaBox);
      const moovBox = makeBox('moov', audioTrak);
      const ftypBox = makeBox('ftyp', new Uint8Array([0x69, 0x73, 0x6f, 0x6d]));

      const originalBytes = concatBuffers(ftypBox, moovBox);
      const originalFile = new File([originalBytes], 'clip_with_sound.mp4', { type: 'video/mp4' });

      const mutedBlob = await stripAudioTrackLossless(originalFile);
      expect(mutedBlob.size).toBe(originalFile.size); // Size remains identical!

      const mutedBuffer = await mutedBlob.arrayBuffer();
      const mutedBytes = new Uint8Array(mutedBuffer);

      // Audio trak offset in moov should now read 'free' instead of 'trak'
      // ftypBox length = 12
      // moovBox header = 8
      // audioTrak header offset = 12 + 8 = 20
      const atomTag = String.fromCharCode(
        mutedBytes[24],
        mutedBytes[25],
        mutedBytes[26],
        mutedBytes[27]
      );
      expect(atomTag).toBe('free');
    });

    it('throws when moov atom is completely absent from file', async () => {
      const corruptFile = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'corrupt.mp4', {
        type: 'video/mp4',
      });
      await expect(stripAudioTrackLossless(corruptFile)).rejects.toThrow('Unable to locate moov atom');
    });
  });

  describe('100% Guaranteed Export Rule (saveMutedVideosToDirectory)', () => {
    it('throws if items array is empty', async () => {
      await expect(saveMutedVideosToDirectory([])).rejects.toThrow('No videos to save');
    });

    it('preserves 100% of video items (mutedBlob, original file, or error) under exact original names', async () => {
      // Mock window.electronAPI
      (global as any).window = {
        electronAPI: {
          saveFiles: vi.fn().mockResolvedValue({
            success: true,
            savedCount: 3,
          }),
        },
      };

      const mockItems: VideoInspectionResult[] = [
        {
          id: '1',
          file: new File(['original_1'], 'drone_flight.mp4'),
          originalName: 'drone_flight.mp4',
          size: 100,
          hasAudio: true,
          audioTrackCount: 1,
          videoTrackCount: 1,
          status: 'muted',
          mutedBlob: new Blob(['muted_data']),
        },
        {
          id: '2',
          file: new File(['original_2'], 'silent_timelapse.mp4'),
          originalName: 'silent_timelapse.mp4',
          size: 200,
          hasAudio: false,
          audioTrackCount: 0,
          videoTrackCount: 1,
          status: 'already_silent',
        },
        {
          id: '3',
          file: new File(['original_3'], 'error_clip.mp4'),
          originalName: 'error_clip.mp4',
          size: 300,
          hasAudio: true,
          audioTrackCount: 1,
          videoTrackCount: 1,
          status: 'error',
          errorMessage: 'Corrupt box',
        },
      ];

      const res = await saveMutedVideosToDirectory(mockItems, '_Muted_Videos');
      expect(res.success).toBe(true);
      expect(res.savedCount).toBe(3);

      const [preparedFiles, folderName] = (window as any).electronAPI.saveFiles.mock.calls[0];
      expect(folderName).toBe('_Muted_Videos');
      expect(preparedFiles).toHaveLength(3);
      expect(preparedFiles[0].name).toBe('drone_flight.mp4');
      expect(preparedFiles[1].name).toBe('silent_timelapse.mp4');
      expect(preparedFiles[2].name).toBe('error_clip.mp4');
    });
  });
});
