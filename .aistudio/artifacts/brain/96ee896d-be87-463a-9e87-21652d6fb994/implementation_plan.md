# StockFlow FTP Architecture & State Machine Refactoring Blueprint

This blueprint diagnoses the root causes behind the FTP state desynchronization ("Ghost Uploads" and false `Skipped` badges at 100%) observed in your live Dreamstime tests, and specifies the architectural refactoring for **Single-Socket Serialized Transfers**, **Atomic Vector Bundle (`JPG + EPS`) Pairing**, **1000ms Delta Telemetry**, **Media-Aware Hover Previews**, and **Global Native OS Notifications**.

---

## User Review & Confirmed Architecture Decisions

> [!IMPORTANT]
> The following core architectural decisions have been confirmed and govern this refactoring:

- **Confirmed Decision 1 — Vector Bundle (`JPG + EPS`) Remote Routing**: Paired vector assets (`basename.jpg` + `basename.eps`/`.ai`) are grouped into a single **`Vector Bundle`** row in the UI, sorted after standalone photos and before videos. During execution, the worker uploads the **`.jpg` preview to root `/` first**, awaits the FTP server's `226 Transfer complete` confirmation, and **only then uploads the `.eps`/`.ai` file to `/additional`**.
- **Confirmed Decision 2 — Persistent Single-Socket Session & Activity-Based Stall Detection**: The hardcoded 35-second renderer timeout is permanently removed. The Electron FTP worker maintains **one persistent Plain FTP connection (Port 21)** across the batch and uses a **30-second zero-byte stall watchdog** inside `trackProgress`—meaning a 50 MB video uploading steadily at 150 KB/s for 6 minutes will never time out as long as bytes continue to flow.

---

## 1. Root-Cause Diagnosis: Why "Ghost Uploads" & False `Skipped` Happened

Cross-referencing your Windows Resource Monitor screenshots (`~165–195 KB/s` throughput) and Dreamstime's upload dashboard (`dreamstime.com/upload`) against the current state machine reveals **four interacting bugs**:

### Bug A: The Unaborted 35-Second `Promise.race` Cutoff (Root Cause of Ghost Uploads)
- **What Happened**: The renderer wrapped `uploadFile` in a hardcoded **35-second `Promise.race` timeout** without aborting the active `basic-ftp` socket in the Electron Main Process.
- **The Math**: At your `~180 KB/s` upload speed, `Futuristic_tech_HUD` (`7.4 MB`) required **~42 seconds** and `Ice_cubes` (`10.3 MB`) required **~58 seconds**.
- **The Desync**: At `t = 35.0s` (when `Futuristic_tech_HUD` was at **97%** in your screenshot), the renderer's `Promise.race` resolved with a fake timeout, marked the row `Retry 1/5`, and immediately commanded the Main Process to start uploading the next file (`Ice_cubes`) on a **second concurrent FTP connection**. Meanwhile, Connection #1 remained open in the background and finished uploading the remaining 3% to Dreamstime 7 seconds later ("Ghost Upload").

### Bug B: Concurrent Socket Collisions & False `550 Skipped` Badges at 100%
- **What Happened**: Because Connection #1 silently finished uploading `Futuristic_tech_HUD` in the background (or was still holding a write lock on the remote file), when the Round-Robin sweep came back to retry `Futuristic_tech_HUD`, Dreamstime's FTP server rejected the duplicate/concurrent `STOR` command or directory change with an FTP `550` response.
- **Why It Showed `100% — Skipped`**: Late `ftp:telemetry` progress events from Connection #1 pushed the row's progress bar to `100%`, while the retry sweep's `550` response overwrote `item.status` to `'skipped'` without resetting or reconciling that the initial stream had already succeeded.

### Bug C: Over-Broad `5xx` Regex Classification
- **What Happened**: Any error string or code matching `/^5\d\d|550|552|553/` was blindly classified as "Skipped (Duplicate)". In standard FTP (RFC 959), `550` during `CWD /video` simply means the directory change failed or the control socket was out of sync, **not** that the file is a duplicate. Furthermore, `basic-ftp` control/data socket desynchronization (`500`/`502`/`530`) was falsely bucketed as `Skipped` instead of triggering a clean socket reconnect.

### Bug D: Why Video Hover Previews Showed Only Text (`Ice_cubes_dropping...`)
- **What Happened**: The hover preview attempted to render every file inside an `<img src="stockflow://local?path=..." />` tag with an `onError` handler that set `display: none`. Because `.mp4` and `.mov` videos cannot render inside an `<img>` element, `onError` immediately hid the media box, leaving only the truncated filename text inside the tooltip. Additionally, calling `URL.createObjectURL(file)` inline on every render recreated blob URLs on every 1-second progress tick.

---

## 2. User Experience & Visual Design

### Key User Flows & Visual Hierarchy
- **Aesthetic & Layout Posture**: High-craft dark UI (`#09090b` canvas, `#121215` card surface, `1px` structural borders) with full-width Transfer Queue dominance and zero tutorial clutter.
- **Typography & Tabular Discipline**: UI labels use clean sans-serif hierarchy; all file sizes, byte deltas, speeds, percentages, and timers use `font-mono tabular-nums` so numbers never jitter during 1000ms ticks.
- **Single-Line Professional Telemetry Header**:
  - While actively uploading, displays the exact unified status string:
    `Upload progress: 1/5 files - 687.73 KB / 5.49 MB @ 625.03 KB/s Time left: 00:01:01`
  - Full Arabic localization with proper RTL layout (`تقدم الرفع: 1/5 ملفات - 687.73 KB / 5.49 MB @ 625.03 KB/s الوقت المتبقي: 00:01:01`).
- **Contextual Empty State vs. Active Queue**:
  - **When Queue is Empty (`queue.length === 0`)**: The top toolbar hides `Add Files`, `Add Folder`, `Start Upload`, and `Clear All`. The center of the viewport displays an interactive Dropzone card with prominent **`+ Add Files`** and **`Add Folder`** buttons.
  - **When Queue is Populated (`queue.length > 0`)**: Action buttons appear in the fixed-width toolbar (`+ Add Files`, `Add Folder`, `Start Upload / Pause / Resume`, and `Clear All`).
  - **True `Clear All`**: Resets the queue array to `[]` and resets all batch telemetry counters (`Uploaded`, `Skipped`, `Failed`, `Speed`, `Time left`) to zero.
- **Truthful Completion Banner & Progress Bar**:
  - When a batch finishes, displays the exact breakdown:
    `Batch Finished — Uploaded: X | Skipped: Y | Failed: Z`
  - If any files failed (`Failed > 0`), the batch progress bar reflects the true ratio of uploaded bytes/files with an amber/crimson state rather than a misleading green 100% bar.

---

## 3. Key Architectural Decisions & Logical Flows

### Decision 1: Strictly Serialized Single-Connection State Machine & 30s Zero-Byte Watchdog
- **Chosen Approach**:
  1. **Remove Renderer `Promise.race` Timeout**: The Renderer awaits the Main Process IPC call (`ftp:uploadFile`) until the Main Process definitively resolves `{ success, bytesTransferred, errorCode, errorMessage }`.
  2. **Single Persistent `basic-ftp` Client per Batch**: The Electron Main Process opens one Plain FTP connection (`port: 21`, `secure: false`) at the start of the batch and reuses it sequentially for File 1, File 2, File 3... Only if a network error or stall occurs does the Main Process explicitly call `client.close()` to kill the underlying TCP socket before opening a fresh connection for the next attempt.
  3. **30-Second Zero-Byte Stall Watchdog (Inside Main Process)**: Inside `PlainFtpAdapter.uploadFile`, a watchdog timer resets to `30,000ms` **every time `trackProgress` reports `info.bytes > lastBytes`**. If bytes are flowing (even at `20 KB/s` on a `100 MB` video), the watchdog continuously resets and **never** interrupts the upload. Only if **zero bytes** are transferred for 30 consecutive seconds does the Main Process call `client.close()` (killing the socket so no Ghost Upload can continue) and return `ETIMEDOUT_STALL`.
  4. **Strict `550` Duplicate Isolation**: A file is only marked `Skipped` if the server explicitly returns `550` **during the `STOR` command** with an overwrite/exists message, OR if pre-checked against the remote directory listing (`client.list(remoteFolder)`) before `STOR`. All socket drops (`ECONNRESET`, `ETIMEDOUT_STALL`, `421`, `425`, `426`, `EPIPE`) are classified as retryable transient errors (`Retry 1/5` ... `Retry 5/5`).

### Decision 2: Vector Pair Dependency Logic (`JPG + EPS` Atomic Bundle)
- **Chosen Approach**:
  1. **Ingestion & Pairing Engine (`bundleAndSortFtpQueue`)**:
     - When files or folders are added, normalize each filename's stem (e.g., `B01_001_AI_helmet.jpg` and `B01_001_AI_helmet.eps` share the stem `b01_001_ai_helmet`).
     - If a `.jpg`/`.jpeg` and a `.eps`/`.ai`/`.svg` share the same stem (either dropped together or matched against an existing queued item), merge them into a single **`FtpQueueItem` of kind `'vector_bundle'`** (`displayTitle: "Vector Bundle: B01_001_AI_helmet"`).
     - **Strict Queue Sorting Order**:
       1. **Standalone Photos (`.jpg`, `.png`)** $\rightarrow$ `/`
       2. **Vector Bundles (`JPG + EPS` pairs)** & **Standalone Vectors** $\rightarrow$ `/` then `/additional`
       3. **Videos (`.mp4`, `.mov`)** $\rightarrow$ `/video`
  2. **Sequential Two-Phase Execution for `vector_bundle`**:
     - **Phase A (Preview Upload)**: Upload the `.jpg` file (`jpgFile` / `jpgLocalPath`) to root `/`. Track progress from `0%` to `50%` (weighted by `jpgSize + epsSize`). Await server `226` completion.
     - **Phase B (Vector Counterpart Upload)**: Only after Phase A succeeds, navigate to `/additional` and upload the `.eps` file (`epsFile` / `epsLocalPath`). Track combined bundle progress up to `100%`.
     - **Failure Guard**: If Phase A (`.jpg`) fails on a sweep, Phase B (`.eps`) is **not** attempted on that sweep (preventing orphaned EPS files on Dreamstime). If Phase A already succeeded on Sweep 1 and Phase B fails on Sweep 1, Sweep 2 remembers `jpgUploaded = true` and only retries Phase B (`.eps`).

### Decision 3: Precision 1000ms Delta Telemetry Engine
- **Chosen Approach**:
  - Inside `PlainFtpAdapter` (`trackProgress`), every chunk updates `currentFileBytesTransferred`.
  - A dedicated `1000ms` high-precision ticker computes:
    - $\Delta\text{Bytes} = \text{totalBatchBytesTransferred}(t) - \text{totalBatchBytesTransferred}(t - 1000\text{ms})$
    - $\text{Instantaneous Speed (B/s)} = \Delta\text{Bytes} / \Delta t_{\text{sec}}$ (with a 3-second sliding window average so 1-second TCP buffer bursts don't flicker to `0 KB/s`).
    - $\text{Time Left (HH:MM:SS)} = \text{remainingBatchBytes} / \text{Speed}$.
  - Formats sizes and speeds with two-decimal precision (`687.73 KB / 5.49 MB @ 625.03 KB/s Time left: 00:01:01`).

### Decision 4: Media-Aware HoverCard Previews & Global OS Notifications
- **Media-Aware Preview Popover**:
  - Pre-generates and caches preview URLs once when items are added to the queue (never inside React's render loop).
  - Renders `<video src={previewUrl} muted autoPlay loop playsInline />` for `.mp4`/`.mov`/`.webm` files, and `<img src={previewUrl} />` for photos and Vector Bundles (using the bundle's `.jpg` preview).
  - Supports both hover and click on the filename / magnifier icon.
- **Global Electron OS Notification Service (`app:notifyBatchComplete`)**:
  - Centralized IPC service in Electron Main Process (`electron/main.cjs`) exposed via `window.electronAPI.notifyBatchComplete({ module: 'ftp' | 'studio' | 'cleaner' | 'eps' | 'audio', title, body })` so FTP Uploader, Metadata Studio, and background engines trigger native Windows notifications upon completion.

---

## 4. Technical Architecture & State Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        FtpUploaderView (React UI)                            │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Unified Telemetry Header (1000ms Ticker):                              │  │
│  │ "Upload progress: 1/5 files - 687.73 KB / 5.49 MB @ 625.03 KB/s        │  │
│  │  Time left: 00:01:01"                                                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Static Queue Grid (Sorted on Drop/Add):                                │  │
│  │  1. Standalone Photos (.jpg)             -> /                          │  │
│  │  2. Vector Bundles (JPG + EPS grouped)   -> / then /additional         │  │
│  │  3. Videos (.mp4, .mov)                  -> /video                     │  │
│  │  [Hover/Click Filename -> Cached <img /> or <video autoPlay muted />]  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ IPC (Strictly Serialized — 1 File at a Time)
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                 ElectronFtpManager (Node.js Main Process)                    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Single Persistent PlainFtpAdapter (Port 21, secure: false)             │  │
│  │  • Connects once per batch; reuses control socket sequentially         │  │
│  │  • Pre-checks remote directory list to detect true existing files      │  │
│  │  • 30s Zero-Byte Stall Watchdog (resets on every trackProgress byte)   │  │
│  │  • On stall/drop: client.close() kills TCP socket (Zero Ghost Uploads) │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                       │
│                    ┌─────────────────┴─────────────────┐                     │
│                    ▼                                   ▼                     │
│     [Standard Asset (Photo / Video)]     [Vector Bundle (JPG + EPS)]         │
│      1. CWD target folder                 1. CWD / -> Upload .jpg (0..50%)   │
│      2. STOR file (0..100%)               2. Await 226 Transfer Complete     │
│      3. Await 226 Transfer Complete       3. CWD /additional -> Upload .eps  │
│                                           4. Await 226 Transfer Complete     │
└──────────────────────────────────────────────────────────────────────────────┘
```
