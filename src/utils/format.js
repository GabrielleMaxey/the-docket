const toValidDate = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDate = (value, options = {}, fallback = "") => {
  const date = toValidDate(value);
  const { locale, ...dateOptions } = options || {};
  return date ? date.toLocaleDateString(locale, dateOptions) : fallback;
};

export const formatPercent = (value) => {
  if (value == null || Number.isNaN(Number(value))) {
    return "—";
  }
  return `${Number(value).toFixed(1)}%`;
};

export const formatTimestamp = (value) => {
  const date = toValidDate(value);
  return date ? date.toLocaleString() : value ? String(value) : "";
};
