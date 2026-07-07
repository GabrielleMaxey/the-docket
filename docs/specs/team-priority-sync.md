# Team priority sync (spec)

Planned shared priority store for ODI program work (NORA, Ask Greg, etc.). **Status: design approved, not implemented.**

**Related:** [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) (current local-only behavior), [ROADMAP-ODI-MIXED-TEAM.md](../ROADMAP-ODI-MIXED-TEAM.md), [pilot-presets.md](../pilot-presets.md).

---

## Goals

- Share **issue key + priority + updated_at + updated_by** across the team for designated ODI programs.
- Keep **notes**, dashboard snapshots, reports, and JQL prefs **local** (unchanged).
- Allow **personal priority** in assignee-style Work Week views without writing to the team DB.
- Team-owned **Postgres or MySQL** behind a **team API** (Task Manager proxy calls the API; laptops never connect to the DB directly).

---

## Architecture

```
Work Week / Dashboard UI
        ↓
jiraProxy.mjs  (TEAM_PRIORITY_API_URL + auth)
        ↓
Team Priority API  (your team owns)
        ↓
Postgres or MySQL  (PROD only)
```

---

## Team database tables

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
| `priority` | 1–10 only (no row when unset) |
| `updated_at` | UTC timestamp |
| `updated_by` | Jira display name or accountId |

**Decision 2:** Setting priority to **0** → **DELETE** the row (unset = absent from table).

---

## Team API contract

Auth: service key or internal token in proxy `.env` (**decision 7**: PROD URL/credentials only).

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/team-priority/bulk` | Body `{ issueKeys: [] }` → `{ items: { "ODI-1": { priority, updatedAt, updatedBy } } }` |
| PUT | `/team-priority/:issueKey` | Body `{ priority, updatedBy }` — upsert 1–10 or delete when priority is 0 |
| POST | `/shared-programs` | Admin only — create program + roots |
| PUT | `/shared-programs/:id` | Admin only |
| GET | `/team-priority/health` | Optional health for proxy banner |

**Write validation (every PUT):**

1. Caller authenticated (proxy service + optional user identity for audit).
2. Resolve issue → walk Jira parent chain to root epic(s).
3. Root epic must match an **enabled** `shared_program_root` row → else **403**.
4. Issue **Closed/Resolved** in Jira → **403** or read-only reject (**decision 6**).
5. `updated_by` set **server-side** from Jira `myself` (do not trust client spoofing).
6. Priority `0` → DELETE row; 1–10 → upsert.

Bulk read: chunk large key lists (e.g. 200 per request). Index: PK on `issue_key`.

---

## Task Manager integration

### Proxy routes (planned)

Thin pass-through to team API:

- `POST /api/team-priority/bulk`
- `PUT /api/team-priority/:issueKey`

`.env` (PROD only):

```bash
TEAM_PRIORITY_API_URL=https://...
TEAM_PRIORITY_API_KEY=...
TEAM_PRIORITY_CACHE_TTL_MINUTES=60   # local cache TTL
```

### Slot priority mode

**Rule: mark shared programs explicitly (positive allowlist).** Default for every Work Week JQL slot is **local / personal** priority. **Team** priority applies only when a slot is explicitly linked to a shared program.

Do **not** infer team mode from JQL shape (e.g. “not assignee ⇒ team”) or from whether returned issues happen to fall under a shared epic root. **Slot linkage decides mode;** epic-root validation on the team API is a write-time safety net only.

#### Mode summary

| Mode | Slot configuration | Read | Write |
|------|-------------------|------|-------|
| **Local (default)** | No shared program linked | `issue_metadata.priority` | Local SQLite only — **never** team API |
| **Team** | Slot linked to a `shared_program` (NORA, Ask Greg, …) | Team API (+ local cache, TTL) | Team API (when issue passes epic-root check) |

**Local mode includes all of the following** — no special casing beyond “slot not linked to a shared program”:

- Assignee-style JQL (`assignee = currentUser()`, “Dev Team”, etc.)
- Custom JQL for other ODI work the IC owns (project slices, labels, parents, one-off filters)
- Any ad-hoc query that is **not** tied to a designated shared program

**Team mode applies when:**

- Work Week slot has `sharedProgramId` (or slug) set to an enabled program, typically via quick-pick from a preset flagged as shared, or a “Shared program” dropdown in JQL controls
- Dashboard drill-down / navigation from shared preset context (always team for priority in that flow)

On **Run JQL** in local-mode slots: **skip** team bulk fetch entirely (no API call, no cache update for that run).

#### Overlap with shared programs (same issue, two slots)

An issue may appear in both a **local** slot and a **team** slot (e.g. NORA ticket in “my assigned tasks” and in the NORA program slot). Modes are **per slot**, not per issue:

- **Local slot:** read/write `issue_metadata.priority` only; never push to team DB; do not display team DB values in that slot.
- **Team slot:** read/write team DB; do not copy team values into `issue_metadata.priority` on write.

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

`sharedProgramId: null` → local mode (default for new slots). Values match `shared_program.slug` from the team DB / synced config.

Optional: link `epic_presets` rows to `shared_program` in Settings so quick-pick auto-fills `sharedProgramId` when user selects NORA or Ask Greg.

#### Proxy / client contract

Team PUT and bulk requests include **`teamContext: true`** only from team-mode slots. Proxy rejects or ignores team writes without that flag. Never infer team context from epic scope on the client alone.

#### UI

- Local slots: priority column labeled **Personal** (or neutral default).
- Team slots: **Team** label; show `updated_by` / updated time from team DB when available.
- JQL controls: optional “Shared program” selector per slot (default **None**).

### Two priority modes (**decision 4**)

See **Slot priority mode** above. Short form:

| Mode | When | Read | Write |
|------|------|------|-------|
| **Team** | Slot linked to shared program (or Dashboard shared context) | Team API | Team API |
| **Local** | All other Work Week slots (assignee, custom ODI JQL, etc.) | `issue_metadata.priority` | Local SQLite only |

Notes remain local in all modes.

### Display source (**decision 4**)

- **Team slot / Dashboard shared context:** team DB is the display source for priority.
- **Local slot:** `issue_metadata.priority` only — do not merge or display team DB values in that slot.

### `PRIORITY P#` Jira comments (**decision 5**)

Once team DB is live, **disable** `parsePriorityFromComment` / Jira badge flow for team-scoped work. Team DB replaces the comment convention.

### Closed issues (**decision 6**)

Team priority column **read-only** when Jira status is Closed/Resolved (match existing Work Week row lock).

---

## Failure modes (**decision 3**)

When team API is **unavailable** on Run JQL:

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
| 3 | Team API down | Local fallback + **banner**; **cache** last bulk response in SQLite with **TTL** |
| 4 | Display / write | **Positive allowlist:** team DB only in slots **linked to a shared program** (or Dashboard shared context). **All other slots default local** — assignee JQL, custom ODI project JQL, etc. Same issue can differ by slot; local writes never push to team DB |
| 9 | Slot mode detection | **Mark shared programs on the slot** (`sharedProgramId`), not “mark assignee only”. Default `null` = local |
| 5 | `PRIORITY P#` | **Ignored** once team DB is live |
| 6 | Closed issues | Team priority **read-only** |
| 7 | Environments | **PROD only** for team DB URL/credentials |
| 8 | First admins | **`shared_program_admin` seed SQL** |

---

## Open implementation tasks

- [ ] Team API + PROD schema migration
- [ ] Seed SQL: programs, roots, admins
- [ ] Proxy pass-through routes + env vars
- [ ] `jiraClient.js` bulk + put wrappers
- [ ] Epic-root validation service (Jira parent walk — reuse dashboard patterns)
- [ ] Work Week: per-slot `sharedProgramId` in preferences + “Shared program” UI; branch read/write on slot mode
- [ ] Skip team bulk fetch when all active slots are local mode
- [ ] `team_priority_cache` + TTL in `schema.mjs`
- [ ] UI: Team vs Personal labels; offline banner
- [ ] Remove/disable `priorityFromComment` when feature flag on
- [ ] Update END_USER_GUIDE shared-priority section after ship

---

## Migration / pilot

1. Deploy team API + seed NORA + Ask Greg roots + admins.
2. Task Manager **read-only** team bulk fetch + cache.
3. Enable team writes in shared context only.
4. Pilot with ODI team; confirm personal assignee slots do not leak writes.
5. Turn off `PRIORITY P#` parsing (feature flag).

No backfill requirement documented — team DB starts fresh unless ops runs a one-time import.
