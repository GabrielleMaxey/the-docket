# CoWork Weekly Plan Files in Past Reports — Design Spec

**Date:** 2026-07-27  
**Status:** Approved for planning (pending user review of this file)  
**Branch:** `gmaxey_cowork`  
**Scope:** Surface Claude CoWork `weekly-plan-*.md` files from the app `data/` directory in Past Reports (Files tab + Work Week list), with live disk reads and optional Save to archive.

---

## Goals

1. List and open `weekly-plan-<date>.md` files that CoWork writes under the Task Manager `data/` directory.
2. Show them in Past Reports under a **Files** tab **and** in the **Work Week** tab (tagged as CoWork file).
3. Read content **live from disk** by default.
4. Optional **Save to archive** copies content into SQLite `generated_reports` like other Past Reports.

## Non-goals (v1)

- Deleting, renaming, or editing CoWork files from the UI.
- Auto-watching the filesystem / live refresh without user action.
- Importing arbitrary `.md` files (only `weekly-plan-*.md`).
- Changing how CoWork writes the files.
- Merging/deduping file plans with in-app `week_plan` generate rows beyond clear labeling.

---

## Current behavior (baseline)

| Concern | Today |
|---------|--------|
| Past Reports | SQLite `generated_reports` only (`ReportArchive.jsx`) |
| Week plans from app | `POST /api/plan/week` → `week_plan` rows |
| `data/` | `workweek.sqlite`, optional `note-images/`; **no** `.md` listing |
| CoWork files | Written externally to `data/weekly-plan-*.md`; invisible in UI |

`data/` resolves to repo `data/` in dev, or `{TASK_MANAGER_USER_DATA}/data` when packaged (`server/jiraProxy.mjs`).

---

## Placement

### Files tab (new)

Fourth Past Reports tab (after Work Week / Dashboard / Ad-hoc):

- Lists matching files sorted by mtime descending.
- Columns: When (mtime), Type (`CoWork weekly plan`), Title (filename or derived label), actions (View / Save to archive).
- Empty: “No `weekly-plan-*.md` files in the data folder yet.”

### Work Week tab (existing)

- Existing SQLite `work_week` / `week_plan` (and project report) rows unchanged.
- Additionally include file-based plans in the same table, with:
  - Type: **CoWork file**
  - Stable client/list id distinct from numeric SQLite ids (e.g. `file:weekly-plan-2026-07-27.md`)
  - Same View / Save to archive actions

---

## File matching & safety

| Rule | Value |
|------|--------|
| Pattern | `weekly-plan-*.md` (case-insensitive) |
| Directory | App `data/` root only (same dir as `workweek.sqlite`) |
| Path safety | Resolve realpath; reject `..`, absolute escapes, symlinks outside `data/` |
| Filename for GET | Basename only; must match pattern |

---

## API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/reports/cowork-files` | List `{ filename, label, modifiedAt, sizeBytes }[]` |
| `GET` | `/api/reports/cowork-files/:filename` | `{ filename, label, modifiedAt, content }` markdown |
| `POST` | `/api/reports/archive` | Existing — Save to archive |

**List item shape (Files + Work Week merge):**

```js
{
  id: "file:weekly-plan-2026-07-27.md", // or numeric id for SQLite rows
  kind: "cowork_file",                  // vs archived row
  source: "work_week",
  reportType: "cowork_weekly_plan",
  label: "weekly-plan-2026-07-27.md",   // or friendlier date label
  createdAt: "<mtime ISO>",
  filename: "weekly-plan-2026-07-27.md",
}
```

**Save to archive** body (reuse adhoc/work_week insert helper):

- `source`: `work_week`
- `reportType`: `week_plan` (so it stays in Work Week after archive) **or** `cowork_weekly_plan` if we want a distinct type label — prefer **`week_plan`** with `meta: { fromCoworkFile: true, filename }` so existing Work Week filters keep working and type shows as Week plan with a badge/meta note.

Decision: archive as `report_type: week_plan`, `meta.fromCoworkFile: true`, `meta.filename`.

---

## UI behavior

1. On Files tab open (and Refresh if present): fetch cowork file list.
2. On Work Week tab open: fetch archive list **and** cowork file list; merge for display (files first or by date).
3. Select file id → fetch content → `ReportOutput` (copy / download `.md`).
4. **Save to archive** → POST archive → toast/success; optionally refresh Work Week list so the SQLite copy appears.
5. Selecting an archived row uses existing `GET /api/reports/archive/:id`.

No file delete in v1.

---

## Implementation sketch

| File | Change |
|------|--------|
| `server/lib/coworkWeeklyPlans.mjs` | List + read helpers with sanitization |
| `server/routes/reportRoutes.mjs` | Register GET list + GET content |
| `src/services/jiraClient.js` | Client wrappers |
| `src/Pages/ReportArchive.jsx` | Files tab; merge into Work Week; Save to archive |
| `docs/END_USER_GUIDE.md` | Short Past Reports note about CoWork files |

---

## Testing (manual)

1. Place `data/weekly-plan-2026-07-27.md` with sample markdown.
2. Past Reports → **Files** → see file → View content.
3. **Work Week** tab → same file appears as CoWork file.
4. Save to archive → appears as Week plan; survives deleting/renaming the file.
5. Reject `../../etc/passwd` style filename (400).
6. Empty `data/` → empty-state message.

---

## Success criteria

- Users can open CoWork weekly plan markdown from Past Reports without leaving the app.
- Live disk is source of truth until Save to archive.
- Files appear in both **Files** and **Work Week** tabs with clear labeling.
