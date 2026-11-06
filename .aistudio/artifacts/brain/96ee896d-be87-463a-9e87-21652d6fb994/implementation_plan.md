# Dual-Database Storage, Zero-Base64 Native Streaming & Portable Workspace Blueprint

This Execution Blueprint re-architects StockFlow's persistence layer by splitting permanent portfolio data (`userdata.sqlite`) from high-frequency ephemeral task queues (`local_queues.sqlite`), completely eliminating Base64 database bloat in favor of native `stockflow://local?path=` disk streaming, introducing smart once-per-day dirty-flag backups with 7-day rolling retention and a custom backup folder, converting stored asset paths to portable relative paths anchored to a Master Workspace Folder, and fixing reactive IPC scopes and Arabic RTL modal headers.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions incorporate your confirmed choices from Phase 1:

- **Confirmed Decision 1 — Clean Start with Dual SQLite Files**: On startup, StockFlow initializes a clean `userdata.sqlite` (permanent portfolio, metadata, agency tracking, API keys, FTP credentials, and app settings) alongside a separate `local_queues.sqlite` (ephemeral `persistent_task_queues`). Any legacy `stockflow.sqlite` file is retired so the 200MB Base64 bloat is immediately eliminated.
- **Confirmed Decision 2 — Dedicated Settings Tab in Sidebar**: A dedicated **Settings** (`⚙️ Settings` / `الإعدادات`) view will be added to the bottom navigation rail, giving contributors a single control center to configure their **Master Workspace Folder**, **Custom Backup Directory** (e.g., Google Drive / OneDrive sync folder), manual backup trigger, and storage diagnostics.

---

## 1. Overview & Core Concept

- **What It Does**: Separates permanent contributor data from high-frequency background queue state, strips all Base64 image strings from SQLite, converts stored file paths to portable relative paths, and replaces aggressive multi-trigger backups with a smart once-daily dirty-checked backup on application exit.
- **Target Audience / Persona**: Professional microstock contributors managing thousands of photos, vectors, and 4K videos across multiple machines or cloud-synced backup folders (Google Drive, Dropbox, OneDrive).
- **Key Value**: Shrinks database size from 200MB+ down to a few kilobytes/megabytes, prevents cloud-sync conflicts caused by queue churn or redundant backups, makes the portfolio portable across PCs and drives, and guarantees instant UI reactivity for API Keys and Settings.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Workspace & Backup Configuration (Settings Tab)**: Clicking **Settings** in the bottom-left sidebar opens a clean, two-section workspace console:
     - **Master Workspace Folder Card**: Displays the active root directory where StockFlow stores and resolves relative asset paths, with a **Change Master Folder** directory picker and an **Open in Explorer** action.
     - **Smart Backup & Retention Card**: Displays the active Backup Directory (defaulting to `<BaseDir>/backups` or user-selected Google Drive folder), a **Select Backup Folder** picker, a live indicator showing whether `userdata.sqlite` has unsaved modifications since the last backup, a **Backup Now** manual button, and a compact table of the last 7 daily backups with file sizes in tabular numerals (`tabular-nums`).
  2. **Native Media Streaming Across All Views**: Gallery cards in Distribution Tracker, Metadata Studio, Export Basket Reconciliation, and Media Lightbox load thumbnails directly from disk via `stockflow://local?path=<resolved_full_path>` (or `<video preload="metadata">` for video clips when no JPEG preview exists), with zero Base64 strings stored in SQLite.
  3. **Bilingual LTR/RTL Modal Headers**: Opening any modal in Arabic (`dir="rtl"`) or English (`dir="ltr"`) keeps the `[X]` close button pinned at `top-4 right-4` while reserving `48px` (`pr-12`) on the physical right side of `DialogHeader` so Arabic right-aligned titles never collide with the close button.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-density utilitarian SaaS workspace console with crisp 1px structural borders (`border-border`), single-elevation cards (`bg-card`), and zero decorative clutter.
  - *Color Palette & Mood*: Dual-theme support (`light` and `dark`) with semantic status indicators (emerald for verified paths/backups, amber for pending dirty state, destructive red for missing disk paths).
  - *Typography & Hierarchy*: Clean sans-serif UI labels paired with monospace tabular figures (`font-mono tabular-nums`) for file sizes, timestamps, and paths.

---

## 3. Key Product Decisions & Trade-Offs

### 1. Database Splitting (`userdata.sqlite` vs. `local_queues.sqlite`)
- **Chosen Approach**: Instantiate two independent `better-sqlite3` connections inside the Main Process database manager:
  1. **`userdata.sqlite`** (WAL mode, `synchronous = NORMAL`): Houses `assets`, `asset_metadata`, `agency_tracking`, `rejection_dictionary`, `export_baskets`, `api_keys`, `batches`, `settings`, `ftp_profiles`, `ftp_sessions`, `ftp_transfer_logs`, and `backup_logs`.
  2. **`local_queues.sqlite`** (WAL mode, `synchronous = NORMAL`): Houses only `persistent_task_queues` (`saveQueueSnapshot`, `getQueueSnapshot`, `clearQueueSnapshot`).
- **Why**: Background tools (FTP Uploader, Metadata Studio, EPS Engine, Audio Stripper, File Cleaner, Distribution Tracker) write queue snapshots every 1.2 seconds during active batches. Isolating `persistent_task_queues` into `local_queues.sqlite` prevents WAL checkpoint contention on `userdata.sqlite`, keeps `userdata.sqlite` tiny and clean, and ensures backups never include transient queue state.

### 2. Zero-Base64 Persistence Rule & Native `stockflow://` Streaming
- **Chosen Approach**:
  - Remove `thumbnail_base64` storage from `userdata.sqlite` (`assets` table schema and `upsertSingleMasterRecord`). Any incoming `thumbnailBase64` property on a record is stripped before SQLite `INSERT`/`UPDATE`.
  - Notice that AI Vision providers still need a transient in-memory base64 frame during `BatchQueueService` / `atomicIngestionService` execution, which is discarded immediately after the API call finishes.
  - For Vector (`.eps`/`.ai`) or Video (`.mp4`/`.mov`) assets that generate a rasterized preview JPEG during ingestion, write the binary JPEG to disk inside `<MasterWorkspace>/.stockflow_previews/<assetId>.jpg` (or alongside the master file) and store its **relative path** in `preview_path`.
  - When `rowToMasterRecord` hydrates records for the renderer, it resolves `preview_path` or `master_path` or `original_path` into an absolute OS path and constructs a native `stockflow://local?path=<encodeURIComponent(fullPath)>` URL.
- **Why**: Eliminates 100% of Base64 text bloat in SQLite (reducing 200MB databases to <2MB for thousands of assets) while leveraging Chromium's native streaming image/video decoder over the privileged `stockflow://` protocol.

### 3. Smart Backup Strategy (Once-Daily Dirty Flag on `app-quit` + 7-Day Rolling Retention + Custom Path)
- **Chosen Approach**:
  - **Remove Automatic Multi-Trigger Backups**: Remove `performHotBackup` calls from `app_startup`, `batch_metadata`, `batch_ingest`, `batch_export`, `batch_reconcile`, and `ftp_batch_complete`.
  - **Dirty Tracking (`isUserDataDirty`)**: Maintain an in-memory `this.isUserDataDirty = false` flag (and persist `last_mutation_at` in `settings`). Every write operation to `userdata.sqlite` (`putMasterRecord`, `bulkPutMasterRecords`, `updateMasterRecord`, `deleteMasterRecord`, `commitAtomicallyToMasterVault`, `createExportBasket`, `reconcileAgencyStatuses`, `putApiKey`, `putSetting`, `saveFtpProfile`, etc.) sets `this.isUserDataDirty = true`. Writes to `local_queues.sqlite` **never** mark `userdata.sqlite` dirty.
  - **Once-Per-Day `app-quit` Gate**: In `app.on('before-quit')`, invoke `sqliteDb.performQuitBackupIfNeeded()`:
    1. Check `if (!this.isUserDataDirty) return null;`
    2. Check the most recent backup timestamp in `backup_logs` (or backup directory files). If a backup was already created on the current local calendar day (`YYYY-MM-DD`)—or within the last 24 hours—skip creating another automated backup.
    3. Otherwise, run `PRAGMA wal_checkpoint(TRUNCATE)` on `userdata.sqlite`, copy **only** `userdata.sqlite` to the configured `customBackupDir` (or default `<baseDir>/backups`) as `userdata_backup_YYYY-MM-DD_<shortId>.sqlite`, and reset `this.isUserDataDirty = false`.
  - **7-Day Rolling Retention**: `pruneOldBackups()` scans the active backup directory and deletes any `userdata_backup_*.sqlite` / `stockflow_backup_*.sqlite` files older than **7 days** (`now - stat.mtimeMs > 7 * 24 * 60 * 60 * 1000`), while always keeping at least the newest backup file if all files are older than 7 days.
  - **Manual Override**: Clicking **Backup Now** in the Settings tab triggers an immediate snapshot of `userdata.sqlite` to the configured backup directory regardless of the daily throttle.

### 4. Relative Path Management (Master Workspace Folder)
- **Chosen Approach**:
  - Store `masterWorkspaceFolder` in `userdata.sqlite` (`settings` key `'master_workspace_folder'`, defaulting to `<Documents>/StockFlow/Master_Vault`).
  - Provide two bidirectional path helpers in `electron/sqliteDb.cjs`:
    - `toRelativeWorkspacePath(inputPath)`: If `inputPath` is inside `masterWorkspaceFolder`, converts it via `path.relative(this.masterVaultDir, inputPath)` normalized to forward slashes (`/`), e.g. `AI/Photos/B01/B01_AI_PH_001.jpg`. If the file resides on a different drive/outside the workspace and wasn't copied into the vault, stores a normalized path or relative path from `baseDir`.
    - `toAbsoluteWorkspacePath(storedPath)`: If `storedPath` is empty, returns `undefined`. If `storedPath` is relative (or starts with a legacy absolute prefix containing `Master_Vault/`), dynamically joins `path.resolve(this.masterVaultDir, extractedRelativePart)` so moving the Master Workspace Folder to another folder or PC immediately relinks all assets.
  - Apply `toRelativeWorkspacePath` on every write (`upsertSingleMasterRecord`, `commitAtomicallyToMasterVault`, `createExportBasket`) and `toAbsoluteWorkspacePath` on every read (`rowToMasterRecord`, `getExportBaskets`).

### 5. Scoped IPC Event Fixes & RTL Modal Header Padding
- **Chosen Approach**:
  - **Fix `subscribeToDbChanges` & `notifyDbChanged`**:
    1. Change the default `watchScopes` parameter in `subscribeToDbChanges(listener, watchScopes = ['all', 'master', 'ftp', 'keys', 'settings'])` so any subscriber that omits `watchScopes` listens to all domain scopes rather than silently dropping `'keys'` and `'settings'`.
    2. Fix `setAiExecutionMode`, `saveLocalAiConfig`, `saveAppSettings`, and `setDesktopSetting` in `src/db/index.ts` so they explicitly emit `notifyDbChanged(true, 'settings')` (instead of defaulting to `'master'`).
    3. Fix `db.apiKeys.put`, `db.apiKeys.update`, `db.apiKeys.delete`, `db.apiKeys.bulkPut`, and `db.apiKeys.clear` to emit `notifyDbChanged(true, 'keys')` immediately (`immediate = true`), and subscribe `KeyRingScheduler` to `subscribeToDbChanges(() => this.refreshKeys(), ['keys'])` (guarded against internal self-writes) so `useApiKeys` / `KeyRingView` / `StudioView` / `App.tsx` update instantaneously whenever keys change.
  - **Fix RTL Modal Header Overlap (`DialogHeader`)**:
    1. In `src/components/ui/dialog.tsx`, the `[X]` close button is physically fixed at `top-4 right-4 left-auto`.
    2. In `DialogHeader`, place `pr-12 rtl:ps-12` **after** `className` inside `cn('flex flex-col gap-1 text-start', className, 'pr-12 rtl:ps-12')`. Placing `pr-12 rtl:ps-12` after `className` prevents `<DialogHeader className="px-5 ...">` in `LegacyDialogProps` from overriding `padding-right` via `tailwind-merge`, guaranteeing a 48px safe zone on the right side in both Arabic RTL and English LTR.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Dual-SQLite Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         React Renderer Process (UI Views)                        │
│                                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │  Distribution       │  │  KeyRing & Studio   │  │  New Settings Tab        │  │
│  │  Tracker & Gallery  │  │  (Scoped IPC:       │  │  • Master Workspace Path │  │
│  │  <img src="         │  │   'keys','settings')│  │  • Custom Backup Folder  │  │
│  │   stockflow://..."> │  │                     │  │  • 7-Day Backup History  │  │
│  └──────────┬──────────┘  └──────────┬──────────┘  └─────────────┬────────────┘  │
└─────────────┼────────────────────────┼───────────────────────────┼───────────────┘
              │                        │                           │
              ▼                        ▼                           ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                     Electron Main Process (sqliteDb.cjs)                         │
│                                                                                  │
│  ┌───────────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │  1. Permanent DB: userdata.sqlite     │  │ 2. Ephemeral DB:                │  │
│  │  • assets (NO Base64, Relative Paths) │  │    local_queues.sqlite          │  │
│  │  • asset_metadata & agency_tracking   │  │ • persistent_task_queues        │  │
│  │  • api_keys, settings, ftp_profiles   │  │ • High-frequency 1.2s writes    │  │
│  │  • Tracks: isUserDataDirty = true     │  │ • Completely ignored by Backups │  │
│  └───────────────────┬───────────────────┘  └─────────────────────────────────┘  │
│                      │                                                           │
│                      ▼ (On app-quit ONLY if isUserDataDirty && < 1 backup today) │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │  Smart Backup Engine -> <CustomBackupDir>/userdata_backup_YYYY-MM-DD.sqlite│  │
│  │  • Auto-prunes backup files older than 7 days                              │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Interactive Component & State Mapping
- **Settings View (`src/features/settings/SettingsView.tsx`)**:
  - **Master Workspace Folder Picker**: Calls `window.electronAPI.selectDirectory()`, invokes `db.tracker.setMasterWorkspaceFolder(newPath)`, updates `settings`, and triggers `notifyDbChanged(true, 'settings')` + `notifyDbChanged(true, 'master')` so all asset paths re-resolve immediately.
  - **Custom Backup Folder Picker**: Calls `window.electronAPI.selectDirectory()`, invokes `db.tracker.setCustomBackupDirectory(newPath)`, persists to `settings`, and refreshes the backup log list.
  - **Manual Backup Action**: Calls `db.tracker.performHotBackup('manual')`, checkpoints `userdata.sqlite`, copies it to the custom backup folder, prunes backups > 7 days old, and updates the UI status badge.
- **Zero-Base64 Asset Hydration**:
  - `rowToMasterRecord` resolves `masterPath`, `previewPath`, and `originalPath` via `toAbsoluteWorkspacePath(...)` and sets `previewUrl: 'stockflow://local?path=' + encodeURIComponent(resolvedPath)` while keeping `thumbnailBase64: ''` in SQLite.
  - Gallery components (`DistributionTrackerView`, `ExportBasketReconcileModal`, `StudioView`, `MediaLightboxModal`) prioritize `stockflow://local?path=` URLs from disk paths.
