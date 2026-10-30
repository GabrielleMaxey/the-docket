# Contributing

[← Developer Guide index](../DEVELOPER_GUIDE.md)

## For Cursor users

The markdown files in `docs/` are canonical for GitHub, local desktop development, and non-Cursor editors.

The [`Cursor canvas mirror`](../canvases/task-manager-docs.canvas.tsx) is historical reference and does not describe the current Combined Work, PostgreSQL, or source-scoped storage model. Use this guide and the [user guide](../END_USER_GUIDE.md) as the current references; see [canvas status](../canvases/README.md).

**PR write-ups:** Cursor agents follow [`.cursor/rules/pr-writeups.mdc`](../../.cursor/rules/pr-writeups.mdc). Human process and template → [§ PR write-ups](#pr-write-ups) below.

---


## Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev:all` | Starts Vite (`:5173`) + Express proxy (`:8787`) concurrently |
| `npm run desktop:dev` | Starts Vite + Electron (proxy started from Electron main process) |
| `npm run desktop:doctor` | Rebuilds `better-sqlite3` native module, then starts desktop dev |
| `npm run desktop:rebuild-native` | Rebuilds native modules for current Electron version |
| `npm run check:jira-client-exports` | Verifies every imported `jiraClient` symbol is exported (prevents runtime blank-screen import failures) |
| `npm test` | Unit tests: `dashboardMetrics.mjs`, `epicFilterJql.mjs`, `chatSessionPrompt.mjs`, `issuePriority.mjs`, … `pretest` rebuilds `better-sqlite3` for system Node first — without it, running the desktop app beforehand leaves the native module built for Electron's ABI and tests fail with `ERR_DLOPEN_FAILED` (an environment artifact, not a real test failure) |
| `npm run team-db:migrate` | Explicit PostgreSQL schema migrations using exported environment |
| `npm run team-db:import-demo -- <annotated-json> <site-map>` | Explicit import of mapped historical demo exports |
| `npm run test:team-db` | PostgreSQL integration tests; requires a disposable `DOCKET_TEST_DATABASE_URL` |
| `npm run seed:presets` | Seed shared Epic/JQL presets into local SQLite — see the [preset catalog](../../presets/pilot-presets.json) |
| `npm run build` | Runs export guard (`prebuild`), then creates production Vite bundle → `dist/` |
| `npm run desktop:build` | Alias for `npm run build`; does not create an installer |

---


## Checks after making changes

```bash
# 1. Unit tests (metrics, JQL builders, chat session prompt)
npm test

# 2. Type-check server routes (no native binary needed)
node --check server/routes/reportRoutes.mjs
node --check server/routes/dashboardRoutes.mjs

# 3. Build the UI
npm run build

# 4. Smoke test (with a real Jira test site):
#    - Run JQL on Task Management; confirm Loaded X of Y and Load remaining when needed
#    - Confirm Use team DB starts off; enable a configured test DB and verify Team vs Local ownership
#    - Combined Open Work: source edits, Managed/List, unique metrics, report goals and Combined archive
#    - Dismiss the older-browser-data notice and verify original records remain
#    - Generate a project report; navigate away and back while it runs
#    - Generate a week plan
#    - Dashboard refresh + weekly digest + Generate Report; drill-down link to Task Management (?key=, ?assignee=)
#    - Task Management drill-down tabs persist for the browser session; clear one tab and clear the URL filter separately
#    - Past Reports: view archived Task Management / Dashboard / Ad-hoc items; Chat Save to Past Reports
#    - Clear report on Task Management / Dashboard (on-page only)
#    - Assignee cell: type name/email, pick suggestion, Update Assignee
#    - Notes on run: Pull most recent Jira comment vs Keep local notes
#    - Settings: export/import team preset pack
#    - Chat: ask about a generated week plan or report (session context)
#    - Supported local desktop: restart after project `.env` edits, confirm Test Jira Connection
#    - Create Issue modal: epic preset, JQL preset parent chains, manual parent key, AI Draft, Bug priority, post-create Jira link; resubmit after validation error
```

---


## PR write-ups

Feature and fix branches should include a short write-up under [`docs/PR_WriteUps/`](../PR_WriteUps). These files are **tracked in git** and are the preferred source for GitHub PR descriptions.

| | |
|--|--|
| **When** | Multi-commit or reviewable change sets (features, non-trivial bug fixes). Skip for typo-only / formatting-only commits unless you want a record. |
| **Where** | `docs/PR_WriteUps/PR_<TOPIC>.md` (`SCREAMING_SNAKE_CASE`) |
| **Cursor** | [`.cursor/rules/pr-writeups.mdc`](../../.cursor/rules/pr-writeups.mdc) (`alwaysApply`) — agents create/update the write-up when committing, pushing, or opening a PR for substantive work |
| **Examples** | [`PR_CREATE_ISSUE_FIXES.md`](../PR_WriteUps/PR_CREATE_ISSUE_FIXES.md), [`PR_COLLECT_DUE_BY_DEDUPE.md`](../PR_WriteUps/PR_COLLECT_DUE_BY_DEDUPE.md) |

### Template

```markdown
# PR: <short title>

## Summary
<1–3 sentences: what and why>

## Problem
| Symptom | Root cause |
|---------|------------|
| … | … |

## Changes
### <Area or path>
- …

## Test plan
- [ ] …

## Files touched
| Area | Path |
|------|------|
| … | … |
```

### Workflow

1. Create or update the write-up as the branch’s scope settles (don’t leave claims about UI/behavior that no longer match the tip).
2. Commit it with the feature commits on that branch.
3. When opening the PR (`gh pr create` or the GitHub UI), paste or adapt the write-up for **Summary** and **Test plan**.
4. If the PR grows after review, update the same file rather than starting a second write-up for the same topic.

Ensure `docs/PR_WriteUps` is **not** listed in `.gitignore` so write-ups are shared with the PR and review history.

---


## GitHub Actions

Packaged installers are unsupported. The former desktop packaging workflow has been removed; tags no longer produce Mac DMG or Windows NSIS artifacts. Use the local development commands above.

## Pull-request validation

The read-only pull-request/manual workflow runs `npm ci`, the Jira client export check, `npm test`, `npm run test:team-db`, and `npm run build` with Node from `.nvmrc`. It uses a disposable PostgreSQL 16 service with synthetic data; no `.env`, Jira credentials, company secrets or installer artifacts are required.

`npm test` explicitly skips real PostgreSQL cases when `DOCKET_TEST_DATABASE_URL` is absent. `npm run test:team-db` instead fails immediately without that variable and runs all database integration files, including migration repeatability, transactional rollback, import conflicts and Team export. Database files run sequentially because they share fixture tables; the intentional race tests still exercise concurrent transactions. Use an explicitly disposable loopback database named `docket_test_*` and an explicit port; every SQL fixture validates this boundary before destructive cleanup. Never point this test command at a shared database. For example, with your own disposable service:

```sh
DOCKET_TEST_DATABASE_URL=postgresql://docket_test:synthetic_test_only@127.0.0.1:5432/docket_test_ci npm run test:team-db
```

The missing-database command regression uses npm’s `npm_execpath` to run its JavaScript CLI through the current Node executable on every platform. Run tests through npm; for a focused `node --test` invocation, explicitly set `npm_execpath` to your installed `npm-cli.js`.

Unit and PostgreSQL results are reported separately in CI. Company SonarQube remains a required pre-merge gate with no newly introduced Major/Critical findings; local tests and the CI workflow do not replace it. See the [implementation handoff](../superpowers/2026-10-14-implementation-handoff.md) for actual verification, recovery instructions and outstanding checks.


---

[← Developer Guide index](../DEVELOPER_GUIDE.md)
