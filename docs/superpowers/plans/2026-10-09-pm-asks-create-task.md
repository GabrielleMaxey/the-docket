# PM Asks Create Task + Create Issue Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From Project Managers → Asks, open Task Management Create Issue (prefilled), mark asks done/canceled with ODI links, and improve Create Issue Markdown (ADF, preview, AI attachment preference, use `.md` as description).

**Architecture:** Extend local `pm_asks` with `status` + `jira_issue_key`. Row actions write a `sessionStorage` handoff and navigate to `/work-week`, where `WorkWeekTasks` opens `CreateIssueModal`. On successful create, PATCH the ask to `done` with the issue key. Create Issue description conversion delegates to `markdownTextToAdfNodes`; UI adds write-up preview, AI attachment radio, and “Use .md as description.”

**Tech Stack:** React (hash router), Express + better-sqlite3, existing Jira create + AI Draft routes, `shared/markdownToAdf.mjs`, `SimpleMarkdown`, Node test runner (`node --test`).

## Global Constraints

- Asks remain machine-local SQLite (not pushed to Jira as asks).
- Status enum only: `open` | `done` | `canceled`.
- Do not send attachment file bytes to the LLM — names + preference only.
- Reuse note Markdown subset; do not invent full GFM.
- Prefer editing existing functions over parallel helpers; no new deps.
- Match existing naming (`whoAsked`, `jiraIssueKey` camelCase on JSON).
- After feature work: update/create `docs/PR_WriteUps/PR_*.md` and commit with the branch.

---

## File map

| Path | Responsibility |
|------|----------------|
| `shared/pmAskStatus.mjs` | Status constants + normalize helpers |
| `src/utils/pmAskCreateIssueHandoff.js` | sessionStorage read/write/clear |
| `server/db/schema.mjs` | ensureColumn for status + jira_issue_key |
| `server/routes/pmAsksRoutes.mjs` | CRUD with new fields |
| `src/services/jiraClient.js` | Client payloads |
| `src/Pages/ProjectManagers.jsx` + `projectManagers.css` | Asks UI |
| `src/Pages/WorkWeekTasks.jsx` | Consume handoff, wire modal |
| `src/Pages/components/CreateIssueModal.jsx` | Prefill, askId callback, AI radio, preview, Use .md |
| `shared/jiraDescriptionAdf.mjs` | Delegate to markdown ADF |
| `server/lib/aiInstructions.mjs` + `server/routes/jiraIssueRoutes.mjs` | Attachment preference in AI Draft |
| `tests/pmAsksStatus.test.mjs` | Status normalize |
| `tests/jiraDescriptionAdf.test.mjs` | Rich markdown on create ADF |
| `docs/PR_WriteUps/PR_PM_ASKS_CREATE_TASK.md` | PR body |

---

### Task 1: Ask status helpers + schema + API

**Files:**
- Create: `shared/pmAskStatus.mjs`
- Create: `tests/pmAsksStatus.test.mjs`
- Modify: `server/db/schema.mjs` (after `pm_asks` CREATE TABLE)
- Modify: `server/routes/pmAsksRoutes.mjs`
- Test: `tests/pmAsksStatus.test.mjs`

**Interfaces:**
- Produces: `PM_ASK_STATUSES`, `normalizePmAskStatus(value) → "open"|"done"|"canceled"`, `isClosedPmAskStatus(status) → boolean`

- [ ] **Step 1: Write the failing test**

```js
// tests/pmAsksStatus.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizePmAskStatus, isClosedPmAskStatus, PM_ASK_STATUSES } from "../shared/pmAskStatus.mjs";

describe("normalizePmAskStatus", () => {
  it("defaults unknown/empty to open", () => {
    assert.equal(normalizePmAskStatus(""), "open");
    assert.equal(normalizePmAskStatus("nope"), "open");
  });
  it("accepts open, done, canceled", () => {
    for (const s of PM_ASK_STATUSES) {
      assert.equal(normalizePmAskStatus(s), s);
      assert.equal(normalizePmAskStatus(s.toUpperCase()), s);
    }
  });
  it("isClosedPmAskStatus is true for done and canceled only", () => {
    assert.equal(isClosedPmAskStatus("open"), false);
    assert.equal(isClosedPmAskStatus("done"), true);
    assert.equal(isClosedPmAskStatus("canceled"), true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/pmAsksStatus.test.mjs`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement helper + schema columns + routes**

```js
// shared/pmAskStatus.mjs
export const PM_ASK_STATUSES = Object.freeze(["open", "done", "canceled"]);

export function normalizePmAskStatus(value) {
  const s = String(value || "").trim().toLowerCase();
  return PM_ASK_STATUSES.includes(s) ? s : "open";
}

export function isClosedPmAskStatus(status) {
  const s = normalizePmAskStatus(status);
  return s === "done" || s === "canceled";
}
```

In `server/db/schema.mjs`, after the `pm_asks` `CREATE TABLE` block, add:

```js
ensureColumn(db, "pm_asks", "status", "TEXT NOT NULL DEFAULT 'open'");
ensureColumn(db, "pm_asks", "jira_issue_key", "TEXT NOT NULL DEFAULT ''");
```

Update `trimAsk` and all SELECT/RETURNING lists to include `status`, `jira_issue_key` mapped to `status` / `jiraIssueKey`.

PUT: allow `status` and `jiraIssueKey` (string). Require at least one of title/whoAsked/note/status/jiraIssueKey. Normalize status via `normalizePmAskStatus`. When setting status to `open` via reopen, do **not** clear `jira_issue_key` unless client sends empty string explicitly.

- [ ] **Step 4: Run tests**

Run: `node --test tests/pmAsksStatus.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/pmAskStatus.mjs tests/pmAsksStatus.test.mjs server/db/schema.mjs server/routes/pmAsksRoutes.mjs
git commit -m "Add pm_asks status and jira_issue_key with API support."
```

---

### Task 2: jiraClient update for ask status fields

**Files:**
- Modify: `src/services/jiraClient.js` (`createPmAsk` / `updatePmAsk` / mapping if any)

**Interfaces:**
- Consumes: API fields from Task 1
- Produces: `updatePmAsk({ id, title?, whoAsked?, note?, status?, jiraIssueKey? })`

- [ ] **Step 1: Extend updatePmAsk (and create response consumers need no change)**

```js
export const updatePmAsk = async ( { id, title, whoAsked, note, status, jiraIssueKey } ) => {
  const body = {};
  if ( typeof title === "string" ) body.title = title;
  if ( typeof whoAsked === "string" ) body.whoAsked = whoAsked;
  if ( typeof note === "string" ) body.note = note;
  if ( typeof status === "string" ) body.status = status;
  if ( typeof jiraIssueKey === "string" ) body.jiraIssueKey = jiraIssueKey;
  return requestJson( `/api/project-managers/asks/${ encodeURIComponent( id ) }`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify( body ),
  } );
};
```

- [ ] **Step 2: Smoke** — start API, `curl` PUT status (or rely on later UI). No new unit test required if Task 1 covers normalize.

- [ ] **Step 3: Commit**

```bash
git add src/services/jiraClient.js
git commit -m "Pass ask status and jiraIssueKey through jiraClient."
```

---

### Task 3: Asks panel UX (Done / Cancel / Reopen / grey / ODI link)

**Files:**
- Modify: `src/Pages/ProjectManagers.jsx` (`AsksPanel`)
- Modify: `src/Pages/projectManagers.css`

**Interfaces:**
- Consumes: `updatePmAsk`, `fetchPmAsks`, health `jiraBaseUrl` (fetch once via existing health helper if present, or `requestJson("/api/health")`)
- Produces: Row actions calling `updatePmAsk({ id, status })`

- [ ] **Step 1: Sort open first**

```js
const sortedAsks = [...asks].sort((a, b) => {
  const ac = a.status === "open" ? 0 : 1;
  const bc = b.status === "open" ? 0 : 1;
  if (ac !== bc) return ac - bc;
  return a.id - b.id;
});
```

- [ ] **Step 2: Row chrome**

For closed rows: `className="pm-asks-row pm-asks-row--closed"`, badge Done/Canceled, ODI `<a href={`${jiraBaseUrl}/browse/${key}`}>` when `jiraIssueKey` and base URL exist. Actions: Reopen (`status: "open"`), Delete. Hide Edit/Create for closed (or allow Edit — **spec: Reopen + Delete only**).

For open: Edit, Delete, Done (`status: "done"`), Cancel (`status: "canceled"`). (Create a task in Task 4.)

- [ ] **Step 3: CSS**

```css
.pm-asks-row--closed td {
  opacity: 0.55;
  color: #64748b;
}
.pm-asks-status-badge {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  margin-left: 0.35rem;
}
```

- [ ] **Step 4: CSV** — add Status and Jira key columns.

- [ ] **Step 5: Manual check** — Done/Cancel grey; Reopen restores open styling; link appears only with key (none yet until Task 5).

- [ ] **Step 6: Commit**

```bash
git add src/Pages/ProjectManagers.jsx src/Pages/projectManagers.css
git commit -m "Add Done, Cancel, and Reopen with greyed closed asks."
```

---

### Task 4: Handoff util + Create a task navigation

**Files:**
- Create: `src/utils/pmAskCreateIssueHandoff.js`
- Modify: `src/Pages/ProjectManagers.jsx`
- Modify: `src/Pages/WorkWeekTasks.jsx`
- Modify: `src/Pages/components/CreateIssueModal.jsx` (props only: `initialSummary`, `initialDescription`, `sourceAskId`, `onAskLinked`)

**Interfaces:**
- Produces:
  - `PM_ASK_CREATE_ISSUE_HANDOFF_KEY = "pmAskCreateIssueHandoff"`
  - `writePmAskCreateIssueHandoff({ askId, title, note })`
  - `consumePmAskCreateIssueHandoff() → payload | null` (read + remove)
- CreateIssueModal: optional `initialSummary`, `initialDescription`, `sourceAskId`, `onCreated` already exists — extend `onCreated(created)` to receive issue key if not already

- [ ] **Step 1: Handoff module**

```js
// src/utils/pmAskCreateIssueHandoff.js
export const PM_ASK_CREATE_ISSUE_HANDOFF_KEY = "pmAskCreateIssueHandoff";

export function writePmAskCreateIssueHandoff({ askId, title, note }) {
  sessionStorage.setItem(
    PM_ASK_CREATE_ISSUE_HANDOFF_KEY,
    JSON.stringify({
      askId,
      title: String(title || ""),
      note: String(note || ""),
      createdAt: Date.now(),
    })
  );
}

export function consumePmAskCreateIssueHandoff() {
  const raw = sessionStorage.getItem(PM_ASK_CREATE_ISSUE_HANDOFF_KEY);
  sessionStorage.removeItem(PM_ASK_CREATE_ISSUE_HANDOFF_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Number.isFinite(Number(parsed.askId))) return null;
    return {
      askId: Number(parsed.askId),
      title: String(parsed.title || ""),
      note: String(parsed.note || ""),
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: AsksPanel Create a task**

```js
import { useNavigate } from "react-router-dom";
import { writePmAskCreateIssueHandoff } from "../utils/pmAskCreateIssueHandoff.js";

// inside open row actions:
<button type="button" className="ww-page-btn" onClick={() => {
  writePmAskCreateIssueHandoff({ askId: ask.id, title: ask.title, note: ask.note });
  navigate("/work-week");
}}>Create a task</button>
```

- [ ] **Step 3: WorkWeekTasks consume**

On mount (once):

```js
React.useEffect(() => {
  const handoff = consumePmAskCreateIssueHandoff();
  if (!handoff) return;
  setCreateIssuePrefill(handoff);
  setCreateIssueOpen(true);
}, []);
```

Pass into modal:

```jsx
<CreateIssueModal
  open={createIssueOpen}
  onClose={() => { setCreateIssueOpen(false); setCreateIssuePrefill(null); }}
  epicPresets={epicPresets}
  defaultEpicSelectValue={createIssueDefaults.epicSelectValue}
  initialSummary={createIssuePrefill?.title || ""}
  initialDescription={createIssuePrefill?.note || ""}
  sourceAskId={createIssuePrefill?.askId ?? null}
  onCreated={async (created) => {
    void handleRunJql();
    const key = created?.key || created?.issueKey || "";
    if (createIssuePrefill?.askId && key) {
      try {
        await updatePmAsk({
          id: createIssuePrefill.askId,
          status: "done",
          jiraIssueKey: key,
        });
      } catch {
        // soft warn — leave ask open
      }
    }
    setCreateIssuePrefill(null);
  }}
/>
```

Wire `CreateIssueModal` so on successful create it calls `onCreated` with `{ key }` (inspect current callback — update if it currently passes nothing).

Apply `initialSummary` / `initialDescription` when `open` becomes true (in the existing reset effect: if initials provided, set summary/description from them instead of empty).

- [ ] **Step 4: Manual** — Create a task from Asks → lands on Work Week with modal open and fields prefilled.

- [ ] **Step 5: Commit**

```bash
git add src/utils/pmAskCreateIssueHandoff.js src/Pages/ProjectManagers.jsx src/Pages/WorkWeekTasks.jsx src/Pages/components/CreateIssueModal.jsx
git commit -m "Handoff Asks Create a task into Work Week Create Issue."
```

---

### Task 5: Mark ask done after create (finish callback path)

**Files:**
- Modify: `src/Pages/components/CreateIssueModal.jsx` (ensure `onCreated({ key })` after parent create succeeds)
- Modify: `src/Pages/WorkWeekTasks.jsx` if needed

**Interfaces:**
- Consumes: created issue key from create response
- Produces: ask `done` + `jiraIssueKey` via Task 2/4 wiring

- [ ] **Step 1: Confirm create response shape** — existing create returns `key`; pass it to `onCreated`.

- [ ] **Step 2: Manual** — full path: Create a task → create issue → return to Asks → row grey Done + ODI link.

- [ ] **Step 3: Commit** if any leftover changes

```bash
git commit -am "Link created Jira key back onto the source ask."
```

---

### Task 6: Rich Markdown → ADF for Create Issue

**Files:**
- Modify: `shared/jiraDescriptionAdf.mjs`
- Create: `tests/jiraDescriptionAdf.test.mjs`

**Interfaces:**
- Consumes: `markdownTextToAdfNodes` from `shared/markdownToAdf.mjs`
- Produces: `descriptionTextToAdf(text) → { type:"doc", version:1, content } | null` (same export name)

- [ ] **Step 1: Failing test**

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { descriptionTextToAdf } from "../shared/jiraDescriptionAdf.mjs";

describe("descriptionTextToAdf", () => {
  it("returns null for empty", () => {
    assert.equal(descriptionTextToAdf(""), null);
  });
  it("renders bold markdown as strong mark", () => {
    const doc = descriptionTextToAdf("**Important**");
    assert.equal(doc.type, "doc");
    assert.equal(doc.content[0].content[0].marks[0].type, "strong");
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (bold currently plain text in one paragraph)

- [ ] **Step 3: Implement**

```js
import { markdownTextToAdfNodes } from "./markdownToAdf.mjs";

export const descriptionTextToAdf = (text) => {
  const content = markdownTextToAdfNodes(text);
  if (content.length === 0) return null;
  return { type: "doc", version: 1, content };
};
```

Remove obsolete bullet-only helpers if unused.

- [ ] **Step 4: Run** `node --test tests/jiraDescriptionAdf.test.mjs tests/markdownToAdf.test.mjs` — PASS

- [ ] **Step 5: Commit**

```bash
git add shared/jiraDescriptionAdf.mjs tests/jiraDescriptionAdf.test.mjs
git commit -m "Convert Create Issue descriptions with full markdown ADF."
```

---

### Task 7: Write-up preview in CreateIssueModal

**Files:**
- Modify: `src/Pages/components/CreateIssueModal.jsx`
- Optionally small CSS in existing create-issue / App styles

- [ ] **Step 1: Under description textarea**, when `description.trim()`:

```jsx
import SimpleMarkdown from "../../Components/SimpleMarkdown.jsx";

{description.trim() ? (
  <div className="create-issue-writeup-preview" aria-live="polite">
    <div className="create-issue-writeup-preview-label">Write-up preview</div>
    <SimpleMarkdown text={description} />
  </div>
) : null}
```

- [ ] **Step 2: Manual** — AI Draft or type `**bold**` / lists; preview matches; create still works.

- [ ] **Step 3: Commit**

```bash
git add src/Pages/components/CreateIssueModal.jsx
git commit -m "Show live Markdown write-up preview in Create Issue."
```

---

### Task 8: AI helper attachment preference (radio)

**Files:**
- Modify: `src/Pages/components/CreateIssueModal.jsx`
- Modify: `src/services/jiraClient.js` (`generateIssueDescription`)
- Modify: `server/routes/jiraIssueRoutes.mjs`
- Modify: `server/lib/aiInstructions.mjs` (`buildAiDraftUserPrompt`)

**Interfaces:**
- Produces: body field `attachmentPreference: "referenceInDescription" | "attachmentsOnly"`
- Prompt appends file name list + instruction

- [ ] **Step 1: UI state** `attachmentPreference` default `"attachmentsOnly"`. Show radio group when `attachments.length > 0 && useAiHelper` near AttachmentPicker.

- [ ] **Step 2: Client** pass `attachmentPreference` and `attachmentNames: attachments.map(f => f.name)` into `generateIssueDescription`.

- [ ] **Step 3: Server** read preference + names; extend `buildAiDraftUserPrompt` (or append block after building) with:

```
Attachments (will upload after create): file1.png, notes.md
User choice: attachments only — do not rely on these files in the description body.
```
or
```
User choice: reference in description — mention these files by name and describe how they support the write-up; do not invent unseen pixel content.
```

- [ ] **Step 4: Manual** — with files + AI helper, both choices affect draft tone.

- [ ] **Step 5: Commit**

```bash
git add src/Pages/components/CreateIssueModal.jsx src/services/jiraClient.js server/routes/jiraIssueRoutes.mjs server/lib/aiInstructions.mjs
git commit -m "Ask how Create Issue attachments should appear in AI drafts."
```

---

### Task 9: Use .md file as description

**Files:**
- Modify: `src/Pages/components/CreateIssueModal.jsx`

- [ ] **Step 1: Helper** — first attachment whose name ends with `.md` (case-insensitive) or `type === "text/markdown"`.

- [ ] **Step 2: Button** “Use .md as description” when such a file exists. On click:
  - If `description.trim()`, `window.confirm("Replace description with file contents?")`
  - `await file.text()` → `setDescription(text)`
  - Keep file in `attachments` (default attach-on)
  - On read error: setError message; do not clear description

- [ ] **Step 3: Manual** — attach sample.md, load into description, preview renders, create attaches file + ADF body.

- [ ] **Step 4: Commit**

```bash
git add src/Pages/components/CreateIssueModal.jsx
git commit -m "Allow using an attached .md file as the Create Issue description."
```

---

### Task 10: PR write-up + final verification

**Files:**
- Create: `docs/PR_WriteUps/PR_PM_ASKS_CREATE_TASK.md`

- [ ] **Step 1: Write PR doc** with Summary / Problem / Changes / Test plan / Files touched (mirror `PR_CREATE_ISSUE_FIXES.md`).

- [ ] **Step 2: Run** `node --test tests/pmAsksStatus.test.mjs tests/jiraDescriptionAdf.test.mjs tests/markdownToAdf.test.mjs`

- [ ] **Step 3: Manual checklist** from spec Test plan section.

- [ ] **Step 4: Commit**

```bash
git add docs/PR_WriteUps/PR_PM_ASKS_CREATE_TASK.md
git commit -m "Add PR write-up for PM Asks create-task and Markdown create."
```

---

## Plan self-review

| Spec section | Task(s) |
|--------------|---------|
| Asks status model | 1–2 |
| Row UX Done/Cancel/Reopen/grey | 3 |
| Create-a-task handoff | 4–5 |
| ODI link | 3 + 5 |
| AI attachment radio | 8 |
| Markdown ADF + preview | 6–7 |
| Use .md as description | 9 |
| PR write-up | 10 |

No TBD placeholders. Names aligned: `jiraIssueKey`, `attachmentPreference`, `consumePmAskCreateIssueHandoff`.
