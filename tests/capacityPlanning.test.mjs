import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchCapacityWorkloads } from "../server/lib/capacityPlanning.mjs";

const BUSY_ID = "712020:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LIGHT_ID = "712020:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const openIssue = (displayName, accountId) => ({
  fields: {
    status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
    assignee: { displayName, accountId },
    duedate: null,
    updated: new Date().toISOString(),
  },
});

const searchOk = (issues) => ({
  ok: true,
  data: { issues, isLast: true },
});

describe("fetchCapacityWorkloads contributor totals", () => {
  const watchedRows = [
    { id: 1, displayName: "Team", watchType: "jql", jql: "project = ODI", capacity: null },
  ];

  it("counts each assignee separately so a lightly loaded person still gets a total", async () => {
    const countJqls = [];
    const items = await fetchCapacityWorkloads({
      watchedRows,
      runJiraSearchRequest: async () =>
        searchOk([
          openIssue("Busy Person", BUSY_ID),
          openIssue("Busy Person", BUSY_ID),
          openIssue("Light Person", LIGHT_ID),
        ]),
      jiraRequest: async ({ pathWithQuery, body }) => {
        assert.match(pathWithQuery, /approximate-count/);
        countJqls.push(body.jql);
        if (body.jql.includes(LIGHT_ID)) {
          return { ok: true, data: { count: 3 } };
        }
        if (body.jql.includes(BUSY_ID)) {
          return { ok: true, data: { count: 80 } };
        }
        return { ok: false, data: {} };
      },
    });

    assert.equal(items.length, 1);
    assert.deepEqual(items[0].contributorCounts, {
      "Busy Person": 2,
      "Light Person": 1,
    });
    assert.deepEqual(items[0].contributorTotalCounts, {
      "Busy Person": 80,
      "Light Person": 3,
    });
    assert.equal(countJqls.length, 2);
    assert.ok(countJqls.some((jql) => jql.includes(`assignee = "${LIGHT_ID}"`)));
    assert.ok(countJqls.some((jql) => jql.includes(`assignee = "${BUSY_ID}"`)));
    assert.equal(items[0].contributorAccountIds, undefined);
    assert.equal(items[0].openCountIncomplete, false);
  });

  it("keeps other totals when one assignee count fails", async () => {
    const items = await fetchCapacityWorkloads({
      watchedRows,
      runJiraSearchRequest: async () =>
        searchOk([
          openIssue("Busy Person", BUSY_ID),
          openIssue("Light Person", LIGHT_ID),
        ]),
      jiraRequest: async ({ body }) => {
        if (body.jql.includes(LIGHT_ID)) {
          throw new Error("The value 'Light Person' does not exist for the field 'assignee'.");
        }
        return { ok: true, data: { count: 80 } };
      },
    });

    assert.equal(items[0].contributorTotalCounts["Busy Person"], 80);
    assert.equal(items[0].contributorTotalCounts["Light Person"], undefined);
  });

  it("counts overdue from mapped done-date fields when duedate is empty", async () => {
    const issue = {
      fields: {
        status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
        assignee: { displayName: "Busy Person", accountId: BUSY_ID },
        duedate: null,
        customfield_10009: "2020-01-01",
        updated: new Date().toISOString(),
      },
    };
    const items = await fetchCapacityWorkloads({
      watchedRows,
      runJiraSearchRequest: async () => searchOk([issue]),
      jiraRequest: async () => ({ ok: true, data: { count: 8 } }),
    });

    assert.equal(items[0].overdueCount, 1);
    assert.match(items[0].overdueClause, /cf\[10009\]/);
    assert.match(items[0].overdueClause, /startOfDay\(\)/);
    assert.equal(items[0].overdueClause.includes("due < now()"), false);
  });

  it("does not count an open issue with empty due and done dates as overdue", async () => {
    const items = await fetchCapacityWorkloads({
      watchedRows,
      runJiraSearchRequest: async () => searchOk([openIssue("Busy Person", BUSY_ID)]),
      jiraRequest: async () => ({ ok: true, data: { count: 8 } }),
    });

    assert.equal(items[0].overdueCount, 0);
  });

  it("flags the open count as incomplete when Jira still has another page at the cap", async () => {
    const page = Array.from({ length: 100 }, () => openIssue("Busy Person", BUSY_ID));
    const items = await fetchCapacityWorkloads({
      watchedRows,
      runJiraSearchRequest: async () => ({
        ok: true,
        data: { issues: page, isLast: false, nextPageToken: "more" },
      }),
      jiraRequest: async () => ({ ok: true, data: { count: 8000 } }),
    });

    assert.equal(items[0].openCount, 5000);
    assert.equal(items[0].openCountIncomplete, true);
  });
});

describe("fetchCapacityWorkloads overdue date basis", () => {
  const past = "2020-01-01";
  const future = "2099-01-01";
  const epicIssue = {
    key: "ODI-1",
    fields: {
      issuetype: { name: "Epic" },
      summary: "Parent epic",
      customfield_10008: future,
      customfield_10009: future,
    },
  };
  const childWithStaleDue = {
    key: "ODI-2",
    fields: {
      status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
      issuetype: { name: "Story" },
      parent: { key: "ODI-1", fields: { issuetype: { name: "Epic" } } },
      assignee: { displayName: "Busy Person", accountId: BUSY_ID },
      duedate: past,
      customfield_10008: null,
      customfield_10009: null,
      updated: new Date().toISOString(),
    },
  };
  const childWithNoDates = {
    ...childWithStaleDue,
    key: "ODI-3",
    fields: {
      ...childWithStaleDue.fields,
      duedate: null,
    },
  };
  const pastEpic = {
    ...epicIssue,
    fields: {
      ...epicIssue.fields,
      customfield_10008: past,
      customfield_10009: past,
    },
  };

  const jiraWithEpic = (epic) => async ({ pathWithQuery, method, body }) => {
    if (String(pathWithQuery || "").includes("approximate-count")) {
      return { ok: true, data: { count: 1 } };
    }
    if (method === "POST" && String(body?.jql || "").includes("key in")) {
      return { ok: true, data: { issues: [epic] } };
    }
    return { ok: false, data: {} };
  };

  it("task_due ignores IDD/MRD and parent Epic dates", async () => {
    const items = await fetchCapacityWorkloads({
      watchedRows: [
        { id: 1, displayName: "Team", watchType: "jql", jql: "project = ODI", overdueDateBasis: "task_due" },
      ],
      runJiraSearchRequest: async () =>
        searchOk([
          {
            key: "ODI-4",
            fields: {
              status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
              assignee: { displayName: "Busy Person", accountId: BUSY_ID },
              duedate: null,
              customfield_10009: past,
              updated: new Date().toISOString(),
            },
          },
        ]),
      jiraRequest: async () => ({ ok: true, data: { count: 1 } }),
    });

    assert.equal(items[0].overdueCount, 0);
    assert.match(items[0].overdueClause, /duedate/);
    assert.equal(items[0].overdueClause.includes("cf[10009]"), false);
  });

  it("epic_done uses the parent Epic even when the child has a stale duedate", async () => {
    const items = await fetchCapacityWorkloads({
      watchedRows: [
        { id: 1, displayName: "ODI", watchType: "jql", jql: "parent = ODI-1", overdueDateBasis: "epic_done" },
      ],
      runJiraSearchRequest: async () => searchOk([childWithStaleDue]),
      jiraRequest: jiraWithEpic(epicIssue),
    });

    assert.equal(items[0].overdueCount, 0);
  });

  it("either uses the child's due date when present", async () => {
    const items = await fetchCapacityWorkloads({
      watchedRows: [
        { id: 1, displayName: "Mixed", watchType: "jql", jql: "parent = ODI-1", overdueDateBasis: "either" },
      ],
      runJiraSearchRequest: async () => searchOk([childWithStaleDue]),
      jiraRequest: jiraWithEpic(epicIssue),
    });

    assert.equal(items[0].overdueCount, 1);
  });

  it("either inherits the parent Epic when the child has no dates", async () => {
    const items = await fetchCapacityWorkloads({
      watchedRows: [
        { id: 1, displayName: "Mixed", watchType: "jql", jql: "parent = ODI-1", overdueDateBasis: "either" },
      ],
      runJiraSearchRequest: async () => searchOk([childWithNoDates]),
      jiraRequest: jiraWithEpic(pastEpic),
    });

    assert.equal(items[0].overdueCount, 1);
    assert.match(items[0].overdueClause, /key in \(ODI-3\)/);
  });

  it("defaults an unknown basis to either", async () => {
    const items = await fetchCapacityWorkloads({
      watchedRows: [
        { id: 1, displayName: "Team", watchType: "jql", jql: "project = ODI", overdueDateBasis: "nope" },
      ],
      runJiraSearchRequest: async () =>
        searchOk([
          {
            key: "ODI-5",
            fields: {
              status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
              assignee: { displayName: "Busy Person", accountId: BUSY_ID },
              duedate: null,
              customfield_10009: past,
              updated: new Date().toISOString(),
            },
          },
        ]),
      jiraRequest: async () => ({ ok: true, data: { count: 1 } }),
    });

    assert.equal(items[0].overdueDateBasis, "either");
    assert.equal(items[0].overdueCount, 1);
  });
});

describe("fetchCapacityWorkloads blocked / on hold", () => {
  const watchedRows = [
    { id: 1, displayName: "Team", watchType: "jql", jql: "project = ODI", capacity: null },
  ];

  const issue = (key, statusName) => ({
    key,
    fields: {
      status: { name: statusName, statusCategory: { key: "indeterminate" } },
      assignee: { displayName: "Busy Person", accountId: BUSY_ID },
      duedate: null,
      updated: new Date().toISOString(),
    },
  });

  it("counts On Hold and blocked-like statuses and drills down by those keys", async () => {
    const items = await fetchCapacityWorkloads({
      watchedRows,
      runJiraSearchRequest: async () =>
        searchOk([
          issue("ODI-10", "On Hold"),
          issue("ODI-11", "Blocked - vendor"),
          issue("ODI-12", "In Progress"),
        ]),
      jiraRequest: async () => ({ ok: true, data: { count: 3 } }),
    });

    assert.equal(items[0].blockedCount, 2);
    assert.match(items[0].blockedClause, /key in \(ODI-10,ODI-11\)/);
    assert.equal(items[0].blockedIssueKeys, undefined);
  });
});
