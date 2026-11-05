# Metrics — project-level view

[← User Guide index](../END_USER_GUIDE.md)

Use Metrics when you want to see how a whole project (or several) is tracking, not individual issue management. Some older docs and code still call this page "Dashboard."

## How to use it

1. **Select projects** — pick one or more Epic & JQL presets from the panel at the top (add or edit them in Settings → **Epic & JQL presets**)
2. **Optional due-date views** — set an upcoming window, past-due lookback, and which date field to compare against (see below)
3. **Contributor Metrics** *(optional)* — add people or custom queries to layer in on the **Individual contributors** tab (saved entries from Settings → **Contributor Metrics**, or type a display name directly). Not required — that tab already shows everyone from your selected projects with no extra setup; see [Individual contributors](#individual-contributors) below
4. **Choose views** — under **Views**, check which sections you want visible on the **Project metrics** tab (including separate toggles for upcoming vs past-due due-date cards)
5. Click **Refresh status** — the app pulls metrics from Jira and stores them

The stored snapshot stays until you click **Refresh status** again. The page loads from the last snapshot even if Jira is slow. You can navigate away while refresh runs — watch the top nav for **Refreshing dashboard** and return when it finishes.

The page itself is split into three tabs — **Project metrics**, **Individual contributors**, and **Reports** — all reading from the same snapshot, so one **Refresh status** updates all three.

## Jump to Task Management from Metrics

Many Metrics lists link into **Task Management** with filters already applied:

| Where you click | What opens in Task Management |
|-----------------|-------------------------|
| Issue key (upcoming / past-due lists, overdue items) | Table filtered to that key |
| Assignee name | Table filtered to that person |
| **Unassigned** (on a Project Metrics card) | Table filtered to unassigned tasks *within that project's card* — not every unassigned task app-wide |
| **Task Management** link on an epic or contributor | Filtered to that epic key or assignee |

Jira browse links (↗) still open the issue in Jira in a new tab.

## Optional due-date views

These filters are optional. **Refresh status** always updates resolution, workload, and overdue metrics; due-date sections appear only when you configure them.

| Control | What it does |
|---------|----------------|
| **Also include → Past Due Projects** | Adds missed-deadline project cards to Project Metrics and past-due rows to the past-due due-date list |
| **Show past due** (1 / 2 / 3 years) | How far back to look for past-due rows and epic past-due flags. Only applies when Past Due Projects is checked. Default: 1 year |
| **Show upcoming due dates** | None, 7 days, 2 weeks, 30 days, 90 days, or **Through custom date** (shows a date picker when custom is selected). Drives the **Upcoming Due Dates** card |
| **Compare against** | **Task due date**, **Most Recent Done Date**, or **Initial Done Date**. Task due dates take priority; when a task has no due date, the parent epic's compare field is used |

**Clear** buttons reset each row of options without affecting the others.

> **Tip:** Upcoming lists show only future due dates. Past-due rows appear in a separate card only when **Past Due Projects** is enabled.

## Project metrics

The default tab. Sections below are individually collapsible; toggle which ones appear under **Views** in Filters & Settings. Open/closed state is remembered per section.

**Overall Status**  
Summary cards — % tasks resolved, % in progress, % in backlog, % projects complete (epics with MRD/IDD set, including epics discovered inside JQL presets), and % open tasks overdue. Below the cards, count chips show total issues, overdue, resolved, and backlog at a glance. Shows for a single selected project too, scoped to just that project — not only when "View All" is active.

**Project Metrics**  
One card per epic/JQL preset showing:
- Issue completion %, in-progress % (when any tasks are in progress), backlog % (when any tasks are in backlog), epic %, overdue %
- **JQL presets** also show **Epics complete** (share of epics with MRD/IDD set) and an **Epics in scope** list with per-epic task completion and epic-done status
- Status breakdown (pie or bar chart — toggle under **Chart style**)
- Deadline dates (Initial Done Date, Most Recent Done Date, Project End Date) on epic presets
- Past due badge when a deadline has been missed (when Past Due Projects is enabled)
- Its own **Individual contributors — [project]** breakdown, scoped to just that project's issues

**Upcoming Due Dates** *(optional)*  
Blue-accent card listing open tasks with due dates from **today through** your selected upcoming cutoff, grouped by project → person. Each row shows issue type (Task, Epic, etc.), key, summary, and due date. Period summary chips break counts down by week or month.

**Past Due in lookback** *(optional)*  
Coral-accent card listing open tasks that missed their deadline within the selected lookback (1–3 years). Populated only when **Past Due Projects** is enabled. Empty state explains how to enable it.

## Individual contributors

Two panels, stacked — different sources, different scope:

**From your selected projects**  
Auto-derived from whatever's picked in **Select projects** above — no separate roster to pick, and no extra refresh click; it reads from the same snapshot **Refresh status** already pulled. Each person gets a compact row: name (links to Task Management filtered to them), then open/resolved/overdue counts. This is each person's work on *just these projects* — not their full Jira workload, so it can read lower than their real total if they also work outside your selected presets.

**Layered in — people, custom queries, and My Direct Reports**  
The chip-based roster from Settings → **Contributor Metrics** (or names typed directly in the Metrics filter panel), for rosters that span multiple projects or aren't covered by your project selection. Needs its own **Refresh contributors** click — it's a separate Jira query, not read from the Project Metrics snapshot. After refresh, each card shows a full pie/bar status breakdown, past-due and upcoming-due lists, and:

- **Person watches** — full Jira assignee workload (`assignee = "…"` search), not limited to the projects selected in step 1.
- **Custom query watches** — metrics come from the watch JQL as written (same scope you defined in Settings).

The two panels can overlap — a person auto-derived from your projects may also appear layered in with a different (larger) total. That's expected; each source keeps its own numbers.

## Reports

**Flow Report** — the **Flow Report** card on this page shows created vs. resolved, lead and cycle time, aging and stalled work for the selected projects and all assignees. See [Flow Report and Plan health](flow-report.md).

**Generate Report**  
Choose an audience and click Generate:

| Audience | Written for |
|----------|------------|
| Executive Summary | Senior leadership — highlights, risks, action items |
| Project Manager Summary | Deadline realism, stakeholder impact, delay risks, stand-up summaries, and closeout reports |
| Developer Report | Team workload and WIP, plus a full status breakdown per contributor (not just overdue) — pulled from whichever projects are selected above, same as the Individual contributors tab |
| Ad-hoc team report | A manager's direct reports specifically — uses Settings → **My Direct Reports**, not the project presets selected above. Select those chips under Contributor Metrics and **Refresh contributors** first |

Project-scoped audiences (Executive Summary, Project Manager Summary, Developer Report) can report on one project or several — use the project tabs above the audience cards to pick. Reports include an optional status chart when Metrics data supports it. Use **Copy**, **Download .md**, or **Clear report** (removes the report from this page only — archived copies remain in **Past Reports**). Generation continues in the background if you leave the page.

**Weekly digest** (same tab, below the LLM reports)  
Snapshot-based stand-up brief — overdue/upcoming highlights, contributor load, and project health. **No LLM required.** Click **Generate weekly digest** after a Metrics refresh, then copy, download, or **Clear report**.

---

[← User Guide index](../END_USER_GUIDE.md)
