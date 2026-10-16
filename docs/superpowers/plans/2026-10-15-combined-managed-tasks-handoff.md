# Combined managed work — durable implementation handoff

Scope: all feature changes since base `2dd4081`, across Tasks1–3 on `codex/managed-combined-work`. Work took place only in `/Users/gabriellemaxey/.codex/worktrees/combined-managed-work/taskManager`, using Node22.23.1 and its independent dependencies. The user's desktop checkout/process/native binary, real Jira data/services and company SQL were not used.

## Behavior and interfaces

- Managed tasks is the default single mixed table. List/result tabs retain mounted source models. Composite UI identity is saved-entry ID plus real issue key; actual API payloads/links use real issue keys. Team identity remains hostname/key. Aggregates deduplicate hostname/key while labeled rows/notes/planning remain separate.
- Captured saved operations use `{kind:"saved-site",instanceId,siteHost,baseUrl,displayName,revision}` with the two saved headers. Strict allowlists/revision checks/leases preserve the ordinary active-generation guard. Initial combined hydration readiness gates editors until required Local/date/health reads finish and Team reads finish when not explicitly unconfigured. A successful health response with configured=false skips optional Team reads and leaves Team disabled; required-read failures retain known counts and coverage warnings.
- `openCombinedWorkStore(dataDir)` opens `docket-combined.sqlite` with only reused `app_settings`, `generated_reports`, and their archive index (plus SQLite's sequence). No ordinary goal/archive copying/migration. Server supplies `getCombinedWorkDb`.
- `{kind:"combined-work"}` selects only `X-Docket-Report-Scope: combined-work`. Supported routes: GET/PUT settings (writes only the existing user/company goals keys), POST report/project, GET/DELETE reports/archive and numeric detail. Conflicting active/saved headers and unsupported routes are rejected. Approved-origin CORS adds this exact header only.
- `buildCombinedReportSummary(sites)` returns distinct total/open/closed/overdue/inProgress, entryCount, labeled sources with separate notes/local/team planning, notices and incomplete. `loadCombinedReportHistory({sites,months,signal})` fans out captured source searches (500 each), recent notes, latest comments, field mappings, parent enrichment and Local/Team metadata. Failed sources without rich context retain notices without fabricated contexts. Per-comment HTTP failures preserve successful content and sanitized notices.
- Existing Status/1:1/PWB controls, copy/download and provider configuration are reused. One goals scope across selections; cache/job identity includes sorted selected entry IDs and report options. Browser keys use `docket:combined-work:` via existing helpers, with no legacy fallback/fake site ID. Generation validates captured revisions and holds existing registry leases. Archive metadata includes scope, selected entries, report query scope, coverage and timestamp. Combined archive numeric IDs cannot affect ordinary archive records.
- `fetchLatestJiraCommentsBulk(keys,{siteContext,signal,includeCoverage:true})` returns `{items,errors}` only for opted-in combined history; ordinary callers retain items-only output. No provider settings UI/dependencies/classes added.

## Verification evidence and limitations

Task1 commits `0d6441a` / `0196319`: final focused 107 passed/3 PostgreSQL skips; saved-header CORS follow-up22 passed. Task2 commits `12469b6` / `f1e2294`: focused156 passed/3 skips; readiness follow-up88 passed. Their detailed local reports remain under `.superpowers/sdd/2026-10-15-combined-managed-tasks/` as `task-1-report.md` and `task-2-report.md`; this durable file contains the cross-task interface/file inventory rather than depending on ignored scratch alone.

Task3 test-first evidence:
- `/tmp/managed-task3-server-red.log`:0/4, missing dedicated store/scope/CORS. `/tmp/managed-task3-server-green.log`:4/4.
- `/tmp/managed-task3-client-red.log`:0/4, missing combined history/headers/storage. `/tmp/managed-task3-client-green.log`:4/4.
- `/tmp/managed-task3-ui-red.log`:4 passed/1 failed, combined reports not mounted. `/tmp/managed-task3-ui-green.log`:5 passed.
- `/tmp/managed-task3-comment-red.log`:4 passed/1 failed, discarded comment failures; subsequently green with mixed successful/failed comments.
- `/tmp/managed-task3-category-red.log`:5 passed/1 failed for custom status name versus category; subsequently green. `/tmp/managed-task3-failed-notice-red.log`:failed loading-language regression, subsequently green.
- Final focused command (Node22 PATH): `node --test tests/combinedWorkReports.test.mjs tests/combinedWorkReportsClient.test.mjs tests/combinedManagedWork.test.mjs tests/combinedOpenWorkTab.test.mjs tests/workflowUtils.test.mjs tests/dashboardMetrics.test.mjs tests/issueMetadataRoutes.test.mjs tests/issueMetadataFields.test.mjs tests/appConfigRoutes.test.mjs tests/siteContextStore.test.mjs tests/localRequestPolicy.test.mjs tests/savedSiteOperations.test.mjs`. **155 passed,0 failed,0 skipped**, `/tmp/managed-task3-final-focused.log`.
- Full `npm test` run once: **653 passed,12 failed,10 skipped (675 total)**, `/tmp/managed-task3-full.log`. Eleven failures came from stale extracted-handler/JSX bindings in `issueMetadataFields.test.mjs` after Task2 context additions. Only missing ordinary-context fixture bindings/expected internal option were repaired; behavior assertions remain. Affected file then16/16, `/tmp/managed-task3-harness-green.log`.
- Remaining full-run failure: `electronContentSecurityPolicy` Vite test requires occupied port5173. No user process stopped or original test/config changed. `/tmp/managed-task3-csp.mjs` copied the test/config to temporary storage, changed only port literals to53594, and verified the Vite case:1 passed (`/tmp/managed-task3-csp.log`). This is supplemental evidence, not a green original full run. Controller may run final fullsuite after review.
- `npm run build`:passed with client export precheck (110 imports), `/tmp/managed-task3-build.log`. `git diff --check`:passed. The final minor notice/self-review changes were covered by focused tests; build was not repeated.
- SQL skips are existing disposable PostgreSQL cases; no company database used. **Sonar remains blocked by prior automatic review of the unapproved upload destination. No retry, upload, substitute Ruff pass or green Sonar claim.**

## Browser evidence

Owned full-app fixture `/tmp/managed-task3-smoke.mjs`, port53167, full shell/styles and isolated SQLite report handlers, synthetic Jira/LLM only; external fetches blocked. Verified by rendered UI: one mixed table, Managed default, expanded My Metrics/report,3 entry rows/2 distinct tasks, failed source notice, sourceB note draft surviving Managed→List→Managed, separate Local/Team planning values, and attachment dialog. Actual browser requests demonstrated B status/note/priority/follow-up/pin/local/Team saves/comment push and all Jira date endpoint roles with real `ABC-1` and captured revision, no active headers/activation. Initial browser date fill did not change React state; keyboard ArrowUp produced a confirmed changed IDD payload (`2026-11-01`). Do not treat unchanged fill submissions as changed-date proof. Assignee selection did not produce a confirmed write in the initial browser run; full client/handler regression coverage remains separate.

The filechooser call stalled and the tool was interrupted; attachment selection/upload browser proof is incomplete (Node multipart/XHR tests cover source routing). After interruption the browser was unavailable to the agent. Controller resumed bounded report/goals/archive/screenshot checks. The first controller-generated result exposed a **fixture** JSX classic-transform mismatch (`React is not defined` in existing components); the fixture was rebuilt with automatic JSX matching Vite, without changing product imports. Existing on-disk combined reports/goals were retained. The fixture's request log restarted on server restart; original editor request payload evidence is in the agent tool transcript, not a preserved full pre-restart log. Current log: `/tmp/managed-task3-smoke-calls.json`; header assertions: `/tmp/managed-task3-browser-assertions.json`. Controller subsequently verified rendered current-status and PWB all-assigned-history report output, including visible Copy/Download controls and synthetic content, and entered a combined goal. After deselecting the failed source, CDP timed out; archive selection/read/delete and goal persistence after selection changes remain unverified in the browser (focused component/server coverage passes). No screenshot was captured. No further browser attempts were made. Owned server PID2269 was stopped; user processes were untouched.

Preserved final request log `/tmp/managed-task3-smoke-final-calls.json` and assertions `/tmp/managed-task3-browser-assertions.json`:36 captured-source requests all carry revisions and no active header;6 history searches cover3 healthy saved entries;2 combined report POSTs each retain4 source entries including the failure and2 unique tasks;1 combined goals PUT;0 activation requests. No archive browser request occurred, so archive target isolation is established by focused component/server tests only. Request-log assertions passed. The pre-restart editor log was not preserved; do not confuse the final36-read log with editor write evidence.

## Changed files and current line anchors since2dd4081

Line anchors below identify every changed feature file, including regression fixtures and documentation. Ranges are not immutable across later review fixes.

| File | Changed line anchors | What changed |
|---|---|---|
| `README.md` | 287 | Managed mode, unique counts, report coverage and dedicated combined goals/archive documentation. |
| `docs/superpowers/plans/2026-10-15-combined-managed-tasks.md` | 1 | Approved design/plan and implementation evidence. |
| `docs/superpowers/specs/2026-10-15-combined-managed-tasks-design.md` | 1 | Approved design/plan and implementation evidence. |
| `server/db/schema.mjs` | 16, 41, 68, 155 | Extract shared app_settings/generated_reports schemas without unrelated combined tables. |
| `server/jiraProxy.mjs` | 1, 26, 28, 164, 236, 273, 275, 277 | Compose active, saved-entry and combined report guards; own dedicated combined DB. |
| `server/lib/combinedOpenWork.mjs` | 1, 32, 53, 59, 78, 91, 106, 110 | Rich source contexts, field mappings and issue results with owned handles. |
| `server/lib/combinedWorkStore.mjs` | 1 | Dedicated docket-combined.sqlite, exact scope guard and generation source leases. |
| `server/lib/jiraCommentText.mjs` | 241, 250, 263 | Preserve successful comments and sanitized per-issue read failures. |
| `server/lib/jiraRouteContext.mjs` | 1 | Reusable request-local Jira helper dependencies. |
| `server/lib/localRequestPolicy.mjs` | 35 | Exact saved-site/revision and combined-report CORS headers; origins unchanged. |
| `server/lib/savedSiteOperations.mjs` | 1 | Captured revision validation, route allowlist, registry leases and owned source DBs. |
| `server/routes/appConfigRoutes.mjs` | 1, 28, 87, 255, 661, 787, 792, 799 | Saved-source reads plus dedicated combined goals-only settings statements. |
| `server/routes/attachmentRoutes.mjs` | 1, 32, 71, 92 | Source-bound attachment list/upload dependencies. |
| `server/routes/combinedOpenWorkRoutes.mjs` | 15 | Forward dataDir into rich collection. |
| `server/routes/issueMetadataRoutes.mjs` | 1, 75, 77, 88, 142, 219, 297, 313, 324, 341, 359, 417, 455, 481, 496, 520 | Scoped saved-source edits/reads/images and comment coverage result. |
| `server/routes/jiraCoreRoutes.mjs` | 1, 13, 16, 57, 81, 109, 144, 149, 178, 185 | Source-bound user/search helpers and environment validation. |
| `server/routes/jiraIssueRoutes.mjs` | 1, 149, 151, 277, 303, 353 | Source-bound summaries, parent options/candidates. |
| `server/routes/reportRoutes.mjs` | 1, 484, 490, 532, 567, 574, 789, 877, 898, 922 | Explicit report/archive DB, source/coverage prompts and archive metadata; no active combined Jira lookup. |
| `server/routes/teamPriorityRoutes.mjs` | 1, 49, 131, 137, 145, 155, 171, 181, 203 | Captured source hostname/actor for Team planning writes/reads. |
| `src/Pages/CombinedOpenWork.jsx` | 5, 19, 65, 69, 74, 82, 98, 122, 127, 132, 153, 156 | Selected source models, retention, managed/List mode and full metric/report inputs. |
| `src/Pages/ReportArchive.jsx` | 1, 182, 238, 262, 273, 281, 297, 305, 385, 397, 454, 463, 613, 676 | Explicit Combined Work archive selection and list/read/delete scope. |
| `src/Pages/combinedWorkModel.js` | 1 | Separate row identity, distinct metrics, readiness-gated editor adapter. |
| `src/Pages/combinedWorkReports.js` | 1 | Distinct aggregate/source details, stable report keys, bounded captured-source history and notices. |
| `src/Pages/components/AttachFilesModal.jsx` | 16, 24, 34, 38, 46, 53, 60, 78 | Captured context for attachment dialog reads/uploads. |
| `src/Pages/components/CombinedSiteEditor.jsx` | 1 | Stable source hook owner, readiness and duplicate Jira reconciliation. |
| `src/Pages/components/JiraResultsTable.jsx` | 121, 222, 226, 229, 264, 266, 349, 380, 498, 547, 549, 749, 757, 768, 772, 774, 789, 802, 835, 848, 862, 868, 875, 886, 892, 897, 900, 934, 949, 958, 971, 978, 986, 996, 1002, 1005, 1044, 1059, 1065, 1069, 1081, 1084, 1087, 1090, 1094, 1108, 1114, 1129, 1135, 1152, 1159, 1170, 1179, 1188, 1194, 1220, 1259, 1305, 1310, 1320, 1322, 1334, 1336, 1347, 1350, 1362, 1364, 1374, 1386, 1388, 1398, 1410, 1413, 1426, 1429, 1435, 1439, 1441, 1455, 1484, 1504, 1521, 1549 | Mixed source table, composite UI keys, ordinary controls and explicit Local/Team planning. |
| `src/Pages/components/JqlRunMetrics.jsx` | 48, 54, 58, 65, 70, 73, 75, 83, 91 | Combined category/date totals and independent capacity preferences. |
| `src/Pages/components/MyMetricsSection.jsx` | 13, 15, 21, 23, 28, 31 | Expanded combined metrics and full safely scoped report panel. |
| `src/Pages/components/ProjectReportPanel.jsx` | 1, 20, 33, 63, 89, 97, 119, 124, 126, 130, 139, 142, 148, 150, 174, 183, 194, 295, 307, 320, 326 | Reuse full controls with combined goals, summary/history, generation, cache/jobs and artifacts. |
| `src/Pages/components/cells/AssigneeCell.jsx` | 22, 57, 70, 159 | Separate visible key and captured-source user search. |
| `src/Pages/components/jiraResultsTableUtils.js` | 92, 98, 103, 112 | Source-qualified priority and status sorting. |
| `src/Pages/hooks/jiraJqlRunWorkflow.js` | 79, 112, 141, 152, 177, 194, 201, 218, 241, 265 | Reuse hydration with strict combined failure propagation and no ordinary persistence. |
| `src/Pages/hooks/useTaskManagerJira.js` | 16, 33, 238, 242, 257, 259, 291, 322, 344, 346, 355, 380, 412, 424, 478, 522, 550, 719, 755, 757, 771, 786, 798, 852, 887, 904, 925, 944, 960, 974, 976, 983, 995, 997, 1004, 1014, 1017, 1024, 1087, 1089, 1091, 1098, 1103, 1106, 1113, 1118, 1123, 1134, 1158, 1168, 1189, 1407 | Source-bound reused editing, readiness gates, separate Local/Team maps and preserved drafts. |
| `src/Pages/reportSummary.js` | 1 | Share existing report date/summary logic with optional combined status-category predicate. |
| `src/services/jiraClient.js` | 81, 97, 115, 171, 186, 243, 245, 254, 256, 288, 294, 309, 315, 320, 326, 328, 345, 347, 363, 365, 374, 376, 380, 382, 392, 394, 405, 410, 412, 420, 447, 449, 500, 505, 507, 527, 529, 570, 572, 641, 671, 676, 678, 898, 902, 939, 941, 957, 959, 1017, 1022, 1033, 1057, 1069, 1073, 1078, 1080, 1085, 1087, 1163, 1165, 1176 | Captured source/combined headers, request families, scope-aware archive/settings/report and cancellation. |
| `src/utils/backgroundJobStore.js` | 14, 37, 63 | Explicit combined job namespace and null active-site ownership. |
| `src/utils/jiraIssueDoneDates.js` | 24, 32, 60, 84, 150, 176, 183 | Captured parent lookup context, combined strict failures and optional cancellation signal. |
| `src/utils/siteContextStore.js` | 21, 27 | Explicit combined storage context with no legacy fallback; ordinary IDs unchanged. |
| `tests/combinedManagedWork.test.mjs` | 1 | Regression coverage and compatible browser/context fixtures for combined managed work. |
| `tests/combinedOpenWork.test.mjs` | 185 | Regression coverage and compatible browser/context fixtures for combined managed work. |
| `tests/combinedOpenWorkClient.test.mjs` | 25, 35, 42 | Regression coverage and compatible browser/context fixtures for combined managed work. |
| `tests/combinedOpenWorkTab.test.mjs` | 29, 32, 65 | Regression coverage and compatible browser/context fixtures for combined managed work. |
| `tests/combinedWorkReports.test.mjs` | 1 | Regression coverage and compatible browser/context fixtures for combined managed work. |
| `tests/combinedWorkReportsClient.test.mjs` | 1 | Regression coverage and compatible browser/context fixtures for combined managed work. |
| `tests/finalReviewClient.test.mjs` | 15 | Regression coverage and compatible browser/context fixtures for combined managed work. |
| `tests/issueMetadataFields.test.mjs` | 94, 160, 168, 173, 192 | Regression coverage and compatible browser/context fixtures for combined managed work. |
| `tests/localRequestPolicy.test.mjs` | 209 | Regression coverage and compatible browser/context fixtures for combined managed work. |
| `tests/savedSiteOperations.test.mjs` | 1 | Regression coverage and compatible browser/context fixtures for combined managed work. |
| `tests/siteContextStore.test.mjs` | 6 | Regression coverage and compatible browser/context fixtures for combined managed work. |
| `docs/superpowers/plans/2026-10-15-combined-managed-tasks-handoff.md` | 1 | Durable cross-task interfaces, exact verification limits and complete changed-file inventory. |

## Task3 review fix round1 — reattached report identity

Reviewed finalized `task-3-review.md` P2 against base `3f17bc9`. Reproduced generation A → unmount/remount/attach → selected source B and 1:1 options → A resolves or rejects. The hook previously invoked the latest B handler with no origin identity, so A appeared under B despite the panel's captured-ID check.

`src/hooks/useBackgroundJobs.js:70` now passes the attached job ID to success/error as a second argument and to finally as its argument. Latest-handler behavior remains unchanged for ordinary callers. `src/Pages/components/ProjectReportPanel.jsx:147` compares this origin with the current report identity; direct generation uses the captured default identity. Attached errors and finalization receive the same guard. `tests/combinedWorkReportsClient.test.mjs:188` exercises actual panel/background jobs across remount/source/option changes for both success/error, verifies no B display/cache pollution and successful A caching; `:223` retains ordinary latest-callback behavior.

RED command (Node22 PATH): `node --test --test-name-pattern='reattach' tests/combinedWorkReportsClient.test.mjs` →1pass/2fail, exact failures A report displayed under B and A error displayed under B (`/tmp/managed-task3-r1-red.log`). GREEN command: `node --test tests/combinedWorkReportsClient.test.mjs` →10pass/0fail/0skip (`/tmp/managed-task3-r1-green.log`). `git diff --check` passed. No fullsuite/build/browser repeated per controller; prior limitations remain. Self-review confirms optional callback arguments preserve ordinary results/latest-handler selection, with no identity/storage abstraction or new dependency. Initial narrow write approval review timed out before execution; the single explicitly permitted narrow retry succeeded.

Additional changed file since2dd4081: `src/hooks/useBackgroundJobs.js:70` — optional originating job identity for attachment callbacks.


## Final grouped integration fixes — review base48ee5d2

All four findings in `final-review.md` were addressed together without changing API/storage/active-generation contracts. The optional Team store is skipped only after successful `configured:false` health in both editor hydration and assigned history. Failed health or required Team reads still block editing/report complete-coverage claims; no failures are swallowed to fabricate empty ownership. Combined and ordinary work-week archives now have different React keys, so delayed old deletes/reloads/details cannot publish into a new scope. Direct report errors/finalization use the captured job identity and pending is reset on selection identity changes, preserving the earlier reattachment guards.

Team confirmations use the existing page/editor/model callback pattern: `onConfirmedTeam(context, issueKey, patch)`, page state keyed by hostname/real key, and `model.reconcileTeam(issueKey, patch)`. Only successful writes publish; Local maps are untouched. Per-field tokens keep pending and failed Team edits private until their own successful save. The reused persistence helper covers priority, individual planning/date saves, Save All and explicit clear. Clear reflects the existing server contract: start/complete/planned start/planned finish/PM override are cleared; follow-up/requestor/decision fields remain. This is same-view duplicate reconciliation, not cross-device synchronization.

Final verification (Node22.23.1): `npm test` including this isolated checkout's pretest native rebuild → **685 total,675 passed,0 failed,10 existing disposable PostgreSQL skips**, `/tmp/managed-final-fix-suite-final.log`. `npm run build` including Node/export checks passed;108 Jira client imports validated and565 modules transformed, `/tmp/managed-final-fix-build.log`. `git diff --check` passed. Focused managed/report tests:39/39 passed (`/tmp/managed-final-fix-green.log`). The first full run exposed two source-extracting fixture groups missing the newly used real helper (10 failed including8 nested cases); only fixture dependencies were added, all existing assertions retained. An intermediate sandboxed fixture run hit EPERM creating its test temp directory; the final elevated full suite passed that test. No product failure remains in these checks.

Changed anchors for this wave (supersede older anchors above where shifted):
- `src/Pages/hooks/useTaskManagerJira.js:238,297,312,750,814,1005,1026,1046,1133,1148,1437`: Team confirmation callbacks/pending fields, optional-Team hydration, save/clear reconciliation and exposed model action.
- `src/Pages/hooks/jiraJqlRunWorkflow.js:265`: Local first, health-authorized skip of optional Team hydration.
- `src/Pages/combinedWorkReports.js:55,61,76`: source health and optional-Team history reads.
- `src/Pages/CombinedOpenWork.jsx:22,29,76,91,141`: hostname/key confirmation state, reset on source replacement, editor props.
- `src/Pages/components/CombinedSiteEditor.jsx:5,14`: callback threading and Team patch reconciliation.
- `src/Pages/ReportArchive.jsx:617,625`: distinct archive mounted identities.
- `src/Pages/components/ProjectReportPanel.jsx:145,318`: direct pending/error/finalization identity guards.
- `tests/combinedManagedWork.test.mjs:474,506`: unconfigured/failed Team and real page/editor duplicate-save regressions.
- `tests/combinedWorkReportsClient.test.mjs:237,251,284`: optional-Team history, delayed archive scope switches and direct report identity regression.
- `tests/issueMetadataFields.test.mjs:91,188`: existing extracted-handler fixtures include the real persistence helper; assertions unchanged.
- `docs/superpowers/plans/2026-10-15-combined-managed-tasks-handoff.md`: revised readiness contract and this verification/file inventory.

No live Jira/AI/company DB/.env/data operations or browser attempts occurred in this wave. The10 SQL skips, previous incomplete browser checks and blocked Sonar source upload remain limitations, not passes. No Sonar retry or Ruff substitution was performed. Detailed RED/repair/GREEN evidence and commit are recorded in `.superpowers/sdd/2026-10-15-combined-managed-tasks/final-fix-report.md`; controller owns the final scoped rereview.
