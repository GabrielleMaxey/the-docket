# Combined Open Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the user's assigned unfinished Jira issues across selected saved sites without changing the active site.

**Architecture:** One read-only collector and route reuse existing captured credentials, registry leases, transport and search pagination. A standalone React page calls an unscoped read wrapper and renders safe source-labeled results. Keep the current task editor and workbook behavior unchanged.

**Tech Stack:** Existing React18, Semantic UI, Express, Node22 and node:test; no new dependencies/classes.

**Spec:** docs/superpowers/specs/2026-10-15-combined-open-work-design.md

## Global Constraints
- Only issues assigned to `currentUser()` on each selected saved Jira site; `statusCategory != Done`.
- One to five distinct enabled saved entries, existing exact-host allowlist and environment token policy.
- Never activate a site, read/migrate/write a site database, or put secrets/upstream error bodies in responses/logs.
- Read-only page and API; preserve site-save queue, shared work and all existing editing paths.
- Selected entries remain distinct even for identical host/key; settle sibling transport before registry release.
- Collection defaults120000ms/cap600000; row default/cap5000 per site, explicitly partial at bounds.
- No live credentials/user data/company DB or new dependency; keep unrelated local files unchanged.

## Review Focus
- A blocked or failed selected site must not suppress peers or appear as empty success.
- Late responses after selection change/navigation must not repopulate stale results or create failed saves.
- Switching active site during collection must not redirect captured credentials or release registry leases early.
- Missing Jira totals, next-page tokens and hard limits must not falsely imply complete results.
- Duplicate issue keys across saved entries and unsafe issue URLs must retain identity and safe link origin.

### Task 1: Implement and verify the combined view as one vertical feature

**Files:**
- Create `server/lib/combinedOpenWork.mjs` (collector), `server/routes/combinedOpenWorkRoutes.mjs` (read route), `src/Pages/CombinedOpenWork.jsx` (page).
- Modify `server/jiraProxy.mjs` only to register route; `src/services/jiraClient.js` only to add the read wrapper; `src/AppRouter.jsx` for lazy route/navigation.
- Add page CSS only if existing styles cannot provide responsive table overflow; prefer a small adjacent stylesheet over unrelated restyling.
- Create `tests/combinedOpenWork.test.mjs`, `tests/combinedOpenWorkClient.test.mjs` using existing fixture/bundle patterns.
- Modify `.env.example`, `README.md` for settings/feature use; update this plan's completion evidence. Do not rewrite historical refactor plans or PR34.

**Interfaces:**
- Export `collectCombinedOpenWork({metaDb,instanceIds,env=process.env,requestJira=sendJiraRequest,signal})` from collector; response/schema and validations exactly as spec. Optional default arguments provide the existing project's injection pattern for synthetic tests.
- Export `registerCombinedOpenWorkRoutes(app,context)`; context consumes metaDb and optional env/requestJira for tests. Route POST body contract is spec; register directly alongside export routes.
- Export `fetchCombinedOpenWork(instanceIds,{signal}={})` from jiraClient; invoke `requestJsonNow` directly with JSON body, never `requestJson` siteSave classification.
- Default-export `CombinedOpenWork`; lazy route `/combined-open-work`, nav label **Combined Open Work**.

- [ ] Step1: Write failing service/route regressions for the five Review Focus cases plus validation, fixed assigned/open JQL, selected-only requests, optional Jira fields, independent failures, caller/deadline cancellation and delayed lease release. Use in-memory registry with synthetic credentials; no real environment.
- [ ] Step2: Run `node --test tests/combinedOpenWork.test.mjs`, capture expected RED with exit status in separate temporary log.
- [ ] Step3: Implement collector/route using existing primitives, minimal field projection and safe errors. Capture credentials within per-site error handling; settle all parallel work before finally releasing the selected registry lease. Preserve established transport behavior; don't modify search helper to solve unrelated cases.
- [ ] Step4: Run covering service/route tests to GREEN, including any existing directly touched interface tests.
- [ ] Step5: Write failing client/page tests for exact read wrapper, selection/load/error/partial/no-sites, source row identity/links, stale result suppression and cancellation. Reuse existing esbuild/node:test pattern; no new test libraries.
- [ ] Step6: Implement page/navigation/client, reuse existing components/styles. Select all enabled entries initially; explicit Load/Refresh, cancel, and clear result on selection changes; no automatic query on mount.
- [ ] Step7: Run focused client/service tests to GREEN. Perform actual synthetic browser smoke with a temporary server/tab, fake Jira and controlled failures; exercise selection, combined rows/same keys, failure notice, refresh/cancel and unchanged active-site selection. Stop only owned fixtures afterward.
- [ ] Step8: Document the feature and bounded partial-result settings. Run full `npm test`, `npm run build`, and `git diff --check` with Node22 and sanitized environment. Record SQL skips as skips; do not rerun unchanged DB integration or invoke blocked scanner.
- [ ] Step9: Self-review for no parallel transport/credentials implementation, no unused helper/new class or unrelated modifications, then commit focused feature changes. Write concise report and separate full logs; independent review remains controller responsibility.

## Self-review
All spec sections map to Task1; all five Review Focus items have explicit regression steps. API and response names agree across collector/route/client. No new storage schema or dependency is introduced. User approved the core view and assigned-only scope; listed defaults, read-only first version and bounds are builder calls explained in the design. Use the previously selected subagent execution workflow; no repeated choice of execution method is needed.
