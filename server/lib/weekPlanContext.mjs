const MAX_SCORE = 500;
const MAX_REASONS = 8;
const MAX_REASON_LENGTH = 120;
const MAX_TASKS_PER_SLOT = 10;
const CONTROL_CHARS = /[\p{Cc}\u2028\u2029]/gu;

export function sanitizeScoredTask(task) {
  const raw = task?.score;
  const score =
    typeof raw === "number" && Number.isFinite(raw)
      ? Math.min(MAX_SCORE, Math.max(0, Math.round(raw)))
      : null;
  const why = Array.isArray(task?.why)
    ? task.why
        .filter((item) => typeof item === "string")
        .slice(0, MAX_REASONS)
        .map((item) => item.replace(CONTROL_CHARS, "").slice(0, MAX_REASON_LENGTH))
    : [];
  return { score, why };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISSUE_KEY = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
const MAX_LINKED_KEYS = 5;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pad = (n) => String(n).padStart(2, "0");
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Today plus the working days still left this week. On a weekend, the coming Monday–Friday.
export function describeWorkingDays(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = start.getDay();
  if (dow === 0) start.setDate(start.getDate() + 1);
  else if (dow === 6) start.setDate(start.getDate() + 2);
  const days = [];
  for (let d = new Date(start); d.getDay() >= 1 && d.getDay() <= 5; d.setDate(d.getDate() + 1)) {
    days.push(`${DAY_NAMES[d.getDay()]} ${isoDate(d)}`);
  }
  return {
    today: `${DAY_NAMES[now.getDay()]} ${isoDate(now)}`,
    days,
    weekendNote: dow === 0 || dow === 6,
  };
}

const cleanKeys = (list) =>
  Array.isArray(list)
    ? list.filter((k) => typeof k === "string" && ISSUE_KEY.test(k)).slice(0, MAX_LINKED_KEYS)
    : [];

export function buildWeekPlanContext({ projects, capacityHours, focusStyle, additionalContext, now = new Date() }) {
  const { today, days, weekendNote } = describeWorkingDays(now);
  const contextLines = [
    "## Weekly Planning Context",
    `- Today: ${today}`,
    `- Days to plan${weekendNote ? " (upcoming week)" : " (today onward; earlier days have passed)"}: ${days.join(", ")}`,
    `- Work week capacity: ${capacityHours} hours`,
    `- Focus approach: ${focusStyle}`,
  ];
  if (additionalContext) contextLines.push(`- Additional context: ${additionalContext}`);
  contextLines.push("", "## Active Projects");
  for (const proj of projects) {
    contextLines.push("", `### ${proj.label}`);
    contextLines.push(`- Total: ${proj.total} | Open: ${proj.open} | Overdue: ${proj.overdue}`);
    if (Array.isArray(proj.tasks) && proj.tasks.length > 0) {
      contextLines.push("Top open tasks (ranked by suggested-order score):");
      for (const task of proj.tasks.slice(0, MAX_TASKS_PER_SLOT)) {
        const flag = task.isOverdue ? " [OVERDUE]" : "";
        const { score, why } = sanitizeScoredTask(task);
        const suffix = score === null ? "" : ` | score ${score}${why.length ? `: ${why.join("; ")}` : ""}`;
        const due = typeof task.dueDate === "string" && DATE_ONLY.test(task.dueDate) ? ` | due ${task.dueDate}` : "";
        const blockedBy = cleanKeys(task.blockedBy);
        const blocks = cleanKeys(task.blocks);
        const links =
          (blockedBy.length ? ` | blocked by ${blockedBy.join(", ")}` : "") +
          (blocks.length ? ` | blocks ${blocks.join(", ")}` : "");
        contextLines.push(`  - ${task.key}: ${task.summary} (${task.status}, assigned: ${task.assignee})${flag}${due}${links}${suffix}`);
      }
    }
  }
  return contextLines.join("\n");
}
