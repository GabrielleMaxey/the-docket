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
| AI providers | Anthropic, OpenAI, Ollama, or Rovo via `llmClient.mjs` — explicit `CHAT_PROVIDER` in `.env` |
| CSS | Global design system in `workWeekTaskElements.css` + `dashboard.css`; `ww-` namespace prefix |

---

## Node version policy

- This repo is pinned to Node `22` via `.nvmrc`.
- **macOS / Linux:** before installing dependencies:

```bash
nvm install
nvm use
```

- **Windows:** install Node 22 from [nodejs.org](https://nodejs.org/), or use [nvm-windows](https://github.com/coreybutler/nvm-windows) / [fnm](https://github.com/Schniz/fnm) and select the version from `.nvmrc`.
- `npm install` runs a preinstall guard (`scripts/check-node-version.cjs`) and will fail fast if your Node major version does not match `.nvmrc`.
- `postinstall` runs `electron-builder install-app-deps` so native modules align with Electron.
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
│   │   ├── llmClient.mjs     # Shared Anthropic / OpenAI / Ollama client
│   │   ├── chatProviders.mjs # Chat prompts + routing (LLM or Rovo)
│   │   ├── rovoChat.mjs      # Opt-in Rovo MCP path + LLM fallback
│   │   ├── dashboardRefresh/ # Dashboard refresh pipeline (parse → metrics → persist)
│   │   ├── epicFilterJql.mjs # JQL builders (metrics scope, past due, presets)
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
│   ├── dashboardMetrics.mjs   # Pure metrics helpers (server + UI)
│   └── chatSessionPrompt.mjs  # Formats Chat session context for LLM prompts
├── tests/
│   ├── dashboardMetrics.test.mjs
│   ├── epicFilterJql.test.mjs
│   └── chatSessionPrompt.test.mjs
├── src/
│   ├── Pages/
│   │   ├── WorkWeekTasks.jsx       # Work Week page shell
│   │   ├── Dashboard/            # Dashboard feature (index.jsx, hooks, components)
│   │   │   ├── index.jsx
│   │   │   ├── hooks/            # useDashboardRefresh, useReportGeneration
│   │   │   ├── components/       # filters, due-date lists, epic cards, reports
│   │   │   └── utils/            # dashboardMetricsUtils (presets, splitDueByIssues)
│   │   ├── Dashboard.jsx         # Re-exports Dashboard/index
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
│   │   ├── CollapsibleSection.jsx  # Shared collapsible (Work Week + Dashboard)
│   │   ├── collapsible.css
│   │   ├── ReportOutput.jsx
│   │   └── StatusPieChart.jsx      # Pie / bar chart (no external library)
│   ├── services/
│   │   ├── jiraClient.js          # fetch → proxy wrappers (all API calls)
│   │   └── apiBase.js             # Runtime proxy URL resolution
│   └── utils/
│       ├── chatSessionContext.js  # Chat session artifacts + JQL/dashboard summaries
│       ├── jiraIssueDoneDates.js  # Work Week MRD display + parent-chain inheritance
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

**Multi-user / shared projects:** `issue_metadata` is **per machine** (whoever runs the local proxy). There is no server-side sync between users. For team-visible ranking on shared issues, the documented workflow is to push Jira comments prefixed with `PRIORITY P#` (P1–P10); other users read Jira and update their local priority manually. See [END_USER_GUIDE.md](./END_USER_GUIDE.md) § Shared projects — notes and priority. The app does **not** parse Jira comments back into SQLite today. A future option is Jira custom fields for shared priority instead of comment conventions.

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

**`dashboard_snapshots`** — cached metrics from the last Dashboard refresh (plus related `dashboard_epic_metrics` / `dashboard_assignee_metrics` rows)

Notable snapshot fields used by the UI and Chat context:

| Field / column | Notes |
|----------------|-------|
| `due_by_date` | Upcoming cutoff date (null = no upcoming due-date views) |
| `due_by_field` | `most_recent_done_date` or `initial_done_date` |
| `include_past_due` | Whether past-due epics/rows were included |
| `past_due_lookback_years` | `1`, `2`, or `3` — lookback floor for past-due list rows |
| `due_by_issues_json` | Flat list of due-date rows; each item has `isOverdue` for past vs upcoming split |

**`field_mappings`** — maps app date-field roles to Jira custom field IDs/names

**`app_settings`** — key-value store for `epic_past_due_mode`, `proxy_url`, `chat_custom_instructions`

**`watched_assignees`** — saved people/JQL watches for Dashboard Individual Contributor section

**`chat_sessions`** — Rovo OAuth tokens when `CHAT_PROVIDER=rovo`

Created automatically in `server/db/schema.mjs` on first API start. WAL mode enabled.

### Export / backup

For **single-user backup** or handoff — not live collaboration. Shared-project teams should use the `PRIORITY P#` Jira comment convention (see END_USER_GUIDE).

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

These are mapped in Settings → Jira field mapping and synced via `POST /api/jira/field-mappings/sync`. Fallback IDs live in `shared/odiFieldIds.mjs`.

---

## Dashboard refresh pipeline

`POST /api/dashboard/refresh` → `server/lib/dashboardRefresh/runDashboardRefresh.mjs`:

1. **`parseRefreshInput.mjs`** — validates preset IDs, `dueByDate`, `dueByField`, `includePastDue`, `pastDueLookbackYears` (1/2/3 only)
2. **`buildRefreshContext.mjs`** — resolves field IDs, `dueByCompareFieldId`, `pastDueFloor`, and `dueByOptions` (including `epicIssue` when computing per-epic child metrics)
3. **`buildEpicMetrics.mjs`** — Jira search per preset; `computeChildIssueMetrics` + `buildEpicLevelDueByIssues` for due-date lists
4. **`collectDueByIssues.mjs`** — merges epic-level due-by rows into snapshot flat list (capped at 200)
5. **`persistSnapshot.mjs`** — writes `dashboard_snapshots` and related metric rows

### Due-date resolution (`shared/dashboardMetrics.mjs`)

`getIssueDueByDate(issue, compareFieldId, fallbackFieldId, epicIssue)` resolves the effective date for due-by filtering:

1. **Task `duedate`** (mapped due-date field) when set — wins over epic automated-date fields on subtasks (avoids stale MRD on child issues)
2. **Parent epic’s compare field** (MRD or IDD) when the task has no due date and `epicIssue` is provided
3. **Compare field on the issue itself** when it is the epic row (or no parent epic context)

Upcoming vs past-due list membership:

- **Upcoming** — `dueDate >= today` and `<= dueByDate` cutoff (`isIssueUpcomingDueBy`)
- **Past due in list** — only when `includePastDueInList`; `dueDate < today` within `pastDueFloor` lookback (`isIssuePastDueInLookback`)

Epic-level inheritance for children without task due dates: `server/lib/dashboardRefresh/dueByHelpers.mjs` → `buildEpicLevelDueByIssues`.

### Work Week MRD column (`src/utils/jiraIssueDoneDates.js`)

After each **Run JQL**, `enrichRunWithParentDoneDates` (in `jiraJqlRunWorkflow.js`) attaches `mrdFieldId` and `parentMostRecentDoneDateByKey` to each run. Restored runs from `localStorage` are re-enriched when field mappings finish loading (`useTaskManagerJira.js`).

Display logic in `getMostRecentDoneDateForIssue`:

1. **Issue’s own MRD** (`most_recent_done_date` mapping) when set
2. **`parentMostRecentDoneDateByKey[parentKey]`** when the task has no MRD

`buildParentMostRecentDoneDateMap` fetches missing parents from Jira and walks up to **five** ancestor levels (Story → Epic, etc.) until an MRD is found. `JiraResultsTable` renders the column header as **MRD** with `title="Most Recent Done Date"`.

### Dashboard UI section toggles

Persisted in `localStorage` key `dashboard-visible-sections` via `normalizeVisibleSections()` in `dashboardMetricsUtils.js`:

| Key | Section |
|-----|---------|
| `overall` | Overall Status |
| `epicMetrics` | Project Metrics |
| `dueByUpcoming` | Upcoming Due Dates card |
| `dueByPastDue` | Past Due in lookback card |
| `overdue` | Individual Contributor Metrics |
| `report` | Generate Report |

Legacy `dueBy` key migrates to both `dueByUpcoming` and `dueByPastDue`.

---

## API routes reference

All routes mounted by `server/jiraProxy.mjs`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Jira connection check + base URL |
| GET | `/api/jira/myself` | Current user info |
| GET | `/api/jira/fields` | All Jira fields |
| GET/POST | `/api/jira/search` | JQL search (POST body or GET query) |
| POST | `/api/jira/issues/:issueKey/comment` | Add Jira comment |
| POST | `/api/jira/issues/:issueKey/status` | Transition status |
| POST | `/api/jira/issues/:issueKey/assignee` | Update assignee |
| POST | `/api/jira/issues` | Create issue |
| GET | `/api/jira/projects` | List projects |
| GET | `/api/jira/projects/:key/createmeta` | Create-issue field metadata |
| POST | `/api/jira/issue-metadata/bulk` | Bulk read notes + priority (SQLite) |
| PUT | `/api/jira/issue-metadata/:issueKey` | Update note + priority (SQLite) |
| GET/POST/PUT/DELETE | `/api/epic-presets` | Epic/JQL presets CRUD |
| POST | `/api/epic-filters/run` | Run preset JQL (Work Week) |
| GET | `/api/jira/filters` | Jira filters list |
| GET | `/api/jira/filters/favourite` | Favourite filters |
| GET | `/api/jira/filters/:id` | Single filter by ID |
| GET/PUT | `/api/jira/field-mappings` | Date field role mappings |
| POST | `/api/jira/field-mappings/sync` | Sync mappings from Jira |
| GET/PUT | `/api/settings` | App settings key-value |
| GET/POST/PUT/DELETE | `/api/watched-assignees` | Watched people/JQL for Dashboard |
| POST | `/api/dashboard/refresh` | Pull + store metrics snapshot |
| GET | `/api/dashboard/metrics` | Read stored snapshot |
| POST | `/api/report/generate` | Dashboard AI report (Executive/PO/Developer) |
| POST | `/api/report/project` | Work Week per-query AI report |
| POST | `/api/plan/week` | Work Week AI week planner |
| GET | `/api/chat/status` | Chat provider readiness + OAuth state |
| GET | `/api/chat/auth/start` | Start Atlassian OAuth (Rovo); `?format=json` returns URL |
| GET | `/api/chat/auth/callback` | OAuth callback (browser redirect target) |
| POST | `/api/chat/auth/signout` | Clear stored OAuth session |
| POST | `/api/chat` | Chat message → AI provider (see Chat session context below) |

---

## AI report system prompts

### `/api/report/project` (Work Week — My Metrics)
Written **from the assignee's perspective**, second person ("you have", "your open items"). Tone: supportive colleague, not manager status update. Covers: overall tracking %, key open items, overdue concerns, recommended next steps. Flowing prose, no bullet lists.

### `/api/report/generate` (Dashboard — Generate Report)
Three audience variants stored in `reportRoutes.mjs`:
- **Executive** — highlights, risks, action items for leadership
- **Product Owner** — feature delivery, backlog health, blockers, upcoming priorities
- **Developer** — team workload, overdue by person, WIP, upcoming tasks

### `/api/plan/week` (Work Week — Help me plan my week)
Day-by-day Monday–Friday plan using actual issue keys from the loaded JQL runs. Respects `focusStyle` (balance / overdue-first / single-project / meeting-heavy), `capacityHours`, `fixedCommitments`, and `additionalContext`. Flags overdue items with ⚠️.

---

## Chat session context

Each `POST /api/chat` request includes an `epicContext` object from the browser:

| Field | Source | Purpose |
|-------|--------|---------|
| `selectedEpics` | Chat epic filter panel | Preset labels, keys, and JQL for scoped searches |
| `includePastDue` | Chat epic filter panel | Whether past-due filter is active |
| `sessionContext` | `buildChatSessionContext()` in `src/utils/chatSessionContext.js` | Work Week queries, dashboard snapshot, generated artifacts |

`sessionContext` is built client-side on each send:

1. **JQL queries** — summarized from `localStorage` key `workWeekTasksJiraLastJqlRuns` (label, JQL, counts, top open issues).
2. **Dashboard snapshot** — refreshed via `GET /api/dashboard/metrics` on Chat load and again on each send. Summary includes separate `dueByPastDueCount` and `dueByUpcomingCount` when `dueByDate` is set.
3. **Artifacts** — last 8 generated reports/plans from `localStorage` key `taskManagerChatSessionArtifacts`.

Artifacts are saved when the user generates:

| Artifact `type` | Saved from |
|-----------------|------------|
| `work_week_project_report` | Work Week → My Metrics → Project Report |
| `week_plan` | Work Week → Help me plan my week |
| `dashboard_report` | Dashboard → Generate Report |

`server/lib/chatProviders.mjs` calls `formatChatSessionContext()` from `shared/chatSessionPrompt.mjs` to append this material to the system prompt. The model is instructed to use session context (especially artifacts) before running new Jira searches when the user asks about reports or queries they already ran.

`POST /api/chat` body shape:

```json
{
  "message": "What did my week plan say about Monday?",
  "epicContext": {
    "selectedEpics": [{ "label": "...", "epicKey": "...", "jql": "..." }],
    "includePastDue": false,
    "sessionContext": {
      "jqlQueries": [],
      "artifacts": [],
      "dashboardSnapshot": null
    }
  }
}
```

---

## State persistence

| Data | Mechanism | Key(s) |
|------|-----------|--------|
| JQL inputs, labels, count | `localStorage` | `workWeekTasksJiraPreferences` |
| Last JQL results snapshot | `localStorage` | `workWeekTasksJiraLastJqlRuns` |
| Jira notes + row priorities (UI cache) | `localStorage` | `workWeekTasksJiraNotes`, `workWeekTasksJiraRowPriorities` |
| Chat session artifacts (reports/plans) | `localStorage` | `taskManagerChatSessionArtifacts` |
| Header reminders | `localStorage` | `workWeekTasksReminders` |
| Collapsible open/closed | `localStorage` via `usePersistedState` | various `ww-*` / `dashboard-*` keys |
| Dashboard visible sections | `localStorage` | `dashboard-visible-sections` (`dueByUpcoming`, `dueByPastDue`, …) |
| Issue notes + P1–P10 (persisted) | SQLite via proxy | `issue_metadata` |
| Dashboard snapshot | SQLite via proxy | `dashboard_snapshots` (+ related metric tables) |
| Packaged desktop `.env` + SQLite | OS user data folder | `TASK_MANAGER_USER_DATA` (see Packaged desktop below) |
| Epic preset selections (Dashboard/Chat) | `localStorage` | `epicFilterSelectedIds` |
| Rovo OAuth tokens | SQLite via proxy | `chat_sessions` |

### Packaged desktop (Electron installer)

When `TASK_MANAGER_USER_DATA` is set by Electron main (packaged app only):

| Path | Contents |
|------|----------|
| `{userData}/.env` | Jira + LLM credentials (created from template on first launch) |
| `{userData}/data/workweek.sqlite` | Notes, dashboard snapshots, settings |

**macOS:** `~/Library/Application Support/Task Manager/`  
**Windows:** `%APPDATA%\Task Manager\`

Dev desktop (`npm run desktop:dev`) and browser dev use the repo `data/` folder and project-root `.env` instead.

Packaged builds load the UI from `http://127.0.0.1:{API_PORT}` (proxy serves `dist/`). `better-sqlite3` is unpacked from ASAR via `asarUnpack` in `package.json`.

---

## Collapsible component pattern

Work Week and Dashboard share `src/Components/CollapsibleSection.jsx` (CSS: `src/Components/collapsible.css`):

```jsx
<CollapsibleSection title="Project Metrics" storageKey="epicMetrics" badge="3 projects">
  {/* content */}
</CollapsibleSection>
```

Open state persists in `localStorage` via each panel's `storageKey`.

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
| `npm test` | Unit tests: `dashboardMetrics.mjs`, `epicFilterJql.mjs`, `chatSessionPrompt.mjs` |
| `npm run seed:presets` | Seed shared Epic/JQL presets into local SQLite — see [pilot-presets.md](./pilot-presets.md) |
| `npm run build` | Runs export guard (`prebuild`), then creates production Vite bundle → `dist/` |
| `npm run desktop:dist` | Full build + electron-builder → `release/` |
| `npm run desktop:dist:mac` | macOS `.dmg` |
| `npm run desktop:dist:win` | Windows NSIS installer |

---

## Checks after making changes

```bash
# 1. Unit tests (metrics, JQL builders, chat session prompt)
npm test

# 2. Type-check server routes (no native binary needed)
node --check server/routes/reportRoutes.mjs
node --check server/routes/dashboardRoutes.mjs

# 3. Build the UI
npm run build

# 4. Smoke test (with a real Jira test site):
#    - Run JQL on Work Week, confirm table loads
#    - Generate a project report
#    - Generate a week plan
#    - Dashboard refresh (Refresh status) + optional due-date views + Generate Report
#    - Chat: ask about a generated week plan or report (session context)
#    - Packaged desktop: edit userData `.env`, confirm Test Jira Connection
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
4. Wrap in `<CollapsibleSection>` on Work Week or Dashboard.
5. If the output should be available in Chat, call `saveChatSessionArtifact()` from `src/utils/chatSessionContext.js` after a successful generation (see existing report/plan panels).

---

More setup detail: [JIRA_SETUP.md](./JIRA_SETUP.md)
Non-technical usage: [END_USER_GUIDE.md](./END_USER_GUIDE.md)
App overview: [README.md](./README.md)
