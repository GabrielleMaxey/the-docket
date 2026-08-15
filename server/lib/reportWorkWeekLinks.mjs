import {
  computePastDueFloorDate,
  formatOverdueWindowPhrase,
  formatUpcomingWindowPhrase,
} from "../../shared/dashboardMetrics.mjs";
import {
  applyJqlScope,
  buildPastDueJql,
  buildStatusCategoryJql,
  buildUpcomingDueJql,
} from "./epicFilterJql.mjs";

const workWeekMarkdownHref = ({ jql, label }) => {
  const params = new URLSearchParams();
  params.set("jql", jql);
  if (label) {
    params.set("label", label);
  }
  return `/#/work-week?${params.toString()}`;
};

const sumNamedStatus = (statusCounts, name) => {
  const target = String(name || "").trim().toLowerCase();
  let total = 0;
  for (const [status, count] of Object.entries(statusCounts || {})) {
    if (String(status || "").trim().toLowerCase() === target) {
      total += Number(count) || 0;
    }
  }
  return total;
};

const statusBucketSource = (epic) => {
  const openCounts = epic?.openStatusCounts;
  if (openCounts && typeof openCounts === "object" && Object.keys(openCounts).length > 0) {
    return openCounts;
  }
  return epic?.statusCounts && typeof epic.statusCounts === "object" ? epic.statusCounts : {};
};

export const countReportWorkWeekBuckets = (epicMetrics) => {
  let overdue = 0;
  let upcoming = 0;
  let inProgress = 0;
  let backlog = 0;

  for (const epic of epicMetrics || []) {
    overdue += Number(epic.overdueOpenIssues || 0);
    upcoming += Number(epic.dueByOpenIssues || 0);
    const counts = statusBucketSource(epic);
    inProgress += sumNamedStatus(counts, "in progress");
    backlog += sumNamedStatus(counts, "backlog");
  }

  return { overdue, upcoming, inProgress, backlog };
};

export const buildReportDueWindowsAndLinks = ({
  snapshot,
  mappingsByRole,
  epicPastDueMode = "either",
  presetUnionScope = "",
  epicMetrics = [],
}) => {
  const includePastDue = Boolean(snapshot?.includePastDue);
  const overduePhrase = formatOverdueWindowPhrase(
    snapshot?.pastDueLookbackYears,
    includePastDue
  );
  const upcomingPhrase = formatUpcomingWindowPhrase(snapshot?.dueByDate);

  const windowLines = [
    "## Date windows",
    `- Overdue / past due: ${overduePhrase}`,
    upcomingPhrase
      ? `- Upcoming due dates: ${upcomingPhrase}`
      : "- Upcoming due dates: no cutoff selected on this snapshot",
  ];

  const overdueJql = applyJqlScope(
    buildPastDueJql({
      mappingsByRole,
      epicPastDueMode,
      epicKeys: [],
      pastDueFloorDate: includePastDue
        ? computePastDueFloorDate(snapshot?.pastDueLookbackYears)
        : null,
    }),
    presetUnionScope
  );
  const upcomingJql = applyJqlScope(
    buildUpcomingDueJql({
      mappingsByRole,
      dueByField: snapshot?.dueByField || "due_date",
      dueByDate: snapshot?.dueByDate,
      epicKeys: [],
    }),
    presetUnionScope
  );
  const inProgressJql = applyJqlScope(
    buildStatusCategoryJql({ category: "In Progress", epicKeys: [] }),
    presetUnionScope
  );
  const backlogJql = applyJqlScope(
    buildStatusCategoryJql({ category: "To Do", epicKeys: [] }),
    presetUnionScope
  );

  const buckets = countReportWorkWeekBuckets(epicMetrics);

  const links = [
    overdueJql && buckets.overdue > 0
      ? {
          text: `Overdue / past due (${overduePhrase})`,
          href: workWeekMarkdownHref({ jql: overdueJql, label: "Overdue" }),
        }
      : null,
    upcomingJql && upcomingPhrase && buckets.upcoming > 0
      ? {
          text: `Upcoming due (${upcomingPhrase})`,
          href: workWeekMarkdownHref({ jql: upcomingJql, label: "Upcoming" }),
        }
      : null,
    inProgressJql && buckets.inProgress > 0
      ? {
          text: "In progress",
          href: workWeekMarkdownHref({ jql: inProgressJql, label: "In progress" }),
        }
      : null,
    backlogJql && buckets.backlog > 0
      ? {
          text: "Backlog",
          href: workWeekMarkdownHref({ jql: backlogJql, label: "Backlog" }),
        }
      : null,
  ].filter(Boolean);

  const appendedSection = links.length
    ? ["## Open these tasks in Work Week", ...links.map((item) => `- [${item.text}](${item.href})`)].join("\n")
    : "";

  return {
    overduePhrase,
    upcomingPhrase,
    windowContext: windowLines.join("\n"),
    appendedSection,
  };
};
