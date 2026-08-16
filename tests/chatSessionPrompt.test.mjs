import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatChatSessionContext, formatEpicEvaluationContext } from "../shared/chatSessionPrompt.mjs";

describe("formatChatSessionContext", () => {
  it("returns empty string for missing context", () => {
    assert.equal(formatChatSessionContext(null), "");
    assert.equal(formatChatSessionContext({}), "");
  });

  it("formats JQL queries, dashboard snapshot, and artifacts", () => {
    const text = formatChatSessionContext({
      jqlQueries: [
        {
          label: "My Work",
          jql: "assignee = currentUser()",
          total: 5,
          open: 3,
          pastDue: 1,
          upcomingDue: 2,
          topIssues: [
            {
              key: "ODI-1",
              summary: "Fix bug",
              status: "In Progress",
              assignee: "Jane",
              dueDate: "2020-01-01",
              isPastDue: true,
              isUpcomingDue: false,
            },
            {
              key: "ODI-2",
              summary: "Ship feature",
              status: "In Progress",
              assignee: "Jane",
              dueDate: "2099-06-01",
              isPastDue: false,
              isUpcomingDue: true,
            },
          ],
        },
      ],
      dashboardSnapshot: {
        refreshedAt: "2026-06-19T12:00:00.000Z",
        overallIssuePercent: 50,
        overallEpicPercent: 25,
        overallOverduePercent: 10,
        dueByDate: "2099-12-31",
        dueByPastDueCount: 2,
        dueByUpcomingCount: 5,
        epics: [
          {
            label: "ODI Epic",
            epicKey: "ODI-100",
            issuePercent: 60,
            overduePercent: 5,
            openIssues: 4,
            isPastDueEpic: true,
            upcomingDueByCount: 3,
          },
        ],
        assigneeCount: 2,
      },
      artifacts: [
        {
          type: "week_plan",
          label: "Week plan",
          generatedAt: "2026-06-19T13:00:00.000Z",
          content: "Monday: ODI-1",
        },
      ],
    });

    assert.match(text, /Work Week JQL queries/);
    assert.match(text, /My Work/);
    assert.match(text, /1 past due, 2 upcoming due/);
    assert.match(text, /PAST DUE — was 2020-01-01/);
    assert.match(text, /UPCOMING DUE 2099-06-01/);
    assert.match(text, /Dashboard metrics snapshot/);
    assert.match(text, /2 past due, 5 upcoming due/);
    assert.match(text, /EPIC PAST DUE/);
    assert.match(text, /3 upcoming due by 2099-12-31/);
    assert.match(text, /week_plan/);
    assert.match(text, /Monday: ODI-1/);
  });
});

describe("formatEpicEvaluationContext", () => {
  it("returns empty string when no epic is loaded", () => {
    assert.equal(formatEpicEvaluationContext(null), "");
    assert.equal(formatEpicEvaluationContext({}), "");
    assert.equal(formatEpicEvaluationContext({ epic: {} }), "");
  });

  it("formats epic timeline, workload, contributors, and blockers", () => {
    const text = formatEpicEvaluationContext({
      epic: {
        key: "SYNC-41",
        summary: "Burndown Report and Utilization Report",
        status: "To Do",
        projectEndDate: "2026-09-30",
        mostRecentDoneDate: null,
        initialDoneDate: null,
      },
      workload: {
        total: 5,
        open: 1,
        closed: 4,
        overdue: 0,
        statusCounts: { Done: 4, "In Progress": 1 },
      },
      contributors: [
        { name: "Nukala Ramyasri", totalIssues: 5, openIssues: 1, resolvedIssues: 4, inProgress: 1 },
      ],
      blockers: [
        {
          key: "SYNC-50",
          status: "In Progress",
          assignee: "Nukala Ramyasri",
          crossTeamLinks: [
            { linkType: "blocks", linkedKey: "NET-500", linkedProject: "NET", linkedStatus: "Open" },
          ],
        },
      ],
    });

    assert.match(text, /SYNC-41/);
    assert.match(text, /Project End Date 2026-09-30/);
    assert.match(text, /5 total tasks, 1 open, 4 closed, 0 overdue/);
    assert.match(text, /Done: 4/);
    assert.match(text, /Nukala Ramyasri: 5 total/);
    assert.match(text, /SYNC-50.*blocks NET-500 \(NET, Open\)/);
  });

  it("states plainly when no blockers or timeline fields are present", () => {
    const text = formatEpicEvaluationContext({
      epic: { key: "SYNC-41", summary: "X", status: "To Do" },
      workload: { total: 0, open: 0, closed: 0, overdue: 0, statusCounts: {} },
      contributors: [],
      blockers: [],
    });

    assert.match(text, /no PED\/MRD\/IDD set on this epic/);
    assert.match(text, /No cross-team blocker candidates detected/);
  });
});
