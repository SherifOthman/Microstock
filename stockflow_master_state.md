# StockFlow — Master System Architecture & State Specification (`stockflow_master_state.md`)
**Document Version:** 2.4.0-production-master  
**Timestamp:** 2026-11-04  
**Engine:** Electron 35+ / React 19 / TypeScript 5.8+ / Vite 8+  
**Target Platform:** Windows 10/11 x64 (Native OS integration)  
**Primary Domain:** High-throughput Microstock Asset Optimization, Vision AI Metadata Generation, Media Routing, and Multi-Agency CSV Synchronization.

---

## 1. Full Tech Stack & Electron Architecture

### 1.1 Process Model & Sandboxing
StockFlow operates across a strictly partitioned two-tier architecture enforcing context isolation and zero unvetted Node.js execution in the browser viewport:
- **Main Process (Node.js runtime):** Runs with native Windows OS privileges. Manages native window lifecycles, SQLite database operations, IPC handlers, background worker threads, file-system I/O, Ghostscript execution, and Windows Shell notifications (`SHChangeNotify`).
- **Renderer Process (Chromium runtime):** Pure React 19 UI execution context with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. Communication with the Main Process occurs exclusively across a secure, typed IPC bridge exposed via `electron/preload.cjs`.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          RENDERER PROCESS                              │
│  React 19 | TanStack Virtual | Lucide React | Tailwind CSS v4          │
│                                                                        │
│  [StudioView]  [FileCleanerView]  [EpsEngineView]  [AudioStripperView] │
│         │               │                 │                 │          │
│         └───────┬───────┴────────┬────────┴─────────────────┘          │
│                 ▼                ▼                                     │
│      [window.electronAPI] (Context Bridge / Strongly Typed)           │
└─────────────────┬────────────────┬─────────────────────────────────────┘
                  │ IPC (invoke / send / on)
┌─────────────────▼────────────────▼─────────────────────────────────────┐
│                            MAIN PROCESS                                │
│  Node.js Runtime | SQLite (better-sqlite3 WAL) | Native Windows Shell  │
│                                                                        │
│  ├─ IPC Bridge Router (ipcHandlers.ts)                                 │
│  ├─ Streaming Protocol: stockflow://<encoded-absolute-path>            │
│  ├─ Database Engine: SQLite WAL mode (batches, queue, metadata, keys) │
│  ├─ File System Operator (atomic copy, move, rename, directory walks)  │
│  └─ Worker Process Thread Pool:                                        │
│       ├─ Ghostscript / EPS Parser Worker                               │
│       ├─ Media Inspector Worker (ffprobe/native headers)               │
│       └─ Video Audio Stripper Worker (lossless MP4 un-muxer)           │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.2 IPC Bridge & Preload Contracts
The preload layer (`electron/preload.cjs`) exposes a frozen, type-safe API object `window.electronAPI` to the renderer. Key interfaces:
- `fs: { readDir, stat, copyFile, renameFile, unlink, mkdir, exists, inspectMedia }`
- `db: { getBatches, saveBatch, deleteBatch, getQueue, updateQueueItem, deleteQueueItem }`
- `eps: { parseBoundingBox, renderRasterPreview, clampResolution }`
- `system: { showItemInFolder, openPath, triggerShellNotify }`
- `keys: { getEncryptedKey, setEncryptedKey, deleteKey, testKey }`

### 1.3 Streaming Protocol: `stockflow://`
To prevent massive Chromium memory bloat and V8 heap exhaustion when previewing 8K images, 50MB EPS vectors, or 500MB ProRes/MP4 videos:
- Base64 data URLs (`data:image/jpeg;base64,...`) are completely prohibited in media inspection feeds.
- The Main Process registers a custom privileged scheme:
  ```typescript
  protocol.registerFileProtocol('stockflow', (request, callback) => {
    const rawPath = request.url.replace(/^stockflow:\/\//, '');
    const decodedPath = decodeURIComponent(rawPath);
    callback({ path: path.normalize(decodedPath) });
  });
  ```
- All media previews render via `stockflow://C:/absolute/path/to/media.ext`, unlocking direct streaming off NVMe/SSD storage through Chromium's native chunked video/image loaders.

### 1.4 Database Layer: SQLite WAL Engine
Embedded database persistence is powered by `better-sqlite3`:
- **Journal Mode:** Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) for non-blocking concurrent reads and instantaneous write transactions.
- **Synchronous Mode:** `PRAGMA synchronous = NORMAL;` delivering high-throughput file logging without risking integrity.
- **Foreign Keys:** `PRAGMA foreign_keys = ON;` ensuring cascade deletion across batches, queue items, and metadata records.
- **Indexing Strategy:**
  - `idx_queue_batch_id` on `queue_items(batch_id)`
  - `idx_queue_status` on `queue_items(status)`
  - `idx_metadata_queue_id` on `metadata_records(queue_item_id)`
- **In-Memory Fallback:** Automated fallback to `:memory:` mode during automated Vitest runs when running outside native Electron runtime.

### 1.5 Viewport Virtualization (`TanStack Virtual`)
To handle queues of 5,000+ stock assets with 60 FPS scrolling:
- All queues (`StudioView`, `FileCleanerView`) utilize `@tanstack/react-virtual`.
- Windowing dynamically instantiates only the DOM nodes visible within the current client bounding box plus an overscan of 5 items.
- Dynamic measurement caches item heights, eliminating scroll jumps when tags or titles wrap.

---

## 2. Core Workflows & Logic

### 2.1 File Cleaner Engine: Media-First 6-Track Matrix
The cleaner scans an arbitrary folder or file drop and categorizes every item into one of 6 structural microstock tracks:

| Directory Track | Source Detection Rule | Synchronized Actions |
| :--- | :--- | :--- |
| `Photos/` | Real camera EXIF (Make/Model present) OR No AI markers | Normalized sequential numbering |
| `AI_Photos/` | Prompt metadata / C2PA / "AI" in filename / User AI toggle | Retains `_AI_` token in stem |
| `Videos/` | Motion video containers (`.mp4`, `.mov`, `.mkv`) non-AI | Preserves framerate / duration |
| `AI_Videos/` | Video containers with generative signatures / AI tagged | Retains `_AI_` token in stem |
| `Vectors/` | `.eps`, `.ai`, `.svg` non-AI | Synchronized EPS+JPG pairing |
| `AI_Vectors/` | Generative vector files with AI provenance | Synchronized AI EPS+JPG pairing |

#### Sequential Numbering & Disk Index Tracking
1. The cleaner identifies existing files in the target batch folder on disk.
2. It extracts the highest existing batch index (e.g., if `B01_042.jpg` exists, the next sequence starts at `43`).
3. Formats all new files with zero-padded sequences (`B01_001`, `B01_002`, ...).

#### EPS + JPG Synchronized Pairing & Duplicate Suppression
- **The Problem:** Microstock agencies (Freepik, Dreamstime, 123RF) require vector submissions as a dual asset: `asset.eps` + `asset.jpg` (preview) sharing the exact same base name. Standard cleaners treat duplicate base names as collisions.
- **StockFlow Pairing Algorithm:**
  1. File cleaner aggregates dropped files by normalized base name (`filename.replace(/\.[^/.]+$/, "").toLowerCase()`).
  2. If both `.eps` and `.jpg` share the same base name:
     - They are flagged as a single logical pair.
     - Neither is deleted or flagged as duplicate.
     - Both files are renamed in lockstep (e.g., `B01_005.eps` and `B01_005.jpg`).
     - Both files are routed together into `Vectors/` or `AI_Vectors/`.
  3. If a `.jpg` exists without a matching `.eps`, it routes to `Photos/` or `AI_Photos/`.

### 2.2 EPS Engine: Ghostscript BoundingBox & Resolution Clamping
Microstock vector compliance requires that rasterized previews for `.eps` files never exceed agency dimension limits while maintaining crisp commercial resolution.

#### Microstock Constraints
- **Freepik / Adobe Limit:** Maximum longest edge must NOT exceed 10,000px (instant rejection on Freepik).
- **Minimum Commercial Limit:** Minimum resolution must exceed 4 Megapixels (~2400px longest side).
- **StockFlow Resolution Clamping Target:** Longest edge strictly clamped between **5,000px and 8,000px** (targeting nominal 6,000px).

#### Parsing & Clamping Pipeline
1. **Binary DOS EPS vs ASCII PostScript Header Parsing:**
   - Detects 32-bit DOS binary header (`0xC5D0D3C6`). Extracts PostScript offset and length bytes.
   - Reads PostScript stream to locate `%%BoundingBox: llx lly urx ury` or `%%HiResBoundingBox:`.
   - Computes natural vector aspect ratio:
     $$\text{Width}_{\text{pts}} = \text{urx} - \text{llx}, \quad \text{Height}_{\text{pts}} = \text{ury} - \text{lly}$$
     $$\text{Aspect Ratio } AR = \frac{\text{Width}_{\text{pts}}}{\text{Height}_{\text{pts}}}$$
2. **Dynamic DPI / Pixel Calculation:**
   - If landscape ($AR \ge 1.0$):
     $$\text{Target Width} = \text{clamp}(6000, 5000, 8000) = 6000\text{px}$$
     $$\text{Target Height} = \text{round}\left(\frac{6000}{AR}\right)$$
   - If portrait ($AR < 1.0$):
     $$\text{Target Height} = \text{clamp}(6000, 5000, 8000) = 6000\text{px}$$
     $$\text{Target Width} = \text{round}(6000 \times AR)$$
3. **Ghostscript Execution Arguments:**
   - Invokes Ghostscript via child process:
     ```bash
     gswin64c.exe -dSAFER -dBATCH -dNOPAUSE -sDEVICE=jpeg -dJPEGQ=95 \
       -dDEVICEWIDTHPOINTS=<computed_w> -dDEVICEHEIGHTPOINTS=<computed_h> \
       -dPDFFitPage -sOutputFile="<target.jpg>" "<source.eps>"
     ```
   - Maintains 100% geometric aspect ratio without squishing, stretching, or cropping.

### 2.3 Metadata Studio Queue & Cleaner Handoff Ingestion
When moving assets from File Cleaner to Metadata Studio:
1. **Zero-Lag Handoff (`lastProcessedFilesRef`):**
   - File system rename/copy operations run asynchronously.
   - Newly generated file paths and fresh `File` handles are held in a mutable synchronous ref `lastProcessedFilesRef.current` prior to React state settlement, eliminating empty-queue race conditions.
2. **Companion JPG Ingestion Suppression:**
   - When ingesting a folder with paired assets (`B01_001.eps` and `B01_001.jpg`), Studio identifies the pair by matching stems.
   - Studio enqueues **only the `.eps` item** as a `vector` record.
   - The `.jpg` companion is NOT added as a standalone queue item.
   - The companion JPG path is bound directly to the EPS queue item as its `thumbnailDataUrl` and Vision AI inspection source, bypassing redundant Ghostscript re-rasterization.

---

## 3. Agency Export Schemas & Transformation Matrix

StockFlow houses 6 agency-specific transformer engines adhering strictly to contributor guidelines:

```
                          ┌──────────────────────────┐
                          │   MASTER QUEUE RECORD    │
                          │   Title / Tags / Specs   │
                          └─────────────┬────────────┘
                                        │
    ┌──────────────┬─────────────┼──────────────┬─────────────┬─────────────┐
    ▼              ▼             ▼              ▼             ▼             ▼
[Adobe Stock]  [Magnific]  [Shutterstock]  [Vecteezy]   [Dreamstime]     [123RF]
 (CRLF, .eps)   (Semicolon, (7-col, locked  (No ext,     (Split Image/  (ISO Country,
                 No Video)   Illustration)  No under)     Video CSVs)    Merged Tags)
```

### 3.1 Detailed Agency Specification Matrix

| Agency | Delimiter | Extension Rule for Vectors | Video Policy | Special Fields / Formatting Rules |
| :--- | :---: | :---: | :---: | :--- |
| **Adobe Stock** | `,` (Comma) | Must be `.eps` | Supported | CRLF line endings required. Exact tag deduplication. Max 49 tags. |
| **Magnific (Freepik)** | `;` (Semicolon) | Must be `.jpg` | **EXCLUDED** | Mixed batches exclude video items from CSV. Pure video batches trigger "Export Blocked" modal. Includes AI Prompt & Model columns. |
| **Shutterstock** | `,` (Comma) | Must be `.eps` | Supported | 7-column schema (`Filename, Description, Keywords, Categories, Editorial, Mature, Illustration`). Vectors permanently locked to `Illustration = "yes"`. |
| **Vecteezy** | `,` (Comma) | **No extension** | Excluded | Strips file extensions and removes all underscores (`_` $\to$ spaces) from filename stem. |
| **Dreamstime** | `,` (Comma) | Must be `.jpg` | Supported (Split) | Automatically bifurcates into `_images.csv` (15 cols) and `_videos.csv` (13 cols). Supports Cat 212 AI tagging. |
| **123RF** | `,` (Comma) | Must be `.eps` | Supported | Injects ISO 3166-1 alpha-2 country codes. Merges categories into comma-separated tags. |

### 3.2 Magnific / Freepik Video Guardrail Implementation
- File: `src/services/export/csvExporter.ts` and `src/services/rules/platformTransformers.ts`
- **Exclusion Filter:**
  ```typescript
  const isVideoRec = (r: MasterMetadataRecord) => 
    r.mediaType === 'video' ||
    /\.(mp4|mov|avi|mkv|webm)$/i.test(r.filename) ||
    (r.videoMeta && (r.videoMeta.durationSeconds > 0 || r.videoMeta.resolution));
  ```
- **Batch Processing:**
  - In a mixed batch (e.g., 1 Photo, 1 EPS Vector, 1 MP4 Video), the MP4 is excluded from `[batch]_magnific.csv` while the Photo and Vector preview are exported.
  - In a pure video batch (100% video), CSV generation aborts and displays the user modal:  
    `"Export Blocked: Magnific does not support video files. All assets in this batch are videos."`
  - Output filename is strictly unified to `[batch]_magnific.csv`.

---

## 4. Vision AI, API KeyRing & LM Studio Architecture

### 4.1 Multi-Tier KeyRing & Cascading Failover
The AI metadata engine supports multiple cloud providers with automated rate-limit recovery:
- **Supported Cloud Providers:** Google Gemini (Flash / Pro), OpenRouter, Groq, Mistral AI.
- **Failover Logic:**
  1. Requests dispatch sequentially using the active provider key.
  2. If an API returns HTTP `429 (Rate Limit)` or `503 (Overloaded)`:
     - The engine logs the cooldown timestamp for the failed key.
     - Automatically cascades to the next operational key in the KeyRing.
     - Retries the current queue item without failing the batch.
  3. If all keys in a provider tier are exhausted, it cascades to the secondary provider tier.

### 4.2 Upcoming Local AI: LM Studio Integration Architecture
Designed for complete offline, zero-cost, private metadata generation:
- **Target Endpoint:** `http://localhost:1234/v1` (OpenAI-compatible local server).
- **Protocol:** `POST /v1/chat/completions` with JSON payload:
  ```json
  {
    "model": "local-vision-model",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "Stock metadata prompt..."},
          {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
        ]
      }
    ],
    "temperature": 0.2,
    "response_format": { "type": "json_object" }
  }
  ```
- **Fallback Integration:** LM Studio is registered inside the KeyRing as `Provider: 'LM_STUDIO'`. When enabled, it can serve as Tier 0 (Primary) or Tier 99 (Offline Fallback).

### 4.3 Vision AI Prompt Engineering Guardrails
1. **Commercial Stock Titles:** 5 to 15 descriptive words. Fluff words ("isolated", "photorealistic", "ultra-detailed", "masterpiece") are stripped via regex post-processors.
2. **Keyword Engine:** Generates 45 to 50 relevant commercial tags ordered by descending semantic importance.
3. **Agency-Specific Deduplication:** Stemming and synonym collision prevention applied before CSV generation.

---

## 5. UI/UX Specifications & Styling Tokens

### 5.1 Design Tokens (Tailwind CSS v4 Dark-Native Theme)
- **Backgrounds:**
  - Base: `#0B0F17` (Deep space canvas)
  - Surface Card: `#111827` (Tailwind `gray-900`)
  - Border Accents: `#1F2937` (Tailwind `gray-800`) / Hover `#374151`
- **Typography & Accents:**
  - Primary Accent: `#3B82F6` (Electric Blue / Tailwind `blue-500`)
  - Success Badge: `#10B981` (Emerald / Tailwind `emerald-500`)
  - Warning/AI Badge: `#8B5CF6` (Purple / Tailwind `violet-500`)
  - Critical/Error: `#EF4444` (Rose / Tailwind `red-500`)

### 5.2 Responsive Layout
- Fixed Sidebar Navigation (Overview, Metadata Studio, File Cleaner, EPS Engine, Audio Stripper).
- Left-hand Agency Parameter Panel (280px fixed width).
- Center Viewport: TanStack Virtualized dynamic item list.
- Dynamic Action Bars: Sticky top controls for generation triggers, search filters, and batch CSV export buttons.

---

## 6. Resolved Regressions & Verified Fixes Log

1. **Binary EPS Header Exception:**
   - *Bug:* `TypeError: headerText.match is not a function` when reading binary DOS EPS files.
   - *Resolution:* Implemented binary header offset extractor reading bytes 4–7 to skip DOS binary wrapping and read raw ASCII PostScript.
2. **File Cleaner to Studio Blank Page Race Condition:**
   - *Bug:* Clicking "Send to Metadata Studio" routed to an empty Studio queue due to asynchronous file handle drops.
   - *Resolution:* Introduced `lastProcessedFilesRef` holding hydrated native file records immediately upon process completion.
3. **Magnific Mixed Batch Video Rejection:**
   - *Bug:* Magnific exporter treated image records having `videoMeta.width/height` as videos, blocking valid photo/vector exports.
   - *Resolution:* Hardened `isVideoRec` to strictly test `r.mediaType === 'video'`, true video extensions, and playback properties (`durationSeconds > 0`).
4. **Shutterstock Vector Misclassification:**
   - *Bug:* EPS vector assets occasionally defaulted to `Illustration = "no"`.
   - *Resolution:* Locked `Illustration` column strictly to `"yes"` whenever `r.mediaType === 'vector'` or file ends in `.eps`.
5. **High-DPI Ghostscript Memory Explosion:**
   - *Bug:* Raster preview generation produced 12,000px+ images causing Freepik upload rejections.
   - *Resolution:* Implemented dynamic BoundingBox clamping strictly constraining the longest side between 5,000px and 8,000px.

---

## 7. Verification & Test Suite Status
- **Test Framework:** Vitest 3.x with TypeScript support.
- **Test Suites:** 32 suites passed (100%).
- **Total Tests:** 280 unit & integration tests passing.
- **Git Commit Baseline:** `0bb878d` (`main` branch clean).
