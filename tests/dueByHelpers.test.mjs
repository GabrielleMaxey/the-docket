import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildJqlEpicContext } from "../server/lib/dashboardRefresh/dueByHelpers.mjs";

// Builds a jiraRequest mock that serves a fixed set of issues from a "key in (...)" JQL search.
const makeJiraRequest = (issuesByKey) => async ({ body }) => {
  const match = String(body?.jql || "").match(/key in \(([^)]+)\)/);
  const keys = match ? match[1].split(",") : [];
  const issues = keys.map((key) => issuesByKey[key]).filter(Boolean);
  return { ok: true, data: { issues } };
};

const mappingsByRole = new Map();

describe("buildJqlEpicContext grandparent resolution", () => {
  it("falls back to the immediate parent when the grandparent is not an Epic", async () => {
    const subtask = {
      key: "SUB-1",
      fields: { issuetype: { name: "Sub-task" }, parent: { key: "TASK-1" } },
    };
    const issuesByKey = {
      "TASK-1": {
        key: "TASK-1",
        fields: { issuetype: { name: "Task" }, parent: { key: "INIT-1" } },
      },
      "INIT-1": {
        key: "INIT-1",
        fields: { issuetype: { name: "Initiative" } },
      },
    };

    const { epicKeyToIssues } = await buildJqlEpicContext({
      issues: [subtask],
      mappingsByRole,
      jiraRequest: makeJiraRequest(issuesByKey),
    });

    assert.deepEqual([...epicKeyToIssues.keys()], ["TASK-1"]);
    assert.deepEqual(epicKeyToIssues.get("TASK-1"), [subtask]);
  });

  it("still groups under the grandparent when it is confirmed to be an Epic", async () => {
    const subtask = {
      key: "SUB-2",
      fields: { issuetype: { name: "Sub-task" }, parent: { key: "STORY-1" } },
    };
    const issuesByKey = {
      "STORY-1": {
        key: "STORY-1",
        fields: { issuetype: { name: "Story" }, parent: { key: "EPIC-1" } },
      },
      "EPIC-1": {
        key: "EPIC-1",
        fields: { issuetype: { name: "Epic" } },
      },
    };

    const { epicKeyToIssues } = await buildJqlEpicContext({
      issues: [subtask],
      mappingsByRole,
      jiraRequest: makeJiraRequest(issuesByKey),
    });

    assert.deepEqual([...epicKeyToIssues.keys()], ["EPIC-1"]);
    assert.deepEqual(epicKeyToIssues.get("EPIC-1"), [subtask]);
  });
});
