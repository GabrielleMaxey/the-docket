# PR: Linked task notes on Task Management rows

## Summary

When a Task Management Jira result has issue links (blocks, relates to, duplicates, etc.), show a read-only note with a browse hyperlink — a short hint on the compact row and the full list when expanded. Links are never written into the Notes field.

## Problem

| Symptom | Root cause |
|---------|------------|
| Blockers / related issues are invisible in Task Management | JQL search fields omitted `issuelinks`, and the results table had no UI for them |
| Users open Jira just to see why a task is blocked | No in-app surface for link type + linked key |

## Changes

- **Search fields** — `issuelinks` added to `BASE_SEARCH_FIELDS` so every Task Management / JQL search payload includes links.
- **Parse helper** — `parseIssueLinks` in `jiraResultsTableUtils.js` maps inward/outward links to `{ linkType, linkedKey }` (all link types; same-project included).
- **Compact row** — under the summary clamp: first link as `{linkType} {key}` with browse URL; `+N more` when multiple.
- **Expanded detail** — full list under the detail panel, each line hyperlinked via existing `getIssueBrowseUrl`.
- **CSS** — muted compact/expanded link styles in `workWeekTaskElements.css`.

## Test plan

- [ ] Run JQL that returns an issue with a Blocks link (e.g. ODI-24798) → compact row shows `is blocked by ODI-24788` with a working browse link
- [ ] Expand that row → full link list appears below the detail table with working hyperlinks
- [ ] Issue with multiple links → compact shows first + `+N more`; expanded lists all
- [ ] Issue with no links → no extra UI
- [ ] Notes field / Push note behavior unchanged (links are display-only)

## Files touched

| Path | Change |
|------|--------|
| `server/lib/jiraSearchFields.mjs` | Include `issuelinks` in base search fields |
| `src/Pages/components/jiraResultsTableUtils.js` | `parseIssueLinks` |
| `src/Pages/components/JiraResultsTable.jsx` | Compact hint + expanded list |
| `src/Pages/workWeekTaskElements.css` | Link note styles |
| `docs/PR_WriteUps/PR_ISSUE_LINK_ROW_NOTES.md` | This write-up |
