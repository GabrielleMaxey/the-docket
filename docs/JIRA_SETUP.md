# Jira Setup

Credentials never leave this machine. The Express proxy (`server/jiraProxy.mjs`) handles all Jira REST calls; the browser only talks to the proxy.

---

## 1. Create a Jira API token

1. Go to [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **Create API token**, give it a name (e.g. "Task Manager"), copy the token

---

## 2. Configure `.env`

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Example | Notes |
|----------|---------|-------|
| `JIRA_BASE_URL` | `https://lumen.atlassian.net` | No trailing slash |
| `JIRA_EMAIL` | `gabrielle.maxey@lumen.com` | Atlassian account email |
| `JIRA_API_TOKEN` | `ATATTxxx...` | From step 1 |
| `API_PORT` | `8787` | Optional; default is `8787` |
| `CHAT_PROVIDER` | `anthropic` | One of: `anthropic`, `openai`, `ollama` |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Required if `CHAT_PROVIDER=anthropic` |
| `OPENAI_API_KEY` | `sk-...` | Required if `CHAT_PROVIDER=openai` |

> **Never commit `.env`** — it is in `.gitignore`.

---

## 3. Install and start

```bash
npm install

# Browser mode (Vite + proxy)
npm run dev:all
# → UI at http://localhost:5173
# → API at http://localhost:8787

# Desktop mode (Vite + Electron)
npm run desktop:dev
```

If `better-sqlite3` fails to load (common after Node or Electron version changes):
```bash
npm run desktop:rebuild-native
```

---

## 4. Verify the connection

Inside the app: **Settings → Test Jira Connection**

Or directly in a browser: `http://localhost:8787/api/health`

A successful response looks like:
```json
{ "ok": true, "jiraBaseUrl": "https://lumen.atlassian.net" }
```

---

## 5. Set up presets (required for Dashboard + Chat)

1. Settings → **Epic & JQL presets** → Add preset
2. For each project you want to track, add either:
   - **Epic preset**: epic key (e.g. `ODI-1234`) + a label
   - **JQL preset**: a saved JQL query + a label

These presets appear in the Dashboard filter panel, the Work Week Create Issue modal, and the Chat context panel.

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
| Either (default) | Past due if Most Recent Done Date **or** Project End Date has passed |
| Most Recent Done Date | Only that field triggers past due |
| Project End Date | Only that field triggers past due |

---

## Ports

| Service | Default port | Config |
|---------|-------------|--------|
| Vite dev server (UI) | `5173` | `vite.config.js` |
| Express proxy (API) | `8787` | `API_PORT` in `.env` |

If a port is already in use:
```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
```

---

## Browser vs desktop mode

| Mode | How the proxy URL is resolved |
|------|------------------------------|
| Desktop (Electron) | Electron main spawns the proxy; UI auto-connects via IPC |
| Browser dev (`dev:all`) | Vite proxies `/api/*` to `localhost:8787` via `vite.config.js` |
| Browser production | Set **App URL** in Settings → Past due rules to `http://localhost:8787` |

---

## Secrets in CI

For the GitHub Actions desktop packaging workflow, inject the same `.env` variables as repository secrets:
- `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
- `ANTHROPIC_API_KEY` (or the appropriate provider key)

These are injected at build time by the workflow and never stored in the repo.
