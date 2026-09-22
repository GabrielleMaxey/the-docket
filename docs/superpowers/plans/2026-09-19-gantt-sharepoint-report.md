# Gantt SharePoint Status Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a SharePoint-ready HTML status pack from the Gantt (preview + edit + hybrid summary) plus a wider live Gantt with search.

**Architecture:** Pure client helpers compute metrics and build script-free HTML from the selected issue set. A SharePoint report panel on the Gantt provides scope, summary edit, generate/refine via a thin report API, live preview, and download/copy. Live Gantt UX (full width + search filter) is independent and ships first.

**Tech Stack:** React, existing Gantt (`GanttChart.jsx` / `projectManagers.css`), Semantic UI, Express report routes + `llmClient`, `node --test`

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-19-gantt-sharepoint-report-design.md`
- Branch: `gmaxey_gantt_sharepoint_report` only — do not mix Managed AI or unrelated WIP
- Primary deliverable: self-contained `.html` with **no JavaScript**
- Handoff: Download HTML + Copy HTML; optional PNG
- Summary: metric bullets + optional LLM; PM can edit manually and refine via prompt
- Preview must equal the exported HTML string
- Issue scope: default visible; checkbox include all
- Prefer **no new npm dependencies**; if PNG needs a library, stop and ask
- Works without AI (metrics + manual summary + timeline)
- Do not commit unless the user asks (or the user already asked to land work on this branch — prefer small commits when implementing if they request commits)

---

## File map

| File | Responsibility |
|------|----------------|
| `src/Pages/projectManagers.css` | Full-width Gantt overrides (beat Semantic `Container`) |
| `src/Pages/ProjectManagers.jsx` | Ensure wide class / layout hook if needed |
| `src/Pages/components/GanttChart.jsx` | Search bar, wire filtered rows, SharePoint report entry |
| `src/Pages/components/ganttSharepointMetrics.js` | Pure metrics from issue list |
| `src/Pages/components/ganttSharepointHtml.js` | Pure HTML builder (metrics + summary + CSS timeline) |
| `src/Pages/components/GanttSharepointReportPanel.jsx` | Scope, edit, preview, generate/refine, download/copy/PNG |
| `tests/ganttSharepointMetrics.test.mjs` | Metrics unit tests |
| `tests/ganttSharepointHtml.test.mjs` | HTML builder unit tests |
| `server/routes/reportRoutes.mjs` | `POST /api/report/gantt-summary` generate/refine |
| `src/services/jiraClient.js` | Client for gantt-summary |
| `docs/END_USER_GUIDE.md` or Gantt help blurb | Short PM-facing note (optional if guide already covers Gantt exports) |

---

### Task 1: Widen the live Gantt

**Files:**
- Modify: `src/Pages/projectManagers.css`
- Modify: `src/Pages/ProjectManagers.jsx` (only if class wiring is incomplete)

**Interfaces:**
- Produces: Gantt tab uses near-full viewport width; horizontal scroll retained for long ranges

- [ ] **Step 1: Confirm constraint**

Semantic UI `Container` sets its own `max-width` / `width`. `.project-managers-page--gantt { max-width: none }` alone may not win. In DevTools (or by reading CSS), confirm `.ui.container` is clamping width.

- [ ] **Step 2: Override Container for Gantt tab**

Add (adjust selectors to match actual DOM):

```css
.ui.container.project-managers-page--gantt {
  width: 100% !important;
  max-width: none !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  padding-left: 1rem;
  padding-right: 1rem;
}

.project-managers-page--gantt .pm-gantt-chart {
  max-width: none;
}
```

Keep `DAY_WIDTH` px-per-day behavior (do not compress bars to fit).

- [ ] **Step 3: Manual check**

Open Project Managers → Gantt with a multi-month plan: chart should use most of the window; still scroll horizontally when the range is wide.

- [ ] **Step 4: Commit if user requested commits**

---

### Task 2: Gantt search (filter-as-you-type)

**Files:**
- Modify: `src/Pages/components/GanttChart.jsx`
- Modify: `src/Pages/projectManagers.css` (search field styles)
- Test: `tests/ganttIssueSearch.test.mjs` (extract pure filter helper)

**Interfaces:**
- Produces: `filterIssuesBySearch(issues, query): issues` — case-insensitive match on `key` and `summary`
- Search input at top of Gantt; clear control; empty query restores list (still subject to status chips)

- [ ] **Step 1: Write failing tests**

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterIssuesBySearch } from "../src/Pages/components/ganttIssueSearch.js";

describe("filterIssuesBySearch", () => {
  const issues = [
    { key: "ABC-1", summary: "Login redesign" },
    { key: "ABC-2", summary: "API gateway" },
  ];

  it("returns all when query empty", () => {
    assert.equal(filterIssuesBySearch(issues, "").length, 2);
    assert.equal(filterIssuesBySearch(issues, "   ").length, 2);
  });

  it("matches key case-insensitively", () => {
    assert.deepEqual(
      filterIssuesBySearch(issues, "abc-2").map((i) => i.key),
      ["ABC-2"]
    );
  });

  it("matches summary substring", () => {
    assert.deepEqual(
      filterIssuesBySearch(issues, "login").map((i) => i.key),
      ["ABC-1"]
    );
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test tests/ganttIssueSearch.test.mjs`

- [ ] **Step 3: Implement helper + wire UI**

Create `src/Pages/components/ganttIssueSearch.js` with `filterIssuesBySearch`.

In `GanttChart.jsx`:
- State: `searchQuery`
- After status filtering (`visibleIssues`), apply search → `searchedIssues` used for rendering/grouping/export snapshot as appropriate
- Toolbar: `<input type="search" placeholder="Search key or summary…" />` + clear button
- Note under search when filtered: `Showing N of M issues`

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Manual** — type a key, list shrinks; clear restores

---

### Task 3: Metrics + HTML builder (pure)

**Files:**
- Create: `src/Pages/components/ganttSharepointMetrics.js`
- Create: `src/Pages/components/ganttSharepointHtml.js`
- Test: `tests/ganttSharepointMetrics.test.mjs`
- Test: `tests/ganttSharepointHtml.test.mjs`

**Interfaces:**
- Produces:
  - `computeGanttSharepointMetrics(issues, { today?: Date }): { total, done, inProgress, todo, overdue, spanStart, spanEnd, bullets: string[] }`
  - `buildGanttSharepointHtml({ displayName, generatedAt, metrics, summary, issues, jiraBaseUrl? }): string` — full HTML document, no `<script>`

Status category: use `issue.statusCategory` (`Done` / `Indeterminate` / `To Do` or equivalent strings already on Gantt issues). Overdue: not Done AND (`dueDate` \|\| `completeDate`) \< today (date-only).

- [ ] **Step 1: Failing metrics tests**

Cover total, category counts, overdue, span, bullet strings non-empty for a fixture of 3 issues.

- [ ] **Step 2: Implement metrics — tests PASS**

- [ ] **Step 3: Failing HTML tests**

```js
it("omits summary section when summary empty", () => { /* ... */ });
it("contains no script tags", () => {
  const html = buildGanttSharepointHtml({ ... });
  assert.equal(/<script/i.test(html), false);
});
it("includes issue keys in timeline", () => { /* ... */ });
it("escapes HTML in summaries", () => {
  const html = buildGanttSharepointHtml({
    displayName: "Plan",
    metrics: { bullets: ["x"], ... },
    summary: "<img onerror=alert(1)>",
    issues: [{ key: "A-1", summary: "<b>x</b>", startDate: "2026-01-01", dueDate: "2026-01-10", statusCategory: "To Do" }],
  });
  assert.equal(html.includes("<img"), false);
  assert.ok(html.includes("&lt;"));
});
```

- [ ] **Step 4: Implement HTML builder**

Inline CSS; month headers; rows with key + truncated summary + absolutely/ flex positioned bar; overdue color `#dc2626`; escape all user/Jira text.

- [ ] **Step 5: Tests PASS**

---

### Task 4: SharePoint report panel (no LLM yet)

**Files:**
- Create: `src/Pages/components/GanttSharepointReportPanel.jsx`
- Modify: `src/Pages/components/GanttChart.jsx` — open panel button; pass `visibleIssues`, `allIssues` (status-filtered full list before search, or raw `issues` — define: **visible** = currently rendered after status+search; **all** = all issues in loaded plan ignoring status chips and search; document in UI labels)
- Modify: `src/Pages/projectManagers.css` — panel + preview styles

**Clarify scope labels in UI:**
- “Current view (filters + search)” vs “Entire plan (ignore filters/search)”

**Interfaces:**
- Consumes: `computeGanttSharepointMetrics`, `buildGanttSharepointHtml`, existing `downloadBlob` pattern from GanttChart (extract shared helper or duplicate minimally)
- Produces: panel UI with preview iframe `srcDoc={html}`

- [ ] **Step 1: Panel skeleton**

Props: `{ open, onClose, displayName, viewIssues, allIssues, jiraBaseUrl, chartCaptureRef }`

State: `includeAll`, `summary`, `refinePrompt` (unused until Task 5)

Derived: `scopeIssues = includeAll ? allIssues : viewIssues`  
`metrics = compute…(scopeIssues)`  
`html = build…({ … })`

- [ ] **Step 2: Controls**

Checkbox include all; show metric bullets; textarea for summary; preview region; Download HTML; Copy HTML (navigator.clipboard.writeText; on failure show message). Disable download/copy if `scopeIssues.length === 0`.

- [ ] **Step 3: Wire from GanttChart**

Button “SharePoint report…” next to Export buttons. Pass issue arrays and display name.

- [ ] **Step 4: Manual** — edit summary → preview updates; download opens in browser without scripts; copy works

---

### Task 5: LLM Generate + Refine

**Files:**
- Modify: `server/routes/reportRoutes.mjs`
- Modify: `src/services/jiraClient.js`
- Modify: `GanttSharepointReportPanel.jsx`
- Optionally: `fetchChatStatus` to know if AI ready (reuse existing)

**Interfaces:**
- `POST /api/report/gantt-summary` body:
  ```json
  {
    "mode": "generate" | "refine",
    "displayName": "string",
    "metrics": { "bullets": ["..."], "total": 0, "done": 0, "inProgress": 0, "todo": 0, "overdue": 0 },
    "issues": [{ "key", "summary", "status", "statusCategory", "startDate", "dueDate", "completeDate", "overdue": false }],
    "currentSummary": "string",
    "instruction": "string"
  }
  ```
  Response: `{ summary: "string" }`  
  Cap `issues` array server-side (e.g. first 80) with note in prompt if truncated.

- [ ] **Step 1: Add route** using existing `callLLMForReport` / `completeLlmText` pattern (same provider resolution as other reports). System prompt: concise management status paragraph; factual; no fluff; grounded only in provided metrics/issues.

- [ ] **Step 2: Client** `generateGanttSharepointSummary(payload)` in `jiraClient.js`

- [ ] **Step 3: Panel**

- Generate → replace textarea  
- Refine → requires non-empty instruction; sends current summary + instruction  
- Disable both when chat/report not ready; show hint  
- Errors stay in panel; do not clear summary

- [ ] **Step 4: Manual** — with AI configured: generate → refine “shorter” → tweak manually → download

---

### Task 6: Optional PNG (no new dependency)

**Files:**
- Modify: `ganttSharepointHtml.js` or new `ganttSharepointPng.js`
- Modify: `GanttSharepointReportPanel.jsx`

**Approach (no DOM library):** Render the **simplified timeline** to a `<canvas>` from the same scope issues (bars + labels), then `canvas.toBlob` → download `gantt_status_….png`. This is the SharePoint “visual” image without screenshotting the interactive Gantt and without new deps.

If canvas quality is unacceptable, **stop** and ask before adding `html-to-image` / similar.

- [ ] **Step 1: Implement canvas drawer** from issue list + date range  
- [ ] **Step 2: “Download chart PNG” button**  
- [ ] **Step 3: Manual** — PNG opens and shows bars for scoped issues  

---

### Task 7: Docs + manual checklist

**Files:**
- Modify: `docs/END_USER_GUIDE.md` (Gantt section) — SharePoint report, search, wider chart  
- Update: spec status line to “Approved for implementation” if desired

- [ ] **Step 1: Short end-user notes**  
- [ ] **Step 2: Run full checklist from the design spec Testing section**  
- [ ] **Step 3: Commit if requested**

---

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| Wider Gantt | 1 |
| Search | 2 |
| Metrics bullets | 3 |
| HTML timeline, no scripts | 3–4 |
| Preview = export | 4 |
| Download + Copy | 4 |
| Visible vs all | 4 |
| Generate / Refine / manual edit | 5 |
| Works without AI | 4 |
| Optional PNG | 6 |
| Docs | 7 |
| Own branch | Global |

## Execution

After plan acceptance: implement on `gmaxey_gantt_sharepoint_report` task-by-task.
