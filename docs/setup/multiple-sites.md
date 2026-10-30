# Multiple Jira sites and local data

[← Jira setup](../JIRA_SETUP.md)

## Single site (legacy) vs multiple sites

| Setup | Registry | Local SQLite | Jira credentials |
|-------|----------|--------------|------------------|
| **Legacy** — only `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` | Empty | `data/workweek.sqlite` (unchanged for existing installs) | Read from `.env` |
| **Env seed** — at least one `JIRA_INSTANCE_N_BASE_URL` (+ matching `_EMAIL`, optional `_NAME`) for N=1…5 | Populated at API startup | `data/workweek-<instanceId>.sqlite` per registered site | Saved URL/email plus shared `JIRA_API_TOKEN` |
| **Settings** — add/edit sites in the app | Populated in UI | Per-site files as above | Saved URL/email plus shared `JIRA_API_TOKEN` |

Startup **does not** create registry rows from bare legacy `JIRA_*` alone. Use legacy mode for one site with your existing database, or set explicit `JIRA_INSTANCE_N_*` vars (or **Settings → Jira sites**) to use the instance registry.

When the registry has at least one row, the active site's saved URL and email are used for Jira proxy calls. `JIRA_BASE_URL` and `JIRA_EMAIL` are used only when the registry is empty. Every site uses the single server-side `JIRA_API_TOKEN`; numbered `JIRA_INSTANCE_N_API_TOKEN` values and previously saved tokens are not used for requests.

Optional env vars (see `.env.example`):

| Variable pattern | Notes |
|------------------|-------|
| `JIRA_INSTANCE_N_NAME` | Display name (N = 1…5) |
| `JIRA_INSTANCE_N_BASE_URL` | No trailing slash; **any** set `N` triggers startup seeding when the registry is empty |
| `JIRA_INSTANCE_N_EMAIL` | Atlassian account email |

Hard cap: **5** sites total. Settings stores site URLs and emails, not new API tokens. Keep `JIRA_API_TOKEN` in the server environment; list/get instance APIs never return tokens.

**In the app:** **Settings → Jira sites** — add, edit, remove, **Set active**, and **Test connection** (modal). **Header → Site** dropdown switches the active site when two or more are registered; site-scoped pages reload their data so presets, notes, and metrics match that saved entry. With only legacy `.env` credentials, the header shows **Jira** (link/tooltip points you to Settings to add more sites).

## Combined Open Work setup

Combined Open Work reads every enabled saved Jira entry, including when you normally use only one site. Add and test entries in **Settings → Jira sites**; how to load, edit and report on the combined view is in the [user guide](../user/combined-work.md). The two `DOCKET_OPEN_WORK_*` variables above bound its size and run time; reaching a bound marks returned rows partial.

## Local data and recovery

Saved-entry notes, presets, and ordinary archives use `data/workweek-<instanceId>.sqlite`; legacy single-site data uses `data/workweek.sqlite`. The registry and Team preference use `data/instances-meta.sqlite`, personal To Dos use `data/personal-todos.sqlite`, and Combined Work goals/archive use `data/docket-combined.sqlite`. Keep those distinct stores when planning a backup; the [developer guide](../dev/data-and-storage.md#local-stores-and-request-context) describes their scope.

If an **Older browser data has an unknown Jira site** notice appears, nothing is lost: see [what Dismiss does](../user/getting-started.md#older-browser-data-notice). Do not infer record ownership from an issue key alone.

---

[← Jira setup](../JIRA_SETUP.md)
