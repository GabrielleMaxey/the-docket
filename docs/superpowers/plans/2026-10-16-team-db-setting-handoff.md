# Team DB setting and recovery notice handoff

Implemented the approved follow-up on `codex/team-db-setting`, based on `383d33b`. No push or merge.

## Behavior and interfaces

- `GET /api/team-priority/settings` and `PUT /api/team-priority/settings` use the existing origin/session/site protection. PUT accepts `{enabled:boolean}` and returns that shape. Existing `jira_instance_meta.use_team_db` stores `true` or `false`; absence is off. The preference is app-wide across saved sites and survives server restart through SQLite.
- Health now includes `enabled`, actual `configured`, and `connected`. Disabled health does not connect. The UI displays `Team data not configured — set TEAM_PRIORITY_DATABASE_URL` only after a successful health response says enabled and unconfigured. Loading and failed refreshes do not show that warning; configured outages remain separate.
- Common Team data operations reject with HTTP 403 / `TEAM_DATABASE_DISABLED`. Imports use the same guarded store. Explicit Team export collection and retained Team snapshots are rejected when off; Local export remains available. Migration tools still use the explicit raw pool/transaction entry writer.
- The client publishes changes to mounted consumers in the same browser application. Stale queued Team calls check the current preference at dispatch; a health response started before a saved toggle cannot undo that toggle. An already dispatched operation is not undone. No cross-tab event synchronization or distributed locking was added; the server preference remains authoritative for other tabs.
- Ordinary and Combined task editors retain Team drafts separately from Local state. Shared-program ownership is inactive while off; stale explicit Team actions reject instead of becoming Local. A retained explicit Team planning selection remains visibly Team and disabled until available; the user can select Local explicitly.
- Old shared-row priority/planning browser fields have no reliable Local/Team provenance. A code comment records that ambiguity. Those original cached values remain preserved at their original keys; they are not displayed as Local. Initial hydration loads authoritative Local metadata (and Team metadata when enabled), and edits save to the chosen database. Notes and unrelated rows are not cleared or migrated.
- The existing recovery banner has an accessible Dismiss action. `docket:legacy-site-recovery-dismissed` acknowledges it across reloads/sites. Legacy values remain untouched and are never claimed by a site. If browser storage access/writes are blocked, dismissal still works for the current session.

## RED / GREEN evidence

All regressions were run before their corresponding implementation:

| Regression stage | Observed RED | GREEN evidence |
| --- | --- | --- |
| Preference/store/routes and notice | Missing settings API/action, settings route 404 (3 failures) | 11 focused tests passed (`/private/tmp/team-setting-red.log`, `/private/tmp/team-setting-green.log`) |
| Mounted setting, Team draft, explicit export | Missing checkbox/client action; Team export incorrectly allowed | 3 passed (`/private/tmp/team-setting-ui-red.log`, `/private/tmp/team-setting-ui-green.log`) |
| Ambiguous shared cache | Original cached priority overwritten from 9 to 3 | Focused cache/table group passed (`/private/tmp/team-setting-cache-red.log`, `/private/tmp/team-setting-focused.log`) |
| Disabled shared ownership | Shared Now/Next used Team selection while off | Focused table group passed (`/private/tmp/team-setting-table-red.log`) |
| Restored enabled shared rows and blocked storage getter | Local priority 2 displayed instead of Team 9; Dismiss threw SecurityError | 3 passed (`/private/tmp/team-setting-last-red.log`, `/private/tmp/team-setting-last-green.log`) |
| Failed health refresh | Stale missing-configuration warning remained visible | Final full suite passed (`/private/tmp/team-setting-health-red.log`) |

## Final validation

Node `v22.23.1` was selected explicitly. No real Jira, AI, company DB, `.env`, or secret values were read. Synthetic HTTP/SQLite/driver-boundary fixtures only.

- `npm test`: **695 tests; 685 pass; 0 fail; 10 skipped; 0 cancelled**. Full output: `/private/tmp/team-setting-final-tests.log`. The 10 skips require the deliberately unconfigured disposable PostgreSQL integration fixture.
- `npm run build`: **passed** including node-version and jira-client-export checks; Vite production build completed. Full output: `/private/tmp/team-setting-final-build.log`.
- `git diff --check`: **passed**.
- Expected synthetic error paths log their controlled failure messages during the suite. Earlier full-suite failures were resolved by explicit enabled fixtures, corresponding test harness updates, and the integration corrections documented above.
- No local SonarQube scanner/configuration or Ruff executable/configuration was available (controller checked). Prior automatic approval review blocked Sonar upload; no retry or bypass was attempted. Ruff would not substitute for JavaScript analysis. Sonar severity is therefore unverified.
- No full-browser smoke or real PostgreSQL integration run was performed. Mounted component/hook tests cover the switch/warning, ordinary row ownership, independent Local/Team values and drafts; server/store tests cover the access boundary.

## Self-review

Checked preference scope and strict validation, disabled/error sanitization, saved-site/revision and active-generation wrappers, client queue dispatch and stale health guards, optional report/Gantt reads, explicit import/export gates, retained Team destination, legacy cache preservation, and blocked storage acknowledgement. Reused existing state/store owners without new classes or dependencies. Changes outside the application and other checkouts were not made.

Review focus remains in-flight operations and source ownership: already dispatched writes may complete; they are not rolled back by disabling. The server blocks subsequent data operations, and UI keeps explicit Team intent. The independent reviewer should verify the ordinary shared-row cache comment and separate Team-state routing closely.

## Changed files and line starts

Line starts below refer to this final implementation; multiple numbers identify separate changed regions.

| File | Changed line starts | Update |
| --- | --- | --- |
| `server/jiraProxy.mjs` | 21, 153 | Initialize the app-wide preference against the existing metadata DB. |
| `server/lib/taskExport.mjs` | 9, 95, 161, 283 | Reject explicit Team collection and retained Team preview download after disable; retain Local path. |
| `server/lib/teamPriorityPostgres.mjs` | 12, 15, 75, 83, 88, 104, 149, 168, 199, 210 | Persist boolean preference; default off; guard data operations; return enabled/configured/connected health and safe disabled errors. |
| `server/routes/capacityPlanningRoutes.mjs` | 5, 190 | Skip optional Team dates while disabled. |
| `server/routes/teamPriorityRoutes.mjs` | 4, 37, 39, 50, 52, 61 | Guard settings GET/PUT with existing site wrapper; validate booleans; deny disabled Team routes before configuration checks. |
| `src/AppRouter.jsx` | 2, 67 | Accessible Dismiss button on existing notice. |
| `src/Pages/Settings/components/IssueImportPreview.jsx` | 5, 34, 52 | Reject stale explicit Team review/save actions without changing destination or deleting edits. |
| `src/Pages/Settings/components/TeamPriorityDemoSection.jsx` | 5, 21, 24, 49, 65, 102, 118, 134 | Use team DB checkbox, accurate loading/error/off/configuration/connectivity states. |
| `src/Pages/Settings/components/TeamPriorityImportSection.jsx` | 4, 26, 70 | Subscribe to Team health and update availability/reason without losing preview drafts. |
| `src/Pages/WorkWeekTasks.jsx` | 124, 155, 172, 625 | Hide shared-program choices while off and pass enabled/readiness state to table. |
| `src/Pages/combinedWorkReports.js` | 76 | Skip Team history reads unless explicitly enabled and configured. |
| `src/Pages/components/JiraResultsTable.jsx` | 191, 851, 867, 869, 1313 | Off shared rows use Local ownership; explicit Team planning remains explicit and disabled until available. |
| `src/Pages/components/TaskExportModal.jsx` | 3, 25, 60, 104 | React to disabled state, cancel obsolete preview display, preserve explicit selected source and block unavailable Team preview. |
| `src/Pages/hooks/jiraJqlRunWorkflow.js` | 8, 93, 95, 154, 156, 273, 297, 353, 360, 367, 372, 431, 438, 441, 471, 520, 527, 530, 531 | Gate optional Team hydration, prevent late Team overlays after disable, hydrate Local values independently using existing paths. |
| `src/Pages/hooks/useTaskManagerJira.js` | 17, 261, 271, 283, 298, 312, 323, 434, 437, 764, 775, 781, 825, 828, 1024, 1045, 1064, 1138, 1141, 1143, 1150, 1166, 1287, 1318, 1463, 1481, 1491 | Separate Team priority/planning drafts from Local values; retain ambiguous original shared cache; hydrate authoritative sources and preserve failed Team drafts. |
| `src/services/jiraClient.js` | 70, 136, 491, 530 | Save preference; publish mounted-consumer health state; reject stale/queued Team calls; ignore pre-toggle health responses. |
| `src/utils/siteContextStore.js` | 4, 25, 37 | Dedicated browser acknowledgement and immediate/session fallback dismissal without legacy ownership fallback. |
| `tests/combinedManagedWork.test.mjs` | 235, 370, 430, 480, 523, 581 | Focused regression coverage or explicit opt-in update for existing Team-dependent fixtures. |
| `tests/combinedWorkReportsClient.test.mjs` | 240 | Focused regression coverage or explicit opt-in update for existing Team-dependent fixtures. |
| `tests/issueImportPreview.test.mjs` | 1, 69, 151, 211, 272 | Focused regression coverage or explicit opt-in update for existing Team-dependent fixtures. |
| `tests/issueMetadataFields.test.mjs` | 27, 39, 97, 137, 199, 227, 255 | Focused regression coverage or explicit opt-in update for existing Team-dependent fixtures. |
| `tests/issueMetadataStore.test.mjs` | 1, 59 | Focused regression coverage or explicit opt-in update for existing Team-dependent fixtures. |
| `tests/savedSiteOperations.test.mjs` | 39, 166 | Focused regression coverage or explicit opt-in update for existing Team-dependent fixtures. |
| `tests/siteContextStore.test.mjs` | 215 | Focused regression coverage or explicit opt-in update for existing Team-dependent fixtures. |
| `tests/siteOperationState.test.mjs` | 183 | Focused regression coverage or explicit opt-in update for existing Team-dependent fixtures. |
| `tests/taskExport.test.mjs` | 2, 21, 68, 81, 91, 280, 299, 308, 378, 380, 392, 553, 571 | Focused regression coverage or explicit opt-in update for existing Team-dependent fixtures. |
| `tests/teamPriorityPostgres.test.mjs` | 5, 17, 23, 32, 72, 114, 173 | Focused regression coverage or explicit opt-in update for existing Team-dependent fixtures. |
| `tests/teamPriorityRoutes.test.mjs` | 8, 11, 16, 20, 28, 54, 135 | Focused regression coverage or explicit opt-in update for existing Team-dependent fixtures. |
| `tests/teamDbSetting.test.mjs` | 1 | Default-off/persistence, direct-store denial, settings validation, disabled health and direct import-route tests. |
| `tests/teamSettingsFixture.mjs` | 1 | Synthetic SQLite opt-in fixture for tests that intentionally exercise enabled Team behavior. |
| `docs/superpowers/plans/2026-10-16-team-db-setting-handoff.md` | 1 | Durable behavior, verification, limitations and inventory handoff. |
| `.superpowers/sdd/2026-10-16-team-db-setting/task-1-report.md` | 1 | Implementer report (local SDD artifact). |


## Review round 1 — optional Team health and Local work

Addressed Important P1 against base `2875b1d`. The two ordinary workflow health requests are optional: transport/server failure returns unknown availability and allows Local metadata hydration and Jira result publication. The health client clears a previously connected snapshot only when its settings revision is still current. An old request cannot replace a newer toggle. HTTP errors below 500 and cancellation are not converted into optional availability; the existing outer load-more handler additionally rethrows `SITE_CONTEXT_CHANGED` and `SAVED_SITE_CONTEXT_CHANGED`. Combined unknown-ownership readiness was not changed. Minor expected logger noise was deferred as requested.

Changed regions:

- `src/Pages/hooks/jiraJqlRunWorkflow.js:282`: reused optional-health reader; call sites at 361 and 528; explicit context-code rethrow at 583.
- `src/services/jiraClient.js:491`: failed current health clears stale availability and still rejects its caller.
- `tests/combinedManagedWork.test.mjs:702`: actual workflow/client regressions for Local query and Load More, health 503, previous connected state, and both captured-context error codes. They assert Local values/results survive optional failure, no Team bulk read occurs, and context failures reject before Local metadata access.
- This handoff and `.superpowers/sdd/2026-10-16-team-db-setting/task-1-report.md`: review-fix evidence.

Exact commands used Node22 via `PATH=/Users/gabriellemaxey/.nvm/versions/node/v22.23.1/bin:$PATH`:

| Command | Result | Output |
| --- | --- | --- |
| `node --test --test-name-pattern='keeps Local results when optional Team health fails' tests/combinedManagedWork.test.mjs` | RED: 2 tests, 0 pass, 2 fail (health rejection / absent Local hydration) | `/private/tmp/team-setting-round1-red.log` |
| `node --test tests/combinedManagedWork.test.mjs tests/issueMetadataFields.test.mjs tests/combinedWorkReportsClient.test.mjs tests/siteContextStore.test.mjs tests/teamPriorityRoutes.test.mjs` | GREEN: 78 tests, 76 pass, 0 fail, 2 PostgreSQL fixture skips | `/private/tmp/team-setting-round1-affected.log` |
| `npm test` | 697 tests, 687 pass, 0 fail, 10 PostgreSQL fixture skips, 0 cancelled | `/private/tmp/team-setting-round1-full.log` |
| `npm run build` | Passed, including prebuild checks; Vite built in 441 ms | `/private/tmp/team-setting-round1-build.log` |
| `git diff --check` | Passed | No output |

No further scan, live-service access, dependencies, browser flow, push, merge, or unrelated changes. Earlier environment/scan limitations still apply.


## Final grouped fix wave — ordinary restored readiness and expected logger output

Addressed final-review Important P1 and Minor P3 together against base `577c024`. Ordinary restored shared rows now use the same optional-health reader as ordinary query/load-more. Successful authoritative Local hydration establishes readiness after optional Team health transport/server failure, and remains ready when a subsequent health refresh reports Team off. Unknown Team health remains unavailable. Both captured-context error codes keep the ordinary editor locked; unmount cancellation cannot later unlock it. The Combined mount effect and its conservative readiness policy were not changed.

The disabled-route test now captures only the `team-priority` logger during that test, asserts exactly the two safe denial messages, and retains its 403/`TEAM_DATABASE_DISABLED` response checks. Other logger output is forwarded; extra or altered Team messages fail the assertion. Final full-suite output contains zero leaked expected disabled-route messages.

Changed regions:

- `src/Pages/hooks/jiraJqlRunWorkflow.js:282`: export the existing optional-health reader for reuse; classification unchanged.
- `src/Pages/hooks/useTaskManagerJira.js:33,784`: import and use that reader only in ordinary restored-row mount hydration.
- `tests/combinedManagedWork.test.mjs:746,794`: mounted health503/off-recovery/Local-write cases, both context-change codes, and unmount-cancellation regression.
- `tests/teamDbSetting.test.mjs:31`: scoped expected-log capture and exact assertions.
- This handoff and `.superpowers/sdd/2026-10-16-team-db-setting/task-1-report.md`: grouped final-fix evidence.

Commands all selected Node22 using `PATH=/Users/gabriellemaxey/.nvm/versions/node/v22.23.1/bin:$PATH`:

| Command | Result | Output |
| --- | --- | --- |
| `node --test --test-name-pattern='ordinary Local readiness\|cancelled ordinary restored' tests/combinedManagedWork.test.mjs` | RED: 4 tests, 3 pass, 1 fail; health503 left readiness false after authoritative Local priority loaded | `/private/tmp/team-setting-final-wave-red.log` |
| `node --test tests/combinedManagedWork.test.mjs tests/teamDbSetting.test.mjs tests/issueMetadataFields.test.mjs tests/siteContextStore.test.mjs` | GREEN: 64 tests, 64 pass, 0 fail, 0 skipped | `/private/tmp/team-setting-final-wave-affected.log` |
| `npm test` | 701 tests, 691 pass, 0 fail, 10 disposable-PostgreSQL fixture skips, 0 cancelled | `/private/tmp/team-setting-final-wave-full.log` |
| `npm run build` | Passed including prebuild checks; Vite built in 507 ms | `/private/tmp/team-setting-final-wave-build.log` |
| `git diff --check` | Passed | No output |

This was the single final grouped fix wave; full tests/build ran once after its code was ready. No unrelated changes, new dependencies, real services, secrets, browser smoke, Sonar retry, push, or merge. Previously documented environment limitations remain unchanged. Scoped independent review follows this commit.
