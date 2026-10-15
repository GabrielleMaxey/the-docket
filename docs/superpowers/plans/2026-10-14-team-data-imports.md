# Team Data and Imports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the team demo with optional PostgreSQL and let users review, edit, approve, and save metadata locally or to the team.

**Architecture:** Plain PostgreSQL functions replace MongoDB calls behind existing routes. Reuse one validated metadata-patch contract for local/team import and export reads. A bounded in-memory preview records approved destination-specific values; committed saves use transactions and conflict checks.

**Tech Stack:** Existing Express/SQLite/React/Node tests; `pg` only after explicit dependency approval.

**Spec:** [Approved design](../specs/2026-10-14-application-review-design.md); [shared contracts](2026-10-14-application-review.md). Depends on S1–S3.

## Global Constraints

- Save locally and Save to team are equally primary options for all approved supported fields, including planning.
- Approval alone performs no database write.
- Shared task identity includes canonical site hostname and issue key.
- PostgreSQL is the first shared database target; no ORM or dual PostgreSQL/MySQL runtime.
- Keep local SQLite and existing field/priority conventions; never expose database credentials.
- No company database is provisioned or required for local operation. Company SonarQube remains required before merge.

## Review Focus

1. Same key belongs to two Jira sites → D1 isolates every read/write/sync path.
2. A priority is cleared while Now / Next remains set → D1 keeps the metadata row.
3. A different team note exists after local approval → D3 shows and approves the team diff before writing.
4. A second editor modifies a field after preview → D2/D3 return 409 without overwriting it.
5. CSV contains multiline notes, unknown fields, or no priority → D2 preserves text, reports ignored fields, and accepts other supported edits.

### Task D1: PostgreSQL store, migrations, and compatibility routes

**Files:** Create `server/lib/teamPriorityPostgres.mjs`, `server/db/team/001-team-metadata.sql`, `scripts/migrate-team-db.mjs`, `scripts/import-team-demo.mjs`, `tests/teamPriorityPostgres.test.mjs`, `tests/teamPriorityRoutes.test.mjs`; modify `server/routes/teamPriorityRoutes.mjs`, `server/jiraProxy.mjs`, `src/Pages/Settings/components/TeamPriorityDemoSection.jsx`, `src/services/jiraClient.js`, `package.json`, `package-lock.json`, `README.md`. Delete `server/lib/teamPriorityMongo.mjs` and `mongodb` only after reference verification and preserving a documented demo export format.

**Interfaces:** `getTeamMetadata({siteHost,issueKeys}) -> Promise<Record<key,Metadata>>`; `writeTeamMetadata({siteHost,entries,updatedBy}) -> Promise<{updated}>`, entries are `{issueKey,patch,expected}`; `getTeamStatus() -> Promise<{configured,connected,error?}>`; `closeTeamPool() -> Promise<void>`. Existing priority/date/program exports retain their names in the new module, with a required server-resolved `siteHost` argument. `GET /api/team-priority/health` retains its public shape; add `POST /api/team-priority/metadata/bulk` for complete metadata reads. `fetchTeamMetadataBulk(issueKeys)` is the browser wrapper.

- [ ] Before installation, present `pg` and its verified candidate version/license/advisory summary for approval. On approval install the chosen version and lock it; do not install PostgreSQL server or contact a live company DB implicitly.
- [ ] Write tests for unconfigured 503, safe disconnected error, same-key/two-site isolation, all supported metadata fields, priority clear preserving followUp, and rollback on a bad second row. Pin assertions: `siteA['ABC-1'].note === 'A'`, `siteB['ABC-1'].note === 'B'`, `afterClear.followUp === 'now'`, and failed batch leaves both original rows unchanged. Use a mock pool for configuration/error unit tests and a dedicated test database for SQL integration; do not claim mocks verify SQL.
- [ ] Run `node --test tests/teamPriorityPostgres.test.mjs tests/teamPriorityRoutes.test.mjs`; unit tests fail before implementation. Integration tests explicitly skip unless `DOCKET_TEST_DATABASE_URL` is set; CI C4 must supply it and forbid skipped integration tests in its database job.
- [ ] Implement `TEAM_PRIORITY_DATABASE_URL`, optional `TEAM_PRIORITY_DATABASE_CA_FILE`, and a pool with max 5 connections, 5s connect timeout and 30s statement timeout. Require verified TLS for remote hosts; permit TLS-free only for explicit loopback test/development URLs. Reject conflicting SSL URL parameters when supplying a CA so library parsing cannot silently override verification. Sanitize errors. Use one checked-out client per transaction and release it in finally; initialize lazily so unconfigured startup works. See [transaction contract](https://node-postgres.com/features/transactions) and [TLS options](https://node-postgres.com/features/ssl).
- [ ] Implement transactional, versioned SQL migrations with a schema-version table and migration lock. `team_issue_metadata` has composite primary key `(site_host,issue_key)`, `priority` integer default 0 constrained 0–20, nullable `follow_up` constrained to `now`/`next`, `note`, `requestor`, `open_decision_note`, `pm_override` text default empty, booleans `has_open_decision`/`pinned_gantt`, date columns `start_date`, `complete_date`, `planned_start`, `planned_finish`, and audit timestamp/actor. Map SQL DATE to strings/null at query boundaries, not JS Date conversions. Do not store image paths/keepNoteImages in team rows. Preserve shared programs in `shared_programs` and source-qualified epic references in `shared_program_epics(program_slug,site_host,issue_key)`; existing seed/demo entries require explicit source mapping.
- [ ] Extend existing priority/date endpoints, pull/sync, and shared programs to resolve the correct site. Priority zero clears only priority, date deletion clears only date/planning values, never unrelated notes/followUp. Team writes use the full patch validator introduced in D2; until D2 lands, keep current route-specific validation and do not expose full import writes. Add an explicit demo migration CLI consuming exported JSON and required site mapping; validate all mappings before a transaction, preserve exported source files, and reject unknown-site records without partial insertion. Never automatically migrate an Atlas database on startup. Document setup/run/test/recovery and remove demo labels from visible UI.
- [ ] Run unit and real PostgreSQL integration tests, migration twice, build, and local-only startup. Verify missing schema appears as unavailable with setup guidance, not a fake empty success. Commit `feat: add optional site-scoped PostgreSQL team data`.

### Task D2: Supported metadata patches and local import correctness

**Files:** Create `shared/issueMetadataFields.mjs`, `server/lib/issueMetadataStore.mjs`, `tests/issueMetadataFields.test.mjs`, `tests/issueMetadataStore.test.mjs`; modify `server/db/schema.mjs`, `server/lib/issueMetadataImport.mjs`, `server/routes/issueMetadataRoutes.mjs`, `server/lib/teamPriorityPostgres.mjs`, `src/services/jiraClient.js`, `src/Pages/hooks/useTaskManagerJira.js`, `src/Pages/components/JiraResultsTable.jsx`, `tests/issueMetadataImport.test.mjs`, `tests/issueMetadataRoutes.test.mjs`.

**Interfaces:** `IMPORT_FIELDS = ['priority','note','followUp','requestor','plannedStart','plannedFinish','startDate','openDecisionNote']`; `validateMetadataPatch(patch,{importOnly=false}) -> {patch,errors}`; `getLocalMetadata(db,issueKeys) -> Record<key,Metadata>`; `writeLocalMetadata(db,entries) -> {updated}` uses the D1 entry shape. `parseIssueMetadataCsv(csvText)` retains existing result properties and adds `ignoredHeaders` and optional supported columns. `planIssueMetadataImport(rows,existingByKey)` retains compatibility result counters and adds per-field proposed patches/validation details.

- [ ] Extend the existing failing CSV-route regression to set decision/date/image metadata before a priority-only import and assert every omitted value is unchanged. Add `followUp` clear vs omission, priority-less note/requestor edits, protected saved notes, optional column removal, multiline CSV notes, invalid dates (`2026-02-30`), duplicate normalized keys, and unknown headers. Example core assertions:
  ```js
  assert.deepEqual(validateMetadataPatch({ followUp: null }, { importOnly: true }).patch, { followUp: null });
  assert.equal(after.plannedStart, before.plannedStart);
  assert.equal(after.hasOpenDecision, before.hasOpenDecision);
  ```
- [ ] Run `node --test tests/issueMetadataFields.test.mjs tests/issueMetadataStore.test.mjs tests/issueMetadataImport.test.mjs tests/issueMetadataRoutes.test.mjs`; confirm missing-parameter and new behavior failures.
- [ ] Add nullable `follow_up` to local metadata with value validation; use existing naming maps consistently. Extend full metadata reads/saves and the task table/planning controls to display mutually exclusive Now/Next with clear/unset support. Preserve existing metadata routes and hook handlers instead of creating a second task metadata model. Unrelated booleans remain independent.
- [ ] Implement plain shared field definitions/validation reused by both stores and frontend controls. Reject unknown patch properties; use explicit SQL-column allowlists for dynamic patches and parameter binding for values. Validate calendar dates and combined planned-date ordering against existing values, including partial edits. Enforce at most 5,000 import rows and existing request-body bound, with clear errors. Keep text limits already defined for corresponding fields; add explicit checks where a destination imposes a tighter limit instead of truncating.
- [ ] Extend the CSV parser to retain quoted multiline records using its existing character parser; no new parser dependency. Header aliases: current aliases plus `now/next`, `now / next`, `follow up`; `requestor`; `planned start`, `planned finish`, `actual start`, `decision note`. Do not reinterpret legacy ambiguous `Flag` as a new selection. Accept `now`/`next` case-insensitively; absent/blank imported selection preserves, and an explicit UI clear becomes null. Reuse `parseImportPriority` and expose its normalized/clamped value before approval. Preserve blank fields and protect saved notes unless `replaceNote:true` is explicitly approved for that destination.
- [ ] Make both writes atomic with changed-field expected-value checks. SQLite uses a synchronous transaction; PostgreSQL uses SERIALIZABLE plus field comparisons in the same checked-out transaction and maps serialization conflicts to 409 without blind replay. Missing rows are compared as absent; concurrent insertion is a conflict if effects change. Use targeted updates, never the old incomplete general upsert. Regression-test one late conflict rolling back the entire batch.
- [ ] Re-run D2 tests, D1 real database tests, and build; verify normal non-import metadata editing still works. Commit `fix: preserve unowned metadata fields during imports`.

### Task D3: Preview, approval, and equal save actions

**Files:** Create `server/lib/issueImportPreview.mjs`, `src/Pages/Settings/components/IssueImportPreview.jsx`, `tests/issueImportPreview.test.mjs`; modify `server/routes/issueMetadataRoutes.mjs`, `server/routes/teamPriorityRoutes.mjs`, `server/jiraProxy.mjs`, `src/Pages/Settings/components/TeamPriorityImportSection.jsx`, `src/Pages/Settings/components/settingsSection.css`, `src/services/jiraClient.js`, `README.md`.

**Interfaces:** `POST /api/jira/issue-metadata/import/preview` accepts `{destination:'local'|'team',csvText?,rows?}` and returns `{previewId,siteContext,destination,rows,diff,errors,ignoredHeaders,expiresAt}`. Exactly one CSV or edited-row input is accepted. Each row is `{rowId,issueKey,selected,patch,replaceNote}`. `POST /api/jira/issue-metadata/import/commit` accepts `{previewId}` and returns `{destination,updated}`. `createImportPreview({siteContext,destination,rows,existingByKey})` and `commitImportPreview({previewId,siteContext})` own the bounded preview map; register in existing route modules, using D1/D2 store functions.

- [ ] Write endpoint tests `preview and approval write nothing`, `edited selection invalidates approval`, `team destination rereads a different note`, `stale generation fails`, `expired preview fails`, `one row conflict saves nothing`, and `team failure never falls back`. Assert counts remain unchanged before commit and that a team conflict returns 409 with local note untouched.
- [ ] Run `node --test tests/issueImportPreview.test.mjs tests/issueMetadataRoutes.test.mjs`; confirm failures.
- [ ] Store sanitized authoritative preview rows and expected values in a private bounded map using random UUID IDs: at most 5 live previews, 15-minute TTL, evict expired previews first and return a clear capacity error rather than evicting another live preview. Bind to site generation/destination; never serialize secrets. On commit validate availability/context, apply transaction, and record result briefly for duplicate-submit idempotence. Conflict/expiry requires a fresh preview. Server restart requires re-preview, not a promised durable draft.
- [ ] Replace immediate file-import UI with editable preview, supported Add column menu, row exclusions, old/new values, protected-note replacement, Now/Next, validation summary, and Approve changes. Final screen shows equal Save locally/Save to team buttons, with team disabled and reason when unavailable. Initial review may show Local comparison; choosing Team must produce its own authoritative diff and require approval if effects differ. Every edit, row selection, column removal, or destination change invalidates previous approval. Update local caches only after confirmed local saving, using S3 namespace; team save must not silently overwrite local metadata.
- [ ] Redirect/remove the old immediate-save import paths and client wrappers after migrating all UI callers, so they cannot bypass preview. Return an actionable 409 `IMPORT_PREVIEW_REQUIRED` for obsolete CSV mutation endpoints during transition. Existing individual metadata edits remain permitted. Distinguish saved to team/local, failure, unknown network outcome, and duplicate completion; preserve edits for retry or another explicitly chosen destination.
- [ ] Re-run import/store tests, build, and manually follow the v5 mockup interactions plus updated equal-save rules, destination conflict, unconfigured DB, site switch, and double click. Update documentation and commit `feat: review and approve metadata imports before saving`.
