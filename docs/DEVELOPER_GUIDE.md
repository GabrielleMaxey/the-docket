# The Docket — Developer Guide

Internal reference for code structure, data flow, scripts, and extension points.

---

## For Cursor users

The markdown files in `docs/` are canonical for GitHub, local desktop development, and non-Cursor editors.

The [`Cursor canvas mirror`](./canvases/task-manager-docs.canvas.tsx) is historical reference and does not describe the current Combined Work, PostgreSQL, or source-scoped storage model. Use this guide and the [user guide](./END_USER_GUIDE.md) as the current references; see [canvas status](./canvases/README.md).

**PR write-ups:** Cursor agents follow [`.cursor/rules/pr-writeups.mdc`](../.cursor/rules/pr-writeups.mdc). Human process and template → [§ PR write-ups](#pr-write-ups) below.

---

## Stack

| Layer | Technology |
|-------|-----------|
| UI | React 18, Vite 8, React Router 7, Semantic UI React 2 |
| Desktop shell | Electron 43 (local development) |
| Proxy / API | Express 5 (`server/`) |
| Database | better-sqlite3 local stores per scope; optional PostgreSQL via `pg` for shared metadata |
| AI providers | Anthropic, OpenAI, Ollama, or Rovo via `llmClient.mjs` — explicit `CHAT_PROVIDER` in `.env` |
| CSS | Global design system in `workWeekTaskElements.css` + `dashboard.css`; `ww-` namespace prefix |

---

## Page naming

Some code and persisted keys use older feature names. Prefer the current nav labels in user-facing docs.

| Nav label | Route | Code / legacy name |
|-----------|-------|--------------------|
| Task Management | `/work-week` | Work Week |
| Metrics | `/dashboard` | Dashboard |
| Project Managers | `/project-managers` | Capacity planning |
| Past Reports | `/reports` | ReportArchive |
| Chat | `/chat` | Chat |
| Settings | `/settings` | Settings |

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
- `postinstall` runs `npm rebuild better-sqlite3` for Node. Browser API startup and tests also rebuild for Node; desktop startup rebuilds for Electron through `desktop:rebuild-native`.
- Stop the running workflow before switching runtimes. For recovery, use `npm rebuild better-sqlite3` before browser mode, or `npm run desktop:doctor` to rebuild and launch desktop mode.

---

## Repo layout

```
taskManager/
├── electron/
│   └── main.cjs              # Spawns proxy, loads Vite dev URL or dist/
├── server/
│   ├── jiraProxy.mjs         # Entry point — mounts all route modules
│   ├── db/
│   │   ├── schema.mjs        # Site SQLite schema + reused goals/report schemas
│   │   ├── todoDatabase.mjs  # App-wide personal To Dos + migration ledger
│   │   └── team/             # Explicit PostgreSQL migrations
│   ├── lib/
│   │   ├── savedSiteOperations.mjs # Captured saved-entry revision checks and source DB handles
│   │   ├── jiraRouteContext.mjs # Request-local Jira helpers
│   │   ├── combinedWorkStore.mjs # Dedicated Combined Work goals/archive store
│   │   ├── teamPriorityPostgres.mjs # Optional Team metadata, preference, pool and data access
│   │   ├── logger.mjs        # Structured logger (createLogger); respects LOG_LEVEL
│   │   ├── llmClient.mjs     # Shared Anthropic / OpenAI / Ollama client
│   │   ├── chatProviders.mjs # Chat prompts + routing (LLM or Rovo)
│   │   ├── rovoChat.mjs      # Opt-in Rovo MCP path + LLM fallback
│   │   ├── dashboardRefresh/ # Dashboard refresh pipeline (parse → metrics → persist)
│   │   ├── epicFilterJql.mjs # JQL builders (metrics scope, past due, presets)
│   │   ├── jiraSearchHelpers.mjs # Paginated Jira search + user search
│   │   ├── jiraParentCandidates.mjs # JQL → parent chain walk for Create Issue
│   │   ├── jiraCreateIssueFields.mjs # createmeta-driven Jira create payload
│   │   ├── jiraCommentText.mjs   # ADF → plain text; bulk latest comments
│   │   ├── reportArchive.mjs     # generated_reports CRUD + source filters
│   │   ├── weeklyDigest.mjs  # Snapshot → markdown weekly digest
│   │   └── jiraSearch*.mjs   # Jira REST helpers
│   └── routes/
│       ├── appConfigRoutes.mjs    # Settings, field mappings, presets
│       ├── capacityPlanningRoutes.mjs # Project Managers capacity endpoint
│       ├── chatRoutes.mjs         # /api/chat/*
│       ├── dashboardRoutes.mjs    # /api/dashboard/*
│       ├── issueMetadataRoutes.mjs# Notes + priority + start date (SQLite); Due date/MRD push to Jira
│       ├── jiraCoreRoutes.mjs     # Health, user, fields
│       ├── jiraIssueRoutes.mjs    # Status/assignee updates, create issue
│       └── reportRoutes.mjs       # /api/report/* + /api/plan/week
├── shared/
│   ├── dashboardMetrics.mjs   # Pure metrics helpers (server + UI); issue type family matching
│   ├── odiIssueStandards.mjs  # create validation (Job Story, bug structure, parent rules)
│   ├── odiCreateIssueFields.mjs # Components / Vertical / BUG Tracking defaults
│   ├── createIssuePresetUtils.mjs # Preset dropdown values, JQL epic key extraction
│   ├── createIssueParentUtils.mjs # Manual key validation + query-issue parent resolution
│   ├── jiraParentCandidates.mjs   # Parent chain walk + dropdown builders (shared UI/server)
│   ├── jiraDescriptionAdf.mjs     # Markdown description → Jira ADF (via markdownToAdf)
│   ├── markdownToAdf.mjs          # Note-comment markdown (bold/italic/code/links/lists/headings) → Jira ADF
│   ├── issuePriority.mjs          # MAX_ISSUE_PRIORITY + clampIssuePriority (P0–P20)
│   └── chatSessionPrompt.mjs  # Formats Chat session context for LLM prompts
├── tests/
│   ├── dashboardMetrics.test.mjs
│   ├── epicFilterJql.test.mjs
│   ├── odiIssueStandards.test.mjs
│   ├── jiraCreateIssueFields.test.mjs
│   ├── jiraParentCandidates.test.mjs
│   ├── createIssuePresetUtils.test.mjs
│   ├── chatSessionPrompt.test.mjs
│   ├── markdownToAdf.test.mjs
│   └── issuePriority.test.mjs
├── src/
│   ├── context/
│   │   ├── EpicFiltersContext.jsx  # Active-site preset + selection state
│   │   └── TodosContext.jsx        # Personal To Dos outside the site-remounted subtree
│   ├── Pages/
│   │   ├── WorkWeekTasks.jsx       # Task Management page shell
│   │   ├── CombinedOpenWork.jsx    # Mixed Managed tasks / List views + My Metrics
│   │   ├── combinedWorkModel.js    # Source-aware rows and deduplicated metrics
│   │   ├── combinedWorkReports.js  # Combined report summaries and history
│   │   ├── Dashboard/              # Dashboard feature (index.jsx, hooks, components)
│   │   │   ├── index.jsx
│   │   │   ├── hooks/              # useDashboardRefresh, useReportGeneration
│   │   │   ├── components/         # DashboardTabs, filters, due-date lists, epic cards, IndividualContributorsPanel, ContributorStatusBar, WeeklyDigestPanel
│   │   │   └── utils/              # dashboardMetricsUtils (presets, splitDueByIssues)
│   │   ├── Dashboard.jsx           # Re-exports Dashboard/index
│   │   ├── Settings/               # Settings feature folder
│   │   │   ├── index.jsx           # Orchestrator: loads data, mounts sections
│   │   │   └── components/
│   │   │       ├── SettingsSection.jsx       # Shared collapsible accordion wrapper
│   │   │       ├── settingsSection.css       # Styles for SettingsSection (gradient header, hover depth)
│   │   │       ├── PresetsSection.jsx        # Epic & JQL presets CRUD
│   │   │       ├── DateFieldsSection.jsx     # Field mappings + past-due rules
│   │   │       ├── MetricTargetsSection.jsx  # Contributor Metrics (people + custom queries)
│   │   │       ├── WorkWeekHeaderSection.jsx # Joke ticker + due-date banner toggles
│   │   │       └── ChatAssistantSection.jsx  # Chat instructions + provider status
│   │   ├── Settings.jsx            # Re-exports Settings/index
│   │   ├── Chat.jsx                # Chat page (+ Save to Past Reports)
│   │   ├── ProjectManagers.jsx     # Capacity planning from Contributor Metrics entries
│   │   ├── ReportArchive.jsx       # Past Reports page (Task Management / Dashboard / Ad-hoc tabs)
│   │   ├── workWeekTaskElements.css
│   │   ├── priorityScale.css               # Priority colour data encoding (P1–P20, do not retint)
│   │   ├── dashboard.css
│   │   ├── components/
│   │   │   ├── JiraResultsTable.jsx
│   │   │   ├── cells/AssigneeCell.jsx       # Debounced Jira user search + assignee update
│   │   │   ├── TaskManagerHeaderPanel.jsx
│   │   │   ├── EpicFilterPanel.jsx
│   │   │   ├── CreateIssueModal.jsx
│   │   │   ├── JiraFilterImportModal.jsx
│   │   │   ├── WeeklyPlanPanel.jsx          # Help me plan my week (extracted)
│   │   │   ├── MyMetricsSection.jsx         # My Metrics collapsible (extracted)
│   │   │   ├── ProjectReportPanel.jsx       # Per-run AI project report (extracted)
│   │   │   └── JqlRunMetrics.jsx            # Chips + progress bar (extracted)
│   │   └── hooks/
│   │       ├── useTaskManagerJira.js        # All Task Management Jira state + handlers
│   │       ├── jiraJqlRunWorkflow.js        # Run JQL, load remaining, priority-from-comment sync
│   │       ├── useEpicFilters.js            # Thin re-export shim (kept for any legacy uses)
│   │       ├── usePersistedState.js         # localStorage wrapper
│   │       ├── useFlash.js                  # Transient success messages
│   │       ├── useJokeTicker.js
│   │       ├── useUpcomingDueBanner.js
│   │       ├── useWorkWeekHeaderPreferences.js
│   │       └── useCalendarData.js
│   ├── Components/
│   │   ├── BackgroundJobIndicator.jsx  # Nav pill for in-flight background jobs
│   │   ├── CollapsibleSection.jsx      # Shared collapsible (Task Management + Metrics)
│   │   ├── collapsible.css
│   │   ├── ReportOutput.jsx
│   │   └── StatusPieChart.jsx          # Pie / bar chart (no external library)
│   ├── AppRouter.jsx                   # Router + EpicFiltersProvider + nav layout
│   ├── AppRouter.css                   # Nav styles (colocated with AppRouter.jsx)
│   ├── services/
│   │   ├── jiraClient.js          # fetch → proxy wrappers (all API calls)
│   │   └── apiBase.js             # Runtime proxy URL resolution
│   ├── hooks/
│   │   └── useBackgroundJobs.js   # Subscribe / attach to backgroundJobStore
│   └── utils/
│       ├── siteContextStore.js    # Site/Combined browser namespaces and recovery notice
│       ├── backgroundJobStore.js  # Module-level jobs that survive route changes
│       ├── chatSessionContext.js  # Chat session artifacts + JQL/dashboard summaries
│       ├── pageReportPersistence.js # On-page report/plan localStorage + clear helpers
│       ├── jiraIssueDoneDates.js  # Work Week MRD display + parent-chain inheritance
│       ├── jqlRunPersistence.js   # Persist JQL runs when workflow completes off-page
│       ├── workWeekNavigation.js  # buildWorkWeekHref({ key, assignee, epicPresetId }) for drill-down
│       ├── statusScale.js         # Status colour data encoding (do not retint) - shared by charts, MetricBar
│       └── format.js              # formatPercent, formatTimestamp
├── docs/                     # ← you are here
│   ├── END_USER_GUIDE.md     # Day-to-day usage (incl. browser-as-app)
│   ├── DEVELOPER_GUIDE.md    # Architecture / API / schema
│   ├── JIRA_SETUP.md         # Credentials and Jira config
│   ├── unsigned-installs.md  # Unsupported installers + local launch guidance
│   ├── PR_WriteUps/          # Per-PR summaries for review
│   ├── specs/                # Feature specs (e.g. team priority sync)
│   ├── superpowers/          # Agent design specs + implementation plans
│   ├── canvases/             # Cursor docs-canvas mirror
│   └── examples/             # Sample reports / prompts
├── data/                     # Separate local stores and note-image folders (git-ignored)
├── .env                      # Credentials — never commit
└── vite.config.js
```

---

## Local stores and request context

By default, data lives in the launched checkout's `data/` directory. `TASK_MANAGER_USER_DATA` changes the root to `<value>/data`. Do not treat every SQLite file as interchangeable.

| Store | Owner and contents |
|-------|--------------------|
| `instances-meta.sqlite` | Saved Jira registry, active entry, registry metadata, app-wide `jira_instance_meta.use_team_db` preference |
| `workweek-<instanceId>.sqlite` | Saved entry's local notes/planning, presets/settings, metrics, ordinary reports, and other site data |
| `workweek.sqlite` | Legacy single-site store when no registry entry is active |
| `personal-todos.sqlite` | App-wide `todos` and `todo_migration_ledger`, independent of Jira and Team |
| `docket-combined.sqlite` | Combined Work `app_settings`, `generated_reports`, and archive index only |
| `note-images-<instanceId>/` / `note-images/` | Saved-entry / legacy local note images |

Ordinary requests capture the active context with `X-Docket-Site` and `X-Docket-Generation`. `siteContextStore.js` and `jiraClient.js` keep site changes from publishing stale results into the next site. `EpicFiltersProvider` remounts on generation changes; `TodosProvider` remains outside that subtree.

Combined editors use `{kind:"saved-site", instanceId, siteHost, baseUrl, displayName, revision}` with `X-Docket-Saved-Site` and `X-Docket-Saved-Revision`. `savedSiteOperations.mjs` validates revisions, restricts routes, leases the registry entries, and opens source-specific DB handles. `jiraRouteContext.mjs` binds Jira helpers to that source without activating it. UI row identity includes saved-entry ID and issue key; Jira writes use the real issue key. Team rows and aggregate workload counts use canonical hostname + issue key. Thus duplicate saved entries can have independent Local notes while sharing Team metadata and counting once in metrics.

Combined report requests use `{kind:"combined-work"}` and only `X-Docket-Report-Scope: combined-work`. Supported settings writes are the existing personal/company goals keys; project reports and archive reads/deletes use the dedicated Combined store. Mixed active/saved/Combined headers and unsupported routes are rejected. Report generation validates captured source revisions. Ordinary goals and archives are not copied into Combined Work.

Combined Open Work starts in **Managed tasks**, reusing `JiraResultsTable` and each captured source model. **List** is the compact read-only presentation. My Metrics reuses Status Report, 1:1 Prep, PWB Review, current results, and assigned history. Source metadata/date hydration gates editing; failed required reads retain counts and coverage warnings. Team reads are skipped when confirmed off or unconfigured; unknown Combined ownership remains gated. History searches are bounded to 500 issues per source search and preserve incomplete-coverage notices in reports.

## Optional PostgreSQL team metadata

`server/lib/teamPriorityPostgres.mjs` owns the optional pool and Team preference. `server/db/team/001-team-metadata.sql` consolidates metadata in `team_issue_metadata`, keyed by `(site_host, issue_key)`, with priority, notes, Now/Next, planning dates, requestor, decision, PM override, and pin fields. `shared_programs` and `shared_program_epics` retain source-qualified roots. `002-tracking-presence.sql` adds the presence marker used to distinguish shared tracking from priority-only rows. SQL dates cross the store boundary as `YYYY-MM-DD` strings or null. Images/local paths are not stored in Team rows.

Priority 0 clears priority without deleting other metadata. Clearing date tracking preserves notes, follow-up, requestor, decision information, pin, and priority. Local and Team maps/drafts remain separate; explicit Team failures do not fall back to Local. Shared-program ownership applies only while Team is enabled. Ordinary Local hydration can succeed when optional Team health fails; Combined retains its stricter source-readiness policy.

`GET`/`PUT /api/team-priority/settings` read/save `{enabled:boolean}` in the existing metadata DB; absence means off. The setting is app-wide and does not become true just because `TEAM_PRIORITY_DATABASE_URL` exists. Health returns `enabled`, `configured`, and `connected`; disabled checks do not open a connection. Disabled data operations reject with `TEAM_DATABASE_DISABLED` (HTTP 403), including explicit Team import/export. Already dispatched work is not undone. Mounted consumers in the same application receive updates; no cross-tab broadcast is provided.

The UI shows **Team data not configured — set TEAM_PRIORITY_DATABASE_URL** only for a successful health response with enabled true and configured false. Failed/loading checks and configured outages use different states.

Configure the server URL/optional CA, export the migration environment, run `npm run team-db:migrate`, restart the API, then select **Settings → Team data → Use team DB**. The migration CLI does not load `.env`, and startup does not run migrations. See [setup](./JIRA_SETUP.md#optional-team-database-postgresql) and [database operations/recovery](../README.md#optional-shared-team-data-postgresql). Atlas/MongoDB and MySQL documents under `docs/specs/` describe historical designs, not the runtime. Old demo JSON imports require explicit source annotation and hostname mapping; there is no automatic external database migration.

## SQLite schema

**`issue_metadata`** — per-issue notes, personal priority, and ad-hoc start date

| Column | Type | Notes |
|--------|------|-------|
| `issue_key` | TEXT PK | e.g. `PROJ-1234` |
| `note` | TEXT | Local draft note |
| `priority` | INTEGER | 0–20; 0 = unranked, 1 = highest |
| `start_date` | TEXT | `YYYY-MM-DD` or `''`. Ad-hoc — no Jira field backs this; feeds Gantt-chart views |
| `updated_at` | TEXT | ISO 8601 |
| `pinned_gantt` | INTEGER | 0/1; 1 = issue appears in Gantt Pinned Issues view |

**Current ownership:** `issue_metadata` belongs to the selected saved entry (or legacy single-site store). The table above highlights common fields rather than listing every planning column; `server/db/schema.mjs` is the schema authority. Local priorities use `shared/issuePriority.mjs` (0–20, where 0 is unranked). Shared-program priorities and explicit Team planning use the optional PostgreSQL store described above; Jira comment text is not parsed for priority.

**Date destinations:** Local/Team actual and planned dates are metadata. Due date and mapped MRD/IDD fields are Jira fields; editing them calls `POST /api/jira/issues/:issueKey/date-field` with the captured source context.

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
| `due_by_field` | `due_date`, `most_recent_done_date`, or `initial_done_date` |
| `include_past_due` | Whether past-due epics/rows were included |
| `past_due_lookback_years` | `1`, `2`, or `3` — lookback floor for past-due list rows |
| `due_by_issues_json` | Flat list of due-date rows; each item has `isOverdue` for past vs upcoming split |

**`field_mappings`** — maps app date-field roles to Jira custom field IDs/names

**`app_settings`** — key-value store for `epic_past_due_mode`, `proxy_url`, `chat_custom_instructions`

**`reminders`** — legacy four-slot source records retained for recovery/compatibility; the current To Do panel uses the app-wide store

| Column | Type | Notes |
|--------|------|-------|
| `slot_index` | INTEGER PK | 0–3, fixed slot count |
| `text` | TEXT | Reminder text, max 500 chars |
| `done` | INTEGER | 0/1 |
| `updated_at` | TEXT | ISO 8601 |

**`todos`** — current personal To Dos in `personal-todos.sqlite` (older site copies remain migration sources)

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `text` | TEXT | To-do text, max 500 chars |
| `priority` | INTEGER | 1–5; 1 = highest |
| `due_date` | TEXT | `YYYY-MM-DD` or empty |
| `done` | INTEGER | 0/1 |
| `created_at` | TEXT | ISO timestamp |
| `completed_at` | TEXT | `YYYY-MM-DD` when done, empty otherwise |

New items are limited to 15 active To Dos; existing migrated items are preserved. `todoDatabase.mjs` copies unambiguous source records and records them in `todo_migration_ledger`, so deleting a migrated item does not recreate it. Ambiguous lineage remains in original databases for recovery; unknown completion dates are included in All time. `TodosContext.jsx` owns the current UI/save queue across site switches.

**`watched_assignees`** — saved people and custom queries for the Individual contributors tab's "Layered in" panel (not the auto-derived "From your selected projects" panel, which has no dedicated table — it's computed from epic `contributorMetrics` at read time)

| Column | Notes |
|--------|-------|
| `display_name` | Label shown in the Dashboard chip |
| `watch_type` | `"person"` or `"jql"` (displayed as "Custom query" in the UI) |
| `jql` | JQL string (populated for `jql` type; empty for `person`) |
| `resolved_account_id` | Cached Jira account ID (person type only) |
| `sort_order` | Display order |

**`generated_reports`** — archived LLM reports, week plans, and manually saved Chat replies

| Column | Notes |
|--------|-------|
| `id` | INTEGER PK |
| `source` | `work_week`, `dashboard`, or `adhoc` |
| `report_type` | `work_week_project_report`, `week_plan`, `dashboard_report`, or `chat_response` |
| `label` | Display title in Past Reports list |
| `content` | Full markdown body |
| `meta_json` | Audience, chart data, user prompt (Ad-hoc), snapshot refs, etc. |
| `created_at` | ISO 8601 |

Auto-inserted on successful `POST /api/report/generate`, `/api/report/project`, and `/api/plan/week`. Ad-hoc rows come from `POST /api/reports/archive` (Chat **Save to Past Reports**). Listed via `GET /api/reports/archive?source=…`.

**`chat_sessions`** — Rovo OAuth tokens when `CHAT_PROVIDER=rovo`

Created automatically in `server/db/schema.mjs` on first API start. WAL mode enabled.

### Export / backup

For **single-user backup** or handoff. Choose the exact store from [Local stores and request context](#local-stores-and-request-context); the example below covers only the legacy single-site database. Back up registered-site, metadata, personal To Do, and Combined stores separately, plus note-image folders. Use SQLite-aware backups while running or stop the app before file-level backup; do not copy only a live main database file and omit its WAL. Shared metadata uses your PostgreSQL backup process.

```bash
# Full backup
sqlite3 data/workweek.sqlite ".backup data/workweek-share.sqlite"

# CSV export (notes + priority)
sqlite3 -header -csv data/workweek.sqlite \
  "SELECT issue_key, note, priority, updated_at FROM issue_metadata ORDER BY updated_at DESC;" \
  > data/issue_metadata_export.csv
```

---

## Key Jira custom fields

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
3. **`buildEpicMetrics.mjs`** — Jira search per preset; `computeChildIssueMetrics` + `buildEpicLevelDueByIssues` for due-date lists; per-epic `contributorMetrics` stay scoped to that preset’s issues
4. **`buildAssigneeMetrics.mjs`** — the **Individual contributors** tab's "Layered in" panel: **person** watches run `assignee = "…"` JQL (full assignee workload); **JQL** watches use the saved query without intersecting preset scope. This is a separate Jira round-trip from step 3, which is why it needs its own **Refresh contributors** click rather than riding the main snapshot refresh
5. **`collectDueByIssues.mjs`** — merges epic-level due-by rows into snapshot flat list (capped at 200)
6. **`persistSnapshot.mjs`** — writes `dashboard_snapshots` and related metric rows

**Client-side rollup:** the **Individual contributors** tab's "From your selected projects" panel does *not* call `buildAssigneeMetrics.mjs` — it's `rollupEpicContributorPeople()` in `dashboardMetricsUtils.js`, summing the per-epic `contributorMetrics` from step 3 (already in the snapshot) across whichever presets are selected. No extra request, no separate refresh; it's stale only when the main snapshot is. `IndividualContributorsPanel.jsx` renders both panels side by side; `ContributorStatusBar.jsx` renders each auto-derived row.

### Due-date resolution (`shared/dashboardMetrics.mjs`)

`getIssueDueByDate(issue, compareFieldId, fallbackFieldId, epicIssue)` resolves the effective date for due-by filtering:

**`dueByFallbackFieldId` rule (set in `buildRefreshContext.mjs`):**
- When **Compare against = Task due date**: fallback is the mapped `duedate` field
- When **Compare against = MRD or IDD**: fallback is the same as `compareFieldId` — the standard `duedate` field is intentionally excluded, because tasks in your Jira project often have a stale `duedate` that would otherwise override the epic’s MRD/IDD

**`candidateFieldIds` rule (set in `dueByHelpers.mjs → resolveCandidateFieldIds`):**
- When **Compare against = Task due date**: `[duedate, MRD, IDD, PED]` — project epics may not use standard `duedate`, so MRD/IDD/PED are included as fallback candidate fields for epic-level date inheritance
- When **Compare against = MRD**: `[MRD]`
- When **Compare against = IDD**: `[IDD]`

**Epic parent resolution for JQL presets (`dueByHelpers.mjs → buildJqlEpicContext`):**

JQL presets return tasks/sub-tasks, not epics. Epic-level dates and JQL epic breakdown both need a resolved epic key per issue:

1. Seed a cache from the JQL search results.
2. Batch-fetch missing parent issues (`key in (...)` in chunks of 50 via `shared/jiraBatch.mjs`).
3. Walk Story → Epic using cached `parent` fields; fall back to parent/grandparent keys when issuetype metadata is missing.
4. Batch-fetch epic issues with full date fields (`getEpicIssueFieldIds`) before due-by lists or epic breakdown metrics run.

`buildEpicMetrics.mjs` calls `buildJqlEpicContext` once per JQL preset and reuses the result for epic breakdown and `resolveJqlPresetDueByIssues`.

**Due-by list population (`resolveJqlPresetDueByIssues`):**

1. Group open issues by resolved epic key from the shared context above.
2. Pass each epic to `buildEpicLevelDueByIssues` — picks the earliest date from `candidateFieldIds` within the cutoff window and maps open child issues to that date.
3. When **Compare against = MRD/IDD**, child task rows are replaced by epic-level rows only when epic-level rows are actually produced.

**`fetchEpicIssue` / `getEpicIssueFieldIds`** always request `parent` plus MRD/IDD/PED — required for the Story → Epic walk. Without `parent` on the Story fetch, the grandparent Epic key is never found and due-by lists stay empty.

Info-level logging throughout this pipeline (tag `[dashboard]`) traces the walk at each step: Story → Epic resolution, resolved date per epic, and how many issues were added. Set `LOG_LEVEL=info` to see it.

Upcoming vs past-due list membership:

- **Upcoming** — `dueDate >= today` and `<= dueByDate` cutoff (`isIssueUpcomingDueBy`)
- **Past due in list** — only when `includePastDueInList`; `dueDate < today` within `pastDueFloor` lookback (`isIssuePastDueInLookback`)

**Stale snapshot handling:** if the Dashboard snapshot was captured with `includePastDue: true` and the user later turns that off without refreshing, `dueByIssues` may still contain `isOverdue: true` rows from the old capture. The Upcoming card empty state detects this via `snapshot.includePastDue` and shows a “Refresh status to update” hint rather than “enable Past Due Due Dates”.

### Work Week Dates column (`src/utils/jiraIssueDoneDates.js`)

`JiraResultsTable` stacks three date fields into one **Dates** column per row — **Due**, **MRD**, and **Start** — rather than separate columns. Due and MRD are editable `<input type="date">` fields with their own **Update** button each, pushing straight to Jira via `POST /api/jira/issues/:issueKey/date-field` (`handleDueDateUpdate` / `handleMrdUpdate` in `useTaskManagerJira.js`). Actual/planned dates use the selected Local or Team destination — see [team metadata](#optional-postgresql-team-metadata).

After each **Run JQL**, `enrichRunWithParentDoneDates` (in `jiraJqlRunWorkflow.js`) attaches `mrdFieldId` and `parentMostRecentDoneDateByKey` to each run. Restored runs from `localStorage` are re-enriched when field mappings finish loading (`useTaskManagerJira.js`).

Display logic in `getMostRecentDoneDateForIssue`:

1. **Issue’s own MRD** (`most_recent_done_date` mapping) when set
2. **`parentMostRecentDoneDateByKey[parentKey]`** when the task has no MRD

`buildParentMostRecentDoneDateMap` fetches missing parents from Jira and walks up to **five** ancestor levels (Story → Epic, etc.) until an MRD is found. When a row's own Due/MRD field is empty, the Dates column shows a small "from MRD: …" / "from parent: …" hint below that field with the inherited value used for overdue calculations elsewhere in the app — editing the field writes only the issue's own value, it does not change the inheritance.

### Task Management JQL — full result loading

`POST /api/jira/search/all` (`server/lib/jiraSearchHelpers.mjs` → `searchAllIssues`) paginates with Jira `nextPageToken` until all matches are loaded or `maxTotal` is reached (cap **5000**). Work Week **Run JQL** calls `fetchJiraSearchAll` per slot (`jiraJqlRunWorkflow.js`). Each run stores `total`, `loaded`, and `loadComplete`; the UI shows **Load remaining** when incomplete. `persistJqlRunsToStorage()` writes results when a run finishes so navigation mid-JQL does not lose the table.

### Task Management notes from Jira comments

On each **Run JQL** (and **Load remaining**), when **Pull most recent Jira comment** is off, local SQLite notes merge into row Notes as before. When it is on (`pullLatestComment` in `workWeekTasksJiraPreferences`), `fetchLatestJiraCommentsBulk` overwrites Notes from Jira and skips local note merge for those keys.

Priority is **not** read from comment text. When Team is enabled and ready, shared-program slots load priority via `fetchTeamPriorityBulk` / `applyTeamPriorityState` in `jiraJqlRunWorkflow.js`. `PriorityCell` shows a **Team** badge when `prioritySourceByKey[issueKey].source === "team-db"`.

### Assignee updates (Jira user search)

`GET /api/jira/users/search?query=…` → `searchJiraUsers` / `pickBestJiraUser` in `server/lib/jiraSearchHelpers.mjs`. Resolves display names, emails, and usernames for `POST /api/jira/issues/:issueKey/assignee`. UI: `AssigneeCell.jsx` debounces suggestions; Enter or **Update Assignee** commits.

### Dashboard → Task Management drill-down

`src/utils/workWeekNavigation.js` → `buildWorkWeekHref({ key, assignee, epicPresetId })` returns `/work-week?key=…&assignee=…&epicPresetId=…` (hash router). `epicPresetId` is only set when `assignee` is also set, and only matters for the unassigned case (see point 5). Dashboard components link via React Router `Link`:

- `DueByHierarchicalList.jsx` — issue keys, assignees, epic **Task Management** links
- `EpicMetricCard.jsx` — epic key, overdue task keys; passes `epic.epicPresetId` down to `ProjectContributorMetrics.jsx` for its contributor-name links
- `AssigneeMetricCard.jsx` — person name, overdue issue keys (no `epicPresetId` — this card aggregates across every selected project, so there's no single project to scope to)

`WorkWeekTasks.jsx` reads `useSearchParams()` and passes `drillDownFilters` to `JiraResultsTable`, which applies key/assignee filters on mount.

Drill-down behavior:

1. **`findRunIndexForDrillDown`** (`workWeekNavigation.js`) — prefers an existing drill-down tab of the same type, then falls back to a regular JQL tab that contains the issue or assignee.
2. **Re-apply when JQL loads** — filter state updates when `jqlRuns` populates (fixes early apply-before-data bug).
3. **Pending state** — `JiraResultsTable.jsx` creates a temporary **Loading drill-down...** tab while `WorkWeekTasks.jsx` is fetching the target, so Dashboard clicks show the loading message even when regular JQL tabs already exist.
4. **`loadDrillDownIssueByKey`** (`jiraJqlRunWorkflow.js`) — fetches `key = "ISSUE-KEY"` from Jira and prepends/refreshes a **Drill-down: ISSUE-KEY** tab (`isDrillDown: true`, `drillDownType: "issue"`, stable `drillDownId`).
5. **`loadDrillDownIssuesByAssignee`** — when the assignee is not already in saved JQL results, runs `assignee = "Name"` in Jira and prepends/refreshes a **Drill-down: Name** tab (`drillDownType: "assignee"`). `WorkWeekTasks.jsx` triggers this from `?assignee=` when no matching run exists.
   - **Unassigned is special-cased**, not just another assignee name: `assignee = "Unassigned"` is a literal string match against a Jira user, and no such user exists, so it always returned zero results. The fix runs `assignee is EMPTY` instead, scoped to the originating project's real JQL via `GET /api/epic-presets/:id/scope-jql` (falls back to `project = [PROJECT]` when no `epicPresetId` is available or the fetch fails). See `UNASSIGNED_DRILLDOWN_PROJECT_KEY` in `jiraJqlRunWorkflow.js`.
   - `JiraResultsTable.jsx` also seeds its own row-level assignee filter dropdown from the URL. That dropdown expects the sentinel `"__unassigned__"`, not the literal string `"Unassigned"` — seeding it with the raw URL value silently filters out every row even when the fetch above succeeds. Both spots need to agree on the unassigned case.
   - Because `epicPresetId` can differ per click, `matchesDrillDownAssignee` (`WorkWeekTasks.jsx`) requires **both** the assignee name and `epicPresetId` to match before treating a `jqlRuns` entry as "already loaded" — otherwise "Unassigned" clicked from two different project cards would collide into the same tab.

A fetch sequence guard drops stale responses when keys change quickly or all drill-down runs are cleared internally.

**Drill-down run isolation** (`jqlRunPersistence.js`): `partitionJqlRuns` / `mergeJqlRuns` / `savableJqlRuns` keep `isDrillDown` tabs out of the regular `localStorage` JQL snapshot and preserve them when background JQL completes, MRDD enrichment runs, or **Load remaining** updates regular tabs. Drill-down tabs are stored separately in `sessionStorage` (`workWeekTasksJiraDrillDownRuns`) via `persistDrillDownRunsToSessionStorage()` and restored only for the current browser session. `clearDrillDownRun(drillDownId)` removes one drill-down tab; clearing the Dashboard filter navigates to `/work-week` without deleting session drill-down tabs.

### Epic preset team pack

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/epic-presets/export` | JSON pack (`version`, `exportedAt`, `presets[]`) |
| POST | `/api/epic-presets/import` | Body: `{ presets, mode: "merge" \| "replace" }` — fingerprint dedupes on merge |

Settings UI: **Export team pack** / **Import team pack**. Align with `npm run seed:presets` for admin seeding — see [preset setup](./JIRA_SETUP.md#5-set-up-presets-required-for-metrics--chat).

### Create Issue (`CreateIssueModal.jsx` + `jiraIssueRoutes.mjs`)

Task Management **Create Issue** creates Story, Task, or Bug issues in your Jira project with client and server validation against `shared/odiIssueStandards.mjs`.

**Parent selection (three paths):**

| Path | API | Behavior |
|------|-----|----------|
| Epic preset | `GET /api/jira/epics/:epicKey/parent-options` | Epic + stories under that epic |
| JQL preset (no embedded epic key) | `POST /api/jira/issues/parent-candidates` | Runs preset JQL, walks `parent` + Epic Link (`customfield_10014`), returns `epics`, `stories`, `chains` |
| Manual key | `GET /api/jira/issues/:issueKey/summary` | Validates epic vs story for the chosen issue type |

Preset preload from the active Task Management tab uses `resolveCreateIssueDefaults` in `shared/createIssuePresetUtils.mjs` (`defaultEpicSelectValue`). Manual key validation and query-issue parent resolution live in `shared/createIssueParentUtils.mjs`; the modal uses `useCreateIssueManualKey` for debounced validation and `setResolvedParent` / `applyQueryIssueParent` for a single parent-state code path.

**Create payload:** `buildJiraCreatePayload` in `server/lib/jiraCreateIssueFields.mjs` reads Jira **createmeta** to choose `parent` vs Epic Link, issue type id, priority mapping (`Critical` → `Highest`), and project custom fields (Components, Vertical Components, BUG Tracking). Descriptions are sent as ADF via `shared/jiraDescriptionAdf.mjs`.

**Attachments:** `server/routes/attachmentRoutes.mjs` exposes `GET /api/jira/attachment-limits`, `GET /api/jira/issues/:issueKey/attachments`, and `POST /api/jira/issues/:issueKey/attachments` (multipart field `files`, up to 10). Unlike note images (memory storage, 5 MB), attachments use multer **disk** storage in `os.tmpdir()/taskmanager-attachments` and `server/lib/jiraAttachments.mjs` streams each file to Jira with `fs.openAsBlob`, so large `.mov` recordings are never fully buffered; temp files are deleted in a `finally`. Files upload one at a time so a single failure (e.g. Jira 413) is reported per file without failing the batch. Allowed types and size messages live in `shared/attachmentLimits.mjs`, shared with the browser. UI: `AttachmentPicker.jsx` (drop zone + list with image thumbnails), `AttachFilesModal.jsx` (task-row dialog; also exports `useAttachmentLimits`), and an **Attachments** field in `CreateIssueModal.jsx` that uploads after the issue is created. The client uploads with `XMLHttpRequest` (`uploadIssueAttachments` in `jiraClient.js`) to get upload progress, which `fetch` cannot report.

**BUG Tracking:** in ODI there is no dedicated BUG Tracking field — the values are Components named `BUG Tracking-*`. When Bug createmeta has no field named "bug tracking", `loadCreateFieldOptions` offers those components as BUG Tracking options (and removes them from the regular Components list), and `applyOdiCreateFields` merges the selection into the `components` array with the regular Component. Projects that do publish a dedicated field keep using it.

**AI Draft limits:** `/api/jira/issues/generate-description` uses per-type output budgets (`AI_DRAFT_MAX_TOKENS`: Story 4000, Bug 3000, Task 2000) and calls `completeLlmText` with `failOnTruncation: true`, so a response cut off at the token limit returns a clear 502 instead of an unparseable-JSON 422. All LLM fetches in `server/lib/llmClient.mjs` now carry an `AbortSignal.timeout` (see `LLM_TIMEOUT_MS`, `OLLAMA_TIMEOUT_MS`, `AI_DRAFT_TIMEOUT_MS`); the client aborts AI Draft after 150s so `generatingDesc` never blocks **Create** indefinitely.

**Parent / issue-type rules:**

| Create | Issue type sent | Jira issuetype used | Parent link |
|--------|-----------------|---------------------|-------------|
| Story / Bug under Epic | Story / Bug | Same | `parent` preferred; Epic Link fallback |
| Task / sub-task under Story | Task (`isSubtask: true` for story flow) | **Sub-task** (Task parents to Epic only) | `fields.parent = { key: storyKey }` |
| Standalone Task under Story | Task | **Sub-task** | `fields.parent = { key: storyKey }` |

Story-backed work must use Jira **Sub-task** under a Story. **Task** issues parent to Epics (`Epic (Feature)`), not Stories — forcing Task + Story parent produces Parent Link / parentId validation errors. Portfolio **Parent Link** (`customfield_10018`) is not used for story parents.

**Components:** `loadProjectComponents` fetches `/rest/api/3/project/{key}/components`; unknown component names are rejected before the Jira API call.

**Modal validation UX:** `descriptionError` state shows description/goal/clarification failures below the Description textarea; other errors stay in the top banner. `canSubmit` vs `canEditIssueFields` allows resubmit after fixing validation errors.

**Issue type matching:** Your Jira project may use variant names such as `Epic (Feature)` and `Story (User Story)`. `matchesIssueTypeFamily` in `shared/dashboardMetrics.mjs` treats these as epic/story for parent validation — not only the literal names `Epic` / `Story`.

### Past Reports archive

`server/lib/reportArchive.mjs` — `REPORT_SOURCES` (`work_week`, `dashboard`, `adhoc`), `insertGeneratedReport`, `listGeneratedReports`, `getGeneratedReportById`. Tab filters use `report_type` sets (Work Week: project report + week plan; Dashboard: `dashboard_report`; Ad-hoc: `chat_response` or `source=adhoc`). Report saves pass `savedAtLocal` / `savedTimeZone` from the browser (`src/utils/localTimestamp.js`) so archived rows are created under the user's local timestamp; the timezone is also kept in `meta_json` when provided.

UI: `ReportArchive.jsx` — three tabs, list + `ReportOutput` viewer. Dashboard archived items may include `meta.statusCounts` / `chartVariant` for chart replay.

### On-page report clear (not archive delete)

`src/utils/pageReportPersistence.js` — loads/saves Metrics report, Task Management project reports (per run key), and week plan to `localStorage`. **Clear report** calls `clearDashboardReportState`, `clearWorkWeekProjectReport`, or `clearWeekPlanReportOnly` — removes on-page display only; `generated_reports` rows are untouched.

`ReportOutput.jsx` accepts optional `onClear` for the header button.

### Weekly digest

`GET /api/reports/weekly-digest` (`server/lib/weeklyDigest.mjs`) builds markdown from the latest `dashboard_snapshots` row (overdue/upcoming, contributors, rollup). No LLM. UI: `WeeklyDigestPanel.jsx` under Dashboard → Generate Report.

### Dashboard UI section toggles

Persisted in `localStorage` key `dashboard-visible-sections` via `normalizeVisibleSections()` in `dashboardMetricsUtils.js`. `activeDashboardTab` (separate state, `DashboardTabs.jsx`) controls which of the three tabs — **project** / **people** / **reports** — is currently shown; `visibleSections` controls whether that tab's content renders at all versus a "turned off — enable it under Filters → Views" message (`Dashboard/index.jsx`). The first four keys gate individual `CollapsibleSection`s within the **project** tab; `overdue` and `report` gate an entire tab's content each:

| Key | Section | Tab |
|-----|---------|-----|
| `overall` | Overall Status | project |
| `epicMetrics` | Project Metrics | project |
| `dueByUpcoming` | Upcoming Due Dates card | project |
| `dueByPastDue` | Past Due in lookback card | project |
| `overdue` | Individual contributors (both panels) | people |
| `report` | Reports (Generate Report + Weekly digest) | reports |

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
| POST | `/api/jira/search/all` | Paginated JQL until `maxTotal` (cap 5000) |
| POST | `/api/jira/issues/comments/latest/bulk` | Latest comment `{ text, author }` per issue key |
| POST | `/api/jira/issues/:issueKey/comment` | Add Jira comment |
| POST | `/api/jira/issues/:issueKey/status` | Transition status |
| POST | `/api/jira/issues/:issueKey/assignee` | Update assignee |
| POST | `/api/jira/issues/:issueKey/date-field` | Push Due date or MRD (body: `{ role: "due_date" \| "most_recent_done_date", value }`) — resolves the field ID through Settings field mappings, falls back to `duedate` / `customfield_10009` |
| GET | `/api/jira/users/search` | Jira user search (`?query=`) for assignee typing |
| POST | `/api/jira/issues` | Create issue |
| GET | `/api/jira/issues/:issueKey/summary` | Issue type summary (`isEpic`, `isStory`) for manual parent validation |
| GET | `/api/jira/epics/:epicKey/parent-options` | Epic + stories for epic-preset parent picker |
| GET | `/api/jira/epics/search?q=` | Search Epics by summary text (min 2 chars) - for Chat's "Evaluate an Epic" panel picker |
| GET | `/api/jira/epics/:epicKey/workload` | Epic's full descendant tree (Epic -> Story -> Task) with workload totals, per-contributor breakdown, timeline (PED/MRD/IDD), and cross-team blocker candidates - for Chat's "Evaluate an Epic" panel |
| POST | `/api/jira/issues/parent-candidates` | Body: `{ jql, maxTotal? }` — parent chains from a saved query |
| POST | `/api/jira/issues/generate-description` | AI-generated description + subtasks/priority for a new issue (body: `summary`, `issueType`, `epicKey`, `epicName`) |
| GET | `/api/jira/projects` | List projects |
| GET | `/api/jira/projects/:key/createmeta` | Create-issue field metadata |
| POST | `/api/jira/issue-metadata/bulk` | Bulk read notes + priority (SQLite) |
| GET | `/api/jira/issue-metadata/recent-notes?since=YYYY-MM-DD` | Issue keys with a local note added/edited on or after `since` - used by Task Management's "All my assigned work" report scope |
| PUT | `/api/jira/issue-metadata/:issueKey` | Update note + priority (SQLite) |
| PATCH | `/api/jira/issue-metadata/:issueKey/pin-gantt` | Toggle Gantt pin (body: `{ pinned: boolean }`) |
| GET/POST/PUT/DELETE | `/api/epic-presets` | Epic/JQL presets CRUD |
| GET | `/api/epic-presets/export` | Team preset pack (JSON) |
| POST | `/api/epic-presets/import` | Import team pack (`merge` or `replace`) |
| GET | `/api/epic-presets/:id/scope-jql` | Resolves a preset's real JQL (epic-key, Jira filter, or hand-authored) with any trailing `ORDER BY` stripped — `{ scopeJql }`. Caller wraps it: `(${scopeJql}) AND <clause>` |
| POST | `/api/epic-filters/run` | Run preset JQL (Task Management) |
| GET | `/api/jira/filters` | Available Jira filters (owned + shared; paginated `filter/search`) |
| GET | `/api/jira/filters/favourite` | Alias of `/api/jira/filters` (same available list; legacy path) |
| GET | `/api/jira/filters/:id` | Single filter by ID |
| GET/PUT | `/api/jira/field-mappings` | Date field role mappings |
| POST | `/api/jira/field-mappings/sync` | Sync mappings from Jira |
| GET/PUT | `/api/settings` | App settings key-value |
| GET/PUT | `/api/reminders` | Header reminders (4 fixed slots; body for PUT: `{ reminders: [{ text, done }, ...] }`) |
| GET | `/api/todos` | All todos (active + completed), sorted by done→priority→due |
| GET | `/api/todos/completed?days=N` | Completed todos from last N days (default 90, 0 = all time) |
| POST | `/api/todos` | Create todo (max 15 active; body: `{ text, priority, dueDate }`) |
| PUT | `/api/todos/:id` | Update todo (body: any subset of text/priority/dueDate/done) |
| DELETE | `/api/todos/:id` | Delete one todo |
| DELETE | `/api/todos/completed` | Bulk delete all completed todos |
| GET/POST/PUT/DELETE | `/api/watched-assignees` | Contributor Metrics entries, including capacity targets |
| GET | `/api/project-managers/capacity` | Capacity planning data for selected Contributor Metrics entries |
| GET | `/api/project-managers/gantt?slug=` | Gantt data for a shared program or `__pinned__` for pinned issues view |
| GET | `/api/project-managers/gantt/status-history/:issueKey` | On-demand only (hover-triggered) — real Jira status-transition history for one issue, as contiguous segments |
| POST | `/api/dashboard/refresh` | Pull + store metrics snapshot |
| GET | `/api/dashboard/metrics` | Read stored snapshot |
| POST | `/api/report/generate` | Dashboard AI report (Executive/PO/Developer) |
| GET | `/api/reports/weekly-digest` | Snapshot-based weekly digest (markdown, no LLM) |
| GET | `/api/reports/archive` | List archived reports (`?source=work_week\|dashboard\|adhoc`, `?limit=`) |
| GET | `/api/reports/archive/:id` | Single archived report (includes content) |
| DELETE | `/api/reports/archive/:id` | Delete one archived report |
| DELETE | `/api/reports/archive?source=...` | Delete every archived report matching `source` (`work_week\|dashboard\|adhoc` required - refuses an empty/unknown source rather than deleting the whole table) |
| POST | `/api/reports/archive` | Manual save (Chat → Ad-hoc; body: `content`, optional `label`, `userPrompt`, `provider`) |
| POST | `/api/report/project` | Task Management per-query AI report (auto-archived) |
| POST | `/api/plan/week` | Task Management AI week planner (auto-archived) |
| GET | `/api/chat/status` | Chat provider readiness + OAuth state |
| GET | `/api/chat/auth/start` | Start Atlassian OAuth (Rovo); `?format=json` returns URL |
| GET | `/api/chat/auth/callback` | OAuth callback (browser redirect target) |
| POST | `/api/chat/auth/signout` | Clear stored OAuth session |
| POST | `/api/chat` | Chat message → AI provider (see Chat session context below) |

---

## AI report system prompts

### `/api/report/project` (Task Management — My Metrics)
Written **from the assignee's perspective**, second person ("you have", "your open items"). Tone: supportive colleague, not manager status update. Covers: overall tracking %, key open items, overdue concerns, recommended next steps. Flowing prose, no bullet lists.

### `/api/report/generate` (Dashboard — Generate Report)
Four audience variants — `AUDIENCE_CONFIGS` in `server/lib/aiInstructions.mjs`, keyed by `audience` in the request body (`AUDIENCE_OPTIONS` in `useReportGeneration.js` is the frontend mirror):
- **`executive`** — Executive Summary: highlights, risks, action items for leadership
- **`product_owner`** — Project Manager Summary: deadline realism, stakeholder impact, delay risks, stand-up summaries, closeout reports (key kept as `product_owner` for backward compatibility; the label was renamed)
- **`developer`** — Developer Report: team workload and WIP, plus a full per-contributor status breakdown (`rollupEpicContributorPeople` + `ContributorStatusBar`, not just overdue counts)
- **`direct_reports`** — Ad-hoc team report: `isAdhocTeamReport` in `reportRoutes.mjs`; scoped to Settings → My Direct Reports rather than the selected project presets

### `/api/plan/week` (Task Management — Help me plan my week)
Day-by-day Monday–Friday plan using actual issue keys from the loaded JQL runs. Respects `focusStyle` (balance / overdue-first / single-project / meeting-heavy), `capacityHours`, `fixedCommitments`, and `additionalContext`. Flags overdue items with ⚠️.

---

## Chat session context

Each `POST /api/chat` request includes an `epicContext` object from the browser:

| Field | Source | Purpose |
|-------|--------|---------|
| `selectedEpics` | Chat epic filter panel | Preset labels, keys, and JQL for scoped searches |
| `includePastDue` | Chat epic filter panel | Whether past-due filter is active |
| `sessionContext` | `buildChatSessionContext()` in `src/utils/chatSessionContext.js` | Task Management queries, dashboard snapshot, generated artifacts |

`sessionContext` is built client-side on each send:

1. **JQL queries** — summarized from the site-scoped `localStorage` logical key `workWeekTasksJiraLastJqlRuns` (label, JQL, counts, top open issues).
2. **Dashboard snapshot** — refreshed via `GET /api/dashboard/metrics` on Chat load and again on each send. Summary includes separate `dueByPastDueCount` and `dueByUpcomingCount` when `dueByDate` is set.
3. **Artifacts** — last 8 generated reports/plans from the site-scoped `localStorage` logical key `taskManagerChatSessionArtifacts`.

Artifacts are saved when the user generates:

| Artifact `type` | Saved from |
|-----------------|------------|
| `work_week_project_report` | Work Week → My Metrics → Project Report |
| `week_plan` | Task Management → Help me plan my week |
| `dashboard_report` | Dashboard → Generate Report |

Ad-hoc Chat saves use `saveAdHocReport()` → `POST /api/reports/archive` (not added to the 8-artifact Chat cache unless the user also generated a report in-session).

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

Browser keys below are logical names. Site-scoped helpers prefix them with `docket:site:<instanceId>:` (or `docket:site:legacy:`); Combined report/job state uses `docket:combined-work:`. Unscoped legacy records are never adopted based on issue-key matches. The browser recovery banner can be dismissed via `docket:legacy-site-recovery-dismissed`; acknowledgement preserves the original values. Blocked browser storage falls back to session-only dismissal. Ambiguous old shared-row priority/planning caches also stay at their original keys while authoritative Local and available Team values hydrate separately.

| Data | Mechanism | Key(s) |
|------|-----------|--------|
| JQL inputs, labels, count | `localStorage` | `workWeekTasksJiraPreferences` |
| Last JQL results snapshot | `localStorage` | `workWeekTasksJiraLastJqlRuns` |
| Work Week drill-down runs | `sessionStorage` | `workWeekTasksJiraDrillDownRuns` |
| Jira notes + row priorities (UI cache) | `localStorage` | `workWeekTasksJiraNotes`, `workWeekTasksJiraRowPriorities` |
| Chat session artifacts (reports/plans for Chat context) | `localStorage` | `taskManagerChatSessionArtifacts` |
| On-page Metrics report | `localStorage` | `taskManagerPersistedDashboardReport` |
| On-page Work Week project reports | `localStorage` | `taskManagerPersistedWorkWeekProjectReports` |
| On-page week plan | `localStorage` | `taskManagerPersistedWeekPlan` |
| Work Week notes-on-run preference | `localStorage` | `workWeekTasksJiraPreferences` → `pullLatestComment` |
| Work Week header banners | `localStorage` | `workWeekTasksHeaderPreferences` (`showJokeTicker`, `showUpcomingDueBanner`) |
| Collapsible open/closed (including header calendar/reminders panel) | `localStorage` via `usePersistedState` | various `ww-*` / `dashboard-*` keys, e.g. `ww-today-details-open` |
| Dashboard visible sections | `localStorage` | `dashboard-visible-sections` (`dueByUpcoming`, `dueByPastDue`, …) |
| Issue notes + P1–P20 (persisted) | SQLite via proxy | `issue_metadata` |
| Personal To Dos / completed history | App-wide SQLite via proxy | `personal-todos.sqlite` → `todos`, migration ledger |
| Generated reports archive | Site SQLite or dedicated Combined store | `generated_reports`; Combined scope is isolated |
| Combined report goals | `docket-combined.sqlite` | `app_settings`, independent of selected entries |
| Use team DB preference | `instances-meta.sqlite` | `jira_instance_meta.use_team_db`, default off |
| Dashboard snapshot | SQLite via proxy | `dashboard_snapshots` (+ related metric tables) |
| Historical packaged desktop `.env` + SQLite | OS user data folder | Unsupported; see historical recovery notes below |
| Epic preset selections (Dashboard/Chat) | `localStorage` | `epicFilterSelectedIds` |
| Rovo OAuth tokens | SQLite via proxy | `chat_sessions` |

### Background jobs (survive navigation)

Long-running UI actions run through `src/utils/backgroundJobStore.js` via `runBackgroundJob()` in `src/hooks/useBackgroundJobs.js`. Jobs keep running when the user navigates away; `BackgroundJobIndicator` in the nav shows in-progress work. Pages re-attach on mount with `useAttachBackgroundJob()` and merge loading state with `useBackgroundJobRunning()`. Results are persisted inside the job `run()` callback so returning to the page shows completed output even if React state was torn down.

| `BACKGROUND_JOB_IDS` | Trigger | Persisted result |
|----------------------|---------|------------------|
| `dashboard-refresh` | Dashboard **Refresh status** | SQLite snapshot |
| `dashboard-report` | Dashboard LLM report | `localStorage` (`taskManagerPersistedDashboardReport`) |
| `dashboard-weekly-digest` | Weekly digest panel | In-page state (regenerate anytime) |
| `work-week-jql-run` | **Run JQL** / **Load remaining** | `localStorage` (`workWeekTasksJiraLastJqlRuns`) |
| `work-week-week-plan` | Week plan generate | `localStorage` week plan key |
| `work-week-project-report:{runKey}` | Per-tab project report | `localStorage` project reports map |

Wired in: `useDashboardRefresh.js`, `useReportGeneration.js`, `WeeklyDigestPanel.jsx`, `useTaskManagerJira.js`, `WorkWeekTasks.jsx` (`ProjectReportPanel`, `WeeklyPlanPanel`).

### Historical packaged desktop data (unsupported)

Packaged installers are unsupported; the packaging scripts and workflow have been removed. The retained Electron source still describes the old data layout below for recovery reference. Supported local workflows use the project `.env` and `data/` by default.

In the historical packaged path, Electron main sets `TASK_MANAGER_USER_DATA`:

| Path | Contents |
|------|----------|
| `{userData}/.env` | Jira + LLM credentials (created from template on first launch) |
| `{userData}/data/workweek.sqlite` | Notes, dashboard snapshots, archived reports, settings |

**macOS:** `~/Library/Application Support/The Docket/`  
**Windows:** `%APPDATA%\The Docket\`

Dev desktop (`npm run desktop:dev`) and browser dev use the repo `data/` folder and project-root `.env` instead.

The historical packaged path loads the UI from `http://127.0.0.1:{API_PORT}` (proxy serves `dist/`). Its former ASAR packaging configuration has been removed.

---

## Collapsible component pattern

Task Management and Dashboard share `src/Components/CollapsibleSection.jsx` (CSS: `src/Components/collapsible.css`):

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

## Server-side logging

All route modules and the proxy entry point use `server/lib/logger.mjs` via `createLogger(tag)`. Log lines are written to stdout/stderr in the format:

```
2026-06-30T14:23:01.452Z [INFO] [http] POST /api/dashboard/refresh → 200 (841ms)
2026-06-30T14:23:01.453Z [INFO] [dashboard] dashboard refresh completed
2026-06-30T14:23:05.120Z [ERROR] [report] generation failed  context deadline exceeded
```

**Tags:** `http` (request middleware), `server` (startup/DB), `jira` (proxy calls), `config`, `dashboard`, `report`, `chat`, `rovo`, `metadata`, `jira-core`, `jira-issue`.

**Log level** is controlled by `LOG_LEVEL` in `.env` (default `info`):

| Level | What is logged |
|-------|---------------|
| `error` | Failures only |
| `warn` | HTTP 4xx responses + missing env vars at startup |
| `info` | Every HTTP request (method, path, status, duration), dashboard refresh query type summary, report generation start, preset mutations (create/update/delete/import), issue mutations (comment push, status update, assignee update), server startup details |
| `debug` | All of the above **plus** every individual Jira API call (method, full URL, status code) |

Set `LOG_LEVEL=debug` when tracing Jira API issues. The HTTP request logger fires on `res.finish` so it always captures the final status code even for streamed responses.

### Upcoming due date banner (`useUpcomingDueBanner.js`)

`src/Pages/hooks/useUpcomingDueBanner.js` fetches `GET /api/dashboard/metrics` and `GET /api/jira/myself` in parallel, then filters `snapshot.dueByIssues` to only the current user's issues before the banner renders.

The filter uses **exact display name matching** (case-insensitive), with a secondary check against the email local-part (e.g. `"jane.doe"` → `"jane doe"` after normalising dots). Fuzzy/substring matching is intentionally not used here — the snapshot's `assignee` field is always a clean Jira display name string, so partial matches would risk showing other team members' tasks. If the banner shows no tasks but you expect some, confirm that your Jira `displayName` matches what is stored in the snapshot (`assignee` field in `due_by_issues_json`).

---

## EpicFilters context

`src/context/EpicFiltersContext.jsx` provides `EpicFiltersProvider` and the `useEpicFilters()` hook. The provider wraps `<Outlet />` inside `AppLayout` in `AppRouter.jsx`, mounting once at app start and surviving all route changes.

State held in context: `presets`, `loading`, `error`, `selectedPresetIds`, `includePastDue`.  
Actions: `selectAll`, `clearSelection`, `togglePreset`, `setSelectedPresetIds`, `setIncludePastDue`, `reloadPresets`.

Pages that consume it — `Dashboard/index.jsx`, `Chat.jsx`, `WorkWeekTasks.jsx`, `Settings/index.jsx` — all call `useEpicFilters()` directly. `Settings` calls `reloadPresets()` after any preset mutation so the updated list propagates immediately to Work Week and Dashboard without a page reload.

`fetchEpicPresets()` runs once on provider mount (one API call total at app start, not once per page).

---

## Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev:all` | Starts Vite (`:5173`) + Express proxy (`:8787`) concurrently |
| `npm run desktop:dev` | Starts Vite + Electron (proxy started from Electron main process) |
| `npm run desktop:doctor` | Rebuilds `better-sqlite3` native module, then starts desktop dev |
| `npm run desktop:rebuild-native` | Rebuilds native modules for current Electron version |
| `npm run check:jira-client-exports` | Verifies every imported `jiraClient` symbol is exported (prevents runtime blank-screen import failures) |
| `npm test` | Unit tests: `dashboardMetrics.mjs`, `epicFilterJql.mjs`, `chatSessionPrompt.mjs`, `issuePriority.mjs`, … `pretest` rebuilds `better-sqlite3` for system Node first — without it, running the desktop app beforehand leaves the native module built for Electron's ABI and tests fail with `ERR_DLOPEN_FAILED` (an environment artifact, not a real test failure) |
| `npm run team-db:migrate` | Explicit PostgreSQL schema migrations using exported environment |
| `npm run team-db:import-demo -- <annotated-json> <site-map>` | Explicit import of mapped historical demo exports |
| `npm run test:team-db` | PostgreSQL integration tests; requires a disposable `DOCKET_TEST_DATABASE_URL` |
| `npm run seed:presets` | Seed shared Epic/JQL presets into local SQLite — see the [preset catalog](../presets/pilot-presets.json) |
| `npm run build` | Runs export guard (`prebuild`), then creates production Vite bundle → `dist/` |
| `npm run desktop:build` | Alias for `npm run build`; does not create an installer |

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
#    - Run JQL on Task Management; confirm Loaded X of Y and Load remaining when needed
#    - Confirm Use team DB starts off; enable a configured test DB and verify Team vs Local ownership
#    - Combined Open Work: source edits, Managed/List, unique metrics, report goals and Combined archive
#    - Dismiss the older-browser-data notice and verify original records remain
#    - Generate a project report; navigate away and back while it runs
#    - Generate a week plan
#    - Dashboard refresh + weekly digest + Generate Report; drill-down link to Task Management (?key=, ?assignee=)
#    - Task Management drill-down tabs persist for the browser session; clear one tab and clear the URL filter separately
#    - Past Reports: view archived Task Management / Dashboard / Ad-hoc items; Chat Save to Past Reports
#    - Clear report on Task Management / Dashboard (on-page only)
#    - Assignee cell: type name/email, pick suggestion, Update Assignee
#    - Notes on run: Pull most recent Jira comment vs Keep local notes
#    - Settings: export/import team preset pack
#    - Chat: ask about a generated week plan or report (session context)
#    - Supported local desktop: restart after project `.env` edits, confirm Test Jira Connection
#    - Create Issue modal: epic preset, JQL preset parent chains, manual parent key, AI Draft, Bug priority, post-create Jira link; resubmit after validation error
```

---

## PR write-ups

Feature and fix branches should include a short write-up under [`docs/PR_WriteUps/`](./PR_WriteUps/). These files are **tracked in git** and are the preferred source for GitHub PR descriptions.

| | |
|--|--|
| **When** | Multi-commit or reviewable change sets (features, non-trivial bug fixes). Skip for typo-only / formatting-only commits unless you want a record. |
| **Where** | `docs/PR_WriteUps/PR_<TOPIC>.md` (`SCREAMING_SNAKE_CASE`) |
| **Cursor** | [`.cursor/rules/pr-writeups.mdc`](../.cursor/rules/pr-writeups.mdc) (`alwaysApply`) — agents create/update the write-up when committing, pushing, or opening a PR for substantive work |
| **Examples** | [`PR_CREATE_ISSUE_FIXES.md`](./PR_WriteUps/PR_CREATE_ISSUE_FIXES.md), [`PR_COLLECT_DUE_BY_DEDUPE.md`](./PR_WriteUps/PR_COLLECT_DUE_BY_DEDUPE.md) |

### Template

```markdown
# PR: <short title>

## Summary
<1–3 sentences: what and why>

## Problem
| Symptom | Root cause |
|---------|------------|
| … | … |

## Changes
### <Area or path>
- …

## Test plan
- [ ] …

## Files touched
| Area | Path |
|------|------|
| … | … |
```

### Workflow

1. Create or update the write-up as the branch’s scope settles (don’t leave claims about UI/behavior that no longer match the tip).
2. Commit it with the feature commits on that branch.
3. When opening the PR (`gh pr create` or the GitHub UI), paste or adapt the write-up for **Summary** and **Test plan**.
4. If the PR grows after review, update the same file rather than starting a second write-up for the same topic.

Ensure `docs/PR_WriteUps` is **not** listed in `.gitignore` so write-ups are shared with the PR and review history.

---

## GitHub Actions

Packaged installers are unsupported. The former desktop packaging workflow has been removed; tags no longer produce Mac DMG or Windows NSIS artifacts. Use the local development commands above.

---

## Adding a new AI report type

1. Add a new route in `server/routes/reportRoutes.mjs` following the `app.post("/api/report/project", ...)` pattern — call `callLLMForReport({ systemPrompt, context, label })` (pass a human-readable `label` string so the info log reads correctly) and return `res.json({ report, label })`.
2. Add a client function in `src/services/jiraClient.js`.
3. Create a panel component (or extend an existing one) following the `ProjectReportPanel` pattern: `loading`, `report`, `error`, `copied` state; `Generate` → `Copy` → `Download` buttons. Use `runBackgroundJob()` if generation can take long and users may navigate away.
4. Wrap in `<CollapsibleSection>` on Task Management or Dashboard.
5. If the output should be available in Chat, call `saveChatSessionArtifact()` from `src/utils/chatSessionContext.js` after a successful generation (see existing report/plan panels).

---

More setup detail: [JIRA_SETUP.md](./JIRA_SETUP.md)
Non-technical usage: [END_USER_GUIDE.md](./END_USER_GUIDE.md).
App overview: [README.md](../README.md)
