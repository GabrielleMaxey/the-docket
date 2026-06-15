# Jira setup

Credentials stay on the machine: the **Node proxy** (`server/jiraProxy.mjs`) talks to Jira; the browser only calls the proxy.

## 1. Environment

Copy `.env.example` → `.env` and set:

| Variable        | Example |
|----------------|---------|
| `JIRA_BASE_URL` | `https://your-site.atlassian.net` |
| `JIRA_EMAIL`    | Atlassian account email |
| `JIRA_API_TOKEN`| From Atlassian API tokens |
| `API_PORT`      | Optional; default `8787` |

Do not commit `.env`.

## 2. Run UI + proxy

```bash
npm install
npm ci
npm run desktop:dev
```

- UI: `http://localhost:5173` (Task Manager is the home route.)
- API: `http://localhost:<API_PORT>` (default `8787`)

`npm run dev:ui` alone does **not** start the proxy—use `dev:all` for Jira, or run `npm run dev:api` in another terminal.

## 3. Verify

In the app, click **Test Jira Connection**. Optionally open `http://localhost:8787/api/health`.

## 4. JQL

Choose **JQL count** (1–4), enter JQL and optional labels, set **Max results**, then **Run JQL**. Use **Ctrl+Enter** or **⌘+Enter** as a shortcut for Run JQL.

---

For sharing secrets in teams: inject the same variables in CI or a vault-backed process; no keys in the repo.
