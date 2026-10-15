# Local Security and Site Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict the local application and prevent credentials or work from crossing Jira sites.

**Architecture:** Extend existing Express initialization, instance registry, request helpers, browser persistence, and Electron main process. Keep the global active-site model with a server-enforced drain boundary; add explicit per-site request inputs only for the approved export use case.

**Tech Stack:** Node >=22, Express, SQLite, React, Electron, existing Node tests. No new dependency.

**Spec:** [Approved design](../specs/2026-10-14-application-review-design.md); [overview and shared contracts](2026-10-14-application-review.md).

## Global Constraints

- Keep `npm run dev:all` and `npm run desktop:dev`.
- Bind the API explicitly to `127.0.0.1`.
- The server reads the personal Jira token from `.env`.
- Defer app-session authentication; document same-user-process access rather than promising isolation.
- Use the seven exact Jira hostnames in the spec; additions require explicit local configuration.
- No new classes/dependencies; all overview constraints apply. SonarQube remains a company-side merge gate.

## Review Focus

1. A hostname contains `lumen` but is not allowed → S1 rejects it before any fetch.
2. Jira accepts a write but response stalls → S2 returns timeout/uncertain outcome and does not replay.
3. A browser disconnects while server work still runs → S3 does not close its database on response-close alone.
4. Two windows use the same site with different generations → S3 rejects the stale generation.
5. A malformed unscoped cache has no source → S3 retains it without assigning it to the current site.

### Task S1: Loopback, destination validation, and environment credentials

**Files:** Modify `server/jiraProxy.mjs`, `server/lib/jiraInstances.mjs`, `server/routes/jiraInstanceRoutes.mjs`, `src/Pages/Settings/components/JiraInstancesSection.jsx`, `src/services/jiraClient.js`, `vite.config.js`, `README.md`; create `server/lib/localRequestPolicy.mjs`; tests `tests/localRequestPolicy.test.mjs`, existing `tests/jiraInstances.test.mjs`.

**Interfaces:** `assertAllowedJiraBaseUrl(value, allowedHosts) -> normalizedBaseUrl` extends the existing instance helper module. `getInstanceCredentials(metaDb,id,env=process.env)` and `resolveJiraCredentials(metaDb,env)` retain current return fields but read `JIRA_API_TOKEN` exclusively from environment. `localRequestPolicy({apiPort,allowedOrigins}) -> ExpressMiddleware` checks parsed host and exact origins.

- [ ] Write cases named `rejects unapproved destinations before credentials are used`, `does not expose or persist tokens`, and `does not delete legacy token on failed verification`. Pin core assertions:
  ```js
  assert.equal(assertAllowedJiraBaseUrl('https://lumen.atlassian.net/browse/A-1', allowed), 'https://lumen.atlassian.net');
  assert.throws(() => assertAllowedJiraBaseUrl('https://lumen.atlassian.net.evil.example', allowed));
  assert.equal(resolveJiraCredentials(db, { JIRA_API_TOKEN: 'fixture' }).apiToken, 'fixture');
  ```
  Also reject userinfo, HTTP, port 444, lookalike company-name hosts; exercise allowed 443, spoofed Host, disallowed/malformed/`null` Origin, and credential-free settings responses.
- [ ] Run `node --test tests/localRequestPolicy.test.mjs tests/jiraInstances.test.mjs`; confirm behavior failures before changes.
- [ ] Implement S1 interfaces. Add comma-separated `JIRA_ALLOWED_HOSTS` and `DOCKET_ALLOWED_ORIGINS` configuration with documented defaults: the seven spec hosts; `http://localhost:5173`, `http://127.0.0.1:5173`, and actual loopback API origins. Reject unexpected Origin even on state-changing requests; allow absent Origin only under the documented trusted local-process model and valid Host. Configure Vite IPv4 target. Never trust forwarded hosts.
- [ ] Remove token inputs/persistence from instance create/update/env seeding. Existing token columns are transitional only: confirm the environment credential through the protected test route before clearing a site's saved value. Reject submitted `apiToken` fields instead of persisting them. Missing/invalid environment credentials preserve recovery data and show guidance. Keep site email behavior and existing environment variable compatibility for nonsecret site settings. Document configuration without reading real `.env`.
- [ ] Re-run tests and `npm run build`; smoke both development commands. Stage only S1 files and commit `fix: restrict local API and Jira credential destinations`.

### Task S2: Scoped Jira requests, timeouts, and redirect safety

**Files:** Modify `server/jiraProxy.mjs`, `server/routes/jiraInstanceRoutes.mjs`, `server/lib/jiraResponse.mjs`, `src/services/jiraClient.js`, `README.md`; create `server/lib/jiraTransport.mjs`, `tests/jiraTransport.test.mjs`.

**Interfaces:** `requestJira({credentials,method='GET',pathWithQuery,body,formData,signal,responseMode='json',timeoutMs}) -> Promise<{ok,status,data,location?}>`. Server-only `credentials` is a captured copy; `responseMode:'redirect'` supports attachment media-ID extraction without following Location. Existing `jiraRequest`, `jiraMultipartRequest`, and search wrappers delegate to this function. Return timeout as `{ok:false,status:504,data:{code:'JIRA_TIMEOUT',outcome:'unknown'|'not-written',message}}`.

- [ ] Write tests `timeout includes response body consumption`, `write timeout is not retried`, `redirect does not send Authorization elsewhere`, and `caller abort closes pending work`. Mock fetch/response body; assert `calls.length === 1`, status 504, write `outcome === 'unknown'`, no cross-origin fetch.
- [ ] Run `node --test tests/jiraTransport.test.mjs tests/jiraResponse.test.mjs`; observe expected failures.
- [ ] Implement a 30,000ms default from positive-integer `JIRA_REQUEST_TIMEOUT_MS`; preserve existing request/response sanitation. Use one deadline through body consumption and combine caller cancellation. Clear timers in finally. Validate every target before attaching Authorization; reject ordinary redirects. Attachment redirect mode reads only Location and cancels unused bodies. Route connection tests use this transport too. Preserve distinction between search POST (read) and writes when reporting uncertain results.
- [ ] Update UI timeout copy to preserve edits and warn that a Jira write may have succeeded; no automatic write retry. Keep other provider traffic unchanged.
- [ ] Re-run transport/response and attachment tests, then build. Commit `fix: bound Jira requests and preserve uncertain write outcomes`.

### Task S3: Active-site leases and browser cache separation

**Files:** Modify `server/jiraProxy.mjs`, `server/routes/jiraInstanceRoutes.mjs`, `src/Components/JiraInstanceSwitcher.jsx`, `src/services/jiraClient.js`, `src/AppRouter.jsx`, `src/utils/backgroundJobStore.js`, `src/utils/workWeekStorage.js`, `src/utils/pageReportPersistence.js`, `src/utils/jqlRunPersistence.js`, `src/utils/chatSessionContext.js`, `src/utils/pmAskCreateIssueHandoff.js`, `src/Pages/hooks/useTaskManagerJira.js`, `src/Pages/hooks/usePersistedState.js`, `src/Pages/Settings/components/TeamPriorityImportSection.jsx`; create `server/lib/siteOperationState.mjs`, `src/utils/siteContextStore.js`, `tests/siteOperationState.test.mjs`, `tests/siteContextStore.test.mjs`; extend existing `tests/workWeekStorage.test.mjs`. Apply the handler wrapper to scoped registrations in `server/routes/jiraCoreRoutes.mjs`, `jiraIssueRoutes.mjs`, `issueMetadataRoutes.mjs`, `epicWorkloadRoutes.mjs`, `capacityPlanningRoutes.mjs`, `teamPriorityRoutes.mjs`, `pmAsksRoutes.mjs`, `attachmentRoutes.mjs`, `appConfigRoutes.mjs`, `dashboardRoutes.mjs`, `reportRoutes.mjs`, and `chatRoutes.mjs`; these files otherwise retain their business logic.

**Interfaces:** `beginSiteOperation(expectedContext) -> {context,release}`, `withSiteOperation(handler) -> ExpressHandler`, and `switchSite(id,expectedGeneration) -> Promise<SiteContext>` are plain functions closed over runtime state. The wrapper awaits the handler and its site-dependent work, releasing in finally. Streaming/file handlers explicitly await stream completion or abort before returning. Add `siteContext` to health/registry responses. `getSiteContext()/setSiteContext(context)` live in the browser store; `siteStorageKey(key,instanceId) -> string` uses `docket:site:<id-or-legacy>:<key>`. `waitForSiteSaves(instanceId) -> Promise<void>` uses the existing background-job store to await pending site saves; failure rejects rather than discards drafts.

- [ ] Write tests for two concurrent requests, switch and stale client: start operation A, request switch B, verify A still sees A's DB/credentials, new A work receives 409 while draining, and switch resolves only after release. Assert `oldDb.closeCalls === 0` before release and `staleResponse.status === 409` after switch. Include browser disconnect with server task still alive and concurrent activate/delete/site-host edits.
- [ ] Run `node --test tests/siteOperationState.test.mjs tests/siteContextStore.test.mjs tests/workWeekStorage.test.mjs` and confirm failures.
Saved Jira sites keep their canonical hostname. Reject edits that change it, with guidance to add a separate saved site; preserve the existing ID, database, and browser cache. Normalize same-host pasted links before comparison and continue allowing name/email edits. This policy was explicitly confirmed by the user during S3 implementation.

- [ ] Implement leases around the entire async route handler, not individual fetch calls or `res.close`. Keep active context immutable while leased; activation, deleting the active instance, first-site activation, and identity-changing edits all use the same drain gate. Finish/abort actual work before releasing. Keep existing `getDb`/`getCredentials` interfaces but read from the immutable active snapshot, not newly queried registry credentials. Since the snapshot cannot change until all active handlers finish, no asynchronous-context framework is needed. Explicit export receives separate captured context arguments and never mutates this snapshot. Freeze admissions during switching; bound long requests through S2. Reject outdated headers across all site-scoped routes. To Dos will be exempt after T1.
- [ ] Initialize browser context from health before scoped requests; attach both headers to JSON and direct attachment/blob fetches. Await existing running jobs and pending site save queues before activation. Reuse backgroundJobStore for site-save promises; stop cancelling unsaved site work on unmount. If waiting fails, keep errors/drafts and do not switch. Key the site-dependent provider/subtree by generation so old results cannot enter the new view; the T2 To Do provider must live above this boundary.
- [ ] Namespace all Jira business persistence found in the listed modules and their direct callers; leave cosmetic preferences unscoped. Source-proven legacy values migrate once; ambiguous originals remain under their old keys with a recovery notice. Add regression `unscoped unknown-origin notes are never adopted` and two-site identical-key isolation. A failed storage write must not delete its source.
- [ ] Re-run tests and build; exercise two browser windows, pending save failure, active Jira timeout, switch away/back, and site removal. Commit `fix: isolate site operations and persisted Jira state`.

### Task S4: Electron sandbox and navigation policy

**Files:** Modify `electron/main.cjs`, `electron/preload.cjs`, `server/jiraProxy.mjs`, `vite.config.js`, `README.md`; create `electron/navigationPolicy.cjs`, `tests/electronNavigationPolicy.test.mjs`.

**Interfaces:** `isAppNavigation(url,{appOrigin}) -> boolean`, `isAllowedExternalUrl(url,{jiraHosts,externalHosts}) -> boolean`. Electron and server read the same Jira allowlist configuration, not a renderer-provided allowlist.

- [ ] Write assertions for exact app-origin navigation, Jira links, blocked `javascript:`, `file:`, userinfo URLs, lookalike hosts, and unexpected windows. Run `node --test tests/electronNavigationPolicy.test.mjs`; confirm failures.
- [ ] Enable `sandbox:true`, preserve `contextIsolation:true` and `nodeIntegration:false`, and use only preload-compatible APIs. Keep exposed API URL/port values working. Handle `will-navigate` and `setWindowOpenHandler`; open validated external links through the system browser and deny renderer windows.
- [ ] Add CSP to actual served application responses and Vite development responses. Allow self scripts; narrow dev HMR allowances to the actual Vite origin, images to required self/blob/data sources, connections to actual local API/HMR, styles to current Semantic/inline-style needs. Inventory existing AI/OAuth/external-link flows before defining their permitted destinations; do not introduce blanket `https:` script/connect permissions. Record any necessary dev-only allowance.
- [ ] Re-run policy tests and build, then manually verify desktop startup, preload API bridge, attachment flows, expected provider links, and external Jira opening. Check the browser console for CSP regressions. Commit `fix: constrain Electron renderer and navigation`.
