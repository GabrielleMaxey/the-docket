# Frontend patterns

[← Developer Guide index](../DEVELOPER_GUIDE.md)

## State persistence

Browser keys below are logical names. Site-scoped helpers prefix them with `docket:site:<instanceId>:` (or `docket:site:legacy:`); Combined report/job state uses `docket:combined-work:`. Unscoped legacy records are never adopted based on issue-key matches. The browser recovery banner can be dismissed via `docket:legacy-site-recovery-dismissed`; acknowledgement preserves the original values. Blocked browser storage falls back to session-only dismissal. Ambiguous old shared-row priority/planning caches also stay at their original keys while authoritative Local and available Team values hydrate separately.

| Data | Mechanism | Key(s) |
|------|-----------|--------|
| JQL inputs, labels, count | `localStorage` | `workWeekTasksJiraPreferences` |
| Last JQL results snapshot | `localStorage` | `workWeekTasksJiraLastJqlRuns` |
| Work Week drill-down runs | `sessionStorage` | `workWeekTasksJiraDrillDownRuns` |
| Jira notes + row priorities (UI cache) | `localStorage` | `workWeekTasksJiraNotes`, `workWeekTasksJiraRowPriorities` |
| Chat session artifacts (reports/plans for Chat context) | `localStorage` | `taskManagerChatSessionArtifacts` |
| On-page Metrics report | `localStorage` | `taskManagerPersistedDashboardReport` |
| On-page Work Week project reports | `localStorage` | `taskManagerPersistedWorkWeekProjectReports` |
| On-page week plan | `localStorage` | `taskManagerPersistedWeekPlan` |
| Work Week notes-on-run preference | `localStorage` | `workWeekTasksJiraPreferences` → `pullLatestComment` |
| Work Week header banners | `localStorage` | `workWeekTasksHeaderPreferences` (`showJokeTicker`, `showUpcomingDueBanner`) |
| Collapsible open/closed (including header calendar/reminders panel) | `localStorage` via `usePersistedState` | various `ww-*` / `dashboard-*` keys, e.g. `ww-today-details-open` |
| Dashboard visible sections | `localStorage` | `dashboard-visible-sections` (`dueByUpcoming`, `dueByPastDue`, …) |
| Issue notes + P1–P20 (persisted) | SQLite via proxy | `issue_metadata` |
| Personal To Dos / completed history | App-wide SQLite via proxy | `personal-todos.sqlite` → `todos`, migration ledger |
| Generated reports archive | Site SQLite or dedicated Combined store | `generated_reports`; Combined scope is isolated |
| Combined report goals | `docket-combined.sqlite` | `app_settings`, independent of selected entries |
| Use team DB preference | `instances-meta.sqlite` | `jira_instance_meta.use_team_db`, default off |
| Dashboard snapshot | SQLite via proxy | `dashboard_snapshots` (+ related metric tables) |
| Historical packaged desktop `.env` + SQLite | OS user data folder | Unsupported; see historical recovery notes below |
| Epic preset selections (Dashboard/Chat) | `localStorage` | `epicFilterSelectedIds` |
| Rovo OAuth tokens | SQLite via proxy | `chat_sessions` |

### Background jobs (survive navigation)

Long-running UI actions run through `src/utils/backgroundJobStore.js` via `runBackgroundJob()` in `src/hooks/useBackgroundJobs.js`. Jobs keep running when the user navigates away; `BackgroundJobIndicator` in the nav shows in-progress work. Pages re-attach on mount with `useAttachBackgroundJob()` and merge loading state with `useBackgroundJobRunning()`. Results are persisted inside the job `run()` callback so returning to the page shows completed output even if React state was torn down.

| `BACKGROUND_JOB_IDS` | Trigger | Persisted result |
|----------------------|---------|------------------|
| `dashboard-refresh` | Dashboard **Refresh status** | SQLite snapshot |
| `dashboard-report` | Dashboard LLM report | `localStorage` (`taskManagerPersistedDashboardReport`) |
| `dashboard-weekly-digest` | Weekly digest panel | In-page state (regenerate anytime) |
| `work-week-jql-run` | **Run JQL** / **Load remaining** | `localStorage` (`workWeekTasksJiraLastJqlRuns`) |
| `work-week-week-plan` | Week plan generate | `localStorage` week plan key |
| `work-week-project-report:{runKey}` | Per-tab project report | `localStorage` project reports map |

Wired in: `useDashboardRefresh.js`, `useReportGeneration.js`, `WeeklyDigestPanel.jsx`, `useTaskManagerJira.js`, `WorkWeekTasks.jsx` (`ProjectReportPanel`, `WeeklyPlanPanel`).

### Historical packaged desktop data (unsupported)

Packaged installers are unsupported; the packaging scripts and workflow have been removed. The retained Electron source still describes the old data layout below for recovery reference. Supported local workflows use the project `.env` and `data/` by default.

In the historical packaged path, Electron main sets `TASK_MANAGER_USER_DATA`:

| Path | Contents |
|------|----------|
| `{userData}/.env` | Jira + LLM credentials (created from template on first launch) |
| `{userData}/data/workweek.sqlite` | Notes, dashboard snapshots, archived reports, settings |

**macOS:** `~/Library/Application Support/The Docket/`  
**Windows:** `%APPDATA%\The Docket\`

Dev desktop (`npm run desktop:dev`) and browser dev use the repo `data/` folder and project-root `.env` instead.

The historical packaged path loads the UI from `http://127.0.0.1:{API_PORT}` (proxy serves `dist/`). Its former ASAR packaging configuration has been removed.

---


## Collapsible component pattern

Task Management and Dashboard share `src/Components/CollapsibleSection.jsx` (CSS: `src/Components/collapsible.css`):

```jsx
<CollapsibleSection title="Project Metrics" storageKey="epicMetrics" badge="3 projects">
  {/* content */}
</CollapsibleSection>
```

Open state persists in `localStorage` via each panel's `storageKey`.

---


## CSS design tokens (ww- namespace)

Key values used throughout `workWeekTaskElements.css`:

| Token | Value | Used for |
|-------|-------|----------|
| Border color | `#e2e8f0` | Cards, inputs, collapsibles |
| Border radius | `8px` / `12px` | Inputs / cards |
| Surface background | `#f8fafc` | Collapsible headers, input backgrounds |
| Focus ring color | `#93c5fd` | All inputs on focus |
| Focus ring shadow | `0 0 0 3px rgba(147,197,253,0.25)` | All inputs on focus |
| Primary text | `#0f172a` | Body copy |
| Muted text | `#475569` / `#94a3b8` | Labels, hints, optional markers |
| Badge background | `#e2e8f0` | Collapsible count badges |
| Badge text | `#475569` | Collapsible count badges |

---


## EpicFilters context

`src/context/EpicFiltersContext.jsx` provides `EpicFiltersProvider` and the `useEpicFilters()` hook. The provider wraps `<Outlet />` inside `AppLayout` in `AppRouter.jsx`, mounting once at app start and surviving all route changes.

State held in context: `presets`, `loading`, `error`, `selectedPresetIds`, `includePastDue`.  
Actions: `selectAll`, `clearSelection`, `togglePreset`, `setSelectedPresetIds`, `setIncludePastDue`, `reloadPresets`.

Pages that consume it — `Dashboard/index.jsx`, `Chat.jsx`, `WorkWeekTasks.jsx`, `Settings/index.jsx` — all call `useEpicFilters()` directly. `Settings` calls `reloadPresets()` after any preset mutation so the updated list propagates immediately to Work Week and Dashboard without a page reload.

`fetchEpicPresets()` runs once on provider mount (one API call total at app start, not once per page).

---

[← Developer Guide index](../DEVELOPER_GUIDE.md)
