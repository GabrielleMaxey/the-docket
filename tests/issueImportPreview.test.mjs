import { enableTeamDatabase } from "./teamSettingsFixture.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import Database from "better-sqlite3";
import { initDatabase } from "../server/db/schema.mjs";
import { registerIssueMetadataRoutes } from "../server/routes/issueMetadataRoutes.mjs";

const context = { instanceId: "synthetic", siteHost: "synthetic.example", generation: "g1" };
const row = (issueKey = "ABC-1", patch = { priority: 2 }) => ({ rowId: issueKey, issueKey, selected: true, patch, replaceNote: false });
const fixture = async (run) => {
  const db = new Database(":memory:");
  initDatabase(db);
  let siteContext = { ...context };
  const app = express();
  app.use(express.json());
  registerIssueMetadataRoutes(app, { getDb: () => db, getSiteContext: () => siteContext });
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const post = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/jira/issue-metadata/import${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const text = await response.text();
    return { status: response.status, body: response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : {} };
  };
  try { await run({ db, post, switchSite: () => { siteContext = { ...context, generation: "g2" }; } }); }
  finally { await new Promise(resolve => server.close(resolve)); db.close(); }
};

test("preview and approval write nothing; duplicate completion is idempotent", () => fixture(async ({ db, post }) => {
  const preview = await post("/preview", { destination: "local", csvText: "ODI,Priority,Notes\nABC-1,2,synthetic" });
  assert.equal(preview.status, 200);
  assert.equal(db.prepare("SELECT count(*) AS n FROM issue_metadata").get().n, 0);
  assert.equal(preview.body.rows[0].patch.note, "synthetic");
  assert.equal(preview.body.diff[0].changes.priority.after, 2);
  const saved = await post("/commit", { previewId: preview.body.previewId, rows: [row("ABC-1", { priority: 19 })] });
  assert.equal(saved.status, 200);
  assert.equal(db.prepare("SELECT priority FROM issue_metadata").get().priority, 2);
  const duplicate = await post("/commit", { previewId: preview.body.previewId });
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(db.prepare("SELECT count(*) AS n FROM issue_metadata").get().n, 1);
}));

test("edited selection needs a new authoritative approval", () => fixture(async ({ post, db }) => {
  const first = await post("/preview", { destination: "local", rows: [row()] });
  assert.equal(first.status, 200);
  const edited = await post("/preview", { destination: "local", rows: [row("ABC-2")] });
  assert.equal(edited.status, 200);
  assert.notEqual(first.body.previewId, edited.body.previewId);
  assert.equal(db.prepare("SELECT count(*) AS n FROM issue_metadata").get().n, 0);
}));

test("stale generation fails", () => fixture(async ({ post, switchSite, db }) => {
  const first = await post("/preview", { destination: "local", rows: [row()] });
  assert.equal(first.status, 200);
  switchSite();
  assert.equal((await post("/commit", { previewId: first.body.previewId })).status, 409);
  assert.equal(db.prepare("SELECT count(*) AS n FROM issue_metadata").get().n, 0);
}));

test("one row conflict saves nothing", () => fixture(async ({ post, db }) => {
  const first = await post("/preview", { destination: "local", rows: [row(), row("ABC-2")] });
  assert.equal(first.status, 200);
  db.prepare("INSERT INTO issue_metadata(issue_key,note) VALUES('ABC-2','concurrent')").run();
  assert.equal((await post("/commit", { previewId: first.body.previewId })).status, 409);
  assert.equal(db.prepare("SELECT count(*) AS n FROM issue_metadata WHERE issue_key='ABC-1'").get().n, 0);
}));

test("team failure never falls back", () => fixture(async ({ post, db }) => {
  const failed = await post("/preview", { destination: "team", rows: [row()] });
  assert.equal(failed.status, 403);
  assert.equal(failed.body.code, "TEAM_DATABASE_DISABLED");
  assert.equal(db.prepare("SELECT count(*) AS n FROM issue_metadata").get().n, 0);
}));

test("exactly one input and supported destination are required", () => fixture(async ({ post }) => {
  for (const input of [{ destination: "local" }, { destination: "local", rows: [], csvText: "x" }, { destination: "other", rows: [] }]) {
    assert.equal((await post("/preview", input)).status, 400);
  }
}));

test("obsolete CSV import cannot bypass preview", () => fixture(async ({ post, db }) => {
  const old = await post("", { csvText: "ODI,Priority\nABC-1,2" });
  assert.equal(old.status, 409);
  assert.equal(old.body.code, "IMPORT_PREVIEW_REQUIRED");
  assert.equal(db.prepare("SELECT count(*) AS n FROM issue_metadata").get().n, 0);
}));

test("expired preview fails and bounded capacity preserves live previews", async () => {
  const { createIssueImportPreviewStore } = await import("../server/lib/issueImportPreview.mjs");
  let clock = 1;
  let writes = 0;
  const store = createIssueImportPreviewStore({ now: () => clock, writeMetadata: async () => { writes++; return { updated: 1 }; } });
  const make = (extra = {}) => store.createImportPreview({ siteContext: context, destination: "local", rows: [row()], existingByKey: {}, ...extra });
  let previous = make();
  for (let i = 0; i < 9; i++) previous = make({ supersedesPreviewId: previous.previewId });
  for (let i = 0; i < 4; i++) make();
  assert.throws(() => make(), { status: 429 });
  assert.throws(() => make({ supersedesPreviewId: previous.previewId, rows: [] }), { status: 400 });
  assert.throws(() => make({ supersedesPreviewId: previous.previewId, siteContext: { ...context, generation: "other" } }), { status: 409 });
  assert.equal((await store.commitImportPreview({ previewId: previous.previewId, siteContext: context })).updated, 1);
  const expired = make();
  clock += 15 * 60 * 1000;
  await assert.rejects(store.commitImportPreview({ previewId: expired.previewId, siteContext: context }), { status: 410 });
  assert.equal(writes, 1);
  assert.ok(make().previewId);
});

test("in-flight commit cannot be replaced and duplicate submit shares completion", async () => {
  const { createIssueImportPreviewStore } = await import("../server/lib/issueImportPreview.mjs");
  let finish;
  let writes = 0;
  const store = createIssueImportPreviewStore({ writeMetadata: () => { writes++; return new Promise(resolve => { finish = resolve; }); } });
  const input = { siteContext: context, destination: "local", rows: [row()], existingByKey: {} };
  const preview = store.createImportPreview(input);
  const first = store.commitImportPreview({ previewId: preview.previewId, siteContext: context });
  const second = store.commitImportPreview({ previewId: preview.previewId, siteContext: context });
  assert.throws(() => store.createImportPreview({ ...input, supersedesPreviewId: preview.previewId }), { status: 409 });
  await Promise.resolve();
  finish({ updated: 1 });
  assert.equal((await first).updated, 1);
  assert.equal((await second).duplicate, true);
  assert.equal(writes, 1);
  assert.throws(() => store.createImportPreview({ ...input, supersedesPreviewId: preview.previewId }), { status: 409 });
});

test("protected-note preview exposes saved comparison without authorizing replacement", () => fixture(async ({ db, post }) => {
  db.prepare("INSERT INTO issue_metadata(issue_key,note) VALUES('ABC-1','protected')").run();
  const preview = await post("/preview", { destination: "local", rows: [row("ABC-1", { priority: 3, note: "new" })] });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.diff[0].saved.note, "protected");
  assert.equal(preview.body.diff[0].changes.note, undefined);
}));

test("editable review invalidates approval, uses exclusive Now/Next, and retains unknown-outcome retry", async () => {
  const { build } = await import("esbuild");
  const { createRequire } = await import("node:module");
  const React = (await import("react")).default;
  const state = [];
  let cursor = 0;
  const calls = [];
  let failed = false;
  const initialPreview = { previewId: "p1", siteContext: context, destination: "local", rows: [row()], diff: [{ rowId: "ABC-1", issueKey: "ABC-1", saved: {}, changes: { priority: { before: 0, after: 2 } } }], errors: [], ignoredHeaders: [] };
  globalThis.d3Hooks = { ...React, useState: (initial) => { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], update => { state[i] = typeof update === "function" ? update(state[i]) : update; }]; }, useRef: (value) => { const i = cursor++; return state[i] ||= { current: value }; }, useEffect: () => {}, useSyncExternalStore: () => context };
  globalThis.d3Services = {
    previewIssueMetadataImport: async (input) => { calls.push(input); return { ...initialPreview, previewId: `p${calls.length + 1}`, rows: input.rows, destination: input.destination }; },
    commitIssueMetadataImport: async (previewId) => { calls.push({ commit: previewId }); if (failed) throw new Error("network"); return { destination: "local", updated: 1 }; },
  };
  const bundle = await build({ entryPoints: ["src/Pages/Settings/components/IssueImportPreview.jsx"], bundle: true, write: false, format: "cjs", platform: "node", external: ["semantic-ui-react"], plugins: [{ name: "ui-boundaries", setup(build) {
    build.onResolve({ filter: /^react$/ }, () => ({ path: "hooks", namespace: "fixture" }));
    build.onResolve({ filter: /siteContextStore\.js$/ }, () => ({ path: "context", namespace: "fixture" }));
    build.onResolve({ filter: /services\/jiraClient\.js$/ }, () => ({ path: "services", namespace: "fixture" }));
    build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "context" ? 'export const getSiteContext = () => ({ instanceId: "synthetic", siteHost: "synthetic.example", generation: "g1" }); export const subscribeSiteContext = () => () => {};' : path === "hooks" ? "export default globalThis.d3Hooks;" : "export const assertTeamPriorityEnabled = () => {}; export const previewIssueMetadataImport = (...args) => globalThis.d3Services.previewIssueMetadataImport(...args); export const commitIssueMetadataImport = (...args) => globalThis.d3Services.commitIssueMetadataImport(...args);" }));
  } }] });
  const mod = { exports: {} };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
  const render = () => { cursor = 0; return mod.exports.default({ initialPreview, teamAvailable: true, teamReason: "", siteContext: context, onLocalSaved: () => {} }); };
  const flatten = (value) => !value ? [] : Array.isArray(value) ? value.flatMap(flatten) : typeof value === "object" ? [value, ...flatten(value.props?.children)] : [];
  const named = (tree, name) => flatten(tree).find(node => node.props?.["aria-label"] === name || node.props?.children === name);
  try {
    let tree = render();
    assert.equal(named(tree, "Save locally").props.disabled, true);
    named(tree, "Approve changes").props.onClick();
    tree = render();
    assert.equal(named(tree, "Save locally").props.disabled, false);
    named(tree, "Now for ABC-1").props.onChange({ target: { checked: true } });
    tree = render();
    assert.equal(named(tree, "Save locally").props.disabled, true);
    assert.equal(named(tree, "Now for ABC-1").props.checked, true);
    named(tree, "Next for ABC-1").props.onChange({ target: { checked: true } });
    tree = render();
    assert.equal(named(tree, "Now for ABC-1").props.checked, false);
    assert.equal(named(tree, "Next for ABC-1").props.checked, true);
    await named(tree, "Review changes").props.onClick();
    tree = render();
    named(tree, "Approve changes").props.onClick();
    tree = render();
    await named(tree, "Save to team").props.onClick();
    assert.equal(calls.at(-1).destination, "team");
    tree = render();
    assert.equal(named(tree, "Save to team").props.disabled, true);
    named(tree, "Approve changes").props.onClick();
    tree = render();
    await named(tree, "Save locally").props.onClick();
    tree = render();
    named(tree, "Approve changes").props.onClick();
    tree = render();
    failed = true;
    await named(tree, "Save locally").props.onClick();
    tree = render();
    assert.ok(flatten(tree).some(node => String(node.props?.children || "").includes("outcome is unknown")));
    assert.equal(named(tree, "Save locally").props.disabled, false);
    assert.equal(calls.at(-1).commit, "p4");
    failed = false;
    await named(tree, "Save locally").props.onClick();
    tree = render();
    assert.equal(named(tree, "Review changes").props.disabled, true);
    assert.equal(named(tree, "Save to team").props.disabled, false);
    await named(tree, "Save to team").props.onClick();
    tree = render();
    assert.equal(calls.at(-1).destination, "team");
    assert.equal(named(tree, "Save to team").props.disabled, true);
    assert.equal(named(tree, "Approve changes").props.disabled, false);
  } finally { delete globalThis.d3Hooks; delete globalThis.d3Services; }
});

test("real SQL: team destination rereads a different note and a conflict saves nothing locally or to team", { skip: !process.env.DOCKET_TEST_DATABASE_URL }, async (t) => {
  const url = new URL(process.env.DOCKET_TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, /^\/docket_test_[a-z0-9_]+$/);
  assert.ok(url.port);
  const store = await import("../server/lib/teamPriorityPostgres.mjs");
  enableTeamDatabase(t);
  const previous = process.env.TEAM_PRIORITY_DATABASE_URL;
  process.env.TEAM_PRIORITY_DATABASE_URL = url.href;
  const siteHost = context.siteHost;
  t.after(async () => {
    await store.getTeamPool().query("DELETE FROM team_issue_metadata WHERE site_host = $1", [siteHost]);
    await store.closeTeamPool();
    if (previous === undefined) delete process.env.TEAM_PRIORITY_DATABASE_URL; else process.env.TEAM_PRIORITY_DATABASE_URL = previous;
  });
  const { migrateTeamDatabase } = await import("../scripts/migrate-team-db.mjs");
  await migrateTeamDatabase(store.getTeamPool());
  await store.writeTeamMetadata({ siteHost, entries: [{ issueKey: "ABC-1", patch: { priority: 7, note: "team saved" } }, { issueKey: "ABC-2", patch: { note: "second" } }] });
  await fixture(async ({ db, post }) => {
    db.prepare("INSERT INTO issue_metadata(issue_key,note,priority) VALUES('ABC-1','local saved',9)").run();
    const rows = [{ ...row("ABC-1", { note: "replacement", followUp: "next", plannedStart: "2026-10-01", plannedFinish: "2026-10-05" }), replaceNote: true }, { ...row("ABC-2", { note: "changed" }), replaceNote: true }];
    const local = await post("/preview", { destination: "local", rows });
    const team = await post("/preview", { destination: "team", rows, supersedesPreviewId: local.body.previewId });
    assert.equal(team.status, 200);
    assert.equal(local.body.diff[0].changes.note.before, "local saved");
    assert.equal(team.body.diff[0].changes.note.before, "team saved");
    assert.equal((await store.getTeamMetadata({ siteHost, issueKeys: ["ABC-1"] }))["ABC-1"].note, "team saved");
    assert.equal(db.prepare("SELECT note FROM issue_metadata").get().note, "local saved");
    await store.writeTeamMetadata({ siteHost, entries: [{ issueKey: "ABC-2", patch: { note: "concurrent" } }] });
    const conflict = await post("/commit", { previewId: team.body.previewId });
    assert.equal(conflict.status, 409);
    assert.equal((await store.getTeamMetadata({ siteHost, issueKeys: ["ABC-1"] }))["ABC-1"].note, "team saved");
    assert.equal(db.prepare("SELECT note FROM issue_metadata").get().note, "local saved");
    const fresh = await post("/preview", { destination: "team", rows });
    assert.equal(fresh.status, 200);
    assert.equal((await post("/commit", { previewId: fresh.body.previewId })).body.updated, 2);
    const actual = await store.getTeamPool().query("SELECT note, follow_up, planned_start::text FROM team_issue_metadata WHERE site_host=$1 AND issue_key='ABC-1'", [siteHost]);
    assert.deepEqual(actual.rows[0], { note: "replacement", follow_up: "next", planned_start: "2026-10-01" });
    assert.equal(db.prepare("SELECT note FROM issue_metadata").get().note, "local saved");
  });
});

const withActualPreviewEditor = async ({ patch, local = {}, team = {} }, run) => {
  const { build } = await import("esbuild");
  const { createRequire } = await import("node:module");
  const { createIssueImportPreviewStore } = await import("../server/lib/issueImportPreview.mjs");
  const { getLocalMetadata, writeLocalMetadata } = await import("../server/lib/issueMetadataStore.mjs");
  const React = (await import("react")).default;
  const databases = { local: new Database(":memory:"), team: new Database(":memory:") };
  for (const [destination, db] of Object.entries(databases)) {
    initDatabase(db);
    const values = destination === "local" ? local : team;
    if (Object.keys(values).length) writeLocalMetadata(db, [{ issueKey: "ABC-1", patch: values }]);
  }
  let writes = 0;
  const store = createIssueImportPreviewStore({ writeMetadata: ({ destination, entries }) => { writes++; return writeLocalMetadata(databases[destination], entries); } });
  const create = (input) => store.createImportPreview({ ...input, siteContext: context, existingByKey: getLocalMetadata(databases[input.destination], ["ABC-1"]) });
  const initialPreview = create({ destination: "local", rows: [row("ABC-1", patch)] });
  let latest = initialPreview;
  const state = [];
  let cursor = 0;
  globalThis.d3Hooks = { ...React, useState: (initial) => { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], update => { state[i] = typeof update === "function" ? update(state[i]) : update; }]; }, useRef: (value) => { const i = cursor++; return state[i] ||= { current: value }; }, useSyncExternalStore: () => context };
  globalThis.d3Services = { previewIssueMetadataImport: async input => { latest = create(input); return latest; }, commitIssueMetadataImport: previewId => store.commitImportPreview({ previewId, siteContext: context }) };
  const bundled = await build({ entryPoints: ["src/Pages/Settings/components/IssueImportPreview.jsx"], bundle: true, write: false, format: "cjs", platform: "node", external: ["semantic-ui-react"], plugins: [{ name: "editor-preview-boundary", setup(build) {
    build.onResolve({ filter: /^react$/ }, () => ({ path: "hooks", namespace: "fixture" }));
    build.onResolve({ filter: /siteContextStore\.js$/ }, () => ({ path: "context", namespace: "fixture" }));
    build.onResolve({ filter: /services\/jiraClient\.js$/ }, () => ({ path: "services", namespace: "fixture" }));
    build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "context" ? 'export const getSiteContext = () => ({ instanceId: "synthetic", generation: "g1" }); export const subscribeSiteContext = () => () => {};' : path === "hooks" ? "export default globalThis.d3Hooks;" : "export const assertTeamPriorityEnabled = () => {}; export const previewIssueMetadataImport = (...args) => globalThis.d3Services.previewIssueMetadataImport(...args); export const commitIssueMetadataImport = (...args) => globalThis.d3Services.commitIssueMetadataImport(...args);" }));
  } }] });
  const mod = { exports: {} };
  new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
  const render = () => { cursor = 0; return mod.exports.default({ initialPreview, teamAvailable: true, siteContext: context, onLocalSaved: () => {} }); };
  const flatten = value => !value ? [] : Array.isArray(value) ? value.flatMap(flatten) : typeof value === "object" ? [value, ...flatten(value.props?.children)] : [];
  const named = (tree, name) => flatten(tree).find(node => node.props?.["aria-label"] === name || node.props?.children === name);
  try { await run({ render, named, flatten, latest: () => latest, writes: () => writes, metadata: destination => getLocalMetadata(databases[destination], ["ABC-1"])["ABC-1"] }); }
  finally { databases.local.close(); databases.team.close(); delete globalThis.d3Hooks; delete globalThis.d3Services; }
};

test("editor can compare and save team when the protected local note leaves no local changes", () => withActualPreviewEditor({ patch: { note: "imported note" }, local: { note: "protected local" } }, async ({ render, named, flatten, latest, writes, metadata }) => {
  let tree = render();
  assert.deepEqual(latest().diff[0].changes, {});
  assert.equal(named(tree, "Approve changes").props.disabled, true);
  const comparison = named(tree, "Comparison destination");
  assert.ok(comparison, "destination must be selectable before local approval");
  assert.equal(comparison.props.disabled, false);
  await comparison.props.onChange({ target: { value: "team" } });
  tree = render();
  assert.equal(latest().destination, "team");
  assert.equal(latest().diff[0].changes.note.after, "imported note");
  assert.equal(writes(), 0);
  assert.equal(named(tree, "Save to team").props.disabled, true);
  named(tree, "Approve changes").props.onClick();
  tree = render();
  await named(tree, "Save to team").props.onClick();
  tree = render();
  assert.equal(writes(), 1);
  assert.equal(metadata("team").note, "imported note");
  assert.equal(metadata("local").note, "protected local");
  assert.ok(flatten(tree).some(node => String(node.props?.children || "").startsWith("Saved 1 row to team.")));
}));

test("editor can compare team when planned dates are invalid only against local saved dates", () => withActualPreviewEditor({ patch: { plannedStart: "2026-10-05" }, local: { plannedFinish: "2026-10-02" }, team: { plannedFinish: "2026-10-10" } }, async ({ render, named, latest, writes }) => {
  let tree = render();
  assert.ok(latest().errors.length);
  assert.equal(named(tree, "Approve changes").props.disabled, true);
  const comparison = named(tree, "Comparison destination");
  assert.ok(comparison, "local validation cannot block team comparison");
  await comparison.props.onChange({ target: { value: "team" } });
  tree = render();
  assert.deepEqual(latest().errors, []);
  assert.equal(named(tree, "Approve changes").props.disabled, false);
  assert.equal(named(tree, "Save to team").props.disabled, true);
  assert.equal(writes(), 0);
}));

test("editor priority clear uses numeric zero while untouched omission and P-rank parsing survive", async () => {
  for (const [input, expected] of [["0", 0], ["", 0], ["P4", 4], ["P25", 20]]) {
    await withActualPreviewEditor({ patch: { note: "new note" }, local: { priority: 8 } }, async ({ render, named, latest, metadata }) => {
      let tree = render();
      assert.equal(Object.hasOwn(latest().rows[0].patch, "priority"), false);
      named(tree, "Priority for ABC-1").props.onChange({ target: { value: input } });
      tree = render();
      await named(tree, "Review changes").props.onClick();
      tree = render();
      assert.deepEqual(latest().errors, [], JSON.stringify(input));
      assert.equal(latest().diff[0].changes.priority.after, expected);
      assert.equal(metadata("local").priority, 8, "review does not save");
      named(tree, "Approve changes").props.onClick();
      tree = render();
      await named(tree, "Save locally").props.onClick();
      assert.equal(metadata("local").priority, expected);
    });
  }
});
