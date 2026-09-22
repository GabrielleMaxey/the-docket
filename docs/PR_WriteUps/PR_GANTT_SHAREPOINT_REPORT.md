# PR: Gantt SharePoint status report

## Summary

Adds a SharePoint-ready HTML status pack from the Gantt (preview, edit, optional AI summary, download/copy, PNG), plus live Gantt UX improvements: full-width layout and issue search.

## Problem

| Symptom | Root cause |
|---------|------------|
| PMs needed a visual status handoff for management / SharePoint | Gantt only exported `.md` / `.csv` — no previewable HTML pack |
| Gantt felt too narrow for a full timeline | Semantic UI `Container` clamped width (~900px) even with `--gantt` class |
| Finding one issue meant scrolling | No search on the live Gantt |

## Changes

### Live Gantt UX
- Full-width override for `.ui.container.project-managers-page--gantt`
- Search bar (key/summary, filter-as-you-type, clear, showing N of M)

### SharePoint report
- Panel: scope (current view vs entire plan), metric bullets, editable summary
- Optional LLM Generate / Refine (`POST /api/report/gantt-summary`)
- Live HTML preview (`iframe srcDoc`) matching download/copy output
- Download HTML, Copy HTML, Download chart PNG (canvas, no new deps)
- Works without AI (manual summary + metrics + timeline)

### Docs / tests
- End-user guide Gantt notes
- Design + implementation plan under `docs/superpowers/`
- Unit tests for search, metrics, HTML builder

## Test plan

- [ ] Gantt tab uses full window width; long ranges still scroll horizontally
- [ ] Search filters by key and summary; clear restores the list
- [ ] SharePoint report → Current view vs Entire plan updates metrics/timeline
- [ ] Edit summary → preview updates; Download HTML matches preview
- [ ] Copy HTML works (or shows fallback message)
- [ ] With AI configured: Generate then Refine then manual tweak → export
- [ ] Without AI: Generate/Refine disabled; export still works
- [ ] Download chart PNG shows bars for scoped issues
- [ ] `node --test tests/gantt*.test.mjs` passes

## Files touched

| Area | Paths |
|------|--------|
| UI | `GanttChart.jsx`, `GanttSharepointReportPanel.jsx`, `projectManagers.css` |
| Helpers | `ganttIssueSearch.js`, `ganttSharepointMetrics.js`, `ganttSharepointHtml.js`, `ganttSharepointPng.js` |
| API | `reportRoutes.mjs`, `jiraClient.js` |
| Docs/tests | `END_USER_GUIDE.md`, `docs/superpowers/*`, `tests/gantt*.test.mjs` |
