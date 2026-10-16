import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMetadataPatch } from "../shared/issueMetadataFields.mjs";

test("metadata patches distinguish clear from omission and normalize selection", () => {
  assert.deepEqual(validateMetadataPatch({ followUp: null }, { importOnly: true }).patch, { followUp: null });
  assert.deepEqual(validateMetadataPatch({ followUp: "NEXT" }).patch, { followUp: "next" });
  assert.deepEqual(validateMetadataPatch({ note: "hello" }).patch, { note: "hello" });
  assert.deepEqual(validateMetadataPatch({}).patch, {});
});

test("metadata patches reject unknown fields, invalid dates, selections and import booleans", () => {
  for (const patch of [{ image: "secret" }, { followUp: "later" }, { plannedStart: "2026-02-30" }, { plannedFinish: "2026-13-01" }, { hasOpenDecision: "false" }]) {
    assert.ok(validateMetadataPatch(patch).errors.length, JSON.stringify(patch));
  }
  assert.ok(validateMetadataPatch({ hasOpenDecision: false }, { importOnly: true }).errors.length);
  assert.equal(validateMetadataPatch({ plannedStart: "2028-02-29" }).errors.length, 0);
  assert.ok(validateMetadataPatch({ plannedStart: "2026-03-02", plannedFinish: "2026-03-01" }).errors.length);
});


test("task workflow hydrates followUp-only shared rows and clear without replacing local planning", async () => {
  const fs = await import("node:fs/promises");
  const { build } = await import("esbuild");
  const source = await fs.readFile(new URL("../src/Pages/hooks/jiraJqlRunWorkflow.js", import.meta.url), "utf8");
  const calls = [];
  const services = ["fetchEpicPresetScopeJql", "fetchIssueMetadataBulk", "fetchJiraSearchAll", "fetchLatestJiraCommentsBulk", "fetchTeamPriorityBulk", "fetchTeamDatesBulk", "fetchTeamMetadataBulk", "getTeamPriorityHealthSnapshot"];
  const bundled = await build({ stdin: { contents: 'import { getSiteContext } from "../../utils/siteContextStore.js"; import { fetchTeamDatesBulk, fetchTeamMetadataBulk, getTeamPriorityHealthSnapshot } from "../../services/jiraClient";\n' + source.slice(source.indexOf("const dedupeIssueKeys"), source.indexOf("const applyTeamPriorityState")) + source.slice(source.indexOf("const PLANNING_FIELD_KEYS"), source.indexOf("const applyDrillDownMetadata")) + "\nexport { applyTeamDateState, hasPlanningData };", resolveDir: new URL("../src/Pages/hooks/", import.meta.url).pathname, sourcefile: "workflow.js" }, bundle: true, write: false, format: "esm", platform: "node", plugins: [{ name: "synthetic-services", setup(build) {
    build.onResolve({ filter: /services\/jiraClient$/ }, () => ({ path: "services", namespace: "synthetic" }));
    build.onResolve({ filter: /siteContextStore\.js$/ }, () => ({ path: "context", namespace: "synthetic" }));
    build.onLoad({ filter: /.*/, namespace: "synthetic" }, ({ path }) => ({ contents: path === "context" ? 'export const getSiteContext = () => globalThis.d2Context;' : services.map((name) => `export const ${name} = (...args) => globalThis.d2Services.${name}(...args);`).join("\n") }));
  } }] });
  const workflow = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
  let planning = { "ABC-1": { requestor: "personal", plannedStart: "2026-10-01", hasOpenDecision: true, followUp: "now" } };
  const context = { instanceId: "a", generation: "accepted-a" };
  globalThis.d2Context = context;
  let followUp = "next";
  globalThis.d2Services = {
    getTeamPriorityHealthSnapshot: () => ({ enabled: true }),
    fetchTeamDatesBulk: async (_keys, options) => { calls.push(options); return {}; },
    fetchTeamMetadataBulk: async (_keys, options) => { calls.push(options); return { "ABC-1": { followUp } }; },
  };
  try {
    const args = { siteContext: context, issueKeys: ["ABC-1"], setStartDateByKey: () => {}, setCompleteDateByKey: () => {}, setPlanningMetaByKey: (update) => { planning = update(planning); } };
    await workflow.applyTeamDateState(args);
    assert.equal(planning["ABC-1"].teamFollowUp, "next");
    assert.equal(planning["ABC-1"].followUp, "now");
    assert.equal(planning["ABC-1"].requestor, "personal");
    assert.equal(planning["ABC-1"].hasOpenDecision, true);
    followUp = null;
    await workflow.applyTeamDateState(args);
    assert.equal(planning["ABC-1"].teamFollowUp, null);
    assert.equal(planning["ABC-1"].followUp, "now");
    globalThis.d2Services.fetchTeamMetadataBulk = async () => ({});
    await workflow.applyTeamDateState(args);
    assert.equal(planning["ABC-1"].teamFollowUp, null);
    assert.equal(planning["ABC-1"].followUp, "now");
    assert.equal(workflow.hasPlanningData({ followUp: null }), false);
    assert.ok(calls.every((options) => options.siteContext === context));
    globalThis.d2Services.fetchTeamMetadataBulk = async () => { globalThis.d2Context = { generation: "other" }; return { "ABC-1": { followUp: "now" } }; };
    await workflow.applyTeamDateState(args);
    assert.equal(planning["ABC-1"].teamFollowUp, null);
    assert.equal(planning["ABC-1"].followUp, "now");
  } finally { delete globalThis.d2Services; delete globalThis.d2Context; }
});

test("browser metadata saves retain explicit Now/Next clear and captured site context", async (t) => {
  const { build } = await import("esbuild");
  const bundled = await build({ stdin: { contents: 'export * from "./src/services/jiraClient.js"; export * from "./src/utils/siteContextStore.js";', resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "node", define: { "import.meta.env.VITE_API_BASE": "undefined" } });
  const client = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
  const context = { instanceId: "a", generation: "a" };
  client.setSiteContext(context);
  const original = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = { setTimeout: () => 0, clearTimeout: () => {}, localStorage: { getItem: () => null } };
  const calls = [];
  t.after(() => { globalThis.fetch = original; if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; });
  globalThis.fetch = async (url, options) => { calls.push({ url, ...options }); return new Response("{}"); };
  await client.saveIssueMetadata({ issueKey: "ABC-1", followUp: "next" }, { siteContext: context });
  await client.saveTeamDate({ issueKey: "ABC-1", followUp: null }, { siteContext: context });
  assert.deepEqual(JSON.parse(calls[0].body), { followUp: "next" });
  assert.deepEqual(JSON.parse(calls[1].body), { followUp: null });
  assert.equal(calls[1].headers["X-Docket-Generation"], "a");
});


test("same-key local and shared followUp edits and Save All preserve their own source", async () => {
  const fs = await import("node:fs/promises");
  const { build } = await import("esbuild");
  const source = await fs.readFile(new URL("../src/Pages/hooks/useTaskManagerJira.js", import.meta.url), "utf8");
  const handlers = source.slice(source.indexOf("  const handleSavePlanningAll"), source.indexOf("  const handlePinnedGanttChange"));
  const persistence = source.slice(source.indexOf("  const persistTeamChange"), source.indexOf("  const [fieldMappingsLoading"));
  const bundled = await build({ stdin: { contents: `import { validateMetadataPatch } from "../../../shared/issueMetadataFields.mjs";
    export const configure = ({ saveTeamDate, saveIssueMetadata, setPlanningMetaByKey, planningMetaByKey, startDateByKey = {}, completeDateByKey = {} }) => {
      const React = { useCallback: (callback) => callback };
      const hydrationReady = true, combined = false, siteContext = undefined;
      const teamPlanningMetaByKey = planningMetaByKey, teamStartDateByKey = {}, teamCompleteDateByKey = {};
      const setTeamPlanningMetaByKey = setPlanningMetaByKey, assertTeamPriorityEnabled = () => {};
      const onConfirmedTeam = undefined, reconcileTeam = undefined;
      ${persistence}
      ${handlers}
      return { handleSavePlanningAll, handlePlanningFieldChange };
    };`, resolveDir: new URL("../src/Pages/hooks/", import.meta.url).pathname }, bundle: true, write: false, format: "esm", platform: "node" });
  const actual = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
  let state = { "ABC-1": { followUp: "now", teamFollowUp: "next" } };
  const localWrites = [];
  const teamWrites = [];
  const configure = () => actual.configure({ planningMetaByKey: state, setPlanningMetaByKey: (update) => { state = update(state); }, saveTeamDate: async (patch) => { teamWrites.push(patch); }, saveIssueMetadata: async (patch) => { localWrites.push(patch); } });
  configure().handlePlanningFieldChange("ABC-1", "followUp", null, { sharedProgramId: "team" });
  assert.equal(state["ABC-1"].teamFollowUp, null);
  assert.equal(state["ABC-1"].followUp, "now");
  assert.deepEqual(teamWrites[0], { issueKey: "ABC-1", followUp: null });
  configure().handlePlanningFieldChange("ABC-1", "followUp", "next");
  assert.equal(state["ABC-1"].teamFollowUp, null);
  assert.equal(state["ABC-1"].followUp, "next");
  await configure().handleSavePlanningAll("ABC-1", { sharedProgramId: "team" });
  await configure().handleSavePlanningAll("ABC-1");
  assert.equal(teamWrites.at(-1).followUp, null);
  assert.equal(localWrites.at(-1).followUp, "next");
  assert.equal(Object.hasOwn(teamWrites.at(-1), "teamFollowUp"), false);
  assert.equal(Object.hasOwn(localWrites.at(-1), "teamFollowUp"), false);
});

test("task table renders exclusive Now/Next checkboxes with source-specific clear", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { createRequire } = await import("node:module");
  const { build } = await import("esbuild");
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const temporary = await fs.mkdtemp(new URL("./d2-render-", import.meta.url));
  try {
    const outfile = path.join(temporary, "table.cjs");
    await build({ entryPoints: ["src/Pages/components/JiraResultsTable.jsx"], bundle: true, outfile, packages: "external", format: "cjs", platform: "node", define: { "import.meta.env.VITE_API_BASE": "undefined" } });
    const Table = createRequire(import.meta.url)(outfile).default;
    const props = Object.fromEntries(["selectedForPush", "pushState", "saveState", "rowUpdateState", "statusDrafts", "iddDrafts", "dueDateDrafts", "mrdDrafts", "startDateByKey", "completeDateByKey", "assigneeDrafts", "jiraRowPriorities", "jiraNotes", "noteImagesByKey", "noteImageErrorsByKey", "keepNoteImagesByKey", "noteImageKeepPendingByKey", "lastPushedJiraNoteByKey"].map((key) => [key, {}]));
    Object.assign(props, { teamEnabled: true, statusOptions: [], isClosedLikeStatus: () => false, clampPriority: (value) => value, getPriorityClass: () => "", getPriorityRowClass: () => "", formatDate: () => "", planningMetaByKey: { "ABC-1": { followUp: "now", teamFollowUp: "next" } }, expandedPlanningKey: "ABC-1", handlePlanningFieldChange: () => {} });
    const render = (sharedProgramId) => renderToStaticMarkup(React.createElement(Table, { ...props, jqlRuns: [{ jql: "key = ABC-1", label: "Synthetic tasks", sharedProgramId, issues: [{ id: "1", key: "ABC-1", fields: { summary: "Task", status: { name: "Open" }, issuetype: { name: "Bug" } } }] }] }));
    const local = render("");
    const team = render("team");
    const checked = (html, choice) => html.match(new RegExp(`<input[^>]*aria-label="${choice} for ABC-1"[^>]*>`))?.[0].includes('checked=""');
    assert.equal(checked(local, "Now"), true);
    assert.equal(checked(local, "Next"), false);
    assert.equal(checked(team, "Now"), false);
    assert.equal(checked(team, "Next"), true);
    props.planningMetaByKey["ABC-1"].teamFollowUp = null;
    assert.equal(checked(render("team"), "Now"), false);
    assert.equal(checked(render("team"), "Next"), false);
    assert.equal(checked(render(""), "Now"), true);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
});


test("Now/Next checkbox events replace the active choice and unchecking clears it", async () => {
  const fs = await import("node:fs/promises");
  const { build } = await import("esbuild");
  const source = await fs.readFile(new URL("../src/Pages/components/JiraResultsTable.jsx", import.meta.url), "utf8");
  const labelStart = source.indexOf('<span className="ww-planning-label">Now / Next</span>');
  const start = source.lastIndexOf('<div className="ww-planning-field">', labelStart);
  const end = source.indexOf('<label className="ww-planning-field">', labelStart);
  const fragment = source.slice(start, end);
  const bundled = await build({ stdin: { contents: `import React from "react"; import { FOLLOW_UP_OPTIONS } from "../../../shared/issueMetadataFields.mjs";
    export const render = ({ followUp, handlePlanningFieldChange, sharedProgramId = "team" }) => {
      const issueKey = "ABC-1";
      const combinedRun = null, disableEditing = false, forceTeam = false;
      const issue = { key: issueKey };
      return (${fragment});
    };`, loader: "jsx", resolveDir: new URL("../src/Pages/components/", import.meta.url).pathname }, bundle: true, write: false, format: "esm", platform: "node" });
  const actual = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
  let followUp = "now";
  const changes = [];
  const render = () => actual.render({ followUp, handlePlanningFieldChange: (...args) => { changes.push(args); followUp = args[2]; } });
  const inputs = () => render().props.children.flat().filter(child => child?.type === "label").map((label) => label.props.children[0]);
  assert.deepEqual(inputs().map((input) => input.props.checked), [true, false]);
  inputs()[1].props.onChange({ target: { checked: true } });
  assert.equal(followUp, "next");
  assert.deepEqual(inputs().map((input) => input.props.checked), [false, true]);
  assert.deepEqual(changes[0], ["ABC-1", "followUp", "next", { sharedProgramId: "team", forceTeam: false }]);
  inputs()[1].props.onChange({ target: { checked: false } });
  assert.equal(followUp, null);
  assert.deepEqual(inputs().map((input) => input.props.checked), [false, false]);
});


test("shared Load More and local planning hydration preserve both sources through local Save All", async (t) => {
  const fs = await import("node:fs/promises");
  const { build } = await import("esbuild");
  const source = await fs.readFile(new URL("../src/Pages/hooks/useTaskManagerJira.js", import.meta.url), "utf8");
  const handlers = source.slice(source.indexOf("  const handleSavePlanningAll"), source.indexOf("  const handlePinnedGanttChange"));
  const persistence = source.slice(source.indexOf("  const persistTeamChange"), source.indexOf("  const [fieldMappingsLoading"));
  const bundled = await build({ stdin: { contents: `
    export * from "./src/Pages/hooks/jiraJqlRunWorkflow.js";
    export * from "./src/utils/siteContextStore.js";
    import { saveIssueMetadata, saveTeamDate } from "./src/services/jiraClient.js";
    import { validateMetadataPatch } from "./shared/issueMetadataFields.mjs";
    export const configurePlanning = ({ planningMetaByKey, setPlanningMetaByKey, startDateByKey, completeDateByKey }) => {
      const React = { useCallback: (callback) => callback };
      const hydrationReady = true, combined = false, siteContext = undefined;
      const teamPlanningMetaByKey = planningMetaByKey, teamStartDateByKey = {}, teamCompleteDateByKey = {};
      const setTeamPlanningMetaByKey = setPlanningMetaByKey, assertTeamPriorityEnabled = () => {};
      const onConfirmedTeam = undefined, reconcileTeam = undefined;
      ${persistence}
      ${handlers}
      return { handleSavePlanningAll, handlePlanningFieldChange };
    };`, resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "node", define: { "import.meta.env.VITE_API_BASE": "undefined" } });
  const actual = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  t.after(() => { globalThis.fetch = originalFetch; if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; });
  const issue = { key: "ABC-1", id: "1", fields: { summary: "Synthetic task" } };
  const saved = { note: "saved note", priority: 3, followUp: "now", requestor: "Local owner", plannedStart: "2026-10-01", plannedFinish: "2026-10-05", hasOpenDecision: true, openDecisionNote: "Saved decision", pmOverride: "hold", startDate: "2026-09-30", completeDate: "2026-10-06" };
  for (const localMode of ["load-more", "drill-down", "run-local", "run-shared"]) {
    for (const sharedFirst of [true, false]) {
      const name = `${localMode}/${sharedFirst ? "shared-first" : "local-first"}`;
      await t.test(name, async () => {
        const storage = new Map();
        const browserStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
        globalThis.window = { localStorage: browserStorage, sessionStorage: browserStorage, setTimeout: () => 0, clearTimeout: () => {} };
        const context = { instanceId: name, generation: name };
        actual.setSiteContext(context);
        const calls = [];
        globalThis.fetch = async (url, options) => {
          const body = JSON.parse(options.body || "{}");
          calls.push({ url, options, body });
          assert.equal(options.headers["X-Docket-Site"], name);
          let result;
          if (url === "/api/team-priority/health") result = { enabled: true, configured: true, connected: true, ok: true };
          else if (url === "/api/jira/search/all") result = { issues: [issue], total: 1, loaded: 1, isComplete: true };
          else if (url === "/api/jira/issue-metadata/bulk") result = { items: { "ABC-1": saved } };
          else if (url === "/api/team-priority/metadata/bulk") result = { items: { "ABC-1": { followUp: "next" } } };
          else if (url === "/api/team-priority/dates/bulk" || url === "/api/team-priority/bulk") result = { items: {} };
          else if (url === "/api/jira/issue-metadata/ABC-1" || url === "/api/team-priority/dates/ABC-1") result = { ok: true, ...body };
          else assert.fail(`Unexpected synthetic HTTP request: ${url}`);
          return new Response(JSON.stringify(result));
        };
        let planning = {};
        let runs = [];
        let notes = { "ABC-1": "draft note" };
        let priorities = { "ABC-1": 9 };
        let starts = { "ABC-1": "2026-09-29" };
        let completes = { "ABC-1": "2026-10-07" };
        const setPlanningMetaByKey = (update) => { planning = update(planning); };
        const common = { siteContext: context, jqlMaxResults: 20, clampPriority: Number, pullLatestComment: false, fieldMappingRows: [], setJqlRuns: (update) => { runs = typeof update === "function" ? update(runs) : update; }, setJqlLoading: () => {}, setJqlError: (error) => { assert.equal(error, ""); }, setShowRestoredJqlBanner: () => {}, setJiraNotes: (update) => { notes = update(notes); }, setJiraRowPriorities: (update) => { priorities = update(priorities); }, setStartDateByKey: (update) => { starts = update(starts); }, setCompleteDateByKey: (update) => { completes = update(completes); }, setPlanningMetaByKey };
        const loadMore = async (sharedProgramId) => {
          runs = [{ index: 0, label: "Synthetic", jql: "key = ABC-1", sharedProgramId, issues: [], total: 1, loaded: 0, loadComplete: false }];
          await actual.loadRemainingJqlIssues({ ...common, runIndex: 0, jqlRuns: runs });
        };
        const hydrateLocal = async () => {
          if (localMode === "load-more") await loadMore("");
          else if (localMode === "drill-down") await actual.loadDrillDownIssueByKey({ ...common, issueKey: "ABC-1" });
          else await actual.runJqlWorkflow({ ...common, jqlInputs: ["key = ABC-1"], jqlLabels: ["Synthetic"], jqlSharedProgramIds: [localMode === "run-shared" ? "team" : ""] });
        };
        if (sharedFirst) {
          await loadMore("team");
          assert.equal(planning["ABC-1"].teamFollowUp, "next");
          assert.equal(planning["ABC-1"].followUp, "now");
          await hydrateLocal();
        } else {
          await hydrateLocal();
          await loadMore("team");
        }
        assert.equal(planning["ABC-1"].teamFollowUp, "next");
        assert.equal(planning["ABC-1"].followUp, "now");
        assert.equal(planning["ABC-1"].requestor, "Local owner");
        assert.equal(planning["ABC-1"].plannedStart, "2026-10-01");
        assert.equal(planning["ABC-1"].plannedFinish, "2026-10-05");
        assert.equal(notes["ABC-1"], "draft note");
        assert.equal(priorities["ABC-1"], 9);
        assert.equal(starts["ABC-1"], "2026-09-29");
        assert.equal(completes["ABC-1"], "2026-10-07");
        const configured = () => actual.configurePlanning({ planningMetaByKey: planning, setPlanningMetaByKey, startDateByKey: starts, completeDateByKey: completes });
        await configured().handleSavePlanningAll("ABC-1");
        const save = calls.findLast((call) => call.url === "/api/jira/issue-metadata/ABC-1");
        assert.equal(save.body.followUp, "now");
        assert.equal(save.body.requestor, "Local owner");
        assert.equal(save.body.plannedStart, "2026-10-01");
        assert.equal(save.body.plannedFinish, "2026-10-05");
        assert.equal(save.body.hasOpenDecision, true);
        assert.equal(Object.hasOwn(save.body, "teamFollowUp"), false);
        configured().handlePlanningFieldChange("ABC-1", "followUp", null);
        configured().handlePlanningFieldChange("ABC-1", "requestor", "");
        configured().handlePlanningFieldChange("ABC-1", "hasOpenDecision", false);
        await hydrateLocal();
        assert.equal(planning["ABC-1"].followUp, null);
        assert.equal(planning["ABC-1"].requestor, "");
        assert.equal(planning["ABC-1"].hasOpenDecision, false);
        assert.equal(planning["ABC-1"].teamFollowUp, "next");
        assert.equal(planning["ABC-1"].plannedStart, "2026-10-01");
      });
    }
  }
});
