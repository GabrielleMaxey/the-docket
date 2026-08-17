# PR: Project Managers review fixes and comment cleanup

## Summary

Follow-up on #59: fix capacity-planning accuracy (open counts, totals, overdue dates, blocked drill-down), stop hiding new Settings entries, and trim verbose comments. Adds a per-entry due/overdue date basis so mixed teams can count overdue work from task dates, epic done dates, or either.

## Problem

| Symptom | Root cause |
|---------|------------|
| Open count silently stopped at 500 | Search treated hitting the cap as complete |
| Lightly loaded people disappeared from totals | One mixed `assignee in (...)` search filled the cap |
| Overdue ignored IDD/MRD / mixed-team date rules | Capacity used raw `duedate` only |
| Epic watches saved as `parent = KEY` | Add/Update/Quick pick did not resolve preset scope JQL |
| New Contributor Metrics rows hidden on PM page | Selection did not union newly added ids |
| Failed entry list looked like “no entries yet” | No distinct error state |
| Blocked/On Hold click did not match the badge | Click used literal statuses; badge used a regex |
| WGA Epic JQL 400 | `issue type IN` is invalid; Jira wants `issuetype` |
| Review comments were essays | Restated the code instead of gotchas |

## Changes

- Page open-issue search and mark `openCountIncomplete` when Jira still has another page.
- Count totals per assignee so a busy person cannot hide others.
- Persist `overdue_date_basis` (`task_due` / `epic_done` / `either`) on Contributor Metrics; capacity overdue + drill-down follow that basis.
- Resolve epic presets through `/api/epic-presets/:id/scope-jql` on Add/Update/Quick pick.
- Reconcile PM chip selection so new Settings entries appear without restoring a clear-all.
- Blocked/On Hold drill-down uses `key in (...)` of counted issues.
- Fix `issuetype` in pilot WGA preset JQL.
- Label reporter watches as Reporter, not Custom query; capacity copy points at the Project Managers page.
- Trim comments to short gotchas only.

## Test plan

- [ ] Restart API so `overdue_date_basis` exists, then set an ODI watch to **Epic done dates** and a task-dated team to **Task due date**; confirm overdue counts and drill-downs.
- [ ] Add a new Contributor Metrics entry; it should appear selected on Project Managers without restoring previously cleared chips.
- [ ] Click Blocked/On Hold; results should match the badge (including On Hold variants).
- [ ] Confirm open counts can show `500+` when truncated, and lightly loaded people still have a total.
- [ ] Quick pick / Update an epic preset; saved JQL should match the project tab, not `parent = KEY`.
- [ ] `node --test tests/capacityPlanning.test.mjs tests/pmEntrySelection.test.mjs tests/jiraSearchHelpers.test.mjs`

## Files touched

| Area | Path |
|------|------|
| Capacity fetch | `server/lib/capacityPlanning.mjs` |
| Schema / API | `server/db/schema.mjs`, `server/routes/appConfigRoutes.mjs` |
| Date basis | `shared/overdueDateBasis.mjs` |
| PM UI | `src/Pages/ProjectManagers.jsx`, `src/Pages/pmEntrySelection.js` |
| Settings | `src/Pages/Settings/components/MetricTargetsSection.jsx` |
| Tests | `tests/capacityPlanning.test.mjs`, `tests/pmEntrySelection.test.mjs` |
