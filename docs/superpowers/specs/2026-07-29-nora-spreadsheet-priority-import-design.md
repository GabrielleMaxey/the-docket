# NORA Spreadsheet Priority Import — Design Spec

**Date:** 2026-07-29  
**Status:** Approved for planning  
**Scope:** Import team priorities (and selective notes) from the existing NORA Excel tracker CSV into local `issue_metadata`, as a bridge until remote team-priority DB sync exists.

---

## Goals

1. Let new (and existing) users load correct NORA **P1–P10** priorities without pushing/updating Jira `PRIORITY P#` comments.
2. Reuse the **existing Excel spreadsheet** as the interim source of truth.
3. Support **re-share / re-import** when rankings change.
4. Keep changes local to each machine’s SQLite (`issue_metadata`); no remote sync in this feature.

## Non-goals (v1)

- Native `.xlsx` upload (CSV first; `.xlsx` may follow later without changing merge rules).
- Auto-load on app start / watching a `data/` drop folder.
- Writing priorities back to Jira comments.
- Clearing local priorities for keys removed from the spreadsheet.
- Importing Developer or Jira Status (live from Jira).
- Replacing the planned team-priority DB (`docs/specs/team-priority-sync.md`).

---

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Source file | Existing NORA Excel tracker → **Save As CSV** (UTF-8) |
| Update cadence | Re-share file; users **re-import** when rankings change |
| Priority merge | **Overwrite** priority for matching issue keys; leave other local priorities alone |
| Notes merge | Import note **only when** local note is empty/whitespace; always overwrite priority for matches |
| Columns used | `ODI` (key), `Priority`, `notes`; ignore `Developer`, `Jira Status` |
| File format v1 | **CSV**; `.xlsx` deferred |
| UI placement | **Settings** (import / team data section) |
| Architecture | **Server import endpoint** + Settings UI |

---

## Expected CSV shape

Header row (case-insensitive; extra columns ignored):

```text
Priority,ODI,Developer,Jira Status,notes
```

| Column | Required | Behavior |
|--------|----------|----------|
| `ODI` | Yes | Issue key; normalize (trim, uppercase). Must look like `ODI-12345` (or project-key pattern already used in app). |
| `Priority` | Yes for apply | Accept `1`–`10`, `P1`–`P10`, or `PRIORITY P#`. Invalid/blank → **skip row** (do not clear existing priority). |
| `notes` | No | Applied only if local note is empty. |
| `Developer` | No | Ignored. |
| `Jira Status` | No | Ignored. |

Malformed rows (missing `ODI`, unparseable priority) are skipped and counted in the result summary.

---

## Merge rules (per row with valid key + priority)

1. Look up existing `issue_metadata` for `issue_key`.
2. **Priority:** set to parsed 1–10 (overwrite if row exists).
3. **Note:**
   - If local note is missing or whitespace-only **and** CSV `notes` is non-empty → set note from CSV.
   - Else keep existing local note.
4. Keys not present in the CSV are **not** modified or deleted.

---

## API

### `POST /api/issue-metadata/import`

- **Content-Type:** `multipart/form-data` with file field, **or** `text/csv` / JSON `{ csvText }` — prefer one clear option in implementation (recommend multipart file upload from Settings).
- **Body:** CSV file contents.
- **Response (200):**

```json
{
  "ok": true,
  "updatedPriorities": 42,
  "filledNotes": 8,
  "skipped": 3,
  "errors": [{ "row": 12, "reason": "Invalid priority" }]
}
```

- **Errors:** `400` if missing file / unreadable CSV / missing required header columns (`ODI`, `Priority`).

Implementation writes via existing SQLite upsert patterns in `issueMetadataRoutes` / `issue_metadata` table. Prefer a **transaction** for the bulk apply.

---

## UI (Settings)

New section, e.g. **Import team priorities**:

- Short copy: export NORA tracker as CSV; columns `Priority`, `ODI`, `notes`; re-import when rankings change.
- File picker (`.csv`).
- Import button → calls API → shows summary counts (and optional skipped reasons).
- No preview table required in v1 (summary is enough).

After import, Work Week should show updated priorities on next load / existing metadata refresh path (same as today’s SQLite-backed priorities).

---

## Client / server touchpoints (sketch)

| Area | Change |
|------|--------|
| `server/routes/issueMetadataRoutes.mjs` (or small helper) | Parse CSV, apply merge, respond with summary |
| `src/services/jiraClient.js` | `importIssueMetadataCsv(file)` |
| Settings UI | Import section |
| `docs/END_USER_GUIDE.md` | How to export Excel → CSV → Import |

No new npm dependencies for v1 (parse CSV with a minimal parser or existing tooling if any).

---

## Testing

1. CSV with known ODI keys → priorities update locally; unrelated keys unchanged.
2. Re-import with changed priorities → matching keys overwrite.
3. Local note already set → CSV notes ignored for that key; empty local note → filled.
4. Bad priority / missing ODI → skipped, counted.
5. Missing `ODI` or `Priority` header → 400.

---

## Success criteria

- New users can get NORA rankings from the shared spreadsheet without Jira comment updates.
- Existing users can refresh rankings by re-importing.
- Local-only priorities outside the file remain intact.
- Path is clearly temporary until team-priority DB sync ships.

---

## Relation to future work

When `docs/specs/team-priority-sync.md` is implemented, this import remains useful as a **bootstrap / migration** from Excel into the team store, or can be retired for day-to-day sync. v1 does not block or implement that API.
