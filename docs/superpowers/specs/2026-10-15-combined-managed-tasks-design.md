# Combined Work: managed tasks and full My Metrics

Status: approved for planning and implementation on2026-10-15; no application code changed at approval. The user confirmed one combined editable table with a Jira site column. User requested full update parity with normal JQL results and confirmed the full My Metrics section, including report generation. This supersedes the original read-only limitation; existing ordinary JQL behavior remains a compatibility requirement.

## User-visible behavior
Combined Work stays in the existing Task Management result-tab row. Managed tasks is the default mode, using existing row controls and styling; List is an optional compact read-only presentation of the same loaded work. My Metrics appears above the results in both modes and starts expanded, with its own remembered collapse preference. Changing presentation preserves selected sites, loaded results and unsaved edits.

The user selects saved Jira entries. The loaded task scope remains unfinished issues assigned to currentUser independently on each selected site. Source labels remain visible. Partial or failed sites remain explicit; neither counts nor reports claim complete coverage when collection is incomplete. Existing load/refresh/cancel behavior remains; reads can be cancelled, but cancelling a read must not imply a submitted update was cancelled.

Use one mixed editable table with a Jira site column and the ordinary JQL sorting, filtering, paging and row controls. Do not replace it with separate site tables.

Managed mode supports the updates already offered by ordinary JQL rows: status, assignee, mapped Jira dates, local notes and priorities, date tracking, planning fields, exclusive Now/Next flag, Gantt pinning, explicit Jira comment/image push, retained note images and attachments, and existing Team database destinations when configured. Keep the current local-versus-Team ownership and field precedence rules. Do not add fields Jira does not currently permit editing. Unsupported mappings/permissions or unavailable Team storage show the existing appropriate disabled/error state for the affected source. Preserve explicit save/push semantics; switching views never pushes drafts to Jira.

After a successful edit that removes an issue from the assigned/open filter (completion or reassignment), show the confirmed save outcome and update its eligibility/counts; never discard remaining drafts silently. Failed or indeterminate updates retain drafts and expose existing retry/check-Jira guidance, without automatic replay. Bulk actions report individual outcomes and must route every item to its source.

## Identity and update boundaries
A real Jira issue key remains unchanged for URLs and API payloads. Local row/draft/selection/expansion/modal identity includes saved entry identity and Jira issue key; shared Team metadata retains its established hostname-plus-issue-key identity. Identical keys on different sites must never share state. Different saved entries pointing at the same hostname retain separate local notes, as previously requested.

Every row operation carries an immutable saved-entry source context captured during loading. The server resolves approved credentials and per-entry local storage from that context, validates an opaque revision against the current registry identity, and rejects stale/removed/disabled entries before work. It never accepts arbitrary credentials, hosts or filesystem paths from the browser. Do not temporarily activate a site or relax the existing active-site/generation guard. Register only the needed explicit-source operations and reuse existing validation/business handlers.

Use existing registry operation leases, Jira transport, environment token policy, allowed-host validation, request/body deadlines, upload limits and per-instance database/image paths. Leases and database handles remain valid until the underlying operation settles, including disconnects. Explicit-source DB access must not close or replace the active runtime handle. Never seed another entry from unrelated legacy data. A site edit/removal while an operation is queued must be rejected as stale rather than redirecting that queued operation.

Carry explicit context through hidden callers too: assignee searches, attachment list/upload, note-image reads/writes/deletes, parent-date enrichment, field mappings, Team identity attribution, report-related queries and persistence. Background save jobs remain source-qualified, serialized as currently required and visible on failure. Avoid competing editor instances that persist whole copies of the same site's browser maps and overwrite each other's changes.

## Data loading and component reuse
Extend existing combined collection/hydration to obtain the normal issue fields and each source's field mappings, local metadata, Team overlays and effective date information. Reuse existing search-field selection, pagination, hydration and field-ownership logic. Preserve finite collection limits and per-site failures. Do not build a second implementation of ordinary row editing or duplicate existing route workflows.

Reuse MyMetricsSection, JqlRunMetrics and ProjectReportPanel with explicit combined scope. Keep ordinary callers and their persisted preferences/report identities compatible. The exact minimal extraction or context arguments are builder choices, to be checked against the implementation plan before edits.

## Metrics and full reports
Metrics summarize the selected loaded scope, with source counts and incomplete-data notices. Use Jira status categories for combined open/closed classification and each source's effective-date mappings for overdue values. Combined capacity and WIP preferences belong to a stable Combined Work scope, not whichever site happens to be active.

Approved: count distinct (hostname, issueKey) Jira tasks once in aggregate workload totals, while preserving separate saved-entry rows and local planning values. Show both entry-row count and distinct-task count when they differ. Do not silently select one entry's conflicting local note or priority; retain source labels in report inputs and detailed priority items. The user accepted this recommendation with “looks good”.

Retain the current report types, goals and explicit generation controls. Loaded-scope reports use the current combined dataset. Existing all-my-work/history report choices fan out across the selected entries and retain their existing report-specific query semantics, rather than falling back to the active site or changing the task table's open-only filter. Use explicit source context for recent notes, latest comments, parent fields and any supplemental search. Keep bounds and incomplete coverage visible in generated content. Do not fabricate completion-history metrics from an open-only snapshot.

Approved: keep one set of Combined Work goals independent of site selection, and store combined goals and archived reports in a dedicated Docket-level local scope, with selected saved-entry IDs/hostnames and report query scope recorded. Reuse the existing report schema/output/archive UI as far as possible; never assign a multi-site report to an arbitrary active site's archive. Keep ordinary archives intact. Exact persistence schema/location must be documented in the plan after inspecting existing storage helpers; ambiguity is flagged here instead of assuming a site owner.

## Scope and verification
No new dependencies, new application, company database requirement, arbitrary cross-site JQL editor, or new task creation flow. No unrelated refactor or change to existing single-site security rules. Follow current code conventions; new helpers only for reused logic or clarity. Keep implementation in focused commits/branches and use the previously requested subagent workflow.

Test duplicate keys across sites and duplicate saved entries, independent field mappings, correct local/Team paths, every editable action and nested modal, mixed-site bulk outcomes, active-site changes during loads/saves, queued-operation stale revisions, partial collections/reports, list/managed draft preservation, default metrics, report/goal/archive scope, and ordinary JQL regressions. Use synthetic credentials/data only. The user's Electron/Vite may be running in this worktree: do not stop it or rebuild its native dependency for tests; use an isolated test fixture/dependency environment. Run appropriate focused tests/build/browser checks. Company Sonar remains blocked by the prior unapproved upload destination; do not retry or bypass it or claim its result.

## Builder check and approval
The independent builder check identified duplicate counting and goal ownership as the remaining product choices. The user accepted the recommended once-per-actual-task counting and one set of Combined Work goals. One mixed editable table and full report generation were explicitly confirmed earlier. No product question remains open.


## Implementation and verification handoff

The managed editor, hydration readiness boundary, unique workload metrics, full combined report controls, shared combined goals, and dedicated combined archive are implemented. The report request scope is explicit and incompatible with active/saved headers; source history retains captured revisions. See `../plans/2026-10-15-combined-managed-tasks-handoff.md` for changed files/lines and verification evidence. Final whole-branch review and the outstanding browser checks remain controller-owned; Sonar and real PostgreSQL verification limitations are explicit.
