# Suggested Order for the Week Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank each Work Week slot's open Jira issues with a deterministic, explainable score and feed the ranked list, with scores and reasons, into the week-plan prompt.

**Architecture:** A pure scorer in `shared/` (ported from the ATS `jira-work-priority` skill) is called by a new client-side payload builder in `WeeklyPlanPanel`. A new server module validates and renders the scored tasks into the planning context; the system prompt tells the model they arrive pre-ranked. Read-only: nothing is written to Jira, `jiraRowPriorities`, SQLite or Team DB.

**Tech Stack:** Node ESM (`.mjs` in `shared/` and `server/`, `.js` in `src/`), React 18, Express, `node:test` (`npm test` = `node --test tests/**/*.test.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-28-suggested-order-design.md`

## Global Constraints

- Read-only: no import of `teamPriorityPostgres`, no write to `jiraRowPriorities`, localStorage priorities, SQLite or Jira from any new code.
- Weights (verbatim from spec): Jira priority Highest 50 / High 40 / Medium 30 / Low 20 / Lowest 10 / unset or unknown 30; staleness >=30d 25, 15-29d 20, 7-14d 15, 3-6d 10, <3d 5, capped at 10 when the status weight is 5; status In Progress / Analyzing / Ready for Verification 20, any other open status 5; blocks another open issue +30, blocked by an open issue +20 (both can apply); due on or before today +25, within next 3 business days (Mon-Fri) +15; manual priority `round(30 * (21 - p) / 20)`.
- "Today" is `now`'s local calendar date (changed from UTC to match the Metrics page). `now` is always a parameter; the scorer never reads the clock.
- Blocker link names come from `DEFAULT_PRIORITY_WEIGHTS.blockerLinkNames = { blocks: ["blocks"], blockedBy: ["is blocked by"] }`, matched trimmed and case-insensitive; unmatched names set no flag and raise no error.
- Sort: score desc, then manual priority asc (set before unset), then effective due date asc (null last), then key by plain string comparison.
- Server validation of task `score`: finite number, rounded, clamped 0-500. `why`: array of at most 8 strings, control characters and newlines stripped, truncated to 120 chars. Invalid values omit the suffix; the line renders as it does today.
- Top 10 tasks per slot, ranking within a slot only. Existing request fields, the 400 for no projects, and `isOverdue` semantics are unchanged.
- No new dependency, no migration, no settings UI, no persistence of scores.

## Review Focus

- A slot issue in the flattened shape the panel already tolerates (`issue.status` string, `issue.summary`, no `fields`): `toScoringInput` falls back to it instead of treating the status as unknown.
- `jiraRowPriorities` values that are strings ("5") or out of range (0, 25): coerce with `Number`; values below 1 or non-finite give no bonus; values above 20 count as 20 (matches `clampIssuePriority`).
- `updated` in the future (clock skew) is treated as just updated (staleness 5, reason "Updated recently (+5)"); an unparsable `updated` or an invalid `dueDate` string such as "2026-13-45" yields no staleness or due component, no reason line, no throw.
- A task whose `score` is `Infinity`, `NaN`, or a numeric string, or whose `why` is a string or contains newlines/control characters: server drops the suffix or sanitizes; the line stays one line.
- A slot with zero open issues, or whose tasks all fail validation: context still renders the project header and counts, and the route does not 500.

---

### Task 1: Scorer weights and `scoreIssue`

**Files:**
- Create: `shared/workPriorityScore.mjs`
- Test: `tests/workPriorityScore.test.mjs`

**Interfaces:**
- Produces: `DEFAULT_PRIORITY_WEIGHTS` (deep-frozen object with keys `priority` (`{ highest: 50, high: 40, medium: 30, low: 20, lowest: 10, unset: 30 }`), `status`, `staleness`, `due`, `blocker`, `manual` holding the other Global Constraints values, and `blockerLinkNames`; a `weights` override merges one level deep per key), and `scoreIssue(input: ScoringInput, options?: { now?: Date, weights?: Partial<typeof DEFAULT_PRIORITY_WEIGHTS> }) => { score: number, components: { priority, status, staleness, due, blocker, manual }, reasons: string[] }`. `ScoringInput = { key, jiraPriority, status, updated, dueDate, manualPriority, blocks, blockedBy }` (all optional; missing is neutral). `weights` merges over defaults by key; unknown keys ignored. Reasons are in the order priority, status, staleness, due, blocker, manual and only for components that are non-zero or, for priority, always (e.g. `"High priority (+40)"`, `"Overdue (+25)"`, `"Blocks another open issue (+30)"`).

Use `now = new Date("2026-10-28T12:00:00Z")` (a Wednesday) in all tests.

- [ ] **Step 0: Branch.** From the current branch (`gmaxey_work_sync`, which contains the merged `work/pilot`; there is no local `pilot`), run `git switch -c gmaxey_suggested_order`. Confirm the base with the user if they want it taken from `origin/pilot` instead. Commit the spec and this plan first: `git add docs/superpowers/specs/2026-10-28-suggested-order-design.md docs/superpowers/plans/2026-10-28-suggested-order.md && git commit -m "docs: spec and plan for suggested order"`.
- [ ] **Step 1: Write failing tests** in `tests/workPriorityScore.test.mjs` (`describe("scoreIssue")`), each calling `scoreIssue(input, { now })`:
  - `"jira priority bands"`: `jiraPriority` "Highest"/"High"/"Medium"/"Low"/"Lowest" -> `components.priority` 50/40/30/20/10; "high" lower-case -> 40; "" , undefined, "Blocker-ish" -> 30.
  - `"status bands"`: "In Progress", "analyzing", "Ready for Verification" -> `components.status` 20; "Backlog", "Ready for Work", "Something New", undefined -> 5.
  - `"staleness bands"` with status "In Progress": `updated` 1d/2d ago -> 5; 3d, 6d -> 10; 7d, 14d -> 15; 15d, 29d -> 20; 30d, 90d -> 25. Future `updated` and `"garbage"` -> 0 for garbage and 5 for future (negative days treated as 0 days), no throw.
  - `"backlog staleness cap"`: status "Backlog", `updated` 40d ago -> `components.staleness` 10; same date with "In Progress" -> 25.
  - `"due bands"`: `dueDate` "2026-10-27" -> 25; "2026-10-28" -> 25; "2026-10-29", "2026-10-30", "2026-11-02" -> 15; "2026-11-03" -> 0; `null` and "2026-13-45" -> 0. With `now` Friday `2026-10-30T12:00:00Z`: "2026-11-04" -> 15, "2026-11-05" -> 0.
  - `"blocker flags"`: `{blocks:true}` -> 30; `{blockedBy:true}` -> 20; both -> 50; neither -> 0.
  - `"manual priority"`: 1 -> 30; 10 -> `Math.round(30*11/20)` (17); 20 -> 2; 0, null, undefined, "abc" -> 0; "5" -> `Math.round(30*16/20)` (24); 25 -> 2 (treated as 20).
  - `"full example"`: `{jiraPriority:"High", status:"In Progress", updated: 8 days ago, dueDate:"2026-10-20", blocks:true, manualPriority:1}` -> score 160 and reasons exactly `["High priority (+40)", "In Progress (+20)", "Stale 8 days (+15)", "Overdue (+25)", "Blocks another open issue (+30)", "Manual priority 1 (+30)"]`.
  - `"empty input is neutral"`: `scoreIssue({}, {now}).score` -> 30 (priority unset) + 5 (other open status) = 35, with no staleness (missing `updated` scores 0) and reasons containing only the priority and status lines.
  - `"weights override"`: `scoreIssue({jiraPriority:"High"}, {now, weights:{priority:{high:99}}})` has `components.priority` 99; an unknown key `{bogus:1}` changes nothing; the exported `DEFAULT_PRIORITY_WEIGHTS` is frozen and unchanged afterwards.
- [ ] **Step 2: Run** `node --test tests/workPriorityScore.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `shared/workPriorityScore.mjs` with the exports above. Business days: iterate day by day from the UTC date of `now`, counting Mon-Fri, until 3 are counted; a due date after today and on or before that third business day scores 15. Parse due dates strictly (`YYYY-MM-DD`, valid calendar date) and `updated` with `Date.parse`; day counts use whole UTC days. Do not mutate inputs.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git add shared/workPriorityScore.mjs tests/workPriorityScore.test.mjs && git commit -m "feat: add work priority scorer"`.

### Task 2: `toScoringInput` and `rankIssues`

**Files:**
- Modify: `shared/workPriorityScore.mjs`
- Test: `tests/workPriorityScore.test.mjs`

**Interfaces:**
- Consumes: `scoreIssue`, `DEFAULT_PRIORITY_WEIGHTS` from Task 1.
- Produces: `toScoringInput(issue: object, extras?: { effectiveDueDate?: string|null, manualPriority?: number|string|null, weights?: object }) => ScoringInput` and `rankIssues(inputs: ScoringInput[], options?: { now?: Date, weights?: object }) => Array<ScoringInput & { score, components, reasons }>` (new array, inputs not mutated).

- [ ] **Step 1: Write failing tests** (`describe("toScoringInput")`, `describe("rankIssues")`):
  - `"reads standard Jira shape"`: issue with `key`, `fields.priority.name`, `fields.status.name`, `fields.updated` -> those values in the result; `dueDate` is the `effectiveDueDate` extra, `manualPriority` the extra.
  - `"flattened shape fallback"`: `{key:"A-1", status:"In Progress", summary:"x"}` with no `fields` -> `status` "In Progress", no throw.
  - `"blocks flag"`: `fields.issuelinks` containing `{type:{outward:"blocks", inward:"is blocked by"}, outwardIssue:{key:"B-1", fields:{status:{name:"In Progress"}}}}` -> `blocks` true, `blockedBy` false; with linked status "Done" or `statusCategory.key:"done"` -> false.
  - `"blockedBy flag"`: an `inwardIssue` link whose `type.inward` is " Is Blocked By " (case/space variants) with an open linked issue -> `blockedBy` true.
  - `"custom link names"`: with `weights:{blockerLinkNames:{blocks:["depends on"], blockedBy:[]}}` an outward "depends on" link sets `blocks`; with defaults an outward "depends on" link sets neither flag and `scoreIssue` on the result still returns a valid score.
  - `"malformed links ignored"`: links missing both issues, or a linked issue without `key`, and `issuelinks` not an array -> no flags, no throw.
  - `"rankIssues order"`: three inputs with scores 100/80/80 -> highest first; the two tied are ordered by manual priority (1 before unset), then earlier due date (null last), then key ("A-1" before "A-2"); output items carry `score`, `components`, `reasons`; the input array and objects are unchanged; same inputs and `now` twice give deep-equal output.
- [ ] **Step 2: Run** `node --test tests/workPriorityScore.test.mjs`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** both functions. Linked issue is open unless `fields.status.statusCategory.key === "done"` or `fields.status.name` matches `/(closed|resolved|done)/i`. `toScoringInput` accepts optional `weights.blockerLinkNames` overriding the defaults. `rankIssues` scores each input then sorts per Global Constraints.
- [ ] **Step 4: Run** the file. Expected: all PASS.
- [ ] **Step 5: Commit** `git add shared tests && git commit -m "feat: add scoring input mapping and ranking"`.

### Task 3: Fetch the Jira priority field

**Files:**
- Modify: `server/lib/jiraSearchFields.mjs` (add `"priority"` to `BASE_SEARCH_FIELDS`)
- Test: `tests/jiraSearchFields.test.mjs`

**Interfaces:**
- Produces: `getJiraSearchFields(db)` now always includes `"priority"` (exactly once, including when a field mapping or `combinedOpenWork`'s extra `"priority"` repeats it).

- [ ] **Step 1: Write failing test** `"includes priority exactly once"`: pass a fake db `{ prepare: () => ({ all: () => rows }) }` where `rows` is `[{ field_id: "priority" }, { field_id: "customfield_10008" }]` (do not use `better-sqlite3`: its native build in `node_modules` is for macOS and will not load where the tests may run), call `getJiraSearchFields(db)`, assert `fields.includes("priority")` and `fields.filter(f => f === "priority").length === 1`, and that `summary`, `issuelinks`, `updated` remain.
- [ ] **Step 2: Run** `node --test tests/jiraSearchFields.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the one-line addition.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS (no other test asserted the field list; if one fails, update its expected list to include `priority`).
- [ ] **Step 5: Commit** `git add server/lib/jiraSearchFields.mjs tests/jiraSearchFields.test.mjs && git commit -m "feat: fetch Jira priority field in shared searches"`.

### Task 4: Server week-plan context with validated scores

**Files:**
- Create: `server/lib/weekPlanContext.mjs`
- Modify: `server/routes/reportRoutes.mjs:684-710` (replace the inline `contextLines` building in `/api/plan/week` with a call to the new module)
- Test: `tests/weekPlanContext.test.mjs`

**Interfaces:**
- Produces: `sanitizeScoredTask(task: object) => { score: number|null, why: string[] }` and `buildWeekPlanContext({ projects, capacityHours, focusStyle, additionalContext }) => string`. The output is today's context text byte-for-byte for tasks without valid score/why; the only change otherwise is the header line `Top open tasks (ranked by suggested-order score):` and the per-task suffix ` | score N: reason; reason` (suffix omits `: reasons` when `why` is empty, and is absent when `score` is null).

- [ ] **Step 1: Write failing tests** (`node:test`, import from `../server/lib/weekPlanContext.mjs`):
  - `"renders legacy lines unchanged without score"`: one project (`label:"P"`, `total:3`, `open:2`, `overdue:1`, one task with `isOverdue:true`) and no `score` -> context contains `- Work week capacity: 40 hours`, `### P`, `- Total: 3 | Open: 2 | Overdue: 1`, and the exact line `  - A-1: Sum (In Progress, assigned: Me) [OVERDUE]`; header for ranked section is `Top open tasks (ranked by suggested-order score):`.
  - `"renders score and reasons"`: task with `score:160, why:["High priority (+40)","Overdue (+25)"]` -> line ends `[OVERDUE] | score 160: High priority (+40); Overdue (+25)`.
  - `"clamps and rounds score"`: 900 -> 500, -5 -> 0, 12.6 -> 13.
  - `"drops invalid score"`: `Infinity`, `NaN`, `"160"`, `null` -> no suffix.
  - `"sanitizes why"`: a string instead of array -> no reasons; 12 items -> first 8; item with `"a\nb\u0007c"` -> `"abc"` on one line; 200-char item -> 120 chars; non-string items dropped.
  - `"empty slot still renders"`: project with `tasks:[]` -> header and counts lines present, no task lines, no throw.
  - `"caps at 10 tasks"`: 12 tasks -> 10 lines.
- [ ] **Step 2: Run** `node --test tests/weekPlanContext.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the module by moving the existing context-building code out of the route unchanged, then adding the sanitizer and suffix. In the route, keep reading `projects`, `focusStyle`, `capacityHours`, `additionalContext` and the `400` for empty `projects` exactly as now, and call `buildWeekPlanContext(...)`.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `git add server/lib/weekPlanContext.mjs server/routes/reportRoutes.mjs tests/weekPlanContext.test.mjs && git commit -m "feat: render ranked week plan tasks with validated scores"`.

### Task 5: Week-plan prompt rules

**Files:**
- Modify: `server/lib/aiInstructions.mjs:327-345` (`buildWeekPlanSystemPrompt`)
- Test: `tests/aiInstructions.test.mjs`

**Interfaces:**
- Consumes: nothing new. Produces: `buildWeekPlanSystemPrompt({ focusStyle, capacityHours, customInstructions })` output now includes a "Pre-ranked tasks" rule block.

- [ ] **Step 1: Write failing test** `"week plan prompt explains pre-ranked tasks"`: `const prompt = buildWeekPlanSystemPrompt({ focusStyle: "balance", capacityHours: 40 })`; assert it contains the substrings `pre-ranked`, `best first`, `Do not invent scores or reasons`, and still contains `Only reference actual issue keys` and `Flag overdue items with`. Add the import to the existing import list.
- [ ] **Step 2: Run** `node --test tests/aiInstructions.test.mjs`. Expected: new test FAILS.
- [ ] **Step 3: Implement** by adding to the `Rules:` list: tasks are pre-ranked best first with a score and reasons; keep that order within the plan unless fixed commitments or capacity force a change and then say so in one clause; quote a score or reason only exactly as given; "Do not invent scores or reasons."
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `git add server/lib/aiInstructions.mjs tests/aiInstructions.test.mjs && git commit -m "feat: tell week plan model tasks are pre-ranked"`.

### Task 6: Client payload builder and panel wiring

**Files:**
- Create: `src/utils/weekPlanProjects.js`
- Modify: `src/Pages/components/WeeklyPlanPanel.jsx:36-39` (remove local `isIssueOpen`, import it) and `:125-143` (replace the inline `projects` mapping with `buildWeekPlanProjects(jqlRuns, jiraRowPriorities)`)
- Test: `tests/weekPlanProjects.test.mjs`

**Interfaces:**
- Consumes: `toScoringInput`, `rankIssues` (Tasks 1-2); `getEffectiveDueDateForIssue` from `src/utils/jiraIssueDoneDates.js`; `isConfiguredJqlRun` from `src/utils/workWeekStorage.js`.
- Produces: `isIssueOpen(issue) => boolean` (same regex rule as today) and `buildWeekPlanProjects(jqlRuns: object[], jiraRowPriorities: Record<string, number|string>, options?: { now?: Date }) => Array<{ label, total, open, overdue, tasks: Array<{ key, summary, status, assignee, isOverdue, score, why }> }>`. For each configured run with issues: `open`/`overdue`/`total`/`label` as today (`overdue` still counts `i.isOverdue`); tasks are the open issues ranked by `rankIssues` (effective due date from `getEffectiveDueDateForIssue(issue, { dueFieldId: run.dueFieldId, mrdFieldId: run.mrdFieldId, parentMostRecentDoneDateByKey: run.parentMostRecentDoneDateByKey })`, manual priority from `jiraRowPriorities[issue.key]`), first 10, with `score` and `why` (the reasons array) added. `jiraRowPriorities` is never mutated.

- [ ] **Step 1: Write failing tests** (import from `../src/utils/weekPlanProjects.js`; run fixtures need non-empty `label` and `jql` so `isConfiguredJqlRun` is true, plus `issues`):
  - `"ranks open tasks by score, not manual priority alone"`: two open issues, A with manual priority 1 and Low Jira priority, B with Highest priority, overdue effective due date and manual priority 20 -> B ranks first; each task has numeric `score` and a non-empty `why`.
  - `"closed issues excluded and counted"`: a Done issue is absent from `tasks`, counted in `total`, not in `open`.
  - `"caps at ten"`: 12 open issues -> 10 tasks.
  - `"does not mutate manual priorities"`: `jiraRowPriorities` deep-equal before and after, including a string value "5".
  - `"uses run due-date context"`: an issue with no `duedate` whose parent done date is supplied via `run.parentMostRecentDoneDateByKey` and `run.mrdFieldId` gets the overdue component in `why`.
  - `"flattened issue shape"`: `{key, summary, status:"In Progress", assignee:"X"}` yields a task with that status and summary and no throw.
  - `"skips unconfigured runs and empty runs"`: returns only runs that are configured and have issues.
  - `"empty open set"`: a run whose issues are all Done yields `tasks: []`, `open: 0`.
- [ ] **Step 2: Run** `node --test tests/weekPlanProjects.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the util by moving the existing mapping logic and `isIssueOpen` from the panel; keep field fallbacks exactly (`i.fields?.summary || i.summary`, `i.fields?.status?.name || i.status`, `i.fields?.assignee?.displayName || i.assignee || "Unassigned"`, `Boolean(i.isOverdue)`). In the panel, call `buildWeekPlanProjects(jqlRuns, jiraRowPriorities)` and leave everything else in `handleGenerate` as is.
- [ ] **Step 4: Run** `npm test && npm run build`. Expected: tests PASS, build succeeds.
- [ ] **Step 5: Verify manually** (no live Jira is claimed): `npm run dev:all`, open Work Week with fixture or saved data, generate a week plan, and confirm the request body to `/api/plan/week` has `score` and `why` on tasks, tasks are in score order, and the generated plan reflects that order. Also note whether `[OVERDUE]` ever appears: while reading `WeeklyPlanPanel` I could not find where run issues get `isOverdue` set, so the existing overdue flag and count may always be false. Report what you see to the user; do not change `isOverdue` in this plan.
- [ ] **Step 6: Check blocker link names per Jira instance** before relying on blocker scoring there: for each saved instance other than ODI (ODI is confirmed to use "blocks" / "is blocked by"), list `GET /rest/api/3/issueLinkType` and confirm those names exist. Where they do not, tell the user; supporting other names is a follow-up (the `blockerLinkNames` config is the hook), not part of this plan.
- [ ] **Step 7: Commit** `git add src/utils/weekPlanProjects.js src/Pages/components/WeeklyPlanPanel.jsx tests/weekPlanProjects.test.mjs && git commit -m "feat: rank week plan tasks with suggested-order score"`.
