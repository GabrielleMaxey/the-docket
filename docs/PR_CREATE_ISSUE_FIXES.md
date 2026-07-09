# PR: Create Issue — parent linking, subtasks, validation UX

## Summary

Fixes Create Issue failures and orphaned story sub-tasks, and improves validation UX for Story/Task creation. Sub-tasks created from Story flow are now **Task** issues with `parent` set to the new story, matching ODI’s Task → Story → Epic parent-chain model.

## Problem

| Symptom | Root cause |
|---------|------------|
| `customfield_10018` / `parentId: Please select valid parent issue` on Task/sub-task create | Story-backed work used Portfolio Parent Link instead of `fields.parent` |
| `components: Component name '…' is not valid` | Free-text component names sent to Jira; ODI only accepts registered project components |
| Story sub-tasks orphaned (no parent chain) | Create payload forced Jira **Sub-task** issuetype; ODI chains expect **Task** + `parent` |
| Description/goal errors at top of modal | Single `error` banner for all validation messages |
| No assignee on story sub-tasks | Sub-task create hardcoded `assignee: ""`; Story flow hid assignee field |

## Changes

### Server — `server/lib/jiraCreateIssueFields.mjs`

- **`applyParentLinkFields`** — Story-backed tasks/sub-tasks set `fields.parent = { key }`; Epic Link preferred for Story/Bug under Epic; Parent Link (`customfield_10018`) not used for story parents.
- **`resolveIssueTypeMeta`** — ODI story-backed work uses **Task** issuetype when Task createmeta supports `parent`; Sub-task only as fallback.
- **`loadProjectComponents` / `applyNamedFieldValue`** — Validate Components against `/rest/api/3/project/{key}/components` before Jira create; clear pre-API error for unknown names.

### Client — `src/Pages/components/CreateIssueModal.jsx`

- **`descriptionError`** — Description, goal, and “story not fully defined” errors render below the Description field.
- **Subtask assignee** — Optional **Subtask assignee** when AI suggests sub-tasks; applied to all checked sub-tasks; story stays unassigned.
- **Components hint** — “Components must already exist in the Jira project.”

### Tests — `tests/jiraCreateIssueFields.test.mjs`

- Story-backed Task parent linking
- Epic Link preferred over parent for Stories
- Task issuetype kept for ODI subtasks
- Component rejection / acceptance

### Docs

- `docs/END_USER_GUIDE.md` — Create Issue section + troubleshooting
- `docs/DEVELOPER_GUIDE.md` — Parent/issue-type table, component validation, modal UX
- `README.md` — Create Issue bullet

## Test plan

- [ ] **Story + subtasks** — AI Draft → check sub-tasks → optional subtask assignee → Create. Each sub-task is Task type, parent = story, visible in JQL preset parent chain (Task → Story → Epic).
- [ ] **Task under Story** — Standalone Task with valid component (e.g. `WGA-DEV`) succeeds.
- [ ] **Invalid component** — Custom name rejected in-app before Jira 400.
- [ ] **Story not fully defined** — Submit without answering clarification → error below Description, not top banner.
- [ ] **Resubmit after error** — Fix parent/title/description → Create re-enables without closing modal.
- [ ] **Epic (Feature) parent** — Bug/Story under `Epic (Feature)` still validates.
- [ ] **JQL preset parents** — Query issue selection and manual parent key still resolve correctly.
- [ ] `node --test tests/jiraCreateIssueFields.test.mjs tests/jiraParentCandidates.test.mjs tests/odiIssueStandards.test.mjs tests/createIssueParentUtils.test.mjs`

## Files touched (this fix set)

| Area | Path |
|------|------|
| Create payload | `server/lib/jiraCreateIssueFields.mjs` |
| Create route | `server/routes/jiraIssueRoutes.mjs` |
| Modal | `src/Pages/components/CreateIssueModal.jsx` |
| Tests | `tests/jiraCreateIssueFields.test.mjs` |
| Docs | `docs/END_USER_GUIDE.md`, `docs/DEVELOPER_GUIDE.md`, `README.md` |
