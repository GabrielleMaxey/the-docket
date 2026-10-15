# The Docket application review and improvement design

Date: 2026-10-14

Status: Approved for implementation planning on 2026-10-14 by the user's request to proceed with the plan. Product implementation has not started; implementation plans and new dependencies require review before execution.

## Purpose and scope

Improve The Docket's reliability, local security, data separation, and maintainability while preserving its existing browser and Electron development workflows. This is a set of focused changes to the existing React/Vite, Express, and SQLite application, plus replacement of the optional MongoDB team demo with PostgreSQL support.

Development takes place on the user's personal Mac, which can access company Jira. Regular use is intended for company-managed computers. Users supply their own personal Jira API credentials. The same token is used across their approved company Jira sites.

Keep `npm run dev:all` and `npm run desktop:dev`. Remove packaged installer support, not Electron itself. Personal To Dos remain inside The Docket but become independent of Jira sites. PostgreSQL is the first shared database target; the application must remain usable without a company database connection.

This specification does not authorize implementation by itself. The approved design will be followed by an implementation plan. Only throwaway import-preview mockups have been changed so far.

## Review findings and agreed disposition

| ID | Trouble or issue | Why it matters | Improved refactor or disposition |
| --- | --- | --- | --- |
| 1 | Local API has no app-session authentication and does not explicitly bind to loopback | Network exposure is broader than the intended local workflow | Bind to IPv4 loopback and validate hosts and browser origins. Defer app-session authentication with the residual same-user-process risk documented. |
| 2 | Editing a saved Jira destination can retain the token for a different host | Credentials could be sent to an unintended destination | Validate parsed HTTPS destinations against an explicit configuration allowlist at settings, testing, and request boundaries. |
| 3 | Installer packaging omits required shared code | Packaged output can fail at runtime; unsigned installers are unsuitable for the target laptops | Remove installer tooling, workflow, and documentation. Preserve Electron development and native dependency rebuilds. |
| 4 | Browser business-data caches are not consistently scoped to Jira sites | Switching sites can expose stale or misattributed task data | Scope Jira caches and persisted business data by site; move personal To Dos and completed history to a separate local store. |
| 5 | Site switching replaces global credentials and closes the current SQLite connection while work may still run | Requests and saves can cross sites or lose their database connection | Wait for active site operations and pending site saves; enforce the switch boundary on the server and reject stale-site requests. |
| 6 | Shared MongoDB demo keys records only by issue key | The same key on two Jira sites can collide | Replace the demo with optional PostgreSQL support; shared task identity includes canonical site hostname and issue key. |
| 7 | CSV import passes an incomplete object to the general metadata upsert | The import can fail with a missing `hasOpenDecision` parameter; broad upserts also risk unrelated values | Use an import-specific field update through existing patterns, preceded by editable preview, validation, approval, and explicit saving. |
| 8 | New To Dos can be created on successive keystrokes before the first create finishes | Duplicate rows and stale responses can overwrite the user's latest text | Create each draft once; retain subsequent edits and apply them against the created record. |
| 9 | To Do debounce retains only the last field patch and discards pending work on unmount | Fast edits and navigation can lose changes | Merge pending fields, serialize saves per item, and preserve pending edits until saved or explicitly retried. |
| 10 | Legacy reminder migration runs whenever the To Do list is empty | Deleted reminders can return | Record successful migration explicitly and run it once per source. |
| 11 | Root `Pages/` and `services/` duplicate active `src/` code | Developers can edit inactive copies; divergent copies obscure the source of truth | Verify all references and differences, flag unique behavior, and delete only confirmed inactive copies. |
| 12 | Eight apparently unreachable `src/` modules remain | Dead paths add maintenance and search noise | Verify runtime, test, configuration, and dynamic references before deleting. |
| 13 | Jira tokens are persisted in plain text in SQLite as well as environment configuration | Duplicate secrets increase exposure and complicate rotation | Use the local server `.env` as the only persistent Jira-token location; transition existing credentials safely. |
| 14 | Electron disables its renderer sandbox and lacks explicit content/navigation controls | Compromised content has fewer restrictions | Enable the sandbox after compatibility checks, define permitted content sources, and control navigation and external links. |
| 15 | Jira requests have no explicit application timeout | Loading and site switching can wait indefinitely | Add a configurable timeout to the existing request helper, preserve edits, and offer deliberate retries. |
| 16 | Note-image replacement removes the previous image before the replacement is saved | A failed save can destroy the original | Save the replacement, update the reference, then remove the old image. |
| 17 | A search caller passes a numeric limit to a helper expecting options | The intended request limit is ignored | Correct the caller to the existing options contract and verify the outgoing limit. |
| 18 | Some components and hooks combine many responsibilities | Focused fixes are harder to understand and verify | Extract only responsibilities involved in these changes when that solves a concrete maintenance problem; no general rewrite. |
| 19 | CI focuses on releases rather than pull requests | Ordinary changes can bypass build and regression checks | Run existing build and tests on pull requests without live Jira access or personal credentials; retain company SonarQube as a separate required validation. |
| 20 | Installer dependencies contain reported audit findings | Installer-only tools add avoidable dependency exposure | Re-audit after installer removal and address remaining findings based on actual dependency paths and impact. |
| 21 | Apparently unused packages, broad stylesheet payload, and a stray helper assignment | Unnecessary code and dependencies add weight and confusion | Verify and remove unused packages and the stray assignment. Defer stylesheet work unless a measured benefit justifies its regression risk. |

The initial review reported 89 root duplicate files, including 73 identical and 16 divergent copies. These are discovery findings, not permission to delete without checking references and differences again. The eight candidate modules include WebModeNotice, scrollTop, NotesCell, PushActionsCell, StatusCell, useEpicFilters, useReminders, and epicFilterRunWorkflow.

## Local API and Jira destination rules

Bind the API explicitly to `127.0.0.1`. Keep the Vite proxy and Electron startup compatible with that address. Validate the expected host and port and allow only the application's configured browser origins. A missing Origin header is not proof of trust; command-line and Electron traffic must be handled deliberately without describing origin checks as authentication. Apply origin restrictions to state-changing requests, not just CORS response headers.

Jira browser login is separate from this API: the server supplies a token when calling Jira. App-session authentication is deferred. Loopback and origin restrictions do not prevent other processes running as the same local user from calling the API or reading `.env`. Document that limitation for both development and company-managed use. Remote hosting or a broader local-user trust model requires reconsidering authentication.

Use the existing URL-normalization logic where appropriate, including pasted Jira issue links. Accept only HTTPS, an exact approved hostname, no embedded credentials, and the standard HTTPS port. Validate the parsed hostname, not a company-name substring. The initial configuration allowlist is:

- `lumen.atlassian.net`
- `lumen-nm.atlassian.net`
- `lumen-vyvx.atlassian.net`
- `lumen-bll.atlassian.net`
- `lumen-sre.atlassian.net`
- `lumengss.atlassian.net`
- `lumen-bira.atlassian.net`

The allowlist lives in local server configuration, separate from the editable saved-sites registry. Additional hosts may be added explicitly through configuration. Validate saved-site create/update, connection tests, and outbound requests, including existing saved records. Preserve unapproved records but block credential-bearing requests with a clear error. Do not forward credentials through unexpected redirects to another origin.

The server reads the personal Jira token from `.env`; it must not be exposed through Vite client environment variables, API responses, logs, or exports. Settings continues managing saved site details and connection testing, but no longer persists Jira tokens. Keep the existing credential variable names and email handling where possible.

For existing SQLite tokens, detect whether environment credentials are usable without revealing the stored token. If environment configuration is missing or fails validation, show migration guidance and preserve existing data for recovery rather than deleting the only credential copy. Remove stored Jira tokens after the environment-based connection is confirmed. Clearing a SQLite value does not guarantee secure erasure from historical files, journals, or backups; do not promise that. Do not automatically rewrite a user's `.env` or print old credentials.

## Site separation and switching

Jira-derived caches, reports, metadata, and unsaved site-specific edits must retain their source-site identity. Reuse the existing saved-site identifier for local storage namespaces where practical; use canonical hostname plus normalized issue key for shared task identity. Cosmetic preferences need not become per-site unless they contain Jira business data.

Site switching waits for running Jira operations and pending site-specific saves. The server enforces the same rule across windows and callers. It must prevent new work from entering the old site while a switch is being finalized, finish or time out accepted work, and only then close the old database and activate the new context. Each accepted operation keeps a coherent site/credential/database context. Requests carrying an obsolete context are rejected rather than silently redirected to the new site.

A failed save must remain visible and retryable; it must not be counted as successfully drained. Do not clear it just to allow a switch. The precise busy-state presentation is left to the builder using existing UI patterns. Independent To Dos do not block Jira site switching.

Saved Jira sites keep their canonical hostname. Reject edits that change it, with guidance to add a separate saved site; preserve the existing ID, database, and browser cache. Normalize same-host pasted links before comparison and continue allowing name/email edits. This policy was explicitly confirmed by the user during S3 implementation.

For legacy unscoped browser data, migrate only when source-site identity can be established. Do not assign ambiguous data to whichever site happens to be active; retain it for explicit recovery. Add an ambiguity comment where the migration cannot infer origin safely.

Combined Open Work dashboards across different saved Jira sites are deferred. The workbook export described below is the approved exception: users may collect tasks from multiple selected saved sites for a download. Preserve source identities, and do not introduce general multi-site background jobs or a combined dashboard as part of export.

## Standalone personal To Dos

Keep To Dos within The Docket and usable without an active Jira connection. Store them in a separate local SQLite store that is not reopened, removed, or replaced when a Jira site changes. They are personal local records, not part of the team priority database.

Carry over active and completed To Dos, including completion dates and visibility under Past Reports. Preserve existing report behavior and stored historical content. Removing or changing a Jira site must not remove personal To Dos or their completed history.

Migration copies records from each known site store and the legacy reminder source. Record source identity and source record identity so a retry cannot duplicate a successful migration. Do not deduplicate solely on equal text or reuse colliding numeric IDs from different databases. Copy and record successful migration atomically in the destination; leave source records recoverable until migration is verified. Use completion and creation dates as recorded, without inventing missing historical dates. Any ambiguity in legacy history must be commented and surfaced for recovery.

Builder choice: migration must retain every existing record even when the combined active count exceeds the current limit of 15. Keep the existing limit for creating new records; do not truncate migrated data. Completed records with an unknown completion date must remain accessible in the completed history with that date marked unknown. Verify the existing All time filter actually includes them; do not allow a default date fallback to hide preserved records.

The legacy reminder import becomes an explicit migration. An empty list after deletion is a valid final state and must not trigger another import. Source migration markers remain after the last To Do is deleted.

Retain automatic saving. Each new draft has stable UI identity and at most one create in flight. Edits made during creation are retained and saved against the resulting ID; an older response must not replace newer text. Merge pending changes across fields and order writes per item. Save state survives page navigation through the existing application structure; do not rely on an unmount fetch or browser shutdown completing. On failure retain the unsaved draft/patch and offer a retry. Do not claim crash-proof or offline durability unless explicitly implemented and tested. During ambiguous create failures, do not blindly retry in a way that can duplicate a server-created record; the builder must select a minimal duplicate-prevention mechanism.

Deletion and clearing completed items must be coordinated with pending writes so an older queued save cannot recreate an item or overwrite a later action. This requirement does not add a new deletion/archive policy; preserve existing user-visible deletion semantics.

## Optional PostgreSQL team storage

Replace the MongoDB demo with a real PostgreSQL implementation behind the existing team-data routes and UI patterns. Keep local SQLite. Do not add an ORM, a dual PostgreSQL/MySQL runtime, or a speculative database abstraction. Prefer ordinary relational tables and parameterized SQL. A PostgreSQL driver is a necessary dependency for this requirement; the implementation plan must name it and its purpose for explicit approval before installation.

Connection details will be supplied later through server-side configuration. Reuse existing configuration conventions and document the new PostgreSQL variable names, migration/setup command, TLS requirements, and how to test a connection without exposing credentials. No cloud provisioning, company-network changes, or live team-data transfer is authorized by this design. Use certificate verification for a hosted database; do not disable TLS verification to make connectivity work.

When unconfigured, local workflows remain functional. Team-save controls are visibly disabled with a reason. When configured but unreachable, show a connection failure and do not report a successful save or silently redirect the write to another destination. Recheck availability on submission; disabled UI is not the backend's only guard.

Task records use canonical Jira site hostname plus normalized issue key as their identity. Apply this to all shared priorities, dates, reads, writes, imports, and sync paths. Preserve existing shared-program behavior where it is used, and give each issue/epic reference an unambiguous source site. Do not assume every existing demo record belongs to the active site.

Provide versioned, repeatable schema setup/migrations using the repository's existing plain-function style. Existing MongoDB demo data is not silently copied or discarded. A deliberate export/import transition must require a source-site mapping for any record that lacks it; ambiguous records remain unmigrated. The builder may define the transition format and document it. Remove the MongoDB dependency only after proving no active feature still needs it.

The deployment initially trusts the configured company database access. No new app account system, role management, or SSO is included. Database permissions must be provisioned by the company. Do not imply that a Jira login authorizes shared database access.

### Now / Next

Replace the proposed Flag checkbox with a single follow-up value: `now`, `next`, or unset. The UI presents Now and Next checkboxes with at most one selected; selecting the other switches the value, and unchecking the selected choice clears it.

- Now means immediate follow-up or a potential blocker.
- Next means follow-up afterward.
- The value is shared when saved to the team priority database.
- It is Docket metadata and does not modify Jira status or Jira's own flag field.

Builder choice: store one nullable constrained scalar rather than two independent booleans. Reuse the same public value set for local and team records. An omitted field preserves the saved selection; an explicit clear sets it to unset. Clearing priority must not accidentally delete a separately saved Now / Next value. Exact column and API property names are left to the implementation plan and must be consistent across layers.

## Import preview and approval

The flow is Choose CSV → Review and edit → Approve changes → Save. Approval alone performs no database write. Save locally and Save to team are equally primary options for all approved supported fields, including planning. The user explicitly chooses a destination; neither option is presented as a backup or fallback. The team action is greyed out when configuration is absent, while local saving remains available. Server-side validation and database availability checks still apply.

Match imported records using the chosen source Jira site and normalized issue key. The site's identity stays fixed for a preview; switching sites invalidates the preview rather than applying its rows to another database. Import is local/team metadata work and does not push changes to Jira.

Show selected rows, validation issues, existing values, and the proposed changes. Allow users to edit text, exclude rows, choose Now / Next, and add supported columns. Preserve existing notes by default; replacing a nonempty saved note requires a visible per-row choice. Blank notes do not erase saved notes. Added blank fields preserve saved values. Unrelated metadata is never reset by default values in an import object.

Initial column scope, based on the reviewed mockup: issue key, priority, note, Now / Next, plus selectable existing fields Requestor, Planned start, Planned finish, Actual start, and Decision note. Builder choice: adding a column means exposing a supported field, not creating arbitrary database columns. Arbitrary custom fields and schema editing are deferred. Existing has-open-decision state must not be silently inferred from a note or Now / Next.

The current application uses Jira Summary as the issue title. Separate title/summary import fields or a new Jira enrichment request are not required; the user accepted the existing behavior. Do not claim the mockup already fetches issue titles.

Keep the existing CSV normalizer and priority helper unless a confirmed bug requires a focused fix. In particular, the mockup's strict 1–20 validator is illustrative; do not silently replace the current accepted priority formats and clamping rules. Display normalized values in the preview before approval. Unparseable or invalid selected rows must be corrected or excluded. Duplicate selected site/key identities must be resolved before saving, with no hidden last-row-wins behavior. Validate actual calendar dates, not just date-shaped strings.

To support a Now / Next-only edit, a valid issue key plus at least one applicable changed metadata field is sufficient; priority is optional when it is not being changed. This is a builder-proposed extension of the old priority-only importer, not a claim about its current behavior. Unknown CSV columns are identified as ignored, not silently presented as saved. Removing an added preview column removes its pending changes. An omitted Now / Next column preserves the saved value; clearing an existing selection must appear explicitly in the approved diff.

Preview and save use the same server-side validation and field ownership rules. The server accepts only known fields and validates incoming edited values, even if the client already validated them. Use targeted updates so dates, decisions, image settings, notes, and other metadata absent from the approved diff remain unchanged. The original missing `hasOpenDecision` error must be covered by a regression test.

Builder choice: recheck saved values at commit time. If a field to be changed differs from the value the user approved against, return a conflict for review rather than silently overwriting a newer edit. Keep the selected batch atomic within its destination database; failed validation or a failed transaction does not leave a partially applied batch. A success summary must state what was saved and where. These are metadata upserts, not automatic Jira write retries.

### Equal local and team save options

The user confirmed that team saving includes every approved supported field: priority, notes, Now / Next, Requestor, Planned start, Planned finish, Actual start, and Decision note when included in the approved changes. Preserve existing shared date functionality. The team schema, read responses, preview comparisons, and write validation must support this full set; do not silently drop planning or notes from a team save. Fields omitted from the approved changes remain unchanged at the destination.

The user designated both local and team saving as primary options. Save locally writes the approved supported fields to the existing site-specific local SQLite metadata store. Save to team writes them to PostgreSQL. Present the options with equal prominence when both are available and explain who can access each destination: this device or the team. Neither action automatically writes to the other database. Local saving remains available before team configuration and after a failed or unavailable team save. Saving the same reviewed edits to the other destination is a separate explicit action, subject to that destination's comparison and approval rules. No new backup file format is included.

The preview and saved-value comparison must identify their destination. If changing between local and team saving changes which existing values would be overwritten, show that destination's diff and obtain approval for the changed effects before writing. In particular, permission to replace a team note must not silently authorize replacing a different local note, or vice versa. When the team database is unavailable, the local preview must still work using local records without implying team values were fetched or checked.

Report destination outcomes separately: Saved to team, Saved locally — not shared, or, if the user explicitly saves to each in sequence, the result for each destination. Never silently fall back and report a local write as a successful team save. Preserve the approved edits on failure so the user can retry the failed destination without repeating the successful one. For a team request whose outcome is uncertain, re-read the destination when possible before reporting failure or retrying; do not imply the team is unchanged merely because the response was lost. No cross-database atomic transaction or background synchronization is included.

## Download tasks for SharePoint and sharing

Provide a Download / Export tasks action independent of Save locally and Save to team. Its purpose is a human-readable Excel workbook that users can upload to SharePoint or share themselves. It is a dated snapshot, not a live connection, backup/restore format, or import template. Do not add direct SharePoint upload, synchronization, or permissions management. Personal standalone To Dos are outside this Jira-task export.

Users can select one or several saved, approved Jira sites. Each selected site receives its own worksheet; there is no required combined task sheet. Use short recognizable names such as `lumen`, `lumen-nm`, and `lumen-vyvx`, with deterministic handling for invalid, long, or colliding sheet names. Include the full canonical hostname in worksheet metadata and task rows so shortened names do not obscure source identity. Keep identical issue keys from different sites distinct.

An Overview sheet records the export timestamp and timezone, selected Jira sites, worksheet names, task counts, filters, metadata sources, and any failures or incomplete results. Each site sheet uses the same column order and readable headings, frozen headers, filtering, wrapped note text, and practical column widths. A successfully loaded site with no matching tasks still has its sheet and a zero count. If a user explicitly accepts a partial export, a failed selected site has a clearly marked failure sheet and Overview entry rather than appearing as a successful empty result.

### Task selection and source of values

The export dialog lets users select saved sites, preview matching tasks grouped by site, and exclude individual rows. Builder-proposed defaults from the walkthrough: open work is selected initially, completed work is optional, and filters include project, priority, and Now / Next. Reuse the application's existing query/filter helpers and saved scopes. Show the actual project or saved scope for each site; do not silently substitute another site's scope or perform an unbounded all-company query. Require the user to choose a valid scope if the existing scope cannot be resolved for that site. Exact layout is left to the builder using current UI patterns.

Jira supplies task identity, Summary as title, status, assignee, and available Jira date fields. The selected metadata source supplies Docket notes, priority, Now / Next, Requestor, planning and actual dates, and other supported local planning/decision fields. Distinguish Jira due dates from Docket planned/actual dates in column labels. Include a validated clickable Jira issue link. Reuse existing text conversion for notes where available; preserve text and line breaks. Embedded images, attachment binaries, and rich formatting are excluded from this initial export and that limit is visible before download. No separate Jira description field or title/summary import is introduced by this export.

Locally saved metadata is the default. Users may explicitly select team-database metadata when configured and available. Builder choice: allow the source to be chosen per selected site, defaulting each to Local, and identify it on the preview, worksheet, and Overview. Do not silently blend local and team fields. A missing value in the chosen source remains blank/unset rather than borrowing from the other source. Unsaved edits are not represented as saved data: finish the relevant pending saves or tell the user the export reflects saved values before generating it.

If the chosen team source becomes unavailable, keep the error visible and let the user retry, explicitly change to Local with a refreshed preview, or exclude that site. Never present local data as team data. Site-level Jira failures also require an explicit choice to retry or download clearly marked partial results. A preview loaded with partial pages or a reached limit is not a complete site result; report that condition and offer narrower filters or explicit partial export. Reuse existing finite query bounds and timeouts, paginate within those bounds, and never silently truncate results.

### Safe collection and workbook generation

Capture each selected site's canonical identity and permitted request context. Fetch sites sequentially initially, using scoped Jira requests and local metadata reads without changing the application's active Jira site or closing its live database connection. Reuse existing request, normalization, and query functions; add only the minimum explicit site context needed for this export. Do not drive export by repeatedly calling the global site-switch action. Respect the same allowlist, timeout, and stale-context protections as normal requests. Preserve the preview's selected keys and metadata values for generation so the downloaded workbook matches what was reviewed; a refresh must visibly rebuild the preview.

Generate a genuine `.xlsx` file. There is no workbook-writing dependency currently declared in `package.json`; the implementation plan must identify an appropriate maintained writer, check its security/licensing and fit, and request explicit dependency approval before installation. Do not substitute CSV or HTML with an `.xlsx` extension, hand-build a ZIP/XML spreadsheet stack, or rely on a developer-only Python/runtime tool being installed on users' laptops.

Treat imported notes, issue text, names, and other user-controlled strings as literal cell text, never formulas, macros, or external-workbook references. Construct hyperlinks only from validated Jira destinations and keys. Exclude API tokens, database connection strings, credential-bearing URLs, local filesystem paths, and internal diagnostic secrets. Validate workbook limits before generation; if content cannot fit, report the affected data and require adjustment rather than silently losing it. Keep generation bounded and expose useful failure/cancel states. Producing a download performs no Jira or metadata writes.

Verify a workbook containing at least two sites with colliding issue keys, local and team source choices, multiline notes, planning dates, Now / Next, a site with zero results, and an explicitly accepted failed-site result. Check sheet naming, provenance, counts, filters, literal formula-looking text, and links using a workbook reader as well as a visual inspection. Confirm the active application site is unchanged and no unselected site's data is fetched or exported. Test that a team-source failure cannot trigger an undisclosed local fallback.

## Electron and installer changes

Remove installer pack/dist scripts, electron-builder packaging configuration and installer workflow, and assets/dependencies proven installer-only. Document the lack of packaged installers and the supported local development commands. Retain Electron runtime, main/preload, desktop development scripts, diagnostics, and native SQLite rebuild support. Replacing the current electron-builder postinstall must preserve the necessary native setup using existing rebuild tooling. Do not delete shared application icons just because installer generation also uses them.

Enable the renderer sandbox after checking that preload and current desktop features remain compatible. Preserve context isolation and disabled renderer Node integration. Define a content security policy for actual required scripts, connections, styles, and media, with development-only allowances scoped to development. Do not break existing AI-provider or attachment workflows by applying a Jira-only content policy to unrelated features.

Restrict the desktop window to intended app locations and block unexpected new windows or navigation. Validate external URLs and open permitted Jira links in the normal browser. Reuse existing external-link handling where possible. Do not enable arbitrary schemes. Inventory other intentional external links and preserve safe, explicitly required behavior rather than treating every non-Jira link as approved.

## Focused reliability and cleanup work

Add a configurable finite Jira timeout to the existing fetch helper. The builder selects and documents a practical default. Propagate cancellation through the full relevant request/response read and clear timers. End loading and pending-operation tracking on timeout. Preserve unsaved edits and provide an actionable error. A timed-out Jira write may have succeeded remotely; tell the user to check its outcome before retrying and do not replay it automatically.

For note-image replacement, validate/write the new file first, update its database reference successfully, then delete the old file. If writing or reference replacement fails, retain the original reference and image; clean up the incomplete replacement when safe. Old-file cleanup failure after a successful switch must not revert or destroy the valid new image. Keep errors specific and avoid catch-log-rethrow wrappers.

Correct the numeric/options mismatch in the search helper call without changing filters, sorting, or intended pagination. Verify the requested limit reaches the outgoing Jira request.

Before deleting duplicate root directories, compare divergent files, verify imports/scripts/configuration, and report unique behavior before removal. Do the same reference verification for apparently unreachable modules and `react-scroll`/`styled-components`. Remove `extractJiraErrorMessage.empty = true` only after confirming it has no consumer. Do not alter unrelated user work, including pre-existing untracked specification files.

Split large files only when an approved change exposes a focused responsibility or real duplication. Follow existing modules, plain functions, hooks, and styles. Do not rename stable APIs or introduce new classes/frameworks. No general component rewrite, new styling system, or broad Semantic UI CSS replacement is included.

Re-run the dependency audit after installer removal. The original report's eight moderate package nodes were associated with one transitive installer-related advisory, not eight demonstrated runtime vulnerabilities. Treat that as historical evidence and verify the current dependency graph before deciding what remains.

## Verification and delivery requirements

Add meaningful regression checks for changed behavior rather than tests that mirror implementation. Use the existing Node test runner and repository conventions; do not add a new test framework solely for this work. Use synthetic data and mocked Jira responses, never personal credentials or a live company Jira connection in CI.

| Area | Required evidence |
| --- | --- |
| Local API | Loopback binding; allowed host/origin success; rejected unexpected host/origin; browser and desktop startup still work. |
| Jira allowlist and credentials | Valid approved hosts; invalid schemes, embedded credentials, spoofed suffixes and redirects rejected; old unapproved records blocked; no token in client responses/logs; environment migration failure does not discard the only usable configuration. |
| Site boundaries | Identical issue keys on separate sites stay separate; old responses cannot populate a new site; switch waits for active work; timeout/failure does not deadlock the switch or erase edits. |
| To Dos | Fast typing creates one record; latest text wins; text/priority/date edits all persist; navigation preserves pending work; failure offers retry; delete cannot race with queued saves; completed history survives migration and site removal. |
| Migration | Repeated and interrupted runs do not duplicate imported records; empty lists do not resurrect reminders; ambiguous origin/history is retained for recovery. |
| PostgreSQL | Unconfigured mode works locally; disconnected mode reports failure; schema setup is repeatable; same issue key on different sites does not collide; all supported approved fields round-trip, including planning and notes; Now / Next clears independently of priority. |
| Imports | No mutation before approval/save; original missing-parameter defect fixed; omitted fields preserved; explicit note replacement respected; invalid/duplicate rows handled; conflicts return to review; destination-specific transaction rollback tested; local and team saving have equal prominence when available; local saving works without team access and cannot be reported as shared; different destination values require a reviewed diff. |
| Workbook export | One sheet per selected site plus Overview; chosen local/team source remains explicit; planning and notes retained; selected scope and exclusions respected; unavailable/limited results cannot look complete; formula-looking text stays literal; valid links and sheet names; active site unchanged. |
| Electron | Sandbox/preload compatibility; expected IPC and local server startup; blocked unexpected navigation/windows; permitted external Jira links open in the normal browser; development CSP works. |
| Images and search | Failed replacement retains original image; successful replacement updates reference before cleanup; intended search limit reaches Jira. |
| Cleanup | Reference searches, build, relevant tests, and supported workflow smoke checks pass after removals; no accidental deletion of divergent functionality. |

Run the production build and relevant tests locally, then the full existing suite when the integrated changes are ready. The initial review reported a passing build and 373 passing tests with one CSV metadata-import failure out of 374 after allowing local sockets. This is historical baseline evidence, not validation of future changes or a fresh run for this documentation-only turn.

SonarQube exists at the company but is inaccessible from this personal development Mac. Run available local checks here and report their scope accurately. Company SonarQube validation remains required before merge, with no newly introduced Major or Critical findings. Ruff is not a JavaScript substitute. Do not claim SonarQube passed or silently waive it. No deployment or merge is part of design approval.

Add pull-request build/test checks separate from removed installer release automation. Do not require company credentials for CI fixtures. Document any required company-side scanner/project setup rather than inventing credentials or access.

The implementation plan must list exact files, focused steps, meaningful tests, dependency changes needing approval, migration/recovery sequencing, and verification that remains company-side. Each implementation report must list changed/created files and important line references. Keep the approved specification separate from disposable mockups in `.superpowers/`; those mockups are not application code or production validation.

## Explicit deferrals and builder decisions

Deferred: app-session authentication, combined cross-site dashboards, MySQL support, company database provisioning, arbitrary import columns/custom fields, separate title/summary import, packaged installers, broad styling cleanup, and general large-file rewrites. Export-specific deferrals are direct SharePoint upload/sync, images/attachment binaries, live-linked workbooks, and workbook re-import/restore.

Builder decisions to make explicit in the plan: PostgreSQL driver and configuration names; table and migration filenames; timeout default; exact busy/error presentation; safe native rebuild replacement; source-record migration bookkeeping; minimum mechanism preventing duplicate To Do creates after uncertain responses; preview conflict comparison; supported CSV header aliases; workbook writer, bounded generation location, and export dialog details. Do not add dependencies where existing tools solve the problem.

Both local and shared import include all approved supported fields, with local and team saving equally primary and explicitly selected. All implementation choices must satisfy the agreed behavior above without expanding the application's scope.

## Builder review

A fresh software-engineering reviewer checked this draft on 2026-10-14. The only material questions identified were which approved import fields are shared and how team saving relates to local saving. The user's final decisions are incorporated above: all approved fields including planning are supported, and local and team saving are equally primary options. Remaining implementation choices were judged sufficiently constrained or explicitly delegated to the builder. This is a design review, not a code review or test result.

A separate fresh reviewer checked the added workbook export and its interaction with site isolation and metadata sources on 2026-10-14. No important unanswered questions remained; the source-selection, active-site preservation, and incomplete-result rules were sufficiently defined for planning. Workbook generation and visual verification have not been performed because product implementation has not started.
