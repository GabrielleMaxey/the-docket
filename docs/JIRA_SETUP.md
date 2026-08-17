# Jira Setup

Credentials never leave this machine. The Express proxy (`server/jiraProxy.mjs`) handles all Jira REST calls; the browser only talks to the proxy.

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

Open `.env` in any text editor and fill in:

| Variable | Example | Notes |
|----------|---------|-------|
| `JIRA_BASE_URL` | `https://yourcompany.atlassian.net` | No trailing slash |
| `JIRA_EMAIL` | `you@yourcompany.com` | Atlassian account email |
| `JIRA_API_TOKEN` | `ATATTxxx...` | From step 1 |
| `API_PORT` | `8787` | Optional; default is `8787` |
| `LOG_LEVEL` | `info` | Optional; controls server log verbosity — `error`, `warn`, `info` (default), or `debug` |

### Chat & AI (explicit opt-in)

| Variable | Example | Notes |
|----------|---------|-------|
| `CHAT_PROVIDER` | `anthropic` | **Required** to enable chat. Use `openai`, `ollama`, `rovo`, or `disabled`. Unset = chat off |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Required when `CHAT_PROVIDER=anthropic` |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Optional model override |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Optional; custom Anthropic-compatible API host |
| `OPENAI_API_KEY` | `sk-...` | When `CHAT_PROVIDER=openai` or `REPORT_PROVIDER=openai` |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible endpoints (Databricks, Azure, LiteLLM, vLLM) |
| `OPENAI_MODEL` | `gpt-4o-mini` | Optional OpenAI / compatible model name |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | When `CHAT_PROVIDER=ollama` or `REPORT_PROVIDER=ollama` |
| `OLLAMA_MODEL` | `llama3.2` | Local model for chat (and reports if `OLLAMA_REPORT_MODEL` unset) |
| `OLLAMA_REPORT_MODEL` | `llama3.3:70b` | Optional larger local model for reports only |
| `REPORT_PROVIDER` | `openai` | Optional; reports use this provider instead of `CHAT_PROVIDER` |
| `REPORT_OPENAI_API_KEY` | | Optional report-only OpenAI key (falls back to `OPENAI_API_KEY`) |
| `REPORT_OPENAI_BASE_URL` | | Optional report-only OpenAI-compatible URL |
| `REPORT_OPENAI_MODEL` | | Optional report-only model name |
| `REPORT_ANTHROPIC_API_KEY` | | Optional report-only Anthropic key (falls back to `ANTHROPIC_API_KEY`) |
| `REPORT_ANTHROPIC_BASE_URL` | | Optional report-only Anthropic-compatible URL |
| `REPORT_ANTHROPIC_MODEL` | | Optional report-only Anthropic model |

Chat and reports use the same provider (`CHAT_PROVIDER`) unless you set `REPORT_PROVIDER`. All three built-in providers (`anthropic`, `openai`, `ollama`) can generate reports and week plans.

> **Never commit `.env`** — it is in `.gitignore`.

---

## 3. Install and start

**Prerequisites:** Node **22** (see `.nvmrc`). On Windows, install from [nodejs.org](https://nodejs.org/) or use `nvm-windows` / `fnm` — match major version 22.

```bash
npm install
```

`npm install` runs `electron-builder install-app-deps` after install so native modules match the bundled Electron version. For browser-only API dev, `predev:api` also rebuilds `better-sqlite3` for Node when needed.

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

Some corporate secure laptops may block Electron windows or local desktop app execution. If this option is unavailable, run browser mode with `npm run dev:all`, then set the browser UI up as its own desktop-style app window from Chrome or Edge; see [END_USER_GUIDE.md](./END_USER_GUIDE.md#install-as-its-own-application-window).

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
{ "ok": true, "jiraBaseUrl": "https://yourcompany.atlassian.net" }
```

---

## 5. Set up presets (required for Metrics + Chat)

**Pilot shortcut:** after `npm install` and a first API start, seed shared ODI presets:

```bash
npm run seed:presets -- --all
```

See [pilot-presets.md](./pilot-presets.md) for interactive selection and catalog editing.

**Manual setup:**

1. Settings → **Epic & JQL presets** → Add preset
2. For each project you want to track, add either:
   - **Epic preset**: epic key (e.g. `ODI-1234`) + a label
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

> The ODI project uses `customfield_10008` (Initial Done Date) and `customfield_10009` (Most Recent Done Date). These are pre-mapped in `server/lib/jiraSearchFields.mjs` as fallbacks.

---

## 7. Configure past due rules

Settings → **Past due rules** → choose which date field triggers the "Past Due" badge on epic cards:

| Option | Meaning |
|--------|---------|
| Either (default) | Past due if **Most Recent Done Date**, **Initial Done Date**, or **Project End Date** has passed (open epic) |
| Most Recent Done Date | Only that Automated Done Date field triggers past due |
| Project End Date | Only that field triggers past due |

Open **tasks/stories** in overdue metrics also count when standard **Due date**, **Most Recent Done Date**, or **Initial Done Date** on the issue itself is before today. Epic-level Automated Done Date fields (`customfield_10008` / `customfield_10009`) are the primary deadlines for ODI epics.

---

## 8. Chat, reports, and optional providers

**Setup:** set `CHAT_PROVIDER` and the matching credentials in `.env`. Chat is disabled until you do. Reports and week plans use the same provider unless you set `REPORT_PROVIDER`.

| Goal | `.env` setup |
|------|----------------|
| Anthropic (chat + reports) | `CHAT_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` |
| OpenAI (chat + reports) | `CHAT_PROVIDER=openai` + `OPENAI_API_KEY` |
| OpenAI-compatible (Databricks, Azure, LiteLLM, vLLM) | `CHAT_PROVIDER=openai` + `OPENAI_API_KEY` + `OPENAI_BASE_URL` + `OPENAI_MODEL` |
| Local Ollama (chat + reports) | `CHAT_PROVIDER=ollama` + `OLLAMA_BASE_URL` (+ optional `OLLAMA_REPORT_MODEL` for a larger report model) |
| Ollama chat + cloud reports | `CHAT_PROVIDER=ollama` + `REPORT_PROVIDER=openai` (+ report OpenAI vars; use `REPORT_OPENAI_*` if different from chat) |
| Turn chat off | `CHAT_PROVIDER=disabled` or leave unset |
| **Rovo (opt-in)** | `CHAT_PROVIDER=rovo` + OAuth vars below |

### Rovo opt-in (Atlassian)

Only use if your Jira Cloud org has Rovo MCP enabled.

1. Set `CHAT_PROVIDER=rovo` and the OAuth variables below.
2. Configure an OAuth 2.0 (3LO) app in the [Atlassian developer console](https://developer.atlassian.com/console/myapps/) with callback URL matching `CHAT_OAUTH_REDIRECT_URI`.
3. In Chat, click **Sign in with Atlassian** (or open `GET /api/chat/auth/start` in the browser). The proxy redirects to Atlassian with `prompt=consent` so scopes are granted explicitly.
4. After approval, Atlassian redirects to `GET /api/chat/auth/callback`; tokens are stored in SQLite (`chat_sessions`).
5. To switch accounts or refresh consent, use **Sign out** in Chat (`POST /api/chat/auth/signout`) and sign in again.

| Variable | Notes |
|----------|-------|
| `CHAT_PROVIDER` | `rovo` |
| `ATLASSIAN_OAUTH_CLIENT_ID` | From Atlassian developer console |
| `ATLASSIAN_OAUTH_CLIENT_SECRET` | OAuth client secret |
| `CHAT_OAUTH_REDIRECT_URI` | `http://localhost:8787/api/chat/auth/callback` (match port/host in production) |

**OAuth scopes** (requested by the proxy on sign-in):

`read:jira-work write:jira-work offline_access search:rovo:mcp read:me`

`offline_access` enables refresh tokens; `search:rovo:mcp` is required for Rovo MCP search.

**LLM fallback:** Chat is considered ready when you are signed in to Atlassian **or** when an LLM key is configured (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `OLLAMA_BASE_URL`). If Rovo MCP fails or you are not signed in, the proxy answers via the configured LLM and returns a `note` in the chat response (e.g. "Rovo MCP unavailable; answered via configured LLM fallback."). Configure at least one LLM key on the proxy host for reliable chat when Rovo is down.

### Chat session context

Each Chat message includes **session context** assembled in the browser and sent as part of `epicContext.sessionContext` on `POST /api/chat`:

| Included data | Source |
|---------------|--------|
| Task Management JQL summaries | `localStorage` (`workWeekTasksJiraLastJqlRuns`) — last Run JQL results |
| Metrics summary | `GET /api/dashboard/metrics` — refreshed when Chat loads and on each send |
| Generated artifacts | `localStorage` (`taskManagerChatSessionArtifacts`) — last 8 reports/plans |
| Past Reports archive | SQLite (`generated_reports`) — all auto-saved reports/plans plus Chat saves |

Artifacts are saved automatically when the user generates a Task Management project report, week plan, or Metrics audience report (also written to **Past Reports** in SQLite). Chat replies are **not** auto-archived — use **Save to Past Reports** on the assistant bubble. The proxy formats session context into the system prompt via `shared/chatSessionPrompt.mjs` so the model can answer questions like "what did my week plan say?" without re-running Jira searches.

Session context stays in the browser and SQLite (dashboard snapshot + archived reports); only the formatted prompt text is sent to your LLM provider (or Rovo) with each chat message.

### OpenAI-compatible providers

Most enterprise and self-hosted gateways expose an **OpenAI-compatible** `/chat/completions` API. Point the app at that URL — no code changes:

```env
CHAT_PROVIDER=openai
OPENAI_API_KEY=<your-token>
OPENAI_BASE_URL=https://<host>/.../v1
OPENAI_MODEL=<model-name>
```

Use the same pattern for **reports only** on a different endpoint:

```env
CHAT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
REPORT_PROVIDER=openai
REPORT_OPENAI_API_KEY=<databricks-token>
REPORT_OPENAI_BASE_URL=https://<workspace-host>/serving-endpoints/<endpoint>/invocations/v1
REPORT_OPENAI_MODEL=claude-sonnet-...
```

For Databricks, Azure, LiteLLM, vLLM, or similar gateways, confirm the endpoint supports chat completions, create a token with permission to call it, ensure the proxy machine can reach the URL, then set the OpenAI-compatible variables above and restart the API.

If your endpoint uses a different request format (not OpenAI chat completions or Anthropic messages), you would need a dedicated provider in `server/lib/llmClient.mjs`.

---

## Ports

| Service | Default port | Config |
|---------|-------------|--------|
| Vite dev server (UI) | `5173` | `vite.config.js` |
| Express proxy (API) | `8787` | `API_PORT` in `.env` |

If a port is already in use:

**macOS / Linux:**
```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
```

**Windows (PowerShell or CMD):**
```cmd
netstat -ano | findstr :8787
```

---

## Desktop app (packaged Electron)

The **Task Manager** desktop installer (macOS universal `.dmg` for Intel and Apple Silicon, or Windows NSIS) bundles the UI and starts the Express proxy automatically. No separate `npm run dev:all` step.

Availability depends on local device policy. Some corporate secure laptops may block unsigned Electron installers, local app execution, or the embedded proxy. If the package is unavailable or blocked, use browser mode and install the browser UI as its own desktop-style app window.

### First launch

On first run, the app creates a user data folder and a template `.env` file if one does not exist. Edit that file with your Jira credentials, then restart the app.

| OS | User data folder | Credentials file | SQLite database |
|----|------------------|------------------|-----------------|
| **macOS** | `~/Library/Application Support/Task Manager/` | `.env` in that folder | `data/workweek.sqlite` |
| **Windows** | `%APPDATA%\Task Manager\` | `.env` in that folder | `data\workweek.sqlite` |

The packaged app loads the UI from `http://127.0.0.1:8787` (same port as the proxy). Change `API_PORT` in `.env` only if you also update how the app connects (default `8787`).

### Building installers locally

```bash
npm run desktop:rebuild-native   # after npm install or Electron version change
npm run desktop:dist:mac       # macOS universal .dmg (Intel + Apple Silicon) → release/
npm run desktop:dist:win       # Windows NSIS → release/
```

GitHub Actions builds both platforms on tagged releases (see `DEVELOPER_GUIDE.md`).

---

## Browser vs desktop mode

| Mode | How the proxy URL is resolved |
|------|------------------------------|
| Desktop (packaged) | Proxy serves UI + API on `http://127.0.0.1:8787`; data in user data folder |
| Desktop (dev) | Vite at `localhost:5173`; proxy spawned by Electron; repo `data/` + `.env` |
| Browser dev (`dev:all`) | Vite proxies `/api/*` to `localhost:8787` via `vite.config.js` |
| Browser production | Set **App URL** in Settings → Past due rules to `http://localhost:8787` |

---

## Secrets in CI

For the GitHub Actions desktop packaging workflow, inject the same `.env` variables as repository secrets:
- `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
- `ANTHROPIC_API_KEY` (or the appropriate provider key)

These are injected at build time by the workflow and never stored in the repo.
