# PM Asks → Create Task + Create Issue Markdown (design)

**Date:** 2026-10-09  
**Status:** Approved for planning (pending user review of this file)  
**Scope:** Project Managers → Asks row actions; Create Issue AI attachment preference; Markdown→ADF + preview; use `.md` attachment as description  
**Related:** `ProjectManagers.jsx` AsksPanel; `CreateIssueModal.jsx`; `WorkWeekTasks.jsx`; `pm_asks` schema; `shared/markdownToAdf.mjs`; `shared/jiraDescriptionAdf.mjs`

---

## Goal

1. From an Ask, start Task Management’s existing **Create Issue** flow, prefill from the ask, mark the ask done when a Jira issue is created, and show an ODI browse link.
2. Let PMs manually mark asks **Done** or **Canceled** (greyed out), with **Reopen**.
3. When Create Issue has files + AI helper, require an explicit choice: reference files in the write-up vs attachments only.
4. Render description Markdown correctly in Jira (rich ADF) and show a live write-up preview; support **Use .md file as description**.

## Decisions

| Topic | Choice |
|--------|--------|
| Create entry point | Per-ask row button next to Edit / Delete |
| Navigation | Approach 1: `sessionStorage` handoff → navigate `/work-week` → open Create Issue |
| Prefill | Ask title → summary; ask note → description/context starter |
| After successful create | Ask `status = done` + store `jira_issue_key` |
| Manual close | **Done** and **Canceled** both grey out the row |
| ODI link | When `jira_issue_key` set, link `{jiraBaseUrl}/browse/{key}`; keep key on Reopen |
| AI + files | Option A: required radio when attachments selected and AI helper on |
| AI + files default | Attachments only |
| Description → Jira | Reuse note-style `markdownTextToAdfNodes` (not limited `descriptionTextToAdf`) |
| Preview | Live Markdown preview under description textarea (`SimpleMarkdown` / shared subset) |
| `.md` as body | In-scope: action to load first selected `.md` file text into description (still can attach) |

## Non-goals

- Embedding a second Create Issue modal on the Project Managers page
- Sending image/file binaries to the LLM (names + preference only)
- Full CommonMark / GFM (tables, nested lists beyond current note converter)
- Auto-deleting asks
- Syncing Asks across machines / Jira (asks remain local SQLite)

---

## 1. Asks data model

**Table `pm_asks` — new columns** (via `ensureColumn`):

| Column | Type | Default | Notes |
|--------|------|---------|--------|
| `status` | TEXT | `'open'` | `open` \| `done` \| `canceled` |
| `jira_issue_key` | TEXT | `''` | Set when created via Create Issue; optional otherwise |

**API:** Extend list/create/update responses and PUT body to accept `status` and optionally `jiraIssueKey`. Validate status enum.

**Client:** `updatePmAsk` already PUTs fields; add status / jiraIssueKey.

---

## 2. Asks row UX

**Open rows:** Edit · Delete · **Create a task** · **Done** · **Cancel**

**Done / canceled rows:**
- Greyed out (muted opacity / color)
- Badge: “Done” or “Canceled”
- If `jira_issue_key`: clickable ODI key link (from `/api/health` `jiraBaseUrl`)
- Actions: **Reopen** · Delete (no Create a task)
- Manual Done without a key: grey, no link

**Sort:** Open first, then done/canceled (stable by id within group).

**CSV:** Include Status and Jira key columns.

---

## 3. Create-a-task handoff

**Storage key:** e.g. `pmAskCreateIssueHandoff` in `sessionStorage`.

**Payload:** `{ askId, title, note, createdAt }`

**Flow:**
1. User clicks **Create a task** on an open ask.
2. Write handoff; `navigate("/work-week")` (hash router).
3. `WorkWeekTasks` on mount / location effect: if handoff present, open Create Issue, apply prefill, clear handoff after consume (or after successful create — prefer clear after apply to avoid re-open loops; keep `askId` in modal props/state until create succeeds).
4. On successful create: `updatePmAsk({ id: askId, status: "done", jiraIssueKey: createdKey })`. If update fails, still show created issue; surface a soft warning that the ask was not marked done.

**Prefill:** `summary` = ask title; if note non-empty, seed `description` (or context) with the note so AI helper / manual edit can build on it.

---

## 4. Create Issue — AI helper + attachments

**Show when:** `attachments.length > 0` && `useAiHelper`.

**Control:** Required radio group:
- `referenceInDescription` — “Reference in description”
- `attachmentsOnly` — “Attachments only” (**default**)

**AI Draft:** Include file names + preference in the generate-description request / prompt block. Do not upload file bytes to the model. Files still upload after issue create (unchanged).

**Gate:** If files + AI helper and preference unset (shouldn’t happen with default), block AI Draft.

---

## 5. Markdown → Jira ADF + preview

**Create path:** Replace (or internally delegate) `descriptionTextToAdf` usage on create with the richer markdown converter used for notes (`markdownTextToAdfNodes` wrapped as ADF doc). Keep ODI standards validation on the **source Markdown string**.

**Preview:** When description is non-empty, show **Write-up preview** under the textarea; live update; same subset as ADF (bold, italic, code, links, headings, lists). Reuse `SimpleMarkdown` where it already matches; extend only if ADF supports something preview lacks.

**AI Draft:** Continue to emit Markdown in that subset so preview and Jira stay aligned.

---

## 6. Use .md file as description

**UI:** Near Attachment picker, when one or more selected files have `.md` / `text/markdown`:
- Button: **Use .md as description**
- If multiple `.md` files: use the first, or a small select — **v1: first `.md` in the picker list**
- Confirm if description already non-empty (“Replace description with file contents?”)

**Behavior:**
1. `FileReader` / `text()` load UTF-8 contents into `description`.
2. Preview updates immediately.
3. File **remains** in the attachments list unless the user removes it (default: keep as attachment too; optional checkbox “Also attach this .md file” default **on**).
4. On create: description goes through Markdown→ADF; `.md` still uploads if still in the list.

**Errors:** Non-text / read failure → inline error; do not clear existing description.

---

## Architecture / data flow

```
AsksPanel
  → sessionStorage handoff
  → /work-week + CreateIssueModal(open, prefill, sourceAskId)
  → create issue API (description Markdown → ADF)
  → updatePmAsk(done + jira_issue_key)
  → Asks row shows ODI link + grey Done

CreateIssueModal
  → attachments + AI helper → attachmentPreference → generate-description
  → description Markdown ↔ Write-up preview
  → optional Use .md as description
  → create + upload attachments
```

## Error handling

| Case | Behavior |
|------|----------|
| Handoff missing on Work Week | No modal auto-open |
| Create succeeds, ask update fails | Issue OK; warn; ask stays open until manual Done |
| Invalid status on API | 400 |
| .md read fails | Error message; keep prior description |
| AI Draft with files, attachments-only | Prompt: do not invent write-up content from files |

## Testing

- Unit: status enum / trimAsk mapping; Markdown ADF for create uses rich converter (extend existing `markdownToAdf` / description tests).
- Manual: Asks Create a task → modal prefill → create → grey + ODI link; Done/Cancel/Reopen; AI radio + draft; preview matches bold/lists; Use .md as description.

## Files likely touched

| Path | Role |
|------|------|
| `server/db/schema.mjs` | `status`, `jira_issue_key` columns |
| `server/routes/pmAsksRoutes.mjs` | CRUD fields |
| `src/services/jiraClient.js` | Client payloads |
| `src/Pages/ProjectManagers.jsx` | Asks UI, actions, grey, link |
| `src/Pages/WorkWeekTasks.jsx` | Consume handoff, open modal, callback |
| `src/Pages/components/CreateIssueModal.jsx` | Prefill, ask callback, AI radio, preview, Use .md |
| `shared/jiraDescriptionAdf.mjs` and/or create route | Markdown→ADF alignment |
| `server/lib/aiInstructions.mjs` (+ generate route) | Attachment preference in prompts |
| CSS for Asks grey/done | `ProjectManagers` styles / existing PM CSS |

---

## Spec self-review

- [x] No TBD placeholders for core behavior
- [x] Asks status vs create-done consistent (same `done` + grey)
- [x] `.md` as description vs attach clarified (load text + optional keep attach)
- [x] Scope excludes embedding modal on PM page and sending binaries to LLM
