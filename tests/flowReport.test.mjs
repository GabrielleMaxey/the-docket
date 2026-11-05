import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { buildFlowJql, fetchFlowIssues, normalizeJiraIssue, resolveFlowScope, windowStartForMonths } from "../server/lib/flowReport.mjs";
import { registerReportRoutes } from "../server/routes/reportRoutes.mjs";
import { addDays } from "../shared/flowMetrics.mjs";

const today = new Date().toISOString().slice(0, 10);
const iso = (day) => `${day}T10:00:00.000+0000`;

const rawIssue = (key, { status = "Backlog", category = "new", type = "Task", created, resolved = null, histories = [], total = histories.length, parent } = {}) => ({
  key,
  fields: {
    summary: `Summary ${key}`,
    status: { name: status, statusCategory: { key: category } },
    issuetype: { name: type },
    priority: { name: "Low" },
    assignee: { displayName: "Pat Lee" },
    created: iso(created),
    updated: iso(created),
    resolutiondate: resolved ? iso(resolved) : null,
    duedate: null,
    ...(parent ? { parent: { key: parent, fields: { summary: "[GCP] Parent" } } } : {}),
  },
  changelog: { total, histories },
});

const presetRows = {
  1: { id: 1, presetType: "epic", epicKey: "ODI-100", epicName: "Alpha", jql: "" },
  2: { id: 2, presetType: "jql", epicName: "Beta", jql: 'project = BETA AND status NOT IN (Done, Closed) ORDER BY rank' },
  3: { id: 3, presetType: "jql", epicName: "Gamma", jql: "" },
};

const statusHistory = (day, from, to) => ({ created: iso(day), items: [{ field: "status", fromString: from, toString: to }, { field: "assignee", fromString: "a", toString: "b" }] });

describe("normalizeJiraIssue assignee", () => {
  it("reads the assignee display name, empty when unassigned", () => {
    assert.equal(normalizeJiraIssue(rawIssue("ODI-1", { created: "2026-01-01" })).assignee, "Pat Lee");
    assert.equal(normalizeJiraIssue({ key: "ODI-2", fields: { assignee: null } }).assignee, "");
  });
});

describe("windowStartForMonths / buildFlowJql", () => {
  it("steps back whole calendar months and clamps short months", () => {
    assert.equal(windowStartForMonths("2026-11-05", 12), "2025-11-05");
    assert.equal(windowStartForMonths("2026-03-31", 1), "2026-02-28");
    assert.equal(windowStartForMonths("2026-05-31", 3), "2026-02-28");
  });

  it("builds a currentUser JQL for created-or-resolved in the window", () => {
    const jql = buildFlowJql({ windowStart: "2025-11-05" });
    assert.equal(jql, 'assignee = currentUser() AND (created >= "2025-11-05" OR resolved >= "2025-11-05") ORDER BY created DESC');
    assert.throws(() => buildFlowJql({ windowStart: "yesterday" }));
    // only the first 10 characters survive, so trailing text can never reach the query
    assert.ok(!buildFlowJql({ windowStart: '2025-11-05" OR 1=1' }).includes("1=1"));
  });
});

describe("normalizeJiraIssue", () => {
  it("keeps only status transitions, sorted by time", () => {
    const issue = normalizeJiraIssue(rawIssue("ODI-1", { created: "2026-01-01", histories: [statusHistory("2026-02-02", "In Progress", "Closed"), statusHistory("2026-01-05", "Backlog", "In Progress")] }));
    assert.deepEqual(issue.transitions.map((t) => t.to), ["In Progress", "Closed"]);
    assert.equal(issue.needsChangelog, false);
    assert.equal(issue.statusCategory, "new");
  });

  it("marks truncated or missing changelogs as unknown, never as empty", () => {
    const truncated = normalizeJiraIssue(rawIssue("ODI-2", { created: "2026-01-01", histories: [statusHistory("2026-01-05", "Backlog", "In Progress")], total: 150 }));
    assert.equal(truncated.transitions, null);
    assert.equal(truncated.needsChangelog, true);
    const missing = normalizeJiraIssue({ key: "ODI-3", fields: { status: { name: "Backlog" } } });
    assert.equal(missing.transitions, null);
  });
});

describe("fetchFlowIssues", () => {
  it("pages results, requests changelogs, and backfills truncated ones", async () => {
    const calls = [];
    const jiraRequest = async (req) => {
      calls.push(req);
      if (req.method === "POST") {
        if (!req.body.nextPageToken) {
          return { ok: true, status: 200, data: { issues: [rawIssue("ODI-1", { created: "2026-01-01" }), rawIssue("ODI-2", { created: "2026-01-02", histories: [statusHistory("2026-01-03", "Backlog", "In Progress")], total: 150 })], nextPageToken: "p2", isLast: false } };
        }
        return { ok: true, status: 200, data: { issues: [rawIssue("ODI-3", { created: "2026-01-04" })], isLast: true } };
      }
      assert.match(req.pathWithQuery, /^\/rest\/api\/3\/issue\/ODI-2\/changelog\?startAt=0&maxResults=100$/);
      return { ok: true, status: 200, data: { isLast: true, values: [statusHistory("2026-01-03", "Backlog", "In Progress"), statusHistory("2026-01-20", "In Progress", "Closed")] } };
    };
    const result = await fetchFlowIssues({ jql: "assignee = currentUser()", jiraRequest });
    assert.equal(result.issues.length, 3);
    assert.equal(result.isComplete, true);
    const search = calls.filter((c) => c.method === "POST");
    assert.equal(search.length, 2);
    assert.equal(search[0].body.expand, "changelog");
    assert.ok(search[0].body.fields.includes("resolutiondate"));
    assert.deepEqual(result.issues[1].transitions.map((t) => t.to), ["In Progress", "Closed"]);
    assert.ok(result.issues.every((i) => !("needsChangelog" in i)));
  });

  it("surfaces Jira search failures", async () => {
    const jiraRequest = async () => ({ ok: false, status: 400, data: { errorMessages: ["bad jql"] } });
    await assert.rejects(fetchFlowIssues({ jql: "x", jiraRequest }), /bad jql/);
  });
});

describe("flow report routes", () => {
  const withServer = async (testFn, { issues, presets = {}, requests = [], completeNarrative } = {}) => {
    const inserts = [];
    const db = { prepare: () => ({ run: (params) => { inserts.push(params); return { lastInsertRowid: 7 }; }, get: (id) => presets[id] }) };
    const app = express();
    app.use(express.json());
    registerReportRoutes(app, {
      getDb: () => db,
      dataDir: ".",
      ensureEnvOrRespond: () => true,
      ...(completeNarrative ? { completeNarrative } : {}),
      getCredentials: () => ({ baseUrl: "https://example.atlassian.net/" }),
      getSiteContext: () => ({ siteHost: "example.atlassian.net" }),
      jiraRequest: async (req) => { requests.push(req); return { ok: true, status: 200, data: { issues, isLast: true } }; },
    });
    const server = await new Promise((resolve) => { const l = app.listen(0, "127.0.0.1", () => resolve(l)); });
    const post = (path, body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    try { return await testFn({ post, inserts }); } finally { await new Promise((resolve) => server.close(resolve)); }
  };

  const issues = [
    rawIssue("ODI-1", { status: "Closed", category: "done", type: "Bug", created: addDays(today, -30), resolved: addDays(today, -20), histories: [statusHistory(addDays(today, -25), "Backlog", "In Progress")] }),
    rawIssue("ODI-2", { status: "In Progress", category: "indeterminate", created: addDays(today, -60), histories: [statusHistory(addDays(today, -50), "Backlog", "In Progress")], parent: "ODI-9" }),
  ];

  it("generates a report with site label, issue links and markdown", async () => {
    await withServer(async ({ post }) => {
      const response = await post("/api/reports/flow", { windowMonths: 6 });
      assert.equal(response.status, 200);
      const { data, markdown } = await response.json();
      assert.equal(data.meta.issueCount, 2);
      assert.equal(data.meta.windowMonths, 6);
      assert.equal(data.title, "My Assigned Work: Past 6 months");
      assert.ok(data.chips.includes("Site: example.atlassian.net"));
      assert.equal(data.baseUrl, "https://example.atlassian.net/browse/");
      assert.equal(data.open[0].idle, 50);
      assert.match(markdown, /\[ODI-2\]\(https:\/\/example\.atlassian\.net\/browse\/ODI-2\)/);
    }, { issues });
  });

  it("covers everyone's issues in the selected projects, not just mine", async () => {
    const requests = [];
    const presets = { 5: { id: 5, preset_type: "jql", epic_name: "Alpha", jql: "project = ALPHA" } };
    await withServer(async ({ post }) => {
      const { data } = await (await post("/api/reports/flow", { presetIds: [5], allAssignees: true })).json();
      assert.ok(data.chips.includes("Projects: Alpha"));
      assert.equal(data.title, "Flow Report: Past 12 months");
      assert.match(data.subtitle, /all assignees/);
      assert.doesNotMatch(data.footnote, /currently assigned to the person/);
      const searched = JSON.stringify(requests.map((r) => r.body || r.pathWithQuery));
      assert.doesNotMatch(searched, /currentUser/);
      assert.match(searched, /AND \(\(project = ALPHA\)\) ORDER BY created DESC/);
    }, { issues, presets, requests });
  });

  it("adds handed-on work, labels it, and shows who holds each issue now", async () => {
    const requests = [];
    await withServer(async ({ post }) => {
      const { data } = await (await post("/api/reports/flow", { includeHandedOn: true })).json();
      assert.match(JSON.stringify(requests.map((r) => r.body)), /assignee WAS currentUser\(\)/);
      assert.ok(data.chips.includes("Includes work handed on"));
      assert.equal(data.meta.includeHandedOn, true);
      assert.equal(data.open[0].assignee, "Pat Lee");
      assert.match(data.footnote, /handed on/i);
    }, { issues, requests });
  });

  it("keeps the report to my own issues when no all-assignees flag is sent", async () => {
    const requests = [];
    const presets = { 5: { id: 5, preset_type: "jql", epic_name: "Alpha", jql: "project = ALPHA" } };
    await withServer(async ({ post }) => {
      const { data } = await (await post("/api/reports/flow", { presetIds: [5] })).json();
      assert.equal(data.title, "My Assigned Work: Past 12 months");
      assert.match(JSON.stringify(requests.map((r) => r.body)), /currentUser/);
    }, { issues, presets, requests });
  });

  it("ignores the all-assignees flag when no projects are selected", async () => {
    const requests = [];
    await withServer(async ({ post }) => {
      const { data } = await (await post("/api/reports/flow", { allAssignees: true })).json();
      assert.equal(data.title, "My Assigned Work: Past 12 months");
      assert.match(JSON.stringify(requests.map((r) => r.body)), /currentUser/);
    }, { issues, requests });
  });

  it("answers 400 when the selected projects have no usable JQL", async () => {
    await withServer(async ({ post }) => {
      const response = await post("/api/reports/flow", { presetIds: [404] });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /no usable JQL/);
    }, { issues });
  });

  it("writes an AI summary for report data and returns it trimmed", async () => {
    const calls = [];
    const completeNarrative = async (args) => { calls.push(args); return "  Throughput is steady.\n\nThree items are stalled.  "; };
    await withServer(async ({ post }) => {
      const { data } = await (await post("/api/reports/flow", {})).json();
      const response = await post("/api/reports/flow/narrative", { data });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).narrative, "Throughput is steady.\n\nThree items are stalled.");
      assert.equal(calls.length, 1);
      assert.match(calls[0].context, /ODI-2/);
      assert.match(calls[0].systemPrompt, /only the numbers/i);
    }, { issues, completeNarrative });
  });

  it("rejects invalid data for the AI summary and surfaces provider failures", async () => {
    await withServer(async ({ post }) => {
      assert.equal((await post("/api/reports/flow/narrative", { data: { title: "x" } })).status, 400);
    }, { issues, completeNarrative: async () => "never" });
    await withServer(async ({ post }) => {
      const { data } = await (await post("/api/reports/flow", {})).json();
      const response = await post("/api/reports/flow/narrative", { data });
      assert.equal(response.status, 502);
      assert.match((await response.json()).error, /No AI provider/);
    }, { issues, completeNarrative: async () => { throw new Error("No AI provider configured."); } });
  });

  it("saves a report to the archive as flow_report with the data in meta", async () => {
    await withServer(async ({ post, inserts }) => {
      const { data } = await (await post("/api/reports/flow", {})).json();
      const saved = await post("/api/reports/flow/archive", { data, savedAtLocal: "2026-11-05T12:00:00" });
      assert.equal(saved.status, 200);
      assert.equal((await saved.json()).archiveId, 7);
      assert.equal(inserts.length, 1);
      assert.equal(inserts[0].reportType, "flow_report");
      assert.equal(inserts[0].source, "dashboard");
      assert.equal(JSON.parse(inserts[0].metaJson).flowReport.meta.issueCount, 2);
      assert.match(inserts[0].content, /^# My Assigned Work/);
    }, { issues });
  });

  it("rejects invalid data when saving", async () => {
    await withServer(async ({ post, inserts }) => {
      assert.equal((await post("/api/reports/flow/archive", { data: { title: "x" } })).status, 400);
      assert.equal((await post("/api/reports/flow/archive", {})).status, 400);
      assert.equal(inserts.length, 0);
    }, { issues });
  });
});

describe("flow report project scope", () => {
  const loadPreset = (id) => presetRows[id] || null;
  const jiraRequest = async () => ({ ok: false });

  it("drops the assignee clause for all-assignees reports", () => {
    const jql = buildFlowJql({ windowStart: "2025-11-05", scopeJql: "project = A", allAssignees: true });
    assert.equal(jql, '(created >= "2025-11-05" OR resolved >= "2025-11-05") AND (project = A) ORDER BY created DESC');
    assert.match(buildFlowJql({ windowStart: "2025-11-05", scopeJql: "project = A" }), /^assignee = currentUser\(\)/);
  });

  it("includes issues I was assigned earlier when asked", () => {
    const jql = buildFlowJql({ windowStart: "2025-11-05", includeHandedOn: true });
    assert.equal(jql, '(assignee = currentUser() OR assignee WAS currentUser()) AND (created >= "2025-11-05" OR resolved >= "2025-11-05") ORDER BY created DESC');
    const scoped = buildFlowJql({ windowStart: "2025-11-05", includeHandedOn: true, scopeJql: "project = A" });
    assert.match(scoped, /^\(assignee = currentUser\(\) OR assignee WAS currentUser\(\)\) AND .* AND \(project = A\) ORDER BY created DESC$/);
  });

  it("ignores handed-on for all-assignees reports", () => {
    assert.doesNotMatch(buildFlowJql({ windowStart: "2025-11-05", scopeJql: "project = A", allAssignees: true, includeHandedOn: true }), /WAS|currentUser/);
  });

  it("refuses an unscoped all-assignees query", () => {
    assert.throws(() => buildFlowJql({ windowStart: "2025-11-05", allAssignees: true }), /scope/i);
  });

  it("adds the scope to the JQL and strips any ORDER BY from it", () => {
    const jql = buildFlowJql({ windowStart: "2025-11-05", scopeJql: "(project = A) OR (project = B) ORDER BY rank" });
    assert.equal(jql, 'assignee = currentUser() AND (created >= "2025-11-05" OR resolved >= "2025-11-05") AND ((project = A) OR (project = B)) ORDER BY created DESC');
    assert.ok(!buildFlowJql({ windowStart: "2025-11-05" }).includes("AND ("  + "(project"));
  });

  it("unions the selected presets, drops open-only status filters, and labels them", async () => {
    const scope = await resolveFlowScope({ presetIds: [1, 2], loadPreset, jiraRequest });
    assert.equal(scope.requested, 2);
    assert.deepEqual(scope.names, ["Alpha", "Beta"]);
    assert.equal(scope.scopeLabel, "Alpha, Beta");
    assert.match(scope.scopeJql, /^\(.*ODI-100.*\) OR \(project = BETA\)$/);
    assert.ok(!/status/i.test(scope.scopeJql.split(" OR ")[1]), "open-only status clause must be removed so resolved issues stay in scope");
  });

  it("returns an empty scope when nothing is selected, and ignores unknown or unusable presets", async () => {
    assert.equal((await resolveFlowScope({ presetIds: [], loadPreset, jiraRequest })).scopeJql, "");
    const partial = await resolveFlowScope({ presetIds: ["1", 1, 99, "abc"], loadPreset, jiraRequest });
    assert.deepEqual(partial.names, ["Alpha"]);
    const unusable = await resolveFlowScope({ presetIds: [3, 99], loadPreset, jiraRequest });
    assert.equal(unusable.requested, 2);
    assert.equal(unusable.scopeJql, "");
  });

  it("summarises long selections", async () => {
    const many = { ...presetRows, 4: { ...presetRows[2], id: 4, epicName: "Delta" }, 5: { ...presetRows[2], id: 5, epicName: "Eps" } };
    const scope = await resolveFlowScope({ presetIds: [1, 2, 4, 5], loadPreset: (id) => many[id], jiraRequest });
    assert.equal(scope.scopeLabel, "Alpha, Beta, Delta +1 more");
  });
});
