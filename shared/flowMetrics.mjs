// Flow report metrics — pure functions, no I/O. Used by the server endpoint (which
// normalizes Jira issues + changelogs) and safe to import from the client.
//
// Dates: Jira timestamps are reduced to their calendar day (first 10 chars, in the
// timezone Jira reported them) so month buckets and day counts never shift with the
// machine's timezone.
import { isClosedLikeStatus } from "./dashboardMetrics.mjs";

const DAY_MS = 86400000;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const FLOW_REPORT_TYPE = "flow_report";

export const dayStr = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const s = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const dayNum = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

export const addDays = (s, n) => new Date((dayNum(s) + n) * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (a, b) => dayNum(b) - dayNum(a);

export const median = (nums) => {
  if (!Array.isArray(nums) || nums.length === 0) return null;
  const sorted = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

export const mean = (nums) => (Array.isArray(nums) && nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null);

const isDone = (issue) =>
  String(issue?.statusCategory || "").toLowerCase() === "done" || isClosedLikeStatus(issue?.status);

const transitionsOf = (issue) => (Array.isArray(issue?.transitions) ? issue.transitions : null);

const resolvedDayOf = (issue) => {
  if (!isDone(issue)) return null;
  const direct = dayStr(issue.resolved);
  if (direct) return direct;
  const transitions = transitionsOf(issue);
  if (transitions) {
    const closing = transitions.filter((t) => isClosedLikeStatus(t?.to)).map((t) => dayStr(t.at)).filter(Boolean).sort();
    if (closing.length) return closing[closing.length - 1];
  }
  return null;
};

const startedDayOf = (issue) => {
  const transitions = transitionsOf(issue);
  if (!transitions) return null;
  const started = transitions.filter((t) => /in progress/i.test(String(t?.to || ""))).map((t) => dayStr(t.at)).filter(Boolean).sort();
  return started.length ? started[0] : null;
};

const statusTone = (name) => {
  const s = String(name || "").toLowerCase();
  if (s.includes("in progress")) return "blue";
  if (s.includes("verif") || s.includes("review")) return "amber";
  if (s.includes("backlog") || s.includes("ready")) return "violet";
  return "muted";
};
const typeTone = (name) => {
  const s = String(name || "").toLowerCase();
  if (s.includes("bug")) return "red";
  if (s.includes("epic") || s.includes("story")) return "violet";
  return "blue";
};
const priorityTone = (name) => {
  const s = String(name || "").toLowerCase();
  if (s === "highest" || s === "high" || s === "critical" || s === "blocker") return "red";
  if (s === "medium") return "amber";
  return "muted";
};

const countBy = (items, keyFn) => {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

const monthKeys = (startDay, endDay) => {
  const keys = [];
  let [y, m] = startDay.slice(0, 7).split("-").map(Number);
  const [ey, em] = endDay.slice(0, 7).split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return keys;
};

const monthLabel = (key, isFirst) => {
  const [y, m] = key.split("-").map(Number);
  const name = MONTH_NAMES[m - 1];
  return isFirst || m === 1 ? `${name} '${String(y).slice(2)}` : name;
};

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const defaultWindowLabel = (startDay, endDay) => {
  const months = Math.round(daysBetween(startDay, endDay) / 30.4375);
  if (months >= 1 && Math.abs(daysBetween(startDay, endDay) - months * 30.4375) < 20) return `Past ${months} months`;
  return `${startDay} to ${endDay}`;
};

/**
 * @param {Array} issues normalized issues:
 *   { key, summary, status, statusCategory, type, priority, parent, parentSummary,
 *     created, updated, resolved, dueDate, transitions: [{at, from, to}] | null }
 * @param {object} options { now, windowStart, windowEnd, stalledDays, baseUrl, siteLabel, personName, windowLabel }
 */
export const computeFlowReport = (issues, options = {}) => {
  const nowDay = dayStr(options.now) || dayStr(new Date());
  const windowEnd = dayStr(options.windowEnd) || nowDay;
  const windowStart = dayStr(options.windowStart) || addDays(windowEnd, -365);
  const stalledDays = Number.isFinite(options.stalledDays) && options.stalledDays > 0 ? options.stalledDays : 30;
  const inWindow = (d) => d !== null && d >= windowStart && d <= windowEnd;

  const enriched = (Array.isArray(issues) ? issues : [])
    .map((issue) => ({
      issue,
      createdDay: dayStr(issue.created),
      resolvedDay: resolvedDayOf(issue),
      done: isDone(issue),
    }))
    .filter((e) => inWindow(e.createdDay) || inWindow(e.resolvedDay));

  const scope = enriched;
  const total = scope.length;
  const doneItems = scope.filter((e) => e.done);
  const openItems = scope.filter((e) => !e.done);

  // ── monthly flow
  const keys = monthKeys(windowStart, windowEnd);
  const created = keys.map(() => 0);
  const resolved = keys.map(() => 0);
  for (const e of scope) {
    if (inWindow(e.createdDay)) {
      const i = keys.indexOf(e.createdDay.slice(0, 7));
      if (i >= 0) created[i] += 1;
    }
    if (e.done && inWindow(e.resolvedDay)) {
      const i = keys.indexOf(e.resolvedDay.slice(0, 7));
      if (i >= 0) resolved[i] += 1;
    }
  }
  const months = keys.map((k, i) => monthLabel(k, i === 0));
  const resolvedInWindow = resolved.reduce((a, b) => a + b, 0);
  const createdInWindow = created.reduce((a, b) => a + b, 0);
  const olderResolved = resolvedInWindow - scope.filter((e) => e.done && inWindow(e.resolvedDay) && inWindow(e.createdDay)).length;

  // ── breakdowns
  const openStatusCounts = countBy(openItems, (e) => e.issue.status || "Unknown").map((s) => ({ ...s, tone: statusTone(s.label) }));
  const status = [...(doneItems.length ? [{ label: "Closed", count: doneItems.length, tone: "green" }] : []), ...openStatusCounts];
  const types = countBy(scope, (e) => e.issue.type || "Unknown").map((t) => ({ ...t, tone: typeTone(t.label) }));
  const priorities = countBy(scope, (e) => e.issue.priority || "None").map((p) => ({ ...p, tone: priorityTone(p.label) }));

  // ── idle / stalled
  const allHaveChangelog = openItems.length > 0 && openItems.every((e) => transitionsOf(e.issue) !== null);
  const idleBasis = allHaveChangelog ? "status-change" : "updated";
  const idleOf = (e) => {
    const created = e.createdDay;
    let last = null;
    if (idleBasis === "status-change") {
      const days = transitionsOf(e.issue).map((t) => dayStr(t.at)).filter(Boolean).sort();
      last = days.length ? days[days.length - 1] : created;
    } else {
      last = dayStr(e.issue.updated) || created;
    }
    return last ? Math.max(0, daysBetween(last, nowDay)) : 0;
  };

  const open = openItems
    .map((e) => ({
      key: e.issue.key,
      summary: e.issue.summary || "",
      status: e.issue.status || "Unknown",
      assignee: e.issue.assignee || "Unassigned",
      parent: e.issue.parent || "",
      age: e.createdDay ? Math.max(0, daysBetween(e.createdDay, nowDay)) : 0,
      idle: idleOf(e),
    }))
    .sort((a, b) => b.idle - a.idle || a.key.localeCompare(b.key));

  const stalled = open.filter((r) => r.idle >= stalledDays);
  const bucket = (rows, field, defs) => defs.map((d) => ({ label: d.label, tone: d.tone, count: rows.filter((r) => d.test(r[field])).length }));
  const aging = bucket(open, "age", [
    { label: "< 30 days", tone: "green", test: (v) => v < 30 },
    { label: "30–90 days", tone: "blue", test: (v) => v >= 30 && v < 90 },
    { label: "90–180 days", tone: "amber", test: (v) => v >= 90 && v < 180 },
    { label: "180+ days", tone: "red", test: (v) => v >= 180 },
  ]);
  const idleBuckets = bucket(open, "idle", [
    { label: "< 30 days", tone: "green", test: (v) => v < 30 },
    { label: "30–90 days", tone: "amber", test: (v) => v >= 30 && v < 90 },
    { label: "90+ days", tone: "red", test: (v) => v >= 90 },
  ]);

  // ── lead time (created and resolved inside the window) and cycle time
  const completed = scope.filter((e) => e.done && inWindow(e.createdDay) && inWindow(e.resolvedDay));
  const leadRows = completed.map((e) => ({ type: e.issue.type || "Unknown", days: Math.max(0, daysBetween(e.createdDay, e.resolvedDay)) }));
  const leadDays = leadRows.map((r) => r.days);
  const leadBuckets = [
    { label: "≤ 7 days", tone: "green", count: leadDays.filter((d) => d <= 7).length },
    { label: "8–30 days", tone: "blue", count: leadDays.filter((d) => d > 7 && d <= 30).length },
    { label: "31–90 days", tone: "amber", count: leadDays.filter((d) => d > 30 && d <= 90).length },
    { label: "90+ days", tone: "red", count: leadDays.filter((d) => d > 90).length },
  ];
  const leadByType = [];
  for (const t of types) {
    const rows = leadRows.filter((r) => r.type === t.label);
    if (rows.length) leadByType.push({ label: `${t.label} (${rows.length})`, days: median(rows.map((r) => r.days)), tone: t.tone, type: t.label, n: rows.length });
  }
  const cycleDays = [];
  for (const e of doneItems) {
    const started = startedDayOf(e.issue);
    if (started && e.resolvedDay && inWindow(e.resolvedDay)) cycleDays.push(Math.max(0, daysBetween(started, e.resolvedDay)));
  }

  // ── throughput
  const monthsSpan = Math.max(1, Math.round(daysBetween(windowStart, windowEnd) / 30.4375));
  const throughput = Math.round((resolvedInWindow / monthsSpan) * 100) / 100;
  const recentCutoff = addDays(nowDay, -90);
  const last90 = scope.filter((e) => e.done && e.resolvedDay && e.resolvedDay >= recentCutoff && e.resolvedDay <= nowDay).length;

  // ── due-date adherence (resolved issues that had a due date)
  const dueRows = doneItems
    .map((e) => ({ due: dayStr(e.issue.dueDate), res: e.resolvedDay }))
    .filter((r) => r.due && r.res && inWindow(r.res));
  const lateRows = dueRows.filter((r) => r.res > r.due).map((r) => daysBetween(r.due, r.res));
  const onTime = dueRows.length - lateRows.length;
  let dueNote = "";
  if (dueRows.length === 0) {
    dueNote = "No resolved issues in this window had a due date set.";
  } else {
    const sortedLate = [...lateRows].sort((a, b) => a - b);
    const lateList = sortedLate.length > 1 ? `${sortedLate.slice(0, -1).join(", ")} and ${sortedLate[sortedLate.length - 1]}` : String(sortedLate[0]);
    const lateText = sortedLate.length
      ? `${sortedLate.length} finished late (by ${lateList} ${sortedLate.length === 1 && sortedLate[0] === 1 ? "day" : "days"})`
      : "none finished late";
    dueNote = `Due dates were set on only ${dueRows.length} resolved ${dueRows.length === 1 ? "issue" : "issues"}: ${onTime} finished on time and ${lateText}.`;
  }

  // ── parents
  const parentMap = new Map();
  for (const e of scope) {
    const key = e.issue.parent;
    if (!key) continue;
    const entry = parentMap.get(key) || { key, name: "", done: 0, total: 0 };
    entry.total += 1;
    if (e.done) entry.done += 1;
    if (!entry.name && e.issue.parentSummary) entry.name = String(e.issue.parentSummary).replace(/^\[[^\]]*\]\s*/, "").slice(0, 40) || String(e.issue.parentSummary).slice(0, 40);
    parentMap.set(key, entry);
  }
  const parents = [...parentMap.values()].filter((p) => p.total >= 2).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key)).slice(0, 6);

  // ── KPIs
  const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const typeSub = types.slice(0, 2).map((t) => `${t.count} ${String(t.label).toLowerCase()}${t.count === 1 ? "" : "s"}`).join(" · ");
  const openSub = openStatusCounts.slice(0, 2).map((s) => `${s.count} ${String(s.label).toLowerCase()}`).join(" · ");
  const medianLead = median(leadDays);
  const meanLead = mean(leadDays);
  const kpis = [
    { label: "Total issues", value: total, sub: typeSub },
    { label: "Resolved", value: `${pct(doneItems.length, total)}%`, sub: `${doneItems.length} closed of ${total}`, tone: "green" },
    { label: "Open", value: openItems.length, sub: openSub },
    { label: `Stalled (${stalledDays}+ days)`, value: stalled.length, sub: `${pct(stalled.length, openItems.length)}% of open work`, tone: stalled.length ? "red" : undefined },
    { label: "Median lead time", value: medianLead === null ? "—" : `${medianLead} d`, sub: meanLead === null ? "No completed issues yet" : `From created to resolved · mean ${meanLead} d` },
    ...(cycleDays.length ? [{ label: "Median cycle time", value: `${median(cycleDays)} d`, sub: `In Progress to resolved · ${plural(cycleDays.length, "issue")}` }] : []),
    { label: "Throughput", value: String(throughput), sub: `resolved per month · ${last90} in last 90 d` },
  ];

  // ── takeaways (deterministic; the model, if used, only rephrases these figures)
  const takeaways = [];
  if (total > 0) {
    const best = keys.map((k, i) => ({ label: MONTH_NAMES[Number(k.slice(5)) - 1], n: resolved[i] })).filter((m) => m.n > 0).sort((a, b) => b.n - a.n).slice(0, 2);
    takeaways.push({
      lead: "Completion",
      text: `${pct(doneItems.length, total)}% of this window's work is closed${best.length ? `, and ${best.map((m) => `${m.label} (${m.n})`).join(" and ")} were your strongest months` : ""}.`,
    });
  }
  const stalledInProgress = stalled.filter((r) => /in progress/i.test(r.status));
  const inProgressTotal = open.filter((r) => /in progress/i.test(r.status)).length;
  if (stalledInProgress.length) {
    const lo = Math.min(...stalledInProgress.map((r) => r.idle));
    const hi = Math.max(...stalledInProgress.map((r) => r.idle));
    takeaways.push({
      lead: "Stalled In Progress",
      text: `${stalledInProgress.length} of your ${inProgressTotal} in-progress ${inProgressTotal === 1 ? "item has" : "items have"} had no ${idleBasis === "status-change" ? "status change" : "update"} in ${lo === hi ? lo : `${lo}–${hi}`} days. Close, move back to Backlog or unblock:`,
      keys: stalledInProgress.slice(0, 3).map((r) => r.key),
    });
  }
  const oldBacklog = stalled.filter((r) => !/in progress/i.test(r.status) && r.idle >= 90).slice(0, 3);
  if (oldBacklog.length) {
    takeaways.push({ lead: "Old backlog", text: "Worth reviewing to decide whether to keep or cancel:", keys: oldBacklog.map((r) => r.key) });
  }
  const bugLead = leadRows.filter((r) => /bug/i.test(r.type)).map((r) => r.days);
  const otherLead = leadRows.filter((r) => !/bug/i.test(r.type)).map((r) => r.days);
  if (bugLead.length >= 3 && otherLead.length >= 3) {
    const b = median(bugLead);
    const o = median(otherLead);
    if (b !== o) {
      takeaways.push({ lead: b < o ? "Bugs move faster" : "Bugs move slower", text: `bugs close in a median of ${b} days, compared with ${o} days for other work.` });
    }
  }

  const idleNote =
    idleBasis === "status-change"
      ? `"Idle" is days since the last status change (or creation, if the status never changed).`
      : `"Idle" uses each issue's last-updated date, which counts any edit or comment, not just status changes, so some issues may look more active than they are.`;
  const cycleNote = cycleDays.length
    ? "Lead time runs from creation to resolution; cycle time runs from first move to In Progress."
    : "Lead time runs from creation to resolution; it is not cycle time (In Progress to Done).";

  const projects = [...new Set(scope.map((e) => String(e.issue.key || "").split("-")[0]).filter(Boolean))];
  const windowLabel = options.windowLabel || defaultWindowLabel(windowStart, windowEnd);
  const who = options.personName ? `${options.personName}'s` : "My";

  return {
    baseUrl: options.baseUrl || "",
    title: options.allAssignees ? `Flow Report: ${windowLabel}` : `${who} Assigned Work: ${windowLabel}`,
    subtitle: `Jira issues ${options.allAssignees ? "for all assignees" : `assigned to ${options.personName || "you"}${options.includeHandedOn ? " now or earlier" : ""}`} that were created or resolved between ${windowStart} and ${windowEnd}${options.scopeLabel ? ", limited to the selected projects" : ""}`,
    chips: [
      ...(options.siteLabel ? [`Site: ${options.siteLabel}`] : []),
      ...(options.scopeLabel ? [`Projects: ${options.scopeLabel}`] : []),
      ...(options.includeHandedOn ? ["Includes work handed on"] : []),
      `${plural(total, "issue")}${projects.length ? ` · ${projects.length === 1 ? `all in ${projects[0]}` : projects.join(", ")}` : ""}`,
      `Data as of ${nowDay}`,
    ],
    kpis,
    flowNote: `Created counts only issues created in this window (${createdInWindow}). Resolved includes ${olderResolved} older ${olderResolved === 1 ? "issue" : "issues"} closed in this window (${resolvedInWindow}).`,
    months,
    created,
    resolved,
    status,
    types,
    priorities,
    aging,
    idleBuckets,
    leadNote: `From created to resolved, for the ${completed.length} issues both created and resolved in this window`,
    leadBuckets,
    leadByType,
    dueNote,
    stalledDays,
    stalledDefinition: `no ${idleBasis === "status-change" ? "status change" : "update"} for ${stalledDays}+ days`,
    open,
    parents,
    takeaways,
    footnote: `${idleNote} ${cycleNote} ${options.allAssignees ? "Issues for all assignees in the selected projects are included." : options.includeHandedOn ? "Includes issues that were assigned to the person earlier and handed on; the Assignee column shows who holds them now." : "Only issues currently assigned to the person are included."}`,
    meta: {
      allAssignees: Boolean(options.allAssignees),
      includeHandedOn: Boolean(options.includeHandedOn),
      generatedAt: new Date().toISOString(),
      windowStart,
      windowEnd,
      issueCount: total,
      idleBasis,
      cycleTimeAvailable: cycleDays.length > 0,
    },
  };
};

const mdCell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
/** Compact, number-only context for the AI summary. Everything the model may say must be in here. */
export const buildFlowNarrativeContext = (data) => {
  const lines = [`# ${data.title}`, data.subtitle || "", (data.chips || []).join(" | "), ""];
  lines.push("## Key metrics", ...(data.kpis || []).map((k) => `- ${k.label}: ${k.value}${k.sub ? ` (${k.sub})` : ""}`), "");
  if (data.flowNote) lines.push("## Created vs resolved", data.flowNote, "");
  const bucketLine = (title, rows) => (rows?.length ? [`${title}: ${rows.map((r) => `${r.label} = ${r.count}`).join("; ")}`] : []);
  lines.push("## Distribution", ...bucketLine("Open issue age", data.aging), ...bucketLine("Idle time", data.idleBuckets), ...bucketLine("Lead time", data.leadBuckets), ...bucketLine("Status", data.status), "");
  lines.push(`## Most idle open items (showing ${Math.min(10, (data.open || []).length)} of ${(data.open || []).length}; stalled = ${data.stalledDefinition || "no recent update"})`);
  for (const r of (data.open || []).slice(0, 10)) lines.push(`- ${r.key} "${r.summary}" | ${r.status} | ${r.assignee || "Unassigned"} | age ${r.age}d | idle ${r.idle}d`);
  lines.push("");
  if ((data.takeaways || []).length) lines.push("## Computed takeaways", ...data.takeaways.map((t) => `- ${t.lead}: ${t.text}`), "");
  if (data.footnote) lines.push(`Note: ${data.footnote}`);
  return lines.join("\n").slice(0, 8000);
};

const escapeHtml = (value) =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Self-contained, script-free HTML page for a rendered report (static: sorting and filters are not kept). */
export const buildStandaloneFlowHtml = ({ title, bodyHtml, css }) => {
  const safeCss = String(css || "").replace(/<\/style/gi, "<\\/style").replace(/<script/gi, "<\\script");
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title || "Flow report")}</title>`,
    `<style>body{margin:0;background:#f4f6fa;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}</style>`,
    `<style>${safeCss}</style>`,
    "</head>",
    `<body>${String(bodyHtml || "")}</body>`,
    "</html>",
  ].join("\n");
};

export const flowReportFileName = (title, day, extension) => {
  const base = String(title || "").replace(/[^A-Za-z0-9]+/g, " ").trim().replace(/\s+/g, "_") || "flow-report";
  return `${base}_${day}.${extension}`;
};

const mdTable = (headers, rows) =>
  [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(mdCell).join(" | ")} |`)].join("\n");

export const buildFlowReportMarkdown = (data) => {
  if (!data || typeof data !== "object") return "";
  const link = (key) => (key ? (data.baseUrl ? `[${key}](${data.baseUrl}${key})` : key) : "");
  const lines = [`# ${data.title}`, "", data.subtitle, "", (data.chips || []).join(" · "), ""];

  lines.push("## Summary", "", mdTable(["Metric", "Value", "Detail"], (data.kpis || []).map((k) => [k.label, k.value, k.sub || ""])), "");
  lines.push("## Created vs. resolved by month", "", data.flowNote || "", "", mdTable(["Month", "Created", "Resolved"], (data.months || []).map((m, i) => [m, data.created[i], data.resolved[i]])), "");
  lines.push(
    "## Breakdown", "",
    mdTable(["Status", "Issues"], (data.status || []).map((s) => [s.label, s.count])), "",
    mdTable(["Type", "Issues"], (data.types || []).map((s) => [s.label, s.count])), "",
    mdTable(["Priority", "Issues"], (data.priorities || []).map((s) => [s.label, s.count])), ""
  );
  lines.push(
    "## Aging and lead time", "",
    mdTable(["Open issue age", "Issues"], (data.aging || []).map((s) => [s.label, s.count])), "",
    mdTable(["Days since last update", "Issues"], (data.idleBuckets || []).map((s) => [s.label, s.count])), "",
    data.leadNote || "", "",
    mdTable(["Lead time", "Issues"], (data.leadBuckets || []).map((s) => [s.label, s.count])), "",
    mdTable(["Median lead time by type", "Days"], (data.leadByType || []).map((s) => [s.label, s.days])), "",
    data.dueNote || "", ""
  );
  const stalledRows = (data.open || []).slice(0, 25);
  const showAssignee = Boolean(data.meta?.allAssignees || data.meta?.includeHandedOn);
  lines.push(
    "## Open work (most idle first)", "",
    `"Stalled" means ${data.stalledDefinition || "no recent update"}.`, "",
    mdTable(
      ["Issue", "Summary", "Status", ...(showAssignee ? ["Assignee"] : []), "Parent", "Age (d)", "Idle (d)", "Flag"],
      stalledRows.map((r) => [link(r.key), r.summary, r.status, ...(showAssignee ? [r.assignee || "Unassigned"] : []), link(r.parent), r.age, r.idle, r.idle >= (data.stalledDays || 30) ? "Stalled" : "Active"])
    ), ""
  );
  if ((data.open || []).length > stalledRows.length) lines.push(`_Showing ${stalledRows.length} of ${data.open.length} open issues._`, "");
  if ((data.parents || []).length) {
    lines.push("## Progress by parent", "", mdTable(["Parent", "Done", "Total"], data.parents.map((p) => [`${link(p.key)} ${p.name || ""}`.trim(), p.done, p.total])), "");
  }
  if ((data.takeaways || []).length) {
    lines.push("## Key takeaways", "", ...data.takeaways.map((t) => `- **${t.lead}:** ${t.text}${t.keys?.length ? ` ${t.keys.map(link).join(", ")}` : ""}`), "");
  }
  if (data.footnote) lines.push(`_${data.footnote}_`, "");
  if (data.narrative) lines.splice(4, 0, "## AI summary", "", String(data.narrative), "");
  return lines.join("\n");
};

// Minimal shape check for report data coming back from the client (save-to-archive).
export const isFlowReportData = (data) =>
  Boolean(data) &&
  typeof data === "object" &&
  typeof data.title === "string" &&
  Array.isArray(data.kpis) &&
  Array.isArray(data.months) &&
  Array.isArray(data.created) &&
  Array.isArray(data.resolved) &&
  data.created.length === data.months.length &&
  data.resolved.length === data.months.length &&
  Array.isArray(data.open);
