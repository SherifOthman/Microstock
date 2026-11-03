# File Cleaner Asset Origin Isolation (`Real` vs `AI`)

Deliver root-level data isolation in the File Cleaner so standard camera/vector assets (`Real`) and generative assets (`AI`) are segregated into dedicated folder hierarchies, maintain independent batch continuation counters, and preserve their origin tag when handed off to Metadata Studio.

### User Review & Critical Decisions

> [!IMPORTANT]
> All terminology, folder routing, and batch-continuation requirements from your review have been locked into this revised specification. Click **Proceed** to execute the implementation.

- **Confirmed Decision 1 (Single-Word Terminology)**: The UI uses exact single-word labels without slashes: **`Real`** vs **`AI`** in English, and **`أصلي`** vs **`ذكاء اصطناعي`** in Arabic.
- **Confirmed Decision 2 (6-Way Folder Routing)**:
  - **`Real` (`أصلي`)**: Routes into `Photos`, `Videos`, and `Vectors`.
  - **`AI` (`ذكاء اصطناعي`)**: Routes into `AI_Photos`, `AI_Videos`, and `AI_Vectors`.
- **Confirmed Decision 3 (Strict Per-Track Batch Continuation)**: Disk scanning inspects all 6 tracks independently. If `AI_Photos/B01` already contains 40 files on disk (`B01_040`), dropping new files while `AI` is selected automatically resumes at `AI_Photos/B01/B01_041__...` without overwriting or colliding with `Photos/B01`.

---

### 1. Overview & Core Concept

- **What It Does**: Provides a prominent batch-level **Asset Origin** selector (`Real` vs `AI`) in the File Cleaner that dynamically controls destination folder names, independent batch slot calculation, quarantine subfolder routing, and Metadata Studio handoff tagging.
- **Target Audience / Persona**: High-volume microstock contributors managing both real photography/footage/vectors and AI-generated media who require strict agency compliance to avoid account suspension.
- **Key Value**: Eliminates human error at the earliest ingestion stage by physically separating `Real` and `AI` files on disk and automatically carrying the `AI` flag into downstream metadata generation and CSV export.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Selecting Asset Origin**: At the top of the File Cleaner toolbar, the contributor selects either **`Real` (`أصلي`)** or **`AI` (`ذكاء اصطناعي`)**.
  2. **Live Slot & Path Preview**: Switching between `Real` and `AI` immediately recalculates every item's target subfolder (`Photos/B01/...` vs `AI_Photos/B01/...`) and updates the Master Destination Directory status bar to show the active track's next slot (e.g., `AI_Photos: B01_041 · AI_Videos: B01_001 · AI_Vectors: B01_001`).
  3. **Saving & Handoff to Metadata Studio**: Clicking **Process & Save to Folder** writes files into their segregated folders on disk; clicking **Send to Metadata Studio** transfers the files along with their `isAiGenerated` origin state.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-craft dark UI workbench with crisp 1px borders (`--border`), tabular monospace counters, and zero visual clutter.
  - *Color Palette & Mood*:
    - **`Real` (`أصلي`) Active State**: Emerald accent (`emerald-500/15` surface, `emerald-400` text/icon, `emerald-500/40` border) signaling authentic native media.
    - **`AI` (`ذكاء اصطناعي`) Active State**: Violet/Amber accent (`violet-500/15` surface, `violet-400` text/icon, `violet-500/40` border) providing an unmistakable visual distinction when operating on AI batches.
  - *Typography & Hierarchy*: Localized UI labels (`Real` / `أصلي` and `AI` / `ذكاء اصطناعي`) paired with `JetBrains Mono` (`font-mono tabular-nums`) for folder paths and batch counters (`AI_Photos/B01_041`).
- **Interactive Feedback & Motion**: Instantaneous path re-computation on toggle switch, updated confirmation dialog summaries showing exact target subfolders (`AI_Photos/B01`), and synchronized AI status upon entering Metadata Studio.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: 6-Track Independent Disk Scanning & Slot Calculation**
  - *Chosen Approach*: Scan and maintain batch slot state for all 6 tracks (`Photos`, `Videos`, `Vectors`, `AI_Photos`, `AI_Videos`, `AI_Vectors`) simultaneously inside the Master Destination Directory.
  - *Why*: Ensures zero latency when toggling between `Real` and `AI`, and guarantees that partially filled batches (e.g., 40 existing files in `AI_Photos/B01`) always resume at the exact next sequence number (`B01_041`) up to the configured batch cap before rolling over to `B02_001`.
  - *Alternatives Considered*: Sharing batch numbers between `Photos` and `AI_Photos` was rejected because contributors track `Real` and `AI` batches as independent production pipelines.
- **Decision 2: Dual Handoff & Folder-Path Inference for Metadata Studio**
  - *Chosen Approach*: Tag in-memory `File` objects during the **Send to Metadata Studio** handoff AND inspect native file paths for `/AI_Photos/`, `/AI_Videos/`, or `/AI_Vectors/` segments when files are added directly to Metadata Studio from disk.
  - *Why*: Guarantees the `AI` origin flag is preserved whether the user clicks "Send to Metadata Studio" immediately or imports a saved `AI_Photos/B01` folder from disk days later.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       File Cleaner Workbench UI                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Asset Origin Toggle:  [ Real (أصلي) ]   |   [ AI (ذكاء اصطناعي) ]  │  │
│  └─────────────────────────────────┬──────────────────────────────────┘  │
└────────────────────────────────────┼─────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                6-Track Segregation & Batch Slot Engine                   │
│  ┌───────────────────────────────┐    ┌───────────────────────────────┐  │
│  │ Real Tracks                   │    │ AI Tracks                     │  │
│  │ • Photos/B01/B01_001__...     │    │ • AI_Photos/B01/B01_041__...  │  │
│  │ • Videos/B01/B01_001__...     │    │ • AI_Videos/B01/B01_001__...  │  │
│  │ • Vectors/B01/B01_001__...    │    │ • AI_Vectors/B01/B01_001__... │  │
│  └───────────────┬───────────────┘    └───────────────┬───────────────┘  │
└──────────────────┼────────────────────────────────────┼──────────────────┘
                   ▼                                    ▼
┌───────────────────────────────────┐  ┌───────────────────────────────────┐
│   Native Disk Scanner & Writer    │  │   Metadata Studio Queue Handoff   │
│ • Scans all 6 track folders       │  │ • Preserves isAiGenerated boolean │
│ • Resumes partial batches (041+)  │  │ • Syncs Studio AI prompt & CSVs   │
└───────────────────────────────────┘  └───────────────────────────────────┘
```

- **Data Model & State**:
  - `AssetOrigin`: `'real' | 'ai'` stored in cleaner options (`assetOrigin`) and persisted across sessions.
  - `SubFolderTrack`: `'Photos' | 'Videos' | 'Vectors' | 'AI_Photos' | 'AI_Videos' | 'AI_Vectors'`.
  - `MediaBatchesMap` & `MediaSlotsMap`: Keyed by all 6 `SubFolderTrack` values, each holding independent `ExistingBatchInfo[]` and `BatchSlotCalculation` records (`startBatchNumber`, `startBatchFolder`, `startItemIndex`, `itemsRemainingInStartBatch`, `slotLabel`).
  - `MasterMetadataRecord.isAiGenerated`: Boolean persisted per asset in IndexedDB/SQLite and mirrored to `StudioView`.
- **Interactive Component & State Mapping**:
  - Switching the **Asset Origin** segmented button updates `options.assetOrigin` (`'real'` or `'ai'`), which immediately re-evaluates `cleanedItems` using the corresponding track slots (`Photos`/`Videos`/`Vectors` vs `AI_Photos`/`AI_Videos`/`AI_Vectors`).
  - Executing **Process & Save to Folder** streams chunks to the native disk writer under the resolved `subFolder/batchFolder/cleanedName` path and refreshes all 6 track batch counters upon completion.
  - Executing **Send to Metadata Studio** attaches `__isAiGenerated` to each file, records `isAiGenerated` on each `MasterMetadataRecord`, and synchronizes the Studio's AI toggle state.
