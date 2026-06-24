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

**Closed/resolved issues are read-only** — you can read them but not edit them.

**Priority colors:** rows glow warmer colors for higher priorities (P1–P3) and cooler/neutral for lower ones. P0 = no color, just unranked.

---

## Dashboard — project-level view

Use Dashboard when you want to see how a whole project (or several) is tracking, not individual issue management.

### How to use it

1. **Select presets** — pick one or more epic or JQL presets from the panel at the top
2. Optionally set a **due by date** to see what's coming up
3. Optionally add **team members** to track individual workloads
4. Click **Submit** — the app pulls metrics from Jira and stores them

The stored snapshot stays until you click Submit again. This means the page loads instantly even if Jira is slow — you're reading the last-fetched data.

### Sections (all collapsible)

**Overall Status**
Three summary cards — % tasks resolved, % projects complete, % open tasks overdue. Only shown when 2+ projects are selected.

**Project Metrics**
One card per epic/JQL preset showing:
- Issue completion %, epic %, overdue %
- Status breakdown (pie or bar chart — toggle in the controls)
- Deadline dates (Initial Done Date, Most Recent Done Date, Project End Date)
- Past due badge if a deadline has been missed

**Due by Date**
Hierarchical list of open tasks due before your chosen date, grouped by project → person. Overdue tasks are highlighted. Period summary chips show counts by week or month.

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

Chat lets you ask natural-language questions about your Jira data.

1. Go to **Chat**
2. Select presets in the filter panel (same as Dashboard — this scopes the assistant's Jira searches)
3. Type a question and press Enter or click **Send**

**Example questions:**
- "Which epics are past due?"
- "Summarize open work for the selected epics"
- "Who has the most overdue tasks?"
- "What's the status of ODI-1234?"

The assistant searches Jira directly for answers and will tell you if it can't find something rather than guessing.

**Note:** Chat requires a provider to be configured in `.env` (`CHAT_PROVIDER=anthropic`, `openai`, or `ollama`). If Chat shows a warning, a developer needs to set this up first.

---

## Where your data lives

| Data | Stored where | Shared with Jira? |
|------|-------------|-------------------|
| JQL inputs, labels, table snapshot | This browser only | No |
| Header reminders | This browser only | No |
| Issue notes + priorities (P1–P10) | Local file (`data/workweek.sqlite`) | No |
| Dashboard metrics snapshot | Local file (`data/workweek.sqlite`) | No |
| Status/assignee changes | Jira | Yes |
| Notes you push as comments | Jira | Yes |

---

## Common questions

**The table is empty after Run JQL**
Your JQL returned no results, or Max results is set too low. Try widening the JQL in Jira's own search first to confirm issues exist.

**"Showing saved results" banner appears**
That's normal — the table was restored from the last time you ran JQL. Click **Run JQL** to get fresh data.

**My notes disappeared on another computer**
Expected. Notes are stored in a local file on the machine you started the app on. Use one machine, or ask a developer about exporting the SQLite file.

**The Push note button is greyed out**
You've already pushed that exact text as a comment. Edit the note text and the button will re-enable.

**Chat says it's not ready**
`CHAT_PROVIDER` and matching API key aren't set in `.env`. Contact whoever set up the app.

**Test Jira Connection fails**
Check your network/VPN, then verify `.env` has correct `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`. See [JIRA_SETUP.md](./JIRA_SETUP.md).
