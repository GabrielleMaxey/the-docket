# Personal To Dos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve personal To Dos and completed history across Jira sites and prevent lost/duplicated automatic saves.

**Architecture:** One independent local SQLite file serves existing To Do endpoints. A persistent React provider above the site/route boundary owns drafts and pending work; a small plain-function save queue isolates race logic for Node tests.

**Tech Stack:** Existing SQLite, React context/hooks, Node tests. No new dependency.

**Spec:** [Approved design](../specs/2026-10-14-application-review-design.md); [shared contracts](2026-10-14-application-review.md). Depends on S3.

## Global Constraints

- Keep To Dos within The Docket and usable without an active Jira connection.
- They are personal local records, not part of the team priority database.
- Retain automatic saving; preserve completed history and existing deletion semantics.
- Do not deduplicate solely on equal text or reuse colliding numeric IDs from different databases.
- No generic state framework, new classes, or new dependencies; company SonarQube remains required before merge.

## Review Focus

1. Combined migration exceeds 15 active items → T1 preserves every item and blocks only new creates at the limit.
2. Legacy completed reminder lacks a date → T1 preserves unknown date and includes it in All time.
3. Create succeeds but response is lost → T2 repeats the same client ID and creates once.
4. A user deletes a draft during create → T2 removes the eventual server record rather than reviving the row.
5. Retry an old patch after changing another field → T2 sends merged current edits and does not overwrite newer state.

### Task T1: Independent database and one-time migration

**Files:** Create `server/db/todoDatabase.mjs`, `tests/todoMigration.test.mjs`, `tests/todoRoutes.test.mjs`; modify `server/jiraProxy.mjs`, `server/routes/todoRoutes.mjs`, `server/lib/jiraInstances.mjs`, `src/Pages/ReportArchive.jsx`, `README.md`.

**Interfaces:** `openTodoDatabase(dataDir) -> Database`; `migratePersonalTodos(todoDb, sources) -> {copied,alreadyMigrated,unresolved}` where a source is `{sourceId,dbPath}`. Database file is `personal-todos.sqlite` under existing `dbDir`. Register existing routes with `{getDb:()=>todoDb}`; never pass the changing site database. Keep public To Do fields and endpoints unchanged except client create identity in T2.

- [ ] Add synthetic databases for two sites, repeated source IDs, identical text, same numeric IDs, incomplete migration, 20 active items, and unknown completion dates. Assert after two migrations:
  ```js
  assert.equal(countTodos(destination), 20);
  assert.equal(secondRun.copied, 0);
  assert.equal(countCompletedWithUnknownDate(destination), 1);
  ```
  Fixture helpers stay local to the tests. Test that deleting every migrated item and re-reading does not recreate reminders.
- [ ] Run `node --test tests/todoMigration.test.mjs tests/todoRoutes.test.mjs`; confirm failures before implementing.
- [ ] Implement destination `todos` with current columns plus nullable unique `client_id`; add migration ledger `(source_id,source_table,source_record_id)` with a unique key and destination ID. Copy all records and ledger entries in one destination transaction; source databases are read-only. Enumerate registry sites plus legacy DB; preserve source IDs through registry removal. For legacy DBs copied into a site store, use existing seed provenance to avoid importing that entire copy twice; if lineage is ambiguous, report it rather than merging by text. Only migrate legacy `reminders` for sources that have not already converted them into todos; unknown correspondence is retained for recovery, not duplicated automatically.
- [ ] Open the personal DB before registering To Do routes, migrate at startup and when a newly registered source becomes available, and remove empty-list-triggered migration from GET. Keep ledger rows after To Do deletion. Preserve all migrated records above 15; new-create limit remains 15 active. Make `days=0` truly mean All time (do not convert zero to 90 through `||`); include date-unknown completed entries there without fabricated dates. Keep other historical report content site-scoped.
- [ ] Re-run tests, build, and manually check active/completed lists without Jira, across site deletion/switch, and after restart. Commit `fix: preserve personal todos independently of Jira sites`.

### Task T2: Serialized, retryable autosave

**Files:** Create `src/context/TodosContext.jsx`, `src/utils/todoSaveQueue.js`, `tests/todoSaveQueue.test.mjs`; modify `src/Pages/hooks/useTodos.js`, `src/AppRouter.jsx`, `src/Pages/WorkWeekTasks.jsx`, `src/services/jiraClient.js`, `server/routes/todoRoutes.mjs`, `src/Pages/components/TaskManagerHeaderPanel.jsx`, and `tests/todoRoutes.test.mjs`.

**Interfaces:** `createTodoSaveQueue({createTodo,updateTodo,deleteTodo,onSaved,onError}) -> {schedule(clientId,serverId,patch),flush(clientId),remove(clientId,serverId),retry(clientId)}`; no new class. `POST /api/todos` accepts `clientId` (UUID), returns the original record for a retried ID before enforcing capacity. Existing clients omitting it retain current compatibility until all call sites are updated. `TodosProvider` persists above route and site-generation boundaries; `useTodos()` retains its consumer-facing handlers.

- [ ] Write deferred-promise tests named `typing through create saves latest merged patch`, `retry after lost create response returns one record`, `delete during create removes returned record`, `navigation does not discard pending changes`, and `completion and delete cannot be overtaken by older saves`. Assert one create call while in flight, final text equals the latest input, both priority/text persist, and no recreated deleted row. Use Node fake timers where supported or injected timer functions only if needed by more than one test.
- [ ] Run `node --test tests/todoSaveQueue.test.mjs tests/todoRoutes.test.mjs` and observe failures.
- [ ] Implement a stable client UUID per draft, one create promise and ordered patch chain per item, merged pending fields, existing 500ms debounce, and explicit retry with current values. Store pending state in provider/queue, not effects or React state-updater side effects. On failed create preserve draft UUID. On failed update preserve patch. A matching clientId with inconsistent create identity must not overwrite the existing item; return original and let queued edits use PUT. No retry loop.
- [ ] Serialize completion, delete, and clear-completed against queued saves; delete during pending create waits for ID or retries that same identity before removal. Keep visible failure/retry status and do not immediately remove a row permanently after a failed delete. Preserve current sorting, placeholders, and limit UI. Explicit retry after ambiguous deletion treats a confirmed missing item as deleted.
- [ ] Run tests and build; manually type quickly, change priority/date, navigate to Past Reports and back, switch Jira sites, simulate a failed response, retry, and clear completed. Confirm no personal draft is cleared by the site subtree remount. Commit `fix: serialize todo autosave and preserve pending edits`.
