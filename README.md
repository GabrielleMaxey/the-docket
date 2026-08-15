# Task Manager

> A personal desktop productivity tool for Lumen engineers — Jira-connected, AI-powered, and built for one person's daily workflow.

---

## What it is

Task Manager is a private desktop (and browser) app that sits on top of your Lumen Jira instance. It was built by and for Gabrielle Maxey to replace the friction of jumping between Jira views, Excel trackers, and status-update emails.

Everything in the app talks to **your own Jira project (ODI)** through a local proxy — no third-party cloud service ever sees your Jira credentials.

---

## What it does

```
┌──────────────────────────────────────────────────────────────────┐
│                         Task Manager                             │
│                                                                  │
│  Work Week  │  Dashboard  │  Past Reports  │  Chat  │  Settings │
└──────────────────────────────────────────────────────────────────┘
```

### Work Week *(daily driver)*
Run up to five saved JQL queries side-by-side and manage every issue in one table.

- **Run JQL** — pulls live results from Jira into the table; optional **Notes on run** (keep local notes or pull the latest Jira comment into each row)
- **Task table** — update status, assignee (type display name, email, or username with Jira search), and priority; **MRD** column (Most Recent Done Date, with parent-chain inheritance); write notes; push notes to Jira as comments (shared projects: use `PRIORITY P#` prefix — see [END_USER_GUIDE.md](./docs/END_USER_GUIDE.md))
- **My Metrics** — per-query progress summary with issue counts and a per-project AI report (written for you, the assignee, in second person); **Clear report** removes the on-page copy only
- **Help me plan my week** — answers 4 quick questions, then generates a day-by-day Monday–Friday plan based on your actual open issues
- **Create Issue** — creates a new Jira issue from a modal with epic/parent selection (including saved JQL presets without a fixed epic key), ODI field defaults (project components validated against Jira), **✦ AI Draft** for ODI-standard descriptions, optional subtask assignee on Story create, and a link to open the new issue in Jira after create; Stories get suggested sub-tasks (Task type, parent-linked to the new story, editable checkboxes, created automatically on submit), Bugs get a suggested priority based on ODI severity definitions
- **Dashboard drill-down** — links from Dashboard open assignee or issue deep links (`?assignee=`, `?key=`, plus `?epicPresetId=` so an **Unassigned** link scopes to the project card it came from); drill-down tabs persist for the current browser session and can be cleared one at a time

### Dashboard *(project-level view)*
Select one or more saved Epic or JQL presets and get a metrics snapshot across all of them.

- **Overall Status** — aggregate % resolved, % in progress, % in backlog, % complete, and % overdue across selected projects, plus issue/overdue/resolved/backlog count chips
- **Project Metrics** — per-epic cards showing issue %, in-progress %, backlog %, epic %, overdue %, status breakdown (pie or bar chart), and deadline dates
- **Upcoming Due Dates** — optional card: open tasks due from today through a chosen window (7d–90d or custom date), grouped by project → assignee; issue type shown per row
- **Past Due in lookback** — optional card: missed deadlines within a 1–3 year lookback when Past Due Projects is enabled
- **Individual Contributor Metrics** — per-person workload cards (open, in progress, overdue, backlog); names link to Work Week assignee drill-down
- **Generate Report** — AI-written report in Executive Summary, Product Owner, or Developer format; optional status chart; copy, download, or **Clear report** (on-page only)
- **Weekly digest** — snapshot-based stand-up brief without LLM

### Past Reports *(archive)*
Browse reports saved to the local database: Work Week project reports and week plans, Dashboard audience reports (auto-saved on generate), and Chat replies you saved with **Save to Past Reports** (Ad-hoc tab).

### Chat *(Jira Q&A)*
Ask natural-language questions about selected epics, your Work Week JQL results, Dashboard metrics, and reports or week plans you already generated. The assistant searches Jira when needed and cites session context for prior queries and AI outputs. **Save to Past Reports** on any assistant reply. Works with Anthropic, OpenAI, Ollama, or opt-in Rovo — configured in `.env`.

### Settings *(one-time configuration)*
- **Epic & JQL presets** — the named queries used on Dashboard, Work Week, and Chat; each preset becomes a project tab and quick-pick option
- **Jira field mapping** — maps custom Jira date fields (Initial Done Date, Most Recent Done Date, etc.) to the app's roles
- **Past due rules** — controls which date field triggers the "past due" badge on epics
- **Contributor Metrics** — saved people and custom JQL queries for the Dashboard's Individual Contributor Metrics section; person entries track by display name, custom queries can scope any group by project, team, label, or combination
- **Chat instructions** — personal system-prompt additions layered on top of built-in rules
- **Test Jira Connection** — verifies `.env` credentials before you change anything else

---

## Pages at a glance

| Page | Primary purpose | AI features |
|------|----------------|-------------|
| Work Week | Daily JQL run + issue management | Per-project report, week planner |
| Dashboard | Multi-project metrics snapshot | Executive / PM / Developer reports, weekly digest |
| Past Reports | Archived reports and saved Chat replies | View/copy/download prior outputs |
| Chat | Natural-language Jira Q&A + session context | Conversation with Jira tool access; optional save to Ad-hoc archive |
| Settings | Configuration | Custom chat instructions |

---

## Who it's for

Task Manager is built for **Lumen engineers and project managers** who work in Jira daily and want a faster, smarter alternative to juggling raw Jira views, spreadsheets, and status-update emails.

The app is designed around the ODI Jira project at `lumen.atlassian.net` and will be distributed to team members once development is complete. All Jira credentials stay on each user's machine — no third-party cloud service ever sees them.

**Primary use cases:**
- Engineers who need a focused daily view of their assigned work across multiple queries
- PMs and leads who track project health across several epics at once
- Anyone who writes weekly status updates and wants them generated from real data
- Team leads monitoring individual contributor workloads and deadlines

---

## Quick start

Works on **macOS and Windows** (and Linux for browser dev).

**macOS / Linux (Terminal):**
```bash
# 1. Use the pinned Node version (once per new shell)
nvm install
nvm use

# 2. Install dependencies (once)
npm install

# 3. Copy and fill in credentials (once)
cp .env.example .env
# → edit .env with your JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN

# 4. Start (pick one)
npm run dev:all        # browser at http://localhost:5173
npm run desktop:dev    # Electron desktop window
```

**Windows (PowerShell):**
```powershell
# 1. Node 22 required — install from nodejs.org or nvm-windows, then verify:
node -v

# 2. Install dependencies
npm install

# 3. Copy credentials template
Copy-Item .env.example .env
# → edit .env with Notepad or your editor

# 4. Start (pick one)
npm run dev:all
npm run desktop:dev
```

**Packaged desktop (no Node required):** install the universal Mac `.dmg` (Intel or Apple Silicon) or Windows NSIS installer, edit `.env`  — see [JIRA_SETUP.md](./docs/JIRA_SETUP.md) § Desktop app.

Full setup details → **[JIRA_SETUP.md](./docs/JIRA_SETUP.md)**
Code architecture → **[DEVELOPER_GUIDE.md](./docs/DEVELOPER_GUIDE.md)**
Day-to-day usage → **[END_USER_GUIDE.md](./docs/END_USER_GUIDE.md)**

---

## Data & privacy

| What | Where stored | Leaves your machine? |
|------|-------------|----------------------|
| JQL text, labels, last table snapshot | Browser `localStorage` | No |
| Work Week drill-down tabs | Browser `sessionStorage` | No |
| Chat session artifacts (reports/plans for context) | Browser `localStorage` | No |
| On-page reports/plans (Work Week + Dashboard) | Browser `localStorage` | No |
| **Past Reports** archive | `data/workweek.sqlite` → `generated_reports`; saved under your browser's local timestamp/timezone | No |
| Header reminders | Browser `localStorage` | No |
| Per-issue notes + P1–P20 priority | `data/workweek.sqlite` (local file) | No |
| Status/assignee changes, pushed comments | Jira (lumen.atlassian.net) | Yes — visible in Jira to anyone with access |
| Dashboard metrics snapshot | `data/workweek.sqlite` (dev) or user data folder (packaged desktop) | No |
| Desktop `.env` + local DB (packaged app) | OS user data folder — see [JIRA_SETUP.md](./docs/JIRA_SETUP.md) | No |
| Jira credentials | `.env` file on this machine | No — only the local proxy reads them |
| Chat message content | Your configured LLM provider (Anthropic/OpenAI/etc.) when you send a message | Yes — to that provider's API |

---

## Tech stack (summary)

- **Frontend**: React 18, Vite 8, Semantic UI React, React Router
- **Backend**: Express.js proxy (`server/`), better-sqlite3
- **Desktop**: Electron 31 + electron-builder
- **AI**: Anthropic / OpenAI / Ollama (configurable in `.env`)
- **Database**: SQLite at `data/workweek.sqlite` (auto-created on first run)
