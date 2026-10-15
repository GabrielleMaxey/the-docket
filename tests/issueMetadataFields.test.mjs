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
  const services = ["fetchEpicPresetScopeJql", "fetchIssueMetadataBulk", "fetchJiraSearchAll", "fetchLatestJiraCommentsBulk", "fetchTeamPriorityBulk", "fetchTeamDatesBulk", "fetchTeamMetadataBulk"];
  const bundled = await build({ stdin: { contents: 'import { getSiteContext } from "../../utils/siteContextStore.js"; import { fetchTeamDatesBulk, fetchTeamMetadataBulk } from "../../services/jiraClient";\n' + source.slice(source.indexOf("const dedupeIssueKeys"), source.indexOf("const applyTeamPriorityState")) + source.slice(source.indexOf("const PLANNING_FIELD_KEYS"), source.indexOf("const applyDrillDownMetadata")) + "\nexport { applyTeamDateState, hasPlanningData };", resolveDir: new URL("../src/Pages/hooks/", import.meta.url).pathname, sourcefile: "workflow.js" }, bundle: true, write: false, format: "esm", platform: "node", plugins: [{ name: "synthetic-services", setup(build) {
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
  const bundled = await build({ stdin: { contents: `import { validateMetadataPatch } from "../../../shared/issueMetadataFields.mjs";
    export const configure = ({ saveTeamDate, saveIssueMetadata, setPlanningMetaByKey, planningMetaByKey, startDateByKey = {}, completeDateByKey = {} }) => {
      const React = { useCallback: (callback) => callback };
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

test("task table renders each source selection with one mutually exclusive Now/Next control", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { createRequire } = await import("node:module");
  const { build } = await import("esbuild");
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const temporary = await fs.mkdtemp(path.join(process.cwd(), ".superpowers/sdd/2026-10-14-team-data-imports/evidence/d2-render-"));
  try {
    const outfile = path.join(temporary, "table.cjs");
    await build({ entryPoints: ["src/Pages/components/JiraResultsTable.jsx"], bundle: true, outfile, packages: "external", format: "cjs", platform: "node", define: { "import.meta.env.VITE_API_BASE": "undefined" } });
    const Table = createRequire(import.meta.url)(outfile).default;
    const props = Object.fromEntries(["selectedForPush", "pushState", "saveState", "rowUpdateState", "statusDrafts", "iddDrafts", "dueDateDrafts", "mrdDrafts", "startDateByKey", "completeDateByKey", "assigneeDrafts", "jiraRowPriorities", "jiraNotes", "noteImagesByKey", "noteImageErrorsByKey", "keepNoteImagesByKey", "noteImageKeepPendingByKey", "lastPushedJiraNoteByKey"].map((key) => [key, {}]));
    Object.assign(props, { statusOptions: [], isClosedLikeStatus: () => false, clampPriority: (value) => value, getPriorityClass: () => "", getPriorityRowClass: () => "", formatDate: () => "", planningMetaByKey: { "ABC-1": { followUp: "now", teamFollowUp: "next" } }, expandedPlanningKey: "ABC-1", handlePlanningFieldChange: () => {} });
    const render = (sharedProgramId) => renderToStaticMarkup(React.createElement(Table, { ...props, jqlRuns: [{ jql: "key = ABC-1", label: "Synthetic tasks", sharedProgramId, issues: [{ id: "1", key: "ABC-1", fields: { summary: "Task", status: { name: "Open" }, issuetype: { name: "Bug" } } }] }] }));
    const local = render("");
    const team = render("team");
    const selection = (html) => html.match(/<select[^>]*aria-label="Now \/ Next for ABC-1"[^>]*>([\s\S]*?)<\/select>/)?.[1];
    assert.match(selection(local) || "", /value="now" selected=""/);
    assert.match(selection(team) || "", /value="next" selected=""/);
    assert.match(selection(team), /value="">Unset/);
    props.planningMetaByKey["ABC-1"].teamFollowUp = null;
    assert.match(selection(render("team")), /value="" selected="">Unset/);
    assert.match(selection(render("")), /value="now" selected=""/);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
});
