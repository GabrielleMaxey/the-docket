# Multi Jira instance toggle (design)

**Date:** 2026-09-30  
**Status:** Approved for planning (pending user review of this file)  
**Branch:** `gmaxey_jira_instances`  
**Scope:** Toggle among up to 5 Jira Cloud instances with Settings CRUD, header switcher, and per-instance local SQLite data  
**Related:** `server/jiraProxy.mjs` (`JIRA_BASE_URL` / email / token, `workweek.sqlite`), Settings, app nav/header

---

## Goal

Let users work against **multiple Atlassian/Jira sites** (different base URLs) by **switching the active instance** — up to **5** — without merging backlogs. Each instance keeps **isolated local data**. Less technical users configure and switch in the UI; ops can still bootstrap via `.env`.

## Decisions

| Topic | Choice |
|--------|--------|
| Approach | Instance registry + **per-instance SQLite files** |
| Max instances | 5 |
| Configure | Settings — add / edit / remove / set active |
| Quick switch | Header dropdown |
| Credentials storage | Proxy host (registry DB); tokens never returned to browser in full |
| Env bootstrap | Hybrid — seed from env; manage in Settings afterward |
| Legacy single-site | Supported forever: if registry empty, use `JIRA_BASE_URL` + `JIRA_EMAIL` + `JIRA_API_TOKEN` |
| Local data | One SQLite file per instance id (same schema as today’s `workweek.sqlite`) |
| Active site | Exactly one; all Jira proxy calls use its credentials |
| Switch UX | Rebind DB + clear client caches / soft reload so site A data does not linger |

## Non-goals (v1)

- Federated / merged multi-site project lists or JQL across clouds  
- Side-by-side dual-site UI in one view  
- Encrypting tokens beyond OS file permissions (nice-to-have later)  
- Auto-discovering every site in an Atlassian org  
- Changing Managed/Local AI semantics per instance (AI remains host-level unless a later spec says otherwise)

## Instance model

Each instance:

| Field | Notes |
|--------|--------|
| `id` | Stable id (e.g. uuid or slug) |
| `displayName` | Shown in header / Settings |
| `baseUrl` | No trailing slash (same rules as `JIRA_BASE_URL`) |
| `email` | Atlassian account email |
| `apiToken` | Stored server-side only |
| `enabled` | Optional soft-disable without delete |
| `createdAt` / `updatedAt` | Audit |

Hard cap: **5** enabled or total configured rows (v1: max **5 rows** total).

## Legacy & env seed

1. **Registry empty + legacy `JIRA_*` set** → runtime uses legacy vars (behavior unchanged). Optionally also materialize them as Instance 1 on first Settings open / first seed pass.  
2. **Optional multi-seed:** `JIRA_INSTANCE_2_BASE_URL` / `_EMAIL` / `_API_TOKEN` / `_NAME` … through `_5_*` (and `_1_*` aliases if useful).  
3. Once the registry has rows, **active instance credentials win** for Jira calls; legacy vars remain fallback only when registry is empty (decision **C**).  
4. Document both paths in `.env.example` and `JIRA_SETUP.md`.

## Data isolation

| Store | Purpose |
|--------|----------|
| Meta / registry DB | Instance list + `active_instance_id` (e.g. `{dataDir}/instances-meta.sqlite` or equivalent) |
| Per-instance app DB | `{dataDir}/workweek-<instanceId>.sqlite` — presets, notes, priorities, snapshots, chat sessions, etc. |

On first use of an instance id, create the file and run the existing schema migrations.

**On switch:**

1. Persist new `active_instance_id`.  
2. Close current app DB connection; open the target instance file.  
3. Point Jira client at that instance’s credentials.  
4. Return success to the client; client clears in-memory caches and reloads key views (or full soft reload).  
5. Health/status returns active `jiraBaseUrl` + display name.

Rovo/chat OAuth tokens that live in the app DB follow the instance file automatically. Host-level LLM keys stay host-level.

## UI

### Settings → Jira instances

- Table/list: display name, base URL, active badge.  
- Add (disabled at 5), Edit, Remove (confirm; warn if removing active — auto-switch to another or legacy if last).  
- “Use this instance” / Set active.  
- Token fields: write-only (`blank` = keep existing on edit).  
- Optional **Test connection** (Jira myself / simple ping with those credentials).

### Header

- Dropdown of display names; active marked.  
- If only legacy mode: show site host or “Jira” with link to Settings to add more instances.  
- Switching triggers the server set-active flow above.

## API (sketch)

| Method | Path | Role |
|--------|------|------|
| GET | `/api/jira/instances` | List (no tokens); include `activeInstanceId`, `legacyMode` |
| POST | `/api/jira/instances` | Create (enforce max 5) |
| PUT/PATCH | `/api/jira/instances/:id` | Update (optional token) |
| DELETE | `/api/jira/instances/:id` | Remove (+ policy for active/last) |
| POST | `/api/jira/instances/:id/activate` | Set active + rebind DB |
| POST | `/api/jira/instances/:id/test` | Connection check |
| GET | `/api/health` (extend) | Active `jiraBaseUrl` + instance label |

All mutating routes stay on the proxy host; never echo `apiToken` in responses.

## Error handling

| Situation | Behavior |
|-----------|----------|
| Invalid URL / missing fields | 400 with clear message |
| At max 5 | Block create with message |
| Activate missing/disabled instance | 404 / 400 |
| Test connection fails | Return error body; do not change active |
| Switch mid-request | Serialize activate; in-flight Jira calls may fail once — client retries after reload |
| Corrupt / missing instance DB file | Recreate schema; user loses that instance’s local data only |

## Testing (manual)

- [ ] Fresh install with only legacy `JIRA_*` — app works unchanged  
- [ ] Seed / add second instance — header lists both; switch changes health URL  
- [ ] Presets/notes on site A do not appear after switch to site B  
- [ ] Switch back to A restores A’s local data  
- [ ] Cannot add a 6th instance  
- [ ] Edit instance keeps token when left blank  
- [ ] Remove active instance handled safely  
- [ ] Test connection succeeds/fails appropriately  
- [ ] No token in network responses or logs  

## Feasibility

**Feasible with medium–high effort.** Main work is (1) credential resolution indirection in `jiraProxy`, (2) DB path rebinding, (3) Settings + header UI, (4) env seed/docs. Schema of the app DB stays the same; isolation is by file, which avoids a wide multi-tenant migration.
