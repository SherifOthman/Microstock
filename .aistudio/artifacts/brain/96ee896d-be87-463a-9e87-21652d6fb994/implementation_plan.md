# Distribution Tracker Polish, 6-Agency Pre-Flight Validation & High-Volume Contributor UX Audit

This plan refines the Microstock Distribution Tracker into a zero-clutter execution grid with granular 1-click copy controls, proactive 6-agency pre-flight validation warnings, and a seamless "Fix & Re-Queue" loop into Metadata Studio—followed by a deep persona-driven UX Audit for 500+ daily asset contributors.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Both workflow preferences from our clarification step are locked in below. In addition, Section 5 contains the **High-Volume Contributor UX Audit Report & 4 Phase-2 Proposals** (which will remain strictly on hold until you review them).

- **Confirmed Decision 1 — "Fix & Re-Queue" Studio Loop**: Clicking **Fix & Re-Queue** on a rejected asset transitions directly to **Metadata Studio** with a pinned sticky banner displaying the agency name, rejection reason, and custom inspector note. Editing and saving any metadata field (or clicking the explicit **Save & Re-Queue to New** button in the banner) automatically resets that agency's status back to `New` and clears the rejection flag so the asset immediately re-enters the next export batch.
- **Confirmed Decision 2 — Full 6-Agency Pre-Flight Validation Rules**: The Tracker's pre-flight validator inspects every asset against the active agency's structural and editorial rules across all 6 portals (**Adobe Stock**, **Shutterstock**, **Freepik**, **Vecteezy**, **Dreamstime**, and **123RF**), surfacing warning badges before export.
- **Confirmed Decision 3 — Analytics Centralization & Backlog Discipline**: All analytics charts (Submission Progress, Portfolio Distribution & Media Mix, Rejection Telemetry) live exclusively on the **Overview** screen (`HomeHubView`). The Tracker screen is stripped of chart drawers to maximize vertical grid density. The **CSV Status Auto-Importer** is placed on hold for Phase 2.

---

## 1. Overview & Core Concept

- **What It Does**: Transforms the Distribution Tracker into a high-density, distraction-free execution matrix where contributors can validate agency compliance at a glance, copy individual metadata fields (`Title`, `Description`, `Keywords`) in one click, and remediate rejected assets in a closed loop with Metadata Studio.
- **Target Audience / Persona**: High-volume microstock contributors processing 500+ heterogeneous assets daily (commercial photos, AI illustrations, EPS vectors, and 4K footage) across 6 stock agencies.
- **Key Value**: Eliminates preventable portal rejections before CSV/staging export, removes chart clutter from the daily execution workspace, and cuts rejection remediation from a multi-screen hunt down to a 2-click round trip.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Decluttered Distribution Tracker Execution**:
   - The Tracker opens directly to the KPI summary bar, the ingestion/search/agency toolbar, and the virtualized 6-agency matrix—with zero embedded charts or collapsible chart toggles taking up vertical space.
   - Navigating to the **Overview** screen displays the full 3-card Shadcn Analytics suite (**6-Agency Submission Progress**, **Portfolio Distribution & Media Mix**, and **Rejection Reasons & QA Telemetry**). Clicking any agency row in the Overview chart jumps to the Tracker focused on that agency.
2. **Granular 1-Click Field Copy (`Title` · `Desc` · `Keywords`)**:
   - Every row in the Tracker grid displays three distinct, compact action buttons with clear icons:
     1. **Copy Title** (`Title`) — copies the exact SEO title string.
     2. **Copy Description** (`Desc`) — copies the detailed commercial description (falling back cleanly if identical to title).
     3. **Copy Keywords** (`Keywords (N)`) — copies the comma-separated keyword string.
   - Clicking any of the three buttons triggers an immediate `Copied!` state and emerald checkmark on that specific button for 1.5 seconds without affecting the adjacent buttons.
3. **Full 6-Agency Pre-Flight Warning Badges**:
   - Based on the currently focused agency tab (or across any agency with a rule violation), each row evaluates agency-specific constraints and renders a high-contrast amber pre-flight badge with a detailed tooltip explaining how to fix the issue before exporting:
     - **Adobe Stock**: Title exceeds `200` characters (`> 200 chars`), keyword count exceeds `49` tags, or fewer than `5` keywords.
     - **Shutterstock**: Keyword count exceeds `50` tags (`> 50 keywords`), description exceeds `200` characters, or unstripped audio detected on video clips.
     - **Freepik**: Title exceeds `100` characters, keyword count is outside the `10–50` range, or vector asset is missing its paired preview.
     - **Vecteezy**: Title has fewer than `3` words or exceeds `200` characters, or keyword count is outside `5–50`.
     - **Dreamstime**: Title exceeds `130` characters, description is shorter than `5` words, or keyword count is outside `10–80`.
     - **123RF**: Title exceeds `110` characters, description is empty, or keyword count is outside `7–50`.
4. **Closed-Loop "Fix & Re-Queue" Workflow**:
   - Whenever an asset is marked `Rejected` on the focused agency (or inside any agency cell's dropdown menu when its status is `Rejected`), a prominent **Fix & Re-Queue** action button appears right next to the status badge.
   - Clicking **Fix & Re-Queue** switches the workspace to **Metadata Studio**, filters/scrolls directly to that asset, and mounts a sticky **Rejection Remediation Banner** at the top of the Studio workspace showing:
     - The rejecting Agency logo and name (e.g., *Shutterstock*)
     - The logged Rejection Dictionary reason (e.g., *Technical Quality / Artifacts* or *Title / Keyword Spam*)
     - The custom inspector note
     - Two actions: **Save & Re-Queue to New (Return to Tracker)** and **Dismiss Banner**.
   - Editing the asset's title, description, or keywords in Metadata Studio automatically flips that agency's tracking status from `Rejected` back to `New` in SQLite, and clicking **Save & Re-Queue to New** returns you directly to the Distribution Tracker with the asset ready for export.

### Visual Identity & Theme

- **Aesthetic Direction**: Utilitarian, high-density desktop studio console adhering to the 60-30-10 color rule (`--background` slate canvas, `--card` structural surfaces with 1px hairline borders, and semantic status accents).
- **Tabular Discipline**: All counters, keyword lengths, character counts, and SHA-256 hashes use `font-mono tabular-nums` so columns align vertically with zero layout jitter.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Strict Separation of Analytics (Overview) vs. Execution (Tracker)**
  - *Chosen Approach*: Remove the `Charts` toggle and collapsible analytics drawer from the Distribution Tracker and render the 3 Shadcn charts exclusively on the Overview hub.
  - *Why*: When managing 500+ rows, vertical viewport height is the scarcest resource. Keeping charts on Overview gives contributors a dedicated morning/evening telemetry dashboard while reserving 100% of the Tracker viewport for filtering, copying, and batch status reconciliation.
- **Decision 2: Live Agency-Aware Pre-Flight Engine**
  - *Chosen Approach*: Compute agency rule violations reactively in memory per asset against the active agency filter (plus a summary count in the toolbar).
  - *Why*: Contributors immediately see if 12 assets in their batch have 52 keywords when switching to the **Shutterstock** tab, preventing failed CSV imports before staging an Export Basket.
- **Decision 3: Event-Driven Studio Remediation Bridge**
  - *Chosen Approach*: Pass the active remediation context (`assetId`, `masterRecordId`, `filename`, `agency`, `reasonTitle`, `customNote`) from the Tracker to the root application shell and Metadata Studio, triggering an automatic SQLite status reset (`Rejected -> New`) upon metadata mutation or explicit confirmation.
  - *Why*: Preserves keep-alive workspace state across tabs without losing scroll position or batch state.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Application Shell & Navigation                        │
│     Tracks Active Tab + Active Remediation Context (Fix & Re-Queue State)    │
└───────────────┬──────────────────────────────────────────────┬───────────────┘
                │                                              │
                ▼                                              ▼
┌───────────────────────────────┐              ┌───────────────────────────────┐
│      Overview Hub View        │              │   Distribution Tracker View   │
│  ┌─────────────────────────┐  │              │  ┌─────────────────────────┐  │
│  │ 6-Agency Stacked Bars   │  │              │  │ 6-Agency Pre-Flight     │  │
│  │ Portfolio Donut & Mix   │  │              │  │ Validator (6 Portals)   │  │
│  │ Rejection QA Telemetry  │  │              │  ├─────────────────────────┤  │
│  └─────────────────────────┘  │              │  │ Virtualized Asset Grid  │  │
│  (Exclusive Analytics Home)   │              │  │ • Copy Title / Desc /   │  │
│                               │              │  │   Keywords (Distinct)   │  │
│                               │              │  │ • Fix & Re-Queue CTA    │  │
└───────────────────────────────┘              └───────────────┬───────────────┘
                                                               │
                                   Fix & Re-Queue              │
                                   (Asset + Rejection Note)    ▼
                                               ┌───────────────────────────────┐
                                               │     Metadata Studio View      │
                                               │  ┌─────────────────────────┐  │
                                               │  │ Sticky Rejection Note   │  │
                                               │  │ Banner + Re-Queue CTA   │  │
                                               │  ├─────────────────────────┤  │
                                               │  │ Asset Card Editor       │  │
                                               │  │ Auto-Resets Agency      │  │
                                               │  │ Status -> 'New' on Edit │  │
                                               │  └─────────────────────────┘  │
                                               └───────────────────────────────┘
```

### Interactive Component & State Mapping

- **Granular Copy State (`copiedFieldKey`)**: Keyed by `${asset.id}:title`, `${asset.id}:desc`, and `${asset.id}:keywords` so clicking any button highlights only that specific control with `Copied!`.
- **6-Agency Pre-Flight Rule Evaluator**: Pure validation helper returning an array of agency-specific warnings (`code`, `label`, `detail`, `severity`) for the selected agency (`adobe`, `shutterstock`, `freepik`, `vecteezy`, `dreamstime`, `123rf`), displayed inline in the row and summarized in the filter bar.
- **Fix & Re-Queue State Machine**:
  1. Clicking **Fix & Re-Queue** on a rejected asset invokes `onFixAndRequeue(payload)` which switches to the Metadata Studio tab, pre-fills the search filter to isolate that asset, and displays the sticky **Rejection Remediation Banner**.
  2. Updating Title, Description, or Keywords on that asset (or clicking **Save & Re-Queue to New**) updates `master_records` and `tracker_assets`, invokes `bulkUpdateAgencyStatus([assetId], agency, 'New')`, and optionally returns the user to the Tracker with a confirmation banner.

---

## 5. High-Volume Microstock Contributor UX Audit Report (500+ Assets / Day)

> [!NOTE]
> Per your instructions, the audit findings and 4 new feature proposals below are presented strictly for brainstorming and architectural alignment. **No code will be written for these Phase 2 proposals until you review them and choose which ones to prioritize.**

### A. Friction & Bottlenecks Identified in a 500-Asset/Day Workflow

1. **Visual Overload in the 6-Agency Matrix at Scale**:
   - *The Problem*: Looking at 6 colored status badges per row across 500 rows equals **3,000 status badges**. When your goal at 2:00 PM is simply *"Upload today's 120 vectors to Freepik"*, seeing the other 5 agencies' columns creates visual noise and steals horizontal space from the SEO Title, Description, and Pre-Flight warnings.
2. **Partial Upload Failure Reconciliation (The "30 Failed Freepik Files" Scenario)**:
   - *The Problem*: Suppose you export 200 files to a Freepik Export Basket (`Pending Upload`), upload them via FTP/Web, and Freepik's portal rejects or drops 30 files during transfer while accepting 170 into review. Right now, reconciling that means manually hunting and unchecking 30 filenames out of 200 in the grid before clicking `Mark Uploaded`. Scrolling through 200 rows to spot 30 filenames is slow and error-prone.
3. **Range Selection & Keyboard Speed**:
   - *The Problem*: Clicking 50 individual row checkboxes one by one takes 50 clicks. High-volume contributors expect **Shift+Click range selection** (click row 10, hold Shift, click row 60 to select all 50 rows) and keyboard shortcuts (`Space` to toggle row, `U` to mark Uploaded, `A` to mark Accepted).
4. **The "Misspelled Keyword Across 100 Images" Edge Case**:
   - *The Problem*: If an AI batch generates a typo or banned trademark tag (e.g., `"iphonne"`, `"midjourney"`, `"nike"`, or `"illustartion"`) across 100 ingested assets, fixing it currently requires editing 100 cards individually in Metadata Studio. Similarly, if Adobe Stock rejects a batch for a recurring forbidden tag, there is no 1-click way to strip or replace that tag across all selected Tracker rows.

### B. 4 High-Leverage Workflow Proposals for Your Feedback

1. **Proposal 1 — Bulk Find & Replace / Tag Sanitizer Drawer (Solves the 100-Image Typo Edge Case)**
   - A fast **"Bulk Edit SEO / Tags"** bar for selected rows in the Tracker that lets you:
     - **Find & Replace Text** across Titles and Descriptions in 1 click.
     - **Remove / Replace / Prepend Keywords** across 100+ selected assets simultaneously (e.g., remove `"midjourney"` or replace `"illustartion"` with `"illustration"` across all 100 rows in `< 50ms` in SQLite).
     - **Auto-Trim to Agency Cap**: 1-click button to trim any asset with `> 50` keywords down to its top 49 ranked keywords so Shutterstock/Adobe warnings vanish instantly.
2. **Proposal 2 — "Paste Failed Filenames" Exception Reconciler (Solves the 30 Failed Freepik Uploads)**
   - Inside the **Export Baskets (`Pending Upload`)** modal, add an **"Exception Paste Box"**:
     - Instead of manually clicking 30 failed files out of a 200-file batch, you paste a list of failed filenames (or drag-select the remaining files left in your FTP failure queue), and StockFlow automatically **reverts those 30 files to `New`** while marking the **other 170 files as `Uploaded`** in a single atomic transaction.
3. **Proposal 3 — "Single-Agency Focus Mode" Toggle + Shift-Click Range Selection**
   - A 1-click **"Focus Active Agency Column"** toggle above the grid that collapses the other 5 agency columns into a compact mini-summary pill (`4/5 Sent`) and expands the active agency column to show its full status, timestamp, rejection reason, and pre-flight validation notes—paired with native **Shift+Click** multi-row checkbox range selection.
4. **Proposal 4 — Smart Batch Grouping ("Group by Ingestion Batch / B01 Folder")**
   - When managing 5,000+ lifetime assets, flat lists become hard to navigate. Adding a **"Batch / Shoot Filter"** (`B01 — Solar Panels (85)`, `B02 — Nordic Office (120)`, `Today's Ingestions`) lets you isolate an entire shoot in one click and export or reconcile that shoot as a unit.
