import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDashboardMetricsJql,
  buildFieldMappingsMap,
  buildPastDueJql,
  fallbackPresetJql,
} from "../server/lib/epicFilterJql.mjs";

describe("buildDashboardMetricsJql", () => {
  it("returns empty string for blank input", () => {
    assert.equal(buildDashboardMetricsJql(""), "");
    assert.equal(buildDashboardMetricsJql("   "), "");
  });

  it("strips open-only status filters while keeping scope and order", () => {
    const source =
      "project = ODI AND status NOT IN (Done, Closed) ORDER BY updated DESC";
    const result = buildDashboardMetricsJql(source);
    assert.equal(result, "project = ODI ORDER BY updated DESC");
  });

  it("removes statusCategory != Done and status IN (Open) clauses", () => {
    const source =
      "project = ODI AND statusCategory != Done AND status IN (Open) ORDER BY priority ASC";
    const result = buildDashboardMetricsJql(source);
    assert.equal(result, "project = ODI ORDER BY priority ASC");
  });

  it("defaults order clause when source has no ORDER BY", () => {
    const result = buildDashboardMetricsJql("project = ODI AND status != Done");
    assert.match(result, /^project = ODI ORDER BY updated DESC$/);
  });

  it("preserves custom ORDER BY at end of query", () => {
    const result = buildDashboardMetricsJql(
      "assignee = currentUser() ORDER BY created ASC"
    );
    assert.equal(result, "assignee = currentUser() ORDER BY created ASC");
  });
});

describe("buildFieldMappingsMap", () => {
  it("maps role rows to field id and name", () => {
    const map = buildFieldMappingsMap([
      { role: "due_date", field_id: "duedate", field_name: "Due date" },
    ]);

    assert.deepEqual(map.get("due_date"), {
      role: "due_date",
      fieldId: "duedate",
      fieldName: "Due date",
    });
  });
});

describe("fallbackPresetJql", () => {
  it("builds parent-or-key clause for epic presets", () => {
    assert.equal(
      fallbackPresetJql("ODI-123"),
      "(parent = ODI-123 OR key = ODI-123) ORDER BY updated DESC"
    );
    assert.equal(fallbackPresetJql(""), "");
  });
});

describe("buildPastDueJql", () => {
  const mappingsByRole = buildFieldMappingsMap([
    { role: "due_date", field_id: "duedate", field_name: "Due date" },
    {
      role: "initial_done_date",
      field_id: "customfield_10008",
      field_name: "Initial Done Date",
    },
    {
      role: "most_recent_done_date",
      field_id: "customfield_10009",
      field_name: "Most Recent Done Date",
    },
    { role: "project_end_date", field_id: "customfield_ped", field_name: "Project End Date" },
  ]);

  it("includes task overdue clause and epic past-due OR branch", () => {
    const jql = buildPastDueJql({
      mappingsByRole,
      epicPastDueMode: "either",
      epicKeys: [],
    });

    assert.match(jql, /statusCategory != Done/);
    assert.match(jql, /duedate is not EMPTY/);
    assert.match(jql, /"Initial Done Date" is not EMPTY/);
    assert.match(jql, /"Most Recent Done Date" is not EMPTY/);
    assert.match(jql, /issuetype = Epic/);
    assert.match(jql, /ORDER BY updated DESC$/);
  });

  it("scopes to epic keys when provided", () => {
    const jql = buildPastDueJql({
      mappingsByRole,
      epicPastDueMode: "project_end_date",
      epicKeys: ["ODI-1", "ODI-2"],
    });

    assert.match(jql, /parent in \(ODI-1, ODI-2\)/);
    assert.match(jql, /key in \(ODI-1, ODI-2\)/);
  });

  it("adds a floor date when pastDueFloorDate is provided", () => {
    const jql = buildPastDueJql({
      mappingsByRole,
      epicPastDueMode: "either",
      epicKeys: [],
      pastDueFloorDate: new Date("2024-06-01T12:00:00Z"),
    });

    assert.match(jql, /duedate >= "2024-06-01"/);
    assert.match(jql, /"Most Recent Done Date" >= "2024-06-01"/);
  });
});
