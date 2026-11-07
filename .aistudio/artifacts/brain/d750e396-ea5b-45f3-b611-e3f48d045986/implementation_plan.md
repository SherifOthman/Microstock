# Multi-Protocol FTP Architecture & Queue Isolation Overhaul

This architectural update resolves state leakage across microstock FTP tabs, enforces agency-specific vector ingestion rules (paired JPG+EPS vs. standalone EPS), standardizes queue sorting across all agencies, fixes broken EPS preview thumbnails, removes the redundant Freepik FTP tab in favor of Magnific (SFTP Port 60022), and isolates 123RF's AI-Generated Batch routing state.

### User Review & Critical Decisions

> [!IMPORTANT]
> All five architectural bug fixes specified in your brief are captured below and ready for immediate execution upon approval.

- **Confirmed Decision 1 — Strict Per-Agency Queue & SQLite Persistence Isolation**: Each FTP agency tab operates on its own isolated state slice and persists independently in `local_queues.sqlite` under a dedicated module identifier (`ftp_dreamstime` / `ftp`, `ftp_123rf`, `ftp_magnific`, `ftp_vecteezy`, `ftp_shutterstock`, `ftp_adobe`).
- **Confirmed Decision 2 — Agency-Aware Vector Pairing vs. Standalone EPS Filtering**:
  - **Pairing Agencies (`Dreamstime`, `123RF`, `Magnific`)**: Pair companion `.jpg` + `.eps` files sharing the same base stem and upload `.jpg` preview first, followed by `.eps`.
  - **Standalone Agencies (`Shutterstock`, `Adobe Stock`, `Vecteezy`)**: Detect when a `.jpg`/`.jpeg` shares a base stem with an `.eps` file and strictly exclude the companion `.jpg` from the upload queue so only the `.eps` is uploaded (while normal standalone photos without an `.eps` twin still queue and upload normally).
- **Confirmed Decision 3 — Universal 4-Tier Media Sorting**: All agency queues sort deterministically before rendering and uploading: **1. Photos (`.jpg`) → 2. Vectors (`.eps` or Vector Pairs) → 3. Videos (`.mp4`, `.mov`) → 4. Metadata (`.csv`)**.
- **Confirmed Decision 4 — Sibling `.jpg` Thumbnail Resolution for EPS & Vector Pairs**: Both paired vector bundles and standalone `.eps` items resolve their preview URL from the companion/sibling `.jpg` file (via dropped `File` handle or sibling disk path) and guard against raw `.eps` image rendering so broken image icons never appear.
- **Confirmed Decision 5 — Freepik FTP Tab Purge & 123RF AI Toggle Isolation**: The `Freepik` tab and its FTP routing entries are completely removed, keeping `Magnific` (SFTP Port 60022), and the `AI-Generated Batch` toggle is strictly scoped to `ftp_123rf`.

---

### 1. Overview & Core Concept

- **What It Does**: Transforms the multi-agency FTP Uploader from a single shared in-memory queue into a multi-tenant, crash-resilient transfer engine where each microstock agency maintains its own persistent queue, telemetry, credentials, vector bundling policy, and sorting order.
- **Target Audience / Persona**: High-volume microstock contributors uploading mixed shoots (Photos, EPS Vectors with JPG previews, Videos, and CSV metadata) simultaneously or sequentially across Dreamstime, 123RF, Magnific, Vecteezy, Shutterstock, and Adobe Stock.
- **Key Value**: Eliminates cross-agency queue contamination, prevents accidental duplicate/rejected `.jpg` preview uploads on standalone-EPS agencies (`Shutterstock`, `Adobe Stock`, `Vecteezy`), ensures predictable visual and execution ordering, and provides working visual previews for all vector items.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Agency Tab Switching**: Clicking between `Dreamstime`, `123RF`, `Magnific`, `Vecteezy`, `Shutterstock`, and `Adobe Stock` immediately switches to that agency's dedicated queue, progress bar, sub-tab counts (`Queue`, `Completed`, `Failed`, `Skipped`), and crash-recovery banner without leaking files across tabs.
  2. **Dropping Mixed Batches (Photos + EPS + Companion JPGs + Videos + CSV)**:
     - On `Dreamstime`, `123RF`, and `Magnific`, matching `.jpg` + `.eps` stems combine into a `Vector Pair (JPG+EPS)` badge item.
     - On `Shutterstock`, `Adobe Stock`, and `Vecteezy`, matching `.jpg` previews are automatically filtered out of the upload queue so only the standalone `.eps` vector is queued, while retaining the `.jpg` in memory/path reference to power the hover and lightbox preview thumbnail.
     - Unpaired `.jpg` files queue as `Photo` items at the top of the table, followed by `Vector` items, `Video` items, and finally `.csv` metadata files at the bottom.
  3. **Hover & Lightbox Vector Previews**: Hovering or clicking any EPS or Vector Pair row displays the crisp raster preview from its companion `.jpg` instead of a broken image icon, with a clean vector placeholder fallback if no companion `.jpg` exists on disk.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-density, utilitarian desktop studio interface with crisp tabular telemetry.
  - *Color Palette & Mood*: Deep Zinc Carbon (`--background: #09090B`, `--card: #121215`) in dark mode and Cool Gray (`--background: #F3F4F6`, `--card: #FFFFFF`) in light mode, paired with semantic media badges (Sky Blue for Photos, Amber for Vectors, Purple for Videos, Emerald for CSV/Online states).
  - *Typography & Hierarchy*: `Inter` / `Cairo` for UI labels and `JetBrains Mono` (`tabular-nums`) for filenames, byte counters, transfer speeds, and remote folder badges.
- **Interactive Feedback & Motion**: Independent per-agency upload progress bars, live speed/ETA counters, instant sub-tab filtering, and image `onError` fallback protection in hover tooltips and lightbox modals.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Per-Agency State Map & Isolated SQLite `module_id` Keys**
  - *Chosen Approach*: Partition the multi-agency FTP orchestrator by agency ID (`Map<FtpSupportedAgencyId, AgencyQueueContext>`) and persist each agency's snapshot under its own `moduleId` (`ftp_123rf`, `ftp_magnific`, `ftp_vecteezy`, `ftp_shutterstock`, `ftp_adobe`, while keeping Dreamstime isolated).
  - *Why*: Previously, `Ftp123RFService` held a single `this.queue` array and mutated `item.agencyId` whenever `setActiveAgency` was called, causing every tab switch to carry the same files over to the next agency. Partitioning both in-memory state and SQLite persistence guarantees 100% isolation across tab switches and app restarts.
  - *Alternatives Considered*: Filtering a single shared array by `agencyId` was rejected because telemetry, running/paused flags, and crash-recovery snapshots must also be independent per agency.

- **Decision 2: Agency-Specific Vector Ingestion Rules (Pairing vs. Companion JPG Exclusion)**
  - *Chosen Approach*: Define an explicit agency capability policy (`PAIRING_AGENCIES = {'dreamstime', '123rf', 'magnific'}` vs. `STANDALONE_EPS_AGENCIES = {'shutterstock', 'adobe', 'vecteezy'}`). When ingesting files for standalone EPS agencies, cross-reference incoming and existing stems: if a `.jpg`/`.jpeg` matches an `.eps` stem, skip queueing the `.jpg` for upload, attach its `File`/path as the `.eps` item's `previewUrl`, and remove any previously queued standalone `.jpg` twin if its `.eps` is dropped later.
  - *Why*: Shutterstock, Adobe Stock, and Vecteezy auto-generate previews from the `.eps` or reject redundant companion `.jpg` uploads as duplicate photos, whereas Dreamstime, 123RF, and Magnific require the `.jpg` preview to be uploaded before the `.eps`.

- **Decision 3: Sibling `.jpg` Preview Resolution for Vector Items**
  - *Chosen Approach*: Never pass an `.eps` `File` or `.eps` disk path into `<img src="..." />`. Instead, populate `previewUrl` from the companion `.jpg` `File` blob URL or `stockflow://local?path=<stem>.jpg` disk path, and add a resilient image error fallback in the preview renderer.
  - *Why*: Browser `<img>` elements cannot decode PostScript (`.eps`) binaries; binding `previewUrl` to `epsFile` caused broken image icons in both paired bundles and standalone EPS rows.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        FTP Uploader Workspace UI                             │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ FtpTopHeaderBar (Dreamstime | 123RF | Magnific | Vecteezy | SS | Adobe)│  │
│  └──────────────────┬──────────────────────────────────┬──────────────────┘  │
│                     │                                  │                     │
│        [Dreamstime Tab Active]            [Other Agency Tab Active]          │
│                     ▼                                  ▼                     │
│  ┌──────────────────────────────────┐  ┌──────────────────────────────────┐  │
│  │      DreamstimeFtpService        │  │  Multi-Agency FtpService Engine  │  │
│  │  • Isolated Queue & Telemetry    │  │  • Per-Agency State Slices:      │  │
│  │  • Vector Pairing (JPG → /)      │  │    - ftp_123rf (+ AI Batch Flag) │  │
│  │    then (EPS → /additional)      │  │    - ftp_magnific (Port 60022)   │  │
│  │  • 4-Tier Priority Sort          │  │    - ftp_vecteezy (EPS Only)     │  │
│  └──────────────────┬───────────────┘  │    - ftp_shutterstock (EPS Only) │  │
│                     │                  │    - ftp_adobe (EPS Only)        │  │
│                     │                  └───────────────┬──────────────────┘  │
│                     ▼                                  ▼                     │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │           Unified Ingestion, Bundling & Sorting Pipeline               │  │
│  │  1. Stem Matcher: Pair (Dreamstime/123RF/Magnific) vs Skip JPG Twin    │  │
│  │     (Shutterstock/Adobe/Vecteezy) + Attach Sibling JPG Preview URL     │  │
│  │  2. Deterministic Sort: Photo (0) → Vector (1) → Video (2) → CSV (3)   │  │
│  └──────────────────────────────────┬─────────────────────────────────────┘  │
│                                     ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │        local_queues.sqlite (persistent_task_queues by module_id)       │  │
│  │   [ftp] [ftp_123rf] [ftp_magnific] [ftp_vecteezy] [ftp_shutterstock]   │  │
│  │   [ftp_adobe]                                                          │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **Supported FTP Agencies (`FtpSupportedAgencyId`)**: `'dreamstime' | '123rf' | 'magnific' | 'vecteezy' | 'shutterstock' | 'adobe'` (`'freepik'` removed from FTP tabs and server specs).
  - **Per-Agency Queue Slice**: Each agency in `Ftp123RFService` stores its own `{ queue, telemetry, isRunning, isPaused, aborted, hasRecoverableSession }` mapped by `agencyId`, while `batchIsAiGenerated` belongs exclusively to the `'123rf'` slice.
  - **SQLite Queue Persistence (`module_id`)**:
    - `dreamstime` → `'ftp'` (preserving existing Dreamstime persistence compatibility)
    - `123rf` → `'ftp_123rf'`
    - `magnific` → `'ftp_magnific'`
    - `vecteezy` → `'ftp_vecteezy'`
    - `shutterstock` → `'ftp_shutterstock'`
    - `adobe` → `'ftp_adobe'`

- **Interactive Component & State Mapping**:
  - **Agency Tab Switch**: Switching tabs updates `selectedAgency`, hydrates that agency's snapshot from `local_queues.sqlite` if not yet loaded, resets transient UI modals/sub-tabs, and renders only that agency's queue and telemetry.
  - **File Drop / Folder Selection**: Passes files to the active agency's ingestion pipeline, applies the agency's vector policy (bundle `.jpg+.eps` for `dreamstime`/`123rf`/`magnific`; skip companion `.jpg` and keep `.eps` with `.jpg` preview URL for `shutterstock`/`adobe`/`vecteezy`), sorts via `bundleAndSortFtpQueue` (`Photo → Vector → Video → CSV`), updates telemetry, and persists immediately to `local_queues.sqlite`.
  - **123RF AI-Generated Batch Checkbox**: Visible only on the `123RF` tab; toggling it mutates `batchIsAiGenerated` strictly within the `ftp_123rf` state slice and re-evaluates only `123rf` non-vector items (`/` vs `/ai_image` and `/ai_video`).
  - **Preview Tooltip & Lightbox Modal**: Resolves `previewUrl` from the companion/sibling `.jpg` file for both Vector Pairs and standalone `.eps` items, and falls back to the vector icon card if no `.jpg` preview exists or if image loading fails.
