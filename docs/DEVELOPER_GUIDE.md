# Task Manager — Developer Guide

Internal reference for code structure, data flow, scripts, and extension points.

---

## Stack

| Layer | Technology |
|-------|-----------|
| UI | React 18, Vite 8, React Router 6, Semantic UI React 2 |
| Desktop shell | Electron 31 + electron-builder |
| Proxy / API | Express 5 (`server/`) |
| Database | better-sqlite3 → `data/workweek.sqlite` |
| AI providers | Anthropic / OpenAI / Ollama (runtime-selectable via `CHAT_PROVIDER` in `.env`) |
| CSS | Global design system in `workWeekTaskElements.css` + `dashboard.css`; `ww-` namespace prefix |

---

## Node version policy

- This repo is pinned to Node `22` via `.nvmrc`.
- Before installing dependencies, run:

```bash
nvm install
nvm use
```

- `npm install` runs a preinstall guard (`scripts/check-node-version.cjs`) and will fail fast if your Node major version does not match `.nvmrc`.
- This prevents native module ABI mismatches (for example with `better-sqlite3`).

---

## Repo layout

```
taskManager/
├── electron/
│   └── main.cjs              # Spawns proxy, loads Vite dev URL or dist/
├── server/
│   ├── jiraProxy.mjs         # Entry point — mounts all route modules
│   ├── db/
│   │   └── schema.mjs        # SQLite schema + prepared statements
│   ├── lib/
│   │   ├── chatProviders.mjs # Anthropic / OpenAI / Ollama abstraction
│   │   ├── epicFilterJql.mjs # Builds JQL from epic preset selections
│   │   └── jiraSearch*.mjs   # Jira REST helpers
│   └── routes/
│       ├── appConfigRoutes.mjs    # Settings, field mappings, presets
│       ├── chatRoutes.mjs         # /api/chat/*
│       ├── dashboardRoutes.mjs    # /api/dashboard/*
│       ├── issueMetadataRoutes.mjs# Notes + priority (SQLite)
│       ├── jiraCoreRoutes.mjs     # Health, user, fields
│       ├── jiraIssueRoutes.mjs    # Status/assignee updates, create issue
│       └── reportRoutes.mjs       # /api/report/* + /api/plan/week
├── shared/
│   └── dashboardMetrics.mjs  # Pure functions shared by server + UI
├── src/
│   ├── Pages/
│   │   ├── WorkWeekTasks.jsx       # Work Week page shell
│   │   ├── Dashboard.jsx           # Dashboard page
│   │   ├── Chat.jsx                # Chat page
│   │   ├── Settings.jsx            # Settings page
│   │   ├── workWeekTaskElements.css
│   │   ├── dashboard.css
│   │   ├── components/
│   │   │   ├── JiraResultsTable.jsx
│   │   │   ├── TaskManagerHeaderPanel.jsx
│   │   │   ├── EpicFilterPanel.jsx
│   │   │   ├── CreateIssueModal.jsx
│   │   │   └── JiraFilterImportModal.jsx
│   │   └── hooks/
│   │       ├── useTaskManagerJira.js   # All Work Week Jira state + handlers
│   │       ├── useEpicFilters.js       # Preset selection state (shared)
│   │       ├── usePersistedState.js    # localStorage wrapper
│   │       ├── useFlash.js             # Transient success messages
│   │       ├── useJokeTicker.js
│   │       └── useCalendarData.js
│   ├── components/
│   │   └── StatusPieChart.jsx     # Pie / bar chart (no external library)
│   ├── services/
│   │   ├── jiraClient.js          # fetch → proxy wrappers (all API calls)
│   │   └── apiBase.js             # Runtime proxy URL resolution
│   └── utils/
│       └── format.js              # formatPercent, formatTimestamp
├── docs/                     # ← you are here
├── data/                     # workweek.sqlite (auto-created, git-ignored)
├── .env                      # Credentials — never commit
└── vite.config.js
```

---

## SQLite schema

**`issue_metadata`** — per-issue notes and personal priority

| Column | Type | Notes |
|--------|------|-------|
| `issue_key` | TEXT PK | e.g. `ODI-1234` |
| `note` | TEXT | Local draft note |
| `priority` | INTEGER | 0–10; 0 = unranked, 1 = highest |
| `updated_at` | TEXT | ISO 8601 |

**`epic_presets`** — saved JQL/epic presets

| Column | Notes |
|--------|-------|
| `id` | INTEGER PK |
| `preset_type` | `"epic"` or `"jql"` |
| `epic_key` | Jira epic key (epic type only) |
| `epic_name` | Display name |
| `jira_filter_id` | Optional Jira filter ID |
| `jql` | JQL string |
| `sort_order` | Display order |

**`dashboard_snapshot`** — cached metrics from the last Dashboard refresh

**`field_mappings`** — maps app date-field roles to Jira custom field IDs/names

**`app_settings`** — key-value store for `epic_past_due_mode`, `proxy_url`, `chat_custom_instructions`

**`watched_assignees`** — saved people/JQL watches for Dashboard Individual Contributor section

Created automatically in `server/db/schema.mjs` on first API start. WAL mode enabled.

### Export / backup

```bash
# Full backup
sqlite3 data/workweek.sqlite ".backup data/workweek-share.sqlite"

# CSV export (notes + priority)
sqlite3 -header -csv data/workweek.sqlite \
  "SELECT issue_key, note, priority, updated_at FROM issue_metadata ORDER BY updated_at DESC;" \
  > data/issue_metadata_export.csv
```

---

## Key Jira custom fields (ODI project)

| Field | Custom field ID |
|-------|----------------|
| Initial Done Date | `customfield_10008` |
| Most Recent Done Date | `customfield_10009` |

These are mapped in Settings → Jira field mapping and synced via `/api/fields/sync`.

---

## API routes reference

All routes mounted by `server/jiraProxy.mjs`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Jira connection check + base URL |
| GET | `/api/jira/myself` | Current user info |
| GET | `/api/jira/fields` | All Jira fields |
| POST | `/api/jira/search` | Raw JQL search |
| GET/POST | `/api/metadata/:key` | Issue note + priority (SQLite) |
| POST | `/api/jira/issue/:key/status` | Transition status |
| POST | `/api/jira/issue/:key/assignee` | Update assignee |
| POST | `/api/jira/issue` | Create issue |
| GET/POST | `/api/presets` | Epic/JQL presets CRUD |
| GET/POST | `/api/watched-assignees` | Watched people CRUD |
| GET/POST | `/api/field-mappings` | Date field role mappings |
| GET/POST | `/api/settings` | App settings key-value |
| POST | `/api/dashboard/refresh` | Pull + store metrics snapshot |
| GET | `/api/dashboard/metrics` | Read stored snapshot |
| POST | `/api/report/dashboard` | AI report (Executive/PO/Developer) |
| POST | `/api/report/project` | AI per-project report (Work Week) |
| POST | `/api/plan/week` | AI week planner |
| POST | `/api/chat/message` | Chat message → AI provider |
| GET | `/api/chat/status` | Chat provider readiness |

---

## AI report system prompts

### `/api/report/project` (Work Week — My Metrics)
Written **from the assignee's perspective**, second person ("you have", "your open items"). Tone: supportive colleague, not manager status update. Covers: overall tracking %, key open items, overdue concerns, recommended next steps. Flowing prose, no bullet lists.

### `/api/report/dashboard` (Dashboard — Generate Report)
Three audience variants stored in `reportRoutes.mjs`:
- **Executive** — highlights, risks, action items for leadership
- **Product Owner** — feature delivery, backlog health, blockers, upcoming priorities
- **Developer** — team workload, overdue by person, WIP, upcoming tasks

### `/api/plan/week` (Work Week — Help me plan my week)
Day-by-day Monday–Friday plan using actual issue keys from the loaded JQL runs. Respects `focusStyle` (balance / overdue-first / single-project / meeting-heavy), `capacityHours`, `fixedCommitments`, and `additionalContext`. Flags overdue items with ⚠️.

---

## State persistence

| Data | Mechanism | Key(s) |
|------|-----------|--------|
| JQL inputs, labels, count | `localStorage` via `usePersistedState` | `workWeekTasksJira*` |
| Last JQL results snapshot | `localStorage` | `workWeekTasksJqlRuns` |
| Header reminders | `localStorage` | `workWeekTasksReminders` |
| Collapsible open/closed | `localStorage` via `usePersistedState` | various `ww-*` / `dashboard-collapse-*` |
| Issue notes + P1–P10 | SQLite via proxy | `issue_metadata` |
| Dashboard snapshot | SQLite via proxy | `dashboard_snapshot` |
| Epic preset selections (Dashboard/Chat) | `localStorage` | `epicFilterSelectedIds` |

---

## Collapsible component pattern

Both Work Week and Dashboard use a shared collapsible pattern:

**Work Week** — `WWCollapsible` in `WorkWeekTasks.jsx`:
```jsx
<WWCollapsible title="📊 My Metrics" badge="12 open" storageKey="ww-my-metrics" defaultOpen>
  {/* content */}
</WWCollapsible>
```

**Dashboard** — `CollapsibleSection` in `Dashboard.jsx`:
```jsx
<CollapsibleSection title="Project Metrics" storageKey="epicMetrics" badge="3 projects">
  {/* content */}
</CollapsibleSection>
```

Both use the same `›` chevron that rotates on open/close, same border/radius/background design tokens, and persist open state in `localStorage`.

---

## CSS design tokens (ww- namespace)

Key values used throughout `workWeekTaskElements.css`:

| Token | Value | Used for |
|-------|-------|----------|
| Border color | `#e2e8f0` | Cards, inputs, collapsibles |
| Border radius | `8px` / `12px` | Inputs / cards |
| Surface background | `#f8fafc` | Collapsible headers, input backgrounds |
| Focus ring color | `#93c5fd` | All inputs on focus |
| Focus ring shadow | `0 0 0 3px rgba(147,197,253,0.25)` | All inputs on focus |
| Primary text | `#0f172a` | Body copy |
| Muted text | `#475569` / `#94a3b8` | Labels, hints, optional markers |
| Badge background | `#e2e8f0` | Collapsible count badges |
| Badge text | `#475569` | Collapsible count badges |

---

## Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev:all` | Starts Vite (`:5173`) + Express proxy (`:8787`) concurrently |
| `npm run desktop:dev` | Starts Vite + Electron (proxy started from Electron main process) |
| `npm run desktop:doctor` | Rebuilds `better-sqlite3` native module, then starts desktop dev |
| `npm run desktop:rebuild-native` | Rebuilds native modules for current Electron version |
| `npm run check:jira-client-exports` | Verifies every imported `jiraClient` symbol is exported (prevents runtime blank-screen import failures) |
| `npm run build` | Runs export guard (`prebuild`), then creates production Vite bundle → `dist/` |
| `npm run desktop:dist` | Full build + electron-builder → `release/` |
| `npm run desktop:dist:mac` | macOS `.dmg` |
| `npm run desktop:dist:win` | Windows NSIS installer |

---

## Checks after making changes

```bash
# 1. Type-check server routes (no native binary needed)
node --check server/routes/reportRoutes.mjs
node --check server/routes/dashboardRoutes.mjs

# 2. Build the UI
npm run build

# 3. Smoke test (with a real Jira test site):
#    - Run JQL on Work Week, confirm table loads
#    - Generate a project report
#    - Generate a week plan
#    - Dashboard refresh + Generate Report
#    - Create Issue modal
```

---

## GitHub Actions

`.github/workflows/desktop-packaging.yml` — triggered on `workflow_dispatch` or tags matching `v*`.
Produces artifacts: `desktop-macos` (`.dmg`) and `desktop-windows` (NSIS installer).

---

## Adding a new AI report type

1. Add a new route in `server/routes/reportRoutes.mjs` following the `app.post("/api/report/project", ...)` pattern — call `callLLMForReport({ systemPrompt, context })` and return `res.json({ report, label })`.
2. Add a client function in `src/services/jiraClient.js`.
3. Create a panel component (or extend an existing one) following the `ProjectReportPanel` pattern: `loading`, `report`, `error`, `copied` state; `Generate` → `Copy` → `Download` buttons.
4. Wrap in `<WWCollapsible>` on Work Week or `<CollapsibleSection>` on Dashboard.

---

More setup detail: [JIRA_SETUP.md](./JIRA_SETUP.md)
Non-technical usage: [END_USER_GUIDE.md](./END_USER_GUIDE.md)
App overview: [README.md](./README.md)
