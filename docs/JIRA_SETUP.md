# Jira Setup

The Express proxy (`server/jiraProxy.mjs`) reads server-side credentials and authenticates Jira REST calls. The browser calls the proxy without receiving the Jira API token. Chat and report generation send selected context to the configured AI provider.


**Setup pages**

| Page | Covers |
|---|---|
| This page | API token, `.env`, install, verify, presets, date fields, past-due rules, optional team database |
| [Multiple Jira sites and local data](./setup/multiple-sites.md) | Legacy vs numbered sites, Combined Open Work, SQLite files and recovery |
| [Chat, reports and AI providers](./setup/chat-and-ai.md) | Provider variables, Managed vs Local, Rovo, Databricks, OpenAI-compatible |
| [Ports and running locally](./setup/running-locally.md) | Ports, desktop development, browser vs desktop |

---

## 1. Create a Jira API token

1. Go to [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **Create API token**, give it a name (e.g. "Task Manager"), copy the token

---

## 2. Configure `.env`

**macOS / Linux (Terminal):**
```bash
cp .env.example .env
```

**Windows (PowerShell, from the project folder):**
```powershell
Copy-Item .env.example .env
```

**Windows (CMD):**
```cmd
copy .env.example .env
```

Open `.env` in any text editor and fill in the values below. Use the `.env` in the project copy you launch: the API loads it beside that copy's `package.json`. Separate Git worktrees do not share this file. Stop and restart the running API after edits; switching branches or opening another project folder does not restart an existing server.

| Variable | Example | Notes |
|----------|---------|-------|
| `JIRA_BASE_URL` | `https://yourcompany.atlassian.net` | No trailing slash |
| `JIRA_EMAIL` | `you@yourcompany.com` | Atlassian account email |
| `JIRA_API_TOKEN` | `ATATTxxx...` | From step 1 |
| `API_PORT` | `8787` | Optional; default is `8787` |
| `LOG_LEVEL` | `info` | Optional; controls server log verbosity — `error`, `warn`, `info` (default), or `debug` |
| `DOCKET_OPEN_WORK_MAX_ROWS_PER_SITE` | `5000` | Optional; max rows collected per saved site for Combined Open Work (default and cap 5000) |
| `DOCKET_OPEN_WORK_TIMEOUT_MS` | `120000` | Optional; Combined Open Work collection deadline in ms (cap 600000). Invalid values use the default |

### Optional team database (PostgreSQL)

Local work does not require a company database. **Settings → Team data → Use team DB** defaults to off even if a URL is configured. The switch is app-wide, persisted across site changes and server restarts.

1. Have the database owner provide an approved PostgreSQL database and credentials. Set server-only `TEAM_PRIORITY_DATABASE_URL` with an explicit user, hostname, and database. If required, set `TEAM_PRIORITY_DATABASE_CA_FILE` to an absolute PEM trust-file path.
2. Export that environment for the migration command, then run `npm run team-db:migrate`. The migration CLI does **not** load `.env`; the API does load its normal project `.env`. Migrations are explicit and do not run at API startup.
3. Restart the API using your normal browser or desktop workflow after changing its environment.
4. Open **Settings → Team data**, select **Use team DB**, and click **Refresh status**. Confirm **Connected to the team database.** before Team saves, imports, or exports.

Remote PostgreSQL requires verified TLS; optional CA and URL restrictions, backup guidance, and explicit old-demo import steps are in [Team database guide](TEAM_DATABASE.md). Do not place database credentials in browser settings or commit them.

What each Team data state looks like, and what the warning messages mean, is in the [user guide](user/getting-started.md#optional-team-database).

## 3. Install and start

**Prerequisites:** Node **22** (see `.nvmrc`). On Windows, install from [nodejs.org](https://nodejs.org/) or use `nvm-windows` / `fnm` — match major version 22.

```bash
npm install
```

`npm install` rebuilds `better-sqlite3` for Node. Browser API startup also rebuilds for Node; desktop startup uses the existing Electron rebuild. Stop the running workflow before switching between browser and desktop mode.

**Browser mode (Vite + proxy)** — macOS, Windows, or Linux:
```bash
npm run dev:all
# → UI at http://localhost:5173
# → API at http://localhost:8787
```

**Desktop dev (Vite + Electron)** — macOS or Windows:
```bash
npm run desktop:dev
```

Some corporate secure laptops may block Electron windows or local desktop app execution. If this option is unavailable, run browser mode with `npm run dev:all`, then set the browser UI up as its own desktop-style app window from Chrome or Edge; see [END_USER_GUIDE.md](user/getting-started.md#install-as-its-own-application-window).

If `better-sqlite3` still fails after `npm install`:
```bash
npm run desktop:rebuild-native
```

---

## 4. Verify the connection

Inside the app: **Settings → Test Jira Connection**

Or directly in a browser: `http://localhost:8787/api/health`

A successful response looks like:
```json
{
  "ok": true,
  "jiraBaseUrl": "https://yourcompany.atlassian.net",
  "jiraInstanceId": null,
  "jiraInstanceName": "",
  "legacyMode": true
}
```

With a registered active site, `legacyMode` is `false`, `jiraInstanceId` is set, and `jiraInstanceName` matches **Settings → Jira sites**.

---

## 5. Set up presets (required for Metrics + Chat)

**Pilot shortcut:** after `npm install` and a first API start, seed shared presets:

```bash
npm run seed:presets -- --all
```

The [preset catalog](../presets/pilot-presets.json) supplies the entries; see the [seeding script](../scripts/seed-epic-presets.mjs) for selection options.

**Manual setup:**

1. Settings → **Epic & JQL presets** → Add preset
2. For each project you want to track, add either:
   - **Epic preset**: epic key (e.g. `PROJ-1234`) + a label
   - **JQL preset**: a saved JQL query + a label

These presets appear in the Metrics filter panel, the Task Management **Create Issue** modal (epic presets and saved queries — JQL presets can resolve parents from query results when no single epic key is embedded), and the Chat context panel.

---

## 6. Map Jira date fields (required for deadline tracking)

The app needs to know which Jira custom fields hold your deadline dates.

1. Settings → **Jira field mapping** → **Refresh from Jira**
2. This auto-populates field IDs from your Jira instance
3. Map the four roles to the correct Jira fields:
   - **Initial Done Date** → your "Automation Done Date" or equivalent
   - **Most Recent Done Date** → updated on each deadline revision
   - **Due date** → standard Jira due date field
   - **Project End Date** → project-level end date

4. Click **Save field mappings**

> Your Jira project may use `customfield_10008` (Initial Done Date) and `customfield_10009` (Most Recent Done Date). These are pre-mapped in `server/lib/jiraSearchFields.mjs` as fallbacks.

---

## 7. Configure past due rules

Settings → **Past due rules** → choose which date field triggers the "Past Due" badge on epic cards:

| Option | Meaning |
|--------|---------|
| Either (default) | Past due if **Most Recent Done Date**, **Initial Done Date**, or **Project End Date** has passed (open epic) |
| Most Recent Done Date | Only that Automated Done Date field triggers past due |
| Project End Date | Only that field triggers past due |

Open **tasks/stories** in overdue metrics also count when standard **Due date**, **Most Recent Done Date**, or **Initial Done Date** on the issue itself is before today. Epic-level Automated Done Date fields (`customfield_10008` / `customfield_10009`) are the primary deadlines for your Jira project's epics.

---
