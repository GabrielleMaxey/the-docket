# Task Manager

> A personal desktop productivity tool for Lumen engineers — Jira-connected, AI-powered, and built for one person's daily workflow.

---

## What it is

Task Manager is a private desktop (and browser) app that sits on top of your Lumen Jira instance. It was built by and for Gabrielle Maxey to replace the friction of jumping between Jira views, Excel trackers, and status-update emails.

Everything in the app talks to **your own Jira project (ODI)** through a local proxy — no third-party cloud service ever sees your Jira credentials.

---

## What it does

```
┌─────────────────────────────────────────────────────┐
│                    Task Manager                     │
│                                                     │
│  Work Week   │  Dashboard  │  Chat  │  Settings     │
└─────────────────────────────────────────────────────┘
```

### Work Week *(daily driver)*
Run up to four saved JQL queries side-by-side and manage every issue in one table.

- **Run JQL** — pulls live results from Jira into the table
- **Task table** — update status, assignee, and priority; write notes; push notes to Jira as comments
- **My Metrics** — per-query progress summary with issue counts and a per-project AI report (written for you, the assignee, in second person)
- **Help me plan my week** — answers 4 quick questions, then generates a day-by-day Monday–Friday plan based on your actual open issues
- **Create Issue** — creates a new Jira issue from a modal with epic/query selection

### Dashboard *(project-level view)*
Select one or more saved Epic or JQL presets and get a metrics snapshot across all of them.

- **Overall Status** — aggregate % resolved, % complete, % overdue across all selected projects
- **Project Metrics** — per-epic cards showing issue %, epic %, overdue %, status breakdown (pie or bar chart), and deadline dates
- **Due by Date** — hierarchical task list (epic → assignee → issue) for anything due before a chosen date
- **Individual Contributor Metrics** — per-person workload cards (open, in progress, overdue, backlog)
- **Generate Report** — AI-written report in Executive Summary, Product Owner, or Developer format; copyable and downloadable as Markdown

### Chat *(Jira Q&A)*
Ask natural-language questions about selected epics. The assistant searches Jira directly and never invents names or facts. Works with Anthropic, OpenAI, or Ollama — configured in `.env`.

### Settings *(one-time configuration)*
- **Epic & JQL presets** — the named queries used on Dashboard, Work Week, and Chat
- **Jira field mapping** — maps custom Jira date fields (Initial Done Date, Most Recent Done Date, etc.) to the app's roles
- **Past due rules** — controls which date field triggers the "past due" badge on epics
- **Watched people & JQL** — saved assignee watches for the Dashboard's Individual Contributor section
- **Chat instructions** — personal system-prompt additions layered on top of built-in rules
- **Test Jira Connection** — verifies `.env` credentials before you change anything else

---

## Pages at a glance

| Page | Primary purpose | AI features |
|------|----------------|-------------|
| Work Week | Daily JQL run + issue management | Per-project report, week planner |
| Dashboard | Multi-project metrics snapshot | Executive / PO / Developer reports |
| Chat | Natural-language Jira Q&A | Full conversation with Jira tool access |
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

Full setup details → **[JIRA_SETUP.md](./JIRA_SETUP.md)**
Code architecture → **[DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)**
Day-to-day usage → **[END_USER_GUIDE.md](./END_USER_GUIDE.md)**

---

## Data & privacy

| What | Where stored | Leaves your machine? |
|------|-------------|----------------------|
| JQL text, labels, last table snapshot | Browser `localStorage` | No |
| Header reminders | Browser `localStorage` | No |
| Per-issue notes + P1–P10 priority | `data/workweek.sqlite` (local file) | No |
| Status/assignee changes, pushed comments | Jira (lumen.atlassian.net) | Yes — visible in Jira to anyone with access |
| Dashboard metrics snapshot | `data/workweek.sqlite` | No |
| Jira credentials | `.env` file on this machine | No — only the local proxy reads them |

---

## Tech stack (summary)

- **Frontend**: React 18, Vite 8, Semantic UI React, React Router
- **Backend**: Express.js proxy (`server/`), better-sqlite3
- **Desktop**: Electron 31 + electron-builder
- **AI**: Anthropic / OpenAI / Ollama (configurable in `.env`)
- **Database**: SQLite at `data/workweek.sqlite` (auto-created on first run)
