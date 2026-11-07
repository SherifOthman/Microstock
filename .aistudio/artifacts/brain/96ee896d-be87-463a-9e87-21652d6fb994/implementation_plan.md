# Execution Blueprint & Implementation Plan

## Overview
This plan addresses four critical architectural and UX improvements across StockFlow Desktop:
1. **Ephemeral Persistent State Across App Restarts** for `AudioStripperView`, `EpsConverterView`, and `FileCleanerView` (persisting across full app restarts while active, and immediately wiping from disk when items are removed or cleared so the database never grows indefinitely).
2. **FTP Uploader UI Cleanup & Multi-Protocol Routing Audit** across 123RF, Vecteezy, Shutterstock, Adobe Stock, Freepik, Magnific, and Dreamstime.
3. **Studio AI Mode Reactivity Fix** so switching to Local AI mode immediately dismisses the API key warning banner.
4. **Distribution Tracker UI Purge & Thumbnail Fix** removing sample/destructive actions, widening the Metadata Inspector modal to `max-w-4xl`, and fixing local thumbnail resolution.

---

## Task 1: Ephemeral Persistent State Across App Restarts (`AudioStripperView`, `EpsConverterView`, `FileCleanerView`)

### Root Cause Analysis
1. **Incomplete Storage Backing & Debounce Loss on Close**:
   - `queuePersistenceService.ts` writes snapshots to `db.queues.saveSnapshot`, which delegates to `window.electronAPI.db.saveQueueSnapshot` (`local_queues.sqlite`) or an in-memory `Map` fallback (`testMemoryStore.persistentTaskQueues`). In browser/preview mode—or when the app closes within the 250ms debounce window—queued states are lost.
2. **Orphaned Rows When Removing the Last Item**:
   - In `useVideoMuter.ts`, `useEpsConverter.ts`, and `useFileCleaner.ts`, the `useEffect` only writes to SQLite when `items.length > 0` (or `rawFiles.length > 0`). If a user deletes the last item individually (`handleRemoveItem`), `items.length` becomes `0` and `clearModuleQueueSnapshot` is never called—causing stale data to remain in `local_queues.sqlite` and reappear on the next app launch.
3. **Missing Selections, Options & EPS Preview Rehydration**:
   - `useEpsConverter` strips `result.blob` and `result.objectUrl` during serialization, leaving `item.result` without a `dataUrl` upon hydration even though `previewThumbnailUrl` (base64 JPEG) was saved. As a result, `EpsVirtualGrid` fails to display rendered previews after restart.
   - `selectedIds` in `useVideoMuter` / `useEpsConverter` and `options` / `lastProcessedFiles` metadata in `useFileCleaner` were not fully round-tripped in `telemetry`.

### Implementation Changes
- **`src/db/index.ts` & `src/services/persistence/queuePersistenceService.ts`**:
  - Mirror `db.queues.saveSnapshot`, `getSnapshot`, and `clearSnapshot` to both `local_queues.sqlite` (via Electron IPC) and `localStorage` (`stockflow_ephemeral_queue_<moduleId>`) so hydration is 100% deterministic across both native Electron restarts and browser/test environments.
  - Flush snapshots synchronously (`immediate = true`) on queue mutations (file addition, item removal, selection change, and processing completion) and on `window` `beforeunload` / `pagehide`.
- **Strict Ephemeral Lifecycle ("Temporary Until Removed — Never Grows Forever")**:
  - `local_queues.sqlite` stores at most **1 row per utility** (`module_id PRIMARY KEY IN ('eps', 'video', 'cleaner')`).
  - When a user removes a single item (`handleRemoveItem`), the updated queue is immediately written over that single row (`ON CONFLICT(module_id) DO UPDATE`).
  - When the last item is removed (`items.length === 0`) or **Clear All** is clicked, `clearModuleQueueSnapshot(moduleId)` immediately executes `DELETE FROM persistent_task_queues WHERE module_id = ?` and removes the `localStorage` key. Only the Distribution Tracker's Master Vault retains permanent historical records.
- **`src/features/eps/hooks/useEpsConverter.ts`**:
  - Persist and restore `selectedIds` and `dpi` inside `telemetry`.
  - On hydration, if an item has `previewThumbnailUrl` and `status === 'completed'`, populate `result.dataUrl = raw.previewThumbnailUrl` so completed EPS cards render their visual preview immediately on restart.
  - Track post-hydration transitions from non-empty to empty queue and invoke `clearModuleQueueSnapshot('eps')`.
- **`src/features/video/hooks/useVideoMuter.ts`**:
  - Persist and restore `selectedIds` inside `telemetry`.
  - Track post-hydration transitions to `items.length === 0` and invoke `clearModuleQueueSnapshot('video')`.
- **`src/features/cleaner/hooks/useFileCleaner.ts`**:
  - Persist and restore `manualOverrides`, `options`, and processed state metadata inside `telemetry`.
  - Ensure `handleRemoveFile` and `handleClearQueue` immediately purge `clearModuleQueueSnapshot('cleaner')` when `rawFiles.length === 0`.

---

## Task 2: FTP UI Cleanup & Multi-Protocol Routing Audit

### UI Overhaul (`src/features/ftp/OneTwoThreeRfFtpUploaderView.tsx` & `src/features/ftp/FtpUploaderView.tsx`)
1. **Zero Animated Icons**:
   - Remove all `animate-spin`, `animate-bounce`, and `animate-pulse` classes from icons across both FTP views (including `<RefreshCw />` during connection tests and queue status icons).
2. **Unified Dropzone Container & Empty State**:
   - Hide the search input and media filter pills when `queue.length === 0` so the empty state is clean and uncluttered.
   - Match the dropzone wrapper container to `EpsConverterView` and `FileCleanerView`: `flex-1 flex flex-col items-center justify-center p-10 rounded-xl border-2 border-dashed transition-colors min-h-[280px]`.
   - Unify the dropzone title across all agencies to:
     - Arabic: `"اسحب الملفات أو المجلدات هنا لرفعها إلى [Agency Name]"`
     - English: `"Drop files or folders here to upload to [Agency Name]"`
3. **Remove Technical Sub-Headers & Lock Down Connection Dialog**:
   - Strip technical protocol/port strings (e.g., `ftps.shutterstock.com:21 (FTPS -> /)`) from headers and tooltips.
   - In the Connection Dialog, enforce `readOnly` and `disabled` on the **Host** input across all agencies, and hide Port and Protocol fields from the UI completely.
4. **Subtle 123RF AI Batch Toggle**:
   - Place a clean, understated `[x] AI-Generated Batch` checkbox bar directly integrated with the 123RF dropzone/toolbar without decorative badges.

### Backend Routing Verification (`electron/ftpManager.cjs`, `src/services/ftp/oneTwoThreeRfFtpRouter.ts`, `src/services/ftp/ftpClientService.ts`)
- Confirm silent backend protocol, port, and remote directory resolution:
  - **Vecteezy**: `content-ftp.eezy.com` | SFTP | Port `22` | Target: `/`
  - **Shutterstock**: `ftps.shutterstock.com` | FTPS (Explicit TLS) | Port `21` | Target: `/`
  - **Adobe Stock**: `sftp.contributor.adobestock.com` | SFTP | Port `22` | Target: `/`
  - **Freepik**: `ftp.freepik.com` | SFTP | Port `22` | Target: `/`
  - **Magnific**: `contributor-ftp.magnific.com` | SFTP | Port `60022` | Target: `/`
  - **Dreamstime**: `upload.dreamstime.com` | FTP | Port `21` | Target: `/`
  - **123RF** (Dynamic routing by extension + AI toggle):
    - Photos (`.jpg`): `ftp.123rf.com` (FTP, Port `21`) $\rightarrow$ `/ai_image` when AI-checked, `/` when Real.
    - Vectors (`.eps`): `ftp.123rf.com` (FTP, Port `21`) $\rightarrow$ `/vector` (always Real; uploads matching `.jpg` preview first, then `.eps`).
    - Videos (`.mp4`, `.mov`): `footage.ftp.123rf.com` (SFTP, Port `2022`) $\rightarrow$ `/ai_video` when AI-checked, `/` when Real.

---

## Task 3: Studio AI Banner Reactivity Fix (`src/features/studio/StudioView.tsx`)

- Listen to the `stockflow:ai-mode-changed` custom window event dispatched by `KeyRingView`.
- Immediately update local state (`explicitAiMode`) when `detail.mode === 'local'` or `'cloud'`, computing `isLocalMode` synchronously so the `"API Key Required"` warning banner disappears the instant the user switches to Local AI mode.

---

## Task 4: Distribution Tracker UI Purge & Thumbnail Fix (`src/features/tracker/DistributionTrackerView.tsx` & `src/db/index.ts`)

1. **Remove Sample Seeder & Destructive Menu Items**:
   - Remove the `"Load 50 Sample Assets"` button and promotional text from the empty Master Vault state in `DistributionTrackerView.tsx`.
   - Remove `"Reset / Seed 50 Sample Assets"` and `"Clear Master Vault"` from the toolbar `(...)` dropdown menu.
2. **Widen Metadata Edit Modal**:
   - Upgrade the Metadata Inspector & Edit `<Dialog>` size to `size="xl"` (`max-w-4xl`) with balanced column proportions so long titles, descriptions, and keyword lists are easy to read and edit.
3. **Fix Broken Local Image Thumbnails**:
   - Update `resolveAssetPreviewUrl` in `src/db/index.ts` so:
     - Valid in-memory `previewUrl` or generated `thumbnailBase64` (`data:image/...`) is prioritized for non-image files (`.eps`, `.ai`, `.mp4`, `.mov`) and virtual paths (`/StockFlow/Master_Vault/...`) that cannot be rendered raw by `<img src="stockflow://local?path=..." />`.
     - Real on-disk raster image paths (`.jpg`, `.jpeg`, `.png`, `.webp`) resolve cleanly via `stockflow://local?path=...`, and `<img onError>` in `DistributionTrackerView.tsx` gracefully falls back to `thumbnailBase64` or the media-type icon if a local file was moved or deleted.
