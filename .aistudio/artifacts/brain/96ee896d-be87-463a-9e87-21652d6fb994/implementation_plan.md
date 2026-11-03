# Milestone 3: Microstock Business Logic & Full-Spectrum QA Architecture Plan

## 1. Executive Summary & Contributor Pipeline Audit

A high-volume microstock contributor operates a continuous production pipeline: **Ingest & Sanitize** (File Cleaner / Video Muter / EPS Converter) $\rightarrow$ **Enrich & Tag** (Metadata Studio) $\rightarrow$ **Format & Export** (Agency-Specific CSVs + Native Project Folders). While Milestone 2 established an enterprise-grade SQLite + Web Worker + Virtualized UI foundation, our deep domain audit revealed **five critical business logic gaps** that currently introduce manual friction or risk agency submission rejections:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                    CONTINUOUS MICROSTOCK CONTRIBUTOR PIPELINE                          │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│   STAGE 1: MEDIA PREP    │   STAGE 2: AI ENRICHMENT    │   STAGE 3: AGENCY DELIVERY    │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────┤
│ • File Cleaner (Rename)  │                             │ • Strict Completed-Only Filter│
│ • Video Muter (Strip)    │──► 1-Click Direct Handoff ──► • Warn-on-Incomplete Dialog   │
│ • EPS Converter (Render) │   (In-Memory File Buffers   │ • Native Folder Save (IPC)    │
│                          │    + Vector Origin Marker)  │ • Multi-Agency ZIP Bundle     │
└──────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

### Critical Business Logic Flaws Identified & Planned Fixes

1. **Siloed Tool Dead-Ends (File Cleaner & Video Muter $\nrightarrow$ Metadata Studio)**
   - **Current Flaw**: Only the EPS Converter has a working handoff to Metadata Studio. When a contributor finishes cleaning/renaming 500 files in **File Cleaner**, the queue immediately wipes (`setRawFiles([])`) and displays a dead-end confirmation modal, forcing the user to open OS Explorer, locate the output folder, and manually drag-and-drop the files back into Metadata Studio. Similarly, **Video Muter** strips audio tracks and even purges `mutedBlob` buffers after folder export without offering a direct route to tag those videos in Metadata Studio.
   - **Architectural Fix**: Retain the processed `File` / `Blob` payloads in memory across completion states in both File Cleaner and Video Muter. Add prominent, 1-click **"Send to Metadata Studio ({N})"** primary CTAs inside the File Cleaner completion dialog/toolbar and Video Muter action bar that construct renamed/muted `File` objects and pipe them directly into `batchQueueService.addFiles()`, automatically transitioning the workspace to Metadata Studio.

2. **Silent Agency CSV Rejection Bug — Exporting Incomplete/Blank Rows**
   - **Current Flaw**: When assets are dropped into Metadata Studio, `BatchQueueService.addFiles()` immediately pre-populates `MasterMetadataRecord` rows in SQLite with `status: 'pending'` and blank `baseTitle: ''`, `baseDescription: ''`, and `baseKeywords: []`. In `StudioView`, the `records` array passed to the CSV exporter maps *all* assets in the workspace—including `pending` and `failed` items. Worse yet, the Export Modal buttons invoke `handleZipExport()` and `handleSingleExport()` directly, bypassing `handleExportZipWithCheck()`, and the `incompleteExportDialog` / `noticeDialog` modals returned by `useCsvExport` are **never mounted in the view**. Clicking Export while items are still queued or failed silently produces agency CSVs containing blank titles and zero keywords, which Adobe Stock, Shutterstock, and Freepik immediately reject.
   - **Architectural Fix**:
     - Strictly filter all CSV export operations (`exportSinglePlatformCsv`, `exportAllPlatformsZip`, and `saveCsvToDirectory`) so **only assets with `status === 'completed'` and valid non-empty metadata** are serialized into CSV rows.
     - Route all single-agency, multi-agency ZIP, and native folder export triggers through a unified pre-flight completeness gate. If any assets in the active batch are still `pending`, `processing`, or `failed`, display an interactive **Incomplete Batch Warning Dialog** (*"X assets are still pending or failed. Do you want to export only the Y completed assets?"*) before proceeding. If 0 assets are completed, display a clear blocking notice dialog.

3. **Unwired Native Folder Save for Agency CSVs**
   - **Current Flaw**: Contributors organizing local submission folders want to drop agency CSVs directly alongside their cleaned media files on disk without extracting a downloaded `.zip` archive in their browser's Downloads folder. Although `saveCsvToDirectory()` exists in the CSV export service using Electron's native directory dialog, it is completely disconnected from the `useCsvExport` hook and the Metadata Studio Export Modal.
   - **Architectural Fix**: Wire `saveCsvToDirectory()` into `useCsvExport` (complete with the Incomplete Batch Warning gate) and expose a primary **"Save CSVs to Folder..."** action alongside **"Download All (.ZIP)"** in the Metadata Studio Export Modal.

4. **Lost Vector Categorization on EPS $\rightarrow$ Metadata Studio Handoff**
   - **Current Flaw**: Microstock agencies require contributors to upload a raster `.jpg` preview alongside each `.eps` vector, and the CSV row must classify the asset as a Vector/Illustration (e.g., Shutterstock `illustration: "yes"`, Adobe Stock `Category: 8 - Graphic Resources`). Currently, when EPS Converter sends rendered `.jpg` previews to Metadata Studio, `BatchQueueService` inspects the `image/jpeg` MIME type and classifies `mediaType` as `'image'` instead of `'vector'`.
   - **Architectural Fix**: Tag handed-off EPS preview files with a deterministic vector origin marker (and preserve companion `.eps` base filename semantics) so `BatchQueueService` and downstream platform transformers accurately classify handed-off EPS previews as `mediaType: 'vector'`.

5. **Post-Export Next-Step Guidance & Pipeline Continuity**
   - **Current Flaw**: Across all preparation tools, once a batch finishes processing, the UI lacks clear directional guidance on the next logical stage in the microstock workflow, and selection/filter counters do not distinguish between raw queued items and handoff-ready outputs.
   - **Architectural Fix**: Introduce a unified **Pipeline Handoff Banner** across File Cleaner, Video Muter, and EPS Converter as soon as processed items are ready, paired with real-time readiness badges (`Ready for Studio`, `Completed / Exportable`) in Metadata Studio's top action bar.

---

## 2. Seamless Cross-Tool Handoff & Export State Machine

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      STUDIO EXPORT & COMPLETENESS GATE FLOW                            │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                            User clicks "Export CSVs" in Studio
                                            │
                                            ▼
                     ┌─────────────────────────────────────────────┐
                     │ Inspect Batch Status Counts:                │
                     │ • completedCount (status === 'completed')   │
                     │ • incompleteCount (pending/processing/fail) │
                     └──────┬───────────────────────────────┬──────┘
                            │                               │
           completedCount === 0                             completedCount > 0
                            │                               │
                            ▼                               ▼
            ┌───────────────────────────────┐      ┌─────────────────────────────────┐
            │ Show Blocked Export Dialog:   │      │ incompleteCount > 0 ?           │
            │ "No completed assets ready    │      ├────────────────┬────────────────┤
            │  for export yet."             │      │ YES            │ NO             │
            └───────────────────────────────┘      ▼                ▼                │
                                      ┌─────────────────────────┐ ┌──────────────────┐
                                      │ Show Warn-on-Incomplete │ │ Proceed Directly │
                                      │ Confirmation Dialog:    │ │ to Selected      │
                                      │ "Export only the {Y}    │ │ Delivery Target  │
                                      │  completed assets?"     │ └────────┬─────────┘
                                      └────────────┬────────────┘          │
                                                   │ Confirmed             │
                                                   └───────────┬───────────┘
                                                               ▼
                                      ┌──────────────────────────────────────────────┐
                                      │ Filter strictly to completed records & run:  │
                                      │  1. Save CSVs to Native Folder (IPC Dialog)  │
                                      │  2. Download Multi-Agency Bundle (.ZIP)      │
                                      │  3. Download Single Agency CSV               │
                                      └──────────────────────────────────────────────┘
```

### Key UX & State Specifications
- **File Cleaner $\rightarrow$ Metadata Studio Handoff**:
  - When `handleProcessAndSave` executes, before resetting the table or inside the post-save completion state, store the renamed `File` objects (constructed with each asset's `newName` and original `File` slice/buffer) in `lastProcessedFiles`.
  - In both the Cleaner Success Modal and the post-process banner, render a primary **"Send {N} Cleaned Files to Metadata Studio"** CTA. Clicking it invokes `onSendToStudio(lastProcessedFiles)`, which queues them in `batchQueueService` and switches `activeTool` to `'studio'`.
- **Video Muter $\rightarrow$ Metadata Studio Handoff**:
  - Preserve `mutedBlob` references in `VideoItem` state even after saving to a local folder (only releasing blobs when the user explicitly clears the queue or unmounts).
  - Add a **"Send {N} Muted Videos to Metadata Studio"** button in the Video Muter header/completion bar that wraps each completed `mutedBlob` into a `File([item.mutedBlob], item.originalName, { type: 'video/mp4' })` and passes the batch to `onSendToStudio()`.
- **EPS Converter $\rightarrow$ Metadata Studio Vector Preservation**:
  - Attach a non-enumerable or typed property (`__sourceMediaType: 'vector'`) on `File` instances generated by `useEpsConverter.handleSendToStudio`. Update `BatchQueueService.addFiles()` to honor `__sourceMediaType === 'vector'` so exported Shutterstock and Adobe Stock CSVs automatically apply vector/illustration rules.

---

## 3. Full-Spectrum Failure-Driven QA & Testing Architecture

To guarantee enterprise reliability under real-world contributor workloads (thousands of files, corrupt media headers, worker crashes, and concurrent database writes), we will expand the automated test suite across three comprehensive tiers:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   THREE-TIER FAILURE-DRiven QA ARCHITECTURE                            │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│   TIER 1: UNIT &         │   TIER 2: DEEP INTEGRATION  │   TIER 3: E2E PIPELINE &      │
│   DOMAIN RULES ENGINE    │   (SQLITE + WORKERS + DOM)  │   CHAOS STRESS TESTING        │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────┤
│ • Agency CSV Transformers│ • Real better-sqlite3 Engine│ • Prep -> Handoff -> Studio   │
│ • Completed-Only Filter  │   (WAL, FK Cascades, Joins) │   -> Warn Dialog -> CSV Save  │
│ • Vector Origin Tagging  │ • Worker Pool Crash &       │ • 3,000 Corrupt/Unsupported   │
│ • Prompt & Title Rules   │   Timeout Auto-Recovery     │   File Drop Resilience        │
│ • Bilingual RTL/LTR Copy │ • 1,000+ Row TanStack       │ • API Key Exhaustion & Rate   │
│   & Country ISO Mapping  │   Virtual Scroll Integrity  │   Limit Backoff Recovery      │
└──────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

### Tier 1: Domain Business Logic & Edge-Case Unit Tests
- **Strict Completed-Only CSV Serialization**:
  - Verify that batches mixing `completed`, `pending`, `processing`, and `failed` records strictly emit rows **only** for `completed` records across all 6 agencies (Adobe Stock, Shutterstock, Freepik/Magnific, Vecteezy, Dreamstime, 123RF).
  - Verify that CSV escaping properly handles embedded quotes, commas, newlines, RTL Arabic characters, and UTF-8 BOM (`\uFEFF`) headers for Excel compatibility.
- **Agency Rule Enforcement & Vector Handoff Classification**:
  - Verify that EPS-originated `.jpg` files handed off to Metadata Studio retain `mediaType: 'vector'`, setting Shutterstock `Illustration = yes` and Adobe Stock `Category = 8`.
  - Verify character truncation at word boundaries (`truncateAtWordBoundary`), keyword deduplication, banned trademark/camera-model stripping, and 123RF ISO country code mapping under both English and Arabic UI locales.

### Tier 2: Deep Integration Tests (Real `better-sqlite3` Engine, Worker Pools & Virtualized DOM)
- **Real `better-sqlite3` Relational Database Engine Suite**:
  - Directly instantiate `SqliteDatabaseManager` (`electron/sqliteDb.cjs`) against temporary on-disk SQLite databases to test real SQL execution (not just the in-memory mock):
    - Verify `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`.
    - Test bulk `saveAssets` transactions with **2,000+ relational records** (`assets` + `asset_metadata` tables) and measure query latency (< 50ms).
    - Test `ON DELETE CASCADE` integrity: deleting an asset from `assets` must automatically purge its companion rows in `asset_metadata` and `asset_distributions`.
    - Simulate SQLite constraint violations, malformed JSON arrays in `keywords`, and concurrent read/write contention to verify zero deadlocks or unhandled exceptions.
- **Web Worker Pool Failure & Malformed Binary Resilience**:
  - **Corrupt Media Headers**: Feed truncated 0-byte buffers, corrupted JPEG `SOF0` markers, cyclic MP4 atom trees (`moov` boxes with invalid `size` pointers exceeding buffer length), and malformed PostScript streams into the Image Header, Video Muter, and EPS Worker logic to verify graceful error reporting without crashing the worker thread.
  - **Worker Crash & Timeout Recovery**: Simulate mid-flight worker crashes (`onerror` events) and hung workers exceeding task timeouts inside `WorkerPool`, verifying that the pool automatically terminates the dead worker, spawns a replacement worker, fails or retries the affected task cleanly, and continues draining the remaining queue without hanging `Promise.all`.
- **High-Density Virtualized UI (`@tanstack/react-virtual`) Stress Tests**:
  - Render `StudioView` (`AssetCardList`), `CleanerFileTable`, and `VideoMuterTable` with **1,000+ items** in the queue.
  - Verify that only the windowed viewport slice ($\sim 10\text{–}25$ DOM nodes) is mounted in the document at any time, selection checkboxes and inline title edits persist accurately as rows scroll out of and back into the virtual viewport, and filtering by search query or status updates the virtualizer count instantaneously without React key collisions.

### Tier 3: End-to-End (E2E) Contributor Pipeline & Chaos Stress Tests
- **Full Pipeline Handoff E2E Flow**:
  - Simulate a contributor dropping raw files into **File Cleaner** $\rightarrow$ batch renaming $\rightarrow$ clicking **"Send to Metadata Studio"** $\rightarrow$ verifying files arrive in Studio's queue $\rightarrow$ running AI metadata generation $\rightarrow$ triggering **Export CSVs** while 2 items are still `pending` $\rightarrow$ confirming the **Incomplete Batch Warning Dialog** $\rightarrow$ verifying the exported Native Folder / ZIP contains only the completed items.
  - Repeat the cross-tool handoff verification for **Video Muter $\rightarrow$ Metadata Studio** and **EPS Converter $\rightarrow$ Metadata Studio** (verifying vector metadata preservation end-to-end).
- **Mass Ingestion Chaos Test (3,000 Mixed/Unsupported Files)**:
  - Simulate dropping **3,000 files at once** containing a chaotic mix of valid JPEGs/MP4s/EPS files alongside unsupported `.exe`, `.DS_Store`, `thumbs.db`, `.pdf`, and 0-byte corrupt files.
  - Verify that `BatchQueueService` and the tool dropzones filter out unsupported extensions in a single pass, notify the user of skipped files, chunk-insert the valid records without blocking the main thread, and never leak `ObjectURL` handles on batch clear.
- **API Key Exhaustion & Rate-Limit Recovery**:
  - Simulate HTTP `429 Too Many Requests` and `401 Unauthorized` responses across a pool of multiple API keys during a multi-asset Studio batch run. Verify automatic key rotation, exponential backoff, accurate failed-item status marking when all keys are exhausted, and 1-click "Retry Failed" recovery once a valid key is restored.

---

## 4. Verification & Acceptance Criteria
1. **Zero Manual File-Transfer Friction**: File Cleaner, Video Muter, and EPS Converter all provide 1-click handoff actions that send processed assets straight into Metadata Studio with accurate media classification (`image`, `video`, `vector`).
2. **Bulletproof Agency CSV Exports**: Exporting from Metadata Studio strictly excludes incomplete/failed items, warns the contributor via an interactive confirmation modal when incomplete items exist in the batch, and supports 1-click **Save CSVs to Folder** via Electron's native folder picker.
3. **100% Green Full-Spectrum Test Suite**: All existing and newly authored Unit, Real-SQLite Integration, Worker Chaos, Virtualizer Stress, and E2E Pipeline tests pass deterministically via `npm test`, and the production bundle compiles cleanly via `npm run build`.
