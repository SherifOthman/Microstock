# StockFlow Enterprise Stability, Persistence & UX Polish Blueprint

This blueprint diagnoses the root causes of the unexpected UI freezes across the application and details the architectural fixes for process-wide stability, smart OS notifications, FTP `550 Overwrite` recovery, universal tool persistence, Light Mode contrast, and RTL modal ergonomics.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Root-Cause Diagnosis of the Unexpected Freezes**: After auditing the Electron Main Process, SQLite IPC bridge, and React component lifecycle, we found that the freezes are **not** caused by a single component—they are caused by **four compounding bottlenecks** that can deadlock the Renderer or Main Process at any time (whether navigating tabs, uploading in the background, or idling):
> 1. **Hidden Keep-Alive DOM Tree (`display: none` for all 7 tabs simultaneously)**: Currently, the root application shell keeps all 7 heavy workspaces mounted in the DOM at all times using CSS `hidden`. Every database notification triggers **14 concurrent IPC queries** (including 4 simultaneous full-table `masterRecords` fetches carrying megabytes of Base64 thumbnails) and forces all 7 views—and their `@tanstack/react-virtual` `ResizeObserver` loops—to re-render simultaneously in the background.
> 2. **Windows System Tray GDI & Native Menu Rebuild Storm**: During active tasks, the persistence heartbeat invokes `task:updateLifecycleState` every 1 second, which allocates a brand-new `nativeImage` bitmap buffer, calls `tray.setImage()`, and rebuilds the native Win32 context menu (`Menu.buildFromTemplate` + `tray.setContextMenu()`) **every single second**. On Windows, mutating native Tray GDI handles and context menus at 1 Hz blocks the Electron Main Process UI thread and deadlocks IPC.
> 3. **Unscoped Database Broadcasts (`notifyDbChanged`)**: Logging a single FTP file transfer or updating a session timestamp broadcasts a global DB change event that forces the Overview, Distribution Tracker, Metadata Studio, and FTP Uploader to re-fetch and deserialize the entire `master_records` table over IPC.
> 4. **Continuous Background IPC Polling**: The custom title bar polls `window-is-maximized` over IPC every 1,000ms indefinitely, and the FTP telemetry hook runs a 500ms `setInterval` even when the FTP tab is not visible.

- **Confirmed Decision 1 (True Unmount on Navigation + Singleton/SQLite State)**: Replace the `display: none` keep-alive wrapper with true conditional rendering per active tab so inactive views cleanly unmount, run their `useEffect` teardowns, release `blob:` URLs, and detach `ResizeObserver` instances—while preserving 100% of their queue state in our global persistence layer.
- **Confirmed Decision 2 (Silent Background Minimize & Focus-Aware Completion Toast)**: Completely remove the "Running in Background" OS toast on window close, and gate the "Batch Complete" OS notification behind `!mainWindow.isVisible() || mainWindow.isMinimized() || !mainWindow.isFocused()` with click-to-restore support.
- **Confirmed Decision 3 (Pre-Upload `DELE` Before `STOR`)**: Issue a raw `DELE <remote_filename>` wrapped in a silent `try/catch` immediately prior to `uploadFrom` whenever uploading a file (or resuming after an interrupted stream) so partial server remnants on Dreamstime never trigger `550 Permission denied`.

---

## 1. Overview & Core Concept

- **What It Does**: Eliminates unexpected UI freezes and Main Process deadlocks, silences noisy background notifications, resolves Dreamstime's `550 Overwrite` error on interrupted uploads, extends crash-resilient state persistence and `[X]` close protection to all 6 workspace tools, and polishes Light Mode contrast and RTL modal close button placement.
- **Target Audience / Persona**: Professional microstock contributors running long multi-gigabyte batches across AI tagging, EPS rasterization, lossless audio stripping, file cleaning, and FTP distribution while multitasking or minimizing StockFlow to the Windows System Tray.
- **Key Value**: Zero UI lockups when switching tabs or running background tasks, seamless crash/restart recovery across every tool in the suite, and distraction-free native OS notifications.

---

## 2. User Experience & Visual Design

- **1. Zero-Lag Tab Navigation & Unmount Cleanup**:
  - Switching between *Overview*, *Distribution Tracker*, *Metadata Studio*, *File Cleaner*, *EPS Engine*, *Audio Stripper*, and *FTP Uploader* immediately unmounts the departing view, cancelling any pending `useSqliteQuery` subscriptions, revoking temporary `blob:` preview URLs, and stopping UI-only timers while background singleton workers continue uninterrupted.
- **2. Smart OS Notification Flow**:
  - **Closing (`[X]`) During Active or Paused Tasks**: The window hides smoothly into the Windows System Tray with **zero** "Running in background" popup toast.
  - **Batch Completion Notification**: When an upload or processing batch finishes, the Main Process checks window visibility and focus:
    - If the user is actively looking at StockFlow (`isVisible() && !isMinimized() && isFocused()`), **no OS toast is shown** (the in-app completion banner provides immediate feedback).
    - If StockFlow is minimized, hidden to the System Tray, or behind another application (`!isVisible() || isMinimized() || !isFocused()`), a single native Windows notification fires. Clicking the notification immediately restores and focuses the StockFlow window.
- **3. High-Contrast Dual-Theme Alert Banners (Light & Dark Mode)**:
  - **Session Restored Banner (Yellow/Amber)**: Uses `bg-amber-500/10 dark:bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200` with `text-amber-700 dark:text-amber-400` icons so text is crisp and legible against white/slate Light Mode backgrounds as well as Dark Mode.
  - **Upload Complete Banner (Green/Emerald & Warning Amber)**: Uses `bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200` (and `bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200` when failures exist) so completion summaries never appear washed out in Light Mode.
- **4. Fixed Right-Aligned `[X]` Close Button Across LTR & RTL**:
  - Every modal dialog (`DialogContent` and `MediaLightboxModal`) anchors its `[X]` close button strictly at the top-right (`right-4 left-auto`) regardless of whether the interface is in English (LTR) or Arabic (RTL).
  - Dialog headers apply symmetric end/right clearance (`pe-8 pr-10`) so right-aligned Arabic titles never collide with or overlap the top-right `[X]` button.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Elimination of Multi-Tab DOM Keep-Alive & Scoped SQLite Pub/Sub**
  - *Chosen Approach*: Conditionally render only the active tab in the main workspace, cache Tray icons/menus in the Main Process so they only update on actual state transitions (`idle` $\leftrightarrow$ `running` $\leftrightarrow$ `paused`), and scope `notifyDbChanged(immediate, scope)` by domain (`'master' | 'ftp' | 'keys' | 'settings'`).
  - *Why*: Rendering all 7 tabs simultaneously caused every SQLite write to trigger 4 parallel full-table `master_records` IPC serializations and hidden virtualizer layout loops. Scoping DB events and unmounting inactive views cuts IPC payload volume by over 90% and eliminates Renderer/Main thread contention.
  - *Alternatives Considered*: Keeping `display: none` and throttling `notifyDbChanged` to 2 seconds—rejected because deserializing 4 copies of `master_records` simultaneously still spikes the main thread for 300–800ms per tick.
- **Decision 2: Pre-Emptive `DELE` Before `STOR` on FTP Uploads**
  - *Chosen Approach*: Before calling `client.uploadFrom(readableStream, targetName)` in the Electron FTP worker, execute `await this.client.remove(targetName)` (which sends `DELE <targetName>`) inside a silent `try/catch` block whenever a partial file was detected by `SIZE` or when retrying an interrupted transfer.
  - *Why*: Dreamstime's FTP server denies `STOR` overwrite requests (`550 Permission denied`) if a 0-byte or partially uploaded file from a dropped socket already exists in the directory. Explicitly deleting the partial remnant before opening the `STOR` data channel guarantees a clean write.
  - *Alternatives Considered*: Using FTP `APPE` (Append) or `REST` (Restart)—rejected because Dreamstime's FTP daemon frequently disables `APPE`/`REST` or corrupts video headers on appended streams.
- **Decision 3: Unified Global Task Lifecycle & Persistence Registry**
  - *Chosen Approach*: Connect all 6 tools (*FTP Uploader*, *Metadata Studio*, *Distribution Tracker Ingestion*, *File Cleaner*, *EPS Engine*, and *Audio Stripper*) to a unified **Global Lifecycle Aggregator** in `queuePersistenceService` and `usePersistentTaskQueue`.
  - *Why*: If *any* tool has an active or paused batch (`isRunning || isPaused`), the Main Process receives the aggregated lifecycle status so `powerSaveBlocker` stays engaged and clicking `[X]` safely minimizes to the System Tray instead of killing an in-progress AI tagging, EPS rendering, audio stripping, or file-cleaning batch.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                        RENDERER PROCESS (React + Singleton Services)              │
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │ Active View Conditional Router (Only 1 Workspace Mounted in DOM at a Time)  │  │
│  │  • Overview   • Tracker   • Studio   • Cleaner   • EPS   • Muter   • FTP    │  │
│  └──────────────────────┬──────────────────────────────────────┬───────────────┘  │
│                         │ Scoped DB Subscriptions              │ Hydrate / Sync   │
│                         ▼                                      ▼                  │
│  ┌────────────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │ Scoped SQLite Query Bus            │  │ Global Task Persistence & Lifecycle │  │
│  │ • Scopes: 'master' | 'ftp' |       │  │ • FTP Orchestrator  • BatchQueue    │  │
│  │   'keys' | 'settings'              │  │ • AtomicIngestion   • FileCleaner   │  │
│  │ • Abort-safe useEffect cleanup     │  │ • EpsConverter      • VideoMuter    │  │
│  │ • In-flight IPC deduplication      │  │ • Throttled 1s SQLite Write-Behind  │  │
│  └──────────────────────┬─────────────┘  └─────────────────────┬───────────────┘  │
└─────────────────────────┼──────────────────────────────────────┼──────────────────┘
                          │ IPC (sqlite:call)                    │ IPC (State Transitions Only)
┌─────────────────────────▼──────────────────────────────────────▼──────────────────┐
│                             ELECTRON MAIN PROCESS                                 │
│                                                                                   │
│  ┌──────────────────────────┐  ┌─────────────────────────┐  ┌──────────────────┐  │
│  │ SQLite WAL Engine        │  │ Cached System Tray &    │  │ Native FTP       │  │
│  │ • persistent_task_queues │  │ Smart Notification Gate │  │ Worker           │  │
│  │ • Fast non-blocking      │  │ • Pre-allocated Icons   │  │ • SIZE check     │  │
│  │   prepared statements    │  │ • Focus/Visible check   │  │ • Silent DELE    │  │
│  │                          │  │ • Click-to-Restore      │  │   before STOR    │  │
│  └──────────────────────────┘  └─────────────────────────┘  └──────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### Detailed Execution Steps by Requirement

#### 1. Eliminating UI Freezes & Memory Leaks on Navigation
- **True Tab Unmounting**: Update the main workspace container so only the currently selected `activeTab` is mounted in the React tree. When the user switches tabs, React immediately runs all `useEffect` cleanup functions on the previous tab, stopping its `ResizeObserver` virtualizers and freeing DOM memory.
- **Scoped SQLite Change Bus & In-Flight Deduplication**:
  - Update `notifyDbChanged(immediate, scope)` so FTP transfer logging (`db.ftp.logTransfer`, `db.ftp.updateSession`) emits `'ftp'` scope events and `persistent_task_queues` writes emit **no** UI re-query event at all.
  - Only `'master'` scope writes trigger `db.masterRecords` re-queries.
  - Add in-flight promise deduplication for `getMasterRecords` so if multiple components request `db.masterRecords.toArray()` within the same frame, only 1 IPC call crosses the Electron bridge.
- **Main Process Tray Icon & Menu Caching**:
  - Pre-allocate the 3 `nativeImage` icons (`idle`, `running`, `paused`) once when `TrayManager.init()` runs.
  - In `updateTaskState()`, compare the incoming state against the previous state: only call `this.tray.setImage()` and `this.tray.setContextMenu(Menu.buildFromTemplate(...))` when `status` (`idle` | `running` | `paused`) or `language` actually changes—never on 1-second progress percentage ticks.
  - Throttle `this.tray.setToolTip()` updates to at most once every 3 seconds.
- **Event-Driven Window Maximize State & Timer Cleanups**:
  - Remove the 1,000ms `setInterval` IPC polling from `CustomTitleBar` and check state only on window resize events.
  - In `FtpUploaderView`, merge the 500ms telemetry interval into a lightweight 1,000ms tick that only runs while `telemetry.isRunning && !telemetry.isPaused`, and cleanly clears on unmount.

#### 2. Smart OS Notification Logic
- **Disable "Running in Background" Toast**:
  - In `mainWindow.on('close')` inside the Main Process, remove `trayManager.notifyMinimizedToTray()` completely. When a task is active or paused, `event.preventDefault()` and `mainWindow.hide()` will silently minimize StockFlow to the System Tray without any popup toast.
- **Focus-Aware "Batch Complete" Notification with Click-to-Restore**:
  - In the Main Process handler for `app:notifyBatchComplete` (and `notify-upload-complete`), inspect `mainWindow`:
    ```js
    const isActivelyFocused =
      mainWindow &&
      !mainWindow.isDestroyed() &&
      mainWindow.isVisible() &&
      !mainWindow.isMinimized() &&
      mainWindow.isFocused();
    if (isActivelyFocused) {
      return { success: true, skippedBecauseFocused: true };
    }
    ```
  - When the window is minimized, hidden in the Tray, or unfocused, fire the `Notification` and attach `notif.on('click', () => trayManager.showMainWindow())` so clicking the toast brings StockFlow to the foreground.

#### 3. Fixing the `550 Overwrite` FTP Bug
- **Silent Pre-Upload `DELE` Command**:
  - In the Electron FTP worker's `uploadSingleFileWithRetry` method:
    1. Perform the existing `SIZE <targetName>` check. If `remoteSize === localSize && localSize > 0`, return `status: 'skipped'` (duplicate protection remains intact).
    2. Otherwise (whether `remoteSize >= 0` indicating a partial/corrupted file on the server, or `attempt > 1` after a dropped stream, or prior to `STOR`), execute a raw delete wrapped in an ignored `try/catch`:
       ```js
       try {
         await this.client.send(`DELE ${targetName}`);
       } catch {
         // Ignore 550 File not found when no partial file exists
       }
       ```
    3. Immediately proceed to `await this.client.uploadFrom(readableStream, targetName)` so Dreamstime always writes to a clean target filename.

#### 4. Wiring Persistence & Lifecycle Safety to All Other Tools
- **Global Task Lifecycle Aggregator**:
  - Upgrade `queuePersistenceService` to maintain a map of active tool states (`ftp`, `studio`, `tracker`, `cleaner`, `eps`, `muter`).
  - Whenever any tool updates its status, `queuePersistenceService` computes the highest-priority global status (`running` if any tool is running, `paused` if any tool is paused/interrupted, otherwise `idle`) and syncs it to the Main Process (`task:updateLifecycleState` + `powerSaveBlocker`).
- **Tool-by-Tool Persistence & Hydration**:
  - **Metadata Studio (`BatchQueueService`)**: Persist queue items (using `nativePath`, metadata status, and retry counters) to `persistent_task_queues` (`tool_id = 'studio'`). On app launch, hydrate unfinished items in `paused` state so the user can click **Resume** in Metadata Studio. Report `running` / `paused` / `idle` to the Global Lifecycle Aggregator.
  - **Distribution Tracker (`atomicIngestionService`)**: Persist active ingestion queue items (`tool_id = 'tracker'`), report `running` status during vault ingestion so `[X]` protects active file commits, and hydrate unfinished ingestion items on startup.
  - **File Cleaner (`useFileCleaner`)**: Persist the active cleaner queue (`nativePath`, `originalName`, `cleanedName`, `customName`, `subFolder`, `batchFolder`, `assetOrigin`, and cleaner options) under `tool_id = 'cleaner'`. When the user navigates away or restarts the app, re-hydrate the files directly from disk via `electronAPI.readLocalFile(nativePath)` and report `isProcessing` / `isBulkMoving` to the Global Lifecycle Aggregator.
  - **EPS Engine (`useEpsConverter`)**: Persist queued EPS items (`nativePath`, `originalName`, `outputJpgName`, `status`, `previewThumbnailUrl`) under `tool_id = 'eps'`. Reconstruct `File` handles from `nativePath` on hydration, and report `isConvertingBatch` to the Global Lifecycle Aggregator.
  - **Audio Stripper (`useVideoMuter`)**: Persist queued video items (`nativePath`, `originalName`, `size`, `hasAudio`, `status`, `mutedSize`) under `tool_id = 'muter'`. Reconstruct `File` handles from `nativePath` on hydration, and report `isMutingBatch` / `isExporting` to the Global Lifecycle Aggregator.

#### 5. Light Mode Contrast Polish
- Update `FtpUploaderView`:
  - **Crash Recovery ("Session Restored") Banner**: Replace `text-amber-300` with `bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200` and icon `text-amber-600 dark:text-amber-400`.
  - **Upload Complete Alert Bar**: Replace `text-amber-300` / `text-emerald-400` with `bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200` (warning state) and `bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200` (success state).
  - Also update the telemetry badges (`Data`, `Speed`, `Time Left`, `Time Elapsed`) to use dual-theme text classes (`text-sky-700 dark:text-sky-400`, `text-emerald-700 dark:text-emerald-400`, `text-amber-700 dark:text-amber-400`, `text-purple-700 dark:text-purple-400`) so the entire FTP bar is crisp in Light Mode.

#### 6. Enforce Right-Aligned Close Button in RTL
- **Standard Modals (`DialogContent` & `DialogHeader`)**:
  - Remove `isRtl ? 'left-4 right-auto' : 'right-4 left-auto'` from `DialogContent` so the close button always uses `right-4 left-auto`.
  - Update `DialogHeader` to use `pr-10` (physical right padding) instead of logical `pe-6`, ensuring that in both LTR and RTL (where Arabic titles align to the right edge), header text always leaves a clean 40px buffer before the fixed top-right `[X]` button.
- **Media Preview Lightbox (`MediaLightboxModal`)**:
  - Set `dir="ltr"` on the top header bar of `MediaLightboxModal` so the `[X]` close button and zoom controls remain permanently anchored on the right side in both English and Arabic.
