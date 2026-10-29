# Collapsible Task Management rows (design)

**Date:** 2026-09-15  
**Status:** Approved for planning (pending user review of this file)  
**Scope:** Compact/expand layout for Task Management Jira results rows  
**Related:** Existing planning panel (`expandedPlanningKey`, `ww-planning-expand-btn` in `JiraResultsTable.jsx`)

---

## Goal

Let users scan Task Management results as compact rows (Key, Summary, Status, Priority) and expand a row for the rest of the fields — without auto-opening the planning panel.

## Decisions

| Topic | Choice |
|--------|--------|
| Layout | Compact row + detail row (two `<tr>`s when expanded) |
| Collapsed columns | Chevron · Key · Summary (truncated) · Status (editable) · Priority (editable) |
| Expanded detail | Nested table restoring the pre-collapse layout: Key (+ Plan ▸), Parent, Type, Summary, Status+Assignee, Updated, Dates, Priority, Notes, Push |
| Planning panel | Still requires a separate manual **Plan ▸** open — not opened by row expand |
| Default | All rows collapsed |
| Expand concurrency | One expanded issue row at a time |
| Status / Priority on compact row | Editable (same controls as today) |
| Persist expand across reload | No (v1) |
| Expand all / Collapse all | No (v1) |

## Non-goals

- New APIs or SQLite columns
- Changing planning field semantics or save paths
- Moving Notes onto the compact row
- Replacing the table with a card list
- Persisting which row is expanded in `localStorage`

## Behavior

### Collapsed (default)

Each issue is one table row:

| Control | Behavior |
|---------|----------|
| ▸ chevron | Expands this row; collapses any other expanded row |
| Key | Link to Jira (unchanged) |
| Summary | Truncated with ellipsis; full text on `title` tooltip |
| Status | Dropdown + Update Status (unchanged; read-only when closed) |
| Priority | P1–P20 dropdown (unchanged; read-only when closed) |

### Expanded

- Compact row stays visible with chevron as ▾.
- A second full-width row (`colSpan={5}`) contains a **nested** `ww-results-table--expanded-detail` table that restores the pre-collapse horizontal layout (no second column header row):
  Key (+ **Plan ▸**) | Parent | Jira Type | Summary | Status + Assignee | Updated | Dates | Priority | Notes | Push
- Results list scrolls inside `.ww-results-table-wrap`; the compact table header stays sticky.
- Opening planning adds the existing planning panel row under the detail, same as today.
- Closing the issue row also clears planning expand for that key if it was open (`expandedPlanningKey` → null when that key’s row collapses).

### Closed / resolved

Same as today: status/assignee/dates/notes/priority/planning edits disabled; row can still expand to read detail.

### Filters, sort, pager

Unchanged. Expanding does not reset page or filters. If the expanded issue leaves the current page (sort/filter/page change), clear `expandedRowKey`.

## UI structure

**Compact table header:** (empty/chevron) | Key | Summary | Status | Priority  

**Expanded detail:** nested table with the classic 10-column **body** only (no nested `<thead>`). Same cells/handlers as before collapse.

**CSS:** `workWeekTaskElements.css` — compact summary clamp, row chevron, sticky compact `thead`, scrollable wrap, `.ww-results-table--expanded-detail` column widths aligned with the old full table.

## State

| State | Where | Notes |
|-------|--------|--------|
| `expandedRowKey` | `useTaskManagerJira` or local to `JiraResultsTable` | Single issue key or `null` |
| `expandedPlanningKey` | Existing | Independent; must not be set by row expand |
| `showPlanningFields` | Existing toggle | Unchanged |

Recommended: keep `expandedRowKey` next to `expandedPlanningKey` in the same hook that already owns planning expand, and pass `handleToggleRowExpand` into the table — same pattern as planning.

## Interaction rules

1. Toggle row expand on chevron only (not on Summary click).
2. Expanding row B while A is open collapses A (and clears A’s planning expand if set).
3. **Plan ▸** appears only in the expanded detail block. The row must already be expanded to open planning. No Plan control on the collapsed row; row expand never opens planning by itself.
4. Notes pop-out modal behavior unchanged when the row is expanded.

**Status vs Assignee:** Today Status and Assignee share one column. Compact row keeps **Status only**. Assignee moves into the expanded detail block with Dates / Notes / Push.

## Testing

- Manual: collapse default → expand one row → Status/Priority still work on compact row → Plan stays closed until Plan ▸ → expand another row collapses the first and its planning panel.
- Manual: closed issue expands read-only; Key still links to Jira.
- Manual: change page/filter with a row expanded → expand state clears without errors.
- No new server tests required (UI-only).

## Files likely touched

| Area | Paths |
|------|--------|
| Table | `src/Pages/components/JiraResultsTable.jsx` |
| State / props | `src/Pages/hooks/useTaskManagerJira.js`, `src/Pages/WorkWeekTasks.jsx` |
| Styles | `src/Pages/workWeekTaskElements.css` |
| Docs (optional follow-up) | `docs/END_USER_GUIDE.md` Task Management results section |

## What not to build

- Compact-row Plan button that auto-opens planning
- Second priority or status control in the detail block (reuse the compact controls; do not duplicate)
- Sticky expand-all toolbar in v1
