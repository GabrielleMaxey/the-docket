// Gantt "plan health": is the plan on track? Pure and dependency-light so the server and the
// client can both import it. Dates are calendar days (YYYY-MM-DD); nothing here depends on a time zone.
import { daysBetween, median, monthKeys, monthLabel } from "./flowMetrics.mjs";

export const GANTT_REPORT_TYPE = "gantt_report";
const KIND = "gantt_plan_health";
const MAX_ROWS = 50;

const validDay = (value) => {
  const s = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d ? s : null;
};

const medianFloat = (nums) => {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

const isDoneIssue = (issue) => String(issue?.statusCategory || "").toLowerCase() === "done";
const isDoneItem = (item) => Boolean(validDay(item?.completeDate)) || /^(done|closed|resolved)/i.test(String(item?.status || ""));

const bucketRows = (labels, values, test) =>
  labels.map((label, i) => ({ label, count: values.filter((v) => test(v, i)).length }));

/**
 * @param {Array} issues Gantt issues: { key, summary, status, statusCategory, assignee, startDate, dueDate,
 *   completeDate, plannedStart, plannedFinish }
 * @param {object} options { today, displayName, scopeLabel, baseUrl }
 */
export const computeGanttPlanHealth = (issues, options = {}) => {
  const list = Array.isArray(issues) ? issues : [];
  const today = validDay(options.today instanceof Date ? options.today.toISOString() : options.today) || new Date().toISOString().slice(0, 10);

  const rows = list.map((issue) => {
    const dueDate = validDay(issue.dueDate);
    const plannedFinish = validDay(issue.plannedFinish);
    const plannedStart = validDay(issue.plannedStart);
    const startDate = validDay(issue.startDate);
    const completeDate = validDay(issue.completeDate);
    return {
      issue, done: isDoneIssue(issue), dueDate, plannedFinish, plannedStart, startDate, completeDate,
      planFinish: plannedFinish || dueDate,
      dueNow: dueDate || plannedFinish,
    };
  });

  const total = rows.length;
  const doneRows = rows.filter((r) => r.done);
  const openRows = rows.filter((r) => !r.done);

  // ── completion slip (done work against the planned finish)
  const measured = doneRows.filter((r) => r.completeDate && r.planFinish).map((r) => ({ r, slip: daysBetween(r.planFinish, r.completeDate) }));
  const slips = measured.map((m) => m.slip);
  const onTime = slips.filter((s) => s <= 0).length;
  const slipLabels = ["Early", "On time", "1–7 d late", "8–30 d late", "31+ d late"];
  const slipBuckets = bucketRows(slipLabels, slips, (s, i) => [s < 0, s === 0, s >= 1 && s <= 7, s >= 8 && s <= 30, s > 30][i]);
  const doneUnmeasured = doneRows.length - measured.length;

  // ── overdue open work (past the current due date)
  const overdue = openRows
    .filter((r) => r.dueNow && r.dueNow < today)
    .map((r) => ({
      r,
      days: daysBetween(r.dueNow, today),
      pushed: r.dueDate && r.plannedFinish && r.dueDate !== r.plannedFinish ? daysBetween(r.plannedFinish, r.dueDate) : null,
    }))
    .sort((a, b) => b.days - a.days || a.r.issue.key.localeCompare(b.r.issue.key));
  const overdueLabels = ["1–7 d", "8–30 d", "31–90 d", "90+ d"];
  const overdueBuckets = bucketRows(overdueLabels, overdue.map((o) => o.days), (d, i) => [d <= 7, d >= 8 && d <= 30, d >= 31 && d <= 90, d > 90][i]);

  // ── due dates that moved past the planned finish
  const moved = rows.filter((r) => r.dueDate && r.plannedFinish && r.dueDate !== r.plannedFinish).map((r) => daysBetween(r.plannedFinish, r.dueDate));
  const pushedLater = moved.filter((d) => d > 0);

  // ── starts
  const lateStarted = rows.filter((r) => r.startDate && r.plannedStart && r.startDate > r.plannedStart);
  const notStarted = openRows.filter((r) => !r.startDate && r.plannedStart && r.plannedStart < today && String(r.issue.statusCategory || "").toLowerCase() !== "indeterminate");

  // ── planned versus actual duration (finished work that has all four dates)
  const durations = doneRows
    .filter((r) => r.plannedStart && r.plannedFinish && r.startDate && r.completeDate)
    .map((r) => ({ planned: daysBetween(r.plannedStart, r.plannedFinish), actual: daysBetween(r.startDate, r.completeDate) }));
  const ratios = durations.filter((d) => d.planned > 0).map((d) => d.actual / d.planned);
  const ratioMedian = medianFloat(ratios);

  // ── schedule gaps
  const noSchedule = openRows.filter((r) => !r.dueDate && !r.plannedFinish);

  // ── planned finishes versus completions, nine months back to two ahead
  const [ty, tm] = today.split("-").map(Number);
  const first = new Date(Date.UTC(ty, tm - 1 - 9, 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(ty, tm - 1 + 2, 1)).toISOString().slice(0, 10);
  const keys = monthKeys(first, last);
  const planned = keys.map(() => 0);
  const completed = keys.map(() => 0);
  for (const r of rows) {
    if (r.planFinish) { const i = keys.indexOf(r.planFinish.slice(0, 7)); if (i >= 0) planned[i] += 1; }
    if (r.done && r.completeDate) { const i = keys.indexOf(r.completeDate.slice(0, 7)); if (i >= 0) completed[i] += 1; }
  }

  const overdueMedian = median(overdue.map((o) => o.days));
  const pushedMedian = median(pushedLater);
  const kpis = [
    { label: "Issues", value: total, sub: `as of ${today}` },
    { label: "Done", value: `${pct(doneRows.length, total)}%`, sub: `${doneRows.length} of ${total} issues` },
    { label: "On-time completions", value: measured.length ? `${pct(onTime, measured.length)}%` : "n/a", sub: measured.length ? `${onTime} of ${measured.length} measured on time or early` : "no finished work with a plan date" },
    { label: "Overdue open", value: overdue.length, sub: overdue.length ? `of ${openRows.length} open · median ${overdueMedian} d overdue` : `of ${openRows.length} open`, tone: overdue.length ? "red" : undefined },
    { label: "Re-planned", value: pushedLater.length, sub: pushedLater.length ? `due later than planned finish · median +${pushedMedian} d` : "no due dates pushed later", tone: pushedLater.length ? "amber" : undefined },
    { label: "Late starts", value: lateStarted.length + notStarted.length, sub: `${lateStarted.length} started late · ${notStarted.length} not started`, tone: lateStarted.length + notStarted.length ? "amber" : undefined },
    { label: "Actual vs planned", value: ratioMedian === null ? "n/a" : `${(Math.round(ratioMedian * 10) / 10).toFixed(1)}×`, sub: durations.length ? `median across ${durations.length} finished ${durations.length === 1 ? "issue" : "issues"}` : "needs planned and actual dates" },
    { label: "No schedule", value: noSchedule.length, sub: "open, no due date or planned finish", tone: noSchedule.length ? "amber" : undefined },
  ];

  const takeaways = [];
  if (measured.length) {
    const late = measured.length - onTime;
    takeaways.push({ lead: "On-time delivery", text: `${pct(onTime, measured.length)}% of ${measured.length} measured completions finished on or before the planned finish${late ? `; ${late} finished late` : ""}. Median slip is ${signed(median(slips))} d.` });
  }
  if (overdue.length) {
    takeaways.push({ lead: "Overdue work", text: `${plural(overdue.length, "open issue")} ${overdue.length === 1 ? "is" : "are"} past due, the oldest by ${overdue[0].days} days. Start with:`, keys: overdue.slice(0, 3).map((o) => o.r.issue.key) });
  }
  if (pushedLater.length) {
    takeaways.push({ lead: "Plan changes", text: `${plural(pushedLater.length, "due date")} ${pushedLater.length === 1 ? "has" : "have"} been pushed later than the planned finish (median +${pushedMedian} d), so the plan no longer matches the commitment.` });
  }
  if (noSchedule.length || notStarted.length) {
    const parts = [];
    if (noSchedule.length) parts.push(`${plural(noSchedule.length, "open issue")} ${noSchedule.length === 1 ? "has" : "have"} no due date or planned finish`);
    if (notStarted.length) parts.push(`${plural(notStarted.length, "issue")} ${notStarted.length === 1 ? "is" : "are"} past the planned start but not started`);
    takeaways.push({ lead: "Schedule gaps", text: `${parts.join(" and ")}, so ${noSchedule.length ? "their" : "the"} schedule risk cannot be judged.` });
  }

  const attention = overdue.slice(0, MAX_ROWS).map((o) => ({
    key: o.r.issue.key, summary: String(o.r.issue.summary || "").slice(0, 120), status: String(o.r.issue.status || ""), assignee: String(o.r.issue.assignee || ""),
    dueDate: o.r.dueNow || "", plannedFinish: o.r.plannedFinish || "", overdueDays: o.days, pushedDays: o.pushed,
  }));

  return {
    kind: KIND,
    baseUrl: options.baseUrl || "",
    title: `Plan health: ${options.displayName || "Plan"}`,
    subtitle: `Schedule health of ${plural(total, "issue")} as of ${today}${options.scopeLabel ? `, ${options.scopeLabel}` : ""}`,
    chips: [...(options.scopeLabel ? [options.scopeLabel] : []), `As of ${today}`],
    kpis,
    flowNote: "Planned finishes (the planned finish, or the due date when none) compared with completions by month.",
    months: keys.map((k, i) => monthLabel(k, i === 0)),
    planned,
    completed,
    slipBuckets,
    overdueBuckets,
    attention,
    noSchedule: noSchedule.slice(0, MAX_ROWS).map((r) => ({ key: r.issue.key, summary: String(r.issue.summary || "").slice(0, 120), status: String(r.issue.status || ""), assignee: String(r.issue.assignee || "") })),
    takeaways,
    footnote: "Planned finish is the planned finish date, or the due date when none is set. Completion slip is the completion date minus that date. Overdue means open work past its due date (or planned finish when there is no due date). Re-planned compares the due date with the planned finish. Late starts compare the start date with the planned start. Dates that are missing or invalid are left out of each measure.",
    items: rows.map((r) => ({ key: r.issue.key, summary: String(r.issue.summary || "").slice(0, 120), status: String(r.issue.status || ""), dueDate: r.dueDate || "", plannedFinish: r.plannedFinish || "", completeDate: r.completeDate || "" })),
    meta: {
      generatedAt: new Date().toISOString(), asOf: today, issueCount: total, doneUnmeasured,
      durationSample: durations.length,
      plannedDaysTotal: durations.reduce((s, d) => s + d.planned, 0),
      actualDaysTotal: durations.reduce((s, d) => s + d.actual, 0),
      scope: options.scopeLabel || "",
    },
  };
};

export const isGanttPlanHealthData = (data) =>
  Boolean(data) && typeof data === "object" && data.kind === KIND && typeof data.title === "string"
  && Array.isArray(data.kpis) && Array.isArray(data.items) && Array.isArray(data.slipBuckets) && Boolean(data.meta) && typeof data.meta === "object";

/** Which issues changed between two saved snapshots (their compact `items`). */
/** Snapshots are only comparable when they cover the same scope (entire plan vs a filtered view). */
export const isComparableSnapshot = (previous, current) =>
  Boolean(previous?.meta && current?.meta) && (previous.meta.scope || "") === (current.meta.scope || "");

export const compareGanttSnapshots = (previous, current) => {
  const empty = { moved: [], finished: [], added: [], removed: [] };
  if (!previous?.items || !current?.items) return empty;
  const before = new Map(previous.items.map((item) => [item.key, item]));
  const after = new Map(current.items.map((item) => [item.key, item]));
  const result = { moved: [], finished: [], added: [], removed: [] };
  for (const item of current.items) {
    const old = before.get(item.key);
    if (!old) { result.added.push(item); continue; }
    const from = validDay(old.dueDate);
    const to = validDay(item.dueDate);
    if (from && to && from !== to) result.moved.push({ key: item.key, summary: item.summary, from, to, days: daysBetween(from, to) });
    if (!isDoneItem(old) && isDoneItem(item)) result.finished.push(item);
  }
  for (const item of previous.items) if (!after.has(item.key)) result.removed.push(item);
  return result;
};

const mdTable = (headers, rows) =>
  [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map((c) => String(c ?? "").replace(/\|/g, "\\|")).join(" | ")} |`)].join("\n");

export const buildGanttPlanHealthMarkdown = (data) => {
  if (!data || typeof data !== "object") return "";
  const link = (key) => (key ? (data.baseUrl ? `[${key}](${data.baseUrl}${key})` : key) : "");
  const lines = [`# ${data.title}`, "", data.subtitle, "", (data.chips || []).join(" · "), ""];
  if (data.narrative) lines.push("## AI summary", "", String(data.narrative), "");
  lines.push("## Summary", "", mdTable(["Metric", "Value", "Detail"], (data.kpis || []).map((k) => [k.label, k.value, k.sub || ""])), "");
  lines.push("## Planned finishes vs completions by month", "", data.flowNote || "", "", mdTable(["Month", "Planned finishes", "Completed"], (data.months || []).map((m, i) => [m, data.planned[i], data.completed[i]])), "");
  lines.push(
    "## Delivery against plan", "",
    mdTable(["Completion vs planned finish", "Issues"], (data.slipBuckets || []).map((b) => [b.label, b.count])), "",
    mdTable(["Open and overdue", "Issues"], (data.overdueBuckets || []).map((b) => [b.label, b.count])), ""
  );
  const rows = data.attention || [];
  lines.push("## Needing attention", "", rows.length
    ? mdTable(["Issue", "Summary", "Status", "Assignee", "Due", "Overdue (d)", "Pushed (d)"], rows.map((r) => [link(r.key), r.summary, r.status, r.assignee, r.dueDate, r.overdueDays, r.pushedDays ?? ""]))
    : "No open issues are past due.", "");
  if ((data.noSchedule || []).length) {
    lines.push("## Schedule gaps", "", mdTable(["Issue", "Summary", "Status", "Assignee"], data.noSchedule.map((r) => [link(r.key), r.summary, r.status, r.assignee])), "");
  }
  if ((data.takeaways || []).length) {
    lines.push("## Key takeaways", "", ...data.takeaways.map((t) => `- **${t.lead}:** ${t.text}${t.keys?.length ? ` ${t.keys.map(link).join(", ")}` : ""}`), "");
  }
  if (data.footnote) lines.push(`_${data.footnote}_`, "");
  return lines.join("\n");
};
