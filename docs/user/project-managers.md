# Project Managers — capacity planning

[← User Guide index](../END_USER_GUIDE.md)

Use **Project Managers** when you need a quick capacity view for people, reporter watches, saved presets, or custom JQL groups.

1. Add entries in **Settings → Contributor Metrics**.
2. Optionally set a **Capacity** target and **Due / overdue basis** for each entry.
3. Open **Project Managers**, choose which entries to show, then click **Refresh**.

Each card shows open issue count, capacity status, status/assignee breakdowns, and risk signals such as overdue, blocked, or stale work. Entries without a capacity target still appear; they just do not show an over/near/ok comparison.

Use **Save to Reports** to archive the current view, or download the planning summary as `.md` or `.csv`.

Two more tabs sit beside **Capacity**: **Gantt** for timelines and **Asks** for tracking stakeholder requests — see below.

## Gantt tab

The **Gantt** tab visualizes issue timelines with the following capabilities:

**Pinned Issues view** (default program selection)  
Pin any issue to the Gantt by opening its planning panel and checking **Pin to Gantt**. Pinned issues from across all programs appear together in this view. When no issues are pinned yet, an empty-state message explains how to pin.

**Zoom controls** — narrow or widen the visible date range: **30 day**, **3 mo**, **6 mo**, **1 yr**, or **All**. Whatever range you pick, the timeline scrolls horizontally within the chart for full-resolution bars — it never squeezes everything into one screen width, so bars stay a comfortable, comparable size regardless of range.

**Group by: Status or Story** — toggle how rows are organized. **Status** groups every issue by its actual workflow status (Backlog, Analyzing, Ready for Work, In Progress, Ready for Verification, Done/Closed/Resolved, etc.) — not just Jira's flattened To Do/In Progress/Done buckets. **Story** groups by hierarchy instead: any Story or Bug with Sub-tasks becomes a collapsible group showing its Sub-tasks nested underneath, so you can see a whole story's progress at a glance. Issues without Sub-tasks (or without a parent) just render as normal rows in either mode.

**Status filter chips** — every status actually present in the current view gets its own chip (colors match the same palette used on WIP bars and status breakdowns elsewhere in the app); click one to hide or show those rows. Filtering works the same way in both Status and Story grouping.

**Collapsible groups** — click a group header (a status bucket, or a story with Sub-tasks) to collapse or expand it.

**Overdue coloring** — non-Done issues whose due date is in the past are shown in red, overriding the status color.

**Status-history bars (hover)** — hover a bar (including a "no dates" row — most issues don't have a manually-tracked start/complete date, but this still works off Jira's own history) to load that issue's real status-transition timeline. The bar re-renders as colored segments — one per status it actually passed through, sized proportionally to how long it sat there — instead of one flat color for the whole span. Useful for spotting where a task actually stalled (e.g., "seven days in Ready for Work") rather than just its current status.

**Rich hover tooltip** — hovering a bar also shows the issue key, summary, status, assignee, requestor, dates, and plan delta (how many days ahead or behind the planned dates).

**Export** — download the current view (respecting active status filters) as **.md** or **.csv**.

**Wider chart** — the Gantt tab uses the full page width so timelines are easier to read. Long date ranges still scroll horizontally; bars are not squeezed to fit one screen.

**Search** — use the search box above the chart to filter rows by **issue key** or **summary** (case-insensitive). A count shows how many issues match; click **Clear** or delete the query to restore the full list (status filters still apply).

**SharePoint report** — click **SharePoint report…** in the toolbar to build a self-contained HTML status page for SharePoint or email:
- **Scope:** **Current view** (default — respects status filters and search) or **Entire plan** (all loaded issues).
- **Metrics** — auto-generated bullets (counts, overdue, timeline span).
- **Summary** — optional text you can type, or use **Generate AI Summary** / **Refine** when Chat is configured; works without AI using metrics + manual summary only.
- **Preview** — live preview matches the exported HTML (no scripts — safe for SharePoint).
- **Actions:** **Download HTML**, **Copy HTML**, or optional **Download chart PNG** for slides.

**Plan health** — click **Plan health…** for an on-time / overdue / re-planned report with saved snapshots; the source dropdown also accepts saved presets and custom JQL. See [Flow Report and Plan health](flow-report.md#plan-health-gantt). In the SharePoint report, tick **Include plan health** to add it to the export.

**Legend** — a small color legend at the top of the chart explains the Overdue color and the dashed Planned-bar style; the status filter chips double as the color legend for every status.

## Asks panel

Use the **Asks** tab to track requests from executives, product owners, and other stakeholders before they become Jira work — a personal parking lot so nothing said in a meeting or hallway gets lost.

1. Enter a **Title**, **Who asked** (for example, "VP Engineering" or "PO – Checkout"), and an optional **Note**, then click **Add**. The fields grow as you type.
2. Each open ask has these actions:

| Action | What it does |
|--------|----------------|
| **Create a task** | Opens **Create Issue** on Task Management with the ask's title and note filled in. When the issue is created, the ask is marked **Done** and linked to the new Jira key (click the key to open it in Jira). If linking fails, the ask stays open. |
| **Done** | Marks the ask complete without creating a Jira issue. |
| **Cancel** | Marks the ask canceled (for example, the request was withdrawn). |
| **Edit** / **Delete** | Change the title, who asked, or note; or remove the ask (asks for confirmation). |

Open asks are listed first; done and canceled asks show a status badge and can be **Reopen**ed or deleted. Use **Download CSV** to share the list (title, who asked, status, Jira key, note).

Asks are stored only in this machine's local database for the active Jira site. They are not shared with your team, and ask notes are never pushed to Jira — only the issue you create with **Create a task** goes to Jira.

## Planning panel fields

When you open an issue's planning panel in Project Managers, the available fields include:

- **Pin to Gantt** — a checkbox that adds the issue to the Pinned Issues view on the Gantt tab. Uncheck it to remove the issue from that view.

---

[← User Guide index](../END_USER_GUIDE.md)
