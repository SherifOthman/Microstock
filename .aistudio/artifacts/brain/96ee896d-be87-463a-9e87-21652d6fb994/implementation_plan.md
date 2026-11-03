# Emergency Hotfix Plan: Memory Leak, API Timeout Resilience & Progress Bar Logic

## 1. Executive Summary & Root Cause Audit
A deep inspection of the codebase (`src/utils/mediaExtractor.ts`, `src/services/eps/*`, `electron/main.cjs`, `src/services/queue/BatchQueueService.ts`, `src/services/scheduler/KeyRingScheduler.ts`, `src/services/providers/*`, and `src/components/studio/GlobalProgressBanner.tsx`) revealed the exact root causes of all three critical failures discovered during native stress testing:

1. **Why Electron Spikes to 8–9 GB RAM on EPS Drops:**
   - **Full-Resolution 300 DPI Ghostscript Buffers Stored as Thumbnails:** When EPS files are dropped into Metadata Studio, `extractMediaInfo` → `processVectorFile` calls `rasterizeEpsFile(file, 384, 0.72)`. However, in `src/services/eps/epsEngine.ts`, Tier 0 (`window.electronAPI.rasterizeEpsNative`) **ignores** `targetLongestSide` (384px) and `jpegQuality` (0.72), invoking Ghostscript at `-r300 -dJPEGQ=100` (generating massive 4000×4000 to 8000×8000px JPEGs of 10–25 MB each). Worse, `processVectorFile` converts that full-resolution 300 DPI `Blob` directly into a Base64 string without downscaling to 384px, and stores it in triplicate (`item.thumbnailBase64`, `item.thumbnailDataUrl`, and `item.metadataRecord.thumbnailBase64` + SQLite IPC). Dropping 100 EPS files allocates **8+ GB of V8 heap & IPC buffers**, and subsequently sends 15–20 MB Base64 payloads to Gemini Vision (causing immediate API timeouts).
   - **IPC Buffer Duplication Instead of Native File Path Streaming:** Even when `file.path` / `__nativePath` is available on disk in Electron, `epsEngine.ts` reads the entire EPS `File` into an `ArrayBuffer` in the renderer, clones it across Electron IPC, and writes it back to a temp file in `electron/main.cjs`.
   - **Unreleased `OffscreenCanvas` / `HTMLCanvasElement` & `ImageBitmap` Backing Stores:** `EpsRenderResult` returns a live reference to `canvas` (retaining 64 MB of uncompressed RGBA pixel memory per 4000×4000 canvas), `loadUniversalDrawable` never calls `.close()` on decoded `ImageBitmap` instances, and temporary canvases are never zeroed (`canvas.width = 0; canvas.height = 0`) after encoding.

2. **Why API Calls Hit `signal timed out` / High Demand & Freeze the React UI:**
   - **No Shared `AbortController` Propagation:** `BatchQueueService` races `adapter.analyzeImage()` against a timer, but does not pass an `AbortSignal` into `analyzeImage()`. Timed-out requests continue running in the background.
   - **Missing Cooldowns for `503 High Demand` & Timeouts in `KeyRingScheduler`:** `KeyRingScheduler.releaseKey()` only places keys into `cooling_down` on HTTP `429`. When Gemini returns HTTP `503` (*"This model is currently experiencing high demand"*) or aborts with `TimeoutError` (*"signal timed out"*), `releaseKey()` leaves the key marked `healthy` with **0s cooldown**, causing the queue to repeatedly hammer the same overloaded key across all 150+ items.
   - **Full-Table SQLite Re-Reads on Every Retry Tick:** Every status update (`processing`, retry attempt, `error`) writes to `db.masterRecords`, triggering `useSqliteQuery` to run `SELECT * FROM masterRecords` (pulling all rows and Base64 strings over Electron IPC) on every single tick, starving the React main thread.

3. **Why the Progress Bar Fills to 100% When Items Fail:**
   - In `src/components/studio/GlobalProgressBanner.tsx` (lines 45–52), `progressPercent` is calculated as:
     `((queueState.processedCount + queueState.failedCount) / queueState.totalCount) * 100`
     Adding `failedCount` to `processedCount` causes a batch with 80 successes and 20 failures to display `100%`.

---

## 2. Step-by-Step Hotfix Architecture

### Fix 1: Aggressive Memory Management & Zero-Leak EPS / Media Pipeline
- **Pass Native File Path & Target Dimensions to Electron Ghostscript (`electron/main.cjs`, `electron/preload.cjs`, `src/services/eps/epsEngine.ts`):**
  - Update `eps:rasterizeNative` to accept `{ filePath, fileBuffer, fileName, maxDim, quality }`.
  - When `filePath` (`__nativePath` / `file.path`) exists on disk, Ghostscript will read directly from `filePath` without reading or cloning multi-megabyte `ArrayBuffer`s through the renderer and IPC.
  - When called for thumbnail ingestion (`maxDim <= 512`), Ghostscript will use `-r72` / `-dJPEGQ=80` (or downscale immediately) instead of `-r300 -dJPEGQ=100`, reducing thumbnail memory by **98%**.
  - In **EPS Converter**, write converted 300 DPI JPEGs to a managed OS temp cache file (and serve previews via `stockflow://` protocol or lightweight 512px preview blobs) instead of holding hundreds of multi-megabyte 300 DPI `Blob`s and Base64 strings simultaneously in React state.
- **Enforce Strict Thumbnail Downscaling & Canvas/Bitmap Destruction (`src/utils/mediaExtractor.ts`, `src/services/eps/epsWorkerCore.ts`):**
  - In `processVectorFile`, if `epsResult` exceeds `maxDim` (384px/512px), downscale it onto a `maxDim` canvas at `0.72` JPEG quality before extracting `thumbnailBase64` (~15–30 KB instead of 15 MB), and immediately release `epsResult.blob` and `epsResult.objectUrl`.
  - Remove `canvas` from `EpsRenderResult` return payloads and explicitly zero out all temporary canvases (`canvas.width = 0; canvas.height = 0`) and close all `ImageBitmap` objects (`drawable.close()`) in `finally` blocks across `epsWorkerCore.ts` and `mediaExtractor.ts`.
  - Eliminate duplicate Base64 storage in `QueueItem`: store only compact `thumbnailBase64` (deriving `data:image/jpeg;base64,...` on demand) and release raw `item.file` references once ingestion is complete and `nativePath` is recorded.
  - Lower EPS ingestion concurrency in `BatchQueueService.addFiles` to `2` for vector files and terminate idle Web Workers (`terminateEpsWorker()`) once batch extraction completes.

### Fix 2: Robust `AbortController` Timeouts, `503`/Timeout Key Cooldowns & Non-Blocking UI
- **End-to-End `AbortController` Propagation (`src/services/providers/types.ts`, `gemini.ts`, `openrouter.ts`, `groq.ts`, `mistral.ts`, `cloudflare.ts`, `BatchQueueService.ts`):**
  - Add an optional `signal?: AbortSignal` parameter to `IVisionProvider.analyzeImage(...)`.
  - In `BatchQueueService.processSingleItem()`, create a dedicated `new AbortController()` per attempt with a clean 20-second timeout timer (and abort immediately if the user clicks **Pause** or **Stop**).
  - Combine the caller `AbortSignal` with the fetch request so timed-out connections are physically aborted at the network layer, preventing zombie sockets and background JSON parsing.
- **Smart Key Cooldown & Failover on `503 High Demand` & Timeouts (`src/services/scheduler/KeyRingScheduler.ts`):**
  - Update `KeyRingScheduler.releaseKey()` to detect:
    - **HTTP 503 / 502 / 504 / Overloaded / "experiencing high demand"**: Place the key into `cooling_down` for `20s` with a clear status message (`Model high demand (503). Cooling down 20s`).
    - **Timeout / `AbortError` / `TimeoutError` / `signal timed out`**: Place the key into `cooling_down` for `15s` (`Request timed out. Cooling down 15s`) so the scheduler immediately rotates to the next healthy key or backup provider on the very next attempt.
- **Fast-Fail When All Keys Are Overloaded & Main-Thread Yielding (`src/services/queue/BatchQueueService.ts`):**
  - Reduce per-item retry stalls when all keys are timing out: if an attempt fails due to timeout or `503`, rotate immediately to another key; if no healthy keys remain or max attempts (`2` retries) fail, cleanly mark the item as `'error'` (`failed`), persist the status update without blocking, yield to the browser event loop (`requestAnimationFrame` / macrotask yield), and advance to the next item so a 150-item batch never locks up the React UI.

### Fix 3: Strict Success-Only Progress Bar Calculation
- **Update Progress Formula (`src/components/studio/GlobalProgressBanner.tsx`):**
  - Replace `(queueState.processedCount + queueState.failedCount) / queueState.totalCount` with:
    ```ts
    const progressPercent = Math.min(
      100,
      Math.round(
        ((isResizing ? preparedCount : queueState.processedCount) /
          queueState.totalCount) *
          100
      )
    );
    ```
  - During generation and upon batch completion, the progress bar will strictly reflect `(successful_items / total_items) * 100`.
  - If 83 out of 100 items succeed and 17 fail, the progress bar will halt at **83%** (and display the amber/destructive indicator when failures are present instead of a misleading 100% green bar).

---

## 3. Verification & Regression Testing
1. **Unit & Integration Tests:**
   - Add/update tests verifying `GlobalProgressBanner` halts at `(processedCount / totalCount) * 100` when `failedCount > 0`.
   - Add tests verifying `KeyRingScheduler` places keys into cooldown on `503 High Demand` and `signal timed out` errors and rotates to the next key.
   - Add tests verifying `AbortController` cleanly aborts hanging provider calls and moves the item to `error` without hanging the queue.
   - Add tests verifying EPS thumbnail extraction downscales to `<= 512px` and zeroes out temporary canvases.
2. **Build & Full Suite Verification:**
   - Run `npx vitest run` and `compile_applet` to ensure 0 TypeScript or test regressions.
