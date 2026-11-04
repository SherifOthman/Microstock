# Microstock Distribution Tracker — Architectural Plan & Future-Proof Database Schema

The **Microstock Distribution Tracker** acts as the central "Master Brain" of StockFlow, governing the end-to-end lifecycle of digital assets (Images, Videos, and Vectors) from read-only source ingestion to multi-agency distribution, upload reconciliation, and rejection analytics across all 6 supported microstock platforms (**Adobe Stock, Freepik, Shutterstock, Vecteezy, Dreamstime, and 123RF**).

---

## User Review & Confirmed Architectural Decisions

> [!IMPORTANT]
> All four architectural pillars confirmed during clarification are locked into this specification with zero data-loss guarantees:

- **Confirmed Decision 1 — Native `better-sqlite3` WAL Engine + Canonical Prisma Schema Spec**:
  Runtime execution uses Electron's native `better-sqlite3` driver in `WAL` (Write-Ahead Logging) mode with `synchronous = NORMAL` and `foreign_keys = ON` for maximum offline desktop throughput and crash resilience. A complete, canonical Prisma schema specification (`schema.prisma`) is paired directly with idempotent SQLite DDL migrations so future features (FTP sync, web scraping, AI vision QA) already have nullable columns pre-allocated without ever requiring destructive table rebuilds.
- **Confirmed Decision 2 — Dedicated Master Vault, Hidden Temp Staging, & Centralized Export Baskets**:
  Original user source folders are treated as **100% read-only**. All ingested files are first copied into a hidden `.stockflow_temp` staging directory inside the managed workspace, processed atomically, and moved into the centralized `Master_Vault/` hierarchy only upon 100% pipeline completion. Agency exports stage copies and CSVs into organized `Export_Baskets/<Agency>_<Timestamp>/` directories.
- **Confirmed Decision 3 — Dedicated "Distribution Tracker" Tab Alongside Standalone Tools**:
  The Distribution Tracker is added as a primary workspace hub in the navigation bar where 99% of batch production happens, while preserving `Metadata Studio`, `File Cleaner`, `Audio Stripper`, `EPS Engine`, and `API Keys` as standalone tabs for ad-hoc, single-file, or diagnostic tasks.
- **Confirmed Decision 4 — Strict Event-Driven SQLite Backup Strategy (30-Snapshot Rolling Retention)**:
  Pure timer-based cron jobs are replaced with an **Event-Driven Hot Backup Engine** using SQLite's online backup API (`db.backup()`). Backups are triggered automatically into the Google Drive-synced `backups/` directory on:
  1. **Application Startup** (post-integrity check).
  2. **Application Graceful Quit** (`before-quit` lifecycle hook).
  3. **Immediately After Every Major Batch Operation** (Ingestion Pipeline completion, Batch AI Metadata Generation completion, Export Basket creation, and Batch Status Reconciliation).
  - *Retention Policy*: Automatically retains the **newest 30 backup snapshots** (`stockflow_backup_<YYYYMMDD_HHmmss>_<trigger>.sqlite`) and prunes older snapshots so cloud sync storage never bloats.

---

## 1. Overview & Core Concept

- **What It Does**: Provides a single, crash-proof command center that ingests raw media folders, deduplicates via SHA-256 content hashing, validates resolution/size, extracts EPS previews or strips video audio, generates ranked SEO metadata, commits verified files to a permanent Master Vault, and tracks per-agency submission statuses (`New` → `Pending Upload` → `Uploaded` → `In Review` → `Accepted` / `Rejected`) with one-click Export Baskets and post-upload Reconciliation.
- **Target Persona**: High-volume microstock contributors managing 10,000 to 50,000+ multi-format assets who need deterministic file organization, zero duplicate uploads, instant agency filtering, and structured rejection tracking.
- **Key Value**: Eliminates the "spreadsheet + scattered folders" chaos by uniting atomic file operations, relational agency state tracking, and event-driven database backups into a 60fps desktop interface.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Atomic Folder Ingestion & Live Pipeline Telemetry**:
   - User clicks **Ingest Folder** and selects any source directory on disk.
   - Source files remain untouched. Each asset appears immediately in the tracker grid with a live, step-specific pipeline badge (`Hashing SHA-256...` → `Checking Quality...` → `Extracting EPS Preview...` / `Stripping Audio...` → `Generating AI Metadata...` → `Committed to Master Vault`).
   - If any step fails (e.g., corrupted EPS header or AI timeout), the temporary staging copy is immediately wiped, the database transaction for that asset is rolled back, and the row displays a `Failed` state with the exact stage error and an inline **Retry Item** action.
2. **High-Density Virtualized Asset Grid (50,000+ Rows at 60fps)**:
   - Powered by `@tanstack/react-virtual`, rendering only the ~15–25 visible rows in the DOM viewport at any moment while supporting instant search, media-type filtering, and per-agency status filtering across 50,000+ records.
   - Each row displays a crisp large thumbnail preview, canonical Master filename, media specs (`width × height · size · AI/Real`), editable Title/Keywords summary, and a **6-Agency Status Matrix** (`Adobe`, `Freepik`, `Shutterstock`, `Vecteezy`, `Dreamstime`, `123RF`).
3. **Export Baskets (`Pending Upload` Staging)**:
   - User selects eligible assets (or clicks **Auto-Fill Next Batch** for a specific agency) and clicks **Create Export Basket**.
   - The system copies the master files into a dedicated staging subfolder (`Export_Baskets/Adobe_Stock_2026-11-04_Batch01/`), generates the agency-compliant CSV alongside the media files, and atomically transitions those agency tracking records from `New` to `Pending Upload`.
4. **Post-Upload Reconciliation & Rejection Logging**:
   - When an agency portal accepts 10 files from a 30-file batch and rejects or drops 20, the user opens the **Reconcile Pending Uploads** bar (or filters by `Pending Upload` for that agency).
   - Multi-select or drag-select allows marking the 10 accepted items as `Uploaded` / `Accepted`, reverting unsubmitted items back to `New`, or marking rejected items as `Rejected` while selecting a saved reason from the **Rejection Dictionary** (or adding a new recurring reason on the fly).

### Visual Identity & Theme
- **Aesthetic Direction**: Utilitarian precision studio workspace matching StockFlow's dual-theme (`Light` / `Dark`) architecture.
- **Color Palette & Status Semantics**:
  - Neutral slate canvas (`--background`, `--secondary`) with `1px` structural hairline borders (`--border`).
  - Semantic agency status indicators always pair color with clear text labels and iconography:
    - `New`: Neutral muted slate
    - `Pending Upload`: Amber warning highlight (`#D97706`) — indicates staged in Export Basket awaiting contributor confirmation
    - `Uploaded` / `In Review`: Primary blue (`#2563EB`)
    - `Accepted`: Emerald nominal (`#16A34A`)
    - `Rejected`: Crimson alert (`#DC2626`) with interactive tooltip showing the linked `RejectionDictionary` title and notes
- **Typography & Tabular Discipline**:
  - Clean sans-serif UI hierarchy paired with strict monospace tabular numerals (`font-mono tabular-nums`) for all SHA-256 hash prefixes, file dimensions, batch numbers, earnings columns, and KPI counters.

---

## 3. Key Product Decisions & Trade-Offs

### Pillar 1: Future-Proof Relational Schema Without Destructive Migrations
- **Chosen Approach**: Normalize core entities into `assets`, `agency_tracking`, `rejection_dictionary`, `export_baskets`, and `backup_logs`, while pre-provisioning nullable columns for Phase 2/3 roadmap capabilities (`ftp_status`, `ftp_remote_path`, `scraped_earnings_cents`, `scraped_downloads`, `ai_vision_score`, `ai_flags_json`, `perceptual_hash`, `custom_attributes_json`).
- **Why**: SQLite `ALTER TABLE` is limited when changing constraints or foreign keys on populated tables. Pre-allocating indexed columns and JSON extension fields guarantees that adding automated FTP uploaders, contributor portal scrapers, and local AI Vision quality scoring requires zero schema rewrite or data migration risk.

### Pillar 2: Strict Copy-First Atomic Ingestion (`Source` → `.stockflow_temp` → `Master_Vault`)
- **Chosen Approach**: Never mutate or move files from the user's source directory. Copy each candidate file to `.stockflow_temp/<run_id>/`, compute its SHA-256 hash, verify against `assets.file_hash` (instant deduplication), execute media preparation (EPS rasterization / video audio stripping), run AI metadata generation, move the verified file to `Master_Vault/`, and commit the SQLite transaction.
- **Why**: Guarantees that power loss, Ghostscript failure, or AI rate-limiting never leaves half-processed orphan files in the Master Vault or corrupts the user's original shoot/render folder.

### Pillar 3: Explicit `Pending Upload` Intermediate State & Reconciliation
- **Chosen Approach**: Exporting files and CSVs for an agency transitions status to `Pending Upload` rather than `Uploaded`, and records an `export_basket_id`.
- **Why**: Generating a CSV on disk does not mean the agency portal accepted the upload. Separating `Pending Upload` from `Uploaded` gives contributors a dedicated reconciliation queue to confirm which files actually went live and which ones failed portal validation.

### Pillar 4: Event-Driven Hot Backups via SQLite Online Backup API
- **Chosen Approach**: Use `better-sqlite3`'s native `.backup(destinationPath)` API triggered on Startup, Graceful Quit, and Batch Completion, with a 30-file rolling retention window.
- **Why**: Raw `fs.copyFile` on an active WAL database can copy an inconsistent state if a `-wal` checkpoint is mid-flight. Native `.backup()` performs a page-safe, transactionally consistent snapshot without locking the UI, and event-driven triggers ensure every completed batch is immediately backed up for Google Drive sync.

---

## 4. Technical Architecture & Database Schema

### System Architecture & Data Lifecycle Diagram

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                        ELECTRON RENDERER (React + TanStack Virtual)               │
│                                                                                   │
│  ┌─────────────────────────┐  ┌──────────────────────────┐  ┌──────────────────┐  │
│  │  KPI Telemetry Header   │  │  Live Ingestion Pipeline │  │ Export Basket &  │  │
│  │ (Total, Pending, Live,  │  │  Row Status Stream       │  │ Reconciliation   │  │
│  │  Rejected, Backup Sync) │  │  (Hash->Prep->AI->Vault) │  │ Drawer + Dict    │  │
│  └────────────┬────────────┘  └─────────────┬────────────┘  └────────┬─────────┘  │
│               └─────────────────────────────┼────────────────────────┘            │
│                                             ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │         Virtualized Distribution Matrix Grid (@tanstack/react-virtual)      │  │
│  │   [Thumbnail] [Master Asset & Specs] [SEO Metadata] [6-Agency Status Cells] │  │
│  └──────────────────────────────────────────┬──────────────────────────────────┘  │
└─────────────────────────────────────────────┼─────────────────────────────────────┘
                                              │ IPC Bridge (db:invoke / tracker:*)
┌─────────────────────────────────────────────▼─────────────────────────────────────┐
│                          ELECTRON MAIN PROCESS (Node.js)                          │
│                                                                                   │
│  ┌──────────────────────────────────────┐   ┌──────────────────────────────────┐  │
│  │     Atomic Ingestion Coordinator     │   │   Native SQLite WAL Engine       │  │
│  │ 1. Copy Source -> .stockflow_temp/   │   │   (better-sqlite3, WAL mode)     │  │
│  │ 2. SHA-256 Deduplication Check       │──▶│ • assets                         │  │
│  │ 3. Quality / EPS / Video Mute        │   │ • agency_tracking (6 agencies)   │  │
│  │ 4. AI Metadata Generation            │   │ • rejection_dictionary           │  │
│  │ 5. Atomic Move -> Master_Vault/      │   │ • export_baskets                 │  │
│  │    (Rollback & Wipe Temp on Failure) │   └─────────────────┬────────────────┘  │
│  └──────────────────────────────────────┘                     │                   │
│                                                               ▼                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │             Event-Driven Hot Backup Engine (db.backup() API)                │  │
│  │  Triggers: [App Startup] · [Batch Complete] · [Export] · [Graceful Quit]    │  │
│  │  Target: <Workspace>/backups/ (Auto-prunes to latest 30 rolling snapshots)  │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

### Explicit Database Schema Specification

#### A. Canonical Prisma Schema (`schema.prisma` Reference Model)

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./stockflow.sqlite"
}

generator client {
  provider = "prisma-client-js"
}

/// Core Master Asset Table — Single source of truth for every deduplicated file in the Master Vault
model Asset {
  id                     String   @id @default(uuid())
  batchId                String?  @map("batch_id")
  
  // File Identity & Deduplication
  originalPath           String?  @map("original_path")
  masterPath             String?  @unique @map("master_path")
  previewPath            String?  @map("preview_path") // Companion JPG for EPS vectors or poster frame for videos
  filename               String   @map("filename")
  originalFilename       String?  @map("original_filename")
  fileHash               String?  @unique @map("file_hash") // SHA-256 hex digest for strict deduplication
  perceptualHash         String?  @map("perceptual_hash")   // Future-proof: pHash/dHash for near-duplicate visual detection
  
  // Media Classification & Technical Specs
  mediaType              String   @default("image") @map("media_type") // 'image' | 'video' | 'vector'
  mimeType               String?  @map("mime_type")
  fileSize               Int?     @map("file_size")
  compressedSize         Int?     @map("compressed_size")
  width                  Int?     @map("width")
  height                 Int?     @map("height")
  aspectRatio            String?  @map("aspect_ratio")
  durationSeconds        Float?   @map("duration_seconds")
  frameRate              Float?   @map("frame_rate")
  codec                  String?  @map("codec")
  hasAudio               Boolean  @default(false) @map("has_audio")
  audioMutedAt           Int?     @map("audio_muted_at")
  epsExtractedAt         Int?     @map("eps_extracted_at")
  resolution             String?  @map("resolution")
  colorSpace             String?  @map("color_space")
  thumbnailBase64        String?  @map("thumbnail_base64")
  
  // AI & SEO Metadata (Denormalized JSON + Fast Search Columns)
  isAiGenerated          Boolean  @default(true) @map("is_ai_generated")
  aiGeneratorModel       String?  @map("ai_generator_model") // e.g., Midjourney v6, Flux.1
  baseTitle              String   @default("") @map("base_title")
  detailedDescription    String   @default("") @map("detailed_description")
  keywordsJson           String   @default("[]") @map("keywords_json")
  categoriesJson         String?  @map("categories_json")
  metadataJson           String?  @map("metadata_json") // Full extensible metadata payload (releases, editorial, country, etc.)
  
  // Pipeline & Future AI Vision QA Telemetry
  pipelineStage          String   @default("completed") @map("pipeline_stage") // 'hashing' | 'validating' | 'transforming' | 'generating_meta' | 'committed' | 'failed'
  status                 String   @default("completed") @map("status")
  errorMessage           String?  @map("error_message")
  aiVisionScore          Float?   @map("ai_vision_score")       // Future-proof: Local/Cloud AI technical quality score (0-100)
  aiFlagsJson            String?  @map("ai_flags_json")         // Future-proof: JSON array of detected artifacts, watermark warnings, trademark flags
  customAttributesJson   String?  @map("custom_attributes_json") // Future-proof: Arbitrary user tags, collections, shoot notes
  isArchived             Boolean  @default(false) @map("is_archived")
  
  createdAt              Int      @map("created_at")
  updatedAt              Int      @map("updated_at")

  // Relations
  agencyTrackings        AgencyTracking[]

  @@index([fileHash], name: "idx_assets_file_hash")
  @@index([mediaType, isAiGenerated], name: "idx_assets_media_ai")
  @@index([status, pipelineStage], name: "idx_assets_pipeline")
  @@index([createdAt], name: "idx_assets_created_at")
  @@map("assets")
}

/// Maps each Asset to each of the 6 Stock Agencies with full lifecycle & future automation fields
model AgencyTracking {
  id                     String   @id @default(uuid())
  assetId                String   @map("asset_id")
  agencyId               String   @map("agency_id") // 'adobe' | 'freepik' | 'vecteezy' | 'shutterstock' | 'dreamstime' | '123rf'
  
  // Core Lifecycle Status
  // Allowed values: 'New' | 'Pending Upload' | 'Uploaded' | 'In Review' | 'Accepted' | 'Rejected'
  status                 String   @default("New") @map("status")
  
  // Export Basket & Submission Traceability
  exportBasketId         String?  @map("export_basket_id")
  stagedFilePath         String?  @map("staged_file_path")
  exportedFilename       String?  @map("exported_filename")
  submissionBatchName    String?  @map("submission_batch_name")
  
  // Agency Portal Identity
  agencyAssetId          String?  @map("agency_asset_id") // Remote ID assigned by Adobe/Shutterstock/etc.
  agencyUrl              String?  @map("agency_url")      // Direct public or contributor portal URL
  
  // Rejection Tracking
  rejectionReasonId      String?  @map("rejection_reason_id")
  customRejectionNote    String?  @map("custom_rejection_note")
  rejectionCount         Int      @default(0) @map("rejection_count")
  
  // Lifecycle Timestamps (Epoch ms)
  exportedAt             Int?     @map("exported_at")
  uploadedAt             Int?     @map("uploaded_at")
  reviewedAt             Int?     @map("reviewed_at")
  acceptedAt             Int?     @map("accepted_at")
  rejectedAt             Int?     @map("rejected_at")
  
  // Future-Proof Columns: FTP Sync, Web Scraping & AI Compliance
  ftpStatus              String?  @map("ftp_status")              // 'idle' | 'queued' | 'uploading' | 'transferred' | 'failed'
  ftpRemotePath          String?  @map("ftp_remote_path")
  ftpLastAttemptAt       Int?     @map("ftp_last_attempt_at")
  ftpErrorMessage        String?  @map("ftp_error_message")
  scrapedStatusRaw       String?  @map("scraped_status_raw")      // Raw status string from automated portal scraper
  scrapedDownloads       Int      @default(0) @map("scraped_downloads")
  scrapedEarningsCents   Int      @default(0) @map("scraped_earnings_cents") // Stored in integer cents to prevent float rounding
  scrapedViews           Int      @default(0) @map("scraped_views")
  lastScrapedAt          Int?     @map("last_scraped_at")
  aiFlags                String?  @map("ai_flags")                // Agency-specific AI preflight warnings (JSON)
  agencyMetadataOverride String?  @map("agency_metadata_override") // Per-agency title/keyword override JSON if customized
  notes                  String?  @map("notes")
  
  createdAt              Int      @map("created_at")
  updatedAt              Int      @map("updated_at")

  // Relations
  asset                  Asset                @relation(fields: [assetId], references: [id], onDelete: Cascade)
  rejectionReason        RejectionDictionary? @relation(fields: [rejectionReasonId], references: [id], onDelete: SetNull)
  exportBasket           ExportBasket?        @relation(fields: [exportBasketId], references: [id], onDelete: SetNull)

  @@unique([assetId, agencyId], name: "uq_asset_agency")
  @@index([agencyId, status], name: "idx_tracking_agency_status")
  @@index([exportBasketId], name: "idx_tracking_export_basket")
  @@index([rejectionReasonId], name: "idx_tracking_rejection_reason")
  @@map("agency_tracking")
}

/// User-populated & pre-seeded dictionary of recurring rejection reasons per agency
model RejectionDictionary {
  id                     String   @id @default(uuid())
  agencyId               String   @map("agency_id") // 'all' | 'adobe' | 'freepik' | 'vecteezy' | 'shutterstock' | 'dreamstime' | '123rf'
  code                   String?  @map("code")      // e.g., 'TECH_FOCUS', 'SIMILAR_CONTENT', 'IP_TRADEMARK'
  title                  String   @map("title")     // Short dropdown label (e.g., "Technical Quality / Noise")
  description            String   @default("") @map("description") // Detailed explanation or remediation advice
  severity               String   @default("standard") @map("severity") // 'fixable' | 'standard' | 'permanent_ban_risk'
  usageCount             Int      @default(0) @map("usage_count")
  isActive               Boolean  @default(true) @map("is_active")
  createdAt              Int      @map("created_at")
  updatedAt              Int      @map("updated_at")

  agencyTrackings        AgencyTracking[]

  @@unique([agencyId, title], name: "uq_rejection_agency_title")
  @@index([agencyId, isActive], name: "idx_rejection_agency_active")
  @@map("rejection_dictionary")
}

/// Tracks every Export Basket created on disk for batch reconciliation
model ExportBasket {
  id                     String   @id @default(uuid())
  agencyId               String   @map("agency_id")
  basketName             String   @map("basket_name")
  stagingFolderPath      String   @map("staging_folder_path")
  csvFilePath            String?  @map("csv_file_path")
  itemCount              Int      @default(0) @map("item_count")
  status                 String   @default("pending_reconciliation") @map("status") // 'pending_reconciliation' | 'reconciled' | 'cancelled'
  createdAt              Int      @map("created_at")
  reconciledAt           Int?     @map("reconciled_at")

  agencyTrackings        AgencyTracking[]

  @@index([agencyId, status], name: "idx_baskets_agency_status")
  @@map("export_baskets")
}

/// Audit log of Event-Driven SQLite Hot Backups
model BackupLog {
  id                     String   @id @default(uuid())
  triggerEvent           String   @map("trigger_event") // 'app_startup' | 'app_quit' | 'batch_ingest' | 'batch_export' | 'batch_reconcile' | 'manual'
  backupFilePath         String   @map("backup_file_path")
  fileSizeBytes          Int      @map("file_size_bytes")
  assetCountSnapshot     Int      @map("asset_count_snapshot")
  durationMs             Int      @map("duration_ms")
  createdAt              Int      @map("created_at")

  @@index([createdAt], name: "idx_backup_logs_created_at")
  @@map("backup_logs")
}
```

#### B. Backward-Compatible Native SQLite Migration Strategy
- Because StockFlow already has an `assets` and `asset_metadata` table in `sqliteDb.cjs`, the schema initializer will execute an **idempotent, non-destructive column upgrade** (`PRAGMA table_info(assets)` check followed by `ALTER TABLE assets ADD COLUMN ...` for all new Master Vault columns) and create `agency_tracking`, `rejection_dictionary`, `export_baskets`, and `backup_logs` with `CREATE TABLE IF NOT EXISTS`.
- Whenever an asset is committed to the Master Vault, the database automatically initializes 6 `agency_tracking` rows (`Adobe`, `Freepik`, `Shutterstock`, `Vecteezy`, `Dreamstime`, `123RF`) with status `'New'` inside the same atomic SQLite transaction.
- Pre-seeds `rejection_dictionary` with standard microstock rejection archetypes (`Technical Quality / Artifacts`, `Similar / Duplicate Content`, `Intellectual Property / Trademark`, `Missing Model/Property Release`, `Keyword Spam / Title Mismatch`, `Upscaled / Low Resolution`) while allowing users to add custom reasons directly from the Rejection modal.

---

### Step-by-Step Implementation Plan

#### Step 1: Database Upgrade & Event-Driven Hot Backup Engine
1. Extend `SqliteDatabaseManager` with non-destructive column migrations on `assets`, plus new tables `agency_tracking`, `rejection_dictionary`, `export_baskets`, and `backup_logs`.
2. Implement `performHotBackup(triggerEvent)` using `this.db.backup(targetBackupPath)`:
   - Writes to `<Documents>/StockFlow/backups/stockflow_<YYYY-MM-DD_HH-mm-ss>_<trigger>.sqlite`.
   - Enforces the **30-file rolling retention policy** by sorting `.sqlite` files in `backups/` by modification time and unlinking any file beyond the 30 most recent snapshots.
   - Hooks into Electron `app.whenReady()` (`app_startup`), `app.on('before-quit')` (`app_quit`), and post-batch completion RPCs (`batch_ingest`, `batch_export`, `batch_reconcile`).

#### Step 2: Atomic Ingestion Pipeline (`Source` → `.stockflow_temp` → `Master_Vault`)
1. Build the Main-Process + Worker atomic ingestion pipeline:
   - **Stage 1 (`Copying & Hashing`)**: Copies source file to `<Workspace>/.stockflow_temp/<batch_id>/`, computes streaming `crypto.createHash('sha256')`, and checks `SELECT id, filename FROM assets WHERE file_hash = ?`. If a match exists, marks item as `Duplicate Skipped` and deletes the temp copy.
   - **Stage 2 (`Validating Specs`)**: Verifies minimum microstock resolution (e.g., $\ge 4\text{MP}$ for photos, valid bounding box for EPS, valid container for video) and file size limits.
   - **Stage 3 (`Media Preparation`)**:
     - For `.eps` / `.ai`: Generates the high-res companion JPEG via the Ghostscript pool (`eps:rasterizeNative`) into `.stockflow_temp`.
     - For `.mp4` / `.mov`: Strips audio tracks if present (`videoMuterEngine`) and extracts a representative vision frame.
   - **Stage 4 (`AI Metadata Generation`)**: Routes the visual frame through the active AI provider (Cloud KeyRing or Local LM Studio Server) to produce title, description, 45–49 ranked keywords, and agency categories.
   - **Stage 5 (`Atomic Commit to Master Vault`)**: Moves the finalized file(s) from `.stockflow_temp` into `<Documents>/StockFlow/Master_Vault/<MediaCategory>/<BatchCode>/`, commits the `assets` + `asset_metadata` + 6 `agency_tracking` rows inside a single SQLite transaction, and triggers an immediate Event-Driven Hot Backup once the batch completes.
   - **Failure Rollback**: Any exception in Stages 1–5 immediately deletes the `.stockflow_temp` file(s) for that item, rolls back any partial DB state, and surfaces the exact failure reason in the UI row with a one-click **Retry** button.

#### Step 3: Virtualized Distribution Tracker Dashboard (`@tanstack/react-virtual`)
1. Install `@tanstack/react-virtual` and build the `DistributionTrackerView`:
   - **Top KPI Bar**: Displays `Total Vault Assets`, `Ready to Export (New)`, `Pending Upload (Awaiting Reconciliation)`, `Uploaded / Live`, `Rejected`, and `Last Backup Snapshot` with a manual `Backup Now` trigger and `Open Vault / Backups Folder` button.
   - **Filter & Search Command Bar**: Instant filtering by Agency (`All` or specific agency), Agency Status (`New`, `Pending Upload`, `Uploaded`, `In Review`, `Accepted`, `Rejected`), Media Type (`Photo`, `Video`, `Vector`), AI vs. Real, and keyword/filename search.
   - **Virtualized Row Renderer**: Fixed-height high-density rows ($72\text{px}$) with 60fps virtual scrolling for 50,000+ items, featuring thumbnail preview, file telemetry, live ingestion stage badge, and the interactive 6-Agency Status Matrix.

#### Step 4: Export Baskets & Reconciliation Workflow
1. **Export Basket Generator**:
   - Selecting items and clicking **Export to [Agency]** copies the master files (plus companion JPGs for vectors if required by the agency) into `<Documents>/StockFlow/Export_Baskets/<Agency>_<Timestamp>/`, writes the official agency CSV (`csvExporter`), creates an `ExportBasket` record, transitions those `(assetId, agencyId)` pairs to **`Pending Upload`**, and triggers an immediate SQLite hot backup.
2. **Reconciliation & Rejection Dictionary UI**:
   - Dedicated **Reconcile Pending Uploads** mode lets users filter by an Export Basket or `Pending Upload` items for any agency.
   - Users can bulk-select or drag-select items to:
     - **Confirm Uploaded** (`Pending Upload` → `Uploaded`)
     - **Mark Accepted** (`Uploaded` / `Pending Upload` → `Accepted`)
     - **Revert to New** (`Pending Upload` → `New`, for items that failed to transfer or were skipped)
     - **Mark Rejected** (`Pending Upload` / `In Review` → `Rejected`), opening the **Rejection Dictionary Popover/Modal** where the user selects a saved agency reason or creates a new reusable reason (Title + Description) saved to `rejection_dictionary`.
