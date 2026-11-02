# 02 - Core Pipelines & Media Engines

## 1. 6-Way Media Segregation Engine (`fileCleanerEngine.ts`)

The File Cleaner engine segregates incoming raw batches into a media-first hierarchy with hybrid sequential filenames, guaranteeing zero naming collisions across formats.

### Target Directory Structure
Incoming batches are parsed and placed into isolated target tracks:
1. `Photos/` (`B01_PH_001_title.jpg`) - Standard photography.
2. `AI_Photos/` (`B01_AI_PH_001_title.jpg`) - Generative AI imagery.
3. `Videos/` (`B01_VD_001_title.mp4`) - Standard video footage.
4. `AI_Videos/` (`B01_AI_VD_001_title.mp4`) - Generative AI video footage.
5. `Vectors/` (`B01_VC_001_title.eps`) - Native vector illustrations.
6. `AI_Vectors/` (`B01_AI_VC_001_title.eps`) - AI-assisted vector artwork.
7. `_Needs_Fixing/` - Quarantined files failing minimum stock resolution requirements (e.g., images < 4MP, videos < 720p).

### Companion Vector File Binding
Microstock agencies mandate that EPS vectors must be submitted alongside a companion raster JPG carrying the exact same base name.
- The engine groups companion `.eps` and `.jpg` pairs during ingestion.
- The raster companion `.jpg` strictly inherits the **exact same sequential index** as its parent `.eps` file (e.g., `B01_VC_004_floral_pattern.eps` and `B01_VC_004_floral_pattern.jpg`), preventing sequence desynchronization.

---

## 2. Forensic Lossless Video Muter Engine (`videoMuterEngine.ts`)

Stock footage platforms (Adobe Stock, Shutterstock, Pond5) reject video submissions containing ambient camera noise, background chatter, or copyrighted background music.

### MP4/MOV Binary Box Traversal
Rather than performing slow, lossy re-encoding via FFmpeg (which degrades video bitrate and takes minutes per 4K clip), our muter executes **in-place binary box manipulation** in milliseconds:
1. **Header Parsing:** Traverses the top-level MP4 container atoms (`ftyp`, `moov`, `mdat`).
2. **Track Identification:** Navigates inside `moov.trak.mdia.hdlr` to inspect handler types (`vide` vs `soun`).
3. **Lossless Audio Stripping:** Extracts all video tracks (`vide`) and discards audio tracks (`soun`), reconstructing a pristine container atom hierarchy without recompressing video packets.
4. **Already Silent Detection:** If a video already has zero audio tracks, it is flagged as `already_silent` and preserved as-is without modification.

### 100% Guaranteed Export Rule
In production, a tool must never drop files silently. If a video encounters a container parsing error (e.g., non-standard camera box format):
- The engine flags the error status for user review.
- When exporting, the original unmuted video is guaranteed to be saved under its exact expected filename, ensuring **100% of input files remain in the delivery folder**.

---

## 3. Natural Alphanumeric Sorting (Windows Explorer Parity)

### Problem Statement
Sorting assets primarily by `createdAt` (import time) or `lastModified` (filesystem modification time) caused items to jump around in the Metadata Studio list whenever a file was updated (such as muting a video, generating metadata, or retrying a failed card). This broke visual alignment when comparing files side-by-side with Windows File Explorer.

### The Fix (`useUnifiedAssets.ts`, `VideoMuterView.tsx`, `EpsConverterView.tsx`)
All UI lists and queue processors enforce **Natural Alphanumeric Collation** as the primary sort key:
```typescript
const nameDiff = a.filename.localeCompare(b.filename, undefined, {
  numeric: true,
  sensitivity: 'base',
});
```

### Visual & Behavioral Guarantees
- **Natural Numeric Ordering:** Files like `item_2.jpg` precede `item_10.jpg`.
- **Sequential Prefix Stability:** Files with sequential numbers (`001_`, `002_`, `010_`) stay locked in place regardless of file modification timestamps.
- **Cross-Component Consistency:** The Metadata Studio, Video Muter, EPS Converter, and Batch Queue all display items in identical order, matching the OS desktop directory view 100%.
