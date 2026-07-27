# CoWork Weekly Plans in Past Reports — Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** List and open `data/weekly-plan-*.md` CoWork files in Past Reports (Files tab + Work Week), with live disk reads and optional Save to archive.

**Architecture:** Server helpers list/read sanitized files under app `data/`; ReportArchive fetches and merges file items with SQLite archive rows; Save to archive reuses `POST /api/reports/archive` as `week_plan` with `meta.fromCoworkFile`.

**Tech Stack:** Express, Node `fs`, React, existing `reportArchive` / `ReportOutput`.

**Spec:** `docs/superpowers/specs/2026-07-27-cowork-weekly-plans-past-reports-design.md`

## Global Constraints

- Pattern: `weekly-plan-*.md` only (case-insensitive), `data/` root only
- Path sanitization: basename only; reject escapes
- No delete/rename of CoWork files in v1
- Archive as `source: work_week`, `report_type: week_plan`, `meta.fromCoworkFile: true`
- No new dependencies
- Minimal changes; match existing Past Reports style

---

### Task 1: Server list/read + tests

**Files:** Create `server/lib/coworkWeeklyPlans.mjs`, `tests/coworkWeeklyPlans.test.mjs`; modify `server/routes/reportRoutes.mjs` (or wherever archive routes live); pass `dbDir`/`dataDir`.

- [x] TDD list/read helpers
- [x] GET `/api/reports/cowork-files` and GET `/api/reports/cowork-files/:filename`
- [ ] Commit

### Task 2: Client + ReportArchive UI

**Files:** `src/services/jiraClient.js`, `src/Pages/ReportArchive.jsx`, CSS if needed

- [x] Client wrappers
- [x] Files tab + merge into Work Week with CoWork file label
- [x] View + Save to archive
- [ ] Commit

### Task 3: Docs

- [x] END_USER_GUIDE Past Reports note
- [ ] Commit
