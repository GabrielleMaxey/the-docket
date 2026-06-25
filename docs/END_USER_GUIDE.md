# Task Manager — User Guide

This guide covers how to use the app day-to-day. No programming knowledge needed.

---

## The four pages

```
Work Week  |  Dashboard  |  Chat  |  Settings
```

Navigate between them using the menu at the top of the screen.

---

## Settings — do this first

Before anything else works, your Jira credentials need to be in place.

**Developers (browser or desktop dev):** copy `.env.example` to `.env` in the project folder and fill in Jira credentials — see [JIRA_SETUP.md](./JIRA_SETUP.md).

**Packaged desktop app (Mac or Windows installer):** on first launch the app creates a template `.env` in your user data folder. Edit that file and restart:

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

### Watched people

Add team members here (by Jira display name) so the Dashboard's **Individual Contributor Metrics** section tracks their workload. You can also add a custom JQL query as a "watch" if a person's name doesn't match their Jira display name exactly.

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

- **Joke ticker** — rotating jokes at the top; cosmetic only.
- **Date & calendar** — shows today; useful when planning.
- **Reminders** — four short text lines, for your eyes only. Check the box to mark done (greyed out). They are never sent to Jira.

### Task Manager card

1. **JQL count** — choose 1–4 query slots. Each has a label (your name for it) and a JQL box.
2. **Max results** — caps issues per query. Raise it if you're missing items.
3. **Run JQL** — loads fresh results from Jira. Shortcut: **Ctrl+Enter** (Windows/Linux) or **⌘+Enter** (Mac).
4. **Reset Saved Queries** — clears JQL text, labels, and the cached table. Does *not* delete your notes or priorities.
5. **Create Issue** — opens a modal to create a new Jira issue. The epic/query dropdown shows all your saved presets, plus a "Enter epic key manually" option.

> **Tip:** Click the **🗂️ Task Manager** header to collapse/expand the whole section once your queries are saved.

### My Metrics

Appears after you Run JQL and get results. Shows:
- Issue count chips (total, open, overdue, in progress) per query
- A **📄 Project Report** section inside each query — click to expand, then **Generate Report** for an AI-written summary *from your perspective as the assignee*

> The badge in the **📊 My Metrics** header shows your total open issue count at a glance.

### Help me plan my week

Click **🗓️ Help me plan my week** to expand. Answer four questions:

| # | Question | Example answer |
|---|----------|---------------|
| 1 | How do you want to approach this week? | "Balance across projects" |
| 2 | How many hours available? | 32 |
| 3 | Fixed commitments or blockers? | "Deployment Thursday" |
| 4 | Any other context? | "Need to prep for Friday review" |

Click **Continue →**, then **Generate week plan**. The result is a Monday–Friday plan using your actual issue keys. Copy or start over from the same panel.

### Results table

Each row is one Jira issue. What you can do per row:

| Action | How |
|--------|-----|
| Change **status** in Jira | Dropdown → **Update Status** |
| Change **assignee** in Jira | Dropdown → **Update Assignee** |
| Set personal **priority** (P1–P10) | Priority dropdown — P1 = most urgent, P10 = least |
| Write a **note** (local) | Type in the Notes box — saves automatically |
| Push note to Jira as a **comment** | Check the row checkbox → **Push note** (or **Push Selected** for multiple) |
| Filter visible rows | **Filter by key** box above the table |

**MRD column:** The header shows **MRD** (hover for “Most Recent Done Date”). It displays the issue’s automated Most Recent Done Date when that field is set on the task. When the task has no MRD, the app walks the **parent chain** (for example Story → Epic) and shows the first ancestor that has an MRD. This uses the same ODI field mapping as Dashboard (`customfield_10009` by default). Standard Jira **Due date** is not shown in the table; it is still used behind the scenes for My Metrics past-due/upcoming counts and Chat context.

On **shared projects** where several people track the same issues, local priority does not sync between users. PMs and managers should use the **`PRIORITY P#` prefix** when pushing notes — see [Shared projects — notes and priority](#shared-projects--notes-and-priority-pms-and-managers) below.

**Closed/resolved issues are read-only** — you can read them but not edit them.

**Priority colors:** rows glow warmer colors for higher priorities (P1–P3) and cooler/neutral for lower ones. P0 = no color, just unranked.

---

## Dashboard — project-level view

Use Dashboard when you want to see how a whole project (or several) is tracking, not individual issue management.

### How to use it

1. **Select presets** — pick one or more epic or JQL presets from the panel at the top
2. **Optional due-date views** — set an upcoming window, past-due lookback, and which date field to compare against (see below)
3. **Optional people** — add team members to track in **Individual Contributor Metrics**
4. **Choose views** — under **Views**, check which dashboard sections you want visible (including separate toggles for upcoming vs past-due due-date cards)
5. Click **Refresh status** — the app pulls metrics from Jira and stores them

The stored snapshot stays until you click **Refresh status** again. The page loads from the last snapshot even if Jira is slow.

### Optional due-date views

These filters are optional. **Refresh status** always updates resolution, workload, and overdue metrics; due-date sections appear only when you configure them.

| Control | What it does |
|---------|----------------|
| **Also include → Past Due Projects** | Adds missed-deadline project cards to Project Metrics and past-due rows to the past-due due-date list |
| **Show past due** (1 / 2 / 3 years) | How far back to look for past-due rows and epic past-due flags. Only applies when Past Due Projects is checked. Default: 1 year |
| **Show upcoming due dates** | None, 7 days, 2 weeks, 30 days, 90 days, or a custom “through” date. Drives the **Upcoming Due Dates** card |
| **Compare against** | **Most Recent Done Date** or **Initial Done Date** (ODI automated done-date fields). Task due dates take priority; when a task has no due date, the parent epic’s compare field is used |

**Clear** buttons reset each row of options without affecting the others.

> **Tip:** Upcoming lists show only future due dates. Past-due rows appear in a separate card only when **Past Due Projects** is enabled.

### Sections (all collapsible)

Toggle each section under **Views** in Filters & Settings. Open/closed state is remembered per section.

**Overall Status**  
Summary cards — % tasks resolved, % in progress, % projects complete (when epics are selected), and % open tasks overdue.

**Project Metrics**  
One card per epic/JQL preset showing:
- Issue completion %, epic %, overdue %
- Status breakdown (pie or bar chart — toggle under **Chart style**)
- Deadline dates (Initial Done Date, Most Recent Done Date, Project End Date)
- Past due badge when a deadline has been missed (when Past Due Projects is enabled)

**Upcoming Due Dates** *(optional)*  
Green-accent card listing open tasks with due dates from **today through** your selected upcoming cutoff, grouped by project → person. Each row shows issue type (Task, Epic, etc.), key, summary, and due date. Period summary chips break counts down by week or month.

**Past Due in lookback** *(optional)*  
Red-accent card listing open tasks that missed their deadline within the selected lookback (1–3 years). Populated only when **Past Due Projects** is enabled. Empty state explains how to enable it.

**Individual Contributor Metrics**  
One card per watched person showing their open workload, overdue count, and a status breakdown chart.

**Generate Report**  
Choose an audience and click Generate:

| Audience | Written for |
|----------|------------|
| Executive Summary | Senior leadership — highlights, risks, action items |
| Product Owner Report | Feature delivery, backlog health, blockers |
| Developer Report | Team workload, overdue by person, WIP |

Reports can be **copied** or **downloaded as a .md file**.

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

Some teams use a shared Excel tracker so everyone sees the same notes and ranking. In Task Manager, **notes and P1–P10 priority are stored on each person's machine** (`data/workweek.sqlite`). They do **not** sync automatically between users the way a shared spreadsheet does.

| What | Shared across the team? |
|------|-------------------------|
| Status and assignee changes | Yes — in Jira |
| Notes you **push** as Jira comments | Yes — visible on the issue in Jira |
| Local **Notes** box (before push) | No — your machine only |
| Local **Priority** dropdown (P1–P10) | No — your machine only |

For shared projects, treat **Jira issue comments** as the team source of truth for ranking and status notes until a future sync feature exists.

### Convention: `PRIORITY P#` at the start of pushed notes

When a PM, manager, or tech lead updates team priority on a shared issue, **push a Jira comment** that starts with a clear priority prefix, then the note text:

```
PRIORITY P2 — Blocked on vendor response. Target fix by Friday.
```

| Prefix | Meaning |
|--------|---------|
| `PRIORITY P1` | Most urgent (matches the app's P1) |
| `PRIORITY P2` … `PRIORITY P10` | Lower urgency through P10 |
| No `PRIORITY` prefix | Personal/local note only — do not use for team ranking |

**Rules for people pushing updates (PMs / managers):**

1. Start the **final** comment text with `PRIORITY P#` (P1–P10) when the ranking matters to the team.
2. Keep the rest of the comment short and actionable — same role as a row in the old Excel tracker.
3. When priority changes, push a **new** comment with the updated `PRIORITY P#` prefix (do not rely on others seeing edits to an old comment).
4. Use **Push note** in Task Manager, or paste the same text as a comment directly in Jira.

**Rules for everyone else on the team:**

1. Read the latest comment on the issue in Jira (or open the issue in Jira's UI).
2. In Task Manager, set your local **Priority** dropdown to match the `P#` in the comment.
3. Optionally copy the rest of the comment into your local **Notes** box for quick reference while you work.
4. Run **Run JQL** when you need fresh issue data — comments are not imported into the app automatically.

**Personal work:** On issues only you track, use local notes and priority without pushing, or push comments without the `PRIORITY` prefix if the note is informational only.

**Developers:** Manual export/backup of SQLite is documented in [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) — that is for backup or handoff, not live multi-user editing.

---

## Where your data lives

| Data | Stored where | Shared with Jira? |
|------|-------------|-------------------|
| JQL inputs, labels, table snapshot | This browser only (`localStorage`) | No |
| Generated reports/plans for Chat context | This browser only (`localStorage`) | No |
| Desktop app credentials + DB (packaged) | `%APPDATA%\Task Manager\` (Windows) or `~/Library/Application Support/Task Manager/` (Mac) | No |
| Header reminders | This browser only | No |
| Issue notes + priorities (P1–P10) | Local file (`data/workweek.sqlite`) | No — see [Shared projects](#shared-projects--notes-and-priority-pms-and-managers) for team workflow |
| Dashboard metrics snapshot | Local file (`data/workweek.sqlite`) | No |
| Status/assignee changes | Jira | Yes |
| Notes you push as comments (with `PRIORITY P#` prefix) | Jira | Yes — team reads in Jira and updates local priority manually |

---

## Common questions

**The table is empty after Run JQL**
Your JQL returned no results, or Max results is set too low. Try widening the JQL in Jira's own search first to confirm issues exist.

**"Showing saved results" banner appears**
That's normal — the table was restored from the last time you ran JQL. Click **Run JQL** to get fresh data.

**My notes disappeared on another computer**
Expected. Notes are stored in a local file on the machine you started the app on. Use one machine, or ask a developer about exporting the SQLite file. For **shared projects**, use pushed Jira comments with the `PRIORITY P#` prefix — see [Shared projects — notes and priority](#shared-projects--notes-and-priority-pms-and-managers).

**How do we share priority on a project like we did in Excel?**
Task Manager does not sync priority between users automatically. PMs/managers push comments starting with `PRIORITY P#` (e.g. `PRIORITY P2 — …`). Everyone else reads the comment in Jira and sets their local Priority dropdown to match. See [Shared projects — notes and priority](#shared-projects--notes-and-priority-pms-and-managers).

**The Push note button is greyed out**
You've already pushed that exact text as a comment. Edit the note text and the button will re-enable.

**Chat gave a generic answer about my report**
Generate the report or week plan first on Work Week or Dashboard, then ask Chat in the same browser. Session context is stored locally when you click Generate — it is not sent to a third-party cloud beyond your configured LLM provider.

**Chat says it's not ready**
For Anthropic/OpenAI/Ollama: set `CHAT_PROVIDER` and the matching API key in `.env` on the proxy host. For Rovo: set OAuth vars, sign in with Atlassian from Chat, or configure an LLM fallback key. See [JIRA_SETUP.md](./JIRA_SETUP.md) §8.

**Dashboard metrics look stale**
Click **Refresh status** after changing presets, due-date options, or watched people. A banner appears when filters differ from the stored snapshot.

**I only see upcoming tasks, not past due**
Past due rows are in a separate **Past Due in lookback** card. Enable **Also include → Past Due Projects**, choose a lookback (1–3 years), refresh, and turn on **Past Due Due Dates** under **Views**.

**Upcoming search works with Initial Done Date but not Most Recent Done Date**
The app prefers each task’s own Jira due date over automated done-date fields on subtasks, then falls back to the parent epic’s compare field. Refresh after changing **Compare against** so the snapshot matches.

**MRD column is empty on a child task**
If the task has no MRD, the app inherits from parents up to the epic. **Run JQL** again (or refresh the page so saved results re-load parent dates) if you still see — after a code update or first visit.

**Test Jira Connection fails**
Check your network/VPN, then verify `.env` has correct `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`. See [JIRA_SETUP.md](./JIRA_SETUP.md).
