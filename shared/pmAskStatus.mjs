export const PM_ASK_STATUSES = Object.freeze(["open", "done", "canceled"]);

export function normalizePmAskStatus(value) {
  const s = String(value || "").trim().toLowerCase();
  return PM_ASK_STATUSES.includes(s) ? s : "open";
}

export function isClosedPmAskStatus(status) {
  const s = normalizePmAskStatus(status);
  return s === "done" || s === "canceled";
}
