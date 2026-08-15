import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDashboardMetricsJql,
  buildFieldMappingsMap,
  buildPastDueJql,
  fallbackPresetJql,
  splitTrailingOrderBy,
} from "../server/lib/epicFilterJql.mjs";

describe("splitTrailingOrderBy", () => {
  it("returns empty scope and orderBy for blank input", () => {
    assert.deepEqual(splitTrailingOrderBy(""), { scope: "", orderBy: "" });
    assert.deepEqual(splitTrailingOrderBy("   "), { scope: "", orderBy: "" });
  });

  it("splits a simple trailing ORDER BY", () => {
    const result = splitTrailingOrderBy("project = ODI ORDER BY updated DESC");
    assert.deepEqual(result, {
      scope: "project = ODI",
      orderBy: "ORDER BY updated DESC",
    });
  });

  it("returns the full string as scope when there is no ORDER BY", () => {
    const result = splitTrailingOrderBy("project = ODI AND status != Done");
    assert.deepEqual(result, {
      scope: "project = ODI AND status != Done",
      orderBy: "",
    });
  });

  it("ignores an 'order by' phrase that only appears inside a quoted string", () => {
    // Regression: this exact phrase in a text-search literal used to get
    // matched by a naive regex and truncate the scope mid-string.
    const source = 'summary ~ "purchase order by region" OR parent IN (ODI-1)';
    const result = splitTrailingOrderBy(source);
    assert.deepEqual(result, { scope: source, orderBy: "" });
  });

  it("still finds a real trailing ORDER BY when the scope also contains a quoted 'order by' phrase", () => {
    const source =
      'summary ~ "purchase order by region" OR parent IN (ODI-1) ORDER BY key DESC';
    const result = splitTrailingOrderBy(source);
    assert.deepEqual(result, {
      scope: 'summary ~ "purchase order by region" OR parent IN (ODI-1)',
      orderBy: "ORDER BY key DESC",
    });
  });

  it("handles NORA's real preset JQL correctly", () => {
    const source =
      'issuekey ~ "ODI-*" AND issuetype IN (subTaskIssueTypes(), standardIssueTypes(), "Sub-task") AND summary ~ "(swigert OR NORA)" OR parent IN (ODI-23957) ORDER BY key DESC, parent ASC, status ASC, rank';
    const result = splitTrailingOrderBy(source);
    assert.equal(
      result.scope,
      'issuekey ~ "ODI-*" AND issuetype IN (subTaskIssueTypes(), standardIssueTypes(), "Sub-task") AND summary ~ "(swigert OR NORA)" OR parent IN (ODI-23957)'
    );
    assert.equal(result.orderBy, "ORDER BY key DESC, parent ASC, status ASC, rank");
  });

  it("handles an escaped quote inside a string literal without breaking quote tracking", () => {
    const source = 'summary ~ "say \\"order by\\" here" ORDER BY updated DESC';
    const result = splitTrailingOrderBy(source);
    assert.equal(result.orderBy, "ORDER BY updated DESC");
  });
});

describe("buildDashboardMetricsJql", () => {
  it("returns empty string for blank input", () => {
    assert.equal(buildDashboardMetricsJql(""), "");
    assert.equal(buildDashboardMetricsJql("   "), "");
  });

  it("does not truncate scope when it contains a quoted 'order by' phrase", () => {
    const source = 'summary ~ "purchase order by region" OR project = ODI';
    const result = buildDashboardMetricsJql(source);
    assert.equal(result, `${source} ORDER BY updated DESC`);
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
