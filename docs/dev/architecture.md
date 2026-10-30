# Architecture

[← Developer Guide index](../DEVELOPER_GUIDE.md)

## Stack

| Layer | Technology |
|-------|-----------|
| UI | React 18, Vite 8, React Router 7, Semantic UI React 2 |
| Desktop shell | Electron 43 (local development) |
| Proxy / API | Express 5 (`server/`) |
| Database | better-sqlite3 local stores per scope; optional PostgreSQL via `pg` for shared metadata |
| AI providers | Anthropic, OpenAI, Ollama, or Rovo via `llmClient.mjs` — explicit `CHAT_PROVIDER` in `.env` |
| CSS | Global design system in `workWeekTaskElements.css` + `dashboard.css`; `ww-` namespace prefix |

---


## Page naming

Some code and persisted keys use older feature names. Prefer the current nav labels in user-facing docs.

| Nav label | Route | Code / legacy name |
|-----------|-------|--------------------|
| Task Management | `/work-week` | Work Week |
| Metrics | `/dashboard` | Dashboard |
| Project Managers | `/project-managers` | Capacity planning |
| Past Reports | `/reports` | ReportArchive |
| Chat | `/chat` | Chat |
| Settings | `/settings` | Settings |

---


## Node version policy

- This repo is pinned to Node `22` via `.nvmrc`.
- **macOS / Linux:** before installing dependencies:

```bash
nvm install
nvm use
```

- **Windows:** install Node 22 from [nodejs.org](https://nodejs.org/), or use [nvm-windows](https://github.com/coreybutler/nvm-windows) / [fnm](https://github.com/Schniz/fnm) and select the version from `.nvmrc`.
- `npm install` runs a preinstall guard (`scripts/check-node-version.cjs`) and will fail fast if your Node major version does not match `.nvmrc`.
- `postinstall` runs `npm rebuild better-sqlite3` for Node. Browser API startup and tests also rebuild for Node; desktop startup rebuilds for Electron through `desktop:rebuild-native`.
- Stop the running workflow before switching runtimes. For recovery, use `npm rebuild better-sqlite3` before browser mode, or `npm run desktop:doctor` to rebuild and launch desktop mode.

---


## Server-side logging

All route modules and the proxy entry point use `server/lib/logger.mjs` via `createLogger(tag)`. Log lines are written to stdout/stderr in the format:

```
2026-06-30T14:23:01.452Z [INFO] [http] POST /api/dashboard/refresh → 200 (841ms)
2026-06-30T14:23:01.453Z [INFO] [dashboard] dashboard refresh completed
2026-06-30T14:23:05.120Z [ERROR] [report] generation failed  context deadline exceeded
```

**Tags:** `http` (request middleware), `server` (startup/DB), `jira` (proxy calls), `config`, `dashboard`, `report`, `chat`, `rovo`, `metadata`, `jira-core`, `jira-issue`.

**Log level** is controlled by `LOG_LEVEL` in `.env` (default `info`):

| Level | What is logged |
|-------|---------------|
| `error` | Failures only |
| `warn` | HTTP 4xx responses + missing env vars at startup |
| `info` | Every HTTP request (method, path, status, duration), dashboard refresh query type summary, report generation start, preset mutations (create/update/delete/import), issue mutations (comment push, status update, assignee update), server startup details |
| `debug` | All of the above **plus** every individual Jira API call (method, full URL, status code) |

Set `LOG_LEVEL=debug` when tracing Jira API issues. The HTTP request logger fires on `res.finish` so it always captures the final status code even for streamed responses.

### Upcoming due date banner (`useUpcomingDueBanner.js`)

`src/Pages/hooks/useUpcomingDueBanner.js` fetches `GET /api/dashboard/metrics` and `GET /api/jira/myself` in parallel, then filters `snapshot.dueByIssues` to only the current user's issues before the banner renders.

The filter uses **exact display name matching** (case-insensitive), with a secondary check against the email local-part (e.g. `"jane.doe"` → `"jane doe"` after normalising dots). Fuzzy/substring matching is intentionally not used here — the snapshot's `assignee` field is always a clean Jira display name string, so partial matches would risk showing other team members' tasks. If the banner shows no tasks but you expect some, confirm that your Jira `displayName` matches what is stored in the snapshot (`assignee` field in `due_by_issues_json`).

---

[← Developer Guide index](../DEVELOPER_GUIDE.md)
