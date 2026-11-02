# 04 - Multi-Platform CSV Export Specifications

## 1. Overview
The CSV Export engine (`csvExporter.ts`, `platformTransformers.ts`) transforms master metadata records into strict, agency-compliant CSV files. All files are encoded in standard **UTF-8 without Byte Order Mark (BOM)**.

---

## 2. Agency Schemas

### 1. Adobe Stock
- **Header:** `Filename,Title,Keywords,Category`
- **BOM Policy:** **STRICT NO-BOM (`\uFEFF`)**. A UTF-8 BOM corrupts the first column header (`"﻿Filename"`), causing Adobe Stock's automated ingest server to reject the entire CSV.
- **Constraints:** Maximum 49 keywords. Titles truncated on word boundaries under 200 characters.

### 2. Shutterstock
- **Header:** `Filename,Description,Keywords,Categories`
- **Constraints:** Maximum 50 keywords separated by commas. Category numbers or category labels matched against Shutterstock's official 26-category classification standard.

### 3. Freepik
- **Header:** `Filename,Title,Tags`
- **Constraints:** Keywords separated by commas or semicolons depending on user preference. Strict 50 keyword upper limit.

### 4. Vecteezy
- **Header:** `Filename,Title,Description,Keywords,License`
- **Constraints:** Supports commercial vs editorial license flags.

### 5. Dreamstime ("Smart Split Export")
Dreamstime mandates **two completely different CSV schemas** for image versus video submissions. Forcing an image schema for videos causes instant rejection.

#### A. Images Schema (`stock_metadata_dreamstime_images.csv`) - 15 Columns
```csv
File Name,Image Name,Description,Category 1,Category 2,Category 3,Keywords,Free,W-EL,P-EL,SR-EL,Editorial,Price,Max Download,Exclusive
```

#### B. Videos Schema (`stock_metadata_dreamstime_videos.csv`) - 13 Columns
```csv
File Name,Video Name,Description,Category 1,Category 2,Category 3,Keywords,W-EL,SR-EL,Editorial,Price,Max Download,Exclusive
```
*(Notice: Videos strictly omit `Free` and `P-EL` (Print Extended License) and rename Column 2 to `Video Name`)*.

#### Smart Split Execution
When the user exports a batch containing mixed media for Dreamstime:
1. Photos and Vectors are exported using the 15-column schema.
2. Footage videos are exported using the 13-column schema.
3. Both files are generated simultaneously into the target directory, eliminating manual segregation.

### 6. 123RF
- **Header:** `"oldfilename","123rf_filename","description","keywords","country"`
- **Schema Parity:** Both images and videos use the **exact same 5-column schema**.
- **Country Column:** Requires a 2-letter ISO 3166-1 alpha-2 country code (default `EG` / Egypt). If the user selects `-- None / Empty (Optional) --`, the country column outputs an empty string `""` matching 123RF's optional requirement.
- **Old Filename:** Preserves original file extensions (`.jpg`, `.mp4`, `.mov`).

---

## 3. Strict Export Lockout Mechanism
To prevent race conditions, incomplete metadata dumps, or data corruption:
- The "Export CSVs" buttons in `StudioToolbar` and `StudioView` are **strictly disabled** while the batch queue is actively generating (`isRunning === true`).
- A prompt alerts the user if attempting to export before all pending assets are complete.
