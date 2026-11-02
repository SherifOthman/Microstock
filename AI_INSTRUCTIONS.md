# AI Architecture & Development Guidelines

This file outlines the permanent architectural constraints for all AI coding agents working on this project.

## CORE DIRECTIVES:

1. **Consult `/docs` First:**
   Always review the comprehensive architecture guides in `/docs/` before making changes:
   - `docs/01-ARCHITECTURE_AND_STATE.md`: Native Desktop FS bridge, Web Workers, Dexie persistence.
   - `docs/02-CORE_PIPELINES.md`: 6-track media segregation, lossless video muter, natural alphanumeric sorting.
   - `docs/03-AI_AND_METADATA_RULES.md`: Vision AI prompts, 1-2 word keyword engine, title truncation.
   - `docs/04-CSV_EXPORT_SPECS.md`: Multi-platform CSV export schemas, Dreamstime split export, Adobe no-BOM rule.
   - `docs/05-TESTING_MANDATE.md`: Zero-compromise TDD mandate, integration testing, and chaos negative testing.

2. **Zero-Compromise TDD Mandate:**
   - Write or update automated tests alongside every code change.
   - Never consider a task done until `npm test` passes with 100% success.

3. **Never Block the Main Thread:**
   - Keep the React UI thread at 60fps. Heavy CPU tasks (e.g. PostScript EPS parsing, binary manipulation) must run in Web Workers or Electron background tasks.

4. **Never Use JSZip:**
   - Use the Native Desktop FS Bridge (`desktopFs.ts`) to stream files and CSVs directly to disk.

5. **Never Concatenate Keywords:**
   - Strict 1-2 words per keyword with space separation. No unspaced run-together words.

6. **Preserve Deduplication Algorithm:**
   - Do NOT alter the existing deduplication logic in `fileCleanerEngine.ts` / `useFileCleaner.ts`.

7. **Natural Alphanumeric Sorting:**
   - In all views (Metadata Studio, Video Muter, EPS Converter, Cleaner), sort items using `localeCompare(..., { numeric: true, sensitivity: 'base' })` to match Windows File Explorer.
