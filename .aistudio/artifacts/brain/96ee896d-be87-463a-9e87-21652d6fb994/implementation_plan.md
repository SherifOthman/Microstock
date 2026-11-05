# StockFlow UX Redesign Blueprint: Visual-First Contributor Workspace

This blueprint replaces the database-admin layout across the **Distribution Tracker**, **Overview (`HomeHubView`)**, and **FTP Uploader** with a clean, visual-first Lightroom-inspired workspace engineered for a high-volume microstock contributor processing 500+ assets daily.

---

## User Review & Confirmed Decisions

> [!IMPORTANT]
> Both of your hybrid layout decisions are locked in as the foundation of this redesign:

- **Confirmed Decision 1 — Dual View Mode (`Grid` / `List`) with Strict Single-Agency Gallery Cards**:
  - **Visual Gallery Grid Mode (Default)**: Large, clear `4:3` aspect thumbnails (`180px+` tall) in a responsive multi-column photo gallery. Each card displays **ONLY** the clean human-readable title/name, the large image, and the **single active agency's status dropdown** (plus a 1-click `Fix` button if `Rejected`, and a subtle `Metadata` inspect icon on hover). Zero 6-agency matrix clutter, zero raw uncleaned filenames, and zero inline keyword walls.
  - **Clean Compact List View Mode**: Accessed via a 1-click `[Grid | List]` toggle in the toolbar for heavy administrative auditing. Compressed `44px` single-line rows showing a crisp thumbnail, clean title, granular 1-click Copy buttons (`Title`, `Description`, `Keywords`), and the 6-agency status matrix.
- **Confirmed Decision 2 — Actionable Morning Overview Hub (`HomeHubView`)**:
  - **Top Priority — 6 Agency Readiness Cards**: Displays all 6 agencies (`Adobe Stock`, `Freepik`, `Shutterstock`, `Vecteezy`, `Dreamstime`, `123RF`) right at the top with live `New` (ready to export), `Pending Upload`, and `Rejected` counts. Clicking any agency card **instantly jumps into the Distribution Tracker with that agency active in Focus Mode**.
  - **Clean Portfolio Analytics Below**: Below the 6 Agency Readiness Cards sit the clean Shadcn Analytics Charts (Submission Progress, Media Mix, and Rejection Breakdown).
  - **100% Zero Fluff**: All text-heavy "Step 01–04" tutorials, local AI telemetry banners, and "Master Brain" marketing callouts are deleted.
- **Confirmed Decision 3 — Minimalist FTP Uploader**:
  - Stripped down to the essentials: a collapsible/compact **Dreamstime Connection Bar**, a clean **Dropzone + Auto-Router Summary** (`/` for JPG, `/additional` for EPS/AI, `/video` for MP4/MOV), a **Live Progress & Speed/ETA Bar**, and the **Transfer Queue** with 1-click `Retry Failed`. Fault injection debuggers and SQLite log tables are tucked away or removed from the primary viewport.

---

## 1. What We Are Deleting, Hiding & Redesigning

### A. Distribution Tracker (`DistributionTrackerView`)

| Legacy Clutter Element | Action | New Contributor-First Replacement |
| :--- | :--- | :--- |
| **Giant "Atomic Ingestion" Log Box** | **DELETE** | Replaced with a single slim top progress bar (`Ingesting 12 / 50... 24%`) that **automatically disappears** the instant ingestion finishes. |
| **50 Keywords & Long Descriptions in Rows** | **HIDE** | Completely removed from cards and rows. Clicking a photo thumbnail or the subtle `Metadata` icon opens a clean **Lightbox & Metadata Inspector Modal** with 1-click Copy (`Title`, `Description`, `Keywords`) and inline editing. |
| **Raw Uncleaned Filenames (`B01_AI_PH_001_...`)** | **CLEAN** | Cards and rows display the clean human-readable title (or auto-cleaned filename stripped of `B01_AI_PH_001_` prefixes and underscores). Raw filename is shown only inside the Inspector Modal. |
| **"Auto-Fill" & Redundant Row Buttons** | **DELETE** | Removed completely. Imported assets already have metadata; editing happens via the Inspector Modal or Metadata Studio. |
| **Scattered Secondary Buttons** | **CONSOLIDATE** | `Bulk Edit SEO`, `Auto-Trim Keywords`, `Reconcile Baskets`, `Load Sample Batch`, and `Clear Vault` are grouped inside a single clean **`(...) More`** dropdown menu. |
| **Hidden OS Storage Location** | **ADD** | Added a prominent 1-click **`Open Master Folder`** button directly in the toolbar that opens `/StockFlow/Master_Vault` in Windows File Explorer (`shell.openPath`). |

---

### B. Overview Screen (`HomeHubView`)

| Legacy Clutter Element | Action | New Contributor-First Replacement |
| :--- | :--- | :--- |
| **3 Technical Telemetry Cards (SQLite WAL, KeyRing RPM, Ghostscript Pool)** | **DELETE** | Replaced by a clean **Global Portfolio KPI Strip** (`Total Vault Assets`, `Ready to Export`, `Pending Reconciliation`, `Needs Fix / Rejected`) + quick `AI Keys` & `CSV Specs` header buttons. |
| **"Master Brain" Promotional Banner** | **DELETE** | Removed entirely. |
| **"Production Pipeline Step 01–04" Tutorial Cards** | **DELETE** | Removed entirely. Navigation already lives in the left sidebar rail. |
| **"Supported Stock Agencies (UTF-8)" Footer Grid** | **REPLACE** | Upgraded into the **Top 6 Agency Readiness Cards** (`Adobe Stock`, `Freepik`, `Shutterstock`, `Vecteezy`, `Dreamstime`, `123RF`) showing exact `New`, `Pending`, and `Rejected` counts. Clicking any card jumps straight to the Tracker focused on that agency. |

---

### C. Minimalist FTP Uploader (`FtpUploaderView`)

| Legacy Clutter Element | Action | New Contributor-First Replacement |
| :--- | :--- | :--- |
| **Dry-Run Fault Injection Card** | **REMOVE FROM UI** | Removed from the visible sidebar so the UI stays 100% focused on real contributor execution (fault injection remains available programmatically for automated unit tests). |
| **4-Box Telemetry Cockpit & Dual Progress Bars** | **SIMPLIFY** | Condensed into a single sleek **Live Transfer Header** showing `File X of N`, a single smooth progress bar, `Speed (MB/s)`, and `ETA`, plus the 3 auto-route counters (`/` · `/additional` · `/video`). |

---

## 2. Visual Architecture & Layout Blueprint

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ OVERVIEW (HomeHubView) — Morning Contributor Command Center                              │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [StockFlow Overview]                       [Total: 50] [New: 20] [Pending: 15] [Fix: 5]  │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ 6 AGENCY READINESS CARDS (1-Click Jump -> Opens Tracker Focused on Selected Agency)      │
│ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐      │
│ │ Adobe Stock   -> │ │ Freepik       -> │ │ Shutterstock  -> │ │ Vecteezy      -> │ ...  │
│ │ 20 New · 8 Pend  │ │ 24 New · 5 Pend  │ │ 18 New · 4 Pend  │ │ 22 New · 2 Rej   │      │
│ └──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘      │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ PORTFOLIO ANALYTICS CHARTS (Submission Progress · Media Mix · Rejection Reasons)         │
└──────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ DISTRIBUTION TRACKER — Visual Gallery Grid (Default) & Compact List Toggle               │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Search...]  [Adobe | Freepik | Shutter | Vecteezy | Dreams | 123RF]  [Filter] [Grid|List]│
│              [+ Import] [Open Master Folder] [Export Adobe (20)] [...]                   │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ VISUAL GALLERY GRID MODE (Shows ONLY Active Agency Status per Photo Card)                │
│ ┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐      │
│ │ [✓]              [🔍]   │ │ [ ]              [🔍]   │ │ [ ]              [🔍]   │      │
│ │      LARGE 4:3          │ │      LARGE 4:3          │ │      LARGE 4:3          │      │
│ │    PHOTO THUMBNAIL      │ │    PHOTO THUMBNAIL      │ │    PHOTO THUMBNAIL      │      │
│ │                         │ │                         │ │                         │      │
│ ├─────────────────────────┤ ├─────────────────────────┤ ├─────────────────────────┤      │
│ │ Luxury Marble Kitchen   │ │ Aerial Mountain Sunrise │ │ Neon Cyberpunk Street   │      │
│ │ [ ▾ New (Ready)       ] │ │ [ ▾ Pending Upload    ] │ │ [ ▾ Rejected ] [Fix ->] │      │
│ └─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘      │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Step 2 Execution & Self-Correction Simulation Protocol

Immediately upon your approval of this blueprint, I will execute the following steps:

1. **Implement the Redesigned Views**:
   - Rewrite `HomeHubView.tsx` with the **6 Agency Readiness Cards** (wired to jump directly into `DistributionTrackerView` with `activeAgency` focused) and the **Portfolio Analytics Charts**.
   - Rewrite `DistributionTrackerView.tsx` with **Visual Gallery Grid Mode (Default)** (large thumbnails, clean titles, single active agency status dropdown, hover metadata inspector modal, 1-click copy buttons, `Open Master Folder` button, auto-hiding ingestion progress bar, and `(...) More` menu) plus the **Clean Compact List View Mode** toggle.
   - Streamline `FtpUploaderView.tsx` into a clean, minimalist layout containing only the Dreamstime Credential Vault, Smart Auto-Router badges (`/`, `/additional`, `/video`), Live Progress/Speed/ETA bar, and Transfer Queue.
2. **Seed 50 Realistic Heterogeneous Mock Assets**:
   - Create a rich 50-asset generator covering every real-world contributor state across all 6 agencies:
     - **20 `New` assets** (ready for export across photos, vectors, and 4K videos)
     - **15 `Pending Upload` assets** (with active Export Baskets ready for Drag & Drop or `Shift+Click` reconciliation)
     - **10 `Uploaded` / `Accepted` assets**
     - **5 `Rejected` assets** (with specific rejection reasons like *Technical Quality / Artifacts*, *Similar / Duplicate Submission*, and *Missing Model Release* so the `Fix & Re-Queue` button is immediately testable)
     - Crisp, high-resolution SVG/Canvas data-URI photography/vector/video thumbnails so every single card in the gallery looks like a real studio shoot.
3. **Automated Layout & Visual Self-Audit**:
   - Inspect the rendered DOM & visual hierarchy across `Overview`, `Tracker (Gallery Grid)`, `Tracker (Compact List)`, and `FTP Uploader`, verifying zero text overlap, zero horizontal overflow, clean spacing, and passing all unit/integration tests, TypeScript compilation, and ESLint checks.
