# Atlas Team Priority Demo Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Demo shared P1–P20 priorities via MongoDB Atlas with Work Week team-mode slots.

**Architecture:** `jiraProxy` uses official `mongodb` driver when `TEAM_PRIORITY_MONGODB_URI` is set. Team-mode JQL slots (`sharedProgramId`) read/write Atlas; local slots stay on SQLite. Spec: `docs/superpowers/specs/2026-07-29-atlas-team-priority-demo-design.md`.

**Tech Stack:** Node ESM, Express, `mongodb`, React Work Week hooks, localStorage prefs.

## Global Constraints

- Never log or return the Mongo URI / password.
- Priority clamp 1–20; 0 deletes Atlas doc.
- Epic-root 403 not enforced in this demo.
- Unset URI → existing behavior unchanged.
- Prefer editing existing functions; minimal new files.
- Dependency: `mongodb` only (approved for demo).

---

## File map

| File | Responsibility |
|------|----------------|
| `server/lib/teamPriorityMongo.mjs` | Connect, seed, bulk get, put/delete |
| `server/routes/teamPriorityRoutes.mjs` | Health, seed, programs, bulk, put |
| `server/jiraProxy.mjs` | Register routes |
| `src/services/jiraClient.js` | Client wrappers |
| `src/utils/workWeekStorage.js` | Normalize `jqlSharedProgramIds` parallel array |
| `src/Pages/hooks/useTaskManagerJira.js` | Prefs + priority write branch |
| `src/Pages/hooks/jiraJqlRunWorkflow.js` | Team bulk fetch; skip comment parse on team slots |
| `src/Pages/components/JqlControlsPanel.jsx` | Shared program selector |
| `src/Pages/Settings/components/TeamPriorityDemoSection.jsx` | Health + seed UI |
| `src/Pages/Settings/index.jsx` | Mount section |
| `.env.example` | Document `TEAM_PRIORITY_MONGODB_URI` |
| `tests/teamPriorityMongo.test.mjs` | Clamp / pure helpers if extracted |

---

### Task 1: Mongo helper + routes + dependency

- [ ] `npm install mongodb`
- [ ] Add `teamPriorityMongo.mjs` (lazy connect, collections, seed NORA/Ask Greg, bulk, put)
- [ ] Add `teamPriorityRoutes.mjs`; register in `jiraProxy.mjs`
- [ ] Add `.env.example` line
- [ ] Manual: `GET /api/team-priority/health` with URI set → `connected: true`

### Task 2: Client + Settings demo section

- [ ] Wrappers in `jiraClient.js`
- [ ] `TeamPriorityDemoSection.jsx` + Settings index
- [ ] Manual: Seed button creates programs

### Task 3: Slot `sharedProgramId` + Work Week wiring

- [ ] Parallel array `jqlSharedProgramIds` (length 5) in storage load/save — avoid full prefs migration
- [ ] Selector in `JqlControlsPanel`
- [ ] `runJqlWorkflow`: if slot has program + Atlas configured, bulk Atlas priorities; skip comment parse for that slot
- [ ] `handleRowPriorityChange`: team slot → PUT Atlas; else existing SQLite
- [ ] Show Team source badge when from Atlas

### Task 4: Verify

- [ ] Health + seed
- [ ] Team slot Run JQL + change priority; second Run JQL sees value
- [ ] Local slot still uses SQLite only
