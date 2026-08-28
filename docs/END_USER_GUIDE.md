# The Docket — User Guide

This guide covers how to use the app day-to-day. No programming knowledge needed.

---

## Using The Docket in the browser (when the desktop app is unavailable)

If the packaged desktop app or Electron window is unavailable or blocked (for example on a corporate secure laptop, by macOS, or by work security software), use the **browser UI** instead and install it as its own application window. You get the same pages; only the window chrome is different.

### Start the app

From the project folder, in a terminal:

```bash
npm run dev:all
```

Leave that terminal open. Then open **http://localhost:5173** in Chrome or Edge.

### Install as its own application window

Chrome and Edge can open the site in a standalone window (similar to Microsoft 365 as an app), with a Dock / taskbar icon:

**Google Chrome**

1. Open **http://localhost:5173** while `npm run dev:all` is running.
2. Menu (**⋮**) → **Cast, save, and share** → **Install page as app…**  
   (wording may vary slightly by Chrome version; look for **Install app** / **Install The Docket**).
3. Confirm. A separate window opens; you can pin it to the Dock.

**Microsoft Edge**

1. Open **http://localhost:5173**.
2. Menu (**⋯**) → **Apps** → **Install this site as an app**.
3. Name it **The Docket** if prompted, then install.

**Safari (macOS)**

With the site open: **File → Add to Dock** (label may vary by macOS version).

### Important

- The installed window still needs **`npm run dev:all` running** in a terminal. If you quit that process, the app cannot reach Jira or save notes.
- Prefer Chrome or Edge for “Install as app.” The install dialog shows the name **The Docket** and the app icon (not “localhost”).
- For packaged DMG/NSIS that warn on first open (unsigned builds), see [unsigned-installs.md](./unsigned-installs.md).

---

## The six tabs

```
Task Management  |  Metrics  |  Project Managers  |  Past Reports  |  Chat  |  Settings
```

Navigate between them using the menu at the top of the screen.

---

## Settings — do this first

Before anything else works, your Jira credentials need to be in place.

**Developers (browser or desktop dev):** copy `.env.example` to `.env` in the project folder and fill in Jira credentials — see [JIRA_SETUP.md](./JIRA_SETUP.md).

**Packaged desktop app (Mac or Windows installer):** on first launch the app creates a template `.env` in your user data folder. Edit that file and restart. The Mac `.dmg` is universal — one installer for Intel and Apple Silicon Macs; no need to pick a chip type.

| OS | Open this file |
|----|----------------|
| macOS | `~/Library/Application Support/The Docket/.env` |
| Windows | `%APPDATA%\The Docket\.env` |

Then in the app:

1. Go to **Settings**
2. Click **Test Jira Connection**
3. If it shows ✓ Connected — you're good. Skip to Task Management below.
4. If it fails, check that your `.env` file has the right values (see [JIRA_SETUP.md](./JIRA_SETUP.md)).

### Epic & JQL presets

These are the named saved searches that power everything else. Add them once in Settings; they'll appear in Task Management, Metrics, and Chat.

| Preset type | Use when |
|-------------|----------|
| **Epic** | You want metrics tied to a specific Jira epic (PROJ-1234) |
| **JQL** | You want a custom search — e.g. all issues assigned to you |

To add a preset:
1. Settings → **Epic & JQL presets** section
2. Choose type, fill in the label and JQL or epic key
3. Click **Add preset**

**Share presets with your team:** use **Export team pack** to download a JSON file of all epic/JQL presets. New teammates click **Import team pack** and choose **merge** (add new, skip duplicates) or **replace** (overwrite all local presets). Align with your team's canonical preset list or `npm run seed:presets` for admins — see [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md).

### Contributor Metrics

Add team members here by Jira display name so **Metrics** can track workload and overdue rate. You can also add reporter watches, saved preset watches, or custom JQL groups. Optional capacity targets appear on the **Project Managers** tab.

### Chat instructions

Optional. Anything you type here is added to every Chat conversation. Example:
```
Keep answers short. Always include the issue key. Use bullet points.
```

---

## Task Management — daily driver

This is the main screen for managing your open work.

```
┌──────────────────────────────────────┐
│  Header: jokes · date · to do       │
├──────────────────────────────────────┤
│  🗂️ The Docket  [collapsible]        │
│    [Create Issue]                    │
│    JQL inputs + Run JQL              │
├──────────────────────────────────────┤
│  📊 My Metrics  [collapsible]        │
│    Per-query summary + AI report     │
├──────────────────────────────────────┤
│  🗓️ Help me plan my week [collapsible]│
│    4 questions → AI day-by-day plan  │
├──────────────────────────────────────┤
│  Results table                       │
└──────────────────────────────────────┘
```

### Header

- **Header banners** (optional) — at the top of Task Management, toggle **Joke ticker** and/or **My upcoming due dates**. The due-date banner lists **only your** assigned issues (matched by your Jira display name) from the latest Metrics snapshot's upcoming due-date window. Refresh Metrics after changing due-date filters or if the banner is empty when you expect tasks. Same toggles in **Settings → Task Management header**.
- **Date & calendar** — shows today; useful when planning.
- **To Do** — supports up to 15 active to-dos. Each to-do has a text field, a priority (P1–P5), a due date, and a done checkbox. Active to-dos are sorted automatically by priority then due date — changing a priority immediately re-orders the list. A **Clear completed** button appears below the list whenever any to-dos are checked done; clicking it removes all completed items at once. To-dos are saved to your local database and are never sent to Jira.
- **Hide calendar & to do / Show calendar & to do** — click the link under the date to collapse or expand the calendar, to do, and week-plan panel together; that state is remembered too.

### The Docket card

1. **JQL count** — choose 1–5 query slots. Each has a label (your name for it) and a JQL box.
2. **Max results** — first page size per query. The app can load **all** matching issues (up to a safe cap) — see Results table below.
3. **Notes on run** — choose how row notes are filled when you **Run JQL** or refresh:
   - **Keep local notes** (default) — notes come from your local database for issues in the result set.
   - **Pull most recent Jira comment** — overwrites each row's **Notes** text with that issue's latest Jira comment. Attached files are not changed. Use **Clear** to reset to **Keep local notes**.
4. **Run JQL** — loads fresh results from Jira, merges local (or shared-program) priorities, and saves results locally. Shortcut: **Ctrl+Enter** (Windows/Linux) or **⌘+Enter** (Mac).
5. **Reset Saved Queries** — clears JQL text, labels, and the cached table. Does *not* delete your notes, priorities, or reminders in the local database.
6. **Create Issue** — opens a modal to create a new Jira issue in your Jira project. See [Create Issue](#create-issue) below for parent selection and issue rules. In short: pick a preset or parent, enter a title, then click **✦ AI Draft** (blue button next to the Description label) to generate a description and, for Stories, a suggested sub-task list:
   - **Story**: AI rewrites the title into Job Story format ("When… I want… so I can…") if it isn't already, and generates a description that expands on the situation, motivation, and desired outcome. 2–5 suggested sub-tasks appear as editable checkboxes; uncheck any you don't want before clicking Create.
   - **Bug**: AI generates a structured description covering what is broken, steps to reproduce, expected vs actual, environment, and any known workaround. A suggested priority (Low / Medium / High / Critical) appears based on project severity definitions.
   - **Task**: AI generates a plain description.
   - The **Create** button label updates to show "Create + N subtasks" when Story sub-tasks are selected. Sub-tasks are created as **Task** type with the new story as parent (linked in the Task → Story → Epic chain); the success message lists each with its issue key and a link to open the new issue in Jira.

### Create Issue

Use **Create Issue** on Task Management when you want a new Story, Task, or Bug in your Jira project without leaving the app.

**1. Choose a starting point (Epic preset dropdown)**

| Option | What it does |
|--------|----------------|
| **Epic preset** | Loads that epic and its stories as parent choices. Story/Bug parents default to the epic; Task parents pick a story under the epic. |
| **Saved query (JQL preset)** | Runs the preset's JQL (e.g. Dev Team, My Current Issues), lists matching issues, and derives parent chains (Task → Story → Epic). Pick an issue from the query, an epic/story parent, or enter a parent key manually. |
| **Enter issue key manually** | Type a Jira key: Epic for Story/Bug, Story for Task. The app validates the key before unlocking the form. |

The modal pre-selects a preset when you open it from an active Task Management JQL tab that matches a saved preset.

**2. Parent rules**

| Issue type | Required parent |
|------------|-----------------|
| Story | Epic (including types like **Epic (Feature)**) |
| Bug | Epic only |
| Task | Story |

**3. Fill in details**

- **Use AI helper** — optional checkbox above the Title. Ticking it opens a guided form so you can answer the standard prompts in your own words instead of writing a title from scratch:
  - **Story** — *As a*, *I want*, *So that* are required; goal/why now, success criteria, in/out of scope, constraints, systems affected, and open questions are optional.
  - **Bug** — what is broken, expected, and actual behavior are required; steps, environment, impact, and workaround are optional.
  - **Task** — what needs doing and why it matters are required; definition of done, constraints, and components touched are optional.

  Only the basic ask is required — leave any optional prompt blank and the AI omits that section rather than guessing. Blank prompts are listed back to you as a reminder to finish them on the Jira issue after it is created. With the helper on, **Title** becomes optional: click **✦ AI Draft** and the AI writes the title (Job Story format for Stories) and description from your answers. Everything it produces stays editable before you create.
- **Title** — required unless the AI helper is on. Stories should use Job Story format; AI Draft can rewrite and ask 2–3 clarification questions if the ask/goal is unclear.
- **Components**, **Vertical Components** — choose from the dropdown. **Components** must already exist on your Jira project (free-text names are rejected).
- **BUG Tracking** (Bug only) — pick a default or type a custom value.
- **Description** — use **✦ AI Draft** or write your own. Description and goal validation errors (including “story not fully defined”) appear **below the Description field**, not at the top of the modal.
- **Priority** (Bug only) — required on create.
- **Assignee** — optional for Task/Bug. Stories stay unassigned; when AI Draft suggests sub-tasks, a **Subtask assignee** field appears and applies to all checked sub-tasks.

**4. After create**

On success, use **Add more detail in Jira** to open the new issue in your browser. Story sub-tasks you left checked are created under the new story (parent-linked as Task → Story → Epic) and listed in the success message.

**If create fails:** fix errors shown in the modal — parent/title issues at the top; description/goal issues under Description — then click **Create** again. The button stays available after validation errors once a valid parent and title are set.

> **Background work:** Metrics refresh, report generation, week plan, project report, and **Run JQL** keep running if you switch pages. A yellow status pill in the top nav shows what's in progress. Return to the page when it finishes — results are saved automatically.

> **Tip:** Click the **🗂️ The Docket** header to collapse/expand the whole section once your queries are saved.

### My Metrics

Appears after you Run JQL and get results. Shows:
- Issue count chips (total, open, overdue, in progress) per query
- A **📄 Project Report** section inside each query — click to expand, choose a **report scope**, a **report type**, then **Generate Report**:
  - **Report scope** — what data the report is built from: **Current query results** (this slot, as loaded), **All my assigned work** (past 3/6/12 months — includes an issue if it had a status change, a reassignment, a note added in this app, or a comment added directly in Jira within that window; not just any Jira field update, and not limited to activity made through this app), or any other configured query slot on this page. Choosing a scope other than "Current query results" runs its own fresh Jira search rather than reusing what's already loaded.
  - **Status Report** *(default)* — AI-written summary *from your perspective as the assignee*: how the project is tracking, what needs attention, next steps. Reads the scope's label and JQL to frame the report correctly — a closed-work scope gets a completed-work recap instead of being asked about "what needs attention"
  - **1:1 Prep** — talking points for discussing your work with management (direct, skip-level, or otherwise) in a weekly or biweekly 1:1: workload, consistency, completion rate, potential blockers, and items to discuss now vs. coming up. Upward-facing, not a personal daily-standup recap
  - **PWB Review** — first-person self-assessment prose for a quarterly, mid-year, or yearly PWB review (choose the period once selected)
  - For 1:1 Prep and PWB Review, you can optionally add **your goals** and/or your **company/team goals** — the report will note where your work supports them, and honestly flag anything that seems disconnected. All three report types can reference your organization's cultural behaviors where the work genuinely demonstrates one, never as a forced checklist. Goals you enter are saved automatically (on this machine) so you don't have to retype them next time — each field shows a **Clear** button once it has text, for removing a saved value.
  - **Status hygiene check:** all three report types check whether any of your top-priority Backlog items have a Jira comment within the last 14 days — a sign real work is happening even though the status was never updated. When that happens, the report names the item and suggests updating its status, so workload snapshots and self-assessments (this one and future ones) read accurately at a glance.
- When a report is showing, use **Clear report** in the report header to remove it from this page only (does not delete copies in **Past Reports**)

> The badge in the **📊 My Metrics** header shows your total open issue count at a glance.

### Help me plan my week

Click **🗓️ Help me plan my week** to expand. Answer a few questions:

| # | Question | Example answer |
|---|----------|---------------|
| 1 | How do you want to approach this week? | "Balance across projects" |
| 2 | How many hours available? | 32 |
| 3 | Fixed commitments or blockers? | "Deployment Thursday" |
| 4 | Any other context? | "Need to prep for Friday review" |
| 5 | Include a prior CoWork weekly plan? (optional) | Pick a `weekly-plan-*.md` from the data folder, or **None** |

Question 5 lists CoWork files already in the app data folder (same as **Past Reports → Files**). If you pick one, its content is sent as prior-plan context so the new plan can refine it against your current JQL tasks.

Click **Continue →**, then **Generate week plan**. The result is a Monday–Friday plan using your actual issue keys. Copy, download, **Clear report** (removes the plan text from this page only), or **Start over** to reset the questions.

### Results table

Each row is one Jira issue. What you can do per row:

| Action | How |
|--------|-----|
| Change **status** in Jira | Dropdown → **Update Status** |
| Change **assignee** in Jira | Type a **display name, email, or username** in the Assignee box — suggestions appear as you type from Jira user search and assignees already in the table. Press **Enter** or click **Update Assignee** |
| Change **Due date** or **MRD** in Jira | Date picker in the **Dates** column → **Update**. Each field pushes to Jira independently — editing Due date doesn't touch MRD and vice versa. Clear a date and click Update to unset it in Jira |
| Set a **Start date** (local) | Date picker in the **Dates** column, third row — saves automatically, no Update button. Not a Jira field; used for Gantt-chart views. On shared projects linked to a shared program, this syncs the same way priority does — see [Shared projects](#shared-projects--notes-and-priority-pms-and-managers) below |
| Set personal **priority** (P1–P20) | Priority dropdown — P1 = most urgent, P20 = least. A **Jira** badge means priority was set from the latest comment on **Run JQL** |
| Write a **note** (local) | Type in the Notes box — text saves automatically. Supports **markdown**: `**bold**`, `*italic*`, `` `code` ``, `[links](url)`, `-` bullet lists, `1.` numbered lists, `#` headings — all render properly once pushed to Jira, not as literal asterisks/hashes |
| **Pop out** the notes box | Click the **⤢** button in the corner of the Notes cell to open a larger editor (720×600, not squeezed into the table cell). Typing there is the same draft as the inline box — either one updates the other live. Close with **Done**, the backdrop, or **Esc** |
| Add **files** to a note | **Add file** button, paste while the notes area is focused (images only), or drag-and-drop onto the notes cell. Up to **5** files per note; **5 MB** each — images (PNG, JPEG, GIF, WebP) plus TXT, PDF, DOC/DOCX, XLSX, and CSV |
| **Keep on this machine** (attachments) | Optional checkbox below the notes box. Off by default — attachments stay until you **Push note** or close/refresh the tab. Turn on to keep draft files on this machine across reloads |
| Push note to Jira as a **comment** | Check the row checkbox → **Push note** (or **Push Selected** for multiple). Sends note text and attachments inline in the Jira comment (same as images for documents); local copies are cleared after a successful push |
| Filter visible rows | **Filter by key**, **Status**, or **Assignee** above the table; **Clear filters** resets all three |
| Page through results | **First / Prev / Next / Last** below the table (30 rows per page) |
| Load more issues | When the status line shows **Loaded X of Y** and Y is larger than X, click **Load remaining** |

**Load status:** After **Run JQL**, the line above the table shows **Loaded X of Y matched** (how many rows are in the table vs how many Jira matched). If your query returns more than the first batch, click **Load remaining** to fetch the rest (up to a documented safe cap).

**Deep links from Metrics:** Opening Task Management from Metrics (`?key=PROJ-123` or `?assignee=Name`) applies table filters automatically.

- **Issue key** — the app fetches that issue from Jira and opens a green **Drill-down: PROJ-123** tab (first tab), even if the issue also appears in your saved JQL results.
- **Assignee name** — if that person is not already in your saved JQL results, the app runs `assignee = "Name"` in Jira and opens a **Drill-down: Name** tab with their tasks. If their issues are already loaded in a JQL tab, that tab is selected and filtered by assignee instead.

A green banner confirms the active drill-down. Use **Clear filter** to remove the Metrics filter from the URL while keeping any drill-down tabs you opened in this browser session. Use the small **x** on an individual green drill-down tab to remove only that tab.

**Dates column:** One column stacks three date fields per row — **Due** (Jira's standard due date), **MRD** (hover for "Most Recent Done Date," the same field mapping used by Metrics — `customfield_10009` by default), and **Start** (local-only, see the table above). When a row's own Due date is empty, a small hint shows the inherited value used for overdue calculations elsewhere in the app (**My Metrics**, Chat context): the task's own MRD if set, otherwise the first ancestor's MRD found by walking the **parent chain** (for example Story → Epic). Editing Due or MRD here writes directly to Jira; it doesn't change that inheritance behavior for other rows.

**Parent column:** Sits right after **Key** — links to the issue's parent (Story or Epic) when Jira reports one.

On **shared projects**, link a Task Management slot to a **Shared program** (when the Atlas demo or future MySQL team DB is configured) so priorities sync across machines. Otherwise use local priority + the priority tracker CSV import — see [Shared projects — notes and priority](#shared-projects--notes-and-priority-pms-and-managers) below.

**Closed/resolved issues are read-only** — you can read them but not edit them.

**Priority colors:** rows glow warmer colors for higher priorities (P1–P3) and cooler/neutral for lower ones. P0 = no color, just unranked.

---

## Metrics — project-level view

Use Metrics when you want to see how a whole project (or several) is tracking, not individual issue management. Some older docs and code still call this page "Dashboard."

### How to use it

1. **Select projects** — pick one or more Epic & JQL presets from the panel at the top (add or edit them in Settings → **Epic & JQL presets**)
2. **Optional due-date views** — set an upcoming window, past-due lookback, and which date field to compare against (see below)
3. **Contributor Metrics** *(optional)* — add people or custom queries to layer in on the **Individual contributors** tab (saved entries from Settings → **Contributor Metrics**, or type a display name directly). Not required — that tab already shows everyone from your selected projects with no extra setup; see [Individual contributors](#individual-contributors) below
4. **Choose views** — under **Views**, check which sections you want visible on the **Project metrics** tab (including separate toggles for upcoming vs past-due due-date cards)
5. Click **Refresh status** — the app pulls metrics from Jira and stores them

The stored snapshot stays until you click **Refresh status** again. The page loads from the last snapshot even if Jira is slow. You can navigate away while refresh runs — watch the top nav for **Refreshing dashboard** and return when it finishes.

The page itself is split into three tabs — **Project metrics**, **Individual contributors**, and **Reports** — all reading from the same snapshot, so one **Refresh status** updates all three.

### Jump to Task Management from Metrics

Many Metrics lists link into **Task Management** with filters already applied:

| Where you click | What opens in Task Management |
|-----------------|-------------------------|
| Issue key (upcoming / past-due lists, overdue items) | Table filtered to that key |
| Assignee name | Table filtered to that person |
| **Unassigned** (on a Project Metrics card) | Table filtered to unassigned tasks *within that project's card* — not every unassigned task app-wide |
| **Task Management** link on an epic or contributor | Filtered to that epic key or assignee |

Jira browse links (↗) still open the issue in Jira in a new tab.

### Optional due-date views

These filters are optional. **Refresh status** always updates resolution, workload, and overdue metrics; due-date sections appear only when you configure them.

| Control | What it does |
|---------|----------------|
| **Also include → Past Due Projects** | Adds missed-deadline project cards to Project Metrics and past-due rows to the past-due due-date list |
| **Show past due** (1 / 2 / 3 years) | How far back to look for past-due rows and epic past-due flags. Only applies when Past Due Projects is checked. Default: 1 year |
| **Show upcoming due dates** | None, 7 days, 2 weeks, 30 days, 90 days, or **Through custom date** (shows a date picker when custom is selected). Drives the **Upcoming Due Dates** card |
| **Compare against** | **Task due date**, **Most Recent Done Date**, or **Initial Done Date**. Task due dates take priority; when a task has no due date, the parent epic's compare field is used |

**Clear** buttons reset each row of options without affecting the others.

> **Tip:** Upcoming lists show only future due dates. Past-due rows appear in a separate card only when **Past Due Projects** is enabled.

### Project metrics

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

### Individual contributors

Two panels, stacked — different sources, different scope:

**From your selected projects**  
Auto-derived from whatever's picked in **Select projects** above — no separate roster to pick, and no extra refresh click; it reads from the same snapshot **Refresh status** already pulled. Each person gets a compact row: name (links to Task Management filtered to them), then open/resolved/overdue counts. This is each person's work on *just these projects* — not their full Jira workload, so it can read lower than their real total if they also work outside your selected presets.

**Layered in — people, custom queries, and My Direct Reports**  
The chip-based roster from Settings → **Contributor Metrics** (or names typed directly in the Metrics filter panel), for rosters that span multiple projects or aren't covered by your project selection. Needs its own **Refresh contributors** click — it's a separate Jira query, not read from the Project Metrics snapshot. After refresh, each card shows a full pie/bar status breakdown, past-due and upcoming-due lists, and:

- **Person watches** — full Jira assignee workload (`assignee = "…"` search), not limited to the projects selected in step 1.
- **Custom query watches** — metrics come from the watch JQL as written (same scope you defined in Settings).

The two panels can overlap — a person auto-derived from your projects may also appear layered in with a different (larger) total. That's expected; each source keeps its own numbers.

### Reports

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

## Project Managers — capacity planning

Use **Project Managers** when you need a quick capacity view for people, reporter watches, saved presets, or custom JQL groups.

1. Add entries in **Settings → Contributor Metrics**.
2. Optionally set a **Capacity** target and **Due / overdue basis** for each entry.
3. Open **Project Managers**, choose which entries to show, then click **Refresh**.

Each card shows open issue count, capacity status, status/assignee breakdowns, and risk signals such as overdue, blocked, or stale work. Entries without a capacity target still appear; they just do not show an over/near/ok comparison.

Use **Save to Reports** to archive the current view, or download the planning summary as `.md` or `.csv`.

### Gantt tab

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

**Legend** — a small color legend at the top of the chart explains the Overdue color and the dashed Planned-bar style; the status filter chips double as the color legend for every status.

### Asks panel

The text inputs for **Title**, **Who Asked**, and **Note** in the Asks panel auto-expand as you type — each field grows to fit your text rather than requiring you to scroll within a cramped fixed-height box.

### Planning panel fields

When you open an issue's planning panel in Project Managers, the available fields include:

- **Pin to Gantt** — a checkbox that adds the issue to the Pinned Issues view on the Gantt tab. Uncheck it to remove the issue from that view.

---

## Past Reports — saved outputs

**Past Reports** lists every report the app has archived on this machine. Open it from the top nav.

| Tab | Contents |
|-----|----------|
| **Task Management** | Project reports and week plans (saved automatically when you click Generate). Also includes a **Completed To Dos** section showing completed to-dos with date range filter chips: **Last 30 days**, **Last 90 days**, **All time** (default is last 90 days). |
| **Dashboard** | Executive / PM / Developer audience reports (saved automatically on Generate) |
| **Ad-hoc** | Chat assistant replies you explicitly saved with **Save to Past Reports** |
| **Files** | Live list of CoWork `weekly-plan-*.md` files in the data folder (read from disk; optional **Save to archive**) |

For each tab: pick a row → **View** → expand the report to read, copy, or download. Dashboard archived reports may include the status chart that was shown at generation time.

**Deleting:** Task Management, Dashboard, and Ad-hoc each have a **Delete** button per row and a **Delete all** button for the whole tab (both ask for confirmation first — this cannot be undone). **Files** never deletes the actual file on disk; instead, a file that's already been **Save to archive**d shows a **Remove from archive** button (and a **Remove all from archive** button appears once at least one file has an archived copy) that removes just the saved database copy — the file itself is untouched. Files with no archived copy show neither button, since there's nothing to remove; use **Save to archive** first if you want a removable copy.

**CoWork weekly plans:** When Claude CoWork writes `weekly-plan-<date>.md` into the app's `data/` folder, those files show under **Files**. Content is read live from disk until you click **Save to archive**, which copies it into the local Past Reports database as a week plan (so it remains after the file is moved or deleted).

**Clear report** on Task Management or Metrics removes the on-page copy and browser cache only — it does **not** delete items already listed here.

---

## Chat — ask Jira questions

Chat lets you ask natural-language questions about your Jira data. Each message sends:

- **Epic filter selection** — same presets as Metrics (scopes live Jira searches)
- **Task Management JQL results** — cached from the last time you ran JQL (labels, counts, top open issues; past due vs upcoming tagged separately)
- **Metrics snapshot** — data from the last **Refresh status** (refreshed when you send a Chat message)
- **Generated reports and plans** — project reports, Metrics reports, and week plans you generated in this browser (last 8)

### How to use it

1. Go to **Chat**
2. Select presets in the filter panel (optional but helps scope Jira searches)
3. Type a question and press Enter or click **Send**
4. On any assistant reply, click **Save to Past Reports** to archive it under **Past Reports → Ad-hoc** (optional — Chat does not auto-save replies)

For the best experience, run JQL on Task Management, refresh Metrics, or generate a report/plan **before** asking Chat to summarize or reference that work.

**Example questions:**
- "Which epics are past due?"
- "How many upcoming vs past due tasks are in my metrics snapshot?"
- "Summarize open work for the selected epics"
- "Who has the most overdue tasks in my My Work query?"
- "What's the status of PROJ-1234?"
- "What did my week plan say about Tuesday?"
- "Summarize the executive report I generated on Metrics"

The assistant uses session context first when you ask about reports or queries you already ran. For anything outside that context, it searches Jira directly and will say when it does not have data rather than guessing.

### Provider setup (developers)

| Setup | What you need |
|-------|----------------|
| **Anthropic** | `CHAT_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` in `.env` on the proxy host |
| **OpenAI / Databricks** | `CHAT_PROVIDER=openai` + `OPENAI_API_KEY` (+ optional `OPENAI_BASE_URL`) |
| **Ollama (local)** | `CHAT_PROVIDER=ollama` + `OLLAMA_BASE_URL` |
| **Any OpenAI-compatible API** | `CHAT_PROVIDER=openai` + `OPENAI_API_KEY` + `OPENAI_BASE_URL` |
| **Rovo (opt-in)** | `CHAT_PROVIDER=rovo` + OAuth vars — see [JIRA_SETUP.md](./JIRA_SETUP.md) §8 |
| **Disabled / not configured** | `CHAT_PROVIDER=disabled` or leave unset |

Check readiness: `GET /api/chat/status` returns `provider`, `ready`, and for Rovo also `oauthConfigured` and `oauthConnected`.

### Rovo sign-in (when `CHAT_PROVIDER=rovo`)

1. In Chat, click **Sign in with Atlassian** (calls `GET /api/chat/auth/start?format=json` and opens the authorize URL).
2. Approve the requested scopes (`read:jira-work`, `write:jira-work`, `offline_access`, `search:rovo:mcp`, `read:me`).
3. Return to Chat after the callback page confirms sign-in.

**Re-sign-in:** Use **Sign out** in Chat (`POST /api/chat/auth/signout`), then sign in again — needed after scope changes, token expiry issues, or switching Atlassian accounts.

**Fallback:** If Rovo MCP is unavailable or you are not signed in, chat still works when an LLM key is configured on the proxy. The reply may include a short note that the answer came from the LLM fallback instead of Rovo.

**Note:** If Chat shows a warning and `ready` is false, set `CHAT_PROVIDER` and the matching API key in `.env`, or complete Atlassian sign-in for Rovo.

---

## Shared projects — notes and priority (PMs and managers)

Some teams used a shared Excel tracker so everyone sees the same ranking. In The Docket:

| What | Shared across the team? |
|------|-------------------------|
| Status and assignee changes | Yes — in Jira |
| Notes you **push** as Jira comments | Yes — visible on the issue in Jira (text and inline attachments) |
| Local **Notes** box (before push) | No — your machine only |
| Note **attachments** (before push) | No — your machine only unless **Keep on this machine** is on |
| **Priority** on a personal Task Management slot | No — local SQLite on this machine |
| **Priority** on a slot linked to a **Shared program** | Yes — Atlas demo today (Team badge); MySQL long-term |
| **Start date** on a personal Task Management slot | No — local SQLite on this machine |
| **Start date** on a slot linked to a **Shared program** | Yes — same Atlas/MySQL split as Priority |
| **Due date** and **MRD** | Always — real Jira fields, editing them writes straight to Jira regardless of slot type |

### Shared-program slots (recommended for team ranking)

1. Configure the team priority demo (`TEAM_PRIORITY_MONGODB_URI`) or wait for production MySQL sync.
2. In Settings, seed shared programs if needed; optionally **Import team priorities** with target **Atlas (demo)** or **Seed from local priorities**.
3. On Task Management, set the slot’s **Shared program**.
4. Change **Priority** as usual — it saves to the shared store immediately. Rows show a **Team** badge when priority comes from that store.
5. **Run JQL** on that slot loads priorities from the shared store (not from Jira comments).

Personal slots (Shared program = None) keep using local SQLite only.

### Notes vs priority

Push notes as Jira comments when the team needs the text in Jira. Priority is **not** parsed from comment text anymore — use a shared-program slot (or local/CSV import) for ranking.

### Bootstrap from the priority tracker

PMs can keep rankings in the priority tracker spreadsheet and share a **CSV** export:

1. In Excel: **File → Save As → CSV UTF-8** (columns: `Priority`, `Issue Key`, `Developer`, `Jira Status`, `notes`).
2. In The Docket: **Settings → Import team priorities** → choose target (**This machine** or **Atlas (demo)** when connected) → **Import CSV**.
3. Matching issue keys overwrite priority for that target. **Notes** fill in only when importing to this machine and the local note is empty.
4. Re-import when spreadsheet rankings change. Reload Task Management (or re-run JQL) if that page is already open.

**Developers:** Manual export/backup of SQLite is documented in [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) — that is for backup or handoff, not live multi-user editing.

---

## Where your data lives

| Data | Stored where | Shared with Jira? |
|------|-------------|-------------------|
| JQL inputs, labels, table snapshot | This browser only (`localStorage`) | No |
| Task Management drill-down tabs | This browser session only (`sessionStorage`) | No |
| On-page report/plan display (before archive) | This browser only (`localStorage`) | No |
| **Past Reports** archive | Local file (`data/workweek.sqlite` → `generated_reports`), saved with your browser's local timestamp/timezone | No |
| Chat session artifacts (for Chat context) | This browser only (`localStorage`) | No |
| Desktop app credentials + DB (packaged) | `%APPDATA%\The Docket\` (Windows) or `~/Library/Application Support/The Docket/` (Mac) | No |
| To-dos (Header To Do panel) | Local file (`data/workweek.sqlite`) | No |
| Issue notes + priorities (P1–P20) | Local file (`data/workweek.sqlite`); shared-program slots use Atlas demo / future MySQL | No for personal slots — see [Shared projects](#shared-projects--notes-and-priority-pms-and-managers) |
| Start date (ad-hoc, for Gantt views) | Local file (`data/workweek.sqlite`); shared-program slots use Atlas demo / future MySQL, same as priority | No for personal slots |
| Note attachments (**Keep on this machine**) | Local file (`data/note-images/` + SQLite) | No — cleared after a successful **Push note** |
| Epic/JQL preset team pack (export/import) | JSON file you save/share | No |
| Metrics snapshot | Local file (`data/workweek.sqlite`) | No |
| Status/assignee changes | Jira | Yes |
| Due date / MRD changes | Jira | Yes |
| Notes you push as comments | Jira | Yes — text and attachments; priority is not read from comments |

---

## Common questions

**The table is empty after Run JQL**
Your JQL returned no results, or filters are hiding rows. Check **Loaded X of Y** — if Y > X, click **Load remaining**. Try widening the JQL in Jira's own search first to confirm issues exist.

**I left the page while a refresh or report was running**
That's fine — work continues in the background. Look for the yellow pill in the top nav. Return to Metrics or Task Management when it finishes; refresh updates the stored snapshot, and reports/plans are saved to this browser.

**How do we share the same epic/JQL presets across the team?**
One person exports a **team pack** from Settings; others **Import team pack** (merge or replace). See [Epic & JQL presets](#epic--jql-presets) above.

**"Showing saved results" banner appears**
That's normal — the table was restored from the last time you ran JQL. Click **Run JQL** to get fresh data.

**My notes disappeared on another computer**
Expected. Notes are stored in a local file on the machine you started the app on. Use one machine, or ask a developer about exporting the SQLite file. For **shared ranking**, link a Task Management slot to a Shared program (or import CSV to Atlas) — see [Shared projects — notes and priority](#shared-projects--notes-and-priority-pms-and-managers).

**How do we share priority on a project like we did in Excel?**
Link the Task Management slot to a **Shared program** so priority reads/writes the team store (Atlas demo today). Or **Settings → Import team priorities** from the priority tracker CSV (local or Atlas). See [Shared projects — notes and priority](#shared-projects--notes-and-priority-pms-and-managers).

**The Push note button is greyed out**
You've already pushed that exact note (text and attachments) as a comment. Edit the note or change attached files and the button will re-enable.

**Chat gave a generic answer about my report**
Generate the report or week plan first on Task Management or Metrics, then ask Chat in the same browser. Session context is stored locally when you click Generate — it is not sent to a third-party cloud beyond your configured LLM provider.

**What's the difference between Clear report and Past Reports?**
**Clear report** removes the report from the Task Management or Metrics page (and its browser cache). **Past Reports** keeps everything saved to the local database when you generated a report/plan, or when you clicked **Save to Past Reports** on a Chat reply. Clearing on-page does not delete archived rows.

**Chat says it's not ready**
For Anthropic/OpenAI/Ollama: set `CHAT_PROVIDER` and the matching API key in `.env` on the proxy host. For Rovo: set OAuth vars, sign in with Atlassian from Chat, or configure an LLM fallback key. See [JIRA_SETUP.md](./JIRA_SETUP.md) §8.

**Metrics look stale**
Click **Refresh status** after changing presets, due-date options, or watched people. A banner appears when filters differ from the stored snapshot.

**I only see upcoming tasks, not past due**
Past due rows are in a separate **Past Due in lookback** card. Enable **Also include → Past Due Projects**, choose a lookback (1–3 years), refresh, and turn on **Past Due in lookback** under **Views**.

**Upcoming search works with Initial Done Date but not Most Recent Done Date**
The app prefers each task’s own Jira due date over automated done-date fields on subtasks, then falls back to the parent epic’s compare field. Refresh after changing **Compare against** so the snapshot matches.

**MRD field (in Dates) is empty on a child task**
If the task has no MRD, the app inherits from parents up to the epic — shown as a small "from parent: …" hint under the field, not filled into the input itself. **Run JQL** again (or refresh the page so saved results re-load parent dates) if you still see — after a code update or first visit.

**Test Jira Connection fails**
Check your network/VPN, then verify `.env` has correct `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`. See [JIRA_SETUP.md](./JIRA_SETUP.md).

**Create Issue says the parent must be an Epic or Story**
Match the parent to the issue type: Story/Bug → Epic; Task → Story. For saved JQL presets, pick an issue from the query (parent chain is filled in), choose a parent from the dropdown, or enter a valid issue key manually. Epic types such as **Epic (Feature)** are supported.

**Create Issue failed but I fixed the form — Create is still greyed out**
After a validation error, ensure **Title** is filled and a parent is selected. The Create button re-enables when those are set; you do not need to close the modal.

**Story sub-tasks created but not linked to epic/story**
Sub-tasks must be **Task** type with `parent` set to the story (not Jira’s separate Sub-task type). If older creates look orphaned, recreate them or set the story parent in Jira. New creates from this app link Task → Story → Epic automatically.
