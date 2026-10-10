# PR: Fix Electron Jira site switcher

## Summary

Makes the header **Site** switcher reliable in the Electron app by talking to the API Electron actually spawns, waiting for that API before opening the window, and retrying the instances fetch if the proxy is still starting.

## Problem

| Symptom | Root cause |
|---------|------------|
| Electron nav missing Site switcher that browser UI shows | Unpackaged Electron set `--api-base=http://localhost:5173`, so the renderer hit Vite’s proxy instead of the spawned API; early `/api/jira/instances` failures left `JiraInstanceSwitcher` at `null` with no retry |
| Switcher race on desktop boot | `waitForApi` only ran when `app.isPackaged`; unpackaged windows opened immediately |
| Settings edit of a site could fail cross-origin after pointing at `:8787` | CORS `Allow-Methods` omitted `PATCH` |

## Changes

- **`electron/main.cjs`** — Always pass `--api-port` only (preload defaults to `http://127.0.0.1:${port}`); always `waitForApi` before `createWindow`.
- **`JiraInstanceSwitcher.jsx`** — Retry instances load (8 × 250ms) before giving up.
- **`server/jiraProxy.mjs`** — Allow `PATCH` in localhost CORS for Electron → API.

## Test plan

- [ ] `npm run desktop:dev` — header shows **Site** with the same sites as browser `dev:all` (shared repo `data/`)
- [ ] With 2+ sites configured — dropdown enabled; switch reloads and health reflects the new site
- [ ] Settings → edit a Jira site (PATCH) succeeds in Electron
- [ ] Packaged app: sites live under OS userData; add sites in Electron Settings if registry is empty there

## Files touched

| Path | Change |
|------|--------|
| `electron/main.cjs` | API wait + correct api port args |
| `src/Components/JiraInstanceSwitcher.jsx` | Load retries |
| `server/jiraProxy.mjs` | CORS PATCH |
| `docs/PR_WriteUps/PR_ELECTRON_JIRA_SITE_SWITCHER.md` | This write-up |
