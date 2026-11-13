# Chat, reports and AI providers

[← Jira setup](../JIRA_SETUP.md)

## Chat & AI (explicit opt-in)

| Variable | Example | Notes |
|----------|---------|-------|
| `CHAT_PROVIDER` | `anthropic` | **Required** to enable chat. Use `openai`, `ollama`, `databricks`, `rovo`, or `disabled`. Unset = chat off |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Required when `CHAT_PROVIDER=anthropic` |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Optional model override |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Optional; custom Anthropic-compatible API host |
| `OPENAI_API_KEY` | `sk-...` | When `CHAT_PROVIDER=openai` or `REPORT_PROVIDER=openai` |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible endpoints (Azure, LiteLLM, vLLM) |
| `DATABRICKS_HOST` | `https://<workspace-host>` | When `CHAT_PROVIDER=databricks` or `REPORT_PROVIDER=databricks` |
| `DATABRICKS_TOKEN` | `dapi...` | Databricks personal access token with permission to query the serving endpoint |
| `DATABRICKS_ENDPOINT` | `<endpoint-name>` | Databricks serving endpoint name (sent as the chat `model`) |
| `REPORT_DATABRICKS_ENDPOINT` | | Optional report-only serving endpoint (falls back to `DATABRICKS_ENDPOINT`) |
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
| `ATTACHMENT_MAX_MB` | `250` | Optional per-file limit for Create Issue / Task Management attachments. Jira's own site limit still applies. |
| `LLM_TIMEOUT_MS` | `180000` | Optional request timeout for Anthropic / OpenAI / Managed AI calls |
| `OLLAMA_TIMEOUT_MS` | `600000` | Optional request timeout for Ollama calls |
| `AI_DRAFT_TIMEOUT_MS` | `120000` | Optional timeout for Create Issue **AI Draft** (any provider) |
| `MANAGED_AI_BASE_URL` | `https://<company-gateway>/v1` | Company OpenAI-compatible gateway (Managed / Company AI) |
| `MANAGED_AI_API_KEY` | | Token for the company gateway |
| `MANAGED_AI_MODEL` | | Pinned company model id |
| `AI_MODE` | `managed` or `local` | Optional host lock; overrides the Settings AI path choice |

Chat and reports use the same provider (`CHAT_PROVIDER`) unless you set `REPORT_PROVIDER`. All four built-in providers (`anthropic`, `openai`, `ollama`, `databricks`) can generate reports and week plans.

When **Managed / Company AI** is configured (`MANAGED_AI_BASE_URL`, `MANAGED_AI_API_KEY`, and `MANAGED_AI_MODEL` all set), it is the default for chat and reports. Users switch to Local only in **Settings → Chat assistant** when both paths are ready. The app does not silently fall back from Managed to Local on errors — a failed Managed call surfaces the error. `REPORT_PROVIDER` and `REPORT_*` credentials apply only while **Local** is the active path.

> **Never commit `.env`** — it is in `.gitignore`.


**Setup:** set `CHAT_PROVIDER` and the matching credentials in `.env`. Chat is disabled until you do. Reports and week plans use the same provider unless you set `REPORT_PROVIDER`.

## Managed vs Local (Company AI)

| Path | Config | Notes |
|------|--------|-------|
| **Managed (default when ready)** | `MANAGED_AI_BASE_URL` + `MANAGED_AI_API_KEY` + `MANAGED_AI_MODEL` | OpenAI-compatible company gateway; used for chat and reports |
| **Local** | `CHAT_PROVIDER` + matching provider vars | Full BYO stack: `anthropic`, `openai`, `ollama`, or `rovo` |
| **Host lock** | `AI_MODE=managed` or `AI_MODE=local` | Ops override; wins over the Settings preference |

When both Managed and Local are ready, the app defaults to **Company AI**. Switch to Local in **Settings → Chat assistant** only — Chat and report pages show status (e.g. “Using Company AI”) and link to Settings; they do not duplicate the switch. If a Managed call fails, the error is shown; the app does **not** silently retry on Local. `REPORT_PROVIDER` and `REPORT_*` vars are **Local-only** — ignored while Managed is the active path.

| Goal | `.env` setup |
|------|----------------|
| Anthropic (chat + reports) | `CHAT_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` |
| OpenAI (chat + reports) | `CHAT_PROVIDER=openai` + `OPENAI_API_KEY` |
| Databricks Model Serving | `CHAT_PROVIDER=databricks` + `DATABRICKS_HOST` + `DATABRICKS_TOKEN` + `DATABRICKS_ENDPOINT` |
| OpenAI-compatible (Azure, LiteLLM, vLLM) | `CHAT_PROVIDER=openai` + `OPENAI_API_KEY` + `OPENAI_BASE_URL` + `OPENAI_MODEL` |
| Local Ollama (chat + reports) | `CHAT_PROVIDER=ollama` + `OLLAMA_BASE_URL` (+ optional `OLLAMA_REPORT_MODEL` for a larger report model) |
| Ollama chat + cloud reports | `CHAT_PROVIDER=ollama` + `REPORT_PROVIDER=openai` (+ report OpenAI vars; use `REPORT_OPENAI_*` if different from chat) |
| Turn chat off | `CHAT_PROVIDER=disabled` or leave unset |
| **Rovo (opt-in)** | `CHAT_PROVIDER=rovo` + OAuth vars below |

## Rovo opt-in (Atlassian)

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
| `ROVO_REQUEST_TIMEOUT_MS` | Optional; Rovo MCP request deadline in ms, including the streamed response (default `30000`). Raise it for longer answers |

**OAuth scopes** (requested by the proxy on sign-in):

`read:jira-work write:jira-work offline_access search:rovo:mcp read:me`

`offline_access` enables refresh tokens; `search:rovo:mcp` is required for Rovo MCP search.

**LLM fallback:** Chat is considered ready when you are signed in to Atlassian **or** when an LLM key is configured (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DATABRICKS_TOKEN`, or `OLLAMA_BASE_URL`). If Rovo MCP fails or you are not signed in, the proxy answers via the configured LLM and returns a `note` in the chat response (e.g. "Rovo MCP unavailable; answered via configured LLM fallback."). Configure at least one LLM key on the proxy host for reliable chat when Rovo is down.

## Chat session context

Each Chat message includes **session context** assembled in the browser and sent as part of `epicContext.sessionContext` on `POST /api/chat`:

| Included data | Source |
|---------------|--------|
| Task Management JQL summaries | `localStorage` (`workWeekTasksJiraLastJqlRuns`) — last Run JQL results |
| Metrics summary | `GET /api/dashboard/metrics` — refreshed when Chat loads and on each send |
| Generated artifacts | `localStorage` (`taskManagerChatSessionArtifacts`) — last 8 reports/plans |
| Past Reports archive | SQLite (`generated_reports`) — all auto-saved reports/plans plus Chat saves |

Artifacts are saved automatically when the user generates a Task Management project report, week plan, or Metrics audience report (also written to **Past Reports** in SQLite). Chat replies are **not** auto-archived — use **Save to Past Reports** on the assistant bubble. The proxy formats session context into the system prompt via `shared/chatSessionPrompt.mjs` so the model can answer questions like "what did my week plan say?" without re-running Jira searches.

Session context stays in the browser and SQLite (dashboard snapshot + archived reports); only the formatted prompt text is sent to your LLM provider (or Rovo) with each chat message.

## Databricks Model Serving

Until a sign-in flow is available, each person connects with their **own personal access token**. This is an interim approach; OAuth (PKCE) sign-in is a planned future feature. Chat needs three values:

| Value | `.env` key | Where to find it | Placeholder |
|-------|-----------|------------------|-------------|
| Workspace address | `DATABRICKS_HOST` | Open the Databricks workspace in a browser and copy the address up to the end of the domain. Leave off the path and anything after `?`. | `https://<workspace-host>` |
| Model endpoint name | `DATABRICKS_ENDPOINT` | In the workspace sidebar open **Serving**, find the endpoint your team named, and copy its **Name** (not a display title). | `<serving-endpoint-name>` |
| Token | `DATABRICKS_TOKEN` | User settings > Developer > Access tokens > Generate new token (menu names can differ slightly between workspaces). | `<databricks-personal-access-token>` |

Get the real workspace address and endpoint name from your team (they are not published in this repository).

1. In Databricks, generate a token with a **364-day** lifetime and the comment **"The Docket"**. You must be assigned as a developer in Databricks; if token creation or the setup check fails with a permission error, ask your Databricks admin for that assignment.
2. In the project folder, run `npm run setup:databricks`. The command is the same in macOS Terminal, PowerShell, cmd and Git Bash. It asks for the workspace address, the token (hidden as you type) and the endpoint, checks them against Databricks, and only then updates `.env`, leaving your other lines alone. Git Bash may show the token as you paste it; the script prints a warning when that happens.
3. Restart the app (`npm run dev:all` or `npm run desktop:dev`).
4. Open **Settings > Chat assistant** and click **Test connection**.

Run the script again to change a value. To remove the token, delete the `DATABRICKS_TOKEN` line from `.env`.

`REPORT_DATABRICKS_ENDPOINT` is optional (a separate endpoint for reports); the script does not ask for it, so set it in `.env` by hand. Chat calls `<DATABRICKS_HOST>/ai-gateway/mlflow/v1/chat/completions` (set `DATABRICKS_API_PATH` to override the path) with the endpoint value as `model`. With the default gateway path, that value may be a gateway route name rather than the Name shown on the Serving page; the Test connection model check tells you which works. Pick an endpoint that supports tool calling (chat uses it for Jira search).

## OpenAI-compatible providers

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
REPORT_PROVIDER=databricks
DATABRICKS_HOST=https://<workspace-host>
DATABRICKS_TOKEN=<databricks-token>
DATABRICKS_ENDPOINT=<endpoint-name>
```

For Azure, LiteLLM, vLLM, or similar gateways, confirm the endpoint supports chat completions, create a token with permission to call it, ensure the proxy machine can reach the URL, then set the OpenAI-compatible variables above and restart the API.

If your endpoint uses a different request format (not OpenAI chat completions or Anthropic messages), you would need a dedicated provider in `server/lib/llmClient.mjs`.

---

[← Jira setup](../JIRA_SETUP.md)
