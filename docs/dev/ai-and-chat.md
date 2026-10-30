# AI reports and Chat

[← Developer Guide index](../DEVELOPER_GUIDE.md)

## AI report system prompts

### `/api/report/project` (Task Management — My Metrics)
Written **from the assignee's perspective**, second person ("you have", "your open items"). Tone: supportive colleague, not manager status update. Covers: overall tracking %, key open items, overdue concerns, recommended next steps. Flowing prose, no bullet lists.

### Writing style rules (all report prompts)
`REPORT_WRITING_STYLE_RULES` in `server/lib/aiInstructions.mjs` is appended to the Status Report, 1:1 Prep and PWB Review prompt builders (`STATUS_REPORT_PROMPT_BODY` is split out so it can be appended) and to the dashboard audience `systemParts` in `server/routes/reportRoutes.mjs`. It bans hedged numbers, vague verbs, activity without an outcome, filler phrases and details not in the data. Add new report prompts to the same list so they inherit it; `tests/aiInstructions.test.mjs` covers the builders.

### `/api/report/generate` (Dashboard — Generate Report)
Four audience variants — `AUDIENCE_CONFIGS` in `server/lib/aiInstructions.mjs`, keyed by `audience` in the request body (`AUDIENCE_OPTIONS` in `useReportGeneration.js` is the frontend mirror):
- **`executive`** — Executive Summary: highlights, risks, action items for leadership
- **`product_owner`** — Project Manager Summary: deadline realism, stakeholder impact, delay risks, stand-up summaries, closeout reports (key kept as `product_owner` for backward compatibility; the label was renamed)
- **`developer`** — Developer Report: team workload and WIP, plus a full per-contributor status breakdown (`rollupEpicContributorPeople` + `ContributorStatusBar`, not just overdue counts)
- **`direct_reports`** — Ad-hoc team report: `isAdhocTeamReport` in `reportRoutes.mjs`; scoped to Settings → My Direct Reports rather than the selected project presets

### `/api/plan/week` (Task Management — Help me plan my week)
Day-by-day plan for the working days left in the week using actual issue keys from the loaded JQL runs. Respects `focusStyle` (balance / overdue-first / single-project / meeting-heavy), `capacityHours`, `fixedCommitments`, and `additionalContext`. Flags overdue items with ⚠️.

**Data flow:** `WeeklyPlanPanel.jsx` → `buildWeekPlanProjects` (`src/utils/weekPlanProjects.js`) → `generateWeekPlan` → `POST /api/plan/week` → `buildWeekPlanContext` (`server/lib/weekPlanContext.mjs`) → `buildWeekPlanSystemPrompt`.

- **Scope:** drill-down runs (`isDrillDown` / `isPendingDrillDown`) are skipped. On Generate the panel calls `fetchJiraMyself()` and keeps only open issues assigned to that user (`isAssignedToUser`: accountId, display-name fallback; unassigned excluded). If the lookup fails the plan runs unfiltered and `describePlanScope` prepends a "Data used" note to the plan text.
- **Ranking:** `shared/workPriorityScore.mjs` (`scoreIssue`, `rankIssues`, `DEFAULT_PRIORITY_WEIGHTS`) is a pure scorer: score = Jira priority + staleness + status + blocker + due + manual. "Today" is the user's **local** calendar date; the due date is the issue's own field only (no parent fallback). `toScoringInput` also returns `blocksKeys` / `blockedByKeys`. Each task carries `score`, `why`, `dueDate`, `blocks`, `blockedBy`, `isOverdue`; at most 10 tasks per run are sent.
- **Overdue** uses `isIssueOverdueForMetrics` — the Metrics-page rule — not the Dashboard **Compare against** filter. Due dates typed into the table (`dueDateDrafts`) count before they are saved to Jira.
- **Priorities:** with team DB enabled the hook merges `{...local, ...team}`; `pickPlanPriorities` uses the local-only set when the **Include team priorities** box is cleared.
- **Prompt:** `buildWeekPlanContext` adds `Today`, `Days to plan`, and per-task `| due`, `| blocked by`, `| blocks`, `| score` fields. `WEEK_PLAN_SCORE_KEY` is generated from `DEFAULT_PRIORITY_WEIGHTS`, so changing a weight updates the key. Rules in `aiInstructions.mjs` cover due-date scheduling, >90-day stale triage (≤1h), blocker naming, "suggested working time" wording, and a ~15% buffer.

Tests: `tests/workPriorityScore.test.mjs`, `tests/weekPlanProjects.test.mjs`, `tests/weekPlanContext.test.mjs`, `tests/aiInstructions.test.mjs`.

---


## Chat session context

Each `POST /api/chat` request includes an `epicContext` object from the browser:

| Field | Source | Purpose |
|-------|--------|---------|
| `selectedEpics` | Chat epic filter panel | Preset labels, keys, and JQL for scoped searches |
| `includePastDue` | Chat epic filter panel | Whether past-due filter is active |
| `sessionContext` | `buildChatSessionContext()` in `src/utils/chatSessionContext.js` | Task Management queries, dashboard snapshot, generated artifacts |

`sessionContext` is built client-side on each send:

1. **JQL queries** — summarized from the site-scoped `localStorage` logical key `workWeekTasksJiraLastJqlRuns` (label, JQL, counts, top open issues).
2. **Dashboard snapshot** — refreshed via `GET /api/dashboard/metrics` on Chat load and again on each send. Summary includes separate `dueByPastDueCount` and `dueByUpcomingCount` when `dueByDate` is set.
3. **Artifacts** — last 8 generated reports/plans from the site-scoped `localStorage` logical key `taskManagerChatSessionArtifacts`.

Artifacts are saved when the user generates:

| Artifact `type` | Saved from |
|-----------------|------------|
| `work_week_project_report` | Work Week → My Metrics → Project Report |
| `week_plan` | Task Management → Help me plan my week |
| `dashboard_report` | Dashboard → Generate Report |

Ad-hoc Chat saves use `saveAdHocReport()` → `POST /api/reports/archive` (not added to the 8-artifact Chat cache unless the user also generated a report in-session).

`server/lib/chatProviders.mjs` calls `formatChatSessionContext()` from `shared/chatSessionPrompt.mjs` to append this material to the system prompt. The model is instructed to use session context (especially artifacts) before running new Jira searches when the user asks about reports or queries they already ran.

`POST /api/chat` body shape:

```json
{
  "message": "What did my week plan say about Monday?",
  "epicContext": {
    "selectedEpics": [{ "label": "...", "epicKey": "...", "jql": "..." }],
    "includePastDue": false,
    "sessionContext": {
      "jqlQueries": [],
      "artifacts": [],
      "dashboardSnapshot": null
    }
  }
}
```

---


## Adding a new AI report type

1. Add a new route in `server/routes/reportRoutes.mjs` following the `app.post("/api/report/project", ...)` pattern — call `callLLMForReport({ systemPrompt, context, label })` (pass a human-readable `label` string so the info log reads correctly) and return `res.json({ report, label })`.
2. Add a client function in `src/services/jiraClient.js`.
3. Create a panel component (or extend an existing one) following the `ProjectReportPanel` pattern: `loading`, `report`, `error`, `copied` state; `Generate` → `Copy` → `Download` buttons. Use `runBackgroundJob()` if generation can take long and users may navigate away.
4. Wrap in `<CollapsibleSection>` on Task Management or Dashboard.
5. If the output should be available in Chat, call `saveChatSessionArtifact()` from `src/utils/chatSessionContext.js` after a successful generation (see existing report/plan panels).

---

More setup detail: [JIRA_SETUP.md](../JIRA_SETUP.md)
Non-technical usage: [END_USER_GUIDE.md](../END_USER_GUIDE.md).
App overview: [README.md](../../README.md)

---

[← Developer Guide index](../DEVELOPER_GUIDE.md)
