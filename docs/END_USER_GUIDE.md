# Task Manager — User Guide

This guide covers how to use the app day-to-day. No programming knowledge needed.

---

## Using Task Manager in the browser (when the desktop app is unavailable)

If the packaged desktop app or Electron window is blocked (for example by macOS or work security software), use the **browser UI** instead. You get the same pages; only the window chrome is different.

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
   (wording may vary slightly by Chrome version; look for **Install app** / **Install Task Manager**).
3. Confirm. A separate window opens; you can pin it to the Dock.

**Microsoft Edge**

1. Open **http://localhost:5173**.
2. Menu (**⋯**) → **Apps** → **Install this site as an app**.
3. Name it **Task Manager** if prompted, then install.

**Safari (macOS)**

With the site open: **File → Add to Dock** (label may vary by macOS version).

### Important

- The installed window still needs **`npm run dev:all` running** in a terminal. If you quit that process, the app cannot reach Jira or save notes.
- Prefer Chrome or Edge for “Install as app.” The install dialog shows the name **Task Manager** and the app icon (not “localhost”).
- For packaged DMG/NSIS that warn on first open (unsigned builds), see [unsigned-installs.md](./unsigned-installs.md).

---

## The five pages

```
Work Week  |  Dashboard  |  Past Reports  |  Chat  |  Settings
```

Navigate between them using the menu at the top of the screen.

---

## Settings — do this first

Before anything else works, your Jira credentials need to be in place.

**Developers (browser or desktop dev):** copy `.env.example` to `.env` in the project folder and fill in Jira credentials — see [JIRA_SETUP.md](./JIRA_SETUP.md).

**Packaged desktop app (Mac or Windows installer):** on first launch the app creates a template `.env` in your user data folder. Edit that file and restart. The Mac `.dmg` is universal — one installer for Intel and Apple Silicon Macs; no need to pick a chip type.

| OS | Open this file |
|----|----------------|
| macOS | `~/Library/Application Support/Task Manager/.env` |
| Windows | `%APPDATA%\Task Manager\.env` |

Then in the app:

1. Go to **Settings**
2. Click **Test Jira Connection**
3. If it shows ✓ Connected — you're good. Skip to Work Week below.
4. If it fails, check that your `.env` file has the right values (see [JIRA_SETUP.md](./JIRA_SETUP.md)).

### Epic & JQL presets

These are the named saved searches that power everything else. Add them once in Settings; they'll appear in Work Week, Dashboard, and Chat.

| Preset type | Use when |
|-------------|----------|
| **Epic** | You want metrics tied to a specific Jira epic (ODI-1234) |
| **JQL** | You want a custom search — e.g. all issues assigned to you |

To add a preset:
1. Settings → **Epic & JQL presets** section
2. Choose type, fill in the label and JQL or epic key
3. Click **Add preset**

**Share presets with your team:** use **Export team pack** to download a JSON file of all epic/JQL presets. New teammates click **Import team pack** and choose **merge** (add new, skip duplicates) or **replace** (overwrite all local presets). Align with your team's canonical preset list or `npm run seed:presets` for admins — see [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md).

### Contributor Metrics

Add team members here by Jira display name so the Dashboard's **Individual Contributor Metrics** section tracks their workload and overdue rate. You can also add a **Custom query** — a JQL expression that scopes a group by project, team, label, or any combination — useful when a person's display name doesn't match Jira exactly, or when you want to track a whole team or project slice rather than one person.

### Chat instructions

Optional. Anything you type here is added to every Chat conversation. Example:
```
Keep answers short. Always include the issue key. Use bullet points.
```

---

## Work Week — daily driver

This is the main screen for managing your open work.

```
┌──────────────────────────────────────┐
│  Header: jokes · date · reminders   │
├──────────────────────────────────────┤
│  🗂️ Task Manager  [collapsible]      │
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

- **Header banners** (optional) — at the top of Work Week, toggle **Joke ticker** and/or **My upcoming due dates**. The due-date banner lists **only your** assigned issues (matched by your Jira display name) from the latest Dashboard snapshot's upcoming due-date window. Refresh Dashboard after changing due-date filters or if the banner is empty when you expect tasks. Same toggles in **Settings → Work Week header**.
- **Date & calendar** — shows today; useful when planning.
- **Reminders** — four short text lines, for your eyes only. Check the box to mark done (greyed out). They are never sent to Jira.

### Task Manager card

1. **JQL count** — choose 1–5 query slots. Each has a label (your name for it) and a JQL box.
2. **Max results** — first page size per query. The app can load **all** matching issues (up to a safe cap) — see Results table below.
3. **Notes on run** — choose how row notes are filled when you **Run JQL** or refresh:
   - **Keep local notes** (default) — notes come from your local database for issues in the result set.
   - **Pull most recent Jira comment** — overwrites each row's **Notes** text with that issue's latest Jira comment. Attached files are not changed. Use **Clear** to reset to **Keep local notes**.
4. **Run JQL** — loads fresh results from Jira, merges local (or shared-program) priorities, and saves results locally. Shortcut: **Ctrl+Enter** (Windows/Linux) or **⌘+Enter** (Mac).
5. **Reset Saved Queries** — clears JQL text, labels, and the cached table. Does *not* delete your notes or priorities in the local database, or header reminders.
6. **Create Issue** — opens a modal to create a new Jira issue in ODI. See [Create Issue](#create-issue) below for parent selection and ODI rules. In short: pick a preset or parent, enter a title, then click **✦ AI Draft** (blue button next to the Description label) to generate a description and, for Stories, a suggested sub-task list:
   - **Story**: AI rewrites the title into Job Story format ("When… I want… so I can…") if it isn't already, and generates a description that expands on the situation, motivation, and desired outcome. 2–5 suggested sub-tasks appear as editable checkboxes; uncheck any you don't want before clicking Create.
   - **Bug**: AI generates a structured description covering what is broken, steps to reproduce, expected vs actual, environment, and any known workaround. A suggested priority (Low / Medium / High / Critical) appears based on ODI severity definitions.
   - **Task**: AI generates a plain description.
   - The **Create** button label updates to show "Create + N subtasks" when Story sub-tasks are selected. Sub-tasks are created as **Task** type with the new story as parent (linked in the Task → Story → Epic chain); the success message lists each with its issue key and a link to open the new issue in Jira.

### Create Issue

Use **Create Issue** on Work Week when you want a new Story, Task, or Bug in ODI without leaving the app.

**1. Choose a starting point (Epic preset dropdown)**

| Option | What it does |
|--------|----------------|
| **Epic preset** | Loads that epic and its stories as parent choices. Story/Bug parents default to the epic; Task parents pick a story under the epic. |
| **Saved query (JQL preset)** | Runs the preset's JQL (e.g. Dev Team, My Current Issues), lists matching issues, and derives parent chains (Task → Story → Epic). Pick an issue from the query, an epic/story parent, or enter a parent key manually. |
| **Enter issue key manually** | Type an ODI key: Epic for Story/Bug, Story for Task. The app validates the key before unlocking the form. |

The modal pre-selects a preset when you open it from an active Work Week JQL tab that matches a saved preset.

**2. Parent rules (ODI)**

| Issue type | Required parent |
|------------|-----------------|
| Story | Epic (including ODI types like **Epic (Feature)**) |
| Bug | Epic only |
| Task | Story |

**3. Fill in details**

- **Title** — required. Stories should use Job Story format; AI Draft can rewrite and ask 2–3 clarification questions if the ask/goal is unclear.
- **Components**, **Vertical Components** — choose from the dropdown. **Components** must already exist on the ODI Jira project (free-text names are rejected).
- **BUG Tracking** (Bug only) — pick a default or type a custom value.
- **Description** — use **✦ AI Draft** or write your own. Description and goal validation errors (including “story not fully defined”) appear **below the Description field**, not at the top of the modal.
- **Priority** (Bug only) — required on create.
- **Assignee** — optional for Task/Bug. Stories stay unassigned; when AI Draft suggests sub-tasks, a **Subtask assignee** field appears and applies to all checked sub-tasks.

**4. After create**

On success, use **Add more detail in Jira** to open the new issue in your browser. Story sub-tasks you left checked are created under the new story (parent-linked as Task → Story → Epic) and listed in the success message.

**If create fails:** fix errors shown in the modal — parent/title issues at the top; description/goal issues under Description — then click **Create** again. The button stays available after validation errors once a valid parent and title are set.

> **Background work:** Dashboard refresh, report generation, week plan, project report, and **Run JQL** keep running if you switch pages. A yellow status pill in the top nav shows what's in progress. Return to the page when it finishes — results are saved automatically.

> **Tip:** Click the **🗂️ Task Manager** header to collapse/expand the whole section once your queries are saved.

### My Metrics

Appears after you Run JQL and get results. Shows:
- Issue count chips (total, open, overdue, in progress) per query
- A **📄 Project Report** section inside each query — click to expand, choose a **report scope**, a **report type**, then **Generate Report**:
  - **Report scope** — what data the report is built from: **Current query results** (this slot, as loaded), **All my assigned work** (past 3/6/12 months — includes an issue if it had a status change, a reassignment, a note added in this app, or a comment added directly in Jira within that window; not just any Jira field update, and not limited to activity made through this app), or any other configured query slot on this Work Week page. Choosing a scope other than "Current query results" runs its own fresh Jira search rather than reusing what's already loaded.
  - **Status Report** *(default)* — AI-written summary *from your perspective as the assignee*: how the project is tracking, what needs attention, next steps. Reads the scope's label and JQL to frame the report correctly — a closed-work scope gets a completed-work recap instead of being asked about "what needs attention"
  - **1:1 Prep** — talking points for discussing your work with management (direct, skip-level, or otherwise) in a weekly or biweekly 1:1: workload, consistency, completion rate, potential blockers, and items to discuss now vs. coming up. Upward-facing, not a personal daily-standup recap
  - **PWB Review** — first-person self-assessment prose for a quarterly, mid-year, or yearly PWB review (choose the period once selected)
  - For 1:1 Prep and PWB Review, you can optionally add **your goals** and/or your **company/team goals** — the report will note where your work supports them, and honestly flag anything that seems disconnected. All three report types can reference Lumen's 8 Cultural Behaviors where the work genuinely demonstrates one, never as a forced checklist. Goals you enter are saved automatically (on this machine) so you don't have to retype them next time — each field shows a **Clear** button once it has text, for removing a saved value.
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
| Set personal **priority** (P1–P20) | Priority dropdown — P1 = most urgent, P20 = least. A **Jira** badge means priority was set from the latest comment on **Run JQL** |
| Write a **note** (local) | Type in the Notes box — text saves automatically |
| Add **files** to a note | **Add file** button, paste while the notes area is focused (images only), or drag-and-drop onto the notes cell. Up to **5** files per note; **5 MB** each — images (PNG, JPEG, GIF, WebP) plus TXT, PDF, DOC/DOCX, XLSX, and CSV |
| **Keep on this machine** (attachments) | Optional checkbox below the notes box. Off by default — attachments stay until you **Push note** or close/refresh the tab. Turn on to keep draft files on this machine across reloads |
| Push note to Jira as a **comment** | Check the row checkbox → **Push note** (or **Push Selected** for multiple). Sends note text and attachments inline in the Jira comment (same as images for documents); local copies are cleared after a successful push |
| Filter visible rows | **Filter by key**, **Status**, or **Assignee** above the table; **Clear filters** resets all three |
| Page through results | **First / Prev / Next / Last** below the table (30 rows per page) |
| Load more issues | When the status line shows **Loaded X of Y** and Y is larger than X, click **Load remaining** |

**Load status:** After **Run JQL**, the line above the table shows **Loaded X of Y matched** (how many rows are in the table vs how many Jira matched). If your query returns more than the first batch, click **Load remaining** to fetch the rest (up to a documented safe cap).

**Deep links from Dashboard:** Opening Work Week from Dashboard (`?key=ODI-123` or `?assignee=Name`) applies table filters automatically.

- **Issue key** — the app fetches that issue from Jira and opens a green **Drill-down: ODI-123** tab (first tab), even if the issue also appears in your saved JQL results.
- **Assignee name** — if that person is not already in your saved JQL results, the app runs `assignee = "Name"` in Jira and opens a **Drill-down: Name** tab with their tasks. If their issues are already loaded in a JQL tab, that tab is selected and filtered by assignee instead.

A green banner confirms the active drill-down. Use **Clear filter** to remove the Dashboard filter from the URL while keeping any drill-down tabs you opened in this browser session. Use the small **x** on an individual green drill-down tab to remove only that tab.

**MRD column:** The header shows **MRD** (hover for “Most Recent Done Date”). It displays the issue’s automated Most Recent Done Date when that field is set on the task. When the task has no MRD, the app walks the **parent chain** (for example Story → Epic) and shows the first ancestor that has an MRD. This uses the same ODI field mapping as Dashboard (`customfield_10009` by default). Standard Jira **Due date** is not shown in the table, but if a task has one, it takes priority over the epic-level fallback for **My Metrics**’ overdue count (see below) and Chat context; most teams in this space don’t use per-task due dates today, so this is effectively the epic-level MRD/IDD in practice.

On **shared projects**, link a Work Week slot to a **Shared program** (when the Atlas demo or future MySQL team DB is configured) so priorities sync across machines. Otherwise use local priority + NORA CSV import — see [Shared projects — notes and priority](#shared-projects--notes-and-priority-pms-and-managers) below.

**Closed/resolved issues are read-only** — you can read them but not edit them.

**Priority colors:** rows glow warmer colors for higher priorities (P1–P3) and cooler/neutral for lower ones. P0 = no color, just unranked.

---

## Dashboard — project-level view

Use Dashboard when you want to see how a whole project (or several) is tracking, not individual issue management.

### How to use it

1. **Select projects** — pick one or more Epic & JQL presets from the panel at the top (add or edit them in Settings → **Epic & JQL presets**)
2. **Optional due-date views** — set an upcoming window, past-due lookback, and which date field to compare against (see below)
3. **Contributor Metrics** — add people or custom queries to track in the **Individual Contributor Metrics** section (saved entries from Settings → **Contributor Metrics**, or type a display name directly)
4. **Choose views** — under **Views**, check which dashboard sections you want visible (including separate toggles for upcoming vs past-due due-date cards)
5. Click **Refresh status** — the app pulls metrics from Jira and stores them

The stored snapshot stays until you click **Refresh status** again. The page loads from the last snapshot even if Jira is slow. You can navigate away while refresh runs — watch the top nav for **Refreshing dashboard** and return when it finishes.

### Jump to Work Week from Dashboard

Many Dashboard lists link into **Work Week** with filters already applied:

| Where you click | What opens in Work Week |
|-----------------|-------------------------|
| Issue key (upcoming / past-due lists, overdue items) | Table filtered to that key |
| Assignee name | Table filtered to that person |
| **Unassigned** (on a Project Metrics card) | Table filtered to unassigned tasks *within that project's card* — not every unassigned task app-wide |
| **Work Week** link on an epic or contributor | Filtered to that epic key or assignee |

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

### Sections (all collapsible)

Toggle each section under **Views** in Filters & Settings. Open/closed state is remembered per section.

**Overall Status**  
Summary cards — % tasks resolved, % in progress, % in backlog, % projects complete (epics with MRD/IDD set, including epics discovered inside JQL presets), and % open tasks overdue. Below the cards, count chips show total issues, overdue, resolved, and backlog at a glance.

**Project Metrics**  
One card per epic/JQL preset showing:
- Issue completion %, in-progress % (when any tasks are in progress), backlog % (when any tasks are in backlog), epic %, overdue %
- **JQL presets** also show **Epics complete** (share of epics with MRD/IDD set) and an **Epics in scope** list with per-epic task completion and epic-done status
- Status breakdown (pie or bar chart — toggle under **Chart style**)
- Deadline dates (Initial Done Date, Most Recent Done Date, Project End Date) on epic presets
- Past due badge when a deadline has been missed (when Past Due Projects is enabled)

**Upcoming Due Dates** *(optional)*  
Blue-accent card listing open tasks with due dates from **today through** your selected upcoming cutoff, grouped by project → person. Each row shows issue type (Task, Epic, etc.), key, summary, and due date. Period summary chips break counts down by week or month.

**Past Due in lookback** *(optional)*  
Coral-accent card listing open tasks that missed their deadline within the selected lookback (1–3 years). Populated only when **Past Due Projects** is enabled. Empty state explains how to enable it.

**Individual Contributor Metrics**  
One card per person or custom query configured in Settings → **Contributor Metrics** (or names you add directly in the Dashboard filter panel). The section appears as soon as people are selected — click **Refresh status** to load metrics. After refresh: open workload, overdue count, and status breakdown per person. Person names link to Work Week with an assignee drill-down.

- **Person watches** — full Jira assignee workload (`assignee = "…"` search), not limited to the projects selected in step 1.
- **Custom query watches** — metrics come from the watch JQL as written (same scope you defined in Settings).
- **Per-project contributor rows** on Project Metrics cards — only issues within that epic/preset (Jane’s 5 tasks in Epic A, not her 10 elsewhere).

**Generate Report**  
Choose an audience and click Generate:

| Audience | Written for |
|----------|------------|
| Executive Summary | Senior leadership — highlights, risks, action items |
| Product Owner Report | Feature delivery, backlog health, blockers |
| Developer Report | Team workload, overdue by person, WIP |

Reports include an optional status chart when Dashboard data supports it. Use **Copy**, **Download .md**, or **Clear report** (removes the report from this page only — archived copies remain in **Past Reports**). Generation continues in the background if you leave the page.

**Weekly digest** (same section, below the LLM reports)  
Snapshot-based stand-up brief — overdue/upcoming highlights, contributor load, and project health. **No LLM required.** Click **Generate weekly digest** after a Dashboard refresh, then copy, download, or **Clear report**.

---

## Past Reports — saved outputs

**Past Reports** lists every report the app has archived on this machine. Open it from the top nav.

| Tab | Contents |
|-----|----------|
| **Work Week** | Project reports and week plans (saved automatically when you click Generate) |
| **Dashboard** | Executive / PM / Developer audience reports (saved automatically on Generate) |
| **Ad-hoc** | Chat assistant replies you explicitly saved with **Save to Past Reports** |
| **Files** | Live list of CoWork `weekly-plan-*.md` files in the data folder (read from disk; optional **Save to archive**) |

For each tab: pick a row → **View** → expand the report to read, copy, or download. Dashboard archived reports may include the status chart that was shown at generation time.

**Deleting:** Work Week, Dashboard, and Ad-hoc each have a **Delete** button per row and a **Delete all** button for the whole tab (both ask for confirmation first — this cannot be undone). The **Files** tab has neither, since those rows are live files on disk, not database entries — remove or move the file itself if you want it gone, or use **Save to archive** first if you want a deletable copy that survives the original file being moved or deleted.

**CoWork weekly plans:** When Claude CoWork writes `weekly-plan-<date>.md` into the Task Manager `data/` folder, those files show under **Files**. Content is read live from disk until you click **Save to archive**, which copies it into the local Past Reports database as a week plan (so it remains after the file is moved or deleted).

**Clear report** on Work Week or Dashboard removes the on-page copy and browser cache only — it does **not** delete items already listed here.

---

## Chat — ask Jira questions

Chat lets you ask natural-language questions about your Jira data. Each message sends:

- **Epic filter selection** — same presets as Dashboard (scopes live Jira searches)
- **Work Week JQL results** — cached from the last time you ran JQL on Work Week (labels, counts, top open issues; past due vs upcoming tagged separately)
- **Dashboard snapshot** — metrics from the last Dashboard **Refresh status** (refreshed when you send a Chat message)
- **Generated reports and plans** — project reports, dashboard reports, and week plans you generated in this browser (last 8)

### How to use it

1. Go to **Chat**
2. Select presets in the filter panel (optional but helps scope Jira searches)
3. Type a question and press Enter or click **Send**
4. On any assistant reply, click **Save to Past Reports** to archive it under **Past Reports → Ad-hoc** (optional — Chat does not auto-save replies)

For the best experience, run JQL on Work Week, refresh Dashboard, or generate a report/plan **before** asking Chat to summarize or reference that work.

**Example questions:**
- "Which epics are past due?"
- "How many upcoming vs past due tasks are in my dashboard snapshot?"
- "Summarize open work for the selected epics"
- "Who has the most overdue tasks in my My Work query?"
- "What's the status of ODI-1234?"
- "What did my week plan say about Tuesday?"
- "Summarize the executive report I generated on Dashboard"

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

Some teams used a shared Excel tracker so everyone sees the same ranking. In Task Manager:

| What | Shared across the team? |
|------|-------------------------|
| Status and assignee changes | Yes — in Jira |
| Notes you **push** as Jira comments | Yes — visible on the issue in Jira (text and inline attachments) |
| Local **Notes** box (before push) | No — your machine only |
| Note **attachments** (before push) | No — your machine only unless **Keep on this machine** is on |
| **Priority** on a personal Work Week slot | No — local SQLite on this machine |
| **Priority** on a slot linked to a **Shared program** | Yes — Atlas demo today (Team badge); MySQL long-term |

### Shared-program slots (recommended for team ranking)

1. Configure the team priority demo (`TEAM_PRIORITY_MONGODB_URI`) or wait for production MySQL sync.
2. In Settings, seed shared programs if needed; optionally **Import team priorities** with target **Atlas (demo)** or **Seed from local priorities**.
3. On Work Week, set the slot’s **Shared program** (e.g. NORA).
4. Change **Priority** as usual — it saves to the shared store immediately. Rows show a **Team** badge when priority comes from that store.
5. **Run JQL** on that slot loads priorities from the shared store (not from Jira comments).

Personal slots (Shared program = None) keep using local SQLite only.

### Notes vs priority

Push notes as Jira comments when the team needs the text in Jira. Priority is **not** parsed from comment text anymore — use a shared-program slot (or local/CSV import) for ranking.

### Bootstrap from the NORA Excel tracker

PMs can keep rankings in the NORA spreadsheet and share a **CSV** export:

1. In Excel: **File → Save As → CSV UTF-8** (columns: `Priority`, `ODI`, `Developer`, `Jira Status`, `notes`).
2. In Task Manager: **Settings → Import team priorities** → choose target (**This machine** or **Atlas (demo)** when connected) → **Import CSV**.
3. Matching `ODI` keys overwrite priority for that target. **Notes** fill in only when importing to this machine and the local note is empty.
4. Re-import when spreadsheet rankings change. Reload Work Week (or re-run JQL) if that page is already open.

**Developers:** Manual export/backup of SQLite is documented in [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) — that is for backup or handoff, not live multi-user editing.

---

## Where your data lives

| Data | Stored where | Shared with Jira? |
|------|-------------|-------------------|
| JQL inputs, labels, table snapshot | This browser only (`localStorage`) | No |
| Work Week drill-down tabs | This browser session only (`sessionStorage`) | No |
| On-page report/plan display (before archive) | This browser only (`localStorage`) | No |
| **Past Reports** archive | Local file (`data/workweek.sqlite` → `generated_reports`), saved with your browser's local timestamp/timezone | No |
| Chat session artifacts (for Chat context) | This browser only (`localStorage`) | No |
| Desktop app credentials + DB (packaged) | `%APPDATA%\Task Manager\` (Windows) or `~/Library/Application Support/Task Manager/` (Mac) | No |
| Header reminders | This browser only | No |
| Issue notes + priorities (P1–P20) | Local file (`data/workweek.sqlite`); shared-program slots use Atlas demo / future MySQL | No for personal slots — see [Shared projects](#shared-projects--notes-and-priority-pms-and-managers) |
| Note attachments (**Keep on this machine**) | Local file (`data/note-images/` + SQLite) | No — cleared after a successful **Push note** |
| Epic/JQL preset team pack (export/import) | JSON file you save/share | No |
| Dashboard metrics snapshot | Local file (`data/workweek.sqlite`) | No |
| Status/assignee changes | Jira | Yes |
| Notes you push as comments | Jira | Yes — text and attachments; priority is not read from comments |

---

## Common questions

**The table is empty after Run JQL**
Your JQL returned no results, or filters are hiding rows. Check **Loaded X of Y** — if Y > X, click **Load remaining**. Try widening the JQL in Jira's own search first to confirm issues exist.

**I left the page while a refresh or report was running**
That's fine — work continues in the background. Look for the yellow pill in the top nav. Return to Dashboard or Work Week when it finishes; refresh updates the stored snapshot, and reports/plans are saved to this browser.

**How do we share the same epic/JQL presets across the team?**
One person exports a **team pack** from Settings; others **Import team pack** (merge or replace). See [Epic & JQL presets](#epic--jql-presets) above.

**"Showing saved results" banner appears**
That's normal — the table was restored from the last time you ran JQL. Click **Run JQL** to get fresh data.

**My notes disappeared on another computer**
Expected. Notes are stored in a local file on the machine you started the app on. Use one machine, or ask a developer about exporting the SQLite file. For **shared ranking**, link a Work Week slot to a Shared program (or import CSV to Atlas) — see [Shared projects — notes and priority](#shared-projects--notes-and-priority-pms-and-managers).

**How do we share priority on a project like we did in Excel?**
Link the Work Week slot to a **Shared program** so priority reads/writes the team store (Atlas demo today). Or **Settings → Import team priorities** from the NORA CSV (local or Atlas). See [Shared projects — notes and priority](#shared-projects--notes-and-priority-pms-and-managers).

**The Push note button is greyed out**
You've already pushed that exact note (text and attachments) as a comment. Edit the note or change attached files and the button will re-enable.

**Chat gave a generic answer about my report**
Generate the report or week plan first on Work Week or Dashboard, then ask Chat in the same browser. Session context is stored locally when you click Generate — it is not sent to a third-party cloud beyond your configured LLM provider.

**What's the difference between Clear report and Past Reports?**
**Clear report** removes the report from the Work Week or Dashboard page (and its browser cache). **Past Reports** keeps everything saved to the local database when you generated a report/plan, or when you clicked **Save to Past Reports** on a Chat reply. Clearing on-page does not delete archived rows.

**Chat says it's not ready**
For Anthropic/OpenAI/Ollama: set `CHAT_PROVIDER` and the matching API key in `.env` on the proxy host. For Rovo: set OAuth vars, sign in with Atlassian from Chat, or configure an LLM fallback key. See [JIRA_SETUP.md](./JIRA_SETUP.md) §8.

**Dashboard metrics look stale**
Click **Refresh status** after changing presets, due-date options, or watched people. A banner appears when filters differ from the stored snapshot.

**I only see upcoming tasks, not past due**
Past due rows are in a separate **Past Due in lookback** card. Enable **Also include → Past Due Projects**, choose a lookback (1–3 years), refresh, and turn on **Past Due in lookback** under **Views**.

**Upcoming search works with Initial Done Date but not Most Recent Done Date**
The app prefers each task’s own Jira due date over automated done-date fields on subtasks, then falls back to the parent epic’s compare field. Refresh after changing **Compare against** so the snapshot matches.

**MRD column is empty on a child task**
If the task has no MRD, the app inherits from parents up to the epic. **Run JQL** again (or refresh the page so saved results re-load parent dates) if you still see — after a code update or first visit.

**Test Jira Connection fails**
Check your network/VPN, then verify `.env` has correct `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`. See [JIRA_SETUP.md](./JIRA_SETUP.md).

**Create Issue says the parent must be an Epic or Story**
Match the parent to the issue type: Story/Bug → Epic; Task → Story. For saved JQL presets, pick an issue from the query (parent chain is filled in), choose a parent from the dropdown, or enter a valid ODI key manually. ODI epic types such as **Epic (Feature)** are supported.

**Create Issue failed but I fixed the form — Create is still greyed out**
After a validation error, ensure **Title** is filled and a parent is selected. The Create button re-enables when those are set; you do not need to close the modal.

**Story sub-tasks created but not linked to epic/story**
Sub-tasks must be **Task** type with `parent` set to the story (not Jira’s separate Sub-task type). If older creates look orphaned, recreate them or set the story parent in Jira. New creates from this app link Task → Story → Epic automatically.
