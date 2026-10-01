# PR: Multi Jira instance toggle (max 5)

## Summary

Lets users configure and switch among up to **5** Jira Cloud sites from Settings and the header, with **isolated local SQLite data per site**, while bare legacy `JIRA_*` env continues to use the existing `workweek.sqlite` unchanged.

## Problem

| Symptom | Root cause |
|---------|------------|
| Only one Jira base URL/credentials at a time | Proxy hard-coded `process.env.JIRA_*` and a single `workweek.sqlite` |
| Switching sites would mix notes/presets | No per-instance data files or credential rebind |

## Changes

- **Registry** — `server/lib/jiraInstances.mjs` + `instances-meta.sqlite`: CRUD, max 5, credential resolve, env seed helper; public list never includes tokens.
- **Proxy rebind** — `getDb()` / `getNoteImagesDir()` on all DB routes; active instance opens `workweek-<id>.sqlite` (or legacy `workweek.sqlite` when registry empty). Boot only seeds when explicit `JIRA_INSTANCE_N_BASE_URL` is set (preserves existing local data).
- **Legacy → instance seed** — The first time an instance DB is opened and it is empty, copy `workweek.sqlite` (and note-images) into `workweek-<id>.sqlite` once so presets/notes survive leaving single-site mode. First created site auto-activates.
- **Base URL** — Pasted `…/browse/KEY` links normalize to the site origin.
- **REST** — `/api/jira/instances` list/create/patch/delete/activate/test; test uses body overrides or stored credentials; activate returns public summary only.
- **UI** — Settings → **Jira sites**; header **Site** switcher; activate triggers full reload.
- **Docs** — `.env.example`, `JIRA_SETUP.md`, `END_USER_GUIDE.md`, design/plan under `docs/superpowers/`.

## Test plan

- [ ] Bare legacy `JIRA_*` only — app starts; health `legacyMode: true`; existing presets/notes still load from `workweek.sqlite`
- [ ] Add first Jira site (or activate an empty site) — presets from the previous single-site DB appear
- [ ] Settings → add second site → header lists both; activate → health URL changes; soft reload
- [ ] Edit presets on site A, switch to B, switch back to A — A's edits remain
- [ ] Cannot add a 6th instance
- [ ] Edit with blank token keeps existing token
- [ ] Remove active instance switches safely
- [ ] Test connection (saved id, empty body) uses stored creds; bad token fails without changing active
- [ ] Network responses never include `apiToken`
- [ ] `node --test tests/jiraInstances.test.mjs` passes

## Files touched

| Path | Change |
|------|--------|
| `server/lib/jiraInstances.mjs` | New registry library |
| `server/routes/jiraInstanceRoutes.mjs` | New REST routes |
| `server/jiraProxy.mjs` | Meta DB, credentials, activate, health |
| `server/routes/*.mjs` | `getDb()` conversion |
| `src/Pages/Settings/components/JiraInstancesSection.jsx` | Settings CRUD |
| `src/Components/JiraInstanceSwitcher.jsx` | Header switcher |
| `tests/jiraInstances.test.mjs` | Unit tests |
| Docs / `.env.example` | Setup + end-user notes |
