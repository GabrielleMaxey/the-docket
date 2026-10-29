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

export function buildWeekPlanContext({ projects, capacityHours, focusStyle, additionalContext }) {
  const contextLines = [
    "## Weekly Planning Context",
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
        contextLines.push(`  - ${task.key}: ${task.summary} (${task.status}, assigned: ${task.assignee})${flag}${suffix}`);
      }
    }
  }
  return contextLines.join("\n");
}
