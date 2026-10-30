# Jira fields and API routes

[← Developer Guide index](../DEVELOPER_GUIDE.md)

## Key Jira custom fields

| Field | Custom field ID |
|-------|----------------|
| Initial Done Date | `customfield_10008` |
| Most Recent Done Date | `customfield_10009` |

These are mapped in Settings → Jira field mapping and synced via `POST /api/jira/field-mappings/sync`. Fallback IDs live in `shared/odiFieldIds.mjs`.

---


## API routes reference

All routes mounted by `server/jiraProxy.mjs`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Jira connection check + base URL |
| GET | `/api/jira/myself` | Current user info |
| GET | `/api/jira/fields` | All Jira fields |
| GET/POST | `/api/jira/search` | JQL search (POST body or GET query). Optional `includeDescription: true` adds plain-text descriptions (≤500 chars) for the duplicate check |
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

[← Developer Guide index](../DEVELOPER_GUIDE.md)
