# The Docket Application Review Implementation Plan

**Implementation status (2026-10-14):** The authorized code tasks are implemented. Current verification, task dispositions, recovery guidance and remaining gates are recorded in the [integrated handoff](../2026-10-14-implementation-handoff.md). Company SonarQube and execution of PostgreSQL 16 CI remain pending; the planned checklists below are historical scope, not claims that those external gates passed.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved reliability, security, shared-data, import, and multi-site workbook changes without rewriting unrelated working code.

**Architecture:** Five linked plans implement independently testable subsystems. Keep React/Vite, Express route registration, plain-function helpers, local SQLite, and Electron development. Add optional PostgreSQL and server-generated workbooks through focused modules, not a new application architecture.

**Tech Stack:** Node >=22, React 18, Express 5, better-sqlite3, Vite, Electron, Node test runner; approved dependencies `pg` 8.23.1 and `exceljs` 4.4.0 (with the scoped uuid 11.1.1 override).

**Spec:** [Approved design](../specs/2026-10-14-application-review-design.md). Read it with every child plan. This overview is the execution order and shared contract, not an additional implementation task.

## Global Constraints

- Keep `npm run dev:all` and `npm run desktop:dev`.
- Bind the API explicitly to `127.0.0.1`.
- The server reads the personal Jira token from `.env`.
- Save locally and Save to team are equally primary options for all approved supported fields, including planning.
- Local SQLite remains available with no company database configured.
- PostgreSQL is first; no ORM, MySQL adapter, new classes, or general multi-site dashboard.
- No application code, dependencies, hosted database, or external uploads are changed by writing these plans.
- Follow the repository's style; use existing helpers and Node tests. No generic catch-log-rethrow or unrelated cleanup.
- SonarQube is inaccessible on this Mac; local checks do not replace required company validation before merge.
- Do not expose credentials, overwrite user changes, change passing tests without a requirement, or claim tests ran when only specified here.

## Review Focus

These adversarial cases are assigned tests in the named plans rather than left implicit:

1. Same Jira key across saved entries (including the same hostname), including export while a switch is requested → Security S3; Data D1; Export E1.
2. Server commits a To Do but its response is lost → To Dos T2 retries the same client identity, not a second create.
3. Existing local and team notes disagree → Data D3 requires destination-specific approval and conflict checking.
4. Jira times out after accepting a write → Security S2 reports an uncertain write outcome with no automatic retry.
5. One export site fails and another contains formula-looking text → Export E1/E2 require explicit partial output and literal text.

## Plans and order

| Order | Plan | Deliverable | Dependencies |
| --- | --- | --- | --- |
| 1 | [Local security and site isolation](2026-10-14-local-security.md) | Restricted local API, environment-only token, safe requests and site switching, scoped caches, Electron controls | None |
| 2 | [Personal To Dos](2026-10-14-personal-todos.md) | Separate local store, durable migration markers, reliable autosave across navigation | Security S3 context boundary |
| 3 | [Team data and imports](2026-10-14-team-data-imports.md) | Optional PostgreSQL, complete metadata contract, editable approved imports, equal save choices | Security S1–S3; `pg` approval |
| 4 | [Workbook export](2026-10-14-workbook-export.md) | Saved-entry source-aware previews, latest Jira comment only, separate local/Team notes; one Excel sheet per saved entry | Security S2/S3, Data D1/D2; `exceljs` approval |
| 5 | [Cleanup and validation](2026-10-14-cleanup-validation.md) | Installer removal, safe image replacement, search fix, verified dead-code cleanup, PR checks | Final integration follows 1–4; C1–C3 may be done earlier |

S1–S3 precede cross-site data work. Keep work sequential when touching shared files (`jiraProxy.mjs`, `jiraClient.js`, schema, README, package manifests). Do not run agents concurrently on these files. Prefer a focused commit per task and a review before dependent work.

## Required dependency approvals

| Proposed package | Use | Gate |
| --- | --- | --- |
| `pg` | PostgreSQL connection pool, parameterized statements, explicit transactions | Approved and installed: 8.23.1; compatibility and audit evidence recorded in D1 and final handoff |
| `exceljs` | Generate and read back actual `.xlsx` workbooks with per-site sheets | Approved ExcelJS 4.4.0 and scoped exceljs -> uuid 11.1.1 override; E2 verifies resolution, compatibility, audit and readback |

The user approved these exact npm libraries before their installation. Both projects publish MIT licenses; this is not company license clearance. No other dependency was added for cleanup.

Primary references consulted for plan decisions: [node-postgres transactions](https://node-postgres.com/features/transactions), [TLS configuration](https://node-postgres.com/features/ssl), [node-postgres license](https://github.com/brianc/node-postgres/blob/master/LICENSE), [ExcelJS documentation](https://github.com/exceljs/exceljs#readme), and [ExcelJS license](https://github.com/exceljs/exceljs/blob/master/LICENSE). Documentation establishes feature fit. The user subsequently approved pg 8.23.1 (D1 installed) and ExcelJS 4.4.0 with the scoped uuid 11.1.1 override for E2; actual current audit/compatibility evidence remains part of each implementation task.

## Shared contracts

- `SiteContext = { instanceId: string|null, siteHost: string, baseUrl: string, generation: string }`. Credential/database-bearing server context is private and must never be serialized.
- `X-Docket-Site` holds the instance ID or `legacy`; `X-Docket-Generation` is the server-issued generation. Missing/stale context on scoped API requests returns `409 SITE_CONTEXT_CHANGED`; health, instance registry/bootstrap, independent To Dos, and explicit export routes have their documented separate rules.
- Metadata public names retain `note`, `priority`, `startDate`, `completeDate`, `hasOpenDecision`, `plannedStart`, `plannedFinish`, `pmOverride`, `requestor`, `openDecisionNote`, `pinnedGantt`, `keepNoteImages`; add `followUp: 'now'|'next'|null`. Image storage flags are never shared or exported as an image payload. Import supports only the field subset listed in D2.
- `MetadataPatch` is a partial object: an absent property means preserve, never reset. `followUp:null` explicitly clears. Dates remain `YYYY-MM-DD` strings; no timezone conversions of date-only values.
- Shared identity is `(siteHost, issueKey)`, not local instance ID. Local identity remains the saved-entry-specific SQLite database plus key. Export sheets/exclusions preserve instanceId even for entries sharing the same host/key.
- Local and team writes are separate transactions. No automatic fallback, implicit synchronization, or distributed transaction.
- `getLocalMetadata(db, issueKeys) -> Record<issueKey, Metadata>` belongs to D2 and is reused by imports and export. `getTeamMetadata({siteHost, issueKeys}) -> Promise<Record<issueKey, Metadata>>` belongs to D1.

- Export rows retain selected-source `note` for D2 compatibility but display explicit `localNote`, `localNoteStatus`, `teamNote`, `latestJiraComment:{text,author,createdAt}|null` and `jiraCommentStatus`. Only one latest-created comment is requested, after filters. Team mode adds a separately labeled local note without using it to fill selected Team metadata. See [binding export contracts](2026-10-14-workbook-export.md#binding-export-contracts-2026-10-14-final-clarification) for deadlines, failed provisional search results, selected registry leases, storage limits and E2/E3 handoff.

## Preparation and finish gates

- [x] Plan review, execution method and exact dependency approvals were obtained; execution used the isolated worktree and preserved unrelated user files.
- [x] Fresh synthetic baselines and final checks were recorded. The final unit run has 586 passes and 10 explicitly skipped SQL cases; the separate database run has 72 passes and zero skips.
- [x] Focused task implementation, regression reproduction, checks and commits are recorded in the handoff. SonarQube remains unavailable; Ruff was not substituted for JavaScript.
- [x] Final local commands exited zero; dedicated PostgreSQL integration passed all 72 cases with zero skips. Initial failures and their corrections remain documented separately.
- [ ] Before merge, obtain company SonarQube with no new Major/Critical findings and execute the configured PostgreSQL 16 CI. Local PostgreSQL 14.1, browser/Electron smoke and actual workbook inspection are recorded in the handoff; native browser file-save completion remains a manual check. No merge, deployment, provisioning or SharePoint upload is authorized.

## Plan self-review

Coverage: findings 1/2/4/5/13/14/15 → S1–S4; 8/9/10 and standalone-history requirement → T1–T2; 6/7 and Now/Next → D1–D3; multi-site workbook requirement → E1–E3; 3/11/12/16/17/18/19/20/21 → C1–C4. Large-file splitting is restricted to the named import/export components and state logic needed by these tasks. All five Review Focus cases have named tests. Scope, interface names, field names, equal save choices, dependency gates, and company-only verification were checked against the specification.
