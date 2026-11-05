import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { registerCombinedFlowReportRoute } from "../server/routes/combinedFlowReportRoute.mjs";

const issue = (key, url, parent = "", parentUrl = "") => ({ key, summary: key, status: "In Progress", statusCategory: "indeterminate", type: "Task", priority: "", parent, parentSummary: "P", created: "2026-09-01T10:00:00.000+0000", updated: "2026-09-02T10:00:00.000+0000", resolved: null, dueDate: null, assignee: "Pat Lee", transitions: [], url, parentUrl });
const siteRows = [
  { instanceId: "a", displayName: "Alpha", siteHost: "alpha.atlassian.net", status: "complete", issueCount: 1, message: "" },
  { instanceId: "b", displayName: "Beta", siteHost: "beta.atlassian.net", status: "failed", issueCount: 0, message: "Jira access denied. Check this saved entry's account and server token." },
];

const withServer = async (collectFlow, fn) => {
  const app = express();
  app.use(express.json());
  registerCombinedFlowReportRoute(app, { metaDb: {}, env: {}, requestJira: async () => ({}), collectFlow });
  const server = await new Promise((resolve) => { const l = app.listen(0, "127.0.0.1", () => resolve(l)); });
  const post = (body) => fetch(`http://127.0.0.1:${server.address().port}/api/combined-flow-report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try { return await fn(post); } finally { await new Promise((resolve) => server.close(resolve)); }
};

describe("POST /api/combined-flow-report", () => {
  it("builds one report across sites with per-site links, a Sites chip and a failure note", async () => {
    const calls = [];
    const collectFlow = async (args) => { calls.push(args); return { issues: [issue("Alpha: ODI-1", "https://alpha.atlassian.net/browse/ODI-1")], sites: siteRows }; };
    await withServer(collectFlow, async (post) => {
      const response = await post({ instanceIds: ["a", "b"], windowMonths: 6 });
      assert.equal(response.status, 200);
      const { data, markdown } = await response.json();
      assert.deepEqual(calls[0].instanceIds, ["a", "b"]);
      assert.match(calls[0].jql, /^assignee = currentUser\(\) AND/);
      assert.doesNotMatch(calls[0].jql, /WAS/);
      assert.ok(data.chips.includes("Sites: Alpha, Beta"));
      assert.equal(data.urls["Alpha: ODI-1"], "https://alpha.atlassian.net/browse/ODI-1");
      assert.equal(data.meta.combined, true);
      assert.deepEqual(data.meta.sites.map((s) => s.status), ["complete", "failed"]);
      assert.match(data.footnote, /Beta/);
      assert.match(data.footnote, /not included/i);
      assert.match(markdown, /\[Alpha: ODI-1\]\(https:\/\/alpha\.atlassian\.net\/browse\/ODI-1\)/);
    });
  });

  it("passes the handed-on option through to the JQL", async () => {
    const calls = [];
    await withServer(async (args) => { calls.push(args); return { issues: [], sites: siteRows.slice(0, 1) }; }, async (post) => {
      assert.equal((await post({ instanceIds: ["a"], includeHandedOn: true })).status, 200);
      assert.match(calls[0].jql, /assignee WAS currentUser\(\)/);
    });
  });

  it("rejects unknown body fields and surfaces selection errors as 400", async () => {
    await withServer(async () => { throw Object.assign(new TypeError("Choose one to five unique enabled saved Jira entries."), { status: 400 }); }, async (post) => {
      assert.equal((await post({ instanceIds: ["a"], jql: "project = X" })).status, 400);
      const bad = await post({ instanceIds: [] });
      assert.equal(bad.status, 400);
      assert.match((await bad.json()).error, /Choose one to five/);
    });
  });

  it("answers a generic 500 for unexpected failures", async () => {
    await withServer(async () => { throw new Error("secret upstream detail"); }, async (post) => {
      const response = await post({ instanceIds: ["a"] });
      assert.equal(response.status, 500);
      assert.doesNotMatch(JSON.stringify(await response.json()), /secret/);
    });
  });
});
