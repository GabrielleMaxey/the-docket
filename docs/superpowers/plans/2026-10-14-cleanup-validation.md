# Cleanup and Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove unsupported installers and verified dead code, fix focused reliability defects, and establish pull-request validation.

**Architecture:** Modify existing scripts, helpers, and workflow conventions; avoid general component or styling refactors. Installer removal must preserve browser and Electron native-module setup. Integrated checks cover all linked plans before company validation.

**Tech Stack:** Existing npm scripts, Node tests, Electron rebuild tooling, GitHub Actions; test PostgreSQL service after D1.

**Spec:** [Approved design](../specs/2026-10-14-application-review-design.md); [overview](2026-10-14-application-review.md). C1–C3 can run before other subsystems if commits remain focused; C4 integrates all plans.

## Global Constraints

- Remove packaged installer support, not Electron itself.
- Keep `npm run dev:all` and `npm run desktop:dev`.
- Confirm an actual problem and measurable improvement before refactoring working code.
- Flag unique behavior in divergent inactive copies before deletion.
- No broad stylesheet replacement or large-file rewrite; no new dependency for cleanup.
- Company SonarQube validation remains required before merge, with no newly introduced Major or Critical findings.

## Review Focus

1. Removing electron-builder breaks native SQLite ABI setup → C1 verifies fresh browser and Electron starts in succession.
2. Unique behavior exists only in an apparently inactive duplicate → C3 records it before removing anything.
3. Image write/database update fails halfway → C2 retains the original bytes and references.
4. Empty replacement is intentional → C2 preserves existing clear-all semantics safely.
5. CI passes only because database tests skipped → C4 requires real PostgreSQL integration with zero skipped database cases.

### Task C1: Remove installer support, retain local development

**Files:** Modify `package.json`, `package-lock.json`, `README.md`, `.gitignore` if disposable mockups are not ignored; delete `.github/workflows/desktop-packaging.yml`; inspect tracked `build/icons/`/installer assets before deleting only proven installer-only entries. Preserve `electron/main.cjs`, `electron/preload.cjs`, shared application icons and existing native rebuild scripts.

**Interfaces:** Supported workflows remain `dev:all`, `desktop:dev`, `desktop:rebuild-native`, `desktop:doctor`, and `build`. Remove `desktop:pack`, `desktop:dist*`, `desktop:generate-icons`, packaging `build` config, installer-only `electron-builder` and `icon-gen`. Existing `desktop:build` may remain as the harmless build alias; do not rename working commands.

- [ ] Record which scripts depend on electron-builder/icon-gen and identify shared assets using `rg` and tracked-file listings. No test is needed to assert deleted package names.
- [ ] Replace the installer-specific postinstall with `npm rebuild better-sqlite3` for Node runtime. Retain Electron-specific rebuild in `predev:electron` using the already installed `@electron/rebuild`; retain Node rebuild in `predev:api`/`pretest`. Remove only installer commands/config/dependencies/workflow. Regenerate lockfile through npm without opportunistic unrelated version bumps.
- [ ] Update README to explain unsigned packaged installers are unsupported; show both local launch workflows, Node/Electron ABI recovery, and environment setup. Add `.superpowers/` to gitignore as disposable mockup content; preserve local files and unrelated ignores.
- [ ] In an isolated test checkout with no real credentials, run `npm ci`, `npm test`, `npm run build`, then start/stop `npm run dev:all`, `npm run desktop:dev`, and browser mode again. Expected: native SQLite loads in each runtime; desktop preload works; no installer command is needed. Record any baseline application test failure separately if D2 has not landed yet; do not claim a full pass until fixed.
- [ ] Run `npm audit --json`; identify dependency paths and runtime/dev impact after removals. Address remaining issues only with specific compatible changes; do not use blanket force upgrades. Commit `chore: remove packaged installers and retain desktop development`.

### Task C2: Preserve note images and honor search limits

**Files:** Modify `server/lib/noteImageStore.mjs`, `server/routes/appConfigRoutes.mjs`, `tests/noteImageStore.test.mjs`, `tests/issueMetadataRoutes.test.mjs`, `tests/appConfigRoutes.test.mjs`. Two focused commits are appropriate because image storage and search limits are independently reviewable.

**Interfaces:** Keep `replaceNoteImages(db,baseDir,issueKey,files)` and its return shape; keep `runJiraSearchRequest(input,legacyOptions={})` from existing proxy. Correct both numeric callers near existing app-config lines 547 and 606 to use `{jql,maxResults}` or `(jql,{maxResults})` consistently.

- [ ] Add image regression tests for failed second file write, failed database insert, same-filename replacement, empty replacement, and old-file cleanup failure. Use Node mocks of filesystem methods and a test SQLite trigger for controlled failure; no permission-dependent failure tests. Assert original file bytes and rows survive before successful transaction; after success only new rows are referenced. Run `node --test tests/noteImageStore.test.mjs tests/issueMetadataRoutes.test.mjs`; observe the destructive failure before fixing.
- [ ] Write replacement bytes into a uniquely named generation directory under the issue directory, then transactionally replace only that issue's image rows. Delete old generation/files after commit. On precommit failure remove only newly staged files; on postcommit cleanup failure keep the valid new generation and return success with a safe cleanup warning. Do not delete the parent directory that now contains the replacement. Empty files remains an intentional clear after DB commit. Preserve image metadata/ordering; don't change upload limits.
- [ ] Re-run image tests; commit only image-related files as `fix: retain existing note images until replacement commits`.
- [ ] Add app-config route tests that capture both search calls and assert `maxResults === requestedLimit`, unchanged JQL, and existing result handling. Run `node --test tests/appConfigRoutes.test.mjs tests/jiraSearchHelpers.test.mjs` to show failures, correct the two caller arguments, re-run to pass, and commit `fix: pass search limits through the options contract`.

### Task C3: Remove only proven duplicates and unused code

**Files:** Candidate deletes are root `Pages/` and `services/`; `src/Components/WebModeNotice.jsx`, `src/Components/scrollTop.js`, `src/Pages/components/cells/NotesCell.jsx`, `src/Pages/components/cells/PushActionsCell.jsx`, `src/Pages/components/cells/StatusCell.jsx`, `src/Pages/hooks/useEpicFilters.js`, `src/Pages/hooks/useReminders.js`, `src/Pages/hooks/epicFilterRunWorkflow.js`. Modify `src/services/jiraClient.js`, `package.json`, `package-lock.json`, `README.md` only for proven related cleanup. Preserve active `src/context/EpicFiltersContext.jsx` and `src/Pages/hooks/useTodos.js`.

**Interfaces:** No intended runtime/API changes. The context-exported `useEpicFilters` remains active; its name matching an unused hook file is not a deletion reason.

- [ ] Compare every root duplicate with its active `src/` counterpart, then search static imports, lazy imports, script paths, tests, configuration, dynamic import patterns and asset links. Record exact divergent behavior. If any unique behavior was recently removed or belongs to unresolved user work, stop that deletion and ask; continue unrelated verified cleanup.
- [ ] Remove only verified unused files/packages. Verify `react-scroll`, `styled-components`, and `extractJiraErrorMessage.empty = true` have no consumers before removal. Regenerate lockfile narrowly. Do not delete tests just because their implementation is inconvenient; no tests that merely assert files are gone.
- [ ] Run `npm run check:jira-client-exports`, `npm test`, and `npm run build`; verify core Task Management, Settings, Past Reports, and Project Managers screens. Compare build output size as evidence, not a new performance target. Semantic UI CSS remains unless a separate measured change is approved. Commit `chore: remove verified inactive application code`.

### Task C4: Pull-request checks and integrated handoff

**Files:** Create `.github/workflows/validate.yml`; modify `package.json`, `README.md`, and D1 integration test files only as needed to make database-test requirements explicit. Do not invent SonarQube credentials, project keys, or a working company endpoint.

**Interfaces:** Workflow triggers `pull_request` and `workflow_dispatch`, with read-only repository permissions. Add `test:team-db` running D1/D3 database integration tests and failing immediately without `DOCKET_TEST_DATABASE_URL`; normal unit tests can explicitly skip unavailable integration cases. Real DB fixtures require a dedicated database named `docket_test_*` before any destructive cleanup.

- [ ] Add a command-level check that `npm run test:team-db` fails with a clear missing-test-DB message when configuration is absent. Configure a dedicated PostgreSQL 16 service in CI with synthetic credentials/database, health checks and no company data. Match setup-node to `.nvmrc`; reuse currently established checkout/setup-node major versions instead of adding unrelated action upgrades.
- [ ] Workflow performs `npm ci`, client export check, `npm test`, `npm run test:team-db`, and `npm run build`. Exercise SQL migrations twice and a rollback in real PostgreSQL. No `.env`, live Jira, company secrets, installer artifacts, or private team data are required. Report unit tests and DB integration separately so skipped tests cannot masquerade as full validation.
- [ ] Run the same sequence locally against an explicitly provided disposable PostgreSQL database where available; otherwise mark database integration pending and use the CI service for real evidence. Capture browser and desktop smoke checks, To Do migration/retry behavior, per-site data isolation, import conflict handling, equal save choices, and workbook visual inspection from earlier plans. Verify empty/failed/unconfigured states, not just happy paths.
- [ ] Recheck dependency audit and changed-file diff; confirm no secrets, unsupported installer commands, inactive root imports, or unrelated refactors remain. Run company SonarQube when accessible; it must report no newly introduced Major/Critical findings. If unavailable, document the outstanding pre-merge gate, not a waiver or a fabricated pass. Commit `ci: validate pull requests without company credentials`.
- [ ] Hand off focused commits, changed-file links, test results, migration/recovery instructions, dependency audit disposition, and outstanding company checks. Do not merge, deploy, provision a database, upload a workbook, or package an installer as part of this plan.
