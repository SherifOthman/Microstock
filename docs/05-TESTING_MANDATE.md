# 05 - Continuous Testing Mandate & QA Standards

## 1. Zero-Compromise Test-Driven Development (TDD)
In this codebase, testing is not an afterthought; it is a permanent architectural constraint:

1. **Simultaneous Test Mandate:** Developers and AI assistants are strictly forbidden from implementing new features, modifying existing algorithms, or fixing bugs without writing or updating automated tests in the exact same commit.
2. **Red-Green-Refactor:** Code changes must be proven with a failing test (Red), a clean implementation that satisfies the test (Green), followed by architectural refinement (Refactor).

---

## 2. Integration & Boundary Testing
Unit tests alone are insufficient for a multi-pipeline desktop app. Automated tests must validate system boundaries:
- **UI State to IndexedDB:** Test that adding files or modifying metadata updates Dexie IndexedDB in-place and persists across simulated restarts.
- **Worker Bridge Communication:** Test message passing, transferable ArrayBuffer payloads, watchdog timeouts, and graceful worker failure containment.
- **Native Desktop FS Bridge:** Test that directory saving properly routes through `electronAPI.saveFilesDirect` or `showSaveFilePicker` without browser Blob/ZIP memory overhead.

---

## 3. Chaos & Negative Testing (Proof of Resilience)
The test suite aggressively simulates real-world production disasters to prove the application cannot freeze or crash:
- **Filesystem Failures:** Simulates `fs` throwing `EACCES` (Permission Denied) or `ENOSPC` (Disk Full) during video muting or CSV export. The system catches errors, sets status flags, and leaves memory intact.
- **Corrupt Media:** Simulates 0-byte `.mp4` and unparseable `.eps` files. Handlers reject them gracefully into `_Needs_Fixing` or fallback placeholder badges without unhandled promise rejections.
- **Network Drops:** Simulates `fetch` throwing `TypeError: Failed to fetch` mid-generation. The scheduler flags the key, rotates to another healthy key, and retains the queue state.

---

## 4. Test Suite Health & Performance
- **Framework:** Vitest + JSDOM.
- **Current Coverage:** Over 220+ automated unit, integration, and E2E tests across 25+ suites.
- **Execution Speed:** Full test suite runs headlessly in under 7 seconds.
