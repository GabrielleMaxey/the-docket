# Combined Open Work handoff

Current branch: `codex/combined-open-work-tab`. The placement correction is implemented in the same isolated worktree; see [tab placement plan](2026-10-15-combined-open-work-tab.md) and its task report under `.superpowers/sdd/2026-10-15-combined-open-work-tab/`. The feature remains unpushed and unmerged.

Original implementation history: implemented on `codex/combined-open-work` in `/Users/gabriellemaxey/.codex/worktrees/docket-security/taskManager`, based on refactor PR34 head `110c3e4`. Product commit `47def25`; plan verification commit `71c1a34`. The normal checkout remains on its prior branch. This feature has not been pushed or merged.

Open **Task Management**, choose the **Combined Open Work** tab beside existing JQL result tabs, select saved Jira sites and click **Load open work**. Only unfinished issues assigned to the configured account on each site appear. The combined read-only table labels each saved site, keeps same-key entries separate, supports refresh/cancel, and preserves successful results when another site fails. Collection never activates another site. A deliberate active-site switch still resets the page through the existing application lifecycle.

## Tab placement correction

- Combined Open Work is available in the existing result-tab row, including when there are no configured result runs. The separate main-navigation entry is removed; old links redirect to `#/work-week?tab=combined-open-work`.
- Combined selection uses the existing URL search parameters and never enters persisted JQL runs or changes the saved ordinary run index. Ordinary editing, filtering, load-more and drill-down handlers continue to receive ordinary runs only.
- Single-site My Metrics, restored-result and drill-down banners are hidden while combined is selected. Leaving the combined tab unmounts the view and cancels its request; returning requires an explicit load.
- The reusable view now renders a section with an h2 inside Task Management. Collection, API and backend behavior are unchanged.
- Original implementation/review evidence below is historical; the earlier standalone navigation placement is superseded by this correction.

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
