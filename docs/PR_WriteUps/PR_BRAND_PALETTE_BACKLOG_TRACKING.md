# PR: Brand palette rollout, backlog tracking, and unassigned drill-down fixes

## Summary

Retunes the app's status and priority color scales to the Lumen-derived brand palette and applies a consistent soft-depth restyle across Dashboard, Work Week, and Settings. Adds backlog tracking end-to-end (Overall Status tile/chips, per-project cards, Work Week metrics). Fixes a chain of bugs in the Dashboard → Work Week "Unassigned" drill-down that made it return zero or wrong results, plus a related quote-unsafe JQL parsing bug shared by the Dashboard's own metrics computation. Also includes a full-codebase comment cleanup pass and a documentation/privacy review (removed personal name, company name, and real internal project codenames from docs and examples where they weren't functionally required).

## Problem

| Symptom | Root cause |
|---------|------------|
| Pie/bar chart slice colors changed depending on issue sort order | `StatusPieChart.jsx` colored by array index instead of by status name |
| Clicking "Unassigned" on a Dashboard project card returned 0 results | Drill-down built `assignee = "Unassigned"` — a literal string match against a Jira user that doesn't exist |
| After the above fix, "Unassigned" returned results scoped to the whole `ODI` project instead of the clicked card's project | Drill-down didn't know which preset it was clicked from; fix threads `epicPresetId` through the click path and resolves the preset's real scope via a new endpoint |
| After *that* fix, the results table showed the correct count ("Loaded 36 of 36 matched") but rendered **zero rows** | `JiraResultsTable.jsx` seeds its own row filter from the URL's `?assignee=Unassigned`, but the filter dropdown's "Unassigned" option uses the sentinel `"__unassigned__"` — seeding it with the literal string filtered out every row |
| A preset whose own JQL text-searches for a phrase like `"purchase order by region"` could have its scope silently truncated mid-string | The `ORDER BY` clause was located with a plain regex that doesn't know about quoted string literals; matched a false positive inside the quote |
| Test suite intermittently showed 9 failures unrelated to any code change | `better-sqlite3` is a native module built per-runtime (system Node vs. Electron); running the desktop app before `npm test` left it built for the wrong ABI, and there was no `pretest` hook to rebuild it |
| Dashboard's per-project card and Overall Status tiles had no visibility into backlog volume | Not implemented — `getWorkloadStatusCounts` computed a `backlog` field but no UI consumed it consistently |

## Changes

### Brand palette & styling
- `src/utils/statusScale.js` (new) — single source of truth for status colors (four families: terminal/in-flight/inert/alarm), replacing duplicated color logic in `StatusPieChart.jsx` and `MetricBar.jsx`.
- `src/Pages/priorityScale.css` (new) — P1–P20 row tints and badge colors retuned toward the brand palette; documented as a protected "data encoding, do not retint" file.
- `src/Pages/dashboard.css`, `src/Components/collapsible.css`, `src/AppRouter.css`, `src/Pages/Settings/components/settingsSection.css` (new) — soft-depth restyle (gradient headers, layered shadows, hover lift) applied consistently across nav, collapsibles, Dashboard stat cards, and Settings sections.
- `src/Pages/workWeekTaskElements.css` — Work Week results table column widths rebalanced (wider Summary, narrower Due/MRD); row banding and hover states reworked to not collide with priority tints.

### Backlog tracking
- `src/Pages/Dashboard/components/OverallSummaryCard.jsx`, `src/Pages/Dashboard/index.jsx` — new "Tasks in backlog" stat tile plus issue/overdue/resolved/backlog count chips on the Overall Status row.
- `src/Pages/Dashboard/components/EpicMetricCard.jsx` — new Backlog progress bar on per-project cards (hidden when zero), and backlog count added to each card's summary line.
- `src/Pages/components/JqlRunMetrics.jsx` — backlog progress bar added to Work Week's My Metrics row.
- `src/Pages/Dashboard/components/ProjectContributorMetrics.jsx` — contributor pie charts centered; the always-100%-total row dropped from pie/bar legends.

### Unassigned drill-down fixes
- `server/lib/epicFilterJql.mjs`, `server/routes/appConfigRoutes.mjs` — new `GET /api/epic-presets/:id/scope-jql` endpoint resolves a preset's real scope JQL (epic-key, Jira filter, or hand-authored) via the same logic the Dashboard's own metrics already use, with the trailing `ORDER BY` stripped by a new quote-aware `splitTrailingOrderBy` helper.
- `src/services/jiraClient.js`, `src/utils/workWeekNavigation.js`, `src/Pages/Dashboard/components/EpicMetricCard.jsx`, `src/Pages/Dashboard/components/ProjectContributorMetrics.jsx`, `src/Pages/WorkWeekTasks.jsx`, `src/Pages/hooks/useTaskManagerJira.js`, `src/Pages/hooks/jiraJqlRunWorkflow.js` — `epicPresetId` threaded through the full click path (card → contributor row → URL → Work Week → drill-down fetch); unassigned drill-down now queries `assignee is EMPTY` scoped to the resolved preset JQL, falling back to `project = ODI` when no preset ID is available.
- `src/Pages/components/JiraResultsTable.jsx` — row filter seeding fixed to translate the URL's `"Unassigned"` into the sentinel `"__unassigned__"` the filter dropdown expects.
- `tests/epicFilterJql.test.mjs` — 8 new tests for `splitTrailingOrderBy`, including the quoted-phrase false-positive case and a real-shaped multi-clause preset JQL (fictional codename, not real project data).

### Test runner
- `package.json` — added `pretest: npm rebuild better-sqlite3` (cherry-picked from a sibling branch) so `npm test` is runtime-correct regardless of what ran before it.

### Comment cleanup
- Reviewed every comment across the full codebase (52 files, ~293 lines), not just this branch's own additions. Removed redundant/duplicated comments, fixed two comments that had gone stale relative to code they described, and trimmed several that were carrying more words than the information warranted. Comment-only change; no logic touched.

### Documentation & privacy review
- Fixed a pre-existing factual error (three docs said priority runs "P1–P10"; the real range is P1–P20).
- Removed personal name and company name from docs, code comments, and live UI copy where they were vanity/citation references rather than functional (left AI prompt strings, the hardcoded `ODI` project key, and the packaging `appId` untouched — those shape real behavior).
- Removed real internal project codenames and a named individual from `docs/examples/` — deleted two examples that couldn't be meaningfully de-identified without fabricating new content (`helpMePlan.md`, a screenshot with text baked into the image), de-identified a third that could be (`Executive_Summary_2026-06-23.md`).
- `presets/pilot-presets.json` and `docs/pilot-presets.md` were restored after an initial removal, per follow-up direction — kept as-is. **Note:** the restored "Dev Team" preset's JQL contains real Atlassian account IDs for actual team members; flagged in the restoration commit as worth a deliberate look if this repo's visibility ever changes, but intentionally not restated here.

## Test plan

- [ ] **Status/priority colors** — spot-check a pie chart, bar chart, and Work Week priority column; colors should be stable regardless of issue sort order.
- [ ] **Backlog tiles** — Dashboard Overall Status shows a backlog tile and chip; a project card with backlog issues shows the Backlog progress bar; Work Week My Metrics shows a backlog bar.
- [ ] **Unassigned drill-down** — from a Dashboard project card, click "Unassigned." Work Week should open scoped to that project's unassigned issues (not project-wide), with rows actually rendering (not just a correct "Loaded N of N" count).
- [ ] **Two different projects' Unassigned** — clicking "Unassigned" from two different project cards should open two separate tabs, not collide into one.
- [ ] **Quoted JQL text search** — a preset with `summary ~ "..."` containing the words "order by" should not have its scope truncated (covered by automated tests below).
- [ ] `npm test` — 146 tests, all passing (`pretest` rebuilds `better-sqlite3` automatically).
- [ ] `npm run build` — production build succeeds.

## Files touched

| Area | Path |
|------|------|
| New color scale | `src/utils/statusScale.js`, `src/Pages/priorityScale.css` |
| Styling | `src/Pages/dashboard.css`, `src/Components/collapsible.css`, `src/AppRouter.css`, `src/Pages/workWeekTaskElements.css`, `src/Pages/Settings/components/settingsSection.css` |
| Backlog UI | `src/Pages/Dashboard/components/{OverallSummaryCard,EpicMetricCard,MetricBar,ProjectContributorMetrics}.jsx`, `src/Pages/Dashboard/index.jsx`, `src/Pages/components/JqlRunMetrics.jsx` |
| Drill-down (server) | `server/lib/epicFilterJql.mjs`, `server/routes/appConfigRoutes.mjs` |
| Drill-down (client) | `src/services/jiraClient.js`, `src/utils/workWeekNavigation.js`, `src/Pages/WorkWeekTasks.jsx`, `src/Pages/hooks/{useTaskManagerJira,jiraJqlRunWorkflow}.js`, `src/Pages/components/JiraResultsTable.jsx` |
| Tests | `tests/epicFilterJql.test.mjs`, `tests/dashboardMetrics.test.mjs` |
| Test runner | `package.json` |
| Docs | `README.md`, `docs/{DEVELOPER_GUIDE,END_USER_GUIDE,JIRA_SETUP,pilot-presets}.md`, `docs/canvases/task-manager-docs.canvas.tsx`, `docs/examples/Executive_Summary_2026-06-23.md` |
