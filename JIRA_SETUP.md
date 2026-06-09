# Jira API Setup

This project uses a local proxy so Jira credentials are never sent to the browser.

## 1) Create local env file

Copy `.env.example` to `.env` in the project root and fill values:

- `JIRA_BASE_URL` (example: `https://your-domain.atlassian.net`)
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- `API_PORT` (default `8787`)

## 2) Run app + Jira proxy together

```bash
cd /path/to/taskManager
npm run dev:all
```

- UI: `http://localhost:5173`
- Proxy: `http://localhost:8787`

## 3) Test from UI

Open the Work Week page and click **Test Jira Connection**.

## 4) Run one to three JQL queries

On the Work Week page:

- Choose **JQL count** = 1, 2, or 3.
- Enter each JQL in its input.
- Click **Run JQL**.

The UI will show grouped results for each query, including total matches, pagination controls, and a configurable Max results value.

## Team-friendly secret handling

For shared environments, do not commit `.env`.

Options:
- Local dev: each teammate keeps their own `.env`.
- CI/hosted: inject env vars from provider secrets store.
- Corporate vault: export secrets at runtime into process env and start `npm run dev:api`.

As long as `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` are present in process env, proxy calls work.
