# Dashboard refresh pipeline

[← Developer Guide index](../DEVELOPER_GUIDE.md)

`POST /api/dashboard/refresh` → `server/lib/dashboardRefresh/runDashboardRefresh.mjs`:

1. **`parseRefreshInput.mjs`** — validates preset IDs, `dueByDate`, `dueByField`, `includePastDue`, `pastDueLookbackYears` (1/2/3 only)
2. **`buildRefreshContext.mjs`** — resolves field IDs, `dueByCompareFieldId`, `pastDueFloor`, and `dueByOptions` (including `epicIssue` when computing per-epic child metrics)
3. **`buildEpicMetrics.mjs`** — Jira search per preset; `computeChildIssueMetrics` + `buildEpicLevelDueByIssues` for due-date lists; per-epic `contributorMetrics` stay scoped to that preset’s issues
4. **`buildAssigneeMetrics.mjs`** — the **Individual contributors** tab's "Layered in" panel: **person** watches run `assignee = "…"` JQL (full assignee workload); **JQL** watches use the saved query without intersecting preset scope. This is a separate Jira round-trip from step 3, which is why it needs its own **Refresh contributors** click rather than riding the main snapshot refresh
5. **`collectDueByIssues.mjs`** — merges epic-level due-by rows into snapshot flat list (capped at 200)
6. **`persistSnapshot.mjs`** — writes `dashboard_snapshots` and related metric rows

**Client-side rollup:** the **Individual contributors** tab's "From your selected projects" panel does *not* call `buildAssigneeMetrics.mjs` — it's `rollupEpicContributorPeople()` in `dashboardMetricsUtils.js`, summing the per-epic `contributorMetrics` from step 3 (already in the snapshot) across whichever presets are selected. No extra request, no separate refresh; it's stale only when the main snapshot is. `IndividualContributorsPanel.jsx` renders both panels side by side; `ContributorStatusBar.jsx` renders each auto-derived row.

## Due-date resolution (`shared/dashboardMetrics.mjs`)

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

## Work Week Dates column (`src/utils/jiraIssueDoneDates.js`)

`JiraResultsTable` stacks three date fields into one **Dates** column per row — **Due**, **MRD**, and **Start** — rather than separate columns. Due and MRD are editable `<input type="date">` fields with their own **Update** button each, pushing straight to Jira via `POST /api/jira/issues/:issueKey/date-field` (`handleDueDateUpdate` / `handleMrdUpdate` in `useTaskManagerJira.js`). Actual/planned dates use the selected Local or Team destination — see [team metadata](data-and-storage.md#optional-postgresql-team-metadata).

After each **Run JQL**, `enrichRunWithParentDoneDates` (in `jiraJqlRunWorkflow.js`) attaches `mrdFieldId` and `parentMostRecentDoneDateByKey` to each run. Restored runs from `localStorage` are re-enriched when field mappings finish loading (`useTaskManagerJira.js`).

Display logic in `getMostRecentDoneDateForIssue`:

1. **Issue’s own MRD** (`most_recent_done_date` mapping) when set
2. **`parentMostRecentDoneDateByKey[parentKey]`** when the task has no MRD

`buildParentMostRecentDoneDateMap` fetches missing parents from Jira and walks up to **five** ancestor levels (Story → Epic, etc.) until an MRD is found. When a row's own Due/MRD field is empty, the Dates column shows a small "from MRD: …" / "from parent: …" hint below that field with the inherited value used for overdue calculations elsewhere in the app — editing the field writes only the issue's own value, it does not change the inheritance.

## Task Management JQL — full result loading

`POST /api/jira/search/all` (`server/lib/jiraSearchHelpers.mjs` → `searchAllIssues`) paginates with Jira `nextPageToken` until all matches are loaded or `maxTotal` is reached (cap **5000**). Work Week **Run JQL** calls `fetchJiraSearchAll` per slot (`jiraJqlRunWorkflow.js`). Each run stores `total`, `loaded`, and `loadComplete`; the UI shows **Load remaining** when incomplete. `persistJqlRunsToStorage()` writes results when a run finishes so navigation mid-JQL does not lose the table.

## Task Management notes from Jira comments

On each **Run JQL** (and **Load remaining**), when **Pull most recent Jira comment** is off, local SQLite notes merge into row Notes as before. When it is on (`pullLatestComment` in `workWeekTasksJiraPreferences`), `fetchLatestJiraCommentsBulk` overwrites Notes from Jira and skips local note merge for those keys.

Priority is **not** read from comment text. When Team is enabled and ready, shared-program slots load priority via `fetchTeamPriorityBulk` / `applyTeamPriorityState` in `jiraJqlRunWorkflow.js`. `PriorityCell` shows a **Team** badge when `prioritySourceByKey[issueKey].source === "team-db"`.

## Assignee updates (Jira user search)

`GET /api/jira/users/search?query=…` → `searchJiraUsers` / `pickBestJiraUser` in `server/lib/jiraSearchHelpers.mjs`. Resolves display names, emails, and usernames for `POST /api/jira/issues/:issueKey/assignee`. UI: `AssigneeCell.jsx` debounces suggestions; Enter or **Update Assignee** commits.

## Dashboard → Task Management drill-down

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

## Epic preset team pack

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/epic-presets/export` | JSON pack (`version`, `exportedAt`, `presets[]`) |
| POST | `/api/epic-presets/import` | Body: `{ presets, mode: "merge" \| "replace" }` — fingerprint dedupes on merge |

Settings UI: **Export team pack** / **Import team pack**. Align with `npm run seed:presets` for admin seeding — see [preset setup](../JIRA_SETUP.md#5-set-up-presets-required-for-metrics--chat).

## Create Issue (`CreateIssueModal.jsx` + `jiraIssueRoutes.mjs`)

Task Management **Create Issue** creates Story, Task, or Bug issues in your Jira project with client and server validation against `shared/odiIssueStandards.mjs`. The ODI issue rules (Story, Task and Bug fields, priorities, unassigned Stories) come from the **Jira Standards** page (ODI Project Space Standards) in the ODI Confluence space, not from the ATS toolkit; those standards reference the Mountain Goat Software story-building method.

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

**Duplicate check (before Create / AI Draft)** (approach from the [ATS AI Toolkit](https://github.com/LumenTech-Prod/service-assurance-ip-ats-agents-specs-prompts)): `runDuplicateCheck` in `CreateIssueModal.jsx` builds search text from the title (without its `[label]`) or, with the AI helper on, the "I want" intake answer. `shared/duplicateCandidates.mjs` turns it into JQL — `project = "KEY" AND statusCategory != Done AND (summary ~ "w" OR description ~ "w" …)`, with description terms limited to the 8 most specific words — and ranks the results locally (`rankDuplicateCandidates`, light stemming, threshold scaled to word count, top 5, `matchedIn` = summary | description). The search is `POST /api/jira/search` with `includeDescription: true`; `server/lib/jiraSearchDescription.mjs` (`withDescriptionField`, `withPlainDescriptions`) adds the field and converts ADF to plain text capped at `DESCRIPTION_CHECK_CHARS` (500). The check fails open: a search error never blocks create. `duplicateAckRef` remembers text the user chose to continue with so it is not asked twice.

**Title format:** `shared/issueTitle.mjs` — `extractTitleLabel`, `formatPrefixedTitle`, `stripTitleLabel`, `isLabelPrefixedTitle`. After AI Draft the modal formats the title as `[label] short ask`, taking `[label]` from the parent's title; the Story prompt asks for a short ask (under 12 words, no brackets). `validateOdiIssueCreate` accepts either a job story or a `[label] ask` title.

**Components:** `loadProjectComponents` fetches `/rest/api/3/project/{key}/components`; unknown component names are rejected before the Jira API call.

**Modal validation UX:** `descriptionError` state shows description/goal/clarification failures below the Description textarea; other errors stay in the top banner. `canSubmit` vs `canEditIssueFields` allows resubmit after fixing validation errors.

**Issue type matching:** Your Jira project may use variant names such as `Epic (Feature)` and `Story (User Story)`. `matchesIssueTypeFamily` in `shared/dashboardMetrics.mjs` treats these as epic/story for parent validation — not only the literal names `Epic` / `Story`.

## Past Reports archive

`server/lib/reportArchive.mjs` — `REPORT_SOURCES` (`work_week`, `dashboard`, `adhoc`), `insertGeneratedReport`, `listGeneratedReports`, `getGeneratedReportById`. Tab filters use `report_type` sets (Work Week: project report + week plan; Dashboard: `dashboard_report`; Ad-hoc: `chat_response` or `source=adhoc`). Report saves pass `savedAtLocal` / `savedTimeZone` from the browser (`src/utils/localTimestamp.js`) so archived rows are created under the user's local timestamp; the timezone is also kept in `meta_json` when provided.

UI: `ReportArchive.jsx` — tabs in order Task Management, Combined Work, Metrics, Ad-hoc, Files, Completed To Dos; list + `ReportOutput` viewer. Dashboard archived items may include `meta.statusCounts` / `chartVariant` for chart replay.

## On-page report clear (not archive delete)

`src/utils/pageReportPersistence.js` — loads/saves Metrics report, Task Management project reports (per run key), and week plan to `localStorage`. **Clear report** calls `clearDashboardReportState`, `clearWorkWeekProjectReport`, or `clearWeekPlanReportOnly` — removes on-page display only; `generated_reports` rows are untouched.

`ReportOutput.jsx` accepts optional `onClear` for the header button.

## Weekly digest

`GET /api/reports/weekly-digest` (`server/lib/weeklyDigest.mjs`) builds markdown from the latest `dashboard_snapshots` row (overdue/upcoming, contributors, rollup). No LLM. UI: `WeeklyDigestPanel.jsx` under Dashboard → Generate Report.

## Dashboard UI section toggles

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

[← Developer Guide index](../DEVELOPER_GUIDE.md)
