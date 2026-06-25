import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatChatSessionContext } from "../shared/chatSessionPrompt.mjs";

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
