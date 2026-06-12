# Task Manager — developer guide
Task Manager is a React + Vite app for running saved Jira JQL queries and managing issue workflows in one place. The UI supports status updates, assignee updates, note-taking, row priority ranking, and push-to-Jira actions.
React + Vite UI, **Express** proxy (`server/jiraProxy.mjs`), **better-sqlite3** for local issue metadata. Jira Cloud REST calls go through the proxy only.


## Stack (current)

- UI: React 18, React Router, Semantic UI React, styled-components
- Build: Vite 8; desktop: Electron 31 + electron-builder
- Data: `localStorage` (JQL prefs, labels, last JQL result snapshot, header reminders) + SQLite `data/workweek.sqlite` (per-issue note + priority via proxy)

## SQLite (`issue_metadata`)

| Column      | Notes                          |
|------------|---------------------------------|
| `issue_key`| Primary key                    |
| `note`     | Local draft / mirror of UI note|
| `priority` | 0–10, clamped in API           |
| `updated_at` | ISO text                     |

Created automatically on first API start (`data/` + DB + table). WAL enabled.

**Share / export** (run from repo root):

```bash
sqlite3 data/workweek.sqlite ".backup data/workweek-share.sqlite"
sqlite3 -header -csv data/workweek.sqlite \
  "SELECT issue_key, note, priority, updated_at FROM issue_metadata ORDER BY updated_at DESC;" \
  > data/issue_metadata_export.csv
```

Redacted CSV (no note column): omit `note` from the `SELECT`.

## Source layout (high signal)

| Path | Role |
|------|------|
| `src/Pages/WorkWeekTimer.jsx` | Shell: header, Jira card, results |
| `src/Pages/components/TaskManagerHeaderPanel.jsx` | Ticker, date/calendar, reminders |
| `src/Pages/components/JiraResultsTable.jsx` | JQL results table |
| `src/Pages/hooks/useTaskManagerJira.js` | Jira UI state, handlers, persistence hooks |
| `src/Pages/hooks/jiraJqlRunWorkflow.js` | JQL run + metadata merge |
| `src/services/jiraClient.js` | `fetch` → proxy |
| `server/jiraProxy.mjs` | Jira + SQLite + static `dist` in production |
| `electron/main.cjs` | Spawns proxy, loads Vite dev URL or `dist/` |

## Scripts

| Command | Use |
|---------|-----|
| `npm run dev:all` | Vite + proxy (web dev) |
| `npm run desktop:dev` | Vite + Electron (proxy started from Electron) |
| `npm run desktop:doctor` | Rebuild native modules, then `desktop:dev` |
| `npm run desktop:rebuild-native` | `better-sqlite3` for current Electron |
| `npm run build` | Production Vite bundle |
| `npm run desktop:pack` / `desktop:dist` | electron-builder (output `release/`) |
| `npm run desktop:dist:mac` / `desktop:dist:win` | Platform-specific installers |

## GitHub Actions

`.github/workflows/desktop-packaging.yml` — `workflow_dispatch` and tags `v*`. Artifacts: `desktop-macos`, `desktop-windows`.

## Product behavior (for code reviewers)

- Up to **4** JQL slots; prefs + last successful **jqlRuns** cached in `localStorage` (restore banner until user runs JQL again).
- **Reminders** (4 rows): `localStorage` only; checkbox “done” styling until text cleared/changed.
- **Push note**: tracks last pushed text per issue; greys input + blocks duplicate push until note edits.
- Priority **P1** = highest, **P10** lowest; row + select colors in `workWeekTimerElements.css` (interval legend in `END_USER_GUIDE.md`).

## Checks after changes

1. `npm run build`
2. Smoke: JQL run, metadata save, status/assignee update (against a real Jira test site if possible)

More setup detail: `JIRA_SETUP.md`. Non-technical usage: `END_USER_GUIDE.md`.
