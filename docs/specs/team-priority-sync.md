# Team priority sync (spec)

Shared priority store for ODI program work (NORA, Ask Greg, etc.). **Status: design updated — target engine MySQL; not implemented.**

**Related:** [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) (current local-only behavior), [ROADMAP-ODI-MIXED-TEAM.md](../ROADMAP-ODI-MIXED-TEAM.md), [pilot-presets.md](../pilot-presets.md), [NORA spreadsheet import](../superpowers/specs/2026-07-29-nora-spreadsheet-priority-import-design.md) (local bootstrap until this ships).

---

## Goals

- Share **issue key + priority + updated_at + updated_by** across the team for designated ODI programs.
- Keep **notes**, dashboard snapshots, reports, and JQL prefs **local** (unchanged).
- Allow **personal priority** in assignee-style Work Week views without writing to the shared DB.
- Prefer a **team-owned shared database** Task Manager can use; laptops never expose DB credentials to the browser.

---

## Deployment model (updated)

A shared DB may already be available for this use case. Prefer the simpler path when we control (or are granted) that database.

### Recommended: proxy → shared DB (direct)

```
Work Week / Dashboard UI
        ↓
jiraProxy.mjs  (TEAM_PRIORITY_DATABASE_URL + auth)
        ↓
Shared MySQL DB
```

- Connection string and credentials live only in the **API process** `.env` (desktop or hosted proxy).
- Schema migrations owned by Task Manager (or ops SQL scripts checked into repo). See **[team-priority-sync-mysql.sql](./team-priority-sync-mysql.sql)**.
- No separate microservice required for v1.

### Fallback: proxy → Team Priority API → DB

Keep only if security/ops requires an existing API layer in front of the DB (no direct DB grant to the proxy).

```
jiraProxy.mjs  →  TEAM_PRIORITY_API_URL  →  Shared DB
```

**Decision 10 (new):** Default implementation is **direct DB from `jiraProxy`**. Introduce a standalone Team Priority API only if DB access cannot be granted to the proxy host.

---

## Team database tables

**Engine: MySQL** (decision 12). DDL: [team-priority-sync-mysql.sql](./team-priority-sync-mysql.sql).

### `shared_program`

| Column | Notes |
|--------|-------|
| `id` | PK |
| `slug` | e.g. `nora`, `ask-greg` |
| `display_name` | e.g. `NORA`, `MCP - Ask Greg` |
| `enabled` | `true` / `false` |

### `shared_program_root`

Epic-root scope only (**decision 1**). No JQL membership cache.

| Column | Notes |
|--------|-------|
| `program_id` | FK → `shared_program` |
| `epic_key` | e.g. `ODI-23957`, `ODI-23066` |

Example seed roots (confirm with PMs before PROD):

| Program | Epic keys (from pilot presets) |
|---------|--------------------------------|
| NORA | `ODI-23957` |
| Ask Greg | `ODI-23066`, `ODI-18520` |

Add programs only via admin API or seed; not every `epic_presets` row is automatically shared.

### `shared_program_admin`

Who may create/update/delete programs and roots (**decision 8**: bootstrap via seed SQL).

| Column | Notes |
|--------|-------|
| `jira_account_id` | PK — Atlassian accountId |
| `display_name` | For admin UI |
| `added_at` | Timestamp |
| `added_by` | Who granted access |

### `team_issue_priority`

| Column | Notes |
|--------|-------|
| `issue_key` | PK — task/story key, e.g. `ODI-25800` |
| `priority` | **1–20** only (no row when unset). Aligns with Work Week / NORA import clamps. |
| `updated_at` | UTC timestamp |
| `updated_by` | Jira display name or accountId |

**Decision 2:** Setting priority to **0** → **DELETE** the row (unset = absent from table).

---

## App API contract (jiraProxy)

Whether storage is direct DB or a remote API, the **browser** always talks to the local proxy:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/team-priority/bulk` | Body `{ issueKeys: [] }` → `{ items: { "ODI-1": { priority, updatedAt, updatedBy } } }` |
| PUT | `/api/team-priority/:issueKey` | Body `{ priority }` — upsert **1–20** or delete when priority is 0 |
| GET | `/api/shared-programs` | List enabled programs (for slot picker) |
| POST | `/api/shared-programs` | Admin only — create program + roots |
| PUT | `/api/shared-programs/:id` | Admin only |
| GET | `/api/team-priority/health` | Optional health for offline banner |

**Write validation (every PUT):**

1. Caller authenticated (proxy session / service + Jira identity for audit).
2. Resolve issue → walk Jira parent chain to root epic(s).
3. Root epic must match an **enabled** `shared_program_root` row → else **403**.
4. Issue **Closed/Resolved** in Jira → **403** or read-only reject (**decision 6**).
5. `updated_by` set **server-side** from Jira `myself` (do not trust client spoofing).
6. Priority `0` → DELETE row; **1–20** → upsert.

Bulk read: chunk large key lists (e.g. 200 per request). Index: PK on `issue_key`.

---

## Task Manager integration

### Env (PROD / shared-DB hosts)

**Direct DB (recommended):**

```bash
TEAM_PRIORITY_DATABASE_URL=mysql://user:pass@host:3306/task_manager_team
TEAM_PRIORITY_CACHE_TTL_MINUTES=60
```

(Driver may also accept discrete `TEAM_PRIORITY_DB_HOST` / `USER` / `PASSWORD` / `DATABASE` if a URL is awkward with special characters.)
**Remote API fallback (only if needed):**

```bash
TEAM_PRIORITY_API_URL=https://...
TEAM_PRIORITY_API_KEY=...
TEAM_PRIORITY_CACHE_TTL_MINUTES=60
```

Unset both → team priority features stay off; local `issue_metadata` + CSV import continue as today (no comment-based priority).

### Slot priority mode

**Rule: mark shared programs explicitly (positive allowlist).** Default for every Work Week JQL slot is **local / personal** priority. **Team** priority applies only when a slot is explicitly linked to a shared program.

Do **not** infer team mode from JQL shape (e.g. “not assignee ⇒ team”) or from whether returned issues happen to fall under a shared epic root. **Slot linkage decides mode;** epic-root validation on writes is a safety net only.

#### Mode summary

| Mode | Slot configuration | Read | Write |
|------|-------------------|------|-------|
| **Local (default)** | No shared program linked | `issue_metadata.priority` | Local SQLite only — **never** shared DB |
| **Team** | Slot linked to a `shared_program` (NORA, Ask Greg, …) | Shared DB (+ local cache, TTL) | Shared DB (when issue passes epic-root check) |

**Local mode includes** assignee-style JQL, custom ODI slices, and any ad-hoc query **not** tied to a designated shared program.

**Team mode applies when:**

- Work Week slot has `sharedProgramId` (or slug) set to an enabled program
- Dashboard drill-down / navigation from shared preset context (team priority in that flow)

On **Run JQL** in local-mode slots: **skip** team bulk fetch entirely.

#### Overlap with shared programs (same issue, two slots)

Modes are **per slot**, not per issue:

- **Local slot:** read/write `issue_metadata.priority` only; never push to shared DB.
- **Team slot:** read/write shared DB; do not copy team values into `issue_metadata.priority` on write.

**Example:** `ODI-25789` under NORA. IC sets **P3** in slot 1 (My tasks, local). PM sets **P1** in slot 3 (NORA, team). IC still sees **P3** in slot 1 and **P1** in slot 3.

#### Persistence (planned)

Extend `workWeekTasksJiraPreferences` (localStorage) per JQL slot:

```json
{
  "jqlSlots": [
    { "label": "My tasks", "jql": "assignee = currentUser() ...", "sharedProgramId": null },
    { "label": "NORA", "jql": "...", "sharedProgramId": "nora" }
  ]
}
```

Optional: link `epic_presets` rows to `shared_program` in Settings so quick-pick auto-fills `sharedProgramId`.

#### UI

- Local slots: priority column labeled **Personal** (or neutral default).
- Team slots: **Team** label; show `updated_by` / updated time when available.
- JQL controls: optional “Shared program” selector per slot (default **None**).

### Jira comments (**decision 5**)

`PRIORITY P#` comment parsing has been **removed** entirely (not only for team-mode slots). Shared DB (Atlas demo / future MySQL) and CSV import are the team ranking paths. Notes may still be pulled from the latest Jira comment when that preference is on.

CSV import (Settings → Import team priorities) remains useful as **bootstrap / migration** into the shared store (or local-only until team mode is enabled).

### Closed issues (**decision 6**)

Team priority column **read-only** when Jira status is Closed/Resolved (match existing Work Week row lock).

---

## Failure modes (**decision 3**)

When shared DB / team API is **unavailable** on Run JQL:

1. Show **banner**: team priority unavailable; showing cached or local data.
2. **Read:** use last successful bulk response from local SQLite cache if within TTL; else personal/local only where applicable.
3. **Write:** team writes fail gracefully (toast); personal-mode writes still save locally.
4. Do not block entire Run JQL.

### Local cache table (planned in `workweek.sqlite`)

```sql
CREATE TABLE team_priority_cache (
  issue_key   TEXT PRIMARY KEY,
  priority    INTEGER NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT NOT NULL DEFAULT '',
  fetched_at  TEXT NOT NULL   -- for TTL expiry
);
```

Refresh `fetched_at` on each successful bulk fetch. Expire rows older than `TEAM_PRIORITY_CACHE_TTL_MINUTES`.

---

## Resolved decisions

| # | Topic | Decision |
|---|--------|----------|
| 1 | Scope validation | **Epic roots only** (`shared_program_root`) |
| 2 | Priority 0 | **Delete row** |
| 3 | Shared DB / API down | Local fallback + **banner**; **cache** last bulk response in SQLite with **TTL** |
| 4 | Display / write | **Positive allowlist:** shared DB only in slots **linked to a shared program** (or Dashboard shared context). All other slots stay local |
| 5 | `PRIORITY P#` | **Removed** — priority is not parsed from Jira comments |
| 6 | Closed issues | Team priority **read-only** |
| 7 | Environments | Shared DB URL/credentials **PROD / designated hosts only** (not committed) |
| 8 | First admins | **`shared_program_admin` seed SQL** |
| 9 | Slot mode detection | **`sharedProgramId` on the slot**; default `null` = local |
| 10 | Access path | **Prefer proxy → shared DB direct**; separate Team Priority API only if DB grant is impossible |
| 11 | Priority range | **1–20** (match Work Week UI and NORA CSV import clamp) |
| 12 | Database engine | **MySQL** (production target) |
| 13 | Demo store | **MongoDB Atlas** behind `TEAM_PRIORITY_MONGODB_URI` (see [Atlas demo design](../superpowers/specs/2026-07-29-atlas-team-priority-demo-design.md)) |

---

## Open questions (for the available DB)

Confirm with whoever owns the MySQL instance before implementation:

- [x] Engine: **MySQL**
- [ ] Can `jiraProxy` receive a connection string, or must traffic go through an existing API?
- [ ] New schema / tables allowed, or must we map onto existing tables?
- [ ] Network reachability from developer machines vs only a hosted proxy
- [ ] Who runs migrations and seeds (app on boot vs ops SQL)

---

## Open implementation tasks

- [ ] Confirm DB access model (decision 10) and connection env
- [ ] Schema migration + seed: programs, roots, admins
- [ ] Proxy data access layer (direct DB **or** HTTP client to team API)
- [ ] Proxy routes: bulk, put, shared-programs list, health
- [ ] `jiraClient.js` bulk + put wrappers
- [ ] Epic-root validation (Jira parent walk — reuse dashboard patterns)
- [ ] Work Week: per-slot `sharedProgramId` + “Shared program” UI; branch read/write on slot mode
- [ ] Skip team bulk fetch when all active slots are local mode
- [ ] `team_priority_cache` + TTL in `schema.mjs`
- [ ] UI: Team vs Personal labels; offline banner
- [x] Remove `priorityFromComment` / Jira priority badge (done)
- [ ] Optional: one-time CSV / NORA import into shared DB for bootstrap
- [ ] Update END_USER_GUIDE shared-priority section after ship

---

## Migration / pilot

1. Provision or reuse shared DB; apply schema + seed NORA + Ask Greg roots + admins.
2. Wire proxy with `TEAM_PRIORITY_DATABASE_URL` (or API fallback).
3. Task Manager **read-only** team bulk fetch + cache.
4. Enable team writes in shared-program slots only.
5. Optional: import current NORA CSV rankings into `team_issue_priority` once.
6. Pilot with ODI team; confirm personal assignee slots do not leak writes.
7. Comment-based priority parsing already removed — no feature flag needed.

No mandatory backfill — shared DB can start empty unless ops/CSV import seeds it.
