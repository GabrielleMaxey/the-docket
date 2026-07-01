import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeAssigneeMetrics,
  computeChildIssueMetrics,
  computeEpicPastDue,
  computeEpicPercent,
  computeOverallRollup,
  computePastDueFloorDate,
  formatDateOnly,
  getIssueDueByDate,
  getTerminalIssueCount,
  isClosedLikeStatus,
  isDueDateInDueByWindow,
  isIssueClosed,
  isIssueInDueByWindow,
  isIssueOpen,
  isIssueUpcomingDueBy,
  normalizePastDueLookbackYears,
  isTaskDueBy,
  isTaskDueInFuture,
  isTaskDueOrOverdue,
  isTaskOverdue,
  parseJiraDate,
  personMatchesIssue,
} from "../shared/dashboardMetrics.mjs";

const makeIssue = ({
  key = "ODI-1",
  status = "In Progress",
  statusCategory = "indeterminate",
  dueValue = null,
  dueFieldId = "duedate",
  assignee = "Jane Doe",
  summary = "Test issue",
} = {}) => {
  const fields = {
    summary,
    status: { name: status, statusCategory: { key: statusCategory } },
    issuetype: { name: "Task" },
    assignee: assignee ? { displayName: assignee, accountId: "acc-1" } : null,
  };

  if (dueValue != null) {
    fields[dueFieldId] = dueValue;
  }

  return { key, self: `https://jira.example/${key}`, fields };
};

describe("status helpers", () => {
  it("recognizes closed-like status names", () => {
    assert.equal(isClosedLikeStatus("Done"), true);
    assert.equal(isClosedLikeStatus("RESOLVED"), true);
    assert.equal(isClosedLikeStatus("In Progress"), false);
  });

  it("treats done category as closed even when name differs", () => {
    const issue = makeIssue({ status: "Shipped", statusCategory: "done" });
    assert.equal(isIssueClosed(issue), true);
    assert.equal(isIssueOpen(issue), false);
  });
});

describe("date helpers", () => {
  it("parses and formats ISO dates", () => {
    const parsed = parseJiraDate("2024-06-15");
    assert.ok(parsed instanceof Date);
    assert.equal(formatDateOnly("2024-06-15T10:00:00.000Z"), "2024-06-15");
    assert.equal(parseJiraDate(""), null);
  });
});

describe("due date checks", () => {
  it("flags open issues with past due dates as overdue", () => {
    const overdue = makeIssue({ dueValue: "2020-01-01" });
    assert.equal(isTaskOverdue(overdue, "duedate"), true);
  });

  it("does not flag closed issues as overdue", () => {
    const closed = makeIssue({ status: "Done", statusCategory: "done", dueValue: "2020-01-01" });
    assert.equal(isTaskOverdue(closed, "duedate"), false);
  });

  it("isTaskDueInFuture excludes past-due and includes future due dates", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const upcoming = makeIssue({ dueValue: tomorrowStr });
    const past = makeIssue({ key: "ODI-2", dueValue: "2020-01-01" });

    assert.equal(isTaskDueInFuture(upcoming, "duedate"), true);
    assert.equal(isTaskDueInFuture(past, "duedate"), false);
  });

  it("isTaskDueBy excludes past-due but includes upcoming within cutoff", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const upcoming = makeIssue({ dueValue: tomorrowStr });
    const past = makeIssue({ key: "ODI-2", dueValue: "2020-01-01" });

    assert.equal(isTaskDueBy(upcoming, "duedate", "2099-12-31"), true);
    assert.equal(isTaskDueBy(past, "duedate", "2099-12-31"), false);
    assert.equal(isTaskDueOrOverdue(past, "duedate", "2099-12-31"), true);
  });

  it("normalizePastDueLookbackYears accepts 1, 2, or 3 only", () => {
    assert.equal(normalizePastDueLookbackYears(1), 1);
    assert.equal(normalizePastDueLookbackYears(2), 2);
    assert.equal(normalizePastDueLookbackYears(3), 3);
    assert.equal(normalizePastDueLookbackYears(5), 1);
    assert.equal(normalizePastDueLookbackYears(null), 1);
  });

  it("isDueDateInDueByWindow includes upcoming and recent past due only", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const floor = computePastDueFloorDate(1);

    const upcoming = parseJiraDate(tomorrowStr);
    const recentPast = new Date(floor.getTime());
    recentPast.setDate(recentPast.getDate() + 1);
    const ancientPast = new Date(floor.getTime());
    ancientPast.setDate(ancientPast.getDate() - 1);

    assert.equal(isDueDateInDueByWindow(upcoming, "2099-12-31", floor), true);
    assert.equal(isDueDateInDueByWindow(recentPast, "2099-12-31", floor), true);
    assert.equal(isDueDateInDueByWindow(ancientPast, "2099-12-31", floor), false);
  });

  it("isIssueInDueByWindow falls back to task due date when compare field is empty", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 3);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const issue = makeIssue({
      key: "ODI-9",
      dueValue: tomorrowStr,
      dueFieldId: "duedate",
    });

    assert.equal(
      isIssueInDueByWindow(
        issue,
        "customfield_10009",
        "duedate",
        "2099-12-31",
        computePastDueFloorDate(1)
      ),
      true
    );
    assert.equal(
      isIssueUpcomingDueBy(issue, "customfield_10009", "duedate", "2099-12-31"),
      true
    );
  });

  it("prefers task due date over stale most recent done date on child issues", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 5);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const issue = makeIssue({
      key: "ODI-10",
      dueValue: tomorrowStr,
      dueFieldId: "duedate",
    });
    issue.fields.customfield_10009 = "2020-01-01";

    const { dueDate, dueValue } = getIssueDueByDate(
      issue,
      "customfield_10009",
      "duedate"
    );
    assert.equal(dueValue, tomorrowStr);
    assert.equal(isIssueUpcomingDueBy(issue, "customfield_10009", "duedate", "2099-12-31"), true);
  });

  it("inherits epic most recent done date when task has no due date", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 7);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const issue = makeIssue({ key: "ODI-11", dueValue: null });
    issue.fields.customfield_10009 = "2020-01-01";
    const epicIssue = {
      key: "ODI-EPIC",
      fields: { customfield_10009: tomorrowStr },
    };

    const { dueValue } = getIssueDueByDate(
      issue,
      "customfield_10009",
      "duedate",
      epicIssue
    );
    assert.equal(dueValue, tomorrowStr);
    assert.equal(
      isIssueUpcomingDueBy(
        issue,
        "customfield_10009",
        "duedate",
        "2099-12-31",
        epicIssue
      ),
      true
    );
  });
});

describe("computeChildIssueMetrics", () => {
  it("aggregates open, closed, and overdue counts", () => {
    const issues = [
      makeIssue({ key: "ODI-1", status: "Done", statusCategory: "done" }),
      makeIssue({ key: "ODI-2", dueValue: "2020-01-01" }),
      makeIssue({ key: "ODI-3", status: "Backlog" }),
    ];

    const metrics = computeChildIssueMetrics(issues, "ODI-EPIC", "duedate", null);

    assert.equal(metrics.totalIssues, 3);
    assert.equal(metrics.completedIssues, 1);
    assert.equal(metrics.openIssues, 2);
    assert.equal(metrics.overdueOpenIssues, 1);
    assert.equal(metrics.issuePercent, (1 / 3) * 100);
  });
});

describe("computeEpicPastDue", () => {
  const mappingsByRole = new Map([
    ["initial_done_date", { fieldId: "customfield_10008", fieldName: "IDD" }],
    ["most_recent_done_date", { fieldId: "customfield_10009", fieldName: "MRD" }],
    ["project_end_date", { fieldId: "customfield_ped", fieldName: "PED" }],
  ]);

  it("uses most_recent_done_date mode only", () => {
    const recentPast = new Date();
    recentPast.setMonth(recentPast.getMonth() - 6);
    const recentPastStr = recentPast.toISOString().slice(0, 10);

    const epicIssue = {
      fields: {
        status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
        customfield_10009: recentPastStr,
        customfield_ped: "2099-12-31",
      },
    };

    const result = computeEpicPastDue({
      epicIssue,
      mappingsByRole,
      epicPastDueMode: "most_recent_done_date",
      trackPastDue: true,
      pastDueFloor: computePastDueFloorDate(1),
    });

    assert.equal(result.isPastDue, true);
    assert.equal(result.pastDueReason, "mrd");
  });

  it("either mode includes initial done date", () => {
    const recentPast = new Date();
    recentPast.setMonth(recentPast.getMonth() - 6);
    const recentPastStr = recentPast.toISOString().slice(0, 10);

    const epicIssue = {
      fields: {
        status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
        customfield_10008: recentPastStr,
        customfield_10009: "2099-12-31",
        customfield_ped: "2099-12-31",
      },
    };

    const result = computeEpicPastDue({
      epicIssue,
      mappingsByRole,
      epicPastDueMode: "either",
      trackPastDue: true,
      pastDueFloor: computePastDueFloorDate(1),
    });

    assert.equal(result.isPastDue, true);
    assert.equal(result.pastDueReason, "idd");
  });

  it("does not flag past due when trackPastDue is false", () => {
    const epicIssue = {
      fields: {
        status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
        customfield_10009: "2020-01-01",
      },
    };

    const result = computeEpicPastDue({
      epicIssue,
      mappingsByRole,
      epicPastDueMode: "most_recent_done_date",
      trackPastDue: false,
    });

    assert.equal(result.isPastDue, false);
  });
});

describe("computeEpicPercent", () => {
  it("returns 100 when initial or most recent done date is set", () => {
    const mappingsByRole = new Map([
      ["initial_done_date", { fieldId: "customfield_10008" }],
      ["most_recent_done_date", { fieldId: "customfield_10009" }],
    ]);

    assert.equal(
      computeEpicPercent({ fields: { customfield_10008: "2024-01-01" } }, mappingsByRole),
      100
    );
    assert.equal(computeEpicPercent({ fields: {} }, mappingsByRole), 0);
  });
});

describe("computeOverallRollup", () => {
  it("rolls up percentages and status counts", () => {
    const rollup = computeOverallRollup([
      {
        completedIssues: 2,
        totalIssues: 4,
        openIssues: 2,
        overdueOpenIssues: 1,
        epicPercent: 100,
        statusCounts: { Done: 2, "In Progress": 2 },
      },
      {
        completedIssues: 0,
        totalIssues: 2,
        openIssues: 2,
        overdueOpenIssues: 0,
        epicPercent: 0,
        statusCounts: { Backlog: 2 },
      },
    ]);

    assert.equal(rollup.overallIssuePercent, (2 / 6) * 100);
    assert.equal(rollup.overallEpicPercent, 50);
    assert.equal(rollup.overallOverduePercent, 25);
    assert.deepEqual(rollup.statusCounts, { Done: 2, "In Progress": 2, Backlog: 2 });
  });
});

describe("personMatchesIssue", () => {
  it("matches display name and resolved canonical name", () => {
    const issue = makeIssue({ assignee: "Jane Doe" });
    assert.equal(personMatchesIssue(issue, "jane", "Jane Doe"), true);
    assert.equal(personMatchesIssue(issue, "alice", "Bob Wilson"), false);
  });

  it("matches email-style queries against display names", () => {
    const issue = makeIssue({ assignee: "Gabrielle Maxey" });
    assert.equal(personMatchesIssue(issue, "gabrielle.maxey", "Gabrielle Maxey"), true);
  });

  it("matches by account id when available", () => {
    const issue = makeIssue({ assignee: "Gabrielle Maxey" });
    issue.fields.assignee.accountId = "abc123";
    assert.equal(personMatchesIssue(issue, "gabrielle.maxey", "", "abc123"), true);
  });
});

describe("computeAssigneeMetrics", () => {
  it("computes overdue percent for matched open issues", () => {
    const issues = [
      makeIssue({ key: "ODI-1", assignee: "Jane Doe", dueValue: "2020-01-01" }),
      makeIssue({ key: "ODI-2", assignee: "Jane Doe" }),
    ];

    const metrics = computeAssigneeMetrics(issues, "Jane", "Jane Doe", "duedate");

    assert.equal(metrics.totalOpenCount, 2);
    assert.equal(metrics.overdueOpenCount, 1);
    assert.equal(metrics.overduePercent, 50);
    assert.deepEqual(metrics.overdueIssueKeys, ["ODI-1"]);
  });
});

describe("getTerminalIssueCount", () => {
  it("uses the highest resolved count from available signals", () => {
    assert.equal(
      getTerminalIssueCount({
        resolvedIssues: 3,
        totalIssues: 10,
        openIssues: 5,
        statusCounts: { Done: 5, Open: 5 },
        openStatusCounts: { Open: 5 },
      }),
      5
    );
  });
});
