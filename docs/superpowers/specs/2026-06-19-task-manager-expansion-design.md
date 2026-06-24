# Task Manager Expansion — Design Spec

**Date:** 2026-06-19
**Last reviewed:** 2026-06-23
**Status:** Substantially complete — see Implementation Status below
**Scope:** Epic filter presets, dashboard, issue creation, Rovo chat, mix deployment

---

## Implementation Status

| Feature | Spec phase | Status |
|---------|-----------|--------|
| Epic presets in SQLite + CRUD (Settings) | Phase 1 | ✅ Complete |
| JQL presets in SQLite | Phase 1 | ✅ Complete |
| `useEpicFilters` hook (shared across pages) | Phase 1 | ✅ Complete |
| Nav: Work Week / Dashboard / Chat / Settings | Phase 1 | ✅ Complete |
| Jira field mapping UI (no `.env` editing) | Phase 1 | ✅ Complete |
| Settings page — all sections | Phase 1 | ✅ Complete |
| Epic filter dropdown on Work Week | Phase 2 | ✅ Complete |
| Past Due Projects filter | Phase 2 | ✅ Complete |
| Import from Jira favourite filters | Phase 2 | ✅ Complete (`JiraFilterImportModal`) |
| Dynamic search fields from field mappings | Phase 2 | ✅ Complete |
| Dashboard route + stored metrics (SQLite) | Phase 3 | ✅ Complete |
| Per-epic cards (issue %, epic %, overdue %) | Phase 3 | ✅ Complete |
| Individual Contributor Metrics | Phase 3 | ✅ Complete |
| Due by Date section (hierarchical list) | Phase 3 | ✅ Complete |
| Generate Report (Executive / PO / Developer) | Phase 3 | ✅ Complete |
| Past Due summary section | Phase 3 | ✅ Complete |
| Create Issue modal (Story / Task / Bug) | Phase 4 | ✅ Complete |
| Chat page + LLM fallback (Anthropic/OpenAI/Ollama) | Phase 5 (partial) | ✅ Complete |
| **Rovo MCP OAuth** | Phase 5 | ⏸ **Parked** — `ROVO_OAUTH_ENABLED = false`; routes/handlers preserved but disabled; Rovo not available for this Jira instance |
| `chat_sessions` SQLite table | Phase 5 | ⏸ Parked with Rovo |
| JQL slot cap fixed to 5  | Phase 5 | ✅ Complete |
| **Post-spec additions** | — | — |
| Work Week per-project AI report (assignee-perspective) | Added during dev | ✅ Complete |
| Help me plan my week (AI week planner) | Added during dev | ✅ Complete |
| Chart style toggle (pie / vertical bar) | Added during dev | ✅ Complete |
| Collapsible sections (Work Week + Dashboard) | Added during dev | ✅ Complete |
| Custom chat instructions (Settings) | Added during dev | ✅ Complete |

### Remaining before distribution

- [ ] Fix JQL slot cap from 4 → 5 (aligns spec and persistence logic)
- [ ] Confirm Rovo MCP availability; flip `ROVO_OAUTH_ENABLED` when ready
- [ ] Seed `epic_presets` with real ODI epic keys and filter IDs
- [ ] Validate past-due rules against team expectations

---

## Summary

Expand the existing Jira workbench (React + Vite + Express proxy + SQLite) into a project management surface with:

- User-managed **epic presets** stored in SQLite
- **Dashboard** route with dual completion metrics **persisted in SQLite** (refresh repulls Jira)
- **Create Issue** for Story, Task, and Bug (not Epic)
- **Chat** via Atlassian Rovo MCP (primary — parked), with LLM fallback via `.env`
- **Mix deployment** (Electron desktop or Web UI) with a fixed API routing story

---

## Current State (baseline at spec creation)

| Area | At spec creation |
|------|-------|
| Main page | `WorkWeekTasks.jsx` — JQL slots, results table, header panel |
| Jira proxy | Read/search, comment, status, assignee; no create, no filters API |
| Search fields | `summary`, `issuetype`, `status`, `assignee`, `updated` only |
| Persistence | `localStorage` for JQL prefs; SQLite `issue_metadata` for notes/priority |
| Routes | `/`, `/work-week` only (real feature); `/home` stub |
| Desktop | Electron spawns proxy; packaged build loads `file://dist` (API routing gap) |
| JQL slots | UI allows 4; `loadStoredPreferences()` caps stored count at 5 |

---

## Requirements (locked)

### Epic presets

- Each preset displays as `ODI-1234 "EPIC NAME"` (epic key + quoted name).
- Stored in **SQLite**, editable and deletable by end users (Settings UI).
- Initial list seeded by team; users maintain thereafter.
- Each preset may reference a **Jira saved filter ID** and/or stored JQL (user creates filters in Jira).
- **Dropdown** on Work Week and Dashboard: select one epic or **Select All**.
- Running selected presets produces tabbed results (reuse `JiraResultsTable` pattern).

### User custom filters

- Up to **5** user-defined JQL slots (fix 3/4 inconsistency). *(still 4 — see remaining items above)*
- **Import from Jira**: browse favourite saved filters (`GET /rest/api/3/filter/favourite`), pick one to fill a slot.
- Epic presets and user JQL slots are independent.

### Due dates / Automation Done Date

Date field mapping is **user-configurable in Settings** — end users must **not** edit `.env` to change which Jira fields drive due-date logic.

**Reference export:** `ODI-23263_Export_19-06-2026.xlsx` (epic `ODI-23263`) shows the Automation Done Date pattern:

| Jira field (display name) | Example on ODI-23263 | Typical level |
|---------------------------|----------------------|---------------|
| **Initial Done Date** | `30/Jul/25` | Epic |
| **Most Recent Done Date** | `29/Dec/25` | Epic |
| **Due date** (standard) | empty on epic | Story/Task when set |
| **Project End Date** | `30/Dec/26` | Epic (optional target) |

Automation populates **Initial Done Date** and **Most Recent Done Date** at the epic level. Stories/Tasks usually have these blank; use standard **Due date** on child issues where applicable.

**Settings → Jira field mapping** (stored in SQLite, editable by any user):

- Dropdown populated from `GET /rest/api/3/field` (searchable by name).
- Mappings to configure:
  - **Initial Done Date** → Jira custom field
  - **Most Recent Done Date** → Jira custom field
  - **Due date field** → defaults to standard `duedate`; user can remap if needed
  - **Project End Date** (optional) → for target/end-date display
- **Refresh from Jira** button re-fetches field list.
- `.env` may hold **one-time defaults** for first-run seeding only; Settings overrides always win.

**Past Due** — built-in virtual filter option (not a separate epic preset):

- Appears in the epic/filter dropdown alongside epic presets: **Past Due Projects**.
- Selectable alone or combined with epic presets.
- **Past due (task):** open child issue where standard **Due date** is before today (always uses Due date mapping).
- **Past due (epic):** user chooses **which date drives epic past-due** in Settings (see below).
- Dashboard and Work Week both respect this selection.

**Epic past-due mode** (Settings → **Past due rules**, stored in SQLite `app_settings`):

| Mode | Label in UI | Epic is past due when (open epic) |
|------|-------------|-----------------------------------|
| `most_recent_done_date` | **Most Recent Done Date** | Most Recent Done Date is set **and** before today |
| `project_end_date` | **Project End Date** | Project End Date is set **and** before today |
| `either` | **Either** | **Either** of the above is true |

Default: **`either`** so both strategies are available without forcing one interpretation.

Epic cards and the Past Due filter show **which rule matched** (e.g. badge: "Past due (MRDD)" vs "Past due (Project End)") when mode is `either`.

### Dashboard

- **Separate route** (`/dashboard`).
- When epics selected (or **Past Due**), show summary cards per epic plus overall rollup when Select All.
- **Metrics persisted in SQLite** — Dashboard loads the **last stored snapshot** on open; **Refresh** repulls from Jira, recomputes, and **replaces** stored metrics.
- Stale banner when snapshot is older than last refresh request or when user changes epic/person selection without refreshing (prompt to **Submit**).

**Completion & overdue metrics:**

| Metric | Definition |
|--------|------------|
| **Issue %** | `closedLikeIssues / totalIssues` per epic (child issues from preset JQL) |
| **Epic %** | Epic is complete when **Most Recent Done Date** is set on the epic issue (fallback: **Initial Done Date** if Most Recent is empty) |
| **Overdue %** | `overdueOpenIssues / totalOpenIssues * 100` per epic — open issues past their applicable due field |
| **Overdue % by person** | For a user-supplied assignee display name: `personOverdueOpen / personTotalOpen * 100` within selected epic scope |
| **Past Due rollup** | When **Past Due Projects** selected: list epics/tasks matching past-due rules with overdue % per epic |

**Overdue by individual** — optional dashboard view:

- User enters or selects one or more **Jira assignee display names**.
- For each named person, show **overdue %** = open assigned issues past due ÷ total open assigned issues (scoped to currently selected epics / Past Due filter).
- Supports **multiple people** at once.
- **Save watchlist** in Settings so frequently monitored names persist (SQLite).
- Unassigned issues excluded from per-person stats.

Also show: **Initial Done Date**, **Most Recent Done Date**, **Due date** / **Project End Date** on epic cards where present; counts by status; open vs closed; assignee breakdown where useful.

### Create issue

- Types: **Story**, **Task**, **Bug** only — **Epic excluded**.
- Defaults: project **ODI**, parent/epic link from **currently selected epic** in dropdown.
- User can override project and epic/parent on the form.
- After create: refresh active results tab optional.

### Chat

- **Primary:** Atlassian **Rovo MCP** (`https://mcp.atlassian.com/v1/mcp`). *(parked — not available for this Jira instance)*
- Per-user **OAuth 2.1** (browser sign-in); no M365 admin required. *(parked)*
- Context: issues/stats from **currently selected epic(s)** injected into prompts.
- **Fallback** (developer `.env` on proxy host): `CHAT_PROVIDER=openai|anthropic|ollama|disabled`. *(implemented and active)*
- Non-developer users: zero model setup; one-time Atlassian sign-in for Rovo. *(pending Rovo)*
- **Future:** M365 Copilot embed when IT enables Entra app registration.

### Deployment

- User chooses **Electron** or **Web UI only**.
- Web: Vite dev proxy or configurable proxy URL in Settings.
- Electron: proxy spawned locally; packaged build must reach API reliably (Phase 1 fix — resolved).

---

## Architecture

### Approach

**B — New routes + shared services** (approved and implemented):

- Keep `WorkWeekTasks` as triage table.
- Added `/dashboard`, `/chat`, `/settings`.
- Extended `jiraProxy.mjs` (now modular route files), `jiraClient.js`, SQLite.
- Epic presets in SQLite (not `localStorage`).

### Route map

| Route | Component | Purpose |
|-------|-----------|---------|
| `/`, `/work-week` | `WorkWeekTasks.jsx` | JQL slots, results, AI reports, week planner, create modal |
| `/dashboard` | `Dashboard.jsx` | Summary cards, dual % metrics, reports |
| `/chat` | `Chat.jsx` | LLM conversation UI (Rovo parked) |
| `/settings` | `Settings.jsx` | Epic preset CRUD, field mapping, past-due rules, watched people |

### Shared state

`useEpicFilters` hook: selected epic IDs, Select All, load presets from API. Shared across Work Week, Dashboard, and Chat.

---

## Data Model

### SQLite tables (all implemented)

**`issue_metadata`** — per-issue notes and P1–P10 priority (original table, unchanged)

**`epic_presets`** — user-managed epic and JQL presets

**`jira_field_mappings`** (implemented as `field_mappings`) — user-editable Jira date field configuration

**`app_settings`** — key-value: `epic_past_due_mode`, `proxy_url`, `chat_custom_instructions`

**`watched_assignees`** — saved display names for Dashboard individual contributor tracking. Includes `watch_type` (`person` or `jql`) and `jql` column for JQL-based watches.

**`dashboard_snapshots`** + **`dashboard_epic_metrics`** + **`dashboard_assignee_metrics`** — Dashboard metrics storage (v1: single current snapshot, replaced on each Refresh/Submit)

**`chat_sessions`** — ⏸ Not created; parked with Rovo OAuth

### Key custom fields (ODI project)

| Role | Custom field ID |
|------|----------------|
| Initial Done Date | `customfield_10008` |
| Most Recent Done Date | `customfield_10009` |

Pre-mapped as fallbacks in `server/lib/jiraSearchFields.mjs`; overridden by Settings → Jira field mapping.

---

## API Surface

All routes implemented and modular in `server/routes/`:

| Route file | Covers |
|-----------|--------|
| `appConfigRoutes.mjs` | Settings, field mappings, presets, watched assignees |
| `chatRoutes.mjs` | `/api/chat/*` (LLM fallback active; OAuth parked) |
| `dashboardRoutes.mjs` | `/api/dashboard/refresh`, `/api/dashboard/metrics` |
| `issueMetadataRoutes.mjs` | Notes + priority (SQLite) |
| `jiraCoreRoutes.mjs` | Health, user, fields, filter favourites |
| `jiraIssueRoutes.mjs` | Status/assignee updates, create issue |
| `reportRoutes.mjs` | `/api/report/dashboard`, `/api/report/project`, `/api/plan/week` |

Full route reference: see `docs/DEVELOPER_GUIDE.md`.

---

## Completion Logic (implemented)

### Issue %
`closedLikeIssues / totalIssues` — uses `isClosedLikeStatus()` from `shared/dashboardMetrics.mjs` matching `/^(closed|resolved|done)$/i` plus status category `done`.

### Epic %
Epic complete when Most Recent Done Date is set (fallback: Initial Done Date). `rollupEpicPercent = epicsComplete / selectedEpicCount * 100`.

### Overdue %
Open child issues past their applicable due field. Epic past-due flag driven by `app_settings.epic_past_due_mode` (`most_recent_done_date` | `project_end_date` | `either`). Badge shows which rule matched when mode is `either`.

### Overdue % by person
Case-insensitive match on `displayName` or `emailAddress`. `personOverduePercent = personOverdueOpen / personTotalOpen * 100`. Zero open → "No open issues assigned" (not 0%).

---

## Chat Architecture (current)

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  Chat UI    │────▶│  Express proxy   │────▶│  Anthropic/OpenAI/   │
│  /chat      │     │  chatRoutes.mjs  │     │  Ollama (via .env)   │
└─────────────┘     └────────┬─────────┘     └──────────────────────┘
                             │
                    epic context from
                    useEpicFilters selection
                    + JQL search tool
```

Rovo MCP path (`mcp.atlassian.com`) is wired but disabled via `ROVO_OAUTH_ENABLED = false` in `Chat.jsx`. All OAuth routes and handlers are preserved and can be re-enabled.

---

## Deployment Matrix

| Mode | UI load | API | Status |
|------|---------|-----|--------|
| Web dev | `localhost:5173` | Vite proxy → 8787 | ✅ Working |
| Electron dev | `localhost:5173` | Electron spawns proxy | ✅ Working |
| Electron packaged | `http://localhost:8787` (proxy serves UI + API) | Same process | ✅ Phase 1 fix applied |
| Web only (prod) | Static host or proxy serves `dist` | User sets proxy URL in Settings | ✅ Working |

---

## Open Items

1. **JQL slot cap** — fix from 4 → 5 slots to match spec and persistence cap.
2. **Rovo MCP** — confirm org availability; flip `ROVO_OAUTH_ENABLED` and test OAuth sign-in when available.
3. **Epic preset seeding** — populate `epic_presets` with real ODI epic keys and filter IDs.
4. **Past-due validation** — confirm team expectations around MRDD vs Project End Date interpretation before distribution.

---

## Out of Scope (v1)

- M365 Copilot embed (requires IT admin)
- Epic creation via Create Issue modal
- Migrating user JQL prefs from `localStorage` to SQLite
- Automated tests
- Confluence integration in chat
- Multiple saved dashboard snapshots (history)

---

## Approval Record

| Decision | Approved |
|----------|----------|
| Epic presets in SQLite + Settings CRUD | Yes |
| Dashboard as separate route | Yes |
| Rovo MCP primary chat + `.env` fallback | Yes |
| Create Story, Task, **Bug** (not Epic) | Yes |
| Defaults ODI + selected epic, overridable | Yes |
| Dual % metrics (issue + done dates) | Yes |
| Overdue % + Past Due Projects filter | Yes |
| Date field mapping in Settings (not `.env`) | Yes |
| Epic past-due mode: MRDD, Project End Date, or Either | Yes |
| Overdue % by individual (display name) | Yes |
| Dashboard metrics stored in SQLite, updated on Refresh | Yes |
| Mix Electron + Web deployment | Yes |
