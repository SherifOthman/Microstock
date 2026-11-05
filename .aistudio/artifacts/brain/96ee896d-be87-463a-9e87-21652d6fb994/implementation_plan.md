# Microstock FTP Uploader — Phase 1: Dreamstime Proof of Concept

A hyper-focused, standalone microstock FTP uploader built specifically for high-volume stock contributors—eliminating generic FileZilla directory trees in favor of automated extension routing, hardware-encrypted credentials, 60fps real-time transfer telemetry, resilient exponential-backoff retries, and persistent session audit logs.

---

## User Review & Confirmed Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed during Phase 1 planning and govern this Proof of Concept implementation:

- **Confirmed Decision 1 — Strict Phase 1 Scope (Dreamstime PoC + SFTP-Ready Adapter)**: Phase 1 focuses exclusively on **Dreamstime** (`ftp.dreamstime.com`, Port `21`, standard FTP and Explicit FTPS via `basic-ftp`). We will not clutter the UI with unconfigured agency tabs yet, while designing the underlying transport interface (`StockTransferAdapter`) so SFTP (Port `22` for Adobe Stock) and other agencies plug in cleanly in Phase 2.
- **Confirmed Decision 2 — Resilient Auto-Retry & Failed Queue**: Network blips during unattended overnight batches will automatically retry up to **3 times per file** using exponential backoff (`1.5s` → `3s` → `6s`), reconnecting the control/data socket if dropped. Only after 3 exhausted attempts is the file moved to the **Failed Queue** with its exact FTP error code/reason and a 1-click **Retry All Failed** action.
- **Confirmed Decision 3 — Dual Execution Mode (Live `basic-ftp` + Built-In Dry-Run Simulator)**: Includes a toggleable **Dry-Run Simulator** alongside the real `basic-ftp` engine so you can safely test 60fps progress bars, speed/ETA math, Dreamstime folder routing (`/`, `/additional`, `/video`), and simulated mid-batch network drops without uploading dummy files to your live Dreamstime account.

---

## 1. Overview & Core Concept

- **What It Does**: Provides a dedicated **FTP Uploader** workspace tab where contributors configure their Dreamstime FTP credentials once (encrypted at rest via OS keychain/DPAPI), drop or select a heterogeneous batch of files (JPEGs, EPS/AI vectors, MP4/MOV videos), preview the automatic destination folder routing, and execute high-speed unattended transfers with real-time telemetry and persistent SQLite logs.
- **Target Audience / Persona**: High-volume microstock contributors uploading hundreds of photos, vectors, and 4K videos who need zero-friction routing and rock-solid overnight reliability without babysitting manual remote folders.
- **Key Value**: Replaces manual drag-and-drop into separate `/`, `/additional`, and `/video` remote directories with deterministic extension routing, smooth 60fps telemetry, automatic socket recovery, and a permanent audit trail ready for future background automation.

---

## 2. User Experience & Visual Design (Shadcn Architecture)

### Visual Identity & Workspace Layout
- **Aesthetic Direction**: Utilitarian, high-density dark/light studio console matching StockFlow's existing design system. Zero file-tree clutter—no dual-pane local/remote explorer browsers.
- **Typography & Tabular Discipline**: Crisp sans-serif UI controls paired with strict monospace tabular numerals (`font-mono tabular-nums`) for all byte counters, transfer speeds (`MB/s`), percentages, destination paths, and ETA countdowns so numbers never jitter during 60fps updates.
- **Color & Status Semantics**:
  - **60% Neutral Canvas**: Clean `bg-background` and `bg-card` surfaces with `1px` `border-border` hairlines.
  - **Semantic Telemetry Accents**: Primary brand accent for active transfer progress bars, Emerald (`text-emerald-500`) for verified remote deliveries and encrypted vault lock indicators, Amber (`text-amber-500`) for active auto-retry backoff states, and Crimson (`text-destructive`) for exhausted transfer failures.

### Spatial Layout Blueprint (1440px Desktop Viewport)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Top Command Strip: [Dreamstime PoC Badge]  [Mode: Live FTP | Dry-Run Sim]  [Session Logs]│
├───────────────────────────┬──────────────────────────────────────────────────────────────┤
│ LEFT COLUMN (320px Fixed) │ RIGHT MAIN EXECUTION CANVAS (Flex-1, ~82% Viewport Width)    │
│                           │                                                              │
│ 1. Credential Vault Card  │ 1. Live Telemetry Cockpit (Shadcn Card + Progress)           │
│  ┌─────────────────────┐  │  ┌────────────────────────────────────────────────────────┐  │
│  │ Host: ftp.dreams... │  │  │ Batch: 14 / 50 Files (28%)     Speed: 6.4 MB/s         │  │
│  │ Port: 21  [FTPS ✓]  │  │  │ [██████████░░░░░░░░░░░░░░░░░░] ETA: 02m 18s            │  │
│  │ User: [..........]  │  │  │ Active: B01_Drone_4K.mp4 → /video  [██████░░] 74%      │  │
│  │ Pass: [••••••••••]  │  │  └────────────────────────────────────────────────────────┘  │
│  │ 🔒 OS DPAPI Secured │  │                                                              │
│  │ [Save] [Test Conn]  │  │ 2. Compact Dropzone & Action Bar                             │
│  └─────────────────────┘  │  ┌────────────────────────────────────────────────────────┐  │
│                           │  │ [+ Add Files / Drop Batch]  [Start Upload] [Pause/Stop]│  │
│ 2. Dreamstime Auto-Router │  └────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────┐  │                                                              │
│  │ • JPG/PNG  → /      │  │ 3. Segmented Queue Tabs (Queued | Succeeded | Failed | Logs) │
│  │   (32 queued)       │  │  ┌────────────────────────────────────────────────────────┐  │
│  │ • EPS/AI   → /add.. │  │  │ [All (50)] [Pending (35)] [Succeeded (14)] [Failed (1)]│  │
│  │   (10 queued)       │  │  ├────────────────────────────────────────────────────────┤  │
│  │ • MP4/MOV  → /video │  │  │ File               Size    Route        Status / Info  │  │
│  │   (8 queued)        │  │  │ B01_Solar.jpg      8.2 MB  /            ✓ 100% (1.2s)  │  │
│  └─────────────────────┘  │  │ B01_Icon.eps       4.1 MB  /additional  ↻ Retry 2/3... │  │
│                           │  │ B02_Highway.mp4    142 MB  /video       ✕ 550 Timeout  │  │
│ 3. Simulator Fault Inject │  │                                         [Retry Failed] │  │
│  (Visible in Dry-Run)     │  └────────────────────────────────────────────────────────┘  │
└───────────────────────────┴──────────────────────────────────────────────────────────────┘
```

### Key User Flows
1. **Vault Configuration & Connection Test**:
   - In the left **Credential Vault** card, the Host defaults to `ftp.dreamstime.com` (Port `21`, Explicit TLS/FTPS toggleable).
   - The contributor enters their Dreamstime FTP Username and Password and clicks **Save to Secure Vault**.
   - Electron encrypts the password via `safeStorage.encryptString()` (Windows DPAPI / macOS Keychain) and stores the `enc:<hex>` ciphertext in SQLite. A lock badge confirms `Encrypted at rest via OS Keychain`.
   - Clicking **Test Connection** performs a handshake (`connect` → `login` → `pwd` → `close`) and displays connection latency (e.g., `Connected · 118ms`).
2. **Batch Selection & Smart Routing Preview**:
   - Dropping files or clicking **Add Files** inspects each file's extension and immediately assigns its remote target path according to Dreamstime's specification:
     - `.jpg`, `.jpeg`, `.png`, `.webp` $\longrightarrow$ `/` (Root directory)
     - `.eps`, `.ai`, `.svg` $\longrightarrow$ `/additional`
     - `.mp4`, `.mov`, `.webm` $\longrightarrow$ `/video`
   - The **Dreamstime Auto-Router** summary card updates live counts per target folder so the contributor can verify the mix before starting.
3. **Live Execution & 60fps Telemetry**:
   - Clicking **Start Upload** initiates sequential streaming transfers (or simulated transfers in Dry-Run mode).
   - The **Live Telemetry Cockpit** displays two synchronized Shadcn `Progress` bars:
     1. **Overall Batch Progress**: `File X of N` + total bytes transferred vs. total batch bytes, paired with a smoothed **Live Upload Speed (`MB/s`)** and **Batch ETA (`mm:ss`)**.
     2. **Current File Progress**: Active filename, target remote directory badge (`/` | `/additional` | `/video`), byte progress, and percentage (`0%–100%`).
4. **Exception Recovery & Persistent Session Logs**:
   - If a transfer encounters a socket drop or timeout, its row badge transitions to `Retrying (1/3)...` in amber.
   - If all 3 retries fail, the row moves to the **Failed (`N`)** tab with the exact server error message, while the batch continues uninterrupted.
   - Clicking **Retry Failed (N)** re-queues only the failed items. Every session and per-file outcome is written to SQLite and viewable in the **Session Logs** tab.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Throttled 60fps Telemetry Bridge (`16ms–50ms` Rolling Window) vs. Raw Socket Chunk Events**
  - *Chosen Approach*: `basic-ftp`'s `client.trackProgress()` fires on every raw TCP socket buffer chunk (potentially thousands of times per second on gigabit connections). The Node.js main process will aggregate bytes in memory, calculate an Exponential Moving Average (EMA) transfer speed, and emit `ftp:telemetry` IPC frames to the React renderer at a capped interval (`~30–60Hz` / every `25ms`), plus immediate emission on file state transitions (`started`, `retrying`, `succeeded`, `failed`).
  - *Why*: Prevents Electron IPC saturation and React render thrashing, guaranteeing buttery-smooth 60fps progress bars even when uploading 500MB 4K ProRes/MP4 files.
- **Decision 2: Main-Process Password Decryption Only**
  - *Chosen Approach*: When saving credentials, the plaintext password is encrypted via Electron `safeStorage` and stored in SQLite. When starting an FTP session, the Node.js FTP worker reads the ciphertext from SQLite and decrypts it via `safeStorage.decryptString()` strictly inside the Electron Main process memory—never sending the decrypted password back to the React renderer.
  - *Why*: Eliminates credential exposure in DevTools or renderer memory dumps while keeping 1-click connection seamless.
- **Decision 3: SQLite Persistent FTP Session & Item Audit Tables**
  - *Chosen Approach*: Store all FTP sessions (`ftp_sessions`) and file transfer events (`ftp_transfer_logs`) in our existing `better-sqlite3` WAL database (with IndexedDB fallback in browser preview), triggering our Event-Driven Hot Backup upon batch completion.
  - *Why*: Structured relational logs allow querying historical upload speeds, failure rates, and unattended overnight runs, and will link directly to `agency_tracking` in Phase 2.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### System Architecture & Telemetry Bridge Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       REACT RENDERER (Shadcn FTP Workspace)                     │
│                                                                                 │
│  ┌──────────────────────┐   ┌────────────────────────┐   ┌───────────────────┐  │
│  │ CredentialVaultPanel │   │  LiveTelemetryCockpit  │   │ TransferQueueGrid │  │
│  │ (Host, User, DPAPI)  │   │ (Batch %, File %, ETA) │   │ (Queued/OK/Failed)│  │
│  └──────────┬───────────┘   └───────────▲────────────┘   └─────────▲─────────┘  │
└─────────────┼───────────────────────────┼──────────────────────────┼────────────┘
              │ ipcRenderer.invoke        │ ipcRenderer.on           │
              │ ('ftp:saveCreds' /        │ ('ftp:telemetry'         │
              │  'ftp:startBatch')        │  throttled @ 40Hz)       │
==============▼===========================┼==========================┼============
              │                           │                          │
┌─────────────▼───────────────────────────┴──────────────────────────┴────────────┐
│                        ELECTRON MAIN PROCESS (Node.js)                          │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ FtpTransferOrchestrator (Queue Runner, Exponential Backoff 3x, EMA Speed) │  │
│  └──────┬───────────────────────────────┬─────────────────────────────┬──────┘  │
│         │                               │                             │         │
│         ▼                               ▼                             ▼         │
│  ┌──────────────────┐         ┌────────────────────┐       ┌─────────────────┐  │
│  │ OS safeStorage   │         │ StockTransferEngine│       │ SQLite WAL DB   │  │
│  │ (DPAPI/Keychain) │         │ ├─ BasicFtpAdapter │       │ ├─ ftp_profiles │  │
│  │ Decrypts in Main │         │ └─ DryRunSimulator │       │ ├─ ftp_sessions │  │
│  └──────────────────┘         └─────────┬──────────┘       │ └─ ftp_logs     │  │
│                                         │                  └─────────────────┘  │
└─────────────────────────────────────────┼───────────────────────────────────────┘
                                          │ FTP / Explicit FTPS (Port 21)
                                          ▼
                         ┌─────────────────────────────────┐
                         │   Dreamstime FTP Server         │
                         │   ├── /            (JPG/PNG)    │
                         │   ├── /additional  (EPS/AI)     │
                         │   └── /video       (MP4/MOV)    │
                         └─────────────────────────────────┘
```

### Data Model & SQLite Persistence Schema
1. **`ftp_profiles` Table (Credential Vault)**:
   - `agency_id` (`PRIMARY KEY`, e.g., `'dreamstime'`), `protocol` (`'ftp' | 'ftps' | 'sftp'`), `host` (`'ftp.dreamstime.com'`), `port` (`21`), `username`, `encrypted_password` (`enc:<hex>` via `safeStorage`), `passive_mode` (`1`), `last_verified_at`, `updated_at`.
2. **`ftp_sessions` Table (Batch Session Audit)**:
   - `id` (`UUID`), `agency_id` (`'dreamstime'`), `mode` (`'live' | 'dry_run'`), `started_at`, `completed_at`, `status` (`'running' | 'completed' | 'partial_failure' | 'aborted'`), `total_files`, `succeeded_files`, `failed_files`, `total_bytes`, `average_speed_bps`.
3. **`ftp_transfer_logs` Table (Per-File Resiliency & Telemetry Log)**:
   - `id` (`UUID`), `session_id`, `filename`, `local_path`, `file_size`, `media_type`, `remote_directory` (`'/' | '/additional' | '/video'`), `remote_path`, `status` (`'queued' | 'uploading' | 'retrying' | 'succeeded' | 'failed'`), `retry_count` (`0–3`), `error_code`, `error_message`, `duration_ms`, `completed_at`.

### Interactive Component & State Mapping
- **Dreamstime Extension Router (`resolveDreamstimeRoute(filename)`)**:
  - Pure, deterministic mapper that inspects file extensions on ingest: raster images route to `/`, vector sources (`.eps`, `.ai`, `.svg`) route to `/additional`, and video clips (`.mp4`, `.mov`, `.webm`) route to `/video`.
- **60fps EMA Speed & ETA Calculator**:
  - Tracks a rolling 3-second sliding window of transferred byte deltas to compute instantaneous speed and smooth it via Exponential Moving Average ($S_t = \alpha \cdot S_{\text{instant}} + (1 - \alpha) \cdot S_{t-1}$).
  - Computes $\text{ETA (seconds)} = \frac{\text{Remaining Batch Bytes}}{\max(S_t, 1)}$ so the countdown remains steady and accurate across mixed file sizes.
- **Dry-Run Simulator Controls**:
  - When **Dry-Run Mode** is active, contributors can toggle a **"Simulate Network Drop on Next File"** switch to watch the engine trigger `Retry 1/3` $\rightarrow$ `Retry 2/3` $\rightarrow$ `Retry 3/3` with backoff timers, or let it exhaust all 3 retries to test the **Failed Queue** and **1-Click Retry Failed** workflow before connecting to live Dreamstime servers.
