export const OVERDUE_DATE_BASES = ["task_due", "epic_done", "either"];
export const DEFAULT_OVERDUE_DATE_BASIS = "either";

export const normalizeOverdueDateBasis = (value) => {
  const basis = String(value || "").trim();
  return OVERDUE_DATE_BASES.includes(basis) ? basis : DEFAULT_OVERDUE_DATE_BASIS;
};

export const OVERDUE_DATE_BASIS_OPTIONS = [
  { value: "either", text: "Either (issue dates, then Epic)" },
  { value: "task_due", text: "Task due date" },
  { value: "epic_done", text: "Epic done dates" },
];

export const overdueDateBasisShortLabel = (value) => {
  const basis = normalizeOverdueDateBasis(value);
  if (basis === "task_due") return "Task due date";
  if (basis === "epic_done") return "Epic done dates";
  return "Either";
};
