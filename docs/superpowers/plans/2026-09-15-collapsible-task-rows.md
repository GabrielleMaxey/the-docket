# Collapsible Task Management rows — Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compact Task Management result rows (Key, Summary, Status, Priority) that expand to show remaining fields, with planning still opened only via Plan ▸.

**Architecture:** Add `expandedRowKey` beside existing `expandedPlanningKey`. Compact `<tr>` always; when expanded, render a detail `<tr>` (and optional planning `<tr>`). Split Status onto the compact row; move Assignee into the detail block. No API/DB changes.

**Tech Stack:** React 18, existing `JiraResultsTable.jsx` / `useTaskManagerJira.js` / `workWeekTaskElements.css`

## Global Constraints

- One expanded issue row at a time
- Row expand never opens planning
- Closing a row clears that key’s planning expand
- Clear `expandedRowKey` when the key leaves the current page/filter/sort page slice
- No new tests required (UI-only; manual verification)
- Do not commit unless the user asks

---

### Task 1: Row expand state in hook + wire props

**Files:**
- Modify: `src/Pages/hooks/useTaskManagerJira.js`
- Modify: `src/Pages/WorkWeekTasks.jsx`

**Interfaces:**
- Produces: `expandedRowKey: string | null`, `handleToggleRowExpand(issueKey: string): void`

- [x] **Step 1:** Add `expandedRowKey` state next to `expandedPlanningKey`
- [x] **Step 2:** `handleToggleRowExpand` — if same key, set null and clear planning if that key was open; else set key and clear previous key’s planning if needed
- [x] **Step 3:** Export from hook return; pass through `WorkWeekTasks` into `JiraResultsTable`

---

### Task 2: Compact table layout + detail row in JiraResultsTable

**Files:**
- Modify: `src/Pages/components/JiraResultsTable.jsx`
- Modify: `src/Pages/workWeekTaskElements.css`

**Interfaces:**
- Consumes: `expandedRowKey`, `handleToggleRowExpand`, existing planning props

- [x] **Step 1:** Compact header: chevron | Key | Summary | Status | Priority
- [x] **Step 2:** Compact body cells with ▸/▾, truncated summary, Status controls, PriorityCell; remove Plan button from compact Key cell
- [x] **Step 3:** When expanded, detail `<tr colSpan={5}>` with Parent, Type, Updated, Dates, Assignee, Notes, Push, Plan ▸
- [x] **Step 4:** Planning panel row only when row expanded AND `expandedPlanningKey === issueKey`
- [x] **Step 5:** Clear `expandedRowKey` when paged issues no longer include it (effect)
- [x] **Step 6:** CSS for chevron, summary clamp, detail panel

---

### Task 3: Manual verification checklist

- [ ] Default collapsed; expand one row; Status/Priority work; Plan closed until Plan ▸
- [ ] Expand second row collapses first and its planning
- [ ] Closed row expands read-only; Key links to Jira
- [ ] Change page/filter clears expand without errors
