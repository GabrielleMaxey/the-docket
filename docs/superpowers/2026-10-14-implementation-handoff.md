# Application review implementation handoff

The approved S1–S4, T1–T2, D1–D3, E1–E3 and C1–C4 code tasks are implemented on `codex/final-review-fixes` in the isolated `docket-security/taskManager` worktree. The consolidated final-review correction wave is implemented and final local checks pass; scoped review remains pending. Company SonarQube and execution of the configured PostgreSQL 16 workflow remain required before merge. Native browser saved-file completion remains a manual check. No push, merge, deployment, company database provisioning, workbook upload or installer packaging occurred.

## Consolidated final-review corrections (2026-10-15)

The final review at `e74804c` identified I1–I5 and M1–M2. All seven received the narrow corrections below on `codex/final-review-fixes`. This is implementation evidence, not final review approval or merge authorization.

| Finding | Correction and regression evidence |
| --- | --- |
| I1 | Explicit activation validates the proposed hostname before persistence. A blocked saved/legacy active site retains its local identity/data and starts Settings/local APIs/personal To Dos with a configuration error and no environment token read. Copied-code startup fixtures block every outbound attempt and prove failed activation leaves persisted ID and public generation unchanged, source data survives, and an allowed entry remains recoverable. |
| I2 | The existing create-metadata cache clears only after successful drained activation. Same-key A→B→A tests cover component options and create payload issue-type metadata. |
| I3 | The import preview POST is explicitly read-only. Invalid CSV creates no failed-save/export-consent job and activation succeeds; failed import commits still block switching until retried successfully. |
| I4 | Comment chunks and create-field siblings all settle before the first rejection propagates. Deferred regressions prove A fallback requests and late cache fills complete before B activates or A's DB closes. |
| I5 | Rovo MCP fetch and response-body consumption share a finite abort deadline, default 30 seconds, configurable through `ROVO_REQUEST_TIMEOUT_MS`. The handler waits for actual aborted-body settlement before releasing its site lease; there is no automatic replay. Longer legitimate responses may require a larger setting. Other provider behavior is unchanged. |
| M1 | Each mounted page coalesces outstanding autosaves per issue while retaining the captured site and existing queued job across navigation. A 100-edit regression requires only the latest initial write, one in-flight update, and the remounted page's final write; failure retry still clears the save barrier. |
| M2 | Empty/non-JSON binary errors preserve HTTP status with a safe generic message; raw HTML/text is not surfaced. The actual modal download handler invalidates a non-JSON 409 preview. JSON errors keep their useful messages. |

Final-wave validation uses synthetic transport and copied-code temporary loopback fixtures only. `npm test` passed **608 tests: 598 passes, 10 explicit SQL skips, zero failures** (exit 0; `/private/tmp/docket-final-unit-final.log`). `npm run build` passed, including Node and client-export checks (exit 0; `/private/tmp/docket-final-build.log`). Focused server regressions passed 61/61 and focused client regressions 5/5; the final full run also includes the updated no-token-read assertion. The first full run failed only the superseded startup-throws expectation; its replacement retains the stronger no-token-read requirement and was independently observed RED then GREEN before the final full run.

No database schema, SQL or transaction code changed, so the earlier PostgreSQL 14.1 integration evidence below was retained rather than rerun. PostgreSQL 16 CI remains unexecuted. The existing CommonJS/ESM ExperimentalWarning and expected negative-case logs remain. No scanner/source upload, install, live-service call, native-file-save test, push, merge or deployment was performed in this wave. SonarQube, native file-save/open, native Windows and company-environment limitations remain exactly as recorded below.

Focused final-wave commits: `6839df0` (site recovery/lifetime/cache/Rovo) and `21d07c2` (client preview/notes/download). The following documentation commit refreshes this handoff and cumulative inventory; use `git log -1` for its final SHA. Detailed finding anchors, red/green evidence, command statuses and limitations are recorded in `/private/tmp/docket-final-fix-report.md`.

## Original findings and task dispositions

The original [21-row issue / why / refactor table](specs/2026-10-14-application-review-design.md#review-findings-and-agreed-disposition) remains the source of scope and rationale. Current dispositions:

| Original issue IDs | Implemented disposition | Deliberate limit |
| --- | --- | --- |
| 1, 2, 13 | S1 loopback/Host/Origin protection, approved HTTPS destinations, environment-only token and verified retirement of old saved tokens | App-session authentication deferred; same-user processes can still access local API/files |
| 5, 15 | S2 deadlines/uncertain writes and S3 operation drain, generation checks and scoped persisted state | No automatic retry of uncertain Jira writes; no live Jira verification |
| 4, 8, 9, 10 | S3 site-scoped caches; T1 personal SQLite/migration ledger and T2 serialized/idempotent autosave with visible retries | Pending in-memory edits do not promise crash recovery; ambiguous old records retained for review |
| 6, 7 | D1 optional hostname/key PostgreSQL, D2 partial-field validation and D3 editable/destination-specific imports with approval, conflicts and equal save choices | No company DB provisioned, MySQL adapter or arbitrary custom-field import |
| 3, 20 | C1 removed installer tooling/dependencies and retained browser/Electron rebuild workflows; final audit reports zero advisories | Packaged installers unsupported; Windows/native desktop visual inspection unverified |
| 11, 12, 21 | C3 removed 89 explicitly approved inactive root copies, eight unused modules, two unused packages and stray assignment | Active context/hooks and Semantic UI CSS retained; broad stylesheet rewrite deferred |
| 14 | S4 sandbox, isolation, CSP, navigation/external-link policy | No certification of native OS policy or all company laptop environments |
| 16, 17 | C2 preserves image generations through transaction and passes search-limit options correctly | No general image-storage or search architecture refactor |
| 18 | Only task-required focused helpers/components changed | General large-file rewrites and unrelated working-code refactors deferred |
| 19 | C4 read-only PR/manual workflow, pinned Node, synthetic PostgreSQL 16 and separate mandatory DB command | Workflow is configuration, not evidence that GitHub CI ran; company Sonar gate remains |
| Approved workbook addition | E1 source-aware immutable snapshots, E2 real XLSX per saved entry and E3 reviewed export controls | No direct SharePoint upload/sync, binary images, workbook re-import or combined dashboard |

## Task implementation and validation

| Plan / tasks | Outcome and evidence |
| --- | --- |
| [Security S1–S4](plans/2026-10-14-local-security.md) | Loopback/destination/token, deadline/uncertain-write, operation lifetime/site caches and Electron constraints implemented. Final suite covers Host/Origin/stale context, request body deadlines, drain barriers and navigation/CSP. |
| [To Dos T1–T2](plans/2026-10-14-personal-todos.md) | Independent personal store and ledger, retained ambiguous sources, stable client IDs and merged/serialized edits. Earlier real browser smoke verified rapid edits, date/navigation, failed-save Retry, failed-delete Retry, completion/clear and recovery notice. C4 confirmed a personal To Do survives A→B→A. |
| [Data D1–D3](plans/2026-10-14-team-data-imports.md) | PostgreSQL store/migrations, metadata preservation and reviewed imports implemented. Final real SQL covers hostname isolation, both destination conflicts, serializable races/rollback and tracking provenance. C4 closed full Settings file-picker/local-cache-to-task-table flow. Earlier D3 browser/real-PG scenarios cover Team saves/conflicts and equal choices. |
| [Workbook E1–E3](plans/2026-10-14-workbook-export.md) | Source-aware previews, real writer/readback and modal implemented. E2 imported actual generated XLSX bytes into bundled viewer and inspected all five sheets plus notes/planning panels. C4 closed full WorkWeekTasks→modal→scope→preview integration. Native Blob saved-file completion is still unverified. |
| [Cleanup C1–C4](plans/2026-10-14-cleanup-validation.md) | Installer removal, safe images/search fix, approved inactive cleanup and CI implemented. C1 clean checkout proved Node browser→Electron→Node browser native SQLite. C3 production browser checked Task Management, Settings, Past Reports and PM screens. Final C4 checks below. |

## Final command evidence

All final commands ran with a sanitized environment and synthetic data on Node 22.12.0. Full logs and numeric statuses are retained locally at `/private/tmp/docket-c4-evidence/`; no credentials or real user fixtures were required.

| Command / scenario | Actual result | Log |
| --- | --- | --- |
| `npm ci` | Exit 0; postinstall rebuilt SQLite for Node | `npm-ci.log` |
| `npm run check:jira-client-exports` | Exit 0; 107 client imports resolved | `exports.log` |
| `npm test` without test DB URL | Exit 0; 596 tests: 586 pass, 10 explicit real-SQL skips, zero failures | `unit-final.log` |
| `npm run test:team-db` with dedicated loopback fixture URL | Exit 0; 72 pass, zero failures/skips; includes all 10 real-SQL cases | `postgres-final.log` |
| Fresh-schema migrations | Every current migration applied once; second run applied zero; ledger matched migration filenames | `postgres-final.log` |
| Rollback/conflict/race scenarios | Real PostgreSQL rejected invalid/stale writes and retained pretransaction values; explicit in-test race assertions passed | `postgres-final.log` |
| `npm run build` | Exit 0; Node/client checks and Vite production build passed | `build-final.log` |
| `npm audit --json` | Exit 0; zero info/low/moderate/high/critical advisories | `audit-final.log` |
| Missing DB command regression | RED exit 1: missing script; GREEN test exit 0: command exits 1 with required-variable guidance | `command-red.log`, `command-green.log` |
| Owned PostgreSQL shutdown | Exit 0; server stopped after checks | `postgres-stop.log` |

The command regression invokes npm’s JavaScript CLI through the current Node executable, using `npm_execpath` supplied by npm. Direct focused `node --test` runs must set `npm_execpath` to the installed `npm-cli.js`; an assertion supplies that guidance when omitted. This avoids spawning Windows `npm.cmd` as an executable. The focused launch regression was verified with no npm executable on PATH; a native Windows run is still unverified.

The first aggregate SQL run failed 1 of 72 cases with a serialization conflict while separate fixture files concurrently migrated/cleaned/wrote shared tables. PostgreSQL logged a canceled read/write pivot at COMMIT. The command now uses Node's `--test-concurrency=1`; existing explicit concurrent-transaction race tests still run. The final 72-case run passed; application isolation/transaction behavior was unchanged. CI explicitly blanks `DOCKET_TEST_DATABASE_URL` for the unit step, then provides it only for the separate mandatory DB step. All fixtures validate loopback, explicit port and `docket_test_*` database before destructive cleanup.

Local SQL evidence is PostgreSQL **14.1**, owned fixture only, on a fresh loopback port; it does not establish PostgreSQL 16 execution. The workflow configures `postgres:16` with synthetic credentials, health checks and dynamic port, checkout v5/setup-node v6 retained from the prior workflow, Node from `.nvmrc`, PR/manual triggers and `contents: read`. No secrets, artifact uploads or packaging actions are present.

The install retains transitive deprecation warnings for inflight/rimraf/lodash.isequal/glob/prebuild-install/fstream. Tests retain the existing CommonJS→ESM ExperimentalWarning and expected negative-case logs. These are disclosed warnings, not newly introduced advisories. The exact pg 8.23.1, ExcelJS 4.4.0 and scoped uuid 11.1.1 override remain installed; no C4 dependency/lockfile change was made.

## Integrated UI and workbook evidence

C4 ran the unchanged production application and built assets with fresh SQLite, the owned PostgreSQL test DB and a temporary Node fetch interceptor. The interceptor returned synthetic Jira fixtures and blocked all other upstream server requests. This is real application/router/SQLite/SQL behavior with fake Jira transport; it is not live-service verification. Only a new temporary browser tab was used and closed; user tabs were untouched.

- Full Settings navigation → Import metadata → actual file chooser → synthetic CSV → editable preview → approval → Save locally succeeded. Both save buttons had equal primary styling/enabled choices after approval. Task Management Run JQL displayed imported P2, Now and the imported note, demonstrating the actual save/cache/application path.
- Full Task Management → Download tasks → selected saved entry/project → complete preview showed the same imported metadata, separately labeled local/Team notes and synthetic latest Jira comment. An unopened saved entry correctly showed unavailable scope/migration guidance.
- A→B with the same synthetic key showed P0 and empty note; returning to A and rerunning its query restored P2/Now/note. The personal To Do survived the switch. Browser warning/error logs were empty.
- Clicking Download workbook produced “Workbook download requested.” CUA's download event timed out after 10 seconds, as in E3. Do not claim the native saved-file step passed; manually confirm a saved workbook opens before rollout.
- Earlier T2 browser checks cover failed save/delete retries and migration recovery; C3 covers empty archive/PM and unconfigured Jira/team states. C1 proves clean native ABI switching and preload/sandbox constraints using owned Electron process inspection, with browser visuals. Native desktop visuals and Windows remain unverified.
- E2 actual XLSX inspection used `/private/tmp/docket-e2-visual/synthetic-export.xlsx`, rendered `/private/tmp/docket-e2-visual/sheet-0.png` through `sheet-6.png`, and ExcelJS readback. It checked all sheets, empty/failed labels, multiline/formula-looking literal text, exact dates, source identity, links, notes and planning fields. This is actual XLSX viewer evidence, not native Excel/Numbers certification. E3 also read back the actual response bytes at `/private/tmp/docket-e3-browser-download.xlsx`.

## Migration and recovery

Back up the application data directory and any approved team database before upgrading. Preserve legacy site SQLite files, reminder sources and migration records. Personal To Dos now live in `personal-todos.sqlite`; successful per-source ledger entries prevent deleted reminders returning. Ambiguous provenance is deliberately retained and shown for review. Do not clear the ledger or delete original sources to force a rerun. Pending-memory save errors retain edits and offer Retry; restart/crash recovery of unsaved drafts is not promised.

Local SQLite remains usable without shared DB configuration. For an owner-approved team DB, set server-only `TEAM_PRIORITY_DATABASE_URL` and optional absolute `TEAM_PRIORITY_DATABASE_CA_FILE`, then run `npm run team-db:migrate` with exported environment. The CLI does not load `.env`. Migrations use a version ledger, advisory lock and transaction; rerun after correcting a reported configuration/failure. Do not edit applied SQL, drop shared tables or infer unknown old-demo site mappings. Preserve an original JSON export, annotate a separate copy with verified sources, then use `team-db:import-demo` only with an explicit mapping. Recovery uses the approved backup restored to a separate database.

Set `JIRA_API_TOKEN` in the server environment and restart. Retire saved old tokens only after Settings connection verification of each saved URL/email succeeds. A timed-out Jira write may have succeeded: inspect Jira before an explicit retry. Import conflict, site switch, expiry or API restart requires a new preview/approval; unknown save response retries the same preview identity first, without silently saving to the other destination.

Stop one runtime before switching: Node recovery is `npm rebuild better-sqlite3`; Electron recovery is `npm run desktop:rebuild-native` or `npm run desktop:doctor`. Supported launches remain `npm run dev:all` / `npm run desktop:dev`. Root duplicate deletions were explicitly approved against their 89-path manifest; recover originals with Git from commit `4651379` if needed, without overwriting active `src/` implementation.

## Required external/manual gates

Company SonarQube remains required before merge with no newly introduced Major/Critical findings. No scan was invoked in C4. A prior automatic approval review rejected scanner execution because the source-upload destination was unspecified; this restriction was not bypassed. An explicitly approved company destination and actual company result are still required. The executable is unavailable locally; Ruff is not a JavaScript substitute.

Execute the configured PostgreSQL 16 CI before merge; its local equivalent passed only PostgreSQL 14.1 here. Complete native browser save/open confirmation. Live company Jira/DB behavior, company laptop policy, native desktop visuals and Windows were not exercised. Nothing here waives those practical validation limits.

## Branch and focused commits

The cumulative branch begins at `d27903ee78d55b7351f7663c32786c5550f7ccbe`; C4 starts at `a6b67b6`. The C4 CI commit is `2edff1e` — `ci: validate pull requests without company credentials`. A focused test portability correction follows it; resolve the final SHA with `git log -1`. No remote integration was performed. Focused implementation/review-fix commits:

- `4b41021` — fix: restrict local API and Jira credential destinations
- `ffc3c45` — fix: bound Jira requests and preserve uncertain write outcomes
- `f061ab1` — fix: isolate site operations and persisted Jira state
- `c860dd3` — fix: close remaining site-operation lifetime gaps
- `1c4dbc5` — fix: constrain Electron renderer and navigation
- `1b14342` — fix: preserve personal todos independently of Jira sites
- `18adf2f` — fix: preserve site todos before legacy database seeding
- `a0dae56` — fix: serialize todo autosave and preserve pending edits
- `f765f38` — feat: add optional site-scoped PostgreSQL team data
- `f68bd9b` — fix: preserve shared tracking provenance for planning inheritance
- `703eeba` — fix: preserve unowned metadata fields during imports
- `1db1a00` — fix: use exclusive Now and Next checkboxes
- `5387ad9` — fix: hydrate missing local planning fields after shared reads
- `5a5b422` — feat: review and approve metadata imports before saving
- `bbb938a` — fix: allow independent import comparison and priority clearing
- `dbe44b8` — feat: preview site-scoped task exports
- `78ca24c` — fix: preserve complete project scope pagination
- `4f9d854` — feat: download one worksheet per Jira site
- `de6f924` — fix: preserve Unicode boundaries in worksheet names
- `0a8d0fe` — feat: add reviewed multi-site workbook export controls
- `6a0d181` — chore: remove packaged installers and retain desktop development
- `b2bbe6c` — test: make metadata rendering fixture portable
- `d61bb32` — docs: remove obsolete packaging CI secret guidance
- `d77c5b8` — fix: retain existing note images until replacement commits
- `4651379` — fix: pass search limits through the options contract
- `a6b67b6` — chore: remove verified inactive application code
- `2edff1e` — ci: validate pull requests without company credentials

## Cumulative change counts

Counts compare the cumulative base above to this final worktree once, including the handoff itself. They do not sum overlapping/stacked branch diffs. Source/scripts include JavaScript, JSX, CSS, SQL, HTML and SVG; tests are separate; docs include Markdown; package/lock/workflow/build configuration and assets are grouped under dependencies/config. Removed inactive source is included in removals. Binary assets are listed with no textual line count.

| Category | Added | Removed | Files |
| --- | ---: | ---: | ---: |
| Dependencies/config | 2,681 | 4,647 | 9 |
| Source/scripts | 3,480 | 28,851 | 177 |
| Docs | 615 | 144 | 13 |
| Tests | 4,338 | 46 | 25 |
| Total | 11,114 | 33,688 | 224 |

## Changed files and line anchors

This exhaustive cumulative table includes modifications, additions and deletions. Links for present files point to the first changed line (new files: line 1); deleted files list the original line 1 and are recoverable from the base/preceding focused commits. Counts are additions/removals relative to the cumulative base, not a claim that every file was rewritten in C4.

| File / first changed line | Change | + / − |
| --- | --- | --- |
| [.env.example:22](../../.env.example#L22) | Modified | 8 / 7 |
| `.github/workflows/desktop-packaging.yml:1` (deleted) | Deleted | 0 / 79 |
| [.github/workflows/validate.yml:1](../../.github/workflows/validate.yml#L1) | Created | 48 / 0 |
| [.gitignore:57](../../.gitignore#L57) | Modified | 3 / 0 |
| `Pages/Chat.jsx:1` (deleted) | Deleted | 0 / 368 |
| `Pages/Dashboard.jsx:1` (deleted) | Deleted | 0 / 1 |
| `Pages/Dashboard/components/AssigneeMetricCard.jsx:1` (deleted) | Deleted | 0 / 79 |
| `Pages/Dashboard/components/AssigneeWorkloadChart.jsx:1` (deleted) | Deleted | 0 / 23 |
| `Pages/Dashboard/components/ContributorDueTasksSection.jsx:1` (deleted) | Deleted | 0 / 37 |
| `Pages/Dashboard/components/ContributorOverdueList.jsx:1` (deleted) | Deleted | 0 / 123 |
| `Pages/Dashboard/components/ContributorStatusBar.jsx:1` (deleted) | Deleted | 0 / 127 |
| `Pages/Dashboard/components/DashboardFiltersPanel.jsx:1` (deleted) | Deleted | 0 / 496 |
| `Pages/Dashboard/components/DashboardRefreshActions.jsx:1` (deleted) | Deleted | 0 / 35 |
| `Pages/Dashboard/components/DashboardTabs.jsx:1` (deleted) | Deleted | 0 / 19 |
| `Pages/Dashboard/components/DueByHierarchicalList.jsx:1` (deleted) | Deleted | 0 / 133 |
| `Pages/Dashboard/components/EpicBreakdownList.jsx:1` (deleted) | Deleted | 0 / 82 |
| `Pages/Dashboard/components/EpicMetricCard.jsx:1` (deleted) | Deleted | 0 / 156 |
| `Pages/Dashboard/components/EpicMetricsSummary.jsx:1` (deleted) | Deleted | 0 / 24 |
| `Pages/Dashboard/components/IndividualContributorsPanel.jsx:1` (deleted) | Deleted | 0 / 116 |
| `Pages/Dashboard/components/JqlContributorMetricCard.jsx:1` (deleted) | Deleted | 0 / 75 |
| `Pages/Dashboard/components/MetricBar.jsx:1` (deleted) | Deleted | 0 / 30 |
| `Pages/Dashboard/components/OverallSummaryCard.jsx:1` (deleted) | Deleted | 0 / 37 |
| `Pages/Dashboard/components/PeriodSummary.jsx:1` (deleted) | Deleted | 0 / 45 |
| `Pages/Dashboard/components/ProjectContributorMetrics.jsx:1` (deleted) | Deleted | 0 / 94 |
| `Pages/Dashboard/components/ProjectMetricsSection.jsx:1` (deleted) | Deleted | 0 / 119 |
| `Pages/Dashboard/components/ReportDiagrams.jsx:1` (deleted) | Deleted | 0 / 94 |
| `Pages/Dashboard/components/ReportPanel.jsx:1` (deleted) | Deleted | 0 / 229 |
| `Pages/Dashboard/components/WeeklyDigestPanel.jsx:1` (deleted) | Deleted | 0 / 91 |
| `Pages/Dashboard/hooks/useDashboardRefresh.js:1` (deleted) | Deleted | 0 / 463 |
| `Pages/Dashboard/hooks/useReportGeneration.js:1` (deleted) | Deleted | 0 / 246 |
| `Pages/Dashboard/index.jsx:1` (deleted) | Deleted | 0 / 537 |
| `Pages/Dashboard/utils/dashboardMetricsUtils.js:1` (deleted) | Deleted | 0 / 674 |
| `Pages/Errors.jsx:1` (deleted) | Deleted | 0 / 16 |
| `Pages/ProjectManagers.jsx:1` (deleted) | Deleted | 0 / 1049 |
| `Pages/ReportArchive.jsx:1` (deleted) | Deleted | 0 / 670 |
| `Pages/Settings.jsx:1` (deleted) | Deleted | 0 / 1 |
| `Pages/Settings/components/ChatAssistantSection.jsx:1` (deleted) | Deleted | 0 / 80 |
| `Pages/Settings/components/DateFieldsSection.jsx:1` (deleted) | Deleted | 0 / 127 |
| `Pages/Settings/components/DirectReportsSection.jsx:1` (deleted) | Deleted | 0 / 293 |
| `Pages/Settings/components/MetricTargetsSection.jsx:1` (deleted) | Deleted | 0 / 486 |
| `Pages/Settings/components/PresetsSection.jsx:1` (deleted) | Deleted | 0 / 300 |
| `Pages/Settings/components/SettingsSection.jsx:1` (deleted) | Deleted | 0 / 30 |
| `Pages/Settings/components/TeamPriorityDemoSection.jsx:1` (deleted) | Deleted | 0 / 151 |
| `Pages/Settings/components/TeamPriorityImportSection.jsx:1` (deleted) | Deleted | 0 / 239 |
| `Pages/Settings/components/WorkWeekHeaderSection.jsx:1` (deleted) | Deleted | 0 / 30 |
| `Pages/Settings/components/settingsSection.css:1` (deleted) | Deleted | 0 / 98 |
| `Pages/Settings/index.jsx:1` (deleted) | Deleted | 0 / 133 |
| `Pages/WorkWeekTasks.jsx:1` (deleted) | Deleted | 0 / 662 |
| `Pages/chat.css:1` (deleted) | Deleted | 0 / 530 |
| `Pages/components/AiHelperIntakePanel.jsx:1` (deleted) | Deleted | 0 / 122 |
| `Pages/components/CreateIssueModal.jsx:1` (deleted) | Deleted | 0 / 1602 |
| `Pages/components/EpicEvaluationPanel.jsx:1` (deleted) | Deleted | 0 / 309 |
| `Pages/components/EpicFilterPanel.css:1` (deleted) | Deleted | 0 / 123 |
| `Pages/components/EpicFilterPanel.jsx:1` (deleted) | Deleted | 0 / 217 |
| `Pages/components/GanttChart.jsx:1` (deleted) | Deleted | 0 / 696 |
| `Pages/components/JiraFilterImportModal.jsx:1` (deleted) | Deleted | 0 / 112 |
| `Pages/components/JiraResultsTable.jsx:1` (deleted) | Deleted | 0 / 1419 |
| `Pages/components/JqlControlsPanel.jsx:1` (deleted) | Deleted | 0 / 230 |
| `Pages/components/JqlRunMetrics.jsx:1` (deleted) | Deleted | 0 / 152 |
| `Pages/components/MyMetricsSection.jsx:1` (deleted) | Deleted | 0 / 37 |
| `Pages/components/NoteImagesStrip.jsx:1` (deleted) | Deleted | 0 / 124 |
| `Pages/components/ProjectReportPanel.jsx:1` (deleted) | Deleted | 0 / 495 |
| `Pages/components/TaskManagerHeaderPanel.jsx:1` (deleted) | Deleted | 0 / 206 |
| `Pages/components/WeeklyPlanPanel.jsx:1` (deleted) | Deleted | 0 / 319 |
| `Pages/components/WorkWeekHeaderBanners.jsx:1` (deleted) | Deleted | 0 / 107 |
| `Pages/components/cells/AssigneeCell.jsx:1` (deleted) | Deleted | 0 / 210 |
| `Pages/components/cells/NotesCell.jsx:1` (deleted) | Deleted | 0 / 23 |
| `Pages/components/cells/PriorityCell.jsx:1` (deleted) | Deleted | 0 / 48 |
| `Pages/components/cells/PushActionsCell.jsx:1` (deleted) | Deleted | 0 / 51 |
| `Pages/components/cells/StatusCell.jsx:1` (deleted) | Deleted | 0 / 45 |
| `Pages/components/jiraResultsTableUtils.js:1` (deleted) | Deleted | 0 / 129 |
| `Pages/dashboard.css:1` (deleted) | Deleted | 0 / 1752 |
| `Pages/hooks/epicFilterRunWorkflow.js:1` (deleted) | Deleted | 0 / 78 |
| `Pages/hooks/jiraJqlRunWorkflow.js:1` (deleted) | Deleted | 0 / 918 |
| `Pages/hooks/useCalendarData.js:1` (deleted) | Deleted | 0 / 39 |
| `Pages/hooks/useCreateIssueManualKey.js:1` (deleted) | Deleted | 0 / 115 |
| `Pages/hooks/useEpicFilters.js:1` (deleted) | Deleted | 0 / 56 |
| `Pages/hooks/useFlash.js:1` (deleted) | Deleted | 0 / 27 |
| `Pages/hooks/useJiraAccountIdResolver.js:1` (deleted) | Deleted | 0 / 66 |
| `Pages/hooks/useJokeTicker.js:1` (deleted) | Deleted | 0 / 98 |
| `Pages/hooks/usePersistedState.js:1` (deleted) | Deleted | 0 / 36 |
| `Pages/hooks/useReminders.js:1` (deleted) | Deleted | 0 / 101 |
| `Pages/hooks/useTaskManagerJira.js:1` (deleted) | Deleted | 0 / 1436 |
| `Pages/hooks/useTodos.js:1` (deleted) | Deleted | 0 / 180 |
| `Pages/hooks/useUpcomingDueBanner.js:1` (deleted) | Deleted | 0 / 103 |
| `Pages/hooks/useWorkWeekHeaderPreferences.js:1` (deleted) | Deleted | 0 / 18 |
| `Pages/pmEntrySelection.js:1` (deleted) | Deleted | 0 / 30 |
| `Pages/priorityScale.css:1` (deleted) | Deleted | 0 / 276 |
| `Pages/projectManagers.css:1` (deleted) | Deleted | 0 / 1272 |
| `Pages/reportArchive.css:1` (deleted) | Deleted | 0 / 78 |
| `Pages/workWeekTaskElements.css:1` (deleted) | Deleted | 0 / 2522 |
| [README.md:114](../../README.md#L114) | Modified | 129 / 5 |
| `build/icons/icon.icns:1` (deleted) | Deleted | - / - |
| `build/icons/icon.ico:1` (deleted) | Deleted | - / - |
| [docs/DEVELOPER_GUIDE.md:9](../../docs/DEVELOPER_GUIDE.md#L9) | Modified | 12 / 13 |
| [docs/END_USER_GUIDE.md:66](../../docs/END_USER_GUIDE.md#L66) | Modified | 18 / 18 |
| [docs/JIRA_SETUP.md:112](../../docs/JIRA_SETUP.md#L112) | Modified | 7 / 33 |
| [docs/canvases/task-manager-docs.canvas.tsx:221](../../docs/canvases/task-manager-docs.canvas.tsx#L221) | Modified | 4 / 5 |
| [docs/superpowers/2026-10-14-implementation-handoff.md:1](../../docs/superpowers/2026-10-14-implementation-handoff.md#L1) | Created | 378 / 0 |
| [docs/superpowers/plans/2026-10-14-application-review.md:3](../../docs/superpowers/plans/2026-10-14-application-review.md#L3) | Modified | 17 / 13 |
| [docs/superpowers/plans/2026-10-14-cleanup-validation.md:3](../../docs/superpowers/plans/2026-10-14-cleanup-validation.md#L3) | Modified | 2 / 0 |
| [docs/superpowers/plans/2026-10-14-local-security.md:3](../../docs/superpowers/plans/2026-10-14-local-security.md#L3) | Modified | 4 / 0 |
| [docs/superpowers/plans/2026-10-14-personal-todos.md:3](../../docs/superpowers/plans/2026-10-14-personal-todos.md#L3) | Modified | 2 / 0 |
| [docs/superpowers/plans/2026-10-14-team-data-imports.md:3](../../docs/superpowers/plans/2026-10-14-team-data-imports.md#L3) | Modified | 2 / 0 |
| [docs/superpowers/plans/2026-10-14-workbook-export.md:3](../../docs/superpowers/plans/2026-10-14-workbook-export.md#L3) | Modified | 25 / 12 |
| [docs/superpowers/specs/2026-10-14-application-review-design.md:5](../../docs/superpowers/specs/2026-10-14-application-review-design.md#L5) | Modified | 13 / 9 |
| [docs/unsigned-installs.md:1](../../docs/unsigned-installs.md#L1) | Modified | 6 / 41 |
| [electron/main.cjs:4](../../electron/main.cjs#L4) | Modified | 46 / 8 |
| [electron/navigationPolicy.cjs:1](../../electron/navigationPolicy.cjs#L1) | Created | 21 / 0 |
| [electron/preload.cjs:23](../../electron/preload.cjs#L23) | Modified | 1 / 1 |
| [package-lock.json:14](../../package-lock.json#L14) | Modified | 2594 / 4506 |
| [package.json:12](../../package.json#L12) | Modified | 10 / 54 |
| [scripts/import-team-demo.mjs:1](../../scripts/import-team-demo.mjs#L1) | Created | 63 / 0 |
| [scripts/migrate-team-db.mjs:1](../../scripts/migrate-team-db.mjs#L1) | Created | 33 / 0 |
| [server/db/schema.mjs:218](../../server/db/schema.mjs#L218) | Modified | 1 / 0 |
| [server/db/team/001-team-metadata.sql:1](../../server/db/team/001-team-metadata.sql#L1) | Created | 32 / 0 |
| [server/db/team/002-tracking-presence.sql:1](../../server/db/team/002-tracking-presence.sql#L1) | Created | 9 / 0 |
| [server/db/todoDatabase.mjs:1](../../server/db/todoDatabase.mjs#L1) | Created | 117 / 0 |
| [server/jiraProxy.mjs:1](../../server/jiraProxy.mjs#L1) | Modified | 79 / 99 |
| [server/lib/issueImportPreview.mjs:1](../../server/lib/issueImportPreview.mjs#L1) | Created | 74 / 0 |
| [server/lib/issueMetadataImport.mjs:2](../../server/lib/issueMetadataImport.mjs#L2) | Modified | 83 / 51 |
| [server/lib/issueMetadataStore.mjs:1](../../server/lib/issueMetadataStore.mjs#L1) | Created | 53 / 0 |
| [server/lib/jiraCommentText.mjs:243](../../server/lib/jiraCommentText.mjs#L243) | Modified | 4 / 2 |
| [server/lib/jiraCreateIssueFields.mjs:89](../../server/lib/jiraCreateIssueFields.mjs#L89) | Modified | 5 / 1 |
| [server/lib/jiraInstances.mjs:7](../../server/lib/jiraInstances.mjs#L7) | Modified | 123 / 45 |
| [server/lib/jiraResponse.mjs:1](../../server/lib/jiraResponse.mjs#L1) | Modified | 3 / 1 |
| [server/lib/jiraSearchHelpers.mjs:234](../../server/lib/jiraSearchHelpers.mjs#L234) | Modified | 28 / 14 |
| [server/lib/jiraTransport.mjs:1](../../server/lib/jiraTransport.mjs#L1) | Created | 72 / 0 |
| [server/lib/localRequestPolicy.mjs:1](../../server/lib/localRequestPolicy.mjs#L1) | Created | 41 / 0 |
| [server/lib/noteImageStore.mjs:3](../../server/lib/noteImageStore.mjs#L3) | Modified | 61 / 24 |
| [server/lib/rovoMcpClient.mjs:53](../../server/lib/rovoMcpClient.mjs#L53) | Modified | 27 / 15 |
| [server/lib/siteOperationState.mjs:1](../../server/lib/siteOperationState.mjs#L1) | Created | 76 / 0 |
| [server/lib/taskExport.mjs:1](../../server/lib/taskExport.mjs#L1) | Created | 284 / 0 |
| [server/lib/taskWorkbook.mjs:1](../../server/lib/taskWorkbook.mjs#L1) | Created | 137 / 0 |
| `server/lib/teamPriorityMongo.mjs:1` (deleted) | Deleted | 0 / 364 |
| [server/lib/teamPriorityPostgres.mjs:1](../../server/lib/teamPriorityPostgres.mjs#L1) | Created | 198 / 0 |
| [server/routes/appConfigRoutes.mjs:250](../../server/routes/appConfigRoutes.mjs#L250) | Modified | 47 / 47 |
| [server/routes/attachmentRoutes.mjs:31](../../server/routes/attachmentRoutes.mjs#L31) | Modified | 14 / 16 |
| [server/routes/capacityPlanningRoutes.mjs:5](../../server/routes/capacityPlanningRoutes.mjs#L5) | Modified | 26 / 23 |
| [server/routes/chatRoutes.mjs:53](../../server/routes/chatRoutes.mjs#L53) | Modified | 25 / 19 |
| [server/routes/dashboardRoutes.mjs:153](../../server/routes/dashboardRoutes.mjs#L153) | Modified | 5 / 5 |
| [server/routes/epicWorkloadRoutes.mjs:29](../../server/routes/epicWorkloadRoutes.mjs#L29) | Modified | 5 / 5 |
| [server/routes/issueMetadataRoutes.mjs:1](../../server/routes/issueMetadataRoutes.mjs#L1) | Modified | 85 / 225 |
| [server/routes/jiraCoreRoutes.mjs:12](../../server/routes/jiraCoreRoutes.mjs#L12) | Modified | 15 / 15 |
| [server/routes/jiraInstanceRoutes.mjs:9](../../server/routes/jiraInstanceRoutes.mjs#L9) | Modified | 76 / 77 |
| [server/routes/jiraIssueRoutes.mjs:148](../../server/routes/jiraIssueRoutes.mjs#L148) | Modified | 17 / 17 |
| [server/routes/pmAsksRoutes.mjs:20](../../server/routes/pmAsksRoutes.mjs#L20) | Modified | 9 / 9 |
| [server/routes/reportRoutes.mjs:258](../../server/routes/reportRoutes.mjs#L258) | Modified | 25 / 25 |
| [server/routes/taskExportRoutes.mjs:1](../../server/routes/taskExportRoutes.mjs#L1) | Created | 39 / 0 |
| [server/routes/teamPriorityRoutes.mjs:2](../../server/routes/teamPriorityRoutes.mjs#L2) | Modified | 55 / 93 |
| [server/routes/todoRoutes.mjs:19](../../server/routes/todoRoutes.mjs#L19) | Modified | 17 / 27 |
| `services/apiBase.js:1` (deleted) | Deleted | 0 / 47 |
| `services/jiraClient.js:1` (deleted) | Deleted | 0 / 971 |
| [shared/issueMetadataFields.mjs:1](../../shared/issueMetadataFields.mjs#L1) | Created | 48 / 0 |
| [src/AppRouter.jsx:1](../../src/AppRouter.jsx#L1) | Modified | 22 / 8 |
| [src/Components/JiraInstanceSwitcher.jsx:1](../../src/Components/JiraInstanceSwitcher.jsx#L1) | Modified | 9 / 3 |
| `src/Components/WebModeNotice.jsx:1` (deleted) | Deleted | 0 / 25 |
| `src/Components/scrollTop.js:1` (deleted) | Deleted | 0 / 12 |
| [src/Pages/Chat.jsx:14](../../src/Pages/Chat.jsx#L14) | Modified | 2 / 5 |
| [src/Pages/Dashboard/hooks/useReportGeneration.js:1](../../src/Pages/Dashboard/hooks/useReportGeneration.js#L1) | Modified | 4 / 2 |
| [src/Pages/Dashboard/index.jsx:118](../../src/Pages/Dashboard/index.jsx#L118) | Modified | 1 / 1 |
| [src/Pages/ProjectManagers.jsx:867](../../src/Pages/ProjectManagers.jsx#L867) | Modified | 3 / 0 |
| [src/Pages/ReportArchive.jsx:545](../../src/Pages/ReportArchive.jsx#L545) | Modified | 6 / 2 |
| [src/Pages/Settings/components/IssueImportPreview.jsx:1](../../src/Pages/Settings/components/IssueImportPreview.jsx#L1) | Created | 106 / 0 |
| [src/Pages/Settings/components/JiraInstancesSection.jsx:17](../../src/Pages/Settings/components/JiraInstancesSection.jsx#L17) | Modified | 12 / 31 |
| [src/Pages/Settings/components/TeamPriorityDemoSection.jsx:51](../../src/Pages/Settings/components/TeamPriorityDemoSection.jsx#L51) | Modified | 13 / 13 |
| [src/Pages/Settings/components/TeamPriorityImportSection.jsx:3](../../src/Pages/Settings/components/TeamPriorityImportSection.jsx#L3) | Modified | 50 / 217 |
| [src/Pages/Settings/components/settingsSection.css:99](../../src/Pages/Settings/components/settingsSection.css#L99) | Modified | 18 / 0 |
| [src/Pages/WorkWeekTasks.jsx:10](../../src/Pages/WorkWeekTasks.jsx#L10) | Modified | 14 / 2 |
| [src/Pages/components/JiraResultsTable.jsx:1](../../src/Pages/components/JiraResultsTable.jsx#L1) | Modified | 19 / 0 |
| [src/Pages/components/JqlRunMetrics.jsx:1](../../src/Pages/components/JqlRunMetrics.jsx#L1) | Modified | 6 / 4 |
| [src/Pages/components/NoteImagesStrip.jsx:2](../../src/Pages/components/NoteImagesStrip.jsx#L2) | Modified | 21 / 3 |
| [src/Pages/components/ProjectReportPanel.jsx:1](../../src/Pages/components/ProjectReportPanel.jsx#L1) | Modified | 4 / 2 |
| [src/Pages/components/TaskExportModal.jsx:1](../../src/Pages/components/TaskExportModal.jsx#L1) | Created | 230 / 0 |
| [src/Pages/components/TaskManagerHeaderPanel.jsx:17](../../src/Pages/components/TaskManagerHeaderPanel.jsx#L17) | Modified | 71 / 53 |
| [src/Pages/components/WeeklyPlanPanel.jsx:1](../../src/Pages/components/WeeklyPlanPanel.jsx#L1) | Modified | 4 / 2 |
| `src/Pages/components/cells/NotesCell.jsx:1` (deleted) | Deleted | 0 / 24 |
| `src/Pages/components/cells/PushActionsCell.jsx:1` (deleted) | Deleted | 0 / 51 |
| `src/Pages/components/cells/StatusCell.jsx:1` (deleted) | Deleted | 0 / 45 |
| `src/Pages/hooks/epicFilterRunWorkflow.js:1` (deleted) | Deleted | 0 / 78 |
| [src/Pages/hooks/jiraJqlRunWorkflow.js:1](../../src/Pages/hooks/jiraJqlRunWorkflow.js#L1) | Modified | 92 / 51 |
| `src/Pages/hooks/useEpicFilters.js:1` (deleted) | Deleted | 0 / 56 |
| [src/Pages/hooks/usePersistedState.js:1](../../src/Pages/hooks/usePersistedState.js#L1) | Modified | 7 / 4 |
| `src/Pages/hooks/useReminders.js:1` (deleted) | Deleted | 0 / 101 |
| [src/Pages/hooks/useTaskManagerJira.js:1](../../src/Pages/hooks/useTaskManagerJira.js#L1) | Modified | 61 / 67 |
| [src/Pages/hooks/useTodos.js:1](../../src/Pages/hooks/useTodos.js#L1) | Modified | 1 / 180 |
| [src/Pages/workWeekTaskElements.css:2697](../../src/Pages/workWeekTaskElements.css#L2697) | Modified | 11 / 0 |
| [src/context/TodosContext.jsx:1](../../src/context/TodosContext.jsx#L1) | Created | 127 / 0 |
| [src/services/jiraClient.js:1](../../src/services/jiraClient.js#L1) | Modified | 161 / 61 |
| [src/utils/backgroundJobStore.js:1](../../src/utils/backgroundJobStore.js#L1) | Modified | 25 / 5 |
| [src/utils/chatSessionContext.js:1](../../src/utils/chatSessionContext.js#L1) | Modified | 8 / 7 |
| [src/utils/jiraIssueDoneDates.js:1](../../src/utils/jiraIssueDoneDates.js#L1) | Modified | 8 / 6 |
| [src/utils/jqlRunPersistence.js:1](../../src/utils/jqlRunPersistence.js#L1) | Modified | 23 / 23 |
| [src/utils/pageReportPersistence.js:1](../../src/utils/pageReportPersistence.js#L1) | Modified | 28 / 27 |
| [src/utils/pmAskCreateIssueHandoff.js:1](../../src/utils/pmAskCreateIssueHandoff.js#L1) | Modified | 4 / 4 |
| [src/utils/siteContextStore.js:1](../../src/utils/siteContextStore.js#L1) | Created | 38 / 0 |
| [src/utils/todoSaveQueue.js:1](../../src/utils/todoSaveQueue.js#L1) | Created | 86 / 0 |
| [src/utils/workWeekStorage.js:1](../../src/utils/workWeekStorage.js#L1) | Modified | 2 / 0 |
| [tests/appConfigRoutes.test.mjs:8](../../tests/appConfigRoutes.test.mjs#L8) | Modified | 69 / 2 |
| [tests/electronContentSecurityPolicy.test.mjs:1](../../tests/electronContentSecurityPolicy.test.mjs#L1) | Created | 97 / 0 |
| [tests/electronNavigationPolicy.test.mjs:1](../../tests/electronNavigationPolicy.test.mjs#L1) | Created | 131 / 0 |
| [tests/finalReviewClient.test.mjs:1](../../tests/finalReviewClient.test.mjs#L1) | Created | 136 / 0 |
| [tests/issueImportPreview.test.mjs:1](../../tests/issueImportPreview.test.mjs#L1) | Created | 335 / 0 |
| [tests/issueMetadataFields.test.mjs:1](../../tests/issueMetadataFields.test.mjs#L1) | Created | 276 / 0 |
| [tests/issueMetadataImport.test.mjs:134](../../tests/issueMetadataImport.test.mjs#L134) | Modified | 53 / 0 |
| [tests/issueMetadataRoutes.test.mjs:21](../../tests/issueMetadataRoutes.test.mjs#L21) | Modified | 67 / 8 |
| [tests/issueMetadataStore.test.mjs:1](../../tests/issueMetadataStore.test.mjs#L1) | Created | 97 / 0 |
| [tests/jiraAttachments.test.mjs:127](../../tests/jiraAttachments.test.mjs#L127) | Modified | 80 / 0 |
| [tests/jiraInstances.test.mjs:85](../../tests/jiraInstances.test.mjs#L85) | Modified | 54 / 35 |
| [tests/jiraRecoveryStartup.test.mjs:1](../../tests/jiraRecoveryStartup.test.mjs#L1) | Created | 83 / 0 |
| [tests/jiraTransport.test.mjs:1](../../tests/jiraTransport.test.mjs#L1) | Created | 143 / 0 |
| [tests/localRequestPolicy.test.mjs:1](../../tests/localRequestPolicy.test.mjs#L1) | Created | 208 / 0 |
| [tests/noteImageStore.test.mjs:1](../../tests/noteImageStore.test.mjs#L1) | Modified | 112 / 1 |
| [tests/siteContextStore.test.mjs:1](../../tests/siteContextStore.test.mjs#L1) | Created | 214 / 0 |
| [tests/siteOperationState.test.mjs:1](../../tests/siteOperationState.test.mjs#L1) | Created | 330 / 0 |
| [tests/taskExport.test.mjs:1](../../tests/taskExport.test.mjs#L1) | Created | 567 / 0 |
| [tests/taskWorkbook.test.mjs:1](../../tests/taskWorkbook.test.mjs#L1) | Created | 184 / 0 |
| [tests/teamPriorityPostgres.test.mjs:1](../../tests/teamPriorityPostgres.test.mjs#L1) | Created | 289 / 0 |
| [tests/teamPriorityRoutes.test.mjs:1](../../tests/teamPriorityRoutes.test.mjs#L1) | Created | 160 / 0 |
| [tests/todoMigration.test.mjs:1](../../tests/todoMigration.test.mjs#L1) | Created | 174 / 0 |
| [tests/todoRoutes.test.mjs:1](../../tests/todoRoutes.test.mjs#L1) | Created | 244 / 0 |
| [tests/todoSaveQueue.test.mjs:1](../../tests/todoSaveQueue.test.mjs#L1) | Created | 207 / 0 |
| [tests/workWeekStorage.test.mjs:85](../../tests/workWeekStorage.test.mjs#L85) | Modified | 28 / 0 |
| [vite.config.js:3](../../vite.config.js#L3) | Modified | 18 / 1 |
