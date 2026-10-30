# Optional shared team data (PostgreSQL)

[← README](../README.md)

Local SQLite works without a team database. **Settings → Team data → Use team DB** defaults to off, even when a database URL is configured. This preference is saved app-wide across Jira sites and server restarts. To enable shared data, have the database owner provide an approved PostgreSQL database and set server-only `TEAM_PRIORITY_DATABASE_URL` (explicit user, hostname and database). Optionally set `TEAM_PRIORITY_DATABASE_CA_FILE` to an absolute PEM trust-file path. Keep credentials out of browser settings, source control and exported files.

Remote connections always verify TLS against the system trust roots or the supplied CA. Remove SSL options from the URL when providing a CA; conflicting URL options are rejected. URLs may contain only `sslmode=verify-full`, or `sslmode=disable` for explicit loopback development/test hosts. TLS-free access is allowed only for `localhost`, `127.0.0.1` or `::1` outside production. Production requires verified TLS even on loopback. The pool opens lazily, has at most five connections, a five-second connect timeout and a thirty-second statement timeout.

With that server environment exported, run:

```sh
npm run team-db:migrate
npm run dev:all
```

The migration CLI reads the exported environment; it does not read `.env`. The API also supports its normal server `.env`. Migrations run only when explicitly requested. Version records in `team_schema_versions` and a transaction-level migration lock make repeated/concurrent runs safe. A failed migration rolls back; correct the reported setup problem and rerun. Before an upgrade, use your approved database backup process; restore that backup into a separate database for recovery. Do not edit an applied migration or drop shared tables as a recovery shortcut.

After configuring the server and running migrations, restart the API, open **Settings → Team data**, select **Use team DB**, and click **Refresh status** to confirm the connection. Configuration alone does not enable Team access.

The warning **Team data not configured — set TEAM_PRIORITY_DATABASE_URL** appears only after a successful status check says Team is enabled and unconfigured. Off, loading, failed checks, and configured-but-disconnected states have separate messages. Turning Team off preserves local work and Team drafts; explicit Team imports, exports, and saves remain Team actions and are blocked rather than redirected to Local. Already dispatched work may finish. Other open browser tabs may need a refresh.

Settings → **Team data** shows enabled/configured/connected status. An absent schema is unavailable with `npm run team-db:migrate` guidance, rather than an empty shared-data result. Individual priority/date edits and explicit priority push/pull remain available. Settings → **Import metadata** opens an editable CSV preview: fix values, exclude rows, add/remove supported columns, and review old/new values before **Approve changes**. **Save locally** and **Save to team** are equally primary choices for priority, note, Now/Next, requestor, planned start/finish, actual start and decision note. Team saving requires an enabled, configured, connected database and never falls back to local saving. Changing the destination reads that destination's values and requires fresh approval. Existing notes are protected unless replacement is checked for that row. Empty CSV cells preserve saved values; clearing an edited field is explicit. Importing never changes Jira or note images. Re-run your task query after saving.

`POST /api/jira/issue-metadata/import/preview` accepts `{destination:'local'|'team',csvText?,rows?,supersedesPreviewId?}` with exactly one input. Edited rows are `{rowId,issueKey,selected,patch,replaceNote}`. Responses contain `previewId,siteContext,destination,rows,diff,errors,ignoredHeaders,expiresAt`; diff includes supported saved values and approved old/new changes. `supersedesPreviewId` replaces only an uncommitted, unexpired preview bound to the same accepted site context; invalid replacement retains the old preview. Five live previews can wait for at most 15 minutes. Approval alone writes nothing; `POST /api/jira/issue-metadata/import/commit` accepts only the reviewed `previewId` for saving. Authoritative patches/expected values remain private on the server. Conflicts reject the whole batch and require a new preview; site switching or API restart also requires re-review. Up to five successful results are retained separately for 60 seconds for duplicate-submit confirmation. A network failure has an unknown outcome: retry the same save before starting another destination. The obsolete `/api/jira/issue-metadata/import` and `/api/team-priority/import-csv` mutation endpoints return 409 `IMPORT_PREVIEW_REQUIRED` with Settings guidance. Full team reads remain at `POST /api/team-priority/metadata/bulk`.

Shared identity is the accepted server Jira hostname plus issue key. The browser never selects a hostname through a payload. Priority zero clears only priority. Clearing date tracking clears start/complete/planned dates and PM override, preserving notes, follow-up, requestor, open-decision information, pin and priority. SQL DATE values cross the store boundary as `YYYY-MM-DD` strings or null; legacy date reads retain empty-string clears. Note images and local image paths are not stored in team rows. Compatibility date reads include only explicitly shared tracking records, so shared priority alone does not override personal planning inheritance. Explicit false/empty tracking writes retain shared presence. Deliberate date-tracking deletion removes that presence when requestor/open-decision note are empty and the decision flag is false; retained requestor/decision data keeps it. The internal marker is not returned as metadata. Older consolidated false-only/cleared rows lack recoverable provenance: the migration backfills meaningful nondefaults only, and intentionally shared empty records need manual re-saving. Shared programs retain source-qualified epic roots and are returned only for the accepted site; there are no built-in seed programs.

### Explicit migration of old demo exports

There is no automatic MongoDB/Atlas connection or startup migration. Preserve the original JSON exports unchanged. Prepare a separate annotated JSON copy containing the old collection arrays below, with a `source` identifier on every issue row. Old issue keys alone do not establish a Jira site. Convert each program epic string into an explicit `{ "source": "old-demo-a", "issueKey": "ABC-1" }` reference using verified source knowledge; do not guess. Supply a separate source-to-canonical-hostname mapping file. Missing or unknown source mappings and unknown collections fail before a transaction opens.

`annotated-demo.json` (synthetic example):

```json
{
  "team_issue_priorities": [
    { "_id": "ABC-1", "source": "old-demo-a", "priority": 4 }
  ],
  "team_issue_dates": [
    { "_id": "ABC-1", "source": "old-demo-a", "startDate": "2026-10-01", "plannedFinish": "2026-10-05", "requestor": "Synthetic requestor" }
  ],
  "shared_programs": [
    { "slug": "synthetic", "displayName": "Synthetic", "enabled": true,
      "epicRoots": [{ "source": "old-demo-a", "issueKey": "ABC-1" }] }
  ]
}
```

`site-map.json`:

```json
{ "old-demo-a": "jira.example.test" }
```

```sh
npm run team-db:import-demo -- annotated-demo.json site-map.json
```

Issue records accept `_id` or `issueKey`. Date records preserve the existing `startDate`, `completeDate`, `hasOpenDecision`, `plannedStart`, `plannedFinish`, `pmOverride`, `requestor`, and `openDecisionNote` fields. Export-only IDs/audit fields are not imported; writes are attributed to `explicit-demo-migration`. Program display/enabled settings are upserted and explicitly mapped roots are merged. All collections commit together or roll back together, and input files are read only. Repeating the same import does not duplicate program roots. Review the annotated copy and mapping before running; this explicit command writes team data immediately.

### Team database validation

```sh
node --test tests/teamPriorityPostgres.test.mjs tests/teamPriorityRoutes.test.mjs
DOCKET_TEST_DATABASE_URL=postgresql://docket_test@127.0.0.1:55432/docket_test_application_review node --test tests/teamPriorityPostgres.test.mjs tests/teamPriorityRoutes.test.mjs
```

The first command skips SQL integration cases. The second requires your own disposable `docket_test_*` database, explicit loopback host/port and PostgreSQL server; it must never target a company or personal database. Tests verify real SQL site isolation, fields, clears, conflicts, migrations and rollback. CI's PostgreSQL 16 job must set the URL and reject skipped integration cases. Local PostgreSQL 14.1 fixture evidence does not establish production/CI compatibility. Company SonarQube remains a required pre-merge gate; no Ruff substitution applies to this JavaScript code.
