# PR: Fix Pull most recent Jira comment into Notes

## Summary

Makes **Pull most recent Jira comment** populate the Notes field for team-program JQL slots (and Load remaining), and hardens comment text extraction so mentions and failed `orderBy` responses still resolve.

## Problem

| Symptom | Root cause |
|---------|------------|
| Notes stay empty / unchanged when “Pull most recent Jira comment” is on | Comment fetch only ran for **local** JQL slots; issues under a **shared program / team** slot were skipped |
| Load remaining on a team run never filled notes | Early `return` after team priority/dates skipped the comment pull |
| Mention-only (or similar) ADF comments produced blank notes | `adfToPlainText` only walked `text` nodes |
| Some tenants rejecting `orderBy=-created` returned no text silently | No fallback to last-page `startAt` fetch |

## Changes

- Shared `applyLatestCommentNotes` used for local **and** team keys on Run JQL, and for team Load remaining before the early return
- ADF: mention / emoji / card / hardBreak extraction
- Comment API: fallback to last page when `orderBy=-created` fails
- Note lookups tolerate key case differences
- Unit tests in `tests/jiraCommentText.test.mjs`

## Test plan

- [ ] Task Management: enable **Pull most recent Jira comment**, Run JQL on a **normal** slot → Notes show latest comment text
- [ ] Same with a **team / shared program** JQL slot → Notes populate (this was broken)
- [ ] Load remaining on a team run with the option on → Notes update
- [ ] Issue whose latest comment is mostly an @mention still gets readable note text
- [ ] `node --test tests/jiraCommentText.test.mjs` passes

## Files touched

| Path | Change |
|------|--------|
| `src/Pages/hooks/jiraJqlRunWorkflow.js` | Apply comment pull to team slots + load remaining |
| `server/lib/jiraCommentText.mjs` | ADF hardening + orderBy fallback |
| `src/Pages/components/JiraResultsTable.jsx` | Case-tolerant note lookup |
| `tests/jiraCommentText.test.mjs` | Unit tests |
