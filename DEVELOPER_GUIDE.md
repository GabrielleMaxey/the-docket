# Task Manager Developer Guide

## Purpose
Task Manager is a React + Vite app for running saved Jira JQL queries and managing issue workflows in one place. The UI supports status updates, assignee updates, note-taking, row priority ranking, and push-to-Jira actions.

## Tech Stack
- Frontend: React, Vite, Semantic UI React, custom CSS
- Backend proxy: Node.js + Express
- Jira integration: Jira Cloud REST API through local proxy routes
- Persistence: Local storage for UI preferences + SQLite-backed issue metadata via proxy endpoints

## Database Purpose
- Database type: SQLite (via better-sqlite3)
- Database file: data/workweek.sqlite
- Purpose:
  - Persist Jira issue metadata keyed by issue key.
  - Store per-issue note text.
  - Store per-issue local priority value (P0-P10).
  - Keep metadata durable across app restarts, unlike browser-only local storage.

## Database Setup
1. Install dependencies (includes better-sqlite3).
2. Start the API server.
3. On startup, the API automatically:
   - Creates data/ if it does not exist.
   - Creates data/workweek.sqlite if it does not exist.
   - Creates the issue_metadata table if missing.
4. No separate migration command is required for current schema.

## Sharing Database Data
When sharing current local metadata with teammates, prefer creating explicit export artifacts instead of copying live WAL files manually.

### Source Database
- data/workweek.sqlite

### Recommended Share Artifacts
- Full snapshot (for exact restore):
  - data/workweek-share.sqlite
- CSV (for review/spreadsheets):
  - data/issue_metadata_export.csv

### Export Commands
1. From project root:
  - cd /path/to/taskManager
2. Backup snapshot:
  - sqlite3 data/workweek.sqlite ".backup data/workweek-share.sqlite"
3. Export CSV:
  - sqlite3 -header -csv data/workweek.sqlite "SELECT issue_key, note, priority, updated_at FROM issue_metadata ORDER BY updated_at DESC;" > data/issue_metadata_export.csv
4. Optional row count check:
  - sqlite3 data/workweek.sqlite "SELECT COUNT(*) FROM issue_metadata;"

### Privacy-Safe Export (No Notes)
- sqlite3 -header -csv data/workweek.sqlite "SELECT issue_key, priority, updated_at FROM issue_metadata ORDER BY updated_at DESC;" > data/issue_metadata_redacted.csv

### Current Export Snapshot
- issue_metadata row count at export time: 11

## Database Schema (Current)
- Table: issue_metadata
- Columns:
  - issue_key (TEXT, primary key)
  - note (TEXT, default empty string)
  - priority (INTEGER, default 0)
  - updated_at (TEXT timestamp)
- Priority values are clamped server-side to 0..10 before persistence.

## Database + UI Data Model
- Local storage keeps UI preferences such as saved JQL labels/inputs.
- SQLite keeps durable issue metadata (note + priority).
- During query runs, frontend fetches persisted metadata and merges it into current UI state.

## Project Structure
- src/: React app source
- src/Pages/WorkWeekTimer.jsx: Main Task Manager screen and interaction logic
- src/Pages/workWeekTimerElements.css: Page and table styling
- src/services/jiraClient.js: Frontend API wrapper for proxy endpoints
- server/jiraProxy.mjs: Proxy server for Jira operations and metadata persistence
- public/: Static assets such as favicon
- JIRA_SETUP.md: Jira environment and setup notes

## Local Setup
1. Install dependencies.
2. Configure environment variables from .env.example into .env.
3. Start frontend and backend processes.
4. Use the Test Jira Connection button in the UI to validate connectivity.

## Desktop (Electron) Workflow
- Start desktop dev quickly:
  - npm run desktop:dev
- Rebuild native modules then start desktop dev (recommended after dependency or Electron updates):
  - npm run desktop:doctor
- Rebuild native modules only:
  - npm run desktop:rebuild-native

## Desktop Packaging
- Create unpacked desktop output (smoke test package):
  - npm run desktop:pack
- Create release artifacts using current platform defaults:
  - npm run desktop:dist
- Build a macOS DMG:
  - npm run desktop:dist:mac
- Build a Windows NSIS installer:
  - npm run desktop:dist:win

### Packaging Notes
- Artifacts are written to the release/ directory.
- macOS notarization/signing requires a valid Apple Developer certificate.
- Windows installer generation is scripted in this repo, but creating Windows installers is most reliable when run on Windows CI/host.

## CI Packaging
- Workflow file:
  - .github/workflows/desktop-packaging.yml
- Triggers:
  - Manual trigger from GitHub Actions (workflow_dispatch).
  - Git tag push matching v*.
- Outputs:
  - macOS artifacts: desktop-macos (DMG/ZIP when present).
  - Windows artifacts: desktop-windows (EXE/MSI/BLOCKMAP when present).
- Download location:
  - GitHub repository Actions tab, inside the specific workflow run artifacts section.

## Core UI Behavior
- Query management:
  - Supports up to 3 saved JQL entries with editable labels.
  - Query inputs and labels persist in local storage.
- Results table:
  - Closed/resolved items are visually separated and treated as non-editable.
  - Open items support status and assignee updates.
  - Row priority supports values P0 through P10 and is persisted.
  - Notes are editable and can be pushed to Jira comments.
- Batch actions:
  - Select-all and push-selected support multi-issue note pushes.

## New UI Additions
- Top joke ticker:
  - Includes static jokes plus live dad-joke and programming-joke API integration.
  - Refresh cadence is 10 minutes.
  - Falls back to static jokes if API fetch fails.
- Date and mini calendar panel:
  - Renders above the main Task Manager card.
  - Highlights current day.

## API/Integration Notes
- All Jira interactions are routed through the local proxy, not directly from browser to Jira.
- Frontend should handle proxy errors and show user-friendly state messages.
- Metadata persistence endpoints are used to keep note and priority changes durable.
- API server uses SQLite WAL mode for better local write/read concurrency.

## Build and Validation
1. Run a production build after UI or behavior changes.
2. Verify table sorting and closed-item behavior after modifying row logic.
3. Validate proxy-dependent actions against a configured Jira account.

## Troubleshooting
- Jira connection fails:
  - Confirm .env credentials and base URL.
  - Re-test with health and profile endpoints through the UI.
- Notes or priorities appear reset:
  - Confirm local storage keys are available.
  - Confirm metadata endpoints are reachable and SQLite writes succeed.
  - Confirm the database file exists at data/workweek.sqlite.
- Live joke does not appear:
  - Static jokes are expected fallback behavior when external APIs are unavailable.
