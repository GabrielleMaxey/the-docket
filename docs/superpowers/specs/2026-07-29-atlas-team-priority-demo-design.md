# Atlas team-priority demo (design)

**Date:** 2026-07-29  
**Status:** Approved for implementation  
**Scope:** Demo spike — MongoDB Atlas + Work Week team-mode slots  
**Long-term:** MySQL per [team-priority-sync.md](../../specs/team-priority-sync.md)

---

## Goal

Demonstrate shared **P1–P20** priorities across machines using MongoDB Atlas. Unset `TEAM_PRIORITY_MONGODB_URI` → app behavior unchanged (local SQLite + CSV import).

## Architecture

```
Work Week (team-mode slot)
        ↓
jiraProxy.mjs
        ↓
official mongodb Node driver
        ↓
MongoDB Atlas (demo cluster / DB)
```

Browser never receives the connection string. Credentials only in API-process `.env`.

## Collections

### `shared_programs`

```json
{
  "slug": "nora",
  "displayName": "NORA",
  "enabled": true,
  "epicRoots": ["ODI-23957"]
}
```

### `team_issue_priorities`

```json
{
  "_id": "ODI-25800",
  "priority": 3,
  "updatedAt": "2026-07-29T00:00:00.000Z",
  "updatedBy": "display name or accountId"
}
```

- Priority **1–20** only; priority **0** → delete document.
- Index: `_id` (issue key) is enough for demo bulk reads by `$in`.

## Proxy routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/team-priority/health` | `{ ok, configured, connected }` — never echo URI |
| POST | `/api/team-priority/seed` | Upsert NORA + Ask Greg program docs |
| POST | `/api/team-priority/import-csv` | Body `{ csvText }` — NORA CSV → Atlas priorities |
| POST | `/api/team-priority/sync-local` | Copy local SQLite `issue_metadata` priorities (1–20) → Atlas |
| GET | `/api/shared-programs` | Enabled programs for slot picker |
| POST | `/api/team-priority/bulk` | Body `{ issueKeys: [] }` → `{ items: { KEY: { priority, updatedAt, updatedBy } } }` |
| PUT | `/api/team-priority/:issueKey` | Body `{ priority }` — upsert 1–20 or delete on 0 |

**Write rules (demo):**

- Clamp priority to 0–20; `0` deletes.
- Set `updatedBy` server-side from Jira `myself` when available; else `"demo"`.
- **Epic-root 403 not enforced in this demo** (documented looseness). Full MySQL plan keeps that check.

When URI unset: routes return **503** `{ error: "Team priority demo not configured" }` (or health `configured: false`).

## Work Week

- Extend JQL slot prefs with `sharedProgramId` (`null` = local / personal).
- **Team slot** (`sharedProgramId` set + Atlas configured):
  - On Run JQL: bulk-fetch Atlas priorities for result keys; display those values.
  - On priority change: PUT Atlas; do **not** write team values into `issue_metadata`.
  - Column / badge: **Team**.
- **Local slot:** existing `issue_metadata` only; never call Atlas bulk/PUT.

## Settings

**Import team priorities** — CSV with target Local or Atlas (demo).

**Team priority (Atlas demo)** section:

- Health status (connected / not configured / error message without secrets)
- **Seed programs** button
- **Seed from local priorities** (one-time sync)
- Short note: link a Work Week JQL slot to a shared program, then Run JQL

## Dependency

- `mongodb` (official native driver) — required for this demo only.

## Env

```bash
TEAM_PRIORITY_MONGODB_URI=mongodb+srv://...@.../task_manager_demo?appName=Cluster0
```

Optional: DB name in URI path. Do not commit real URI.

## Out of scope (this demo)

- MySQL / `mysql2`
- Local `team_priority_cache` + offline banner
- Strict epic-root write validation
- Admin CRUD UI for programs
- Replacing CSV import (still useful for local bootstrap)

## Success criteria

1. Seed creates NORA / Ask Greg in Atlas.
2. Two machines with the same URI: team-mode slot shows the same priorities after Run JQL.
3. Local slots remain independent.
4. No URI / password in logs, client bundles, or git.
