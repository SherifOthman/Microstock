# 01 - Architecture and State Management

## 1. Executive Overview
**Stock Assistant** is a desktop-first microstock automation application engineered for enterprise-grade throughput, stability, and resilience. It processes mixed-media commercial batches (Photos, AI Images, Footage, and Vector Artwork) through automated renaming, metadata generation via Gemini Vision AI, lossless audio track stripping, and multi-agency distribution tracking.

---

## 2. Desktop-First Native Filesystem Architecture
The application runs as an Electron desktop application with direct, unsandboxed access to the Windows operating system filesystem through a secure IPC bridge.

### Bridge Contract (`electron/preload.cjs` & `desktopFs.ts`)
- **Direct Disk Persistence:** Eliminates browser memory bloat and reliance on in-memory `Blob` URLs or `JSZip`. When files or CSVs are saved, they are streamed directly to local disk paths via native Node.js `fs.promises` and Node streams.
- **Directory Traversal:** Supports recursive folder selection via `window.electronAPI.selectDirectory()` and native folder opening via `window.electronAPI.openPathInExplorer()`.
- **Atomic Operations:** File writes and moves use temporary paths and atomic renames to prevent partial corruption in case of unexpected termination or power loss.
- **Secure Key Storage (`secureStorage.ts`):** Sensitive API credentials (Gemini, OpenRouter, Cloudflare keys) are encrypted at rest using Windows Data Protection API (DPAPI) via native Electron safeStorage APIs, with an encrypted local fallback.

---

## 3. Web Worker Offloading & UI Responsiveness
Heavy binary parsing and CPU-intensive mathematical operations are strictly decoupled from the main React UI thread to maintain 100% responsiveness at 60fps.

### EPS Background Worker Pipeline (`src/services/eps/`)
1. **The Bottleneck:** Parsing complex PostScript Level 2/3 vector streams, embedded TIFF previews, and CMYK-to-sRGB color transformations can consume billions of CPU cycles per file. Running this on the main thread previously blocked the React event loop, freezing animations and causing severe UI latency.
2. **Worker Implementation:**
   - **`epsWorkerCore.ts`**: Pure mathematical and binary decoding engine. Environment-agnostic, utilizing `OffscreenCanvas` and `createImageBitmap` when executed in worker threads, and standard Canvas elements in DOM environments.
   - **`epsWorker.ts`**: Dedicated Web Worker process listening for `rasterize` tasks.
   - **`epsWorkerClient.ts`**: Client-side worker manager using **Transferable Objects** (`[buffer]`) to transfer raw `ArrayBuffer` instances without main-thread copying overhead.
   - **Watchdog Protection:** Features a 25-second watchdog timer. If an invalid or heavily nested EPS file hangs the worker, the manager terminates the hung instance and safely falls back to a clean vector placeholder badge.

---

## 4. Separation of Concerns (SoC) & Component Decomposition
The UI architecture follows strict single-responsibility principles (SRP) to eliminate "God Components" and isolate render trees:

### Custom Hooks
- **`useBatchQueue`**: Encapsulates queue lifecycle, worker polling, error dispatching, and slot concurrency management.
- **`useUnifiedAssets`**: Merges reactive Dexie IndexedDB live records with transient in-memory queue states. Enforces in-place, deterministic natural alphanumeric sorting.
- **`useCsvExport`**: Manages multi-platform CSV formatting, validation rules, lockout locks during queue generation, and direct-to-folder export.
- **`useFileCleaner`**: Governs batch ingestion, 6-track media segregation, and Windows Explorer folder organization.

### Modular Studio Components
- **`AssetCard`**: Render-isolated asset card with memoized thumbnail rendering (`AssetThumbnail`), AI state indicators (`AssetAiBadge`), keyword management (`AssetKeywordsManager`), and manual override editors (`AssetMetadataEditor`).
- **`StudioToolbar`**: Independent toolbar with batch health indicators, search filtering, and action dispatchers.
- **`PlatformConfigSection`**: Agency metadata toggles and ISO-standard country selector (`CountryCombobox`).

---

## 5. Persistence & Dexie IndexedDB Architecture
Data permanence is guaranteed via Dexie IndexedDB (`StockAssistantDB`):

### Database Schema
```typescript
masterRecords: 'id, batchId, filename, status, isAiGenerated, createdAt'
batches: 'id, createdAt, status'
apiKeys: 'id, providerId, status, lastUsedAt, createdAt'
trackerRecords: 'id, filename, mediaType, updatedAt, createdAt'
settings: 'key'
```

### In-Place State Synchronization
- **Live Queries:** Views subscribe via `useLiveQuery(() => db.masterRecords.orderBy('createdAt').toArray())`.
- **Safe Recovery:** If the user closes or reloads the application mid-generation, all completed records remain safely stored in IndexedDB. Pending assets resume processing upon restart without data loss or sequence gaps.
