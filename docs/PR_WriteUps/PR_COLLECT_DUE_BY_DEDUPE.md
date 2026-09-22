# PR: Dedupe due-by issues across presets

## Summary

De-duplicates dashboard due-by issues by Jira key when merging across epic/JQL presets so the same issue does not appear twice in due lists and banners.

## Problem

| Symptom | Root cause |
|---------|------------|
| Same issue shown twice in overdue/upcoming due lists | `collectDueByIssues` flatMapped every preset’s `dueByIssues` without de-duping overlapping matches |

## Changes

- `server/lib/dashboardRefresh/collectDueByIssues.mjs` — `dedupeByKey` before sort/cap
- `tests/collectDueByIssues.test.mjs` — coverage for empty date, de-dupe, first-wins

## Test plan

- [ ] Overlapping epic + JQL presets that share an issue key → due-by list shows the key once
- [ ] Overdue still sorts ahead of upcoming
- [ ] `node --test tests/collectDueByIssues.test.mjs` passes

## Files touched

| Path | Change |
|------|--------|
| `server/lib/dashboardRefresh/collectDueByIssues.mjs` | De-dupe by key |
| `tests/collectDueByIssues.test.mjs` | New tests |
