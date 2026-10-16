# Team database setting and recovery notice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Team functionality explicitly optional and let users dismiss the preserved legacy-browser-data notice.

**Architecture:** Reuse existing Team routes/store, app-wide instances metadata SQLite settings and existing client/component patterns. Persist the Team opt-in across all saved Jira sites, independently of the selected site; enforce it on server data access as well as in UI. Add dismissal to the existing site-context notice without deleting or migrating old records.

**Tech Stack:** Existing React 18, Express, SQLite, PostgreSQL driver, Node 22; no added dependencies.

**Spec:** Approved chat walkthrough and user reply “control team functionality”; exact behavior below. Controller implementation calls: app-wide local preference default off; persistent browser-only notice acknowledgement; existing global instances metadata table stores opt-in rather than new schema or per-site ownership.

## Global Constraints

- Settings label: `Use team DB`.
- Missing-configuration text exactly: `Team data not configured — set TEAM_PRIORITY_DATABASE_URL`.
- Display that warning only when explicitly enabled and configuration is absent. Do not mistake loading/failed health for missing configuration.
- Off means no new Team database reads/saves through ordinary tasks, Combined Work, reports, imports, exports, shared programs or sync. Local/Jira operations remain usable; don't silently redirect an explicit Team save into Local.
- On means existing Team behavior with configuration/connectivity checks. Configured connection failures remain separate from missing configuration.
- Toggle saves persist across navigation/restart/site changes. Preserve all Team/Local records; pending/failed drafts must not be discarded by toggling. Operations already dispatched cannot be undone; prevent subsequent Team steps after disable and do not report cancelled work as saved.
- Shared-program rows while disabled must not keep Team ownership or show Team values as Local; use existing Local values. Team-specific controls disabled/hidden while off, stale explicit writes rejected.
- Notice Dismiss persists in that browser, hides the banner immediately and after reload, and neither deletes legacy storage nor claims/imports its data into any site. Do not clear browser storage. If storage is unavailable, at least allow session dismissal without silently deleting data.
- Preserve captured saved-site/revision context and active-generation guards. No live Jira/AI/company DB or .env access; synthetic tests only. Do not change unrelated files or add dependencies/classes.
- User requests minimal readable reused code, focused behavioral tests and changed-file/line inventory. Sonar upload was blocked previously by automatic approval review; do not retry upload/bypass. Identify whether an approved local scanner exists, report unavailable if not; Ruff is not a substitute for JS.

## Review Focus

1. An existing shared-program preset and stale cached Team values after disabling: Local editing remains Local, no hidden Team call.
2. Concurrent/in-flight Team UI operations when toggled off: don't erase drafts or show success for blocked saves; stale subsequent calls cannot bypass preference.
3. Explicit Team import/export or saved-source calls bypassing visible controls: server denies Team access, Local source still works.
4. Loading/error health states and a configured but disconnected DB: only actual enabled+unconfigured shows the exact configuration warning.
5. Browser legacy data/notice across reload/site changes: dismissal retained without dropping original data; sites still isolated.

### Task 1: Deliver the setting, server enforcement, and persistent notice dismissal

**Files (extend existing owners; add only focused behavioral tests):**
- Server: `server/lib/teamPriorityPostgres.mjs`, `server/routes/teamPriorityRoutes.mjs`, `server/jiraProxy.mjs`; reuse `jira_instance_meta` via existing `metaDb` for `use_team_db`. Extend other existing server callers only where necessary to enforce explicit Team import/export or prevent optional reads.
- Client: `src/services/jiraClient.js`; existing `src/Pages/Settings/components/TeamPriorityDemoSection.jsx`, `TeamPriorityImportSection.jsx`, `IssueImportPreview.jsx`; `src/Pages/components/TaskExportModal.jsx`; existing hook/workflow/report/table owners as needed for consistent enabled state and Local ownership.
- Notice: `src/utils/siteContextStore.js`, `src/AppRouter.jsx`.
- Tests: existing `tests/siteContextStore.test.mjs`, `tests/teamPriorityRoutes.test.mjs`, `tests/teamPriorityPostgres.test.mjs`, combined/import/export tests as needed; may add focused `tests/teamDbSetting.test.mjs`.
- Docs: this plan and focused handoff documenting behavior, changed files/lines, tests and limits.

**Interfaces:**
- Add server GET/PUT `/api/team-priority/settings` using existing local origin/session/site guards. Body `{enabled:boolean}` (reject nonboolean); response `{enabled:boolean}`. Reuse `jira_instance_meta` key `use_team_db` with `true`/`false` strings; absence off. No environment mutation or secret fields in UI/response.
- Existing Team health includes `enabled` in addition to actual `configured` and `connected`; when disabled do not connect. Preserve other endpoint shapes and context headers. Block writes with explicit disabled error code and no unconfigured warning while off.
- Existing client exports: add `saveTeamPrioritySettings({enabled})` and use health for reading initial preference. Sync preference changes to relevant mounted consumers using existing patterns; no general settings framework.
- Dismiss existing notice via an exported store action, persist a dedicated acknowledgement key distinct from site data, notify existing subscribers; readSiteStorage continues to refuse ambiguous legacy fallback.

- [ ] Write regressions for default off/persisted on/off, settings validation, disabled direct writes/reads including import/export, and health differentiation; run to observe expected missing-feature failures.
- [ ] Implement minimal persistent opt-in and common store guard in existing modules. Keep CLI database migration tools usable intentionally; don't make tests silently opt in by default just to keep green. Regression fixtures may explicitly enable existing Team behavior where required.
- [ ] Write UI/client behavior tests for toggle/warning, Local independence, stale Team state/program ownership and report/import/export gates; observe expected failures, then integrate existing consumers. No generic catch masking unknown metadata failures.
- [ ] Write notice dismissal/preservation/reload regression, observe fail, then implement store and accessible Dismiss control.
- [ ] Run focused changed tests, full `npm test`, `npm run build`, `git diff --check` using Node22 in this isolated checkout. Inspect scanner availability without external upload; report limitation accurately.
- [ ] Commit focused implementation and handoff. Report reviewable result, tests, exact changed files/lines and any remaining gaps. Do not push or merge.
