# PR: PM Asks → Create Task + Create Issue Markdown

## Summary

Project Managers **Asks** can be marked **Done** or **Canceled** (greyed out), reopened, and linked to ODI when a Jira key is stored. **Create a task** hands off to Task Management **Create Issue** with ask title/note prefilled, then marks the ask done with the new issue key on successful create. Create Issue now converts description **Markdown** to rich Jira ADF (same subset as notes), shows a live **Write-up preview**, requires an **AI attachment preference** when files + AI helper are both on, and supports **Use .md as description** from the attachment picker.

## Problem

| Symptom | Root cause |
|---------|------------|
| PM asks had no lifecycle beyond edit/delete | `pm_asks` stored only title/who/note; no status or Jira link |
| No path from an ask to a tracked Jira task | Create Issue lived only on Work Week; no prefill or post-create ask update |
| Create Issue descriptions looked flat in Jira | `descriptionTextToAdf` treated body as plain text, not note-style Markdown |
| AI helper + attachments was ambiguous | Prompt had no explicit rule for referencing file names vs attachments-only |
| Hard to preview description before create | No in-modal preview aligned with ADF conversion |
| `.md` files could attach but not seed the write-up | No action to load file text into the description field |

## Changes

- **Ask status model** — `pm_asks.status` (`open` \| `done` \| `canceled`) and `jira_issue_key` via schema `ensureColumn`; `shared/pmAskStatus.mjs` for normalize/closed helpers; API and `jiraClient` PUT/list include `status` / `jiraIssueKey`.
- **Asks row UX** — Open rows: Edit, Delete, **Create a task**, **Done**, **Cancel**. Closed rows: grey styling, Done/Canceled badge, **Reopen**, Delete; ODI browse link when `jiraIssueKey` is set (`jiraBaseUrl` from health). Sort open first; CSV includes status and Jira key.
- **Create-a-task handoff** — `sessionStorage` payload via `pmAskCreateIssueHandoff.js`; navigate to `/work-week`; `WorkWeekTasks` consumes handoff, opens Create Issue with prefill and `sourceAskId`; on successful create, `updatePmAsk({ status: "done", jiraIssueKey })` (soft warning if ask update fails).
- **Markdown ADF on create** — `shared/jiraDescriptionAdf.mjs` delegates to `markdownTextToAdfNodes`; ODI standards still validate the source Markdown string.
- **Write-up preview** — Live preview under the description textarea using the same Markdown subset as ADF.
- **AI attachment preference** — Required radio when attachments + AI helper: **Reference in description** vs **Attachments only** (default); passed through AI Draft request and server prompt instructions (file names only, no bytes).
- **Use .md as description** — Button when `.md` files are selected; loads first `.md` into description (confirm if replacing non-empty text); file can remain in attachment list for upload after create.

## Test plan

- [ ] Open ask → **Create a task** → Work Week opens Create Issue with summary = title and note in description/context → create issue → ask greys out, status Done, ODI key link works
- [ ] **Done** / **Cancel** on open ask → grey + badge; **Reopen** restores open actions; key preserved on reopen unless cleared explicitly
- [ ] Manual Done without create → grey, no link
- [ ] Attachments + AI helper → radio visible; default attachments-only; draft respects preference
- [ ] Description with `**bold**`, lists, headings → preview matches; issue description in Jira shows rich formatting
- [ ] Select `.md` → **Use .md as description** → description and preview update; create still uploads attachment if kept
- [ ] `node --test tests/pmAsksStatus.test.mjs tests/jiraDescriptionAdf.test.mjs tests/markdownToAdf.test.mjs` — all pass

## Files touched

| Path | Change |
|------|--------|
| `shared/pmAskStatus.mjs` | Status enum + normalize/closed helpers |
| `tests/pmAsksStatus.test.mjs` | Status unit tests |
| `server/db/schema.mjs` | `status`, `jira_issue_key` columns on `pm_asks` |
| `server/routes/pmAsksRoutes.mjs` | CRUD fields, validation |
| `src/services/jiraClient.js` | Client payloads; AI Draft `attachmentPreference` |
| `src/utils/pmAskCreateIssueHandoff.js` | sessionStorage handoff read/write/clear |
| `src/Pages/ProjectManagers.jsx` | Asks actions, grey/ODI link, sort, CSV |
| `src/Pages/projectManagers.css` | Closed ask styling |
| `src/Pages/WorkWeekTasks.jsx` | Consume handoff, modal wiring, post-create ask update |
| `src/Pages/components/CreateIssueModal.jsx` | Prefill, preview, AI radio, Use .md, ask callback |
| `shared/jiraDescriptionAdf.mjs` | Markdown → ADF via `markdownToAdf` |
| `tests/jiraDescriptionAdf.test.mjs` | Rich markdown ADF tests |
| `server/lib/aiInstructions.mjs` | Attachment preference in AI Draft prompts |
| `server/routes/jiraIssueRoutes.mjs` | Pass preference into generate-description |
| `docs/DEVELOPER_GUIDE.md` | jiraDescriptionAdf described as Markdown ADF |
