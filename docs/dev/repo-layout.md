# Repo layout

[← Developer Guide index](../DEVELOPER_GUIDE.md)

```
taskManager/
├── electron/
│   └── main.cjs              # Spawns proxy, loads Vite dev URL or dist/
├── server/
│   ├── jiraProxy.mjs         # Entry point — mounts all route modules
│   ├── db/
│   │   ├── schema.mjs        # Site SQLite schema + reused goals/report schemas
│   │   ├── todoDatabase.mjs  # App-wide personal To Dos + migration ledger
│   │   └── team/             # Explicit PostgreSQL migrations
│   ├── lib/
│   │   ├── savedSiteOperations.mjs # Captured saved-entry revision checks and source DB handles
│   │   ├── jiraRouteContext.mjs # Request-local Jira helpers
│   │   ├── combinedWorkStore.mjs # Dedicated Combined Work goals/archive store
│   │   ├── teamPriorityPostgres.mjs # Optional Team metadata, preference, pool and data access
│   │   ├── logger.mjs        # Structured logger (createLogger); respects LOG_LEVEL
│   │   ├── llmClient.mjs     # Shared Anthropic / OpenAI / Ollama client
│   │   ├── chatProviders.mjs # Chat prompts + routing (LLM or Rovo)
│   │   ├── rovoChat.mjs      # Opt-in Rovo MCP path + LLM fallback
│   │   ├── dashboardRefresh/ # Dashboard refresh pipeline (parse → metrics → persist)
│   │   ├── epicFilterJql.mjs # JQL builders (metrics scope, past due, presets)
│   │   ├── jiraSearchHelpers.mjs # Paginated Jira search + user search
│   │   ├── jiraParentCandidates.mjs # JQL → parent chain walk for Create Issue
│   │   ├── jiraCreateIssueFields.mjs # createmeta-driven Jira create payload
│   │   ├── jiraCommentText.mjs   # ADF → plain text; bulk latest comments
│   │   ├── reportArchive.mjs     # generated_reports CRUD + source filters
│   │   ├── weeklyDigest.mjs  # Snapshot → markdown weekly digest
│   │   └── jiraSearch*.mjs   # Jira REST helpers
│   └── routes/
│       ├── appConfigRoutes.mjs    # Settings, field mappings, presets
│       ├── capacityPlanningRoutes.mjs # Project Managers capacity endpoint
│       ├── chatRoutes.mjs         # /api/chat/*
│       ├── dashboardRoutes.mjs    # /api/dashboard/*
│       ├── issueMetadataRoutes.mjs# Notes + priority + start date (SQLite); Due date/MRD push to Jira
│       ├── jiraCoreRoutes.mjs     # Health, user, fields
│       ├── jiraIssueRoutes.mjs    # Status/assignee updates, create issue
│       └── reportRoutes.mjs       # /api/report/* + /api/plan/week
├── shared/
│   ├── dashboardMetrics.mjs   # Pure metrics helpers (server + UI); issue type family matching
│   ├── odiIssueStandards.mjs  # create validation (Job Story, bug structure, parent rules)
│   ├── odiCreateIssueFields.mjs # Components / Vertical / BUG Tracking defaults
│   ├── createIssuePresetUtils.mjs # Preset dropdown values, JQL epic key extraction
│   ├── createIssueParentUtils.mjs # Manual key validation + query-issue parent resolution
│   ├── jiraParentCandidates.mjs   # Parent chain walk + dropdown builders (shared UI/server)
│   ├── jiraDescriptionAdf.mjs     # Markdown description → Jira ADF (via markdownToAdf)
│   ├── markdownToAdf.mjs          # Note-comment markdown (bold/italic/code/links/lists/headings) → Jira ADF
│   ├── issuePriority.mjs          # MAX_ISSUE_PRIORITY + clampIssuePriority (P0–P20)
│   └── chatSessionPrompt.mjs  # Formats Chat session context for LLM prompts
├── tests/
│   ├── dashboardMetrics.test.mjs
│   ├── epicFilterJql.test.mjs
│   ├── odiIssueStandards.test.mjs
│   ├── jiraCreateIssueFields.test.mjs
│   ├── jiraParentCandidates.test.mjs
│   ├── createIssuePresetUtils.test.mjs
│   ├── chatSessionPrompt.test.mjs
│   ├── markdownToAdf.test.mjs
│   └── issuePriority.test.mjs
├── src/
│   ├── context/
│   │   ├── EpicFiltersContext.jsx  # Active-site preset + selection state
│   │   └── TodosContext.jsx        # Personal To Dos outside the site-remounted subtree
│   ├── Pages/
│   │   ├── WorkWeekTasks.jsx       # Task Management page shell
│   │   ├── CombinedOpenWork.jsx    # Mixed Managed tasks / List views + My Metrics
│   │   ├── combinedWorkModel.js    # Source-aware rows and deduplicated metrics
│   │   ├── combinedWorkReports.js  # Combined report summaries and history
│   │   ├── Dashboard/              # Dashboard feature (index.jsx, hooks, components)
│   │   │   ├── index.jsx
│   │   │   ├── hooks/              # useDashboardRefresh, useReportGeneration
│   │   │   ├── components/         # DashboardTabs, filters, due-date lists, epic cards, IndividualContributorsPanel, ContributorStatusBar, WeeklyDigestPanel
│   │   │   └── utils/              # dashboardMetricsUtils (presets, splitDueByIssues)
│   │   ├── Dashboard.jsx           # Re-exports Dashboard/index
│   │   ├── Settings/               # Settings feature folder
│   │   │   ├── index.jsx           # Orchestrator: loads data, mounts sections
│   │   │   └── components/
│   │   │       ├── SettingsSection.jsx       # Shared collapsible accordion wrapper
│   │   │       ├── settingsSection.css       # Styles for SettingsSection (gradient header, hover depth)
│   │   │       ├── PresetsSection.jsx        # Epic & JQL presets CRUD
│   │   │       ├── DateFieldsSection.jsx     # Field mappings + past-due rules
│   │   │       ├── MetricTargetsSection.jsx  # Contributor Metrics (people + custom queries)
│   │   │       ├── WorkWeekHeaderSection.jsx # Joke ticker + due-date banner toggles
│   │   │       └── ChatAssistantSection.jsx  # Chat instructions + provider status
│   │   ├── Settings.jsx            # Re-exports Settings/index
│   │   ├── Chat.jsx                # Chat page (+ Save to Past Reports)
│   │   ├── ProjectManagers.jsx     # Capacity planning from Contributor Metrics entries
│   │   ├── ReportArchive.jsx       # Past Reports page (Task Management / Dashboard / Ad-hoc tabs)
│   │   ├── workWeekTaskElements.css
│   │   ├── priorityScale.css               # Priority colour data encoding (P1–P20, do not retint)
│   │   ├── dashboard.css
│   │   ├── components/
│   │   │   ├── JiraResultsTable.jsx
│   │   │   ├── cells/AssigneeCell.jsx       # Debounced Jira user search + assignee update
│   │   │   ├── TaskManagerHeaderPanel.jsx
│   │   │   ├── EpicFilterPanel.jsx
│   │   │   ├── CreateIssueModal.jsx
│   │   │   ├── JiraFilterImportModal.jsx
│   │   │   ├── WeeklyPlanPanel.jsx          # Help me plan my week (extracted)
│   │   │   ├── MyMetricsSection.jsx         # My Metrics collapsible (extracted)
│   │   │   ├── ProjectReportPanel.jsx       # Per-run AI project report (extracted)
│   │   │   └── JqlRunMetrics.jsx            # Chips + progress bar (extracted)
│   │   └── hooks/
│   │       ├── useTaskManagerJira.js        # All Task Management Jira state + handlers
│   │       ├── jiraJqlRunWorkflow.js        # Run JQL, load remaining, priority-from-comment sync
│   │       ├── useEpicFilters.js            # Thin re-export shim (kept for any legacy uses)
│   │       ├── usePersistedState.js         # localStorage wrapper
│   │       ├── useFlash.js                  # Transient success messages
│   │       ├── useJokeTicker.js
│   │       ├── useUpcomingDueBanner.js
│   │       ├── useWorkWeekHeaderPreferences.js
│   │       └── useCalendarData.js
│   ├── Components/
│   │   ├── BackgroundJobIndicator.jsx  # Nav pill for in-flight background jobs
│   │   ├── CollapsibleSection.jsx      # Shared collapsible (Task Management + Metrics)
│   │   ├── collapsible.css
│   │   ├── ReportOutput.jsx
│   │   └── StatusPieChart.jsx          # Pie / bar chart (no external library)
│   ├── AppRouter.jsx                   # Router + EpicFiltersProvider + nav layout
│   ├── AppRouter.css                   # Nav styles (colocated with AppRouter.jsx)
│   ├── services/
│   │   ├── jiraClient.js          # fetch → proxy wrappers (all API calls)
│   │   └── apiBase.js             # Runtime proxy URL resolution
│   ├── hooks/
│   │   └── useBackgroundJobs.js   # Subscribe / attach to backgroundJobStore
│   └── utils/
│       ├── siteContextStore.js    # Site/Combined browser namespaces and recovery notice
│       ├── backgroundJobStore.js  # Module-level jobs that survive route changes
│       ├── chatSessionContext.js  # Chat session artifacts + JQL/dashboard summaries
│       ├── pageReportPersistence.js # On-page report/plan localStorage + clear helpers
│       ├── jiraIssueDoneDates.js  # Work Week MRD display + parent-chain inheritance
│       ├── jqlRunPersistence.js   # Persist JQL runs when workflow completes off-page
│       ├── workWeekNavigation.js  # buildWorkWeekHref({ key, assignee, epicPresetId }) for drill-down
│       ├── statusScale.js         # Status colour data encoding (do not retint) - shared by charts, MetricBar
│       └── format.js              # formatPercent, formatTimestamp
├── docs/                     # ← you are here
│   ├── END_USER_GUIDE.md     # Day-to-day usage (incl. browser-as-app)
│   ├── DEVELOPER_GUIDE.md    # Architecture / API / schema
│   ├── JIRA_SETUP.md         # Credentials and Jira config
│   ├── unsigned-installs.md  # Unsupported installers + local launch guidance
│   ├── PR_WriteUps/          # Per-PR summaries for review
│   ├── specs/                # Feature specs (e.g. team priority sync)
│   ├── canvases/             # Cursor docs-canvas mirror
│   └── examples/             # Sample reports / prompts
├── data/                     # Separate local stores and note-image folders (git-ignored)
├── .env                      # Credentials — never commit
└── vite.config.js
```

---

[← Developer Guide index](../DEVELOPER_GUIDE.md)
