// Small generic formatting helpers used across pages (Dashboard today,
// but these have no Dashboard-specific logic in them).

export const formatPercent = (value) => {
  if (value == null || Number.isNaN(Number(value))) {
    return "—";
  }
  return `${Number(value).toFixed(1)}%`;
};

export const formatTimestamp = (value) => {
  if (!value) {
    return "";
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};
