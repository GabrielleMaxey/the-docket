# Multi Site Workbook Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Download a reviewed Excel snapshot with one worksheet per selected Jira site for manual SharePoint upload/sharing.

**Architecture:** Collect selected sites sequentially using explicit credentials and read-only metadata access, preserving the application's active site. Keep a bounded server preview snapshot; write a workbook from that snapshot and the user's row exclusions without re-fetching data at download time.

**Tech Stack:** Existing Express, SQLite and React; approved `pg`; proposed server-side `exceljs` after explicit approval.

**Spec:** [Approved design](../specs/2026-10-14-application-review-design.md); [shared contracts](2026-10-14-application-review.md). Depends on S1–S3 and D1/D2; D3 UI need not be finished.

## Global Constraints

- Each selected site receives its own worksheet; there is no required combined task sheet.
- Locally saved metadata is the default; team-database metadata is an explicit option when available.
- Do not silently blend local and team fields or change the active Jira site.
- The workbook is a dated snapshot, not a live connection, backup/restore format, or import template.
- No direct SharePoint upload, images/attachment binaries, personal To Dos, credentials, or local paths.
- No hand-built spreadsheet engine or hidden developer Python dependency; company SonarQube remains required before merge.

## Review Focus

1. Sites share an issue key → E1/E2 keep separate records and sheets with source host.
2. Team source becomes unavailable halfway through collection → E1 reports it without borrowing local values.
3. One site fails or hits a result limit → E1/E3 require explicit partial-download consent.
4. Text starts `=`, `+`, `-`, or `@` → E2 writes string cells, never formula objects.
5. Long/colliding sheet names or oversized notes → E2 produces deterministic valid names and rejects oversized cells rather than truncating.

### Task E1: Source-aware export preview without global switching

**Files:** Create `server/lib/taskExport.mjs`, `server/routes/taskExportRoutes.mjs`, `tests/taskExport.test.mjs`; modify `server/jiraProxy.mjs`, `server/lib/jiraInstances.mjs`, `server/lib/jiraSearchHelpers.mjs`, `src/services/jiraClient.js`.

**Interfaces:** `collectTaskExport({sites,signal}) -> Promise<ExportSnapshot>`, where sites are `{instanceId,source:'local'|'team',scope:{projectKeys?|presetIds?},includeCompleted,priorities?,followUp?}` and exactly one nonempty scope type is required per site. `ExportSnapshot={exportedAt,timezone,sites:[{instanceId,siteHost,source,scope,status:'complete'|'partial'|'failed',message?,rows}]}`. Each row has `issueKey,summary,status,assignee,jiraDueDate,jiraUrl` and D2 metadata fields. `POST /api/task-export/preview` returns `{previewId,snapshot,expiresAt}`; `GET /api/task-export/sites/:id/scopes` provides safe project/preset choices for that saved site. All URLs are derived on the server from registry IDs, never client hosts.

- [ ] Write `two sites keep same keys separate`, `active site does not change`, `team failure does not use local fallback`, `reached search bound is partial`, and `unselected site is never read`. Assert active context before/after is identical; site A/B notes remain separate; failed source rows are absent with an explicit status; no unselected fetch call.
- [ ] Run `node --test tests/taskExport.test.mjs`; confirm behavior failures.
- [ ] Implement sequential collection with S2 transport and S3 lease protection for selected registry identities. Open each site SQLite DB read-only for local metadata and saved mappings; for an unmigrated or missing schema return a clear site error, not a write during export. Copy local metadata synchronously into plain values before releasing a read handle; keep per-site source immutable. Prevent deletion/identity edits for leased selected sites, but do not block unrelated operations or activate sites. Resolve team host through registry and D1 reads. A caller abort stops collection/releases handles.
- [ ] Use validated selected project keys or saved preset IDs to build scope with existing helpers; keep default open work, optional completed, then filter on the selected metadata source for priority/NowNext. Reuse search pagination with a visible default bound of 5,000 Jira rows per site; configure positive `DOCKET_EXPORT_MAX_ROWS_PER_SITE`, capped at 5,000 initially. Add completeness information to `searchAllIssues` without changing existing return fields or silently treating a reached max as complete. If exact completion at the limit cannot be established, mark partial conservatively. Do not import arbitrary client JQL or silently substitute the current site's saved scopes.
- [ ] Bound snapshot storage to 3 previews, 15-minute TTL, total serialized limit 25 MiB, and the existing maximum saved-site count. Reject oversize snapshots with narrower-filter guidance; never drop rows to fit. Snapshots are server-held approved source data, not client-supplied replacement rows. Return safe scope/source/count details and capture time in UTC plus the user's submitted IANA timezone after validation. Keep underlying shared metadata changes from mutating an existing snapshot.
- [ ] Re-run tests and security/context regressions; commit `feat: preview site-scoped task exports`.

### Task E2: Real Excel workbook generation

**Files:** Create `server/lib/taskWorkbook.mjs`, `tests/taskWorkbook.test.mjs`; modify `server/routes/taskExportRoutes.mjs`, `package.json`, `package-lock.json`, `README.md`.

**Interfaces:** `buildTaskWorkbook(snapshot,{excludedRows=[],allowPartial=false}) -> Promise<Buffer>`; excluded rows are `{siteHost,issueKey}` and must exist in snapshot. `POST /api/task-export/download` takes `{previewId,excludedRows,allowPartial}` only and returns XLSX with attachment filename `docket-tasks-<UTC timestamp>.xlsx`. Expired/invalid snapshot yields 409 and requires preview again. No JSON body is interpreted as spreadsheet code.

- [ ] Present `exceljs` candidate version, license and current advisory review for explicit approval; install only after approval. Use its server API for writing and test readback, not a renderer dependency. The [official documentation](https://github.com/exceljs/exceljs#readme) describes workbook/worksheet creation, frozen views, filters, hyperlinks, and buffer writing. Check actual installed APIs; do not pin to an unverified latest-version claim.
- [ ] Write a synthetic two-site workbook fixture with one identical key, `'=HYPERLINK("https://example.invalid","x")'` as a note, multiline notes, Now/Next, date-only values, zero rows, failed site, and excluded rows. Read generated bytes with ExcelJS and assert: one Overview plus every selected site's sheet; string note has no formula; cell values exactly preserve note/date strings; hyperlink targets equal validated Jira URLs; failed site is labeled Failed, not zero-success. Test long/case-colliding names and explicit partial-consent failure.
- [ ] Run `node --test tests/taskWorkbook.test.mjs`; confirm failure before writer implementation.
- [ ] Implement Overview and site sheets with identical column order: Jira site, Issue key, Title, Status, Assignee, Jira due date, Docket priority, Now / Next, Notes, Requestor, Planned start, Planned finish, Actual start, Actual complete, Open decision, Decision note, PM override, Pinned to Gantt, Metadata source, Jira link. Use typed literals (date-only strings for exact preservation), wrap notes, freeze heading rows, add filters and usable widths. No raw object-to-cell mapping or formula inference. Use validated source/key to construct hyperlink objects.
- [ ] Sanitize sheet-name forbidden characters, trim to 31 characters, reserve Overview, and resolve collisions case-insensitively with ` (2)` suffixes within the limit. Record original hostname → sheet mapping in Overview. Reject cells over 32,767 characters before writing, invalid XML control characters with an actionable row/field message, and oversized generation according to E1 limits. Do not truncate or silently strip text. Produce failure/empty site sheets with explicit status; show filters, source, time, counts, and omissions on Overview.
- [ ] Return MIME `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and sanitized attachment filename. Check disconnect/cancel before generation and before sending; generation is bounded but cancellation during the library's write need not be immediate. Snapshot expiration/cancel may discard it; do not promise crash recovery.
- [ ] Run workbook and export tests, build, and open a synthetic result in an available workbook viewer to verify wrapping, headings, sheet names, and links. No SharePoint upload. Record unavailable visual validation if no viewer exists; do not substitute screenshots of the web preview. Commit `feat: download one worksheet per Jira site`.

### Task E3: Export dialog and clear source/partial-result choices

**Files:** Create `src/Pages/components/TaskExportModal.jsx`; modify `src/Pages/WorkWeekTasks.jsx`, `src/Pages/components/TaskManagerHeaderPanel.jsx`, `src/Pages/workWeekTaskElements.css`, `src/services/jiraClient.js`, `src/utils/backgroundJobStore.js`, `README.md`.

**Interfaces:** `TaskExportModal({open,onClose})`; `previewTaskExport(options,{signal})`, `downloadTaskExport({previewId,excludedRows,allowPartial},{signal}) -> Promise<Blob>`. Add one export background-job ID; do not add a new job framework. Exclusions stay separate from immutable snapshot data.

- [ ] Extend E1 route tests for expired IDs, forged exclusions, missing partial consent, and changed metadata source requiring a new preview; run `node --test tests/taskExport.test.mjs tests/taskWorkbook.test.mjs` and verify new failures where appropriate.
- [ ] Add Download tasks in Task Management. Dialog allows selecting saved sites, per-site scope and Local/Team metadata source, optional completed work and priority/NowNext filters. Local defaults everywhere; Team is disabled with explanation if unavailable. Require pending relevant saves to finish using S3 tracking or explicitly show saved-value export when failures remain. Preview groups tasks by site, displays source and completeness, allows row exclusions, retry, and explicit partial download. Source/scope changes invalidate preview; do not silently reuse old data.
- [ ] Download the Blob through the existing object-URL download pattern if available, revoke after use, display no-success on cancellation/error, and preserve preview on retryable failures. Explain text-only notes, excluded images/attachments, snapshot time, and manual SharePoint sharing in the UI/docs. Do not claim real-time synchronization.
- [ ] Run build and export tests; manually select two sites with identical keys, mix explicit Local/Team sources, exclude one row, induce a failed site, decline and then approve partial download, and verify no active-site change. Commit `feat: add reviewed multi-site workbook export controls`.
