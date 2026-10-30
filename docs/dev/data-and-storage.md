# Data and storage

[← Developer Guide index](../DEVELOPER_GUIDE.md)

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

Configure the server URL/optional CA, export the migration environment, run `npm run team-db:migrate`, restart the API, then select **Settings → Team data → Use team DB**. The migration CLI does not load `.env`, and startup does not run migrations. See [setup](../JIRA_SETUP.md#optional-team-database-postgresql) and [database operations/recovery](../TEAM_DATABASE.md). Atlas/MongoDB and MySQL documents under `docs/specs/` describe historical designs, not the runtime. Old demo JSON imports require explicit source annotation and hostname mapping; there is no automatic external database migration.


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

[← Developer Guide index](../DEVELOPER_GUIDE.md)
