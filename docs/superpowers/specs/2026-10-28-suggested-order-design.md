# Suggested Order for the Week Plan

## Intent and authorization
The user asked to port the `jira-work-priority` scoring model from the ATS AI Toolkit into The Docket so that the week plan works from a deterministic, explainable ordering of open Jira work instead of leaving ordering to the LLM. Confirmed decisions: v1 is **plan-only** (no new visible column or sort in the Work Week table), and the user's manual priority is **weighted** into the score, not dominant. The feature is **read-only**: it never writes Jira, `jiraRowPriorities`, local metadata, or Team DB priority.

## Behavior
When the user generates a week plan, each Work Week JQL slot's open issues are scored and ranked by a new pure scorer. The top 10 of the ranked list per slot (same cap as today) are sent to `/api/plan/week` with each issue's `score` and short `why` reasons. The server renders them into the planning context, and the week-plan system prompt tells the model the tasks arrive pre-ranked. Ranking is within a slot only; slots are not merged or compared against each other. Overdue counts, slot totals and the existing request fields are unchanged. The saved plan archive stores the plan text and existing meta only; scores are not persisted.

Existing manual priorities (1 = top, 20 = lowest, unset = none) are read as an input and are never modified. Because manual priority is weighted, an issue with a manual priority can now be outranked by a more urgent issue. This is an intentional change from the current manual-only sort.

## Scorer module: `shared/workPriorityScore.mjs`
Pure, dependency-free ES module usable from client and server. No I/O, no clock reads: `now` is a parameter.

Exports:
- `DEFAULT_PRIORITY_WEIGHTS` - the config object below (frozen).
- `toScoringInput(issue, { effectiveDueDate, manualPriority })` - normalizes a Jira issue into the scorer input.
- `scoreIssue(input, { now, weights })` -> `{ score, components, reasons }`.
- `rankIssues(inputs, { now, weights })` -> inputs sorted best-first, each with its `score`, `components`, `reasons`.

### Input shape
`{ key, jiraPriority, status, updated, dueDate, manualPriority, blocks, blockedBy }`
- `jiraPriority`: name from `fields.priority.name` ("" when absent).
- `status`: `fields.status.name`.
- `updated`: `fields.updated` ISO string.
- `dueDate`: the **effective due date** (YYYY-MM-DD or null) supplied by the caller from the existing `getEffectiveDueDateForIssue`; the scorer never recomputes due dates or parent rollups.
- `manualPriority`: integer 1-20 or null/0 when unset.
- `blocks` / `blockedBy`: booleans derived in `toScoringInput` from `fields.issuelinks` (below).

### Weights (all in `DEFAULT_PRIORITY_WEIGHTS`)
Score = jiraPriority + staleness + status + blocker + dueDate + manual.

| Component | Rule |
| --- | --- |
| Jira priority | Highest 50, High 40, Medium 30, Low 20, Lowest 10, unset or unknown name 30 (match case-insensitively) |
| Staleness | days since `updated`: >=30 -> 25; 15-29 -> 20; 7-14 -> 15; 3-6 -> 10; <3 -> 5. Whole days, UTC. Invalid or missing `updated` -> 0 and no reason. Items whose status weight is 5 (see below) are capped at 10 |
| Status | In Progress, Analyzing, Ready for Verification -> 20. Any other open status -> 5 (including unknown statuses). Matching is case-insensitive on the trimmed name |
| Blocker | `blocks` (this issue blocks another open issue) +30; `blockedBy` (this issue is blocked by an open issue) +20; both can apply |
| Due date | "today" is `now`'s local calendar date (matching the Metrics page's overdue rule); the due date comes from the issue's own due field only; `dueDate` before or equal to today +25; otherwise within the next 3 business days (Mon-Fri, no holiday calendar) +15; otherwise 0 |
| Manual priority | `round(30 * (21 - p) / 20)` for integer p in 1..20 (p=1 -> 30, p=20 -> 2); unset, 0, or non-finite -> 0 |

The skill's Blocked status tier (30) and "user says urgent" (+10) are intentionally not ported: ODI statuses have no Blocked status, and manual priority replaces the urgent flag. These weights are the skill's defaults plus the Docket-specific rules above; they are config so they can be tuned.

### Link derivation (`toScoringInput`)
Link-type names are instance-specific, so they are config, not hardcoded: `DEFAULT_PRIORITY_WEIGHTS.blockerLinkNames = { blocks: ["blocks"], blockedBy: ["is blocked by"] }` (Jira's default "Blocks" link type; confirmed in use on ODI, unknown for Digital Enablement and other saved instances). `toScoringInput` accepts an optional `weights` override so a later change can supply per-instance names without touching the scorer.

From `fields.issuelinks`, for each link with `outwardIssue` or `inwardIssue`:
- outward link whose `type.outward` matches any `blockerLinkNames.blocks` entry (trimmed, case-insensitive) and whose linked issue is open -> `blocks = true`.
- inward link whose `type.inward` matches any `blockerLinkNames.blockedBy` entry and whose linked issue is open -> `blockedBy = true`.
On an instance whose blocker links use different names, neither flag is set: no blocker bonus, no error, and no reason line. The other components still score normally, so ranking stays valid but ignores blockers there.
Linked issue is open unless its `fields.status.statusCategory.key` is `done` or its `fields.status.name` matches `/(closed|resolved|done)/i` (the same rule as `isIssueOpen`). Links without a linked issue or key are ignored.

### Ordering and determinism
Sort by score descending; ties by manual priority ascending (set before unset), then effective due date ascending (null last), then issue key ascending by plain string comparison. Same inputs and `now` always give the same output. `reasons` lists only components that contributed, in the fixed order priority, status, staleness, due, blocker, manual, each as a short string such as `"High priority (+40)"` or `"Overdue (+25)"`.

### Errors
The scorer never throws on missing, null or malformed fields; it falls back to neutral values and omits the reason. Unknown weight keys in a supplied `weights` object are ignored; missing keys fall back to defaults.

## Integration
1. `server/lib/jiraSearchFields.mjs`: add `"priority"` to `BASE_SEARCH_FIELDS`. Existing consumers (`taskExport`, `jiraRouteContext`, `jiraParentCandidates`, `combinedOpenWork`) already tolerate extra fields; `combinedOpenWork` already de-duplicates it.
2. `src/Pages/components/WeeklyPlanPanel.jsx` `handleGenerate`: for each slot, build scoring inputs from open issues using `toScoringInput` with the issue's already-computed effective due date and its `jiraRowPriorities[key]`, call `rankIssues` with `now = new Date()`, take the first 10, and add `score` and `why` (the reasons array) to each task. The existing `key`, `summary`, `status`, `assignee`, `isOverdue` fields are unchanged.
3. `server/routes/reportRoutes.mjs` `/api/plan/week`: header becomes "Top open tasks (ranked by suggested-order score):". Each task line appends ` | score N: reason; reason` when valid. Validation: `score` must be a finite number, clamped to 0-500 and rounded; `why` must be an array of at most 8 strings, each stripped of control characters and newlines and truncated to 120 characters. Invalid or missing values are omitted and the line renders as it does today. The request is otherwise unchanged, including the 400 for no projects.
4. `server/lib/aiInstructions.mjs` `buildWeekPlanSystemPrompt`: add rules that tasks are pre-ranked best-first with scores, the model keeps that order within a day-by-day plan unless fixed commitments or capacity force a change (and then says so), may cite a score or reason only as given, and must not invent scores or reasons.

## Boundaries
- No writes to Jira, `jiraRowPriorities`, localStorage priorities, SQLite, or Team DB (`teamPriorityPostgres`). The scorer and its callers do not import write paths.
- No change to `combinedOpenWork`, the Work Week table, dashboard metrics, or reports other than the week plan.
- No settings UI for weights or per-instance link names (the config hook above is the extension point), no LLM-based scoring, no cross-slot ranking, no persistence of scores. Possible later specs: a visible suggested-order column, an apply-suggestions action (would need explicit confirmation and its own spec).
- The feature adds no dependency and no migration.

## Validation
Tests use `node:test` in `tests/`, following existing files.
- `tests/workPriorityScore.test.mjs`: one case per band of each weight table (priority names incl. unset/unknown, staleness bands and the backlog cap, status mapping incl. unknown, blocker blocks/blockedBy/both/closed-linked-issue/link-type casing, due today/overdue/in 3 business days/over a weekend/further out/null, manual priority 1/10/20/0/null); invalid input fields; reasons order and content; tie-breaking chain; determinism with a fixed `now`; weights override; `toScoringInput` link derivation and missing fields; input objects are not mutated.
- Server test for the plan-week context rendering and payload validation (valid score and why, clamping, truncation, control characters, non-array why, missing fields falling back to the old line format, still 400 for no projects). If `/api/plan/week` is not directly testable today, extract the context builder to a small exported function and test that.
- Blocker link-name tests: default names match; a custom `blockerLinkNames` override matches; an unmatched name (e.g. "depends on") sets neither flag and the issue still scores.
- A prompt test in the style of `tests/aiInstructions.test.mjs` asserting the new pre-ranked rules are present.
- A client-side test of the payload builder (ordering by score, top 10 cap, manual priority read-only) if the builder can be extracted from `handleGenerate` without restructuring the component; otherwise cover it through the scorer tests and a manual check.
- Update any existing test that asserts the exact search field list.
- Manual check per saved Jira instance before relying on blocker scoring there: list its link types (`GET /rest/api/3/issueLinkType`) and confirm "Blocks" / "is blocked by" exist; if not, add that instance's names to the config later.
- Run `npm test` and `npm run build` after implementation. No live Jira validation is claimed; verify with fixture issues.
