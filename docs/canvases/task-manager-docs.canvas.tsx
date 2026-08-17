import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  CollapsibleSection,
  computeDAGLayout,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Row,
  Spacer,
  Stack,
  Stat,
  Swatch,
  Table,
  Text,
  useCanvasAction,
  useCanvasState,
  useHostTheme,
} from "cursor/canvas";

type SectionId =
  | "overview"
  | "pages"
  | "architecture"
  | "data"
  | "codebase"
  | "workflow"
  | "docs";

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "pages", label: "Pages" },
  { id: "architecture", label: "Architecture" },
  { id: "data", label: "Data storage" },
  { id: "codebase", label: "Code map" },
  { id: "workflow", label: "Dev workflow" },
  { id: "docs", label: "Doc index" },
];

// Mirror for git — see docs/canvases/README.md. File paths below are workspace-relative.

const dag = computeDAGLayout({
  direction: "vertical",
  nodeWidth: 132,
  nodeHeight: 34,
  rankGap: 48,
  nodeGap: 24,
  padding: 16,
  nodes: [
    { id: "ui" },
    { id: "local" },
    { id: "client" },
    { id: "proxy" },
    { id: "jira" },
    { id: "sqlite" },
    { id: "llm" },
    { id: "teamdb" },
  ],
  edges: [
    { from: "ui", to: "local" },
    { from: "ui", to: "client" },
    { from: "client", to: "proxy" },
    { from: "proxy", to: "jira" },
    { from: "proxy", to: "sqlite" },
    { from: "proxy", to: "llm" },
    { from: "proxy", to: "teamdb" },
  ],
});

const NODE_LABELS: Record<string, string> = {
  ui: "React UI",
  local: "localStorage",
  client: "jiraClient.js",
  proxy: "jiraProxy.mjs",
  jira: "Jira Cloud",
  sqlite: "workweek.sqlite",
  llm: "LLM / Rovo",
  teamdb: "Team DB (planned)",
};

function ArchitectureDiagram() {
  const theme = useHostTheme();

  return (
    <svg
      width={dag.width}
      height={dag.height}
      viewBox={`0 0 ${dag.width} ${dag.height}`}
      role="img"
      aria-label="Task Manager data flow: React UI through Express proxy to Jira, SQLite, LLM, and planned team priority API"
      style={{ display: "block", maxWidth: "100%" }}
    >
      <defs>
        <marker
          id="arrow"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill={theme.stroke.secondary} />
        </marker>
      </defs>
      {dag.edges.map((edge) => (
        <line
          key={`${edge.from}-${edge.to}`}
          x1={edge.sourceX}
          y1={edge.sourceY}
          x2={edge.targetX}
          y2={edge.targetY}
          stroke={theme.stroke.secondary}
          strokeWidth={1.5}
          markerEnd="url(#arrow)"
        />
      ))}
      {dag.nodes.map((node) => (
        <g key={node.id}>
          <rect
            x={node.x}
            y={node.y}
            width={132}
            height={34}
            rx={6}
            fill={theme.fill.secondary}
            stroke={theme.stroke.primary}
          />
          <text
            x={node.x + 66}
            y={node.y + 21}
            textAnchor="middle"
            fill={theme.text.primary}
            fontSize={11}
            fontFamily="system-ui, sans-serif"
          >
            {NODE_LABELS[node.id] ?? node.id}
          </text>
        </g>
      ))}
    </svg>
  );
}

function OpenFileButton({ path, label }: { path: string; label: string }) {
  const dispatch = useCanvasAction();
  return (
    <Button
      variant="ghost"
      onClick={() => dispatch({ type: "openFile", path })}
    >
      {label}
    </Button>
  );
}

function FileRow({ label, path }: { label: string; path: string }) {
  return (
    <Row gap={8} align="center" wrap>
      <Text>{label}</Text>
      <Spacer />
      <OpenFileButton path={path} label="Open" />
    </Row>
  );
}

function SectionPanel({ section }: { section: SectionId }) {
  const dispatch = useCanvasAction();

  if (section === "overview") {
    return (
      <Stack gap={16}>
        <Text>
          Task Manager is a React + Vite desktop and browser app for ODI
          Jira workflows. It runs saved JQL, manages issues in a unified table,
          snapshots multi-project metrics, generates AI reports and week plans,
          and provides a Chat assistant — all through a local Express proxy that
          holds credentials and SQLite data.
        </Text>
        <Grid columns={4} gap={12}>
          <Stat value="5" label="JQL slots (Task Management)" />
          <Stat value="6" label="App tabs" tone="info" />
          <Stat value="5173" label="Vite dev UI port" tone="info" />
          <Stat value="8787" label="Express proxy (default)" tone="info" />
        </Grid>
        <Table
          headers={["Nav route", "Page", "Role"]}
          rows={[
            ["/work-week", "Task Management", "Daily JQL run + issue table (default home)"],
            ["/dashboard", "Metrics", "Multi-preset metrics snapshot + reports"],
            ["/project-managers", "Project Managers", "Capacity planning from Contributor Metrics entries"],
            ["/reports", "Past Reports", "Archived AI outputs + saved Chat replies"],
            ["/chat", "Chat", "Natural-language Jira Q&A with session context"],
            ["/settings", "Settings", "Presets, field mapping, chat config"],
          ]}
          striped
        />
        <Callout tone="info" title="Planned — team priority sync">
          <Text>
            Shared program priority (NORA, Ask Greg) will live in team Postgres/MySQL
            via a team API — spec in{" "}
            <Text weight="semibold">docs/specs/team-priority-sync.md</Text>. Task Management
            slots link explicitly to a shared program for team mode; all other slots
            stay local-only.
          </Text>
        </Callout>
        <Callout tone="info" title="Shared epic preset state">
          <Text>
            <Text weight="semibold">EpicFiltersProvider</Text> wraps all pages in{" "}
            <Text weight="semibold">AppRouter.jsx</Text>. Preset selections and
            past-due toggle survive route changes and sync after Settings edits.
          </Text>
        </Callout>
        <Callout tone="warning" title="Security boundary">
          <Text>
            Jira and LLM credentials live in <Text weight="semibold">.env</Text>{" "}
            (or packaged userData). The browser only calls{" "}
            <Text weight="semibold">server/jiraProxy.mjs</Text> — never Jira or
            LLM APIs directly.
          </Text>
        </Callout>
        <Callout tone="neutral" title="Node 22 required">
          <Text>
            Repo pinned via <Text weight="semibold">.nvmrc</Text>.{" "}
            <Text weight="semibold">npm install</Text> runs a preinstall guard;
            use <Text weight="semibold">nvm use</Text> before installing.
          </Text>
        </Callout>
      </Stack>
    );
  }

  if (section === "pages") {
    return (
      <Stack gap={16}>
        <Text tone="secondary">
          Feature summary from README.md and DEVELOPER_GUIDE.md — what each page
          is for and where AI appears.
        </Text>
        <CollapsibleSection
          title="Task Management"
          leading={<Swatch color="blue" />}
          defaultOpen
        >
          <Stack gap={8}>
            <Text>
              Up to <Text weight="semibold">5</Text> side-by-side JQL slots.
              Table: status, assignee (Jira user search), P1–P20 priority, MRD
              column, notes, push-to-Jira comments.
            </Text>
            <Text size="small" tone="secondary">
              Priority today: local SQLite per slot; optional{" "}
              <Text weight="semibold">PRIORITY P#</Text> from Jira comments (until
              team DB ships). Planned: slots with{" "}
              <Text weight="semibold">sharedProgramId</Text> (NORA, Ask Greg) use
              team DB; assignee and custom ODI JQL slots stay{" "}
              <Text weight="semibold">Personal</Text> — local only, even for
              overlapping issues.
            </Text>
            <Text size="small" tone="secondary">
              AI: My Metrics · week plan · Create Issue AI Draft · Metrics
              drill-down (?key=, ?assignee=)
            </Text>
            <FileRow
              label="WorkWeekTasks.jsx"
              path={`src/Pages/WorkWeekTasks.jsx`}
            />
          </Stack>
        </CollapsibleSection>
        <CollapsibleSection title="Metrics" leading={<Swatch color="green" />}>
          <Stack gap={8}>
            <Text>
              Select epic/JQL presets → Refresh status → snapshot metrics:
              overall status, per-epic cards, upcoming/past-due lists, contributor
              cards. Generate Report (Executive / PO / Developer), weekly digest
              (no LLM).
            </Text>
            <Text size="small" tone="secondary">
              Links drill to Task Management with hash-router query params.
            </Text>
            <FileRow
              label="Dashboard/index.jsx"
              path={`src/Pages/Dashboard/index.jsx`}
            />
          </Stack>
        </CollapsibleSection>
        <CollapsibleSection title="Project Managers" leading={<Swatch color="green" />}>
          <Stack gap={8}>
            <Text>
              Capacity planning for Contributor Metrics entries: open workload,
              optional capacity targets, status/assignee breakdowns, and risk signals.
            </Text>
            <FileRow
              label="ProjectManagers.jsx"
              path={`src/Pages/ProjectManagers.jsx`}
            />
          </Stack>
        </CollapsibleSection>
        <CollapsibleSection title="Past Reports" leading={<Swatch color="purple" />}>
          <Stack gap={8}>
            <Text>
              Browse <Text weight="semibold">generated_reports</Text> in SQLite:
              Task Management (project reports + week plans), Metrics audience reports,
              Ad-hoc Chat saves.
            </Text>
            <FileRow
              label="ReportArchive.jsx"
              path={`src/Pages/ReportArchive.jsx`}
            />
          </Stack>
        </CollapsibleSection>
        <CollapsibleSection title="Chat" leading={<Swatch color="yellow" />}>
          <Stack gap={8}>
            <Text>
              Scoped by selected presets + session context (JQL runs, dashboard
              snapshot, last 8 generated artifacts). Providers: Anthropic, OpenAI,
              Ollama, or opt-in Rovo OAuth.
            </Text>
            <FileRow label="Chat.jsx" path={`src/Pages/Chat.jsx`} />
          </Stack>
        </CollapsibleSection>
        <CollapsibleSection title="Settings" leading={<Swatch color="red" />}>
          <Stack gap={8}>
            <Text>
              Epic & JQL presets CRUD + team pack import/export · Jira field
              mappings · past-due rules · contributor metrics watches · chat
              instructions · header toggles · Test Jira Connection.
            </Text>
            <FileRow
              label="Settings/index.jsx"
              path={`src/Pages/Settings/index.jsx`}
            />
          </Stack>
        </CollapsibleSection>
        <Callout tone="info" title="Background jobs">
          <Text>
            Long runs (JQL, dashboard refresh, LLM reports) use{" "}
            <Text weight="semibold">backgroundJobStore.js</Text>. The nav{" "}
            <Text weight="semibold">BackgroundJobIndicator</Text> shows in-flight
            work across page navigation; results persist when you return.
          </Text>
        </Callout>
      </Stack>
    );
  }

  if (section === "architecture") {
    return (
      <Stack gap={16}>
        <Text tone="secondary">
          Hash router (<Text weight="semibold">createHashRouter</Text>). Web dev:{" "}
          <Text weight="semibold">npm run dev:all</Text>. Desktop:{" "}
          <Text weight="semibold">npm run desktop:dev</Text> — Electron spawns
          proxy; packaged builds serve <Text weight="semibold">dist/</Text> from
          the proxy on 127.0.0.1.
        </Text>
        <Card variant="borderless">
          <CardBody>
            <ArchitectureDiagram />
            <Text size="small" tone="tertiary" style={{ marginTop: 8 }}>
              Proxy → server/routes/ · SQLite in server/db/schema.mjs · LLM via
              llmClient.mjs · Planned: TEAM_PRIORITY_API_URL → team Postgres/MySQL
            </Text>
          </CardBody>
        </Card>
        <Table
          headers={["Layer", "Entry point", "Responsibility"]}
          rows={[
            ["Router + nav", "src/AppRouter.jsx", "Hash routes, EpicFiltersProvider, lazy pages, BackgroundJobIndicator"],
            ["Work Week state", "src/Pages/hooks/useTaskManagerJira.js", "JQL prefs, runs, notes, priority, handlers"],
            ["JQL workflow", "src/Pages/hooks/jiraJqlRunWorkflow.js", "Run/load remaining JQL, MRD enrichment, priority-from-comment"],
            ["Dashboard refresh", "server/lib/dashboardRefresh/runDashboardRefresh.mjs", "Parse → metrics → persist snapshot"],
            ["HTTP client", "src/services/jiraClient.js", "All fetch → proxy wrappers"],
            ["Proxy entry", "server/jiraProxy.mjs", "CORS, logging, mounts routes, static dist in prod"],
            ["Desktop", "electron/main.cjs", "Spawns proxy, TASK_MANAGER_USER_DATA for packaged .env + SQLite"],
          ]}
          striped
        />
        <H3>Server route modules</H3>
        <Table
          headers={["Module", "Prefix / scope"]}
          rows={[
            ["jiraCoreRoutes.mjs", "Health, myself, fields, search"],
            ["jiraIssueRoutes.mjs", "Status, assignee, comments, create issue, AI description"],
            ["issueMetadataRoutes.mjs", "SQLite notes + priority bulk/read/write"],
            ["appConfigRoutes.mjs", "Settings, presets, field mappings, watched assignees"],
            ["capacityPlanningRoutes.mjs", "Project Managers capacity endpoint"],
            ["dashboardRoutes.mjs", "POST refresh, GET metrics"],
            ["reportRoutes.mjs", "Generate report, project report, week plan, weekly digest, archive"],
            ["chatRoutes.mjs", "Chat, Rovo OAuth"],
            ["team-priority (planned)", "Bulk read + PUT → team API; proxy pass-through"],
          ]}
          striped
        />
      </Stack>
    );
  }

  if (section === "data") {
    return (
      <Stack gap={16}>
        <Text>
          Persistence is split across browser storage, session storage, SQLite,
          and (planned) a team-owned DB for shared program priority only.
        </Text>
        <H3>Browser storage (localStorage / sessionStorage)</H3>
        <Table
          headers={["Data", "Mechanism", "Key(s)"]}
          rows={[
            ["JQL inputs, labels, count, pullLatestComment", "localStorage", "workWeekTasksJiraPreferences"],
            ["Per-slot sharedProgramId (planned)", "localStorage", "workWeekTasksJiraPreferences"],
            ["Last JQL run snapshot", "localStorage", "workWeekTasksJiraLastJqlRuns"],
            ["Drill-down tabs (session only)", "sessionStorage", "workWeekTasksJiraDrillDownRuns"],
            ["Notes + row priority UI cache", "localStorage", "workWeekTasksJiraNotes, workWeekTasksJiraRowPriorities"],
            ["Chat session artifacts (last 8)", "localStorage", "taskManagerChatSessionArtifacts"],
            ["On-page reports / week plan", "localStorage", "taskManagerPersistedDashboardReport, …"],
            ["Header reminders", "localStorage", "workWeekTasksReminders"],
            ["Dashboard visible sections", "localStorage", "dashboard-visible-sections"],
            ["Epic preset selection", "localStorage", "epicFilterSelectedIds"],
          ]}
          striped
        />
        <H3>SQLite (data/workweek.sqlite)</H3>
        <Table
          headers={["Table", "Purpose"]}
          rows={[
            ["issue_metadata", "Local note + personal P1–P20 (P0 = unranked)"],
            ["team_priority_cache (planned)", "TTL cache of last team bulk fetch when API down"],
            ["epic_presets", "Saved epic/JQL presets (Settings, Metrics, Chat)"],
            ["dashboard_snapshots", "Cached metrics from last Metrics refresh"],
            ["dashboard_epic_metrics", "Per-preset epic metrics rows"],
            ["dashboard_assignee_metrics", "Contributor metric rows"],
            ["field_mappings", "Jira custom field ID ↔ app date roles"],
            ["app_settings", "Key-value config (chat instructions, proxy URL, …)"],
            ["watched_assignees", "Dashboard contributor watches (person or JQL)"],
            ["generated_reports", "Archived reports, week plans, Chat saves"],
            ["chat_sessions", "Rovo OAuth tokens when CHAT_PROVIDER=rovo"],
          ]}
          rowTone={[
            "neutral",
            "info",
            "neutral",
            "info",
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            "success",
            undefined,
          ]}
          striped
        />
        <H3>Planned — team DB (Postgres/MySQL, PROD)</H3>
        <Table
          headers={["Table", "Purpose"]}
          rows={[
            ["shared_program", "Named programs (NORA, Ask Greg)"],
            ["shared_program_root", "Epic keys that define program scope"],
            ["shared_program_admin", "Who may add/change programs (seed SQL)"],
            ["team_issue_priority", "issue_key, priority, updated_at, updated_by"],
          ]}
          striped
        />
        <Callout tone="info" title="Slot priority mode (planned)">
          <Stack gap={4}>
            <Text>
              <Text weight="semibold">Team</Text> — slot has sharedProgramId → read/write
              team DB. <Text weight="semibold">Local</Text> — default; assignee JQL and
              custom ODI slots never push to team DB.
            </Text>
            <Text>
              Same issue can differ by slot (P3 personal in My tasks, P1 team in NORA).
            </Text>
          </Stack>
        </Callout>
        <Callout tone="neutral" title="Shared priority today (until team DB ships)">
          <Text>
            PMs prefix Jira comments with <Text weight="semibold">PRIORITY P1</Text> …{" "}
            <Text weight="semibold">P10</Text>. On Run JQL,{" "}
            <Text weight="semibold">shared/priorityFromComment.mjs</Text> parses the
            latest comment (Jira badge in PriorityCell). Retired when team DB is live.
          </Text>
        </Callout>
        <Callout tone="warning" title="Packaged desktop paths">
          <Text>
            When <Text weight="semibold">TASK_MANAGER_USER_DATA</Text> is set:
            credentials and SQLite live in the OS app data folder (not repo{" "}
            <Text weight="semibold">data/</Text>). Dev browser/desktop uses repo
            paths.
          </Text>
        </Callout>
      </Stack>
    );
  }

  if (section === "codebase") {
    return (
      <Stack gap={8}>
        <Text tone="secondary">
          High-signal paths from DEVELOPER_GUIDE.md — click to open in the editor.
        </Text>
        <CollapsibleSection
          title="Task Management UI"
          count={6}
          leading={<Swatch color="blue" />}
          defaultOpen
        >
          <Stack gap={4}>
            <FileRow label="WorkWeekTasks.jsx" path={`src/Pages/WorkWeekTasks.jsx`} />
            <FileRow label="JiraResultsTable.jsx" path={`src/Pages/components/JiraResultsTable.jsx`} />
            <FileRow label="JqlControlsPanel.jsx" path={`src/Pages/components/JqlControlsPanel.jsx`} />
            <FileRow label="WeeklyPlanPanel.jsx" path={`src/Pages/components/WeeklyPlanPanel.jsx`} />
            <FileRow label="CreateIssueModal.jsx" path={`src/Pages/components/CreateIssueModal.jsx`} />
            <FileRow label="cells/ (Status, Assignee, Notes, Priority, Push)" path={`src/Pages/components/cells/AssigneeCell.jsx`} />
          </Stack>
        </CollapsibleSection>
        <CollapsibleSection title="Metrics" count={4} leading={<Swatch color="green" />}>
          <Stack gap={4}>
            <FileRow label="Dashboard/index.jsx" path={`src/Pages/Dashboard/index.jsx`} />
            <FileRow label="useDashboardRefresh.js" path={`src/Pages/Dashboard/hooks/useDashboardRefresh.js`} />
            <FileRow label="DueByHierarchicalList.jsx" path={`src/Pages/Dashboard/components/DueByHierarchicalList.jsx`} />
            <FileRow label="WeeklyDigestPanel.jsx" path={`src/Pages/Dashboard/components/WeeklyDigestPanel.jsx`} />
          </Stack>
        </CollapsibleSection>
        <CollapsibleSection title="Project Managers" count={1} leading={<Swatch color="green" />}>
          <Stack gap={4}>
            <FileRow label="ProjectManagers.jsx" path={`src/Pages/ProjectManagers.jsx`} />
          </Stack>
        </CollapsibleSection>
        <CollapsibleSection title="Shared / context" count={5} leading={<Swatch color="purple" />}>
          <Stack gap={4}>
            <FileRow label="EpicFiltersContext.jsx" path={`src/context/EpicFiltersContext.jsx`} />
            <FileRow label="jiraClient.js" path={`src/services/jiraClient.js`} />
            <FileRow label="backgroundJobStore.js" path={`src/utils/backgroundJobStore.js`} />
            <FileRow label="chatSessionContext.js" path={`src/utils/chatSessionContext.js`} />
            <FileRow label="workWeekNavigation.js" path={`src/utils/workWeekNavigation.js`} />
          </Stack>
        </CollapsibleSection>
        <CollapsibleSection title="Server + shared pure logic" count={7} leading={<Swatch color="yellow" />}>
          <Stack gap={4}>
            <FileRow label="jiraProxy.mjs" path={`server/jiraProxy.mjs`} />
            <FileRow label="db/schema.mjs" path={`server/db/schema.mjs`} />
            <FileRow label="dashboardRefresh/runDashboardRefresh.mjs" path={`server/lib/dashboardRefresh/runDashboardRefresh.mjs`} />
            <FileRow label="llmClient.mjs" path={`server/lib/llmClient.mjs`} />
            <FileRow label="shared/dashboardMetrics.mjs" path={`shared/dashboardMetrics.mjs`} />
            <FileRow label="shared/priorityFromComment.mjs" path={`shared/priorityFromComment.mjs`} />
            <FileRow label="team-priority-sync.md (spec)" path={`docs/specs/team-priority-sync.md`} />
          </Stack>
        </CollapsibleSection>
        <CollapsibleSection title="Tests" count={4} leading={<Swatch color="red" />}>
          <Stack gap={4}>
            <FileRow label="dashboardMetrics.test.mjs" path={`tests/dashboardMetrics.test.mjs`} />
            <FileRow label="epicFilterJql.test.mjs" path={`tests/epicFilterJql.test.mjs`} />
            <FileRow label="chatSessionPrompt.test.mjs" path={`tests/chatSessionPrompt.test.mjs`} />
            <FileRow label="priorityFromComment.test.mjs" path={`tests/priorityFromComment.test.mjs`} />
          </Stack>
        </CollapsibleSection>
        <Callout tone="info" title="Product rules worth remembering">
          <Stack gap={4}>
            <Text>
              JQL search paginates to 5000 max; UI shows Load remaining when
              incomplete. Runs persist if you navigate mid-JQL.
            </Text>
            <Text>
              Drill-down tabs are session-only (sessionStorage), separate from
              regular JQL snapshot in localStorage.
            </Text>
            <Text>
              Clear report on Task Management/Metrics removes on-page display only —
              Past Reports archive rows are untouched.
            </Text>
          </Stack>
        </Callout>
      </Stack>
    );
  }

  if (section === "workflow") {
    return (
      <Stack gap={16}>
        <H3>First-time setup</H3>
        <Text>
          Node 22 (<Text weight="semibold">nvm use</Text>) → copy{" "}
          <Text weight="semibold">.env.example</Text> →{" "}
          <Text weight="semibold">.env</Text> (Jira + optional{" "}
          <Text weight="semibold">CHAT_PROVIDER</Text>) →{" "}
          <Text weight="semibold">npm install</Text> → verify with Test Jira
          Connection or <Text weight="semibold">GET /api/health</Text>.
        </Text>
        <Table
          headers={["Command", "When to use"]}
          rows={[
            ["npm run dev:all", "Web dev — Vite :5173 + proxy :8787"],
            ["npm run desktop:dev", "Electron window; proxy from main process"],
            ["npm run desktop:doctor", "Rebuild better-sqlite3, then desktop:dev"],
            ["npm test", "Unit tests (metrics, JQL builders, chat prompt, priority parser)"],
            ["npm run seed:presets", "Seed epic/JQL presets into local SQLite"],
            ["npm run check:jira-client-exports", "Verify jiraClient exports (runs on prebuild)"],
            ["npm run build", "Production Vite bundle → dist/"],
            ["npm run desktop:dist", "Icons + build + electron-builder → release/"],
          ]}
          striped
        />
        <Callout tone="warning" title="Common pitfalls">
          <Stack gap={4}>
            <Text>
              <Text weight="semibold">npm run dev:ui</Text> alone skips the proxy —
              JQL, metadata, Chat, and Metrics refresh all need{" "}
              <Text weight="semibold">dev:api</Text> or <Text weight="semibold">dev:all</Text>.
            </Text>
            <Text>
              Chat/reports require explicit <Text weight="semibold">CHAT_PROVIDER</Text>{" "}
              in .env — there is no silent default.
            </Text>
            <Text>
              Native module mismatch? Run <Text weight="semibold">npm run desktop:rebuild-native</Text>{" "}
              or <Text weight="semibold">desktop:doctor</Text>.
            </Text>
          </Stack>
        </Callout>
        <H3>Checks after code changes</H3>
        <Text>
          <Text weight="semibold">npm test</Text> →{" "}
          <Text weight="semibold">npm run build</Text> → smoke: Run JQL, priority
          from comment, dashboard refresh + drill-down, generate report/week
          plan, Chat session context, Past Reports save, Settings preset
          import/export.
        </Text>
        <Button
          variant="secondary"
          onClick={() =>
            dispatch({
              type: "newComposerChat",
              userPrompt:
                "Walk me through npm run dev:all setup for Task Manager: Jira .env, optional CHAT_PROVIDER, and smoke tests for Task Management + Metrics.",
            })
          }
        >
          Ask agent about local setup
        </Button>
      </Stack>
    );
  }

  if (section === "docs") {
    return (
      <Stack gap={12}>
        <Text tone="secondary">
          Canonical markdown lives under <Text weight="semibold">docs/</Text> and{" "}
          <Text weight="semibold">README.md</Text>. This canvas summarizes — edit
          source files for long-form prose.
        </Text>
        <Grid columns={2} gap={12}>
          <Card>
            <CardHeader>README.md</CardHeader>
            <CardBody>
              <Stack gap={8}>
                <Text size="small" tone="secondary">
                  Product overview, page summaries, audience, quick start.
                </Text>
                <OpenFileButton path={`README.md`} label="Open" />
              </Stack>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>DEVELOPER_GUIDE.md</CardHeader>
            <CardBody>
              <Stack gap={8}>
                <Text size="small" tone="secondary">
                  Full repo layout, SQLite schema, API routes, dashboard pipeline,
                  persistence, logging.
                </Text>
                <OpenFileButton path={`docs/DEVELOPER_GUIDE.md`} label="Open" />
              </Stack>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>END_USER_GUIDE.md</CardHeader>
            <CardBody>
              <Stack gap={8}>
                <Text size="small" tone="secondary">
                  Non-technical usage, storage model, troubleshooting.
                </Text>
                <OpenFileButton path={`docs/END_USER_GUIDE.md`} label="Open" />
              </Stack>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>JIRA_SETUP.md</CardHeader>
            <CardBody>
              <Stack gap={8}>
                <Text size="small" tone="secondary">
                  .env variables, run commands, connection test.
                </Text>
                <OpenFileButton path={`docs/JIRA_SETUP.md`} label="Open" />
              </Stack>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>team-priority-sync.md</CardHeader>
            <CardBody>
              <Stack gap={8}>
                <Text size="small" tone="secondary">
                  Planned shared program priority: team DB, slot mode, API contract,
                  resolved decisions (design approved, not built).
                </Text>
                <OpenFileButton path={`docs/specs/team-priority-sync.md`} label="Open" />
              </Stack>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>pilot-presets.md</CardHeader>
            <CardBody>
              <Stack gap={8}>
                <Text size="small" tone="secondary">
                  Team preset seeding and import/export workflow.
                </Text>
                <OpenFileButton path={`docs/pilot-presets.md`} label="Open" />
              </Stack>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>.env.example</CardHeader>
            <CardBody>
              <Stack gap={8}>
                <Text size="small" tone="secondary">
                  Jira, CHAT_PROVIDER, LLM keys, Rovo OAuth, LOG_LEVEL.
                </Text>
                <OpenFileButton path={`.env.example`} label="Open" />
              </Stack>
            </CardBody>
          </Card>
        </Grid>
      </Stack>
    );
  }

  return (
    <Text tone="secondary">Select a section above.</Text>
  );
}

export default function TaskManagerDocsCanvas() {
  const [section, setSection] = useCanvasState<SectionId>("section", "overview");

  return (
    <Stack gap={20} style={{ padding: 20, maxWidth: 920 }}>
      <Stack gap={6}>
        <H1>Task Manager — workspace docs</H1>
        <Text tone="secondary">
          Current codebase + planned team priority sync (see Data storage &amp;{" "}
          <Text weight="semibold">docs/specs/team-priority-sync.md</Text>). Jump
          to a section below instead of scrolling DEVELOPER_GUIDE.md end-to-end.
        </Text>
      </Stack>

      <Card variant="borderless">
        <CardBody style={{ padding: 12 }}>
          <Row gap={6} wrap align="center">
            <Text size="small" tone="tertiary" weight="semibold">
              Jump to
            </Text>
            {SECTIONS.map((item) =>
              section === item.id ? (
                <Button variant="primary" onClick={() => setSection(item.id)}>
                  {item.label}
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setSection(item.id)}>
                  {item.label}
                </Button>
              ),
            )}
          </Row>
        </CardBody>
      </Card>

      <Divider />

      <Stack gap={8}>
        <H2>{SECTIONS.find((s) => s.id === section)?.label ?? "Overview"}</H2>
        <SectionPanel section={section} />
      </Stack>

      <Text size="small" tone="quaternary">
        Canvas mirror: docs/canvases/task-manager-docs.canvas.tsx · workspace-relative paths
      </Text>
    </Stack>
  );
}
