# Combined Open Work handoff

Implemented on `codex/combined-open-work` in `/Users/gabriellemaxey/.codex/worktrees/docket-security/taskManager`, based on refactor PR34 head `110c3e4`. Product commit `47def25`; plan verification commit `71c1a34`. The normal checkout remains on its prior branch. This feature has not been pushed or merged.

Choose **Combined Open Work**, select saved Jira sites and click **Load open work**. Only unfinished issues assigned to the configured account on each site appear. The combined read-only table labels each saved site, keeps same-key entries separate, supports refresh/cancel, and preserves successful results when another site fails. Collection never activates another site. A deliberate active-site switch still resets the page through the existing application lifecycle.

## Changed files

| File | Location | Change |
| --- | --- | --- |
| `server/lib/combinedOpenWork.mjs` | 1, 11, 30 | New bounded collector, safe row projection, fixed assigned/open search, per-site credential capture and errors, selected registry leases, deadline/caller cancellation, all-settled release. |
| `server/routes/combinedOpenWorkRoutes.mjs` | 3 | New POST read route, strict body validation, no-store, disconnect cancellation, safe errors. |
| `server/jiraProxy.mjs` | 23, 385 | Import/register collector route beside export, outside active-site wrapping. |
| `src/services/jiraClient.js` | 182 | Read wrapper directly uses requestJsonNow with exact IDs/signal; no active headers or save queue. |
| `src/Pages/CombinedOpenWork.jsx` | 6 | New read-only page, enabled-site selection, explicit load/refresh/cancel, stale suppression, empty/error/partial states, per-entry labels and links. |
| `src/Pages/combinedOpenWork.css` | 1 | Small page styles and keyboard-focusable horizontally scrollable results. |
| `src/AppRouter.jsx` | 15, 24, 88 | Lazy page, navigation label, hash-router route. |
| `tests/combinedOpenWork.test.mjs` | 1 | Collector/HTTP regressions for identities/credentials, fixed minimal search, validation, independent errors, partial bounds/pagination, malformed keys/pages, optional fields, cancellation/leases/disconnect. |
| `tests/combinedOpenWorkClient.test.mjs` | 1 | Existing esbuild/node:test pattern; actual client and full page with small isolated hook renderer; selection, load, results, errors/empty/partial, links, cancel/unmount/late responses. |
| `.env.example` | 99 | Document exact default row/deadline settings and caps. |
| `README.md` | 278 | Feature use, assigned/open semantics, read API, independent failure/partial behavior and settings. |

| `docs/superpowers/specs/2026-10-15-combined-open-work-design.md` | 1 | Approved scope, API contract and builder defaults. |
| `docs/superpowers/plans/2026-10-15-combined-open-work.md` | 1 | Implementation steps and completion evidence. |
| `docs/superpowers/plans/2026-10-15-combined-open-work-handoff.md` | 1 | This durable handoff, reviews, file list and decisions. |

## Verification

- Focused service/client/transport/registry checks:49 passed. Feature RED tests failed before implementation, then passed.
- Full suite:623 tests;612 passed,10 SQL integration skipped,1 failed because the existing CSP test requires occupied port5173. No user process was stopped. A temporary copy using a free bind/fetch port passed the original CSP assertions; the original suite is not reported as passing.
- Production build and diff whitespace checks passed.
- Actual synthetic browser smoke verified default selections, explicit load, distinct same-key rows, safe links, unchanged active site, selection clearing, per-site failure, partial warnings, refresh/cancel and two upstream aborts. No browser warnings/errors. Owned fixture/tab stopped afterward. No real environment, user data, live Jira or company DB used.
- Independent task review and final full-feature review approved with no Critical/Important code findings. Final review checked range110c3e4..71c1a34. Handoff is documentation only.
- Company Sonar remains unavailable: automatic approval review previously rejected source upload because its destination was not approved. No scan retry, bypass or zero-Major/Critical claim. Live/company/native behavior remains unverified. No schema/dependency changes; SQL integration was not repeated.

Reproducible evidence on this development machine: `/tmp/combined-focused-final.log`, `/tmp/combined-full-test.log`, `/tmp/combined-build.log`, `/tmp/combined-isolated-csp.log`, `/tmp/combined-browser-fixture.mjs`. Test/build runtime:Node22.23.1. These are temporary logs; this document preserves their outcomes.

## Rulings I made

- Start with a read-only table of site, issue, title, status, Jira priority and due date — meets the approved combined visibility need without adding editing scope — if wrong, a later change must add desired editing or metadata.
- Treat open as statusCategory != Done and use currentUser independently for each site — follows existing conventions and assigned-only requirement — if wrong, the open definition needs adjustment.
- Default collection to120000ms and5000 rows per site, explicitly partial at limits — keeps the interactive view bounded — if wrong, users need configured limits or a narrower selection.
- Reuse the isolated worktree and leave the normal checkout unchanged — preserves the user's testing setup — if wrong, the feature branch must be moved to the desired checkout later.
- Verify the existing CSP test using a temporary copy with only its bound/fetched port changed — the original test hardcodes5173, occupied by the user app, so preserve that app and tracked test — if wrong, the original test still needs a rerun when5173 is free; never report the original suite as fully passing.
- Preserve the existing active-site-switch remount behavior — cancellation on unmount matches the spec and changing the shell is outside this feature — if wrong, users must reselect/reload the combined view after switching active sites.
- Keep registry loading on page mount without cross-session polling — matches the approved no-polling scope — if wrong, users must reopen the page to see saved-site edits made elsewhere.
- Defer pre-existing synthetic-error test-log cleanup — unrelated to this feature — if wrong, expected log noise may obscure future failures.
