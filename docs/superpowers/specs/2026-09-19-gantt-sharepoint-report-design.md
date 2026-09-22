# Gantt SharePoint status report (design)

**Date:** 2026-09-19  
**Status:** Implemented (pending manual QA)  
**Branch:** `gmaxey_gantt_sharepoint_report` (dedicated feature branch)  
**Scope:** SharePoint-friendly HTML status pack from Gantt + live Gantt UX (wider layout, search)  
**Related:** `src/Pages/components/GanttChart.jsx`, `src/Pages/projectManagers.css`, existing Gantt Export (.md/.csv), report LLM path

---

## Goal

Let project managers produce a **management-ready status handoff** from the Gantt: a self-contained **SharePoint HTML** page with a **short status summary** (not dumbed-down, not overly dense) and a **timeline visual**, after **previewing and editing**. Also improve the live Gantt so PMs can **see a fuller timeline** and **find a specific issue without scrolling forever**.

## Decisions

| Topic | Choice |
|--------|--------|
| Approach | Client-built SharePoint pack from loaded Gantt data |
| Primary deliverable | Self-contained `.html` (no scripts) for SharePoint upload |
| Handoff | Download HTML + Copy HTML; optional Download chart PNG |
| Summary | Hybrid: fixed metric bullets + optional LLM paragraph |
| Edit | Manual edit of summary; **Generate** and **Refine** via prompt |
| Preview | Live preview of the same HTML that will be exported |
| Issue scope | Ask at export: default **visible**; checkbox **Include all issues** |
| Timeline in HTML | Simplified HTML/CSS bars (SharePoint-safe) |
| Chart image | Optional PNG of the on-screen Gantt (for slides), not required inside HTML |
| Live Gantt width | Use full available width (fix narrow ~900px constraint) |
| Live Gantt search | Search bar at top: jump/filter to a specific item by key or summary |
| LLM | Reuse existing report/chat provider; works without AI (manual summary only) |
| Archive | Out of scope for v1 |

## Non-goals (v1)

- Direct SharePoint API / Graph upload
- PDF or PowerPoint export
- Pixel-perfect clone of interactive Gantt chrome inside the HTML
- Merging multiple Jira sites into one report
- Server-side HTML generation pipeline
- Report archive integration (can follow later)

## Live Gantt UX (in scope)

### Wider chart

- Ensure the Gantt tab uses full viewport width (apply/fix `project-managers-page--gantt` / parent `max-width` so the timeline is not stuck near 900px).
- Keep horizontal scroll for long date ranges; do not compress bars to “fit” the window.

### Search

- Search control at the **top** of the live Gantt.
- Match **issue key** and **summary** (case-insensitive).
- Behavior (v1): filter the visible rows to matches **or** scroll/highlight the first match — prefer **filter-as-you-type** with a clear “clear search” control so PMs can isolate one item quickly.
- Empty query restores the normal visible list (subject to existing filters).

## SharePoint report flow

1. PM opens **SharePoint report** from the Gantt toolbar (alongside existing Export .md / .csv).
2. Panel / drawer:
   - Scope: **Visible issues** (default) vs **Include all issues**
   - **Metric bullets** derived from the chosen set (auto-generated)
   - **Summary** textarea (editable)
   - **Generate summary** (LLM) — fills/replaces textarea from metrics + compact issue context
   - **Refine…** — PM enters a short instruction (e.g. “focus on overdue”); LLM rewrites current summary
   - If no AI configured: Generate/Refine disabled with a short hint; metrics + manual summary + timeline still work
3. **Live preview** of the HTML (same document string as export).
4. Actions: **Download .html** · **Copy HTML** · optional **Download chart PNG**.

## HTML document structure

Self-contained file with inline CSS, **no JavaScript**:

1. Title: plan/program display name + generated date  
2. Status metric bullets  
3. Summary paragraph (PM text; omit section if empty)  
4. Simplified timeline: key, short summary, bar from start→due/complete, overdue styling, month headers  
5. Footer: generated-from note; optional Jira browse base if available  

PNG is a **separate download**, not embedded by default (keeps SharePoint files smaller and more reliable).

## Metrics (template bullets)

Computed client-side from the selected issue set, e.g.:

- Total issues in scope  
- Done / In progress / To do (status category)  
- Overdue count (open issues past due/complete date)  
- Timeline span (earliest start → latest due/complete)  

Tone: factual leadership bullets — not toy language, not a full analytic appendix.

## LLM behavior

- Uses the same configured report/chat path as other LLM reports.
- **Generate:** system prompt = concise PM status for management; user content = metrics + compact issue lines (key, summary, status, dates, overdue flag). Cap context size for large plans.
- **Refine:** current summary + PM instruction + same metrics snapshot.
- PM always reviews/edits in the textarea before export; preview reflects edits immediately.

## Under the hood

| Piece | Responsibility |
|--------|----------------|
| Gantt UI | Wider layout, search, SharePoint report entry |
| Report panel | Scope, metrics, summary edit, generate/refine, preview, download/copy/PNG |
| HTML builder | Pure function: issues + metrics + summary → HTML string |
| Metrics helper | Pure function over issue list |
| LLM | Thin client call to existing report endpoint or small dedicated Gantt-summary route if needed to keep prompts clean |
| PNG | Capture chart DOM only when requested |

Prefer **no new npm dependency**. If PNG capture cannot be done cleanly without one, stop and get explicit approval before adding a library.

## Error handling

| Situation | Behavior |
|-----------|----------|
| No issues in scope | Disable export; explain empty scope |
| LLM unavailable / fails | Keep metrics + manual summary; show error on Generate/Refine only |
| Copy fails | Fall back to Download; show short message |
| Huge issue lists | Truncate LLM context with a note; HTML timeline may paginate/scroll via CSS overflow |

## Testing (manual)

- [ ] Gantt tab is wide enough to show a useful timeline; horizontal scroll still works for long ranges  
- [ ] Search filters/finds by key and summary; clear restores list  
- [ ] SharePoint report defaults to visible issues; “include all” expands metrics/timeline  
- [ ] Preview matches downloaded HTML  
- [ ] Manual edit updates preview without regenerating  
- [ ] Generate then Refine then manual tweak all work  
- [ ] Without AI: export still works with metrics + typed summary  
- [ ] Downloaded HTML opens in a browser with no console scripts required  
- [ ] Copy HTML and optional PNG download work  

## Feasibility

**Feasible with medium effort.** Builds on existing Gantt data and export patterns. Main work: HTML builder + preview panel + search/width CSS. LLM is optional polish on top of the same provider stack.
