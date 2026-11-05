import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFlowAcrossSites } from "../server/lib/combinedFlowReport.mjs";

const iso = (day) => `${day}T10:00:00.000+0000`;
const raw = (key, { parent, status = "In Progress", category = "indeterminate", created = "2026-09-01", assignee = "Pat Lee" } = {}) => ({
  key,
  fields: {
    summary: `Summary ${key}`, status: { name: status, statusCategory: { key: category } }, issuetype: { name: "Task" }, priority: { name: "Low" },
    assignee: { displayName: assignee }, created: iso(created), updated: iso(created), resolutiondate: null, duedate: null,
    ...(parent ? { parent: { key: parent, fields: { summary: "Parent" } } } : {}),
  },
  changelog: { total: 0, histories: [] },
});

const sites = [
  { instanceId: "a", displayName: "Alpha", baseUrl: "https://alpha.atlassian.net", credentials: { email: "a@x.test", apiToken: "t" } },
  { instanceId: "b", displayName: "Beta", baseUrl: "https://beta.atlassian.net", credentials: { email: "b@x.test", apiToken: "t" } },
];

describe("runFlowAcrossSites", () => {
  it("searches each site with its own credentials and the same JQL", async () => {
    const calls = [];
    const requestJira = async (o) => { calls.push(o); return { ok: true, status: 200, data: { issues: [raw("ODI-1")], isLast: true } }; };
    await runFlowAcrossSites({ sites, jql: "JQL-HERE", requestJira });
    assert.deepEqual(calls.map((c) => c.credentials.email).sort(), ["a@x.test", "b@x.test"]);
    for (const c of calls) {
      assert.equal(c.pathWithQuery, "/rest/api/3/search/jql");
      assert.equal(c.body.jql, "JQL-HERE");
    }
  });

  it("keeps the same key on two sites distinct, with per-site display keys and links", async () => {
    const requestJira = async (o) => ({ ok: true, status: 200, data: { issues: [raw("ODI-1", { parent: "ODI-9" })], isLast: true } });
    const { issues, sites: results } = await runFlowAcrossSites({ sites, jql: "j", requestJira });
    assert.equal(issues.length, 2);
    assert.deepEqual(issues.map((i) => i.key).sort(), ["Alpha: ODI-1", "Beta: ODI-1"]);
    const alpha = issues.find((i) => i.key === "Alpha: ODI-1");
    assert.equal(alpha.url, "https://alpha.atlassian.net/browse/ODI-1");
    assert.equal(alpha.parent, "Alpha: ODI-9");
    assert.equal(alpha.parentUrl, "https://alpha.atlassian.net/browse/ODI-9");
    assert.deepEqual(results.map((s) => [s.displayName, s.status, s.issueCount]), [["Alpha", "complete", 1], ["Beta", "complete", 1]]);
  });

  it("reports a failing site safely and keeps the others", async () => {
    const requestJira = async (o) => o.credentials.email.startsWith("a")
      ? { ok: false, status: 401, data: { message: "private secret detail" } }
      : { ok: true, status: 200, data: { issues: [raw("ODI-2")], isLast: true } };
    const { issues, sites: results } = await runFlowAcrossSites({ sites, jql: "j", requestJira });
    assert.deepEqual(issues.map((i) => i.key), ["Beta: ODI-2"]);
    assert.equal(results[0].status, "failed");
    assert.equal(results[0].issueCount, 0);
    assert.doesNotMatch(JSON.stringify(results), /private|secret/);
    assert.equal(results[1].status, "complete");
  });

  it("reports a site whose saved setup is unusable without calling Jira", async () => {
    const requestJira = async () => assert.fail("no request for an unusable site");
    const { sites: results } = await runFlowAcrossSites({ sites: [{ ...sites[0], setupMessage: "Check this saved entry's approved HTTPS Jira URL in Settings." }], jql: "j", requestJira });
    assert.equal(results[0].status, "failed");
    assert.match(results[0].message, /approved HTTPS Jira URL/);
  });

  it("marks a site partial when its search is incomplete", async () => {
    const requestJira = async () => ({ ok: true, status: 200, data: { issues: [raw("ODI-3")], isLast: false, nextPageToken: "" } });
    const { sites: results } = await runFlowAcrossSites({ sites: sites.slice(0, 1), jql: "j", requestJira });
    assert.equal(results[0].status, "partial");
    assert.match(results[0].message, /incomplete/i);
  });
});
