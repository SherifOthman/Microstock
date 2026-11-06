# StockFlow Infrastructure Blueprint: Global State Persistence, Crash Recovery & System Tray Architecture

---

## 1. Global State Persistence & Crash Recovery Architecture

### 1.1 Storage Engine Decision: SQLite (`WAL` Mode) with Write-Behind Debouncing
We will use our existing native **SQLite (`better-sqlite3`) engine in Write-Ahead Logging (`WAL`) mode** (`<Documents>/StockFlow/stockflow.sqlite`) rather than `electron-store` or raw JSON files.

**Why SQLite WAL Beats `electron-store` / JSON for High-Volume Queues:**
1. **Zero-Corrupt Atomic Commits on Power Loss:** `electron-store` rewrites and re-serializes an entire JSON file on every update. If power drops mid-write on a 500-file batch, a JSON file can be truncated or corrupted. SQLite in `WAL` (`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;`) guarantees atomic transactions that survive sudden OS crashes or forced process termination (`SIGKILL`).
2. **Non-Blocking Write-Behind Coalescing:** Instead of writing to disk on every 100ms byte-progress tick (which would thrash disk I/O), we separate **Structural State Transitions** from **Byte Progress Telemetry**:
   - **Immediate Transactional Flush (`0ms`):** Triggered only on state transitions (`queued` $\rightarrow$ `uploading`, `Phase A JPG uploaded`, `succeeded`, `skipped`, `failed`, `paused`, `clearQueue`, `addFiles`, `removeItem`). Using a pre-compiled `better-sqlite3` prepared statement inside a single transaction takes `< 0.4ms`.
   - **Throttled Checkpoint Flush (`2500ms` coalesce):** While a large video is streaming, byte progress is kept in memory and only checkpointed to SQLite at most once every 2.5 seconds or on `before-quit`.
3. **Plug-and-Play Multi-Module Schema:** A single unified table (`persistent_task_queues`) keyed by `module_id` (`'ftp'`, `'studio'`, `'eps'`, `'cleaner'`, `'audio'`) allows any StockFlow tool to persist and hydrate its queue using the exact same IPC contract and React hook.

---

### 1.2 Database Schema (`electron/sqliteDb.cjs`)
We will add a dedicated `persistent_task_queues` table to `sqliteDb.cjs`:

```sql
CREATE TABLE IF NOT EXISTS persistent_task_queues (
  module_id TEXT PRIMARY KEY,          -- 'ftp' | 'studio' | 'eps' | 'cleaner' | 'audio'
  session_id TEXT,                     -- Active batch session UUID
  batch_status TEXT NOT NULL,          -- 'idle' | 'running' | 'paused' | 'completed'
  agency_id TEXT DEFAULT 'dreamstime', -- Target agency context
  queue_json TEXT NOT NULL,            -- Serialized array of queue items (localPath, remotePath, status, jpgPart, epsPart, retryCount, etc.)
  telemetry_json TEXT NOT NULL,        -- Serialized snapshot of batch counters & elapsed time
  updated_at INTEGER NOT NULL          -- Unix timestamp (ms)
);
```

> **Note on File Handles Across Restarts:** Browser `File` blob objects (`fileObject`) and `blob:` URLs cannot survive an app restart, whereas native filesystem paths (`localPath` and `jpgPart.localPath` / `epsPart.localPath`) do. On hydration:
> - Each restored item reconstructs its `previewUrl` deterministically as `stockflow://local?path=${encodeURIComponent(localPath)}`.
> - The Electron FTP worker (`electron/ftpManager.cjs`) already streams directly from `fs.createReadStream(localPath)` whenever `localPath` exists on disk.

---

### 1.3 Crash Recovery & Hydration Lifecycle (`Paused` State with 1-Click Resume)
1. **Continuous Write-Behind Sync (`src/services/persistence/queuePersistenceService.ts`):**
   - Exposes `saveModuleQueueSnapshot(moduleId, snapshot, immediate)` with a `300ms` debounce for rapid UI mutations (e.g., dropping 100 files) and immediate execution when a file finishes (`succeeded`, `skipped`, `failed`) or when the user pauses/clears the queue.
2. **Startup Hydration & Mid-Flight Sanitization (`hydrateModuleQueueSnapshot(moduleId)`):**
   - When StockFlow starts, `DreamstimeFtpOrchestrator.initializeFromDisk()` queries `db.queues.getSnapshot('ftp')`.
   - If a snapshot exists with unfinished items (`status === 'uploading'`, `'queued'`, `'retry'`, or `'retrying'`):
     - Any item that was mid-flight (`status === 'uploading'`) when the crash/power loss occurred is sanitized back to `status = 'queued'` (with `bytesTransferred = 0`, `progressPercent = 0`).
     - **Vector Bundle Partial Recovery:** If a `Vector Bundle (JPG + EPS)` had already completed Phase A (`jpgPart.uploaded === true`) before the crash, `jpgPart.uploaded` is preserved so resuming starts directly at Phase B (`EPS` $\rightarrow$ `/additional`) without re-uploading the preview JPEG.
     - If `batch_status` was `'running'` or `'paused'` and pending items remain, the orchestrator hydrates in a **Paused / Interrupted Recovery state** (`isRunning: false`, `isPaused: false`, `hasRecoverableSession: true`) so the user sees their exact queue (Completed, Skipped, Failed, and Queued files) and a **1-click `Resume Upload (N)`** button in the toolbar.

---

## 2. Background Execution & Minimize-to-System-Tray Architecture

### 2.1 Window Close Interception (`electron/main.cjs`)
Currently, clicking the custom `[X]` button in `CustomTitleBar.tsx` sends `ipcRenderer.send('window-close')`, which calls `mainWindow.close()`, terminating the window even if an upload is running.

We will re-architect the lifecycle in `electron/main.cjs` using two state flags:
- `isForceQuitting = false`: Set to `true` **only** when the user explicitly selects `Quit StockFlow` from the System Tray menu (or when `app.quit()` is triggered while idle).
- `activeBackgroundTasks`: A `Map<string, { moduleId: string; isRunning: boolean; isPaused: boolean; label: string; progressPercent: number }>` maintained in the Main Process and updated via IPC.

**Close Decision Matrix when the user clicks `[X]` (`mainWindow.on('close', ...)`):**
1. **Case A — Task Active or Paused (`hasActiveOrPausedTasks() === true`) and `!isForceQuitting`:**
   - Call `event.preventDefault()` so the BrowserWindow is **not** destroyed and the React/Electron process keeps running.
   - Call `mainWindow.hide()` and `mainWindow.setSkipTaskbar(true)` so the window minimizes cleanly into the Windows System Tray.
   - Ensure the native `Tray` icon is visible and fire a one-time native Windows notification:
     - **Title:** `StockFlow is running in the background`
     - **Body:** `Active task minimized to System Tray. Right-click the tray icon to Show, Pause, or Quit.`
2. **Case B — Completely Idle (`hasActiveOrPausedTasks() === false`) or `isForceQuitting === true`:**
   - Allow `mainWindow.close()` to proceed normally, trigger `sqliteDb.performHotBackup('app_quit')`, destroy the tray icon, and exit the process cleanly.

---

### 2.2 Windows Native System Tray & Dynamic Context Menu (`electron/trayManager.cjs`)
We will create a dedicated `electron/trayManager.cjs` module managed by `electron/main.cjs`:
- **Tray Icon & Tooltip:**
  - Uses a crisp programmatic 16×16 / 32×32 `nativeImage` StockFlow emblem (with fallback to the app icon) so it renders sharply on both light and dark Windows 10/11 taskbars.
  - Updates `tray.setToolTip(...)` dynamically as telemetry progresses (e.g., `StockFlow — Uploading 2/5 (45%) · 625 KB/s` or `StockFlow — Idle`).
  - Double-clicking or left-clicking the Tray icon restores and focuses `mainWindow` (`mainWindow.setSkipTaskbar(false); mainWindow.show(); mainWindow.focus();`).
- **Dynamic Context Menu (`Menu.buildFromTemplate`):**
  - **`StockFlow Studio — [Status Label]`** *(disabled header item showing live progress, e.g., `Uploading 2/5 (45%)` or `Paused`)*
  - **Separator**
  - **`Show App`** $\rightarrow$ Restores and focuses `mainWindow`.
  - **`Pause Uploads` / `Resume Uploads`** $\rightarrow$ Dynamically toggles based on whether the active task is running or paused; dispatches `tray:command` (`'pause-all'` | `'resume-all'`) to the renderer and/or pauses the main-process worker.
  - **Separator**
  - **`Quit StockFlow`** $\rightarrow$ Sets `isForceQuitting = true`, aborts active FTP socket cleanly, flushes the latest queue state to SQLite so it can be resumed next launch, and calls `app.quit()`.

---

### 2.3 Bi-Directional IPC Synchronization Contract
To keep the Main Process, System Tray, and React Frontend strictly synchronized:

| IPC Channel | Direction | Purpose |
| :--- | :--- | :--- |
| `task:updateLifecycleState` | Renderer $\rightarrow$ Main (`invoke`) | Reports `{ moduleId, isRunning, isPaused, progressPercent, statusLabel }` whenever a task starts, pauses, resumes, updates progress, or finishes. Main process uses this to decide whether `[X]` minimizes to Tray or quits, and rebuilds the Tray menu/tooltip. |
| `tray:onCommand` | Main $\rightarrow$ Renderer (`on`) | Pushes `'pause-all'`, `'resume-all'`, or `'prepare-force-quit'` when the user clicks items in the Windows System Tray menu. |
| `db:invoke('queues:saveSnapshot', ...)` | Renderer $\rightarrow$ Main (`invoke`) | Persists the serialized queue and telemetry snapshot into SQLite `persistent_task_queues`. |
| `db:invoke('queues:getSnapshot', ...)` | Renderer $\rightarrow$ Main (`invoke`) | Hydrates the saved queue snapshot for a given `moduleId` on app startup. |
| `db:invoke('queues:clearSnapshot', ...)` | Renderer $\rightarrow$ Main (`invoke`) | Clears the persisted snapshot when the user clicks `Clear All`. |

---

## 3. File-by-File Implementation Plan

### Main Process & Preload Bridge
1. **`/electron/sqliteDb.cjs`** *(Modify)*:
   - Add `CREATE TABLE IF NOT EXISTS persistent_task_queues (...)` to schema initialization.
   - Implement `queues_saveSnapshot(payload)`, `queues_getSnapshot(moduleId)`, and `queues_clearSnapshot(moduleId)` using prepared statements in WAL mode, plus memory-fallback equivalents for unit tests.
2. **`/electron/trayManager.cjs`** *(Create)*:
   - Encapsulate Electron `Tray` creation, high-DPI `nativeImage` icon generation, dynamic tooltip updates, and context menu rebuilding (`Show App`, `Pause Uploads` / `Resume Uploads`, `Quit StockFlow`).
3. **`/electron/main.cjs`** *(Modify)*:
   - Integrate `TrayManager` and `activeBackgroundTasks` registry.
   - Attach `mainWindow.on('close', ...)` handler that checks `hasActiveOrPausedTasks()`: if active/paused and `!isForceQuitting`, calls `event.preventDefault()`, hides `mainWindow` to System Tray, and shows a native background toast notification; if idle, quits normally.
   - Register IPC handlers `task:updateLifecycleState` and `app:getBackgroundTaskState`.
4. **`/electron/preload.cjs` & `/src/vite-env.d.ts`** *(Modify)*:
   - Expose `window.electronAPI.tasks.updateLifecycleState(state)` and `window.electronAPI.tasks.onTrayCommand(callback)`.

### Frontend Services, Hooks & UI
5. **`/src/db/index.ts`** *(Modify)*:
   - Add `db.queues.saveSnapshot(...)`, `db.queues.getSnapshot(moduleId)`, and `db.queues.clearSnapshot(moduleId)` with full support for both Electron SQLite IPC and Vitest in-memory fallback.
6. **`/src/services/persistence/queuePersistenceService.ts` & `/src/hooks/usePersistentTaskQueue.ts`** *(Create)*:
   - Global, reusable persistence & lifecycle service that any module (`ftp`, `studio`, `eps`, `cleaner`, `audio`) can plug into.
   - Handles debounced write-behind persistence (`300ms` for rapid edits, immediate on state transitions), crash-recovery hydration (resetting mid-flight `'uploading'` items to `'queued'` while preserving completed Vector Bundle `jpgPart.uploaded` state), and reporting task status to the Electron Main Process for System Tray protection.
7. **`/src/services/ftp/ftpClientService.ts` & `/src/features/ftp/FtpUploaderView.tsx`** *(Modify)*:
   - Wire `DreamstimeFtpOrchestrator` into `queuePersistenceService` so adding files, removing files, completing/skipping/failing files, pausing, and clearing automatically sync with SQLite.
   - Hydrate unfinished queues on startup in a **Paused / Interrupted Recovery** state with a clear recovery banner and **1-Click `Resume Upload (N)`** button.
   - Listen to `window.electronAPI.tasks.onTrayCommand` so clicking `Pause Uploads` or `Resume Uploads` from the Windows System Tray immediately pauses or resumes the FTP orchestrator.
8. **`/tests/unit/ftp-uploader.test.ts`** *(Modify)*:
   - Add automated unit tests verifying:
     - Crash recovery hydration: mid-flight `'uploading'` items reset to `'queued'`, completed items remain `'succeeded'`, Vector Bundle partial Phase A state is preserved, and batch hydrates in Paused/Ready-to-Resume state.
     - Close-to-Tray vs. Quit-when-Idle state reporting and System Tray command handling (`pause-all` / `resume-all`).
