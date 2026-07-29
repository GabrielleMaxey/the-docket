# PR: Dashboard — JQL epic completion, due-by fixes, contributor open-epic list

## Summary

Improves Dashboard project and contributor metrics for JQL-based presets: batched Jira parent/epic fetches, JQL **Epics complete** rollup on project cards, due-by list regressions fixed after epic grouping, and a per-person **Open epics with assigned tasks** list under Individual Contributor Metrics (not on project cards).

## Problem

| Symptom | Root cause |
|---------|------------|
| Dashboard refresh timing out | Parent/epic resolution fetched issues one key at a time |
| JQL presets had no epic-level completion | Metrics only rolled up tasks, not epics (MRD/IDD) |
| Past due / upcoming due lists empty after refactor | Epic grouping changed parent-chain and due-by merge behavior |
| Epic list on project cards confused users | Looked like contributor data; duplicated IC epic involvement |
| “Epics in scope” unclear | Vague label; showed complete epics; always expanded |

## Changes

### Performance — batch Jira fetches

- `shared/jiraBatch.mjs` — chunk issue-key batches (50)
- `server/lib/jiraSearchHelpers.mjs` — `fetchIssuesByKeys`, `loadIssuesIntoCache`
- Parent walks in due-by and epic context reuse batched fetches

### JQL project metrics

- `buildJqlEpicContext` — single context per JQL preset for breakdown + due-by
- `buildEpicBreakdownFromContext` — shared epic rollup helper (`dueByHelpers.mjs`)
- JQL project cards show **Epics complete** bar (rollup); full breakdown kept server-side for counts
- `epic_breakdown_json` on `dashboard_epic_metrics` for snapshot persistence

### Due-by regression fixes

- Legacy parent-chain fallbacks when issuetype missing from cache
- `loadIssuesIntoCache(..., replace: true)` for epic keys (fresh MRD/IDD)
- Strip child due-by rows only when epic-level replacements exist

### Contributor open-epic list (latest)

- **Removed** epic breakdown list from `EpicMetricCard` (project level)
- **Added** epic breakdown on person watches (`AssigneeMetricCard`) after contributor refresh
- `epic_breakdown_json` on `dashboard_assignee_metrics`
- UI: collapsed by default, count badge, **open epics only** (`epicPercent < 100`)
- Label: **Open epics with assigned tasks** (tooltip explains incomplete epics with assigned issues)

### UI / layout

- Project cards: contributors restored directly under dates (no epic list above them)
- `EpicBreakdownList` — collapsible toggle, open-epic filter, clearer title

## Test plan

- [ ] **Project refresh (JQL preset)** — card shows Tasks resolved, **Epics complete** bar, contributor rows; no epic list on project card
- [ ] **Contributor refresh (person watch)** — card shows workload, overdue/upcoming, then collapsed **Open epics with assigned tasks** with count
- [ ] Expand epic list — only incomplete epics (no MRD/IDD); per-epic task % and epic-done %
- [ ] **Due-by lists** — upcoming and past-due populated for JQL and epic presets after refresh
- [ ] **Overall rollup** — projects-complete / epics-complete copy correct for mixed JQL + epic presets
- [ ] `node --test tests/*.test.mjs` (90 tests)

## Files touched (dashboard epic set)

| Area | Path |
|------|------|
| Batch fetch | `shared/jiraBatch.mjs`, `server/lib/jiraSearchHelpers.mjs` |
| Epic context / breakdown | `server/lib/dashboardRefresh/dueByHelpers.mjs` |
| Project metrics | `server/lib/dashboardRefresh/buildEpicMetrics.mjs` |
| Contributor metrics | `server/lib/dashboardRefresh/buildAssigneeMetrics.mjs` |
| Persistence | `server/db/schema.mjs`, `persistSnapshot.mjs`, `dashboardRoutes.mjs` |
| UI | `EpicMetricCard.jsx`, `AssigneeMetricCard.jsx`, `EpicBreakdownList.jsx`, `dashboard.css` |
| Metrics | `shared/dashboardMetrics.mjs` |
| Tests | `tests/dashboardMetrics.test.mjs` |
