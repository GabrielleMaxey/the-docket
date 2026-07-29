# NORA Spreadsheet Priority Import — Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Import NORA Excel-export CSV (`Priority`, `ODI`, `notes`) into local `issue_metadata` from Settings.

**Architecture:** Pure helpers parse CSV + merge rules; `POST /api/issue-metadata/import` applies in a SQLite transaction; Settings UI uploads CSV and shows a summary.

**Tech Stack:** Express, better-sqlite3, React Settings, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-29-nora-spreadsheet-priority-import-design.md`

## Global Constraints

- CSV only (v1); no `.xlsx`
- Overwrite priority for matching keys; notes only if local empty
- Ignore Developer / Jira Status
- No new npm dependencies
- Minimal changes; match existing Settings / metadata patterns

---

### Task 1: Parse + merge helpers + tests

**Files:** `server/lib/issueMetadataImport.mjs`, `tests/issueMetadataImport.test.mjs`

- [x] Parse CSV headers case-insensitively; require `ODI` + `Priority`
- [x] Parse priority `1`–`10` / `P#` / `PRIORITY P#`
- [x] `planIssueMetadataImport(rows, existingByKey)` → upserts + summary
- [x] Unit tests

### Task 2: API route

**Files:** `server/routes/issueMetadataRoutes.mjs` (+ multer if already used, else JSON `{ csvText }` or raw text)

- [x] `POST /api/jira/issue-metadata/import`
- [x] Transactional upserts
- [x] Return summary counts

### Task 3: Settings UI + client + docs

**Files:** Settings section, `src/services/jiraClient.js`, `docs/END_USER_GUIDE.md`

- [x] Import team priorities section
- [x] Client upload helper
- [x] END_USER_GUIDE short instructions
