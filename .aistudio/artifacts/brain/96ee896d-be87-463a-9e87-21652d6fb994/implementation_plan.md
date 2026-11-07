# Distribution Tracker Overhaul & Tool State Decoupling Blueprint

This blueprint defines the architectural and UX overhaul to strictly isolate tool workspaces, orchestrate mixed-media ingestion and export in the Distribution Tracker, expose real-time pipeline telemetry and platform export configurations, streamline card selection, and harden the EPS and Audio Stripper pipelines.

---

## User Review & Confirmed Decisions

> [!IMPORTANT]
> The following architectural choices incorporate your confirmed preferences and govern the implementation across all six pillars.

- **Confirmed Decision 1 (100% Tool State Separation)**: Metadata Studio, Distribution Tracker, EPS Engine, and Audio Stripper operate in completely isolated state and storage scopes with **no cross-tool handoff or shared asset leakage**. Adding or processing files in Metadata Studio never populates the Distribution Tracker, and importing assets into the Distribution Tracker never populates Metadata Studio.
- **Confirmed Decision 2 (Collapsible Pipeline Drawer)**: Real-time ingestion progress, per-asset stage telemetry, failure diagnostics, and the atomic **"Retry Failed Assets"** action are housed in a **Collapsible Pipeline Drawer** anchored to the Distribution Tracker toolbar with a live status badge.

---

## 1. Overview & Core Concept

- **What It Does**: Transforms the Distribution Tracker into a self-contained, mixed-media portfolio command center while guaranteeing zero state interference across the application's standalone tools.
- **Target Audience / Persona**: High-volume microstock contributors managing mixed batches of AI and Real photos, EPS vectors, and 4K/1080p videos across Adobe Stock, Freepik, Shutterstock, Vecteezy, Dreamstime, and 123RF.
- **Key Value**: Eliminates cross-tool data pollution, prevents accidental modal triggers when selecting cards, provides full visibility and retry control over background ingestion jobs, and exposes agency-specific CSV export configurations directly inside the Tracker workflow.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Pillar 1 — Strictly Isolated Workspaces**:
   - Dropping files into **Metadata Studio** writes exclusively to the `studio` workspace scope (and `local_queues.sqlite` module `'studio'`).
   - Dropping files into **Distribution Tracker** writes exclusively to the `tracker` vault scope (and `local_queues.sqlite` module `'tracker'`).
   - Switching between Studio, Tracker, EPS Engine, and Audio Stripper preserves each tool's independent state without cross-contamination.

2. **Pillar 2 — Tracker Ingestion Prompt & Cross-Tab Mixed-Media Selection**:
   - **Ingestion Origin Prompt ("AI-Generated vs. Real")**: Whenever files or folders are dropped or selected in the Distribution Tracker, an **Ingestion Origin Modal** prompts the contributor before queuing:
     - **AI-Generated Assets** (`Master_Vault/AI/{Photos|Vectors|Videos}/{Batch}`)
     - **Real / Authentic Assets** (`Master_Vault/Real/{Photos|Vectors|Videos}/{Batch}`)
     - Includes an optional Shoot/Batch identifier input (e.g., `B01`) and AI metadata generation toggle.
   - **Persistent Cross-Tab Selection**: `selectedIds` is keyed by immutable asset UUIDs at the Tracker root level and is never cleared when switching between **All Media**, **Photos**, **Vectors**, or **Videos** tabs, or when switching between the 6 agency focus tabs. A live selection counter badge (`"X Selected across tabs"`) remains visible in the command bar.
   - **Mixed-Media Batch Export**: Exporting a mixed selection of Photos, Vectors, and Videos natively routes each asset type according to agency rules in a single pass (e.g., automatically generating both `{batch}_dreamstime_images.csv` for Photos/Vectors and `{batch}_dreamstime_videos.csv` for Videos, while excluding video files from Freepik exports).

3. **Pillar 3 — Collapsible Pipeline Drawer (Transparency, Errors & Retries)**:
   - A **Pipeline Status Button & Badge** in the Tracker toolbar displays real-time progress (`Processing 4/12 · 1 Failed`) and toggles the **Collapsible Pipeline Drawer** directly below the command bar.
   - Inside the drawer:
     - **Overall Batch Progress Bar**: Live percentage and `Current Asset / Total` counter (`tabular-nums`).
     - **Per-Asset Pipeline Stage Feed**: Shows each asset's live stage (`Copying to Temp` $\rightarrow$ `SHA-256 Hash Check` $\rightarrow$ `Extracting EPS Preview` / `Muting Audio` $\rightarrow$ `Generating AI Metadata` $\rightarrow$ `Committed to Vault`) and exact error reason if rolled back.
     - **Atomic Actions**: **"Retry Failed Assets"** button (re-runs all failed items from Step 1) and **"Clear Completed"** button.

4. **Pillar 4 — Tracker Export Configuration Step**:
   - Clicking **Export {Agency}** opens a focused **Export Configuration Modal** prior to generating the CSV and staging the Export Basket:
     - **Freepik (Magnific)**: AI Model selector (e.g., `Google Nano Banana`, `Midjourney v6`, `Flux.1`, custom model) + AI-Generated toggle.
     - **Vecteezy**: License type (`Pro` vs. `Free`) + Web Uploader filename parity toggle.
     - **Shutterstock**: `Editorial`, `Mature Content`, and `Illustration` flags (auto-enabled for vectors).
     - **Dreamstime**: `W-EL`, `P-EL`, `Free`, `Editorial`, and AI Disclosure flags (displays note that mixed batches automatically output both `_images.csv` and `_videos.csv`).
     - **123RF**: Searchable 2-letter ISO Country Code selector (default `EG` or `No Country`).
     - **Adobe Stock**: Displays summary of the 49-keyword cap, Long Title routing, and `.eps` vector extension enforcement.

5. **Pillar 5 — Minimalist Card UX & Selection-First Interaction**:
   - **Selection-First Card Body**: Clicking anywhere on a Gallery Card body, thumbnail, or title **toggles selection** (supporting `Click`, `Shift+Click` range selection, and `Ctrl/Cmd+Click` multi-selection). It **never** opens the metadata modal accidentally.
   - **Explicit View/Edit Trigger**: Only clicking the dedicated, compact **View/Edit (`Eye`) icon button** in the top-right corner of the thumbnail (or row action in List View) opens the Metadata Inspector Modal.
   - **Decluttered Card Footer**: Removes the noisy `Title · Desc · Tags` copy button strip from every card. Each card displays only:
     1. 4:3 visual thumbnail with top-left selection checkbox and top-right `Eye` inspect icon button.
     2. Clean 1-line asset title (`truncate`) + media/origin text metadata (`Photo · AI · 48 tags`).
     3. Active agency status dropdown.

### Visual Identity & Theme

- **Aesthetic Direction**: Utilitarian, high-contrast studio workspace inspired by Capture One and Linear—crisp `1px` structural borders, zero decorative clutter, and instant visual scannability.
- **Color Palette & Dual-Theme Contrast**:
  - Light Mode: `bg-slate-50` canvas with explicit `bg-white border-slate-200 text-slate-900` cards and drawers.
  - Dark Mode: `bg-background` canvas with `bg-card border-border text-foreground` surfaces.
  - Semantic status indicators always pair color with an explicit text label (`Committed`, `Duplicate Skipped`, `Failed`).
- **Typography & Tabular Discipline**: All counters, batch progress ratios (`4/12`), keyword counts (`48 tags`), and file sizes use `font-mono tabular-nums`.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Strict SQLite `workspace_scope` Partitioning (`'studio'` vs. `'tracker'`)**
  - *Chosen Approach*: Add an explicit `workspace_scope` column (`'studio' | 'tracker'`) to the `assets` table in `userdata.sqlite` alongside separate `local_queues.sqlite` snapshots (`'studio'`, `'tracker'`, `'eps'`, `'video'`). Scope `db.masterRecords` queries in Metadata Studio strictly to `workspace_scope = 'studio'` and Distribution Tracker queries strictly to `workspace_scope = 'tracker'`.
  - *Why*: Eliminates the root cause of the interference bug where both tools queried the same unfiltered `assets` table. Even when `useSqliteQuery` fires on `'master'` table mutations, Studio and Tracker only ever see their own isolated records.
  - *Alternatives Considered*: Maintaining two separate `assets` tables (`studio_assets` and `tracker_assets`). A single indexed `workspace_scope` column with scoped DAL methods achieves 100% logical isolation while reusing the existing schema and backup infrastructure.

- **Decision 2: Selection-First Card Click vs. Explicit Inspector Icon**
  - *Chosen Approach*: Bind the entire card container (`onClick`) to `handleToggleItemSelect(rec.id, idx, e)` and restrict `setInspectedAssetId(rec.id)` strictly to the top-right `Eye` icon button (with `e.stopPropagation()`).
  - *Why*: Contributors routinely select dozens of assets across tabs to batch-export or update statuses; opening a modal on thumbnail or title click breaks multi-selection flow.

- **Decision 3: Pre-Commit EPS Rasterization & Disk-Backed Lossless Audio Stripping**
  - *Chosen Approach*: During Tracker ingestion (and in the standalone EPS/Audio tools), vector `.eps` files are rasterized into a companion `.jpg` buffer *while staged in `.stockflow_temp`* before the atomic move to `Master_Vault`. Similarly, video files have their audio `trak` atoms mutated to `free` and written back to the staged temp file *before* moving into `Master_Vault`.
  - *Why*: Guarantees that no vector ever enters the Master Vault without a verified `.jpg` preview on disk, and ensures the physical video file inside `Master_Vault/Videos` is genuinely muted for downstream FTP/agency uploads.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                         ISOLATED STORAGE & QUEUE LAYER                               │
│                                                                                      │
│  ┌────────────────────────────────────────┐  ┌────────────────────────────────────┐  │
│  │ userdata.sqlite (Permanent Data)       │  │ local_queues.sqlite (Ephemeral)    │  │
│  │ • assets (workspace_scope='tracker')   │  │ • queue_id = 'tracker'             │  │
│  │ • assets (workspace_scope='studio')    │  │ • queue_id = 'studio'              │  │
│  │ • agency_tracking / export_baskets     │  │ • queue_id = 'eps'                 │  │
│  │ • settings / api_keys                  │  │ • queue_id = 'video'               │  │
│  └───────────────────┬────────────────────┘  └─────────────────┬──────────────────┘  │
└──────────────────────┼─────────────────────────────────────────┼─────────────────────┘
                       │                                         │
        ┌──────────────┴──────────────┐           ┌──────────────┴──────────────┐
        ▼                             ▼           ▼                             ▼
┌──────────────────────────────┐  ┌────────────────────────────────────────────────────┐
│   METADATA STUDIO WORKSPACE  │  │           DISTRIBUTION TRACKER WORKSPACE           │
│   (workspace_scope='studio') │  │           (workspace_scope='tracker')              │
│                              │  │                                                    │
│ • StudioBatchQueueService    │  │ ┌────────────────────────────────────────────────┐ │
│ • Studio Asset Grid          │  │ │ Command Bar: Search · Media Tabs · Agency Tabs │ │
│ • Zero Cross-Tool Leakage    │  │ │ [Pipeline Badge] [Import] [Export {Agency}]    │ │
└──────────────────────────────┘  │ └───────┬──────────────────────┬─────────────────┘ │
                                  │         ▼                      ▼                   │
                                  │ ┌────────────────────┐ ┌─────────────────────────┐ │
                                  │ │ Collapsible        │ │ Ingestion Origin Modal  │ │
                                  │ │ Pipeline Drawer    │ │ ("AI-Generated" vs      │ │
                                  │ │ • Progress (X / Y) │ │  "Real / Authentic")    │ │
                                  │ │ • Stage & Error Log│ └───────────┬─────────────┘ │
                                  │ │ • [Retry Failed]   │             │               │
                                  │ └─────────▲──────────┘             ▼               │
                                  │           │            ┌─────────────────────────┐ │
                                  │           └────────────┤ AtomicIngestionService  │ │
                                  │                        │ 1. Copy to Temp & SHA256│ │
                                  │                        │ 2. EPS JPG / Mute Video │ │
                                  │                        │ 3. AI Two-Title Metadata│ │
                                  │                        │ 4. Atomic Vault Commit  │ │
                                  │                        └─────────────────────────┘ │
                                  │                                                    │
                                  │ ┌────────────────────────────────────────────────┐ │
                                  │ │ Minimalist Gallery & Virtual List              │ │
                                  │ │ • Card Body Click -> Toggle Selection          │ │
                                  │ │ • Top-Right [Eye] Icon -> Metadata Modal       │ │
                                  │ │ • Persistent Cross-Tab Selection Set           │ │
                                  │ └───────────────────────┬────────────────────────┘ │
                                  │                         ▼                          │
                                  │ ┌────────────────────────────────────────────────┐ │
                                  │ │ Tracker Export Configuration Modal             │ │
                                  │ │ • Agency Options (Model, License, Country...)  │ │
                                  │ │ • Mixed-Media CSV Splitter (_images + _videos) │ │
                                  │ └────────────────────────────────────────────────┘ │
                                  └────────────────────────────────────────────────────┘
```

### Interactive Component & State Mapping

1. **Pillar 1 — State Decoupling (`workspace_scope`)**:
   - **SQLite Migration & Queries**: Add `workspace_scope TEXT DEFAULT 'tracker'` to `assets`.
   - **Studio Isolation**: `db.studioRecords` (or `db.masterRecords` called from `BatchQueueService` and `useUnifiedAssets`) passes `workspaceScope: 'studio'`. Clearing or adding items in Studio only affects `workspace_scope = 'studio'` rows and the `'studio'` queue in `local_queues.sqlite`.
   - **Tracker Isolation**: `DistributionTrackerView` and `atomicIngestionService` query and commit strictly with `workspaceScope: 'tracker'`.
   - **Standalone EPS & Audio Stripper Isolation**: `useEpsConverter` (`queue_id = 'eps'`) and `VideoMuterView` (`queue_id = 'video'`) maintain their own module queues in `local_queues.sqlite` with no automatic insertion into Studio or Tracker.

2. **Pillar 2 — Ingestion Origin Modal & Cross-Tab Mixed-Media Orchestration**:
   - **Pre-Ingestion Prompt**: Dropping files on the Tracker canvas or clicking **Import Files / Import Folder** buffers the `File[]` list in `pendingImportFiles` state and opens the **Ingestion Origin Modal** (`AI-Generated` vs. `Real / Authentic` radio cards + `Batch ID` input). Confirming invokes `atomicIngestionService.enqueueFiles(files, { isAiGenerated, batchId, useAiMetadata: true })`.
   - **Cross-Tab Selection Persistence**:
     - Promote `mediaFilter` (`'ALL' | 'image' | 'vector' | 'video'`) to a first-class segmented tab bar in the Tracker toolbar (`All · Photos · Vectors · Videos`) with live counts per media type.
     - Keep `selectedIds: Set<string>` independent of `mediaFilter` and `activeAgency`.
     - Exporting uses `masterRecords.filter(r => selectedIds.has(r.id))` when `selectedIds.size > 0` so selected Photos, Vectors, and Videos across all tabs are exported together in one batch.
   - **Mixed-Media CSV Generation**:
     - When `generatePlatformCsv(activeAgency, targetRecords, batchName, exportOptions)` runs in the Tracker:
       - If `csvOut.additionalResults` is present (e.g., Dreamstime mixed batch returning both `_dreamstime_images.csv` and `_dreamstime_videos.csv`), the Tracker downloads **both** CSV files and stages all included assets in the Export Basket.
       - If `csvOut.isBlocked` is true (e.g., 100% video selection exported to Freepik), the Tracker displays a clear warning banner instead of creating an empty basket.

3. **Pillar 3 — Collapsible Pipeline Drawer & Atomic Retry**:
   - **Toolbar Trigger**: A dedicated button in the Tracker toolbar shows active status:
     - While running: `Ingesting (completed/total)` with animated progress indicator.
     - When failures exist: `Pipeline · X Failed` in crimson/amber alert styling.
     - When idle: `Pipeline (total)` toggle button.
   - **Drawer Body**:
     - Lists all `IngestionQueueItem` entries from `atomicIngestionService` with their media icon, filename, `AI` / `Real` label, live stage label (`Copying to Temp...`, `Extracting EPS...`, `Muting Audio...`, `Generating Tags...`, `Committed to Master Vault`), and any error message.
     - **`retryAllFailed()` on `atomicIngestionService`**: Resets every item with `stage === 'failed'` back to `stage: 'queued'` and re-executes the full atomic pipeline (`processItemsByIds`) in one click, alongside per-item **Retry** buttons.

4. **Pillar 4 — Tracker Export Configuration Modal**:
   - Clicking **Export {Agency}** opens `TrackerExportConfigModal` pre-populated with the active agency's defaults:
     - **Freepik**: `isAiGenerated` override (`Auto from asset` / `Force AI` / `Force Real`) + `modelName` input/preset (`Google Nano Banana`, `Midjourney v6`, `Flux.1 Dev`, `DALL-E 3`).
     - **Vecteezy**: `license` (`pro` | `free`) + `webUploaderParity` checkbox.
     - **Shutterstock**: `editorial`, `matureContent`, `illustration` checkboxes.
     - **Dreamstime**: `wel`, `pel`, `free`, `editorial` checkboxes + mixed-media split preview count (`X Images/Vectors -> _images.csv`, `Y Videos -> _videos.csv`).
     - **123RF**: Country code selector (`EG` default, searchable ISO list, or `None`).
     - **Adobe Stock**: Read-only confirmation of Long Title (200 chars) + 49 keywords.
   - Confirming passes `UniversalTransformOptions` into `generatePlatformCsv(activeAgency, batchSlice, basketName, transformOptions)`.

5. **Pillar 5 — Minimalist Card UX & Selection Fix**:
   - **Gallery Card (`gallery-card-{id}`)**:
     - Outer card `onClick={(e) => handleToggleItemSelect(rec.id, idx, e)}` toggles selection on any click (single click, `Shift+Click`, or `Ctrl/Cmd+Click`).
     - Thumbnail `<img>` and title `<h3>` no longer have `onClick={() => setInspectedAssetId(rec.id)}`.
     - Top-right `Eye` icon button (`data-testid="inspect-asset-btn-{id}"`) calls `e.stopPropagation(); setInspectedAssetId(rec.id);`.
     - Remove the bottom 3-button copy row (`Title`, `Desc`, `Tags`) from the card face; move quick copy actions into the Metadata Inspector Modal (which also supports editing both `shortTitle` and `longTitle`).
   - **Compact List Row**:
     - Clicking the row toggles selection; clicking the compact `Eye` icon button opens the Metadata Inspector Modal; status dropdown updates agency status with `e.stopPropagation()`.

6. **Pillar 6 — EPS Engine & Audio Stripper Verification & Hardening**:
   - **EPS Engine Pre-Move Preview Guarantee**:
     - In `atomicIngestionService.ts` (Step 3, when `item.mediaType === 'vector'`): Call `rasterizeEpsFile(workingFile)` *while the `.eps` is still in `.stockflow_temp`*. Convert the rendered JPEG `Blob` into `previewBuffer: ArrayBuffer` and `thumbnailBase64` (for AI vision analysis). If EPS preview extraction fails and no fallback preview can be produced, throw before Step 5 so `rollbackIngestedItem` wipes the temp file and never commits an un-previewed `.eps` to `Master_Vault`.
     - In `electron/sqliteDb.cjs` (`commitAtomicallyToMasterVault`): Write and verify the companion `${base}.jpg` preview file on disk **before** moving `tempFilePath` to `masterFullPath`.
   - **Audio Stripper Lossless Verification & Disk Persistence**:
     - In `videoBoxParser.ts` / `videoMuterEngine.ts`: Verify that `stripAudioFromBufferInPlace` validates `moov` atom boundaries, mutates only `'soun'` handler `trak` headers to `'free'` (preserving exact file byte length and `mdat` chunk offsets), and returns a clean buffer.
     - In `atomicIngestionService.ts`: When `stripAudioTrackLossless` returns the muted video `Blob`, re-stage the muted `ArrayBuffer` into `tempFilePath` prior to `commitAtomicallyToMasterVault` so the physical `.mp4`/`.mov` file committed to `Master_Vault/Videos/` is the lossless audio-stripped file.
