const jqlFieldRef = (mapping) => {
  if (!mapping) {
    return null;
  }

  const fieldId = String(mapping.fieldId || "").trim();
  const fieldName = String(mapping.fieldName || "").trim();

  if (fieldId === "duedate") {
    return "duedate";
  }

  if (fieldName) {
    return `"${fieldName.replace(/"/g, '\\"')}"`;
  }

  return fieldId || null;
};

export const buildFieldMappingsMap = (rows) => {
  const map = new Map();
  for (const row of rows) {
    map.set(String(row.role || "").trim(), {
      role: String(row.role || "").trim(),
      fieldId: String(row.field_id || "").trim(),
      fieldName: String(row.field_name || "").trim(),
    });
  }
  return map;
};

// Replaces the contents of every quoted string in `text` with "x" (keeping
// the quote characters and overall length/positions intact), so a regex
// search on the result can't match text that only exists inside a JQL
// string literal. Handles backslash-escaped quotes.
const maskQuotedStrings = (text) => {
  let masked = "";
  let quoteChar = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoteChar) {
      if (ch === "\\" && i + 1 < text.length) {
        masked += "xx";
        i += 1;
        continue;
      }
      masked += ch === quoteChar ? ch : "x";
      if (ch === quoteChar) {
        quoteChar = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quoteChar = ch;
    }
    masked += ch;
  }
  return masked;
};

// Splits a JQL string into its scope clause and trailing ORDER BY clause.
// Searches a quote-masked copy of the string so a summary/text-search term
// like `summary ~ "purchase order by region"` can't be mistaken for the
// query's real ORDER BY - a naive regex match on the raw string would cut
// the scope off mid-literal in that case.
export const splitTrailingOrderBy = (jql) => {
  const source = String(jql || "").trim();
  if (!source) {
    return { scope: "", orderBy: "" };
  }
  const masked = maskQuotedStrings(source);
  const match = masked.match(/\bORDER\s+BY\s+[\s\S]+$/i);
  if (!match) {
    return { scope: source, orderBy: "" };
  }
  return {
    scope: source.slice(0, match.index).trim(),
    orderBy: source.slice(match.index).trim(),
  };
};

const OPEN_ONLY_STATUS_PATTERNS = [
  /\bAND\s+status\s+NOT\s+IN\s*\([^)]*\)/gi,
  /\bAND\s+statusCategory\s*!=\s*Done\b/gi,
  /\bAND\s+status\s*!=\s*(?:"[^"]*"|'[^']*'|\w+)/gi,
  /\bAND\s+status\s+IN\s*\(\s*Open\s*\)/gi,
];

export const buildDashboardMetricsJql = (jql) => {
  const source = String(jql || "").trim();
  if (!source) {
    return "";
  }

  const { scope, orderBy } = splitTrailingOrderBy(source);
  const orderClause = orderBy || "ORDER BY updated DESC";
  let scopeClause = scope;

  for (const pattern of OPEN_ONLY_STATUS_PATTERNS) {
    scopeClause = scopeClause.replace(pattern, "");
  }

  scopeClause = scopeClause.replace(/\s{2,}/g, " ").trim();
  if (!scopeClause) {
    return orderClause;
  }

  return `${scopeClause} ${orderClause}`.trim();
};

export const fallbackPresetJql = (epicKey) => {
  const key = String(epicKey || "").trim();
  if (!key) {
    return "";
  }

  return `(parent = ${key} OR key = ${key}) ORDER BY updated DESC`;
};

export const resolvePresetJql = async ({ preset, jiraRequest }) => {
  const presetType = String(preset?.presetType || "").trim();
  if (presetType === "jql") {
    return String(preset?.jql || "").trim();
  }

  const filterId = String(preset?.jiraFilterId || "").trim();
  if (filterId) {
    const result = await jiraRequest({
      pathWithQuery: `/rest/api/3/filter/${encodeURIComponent(filterId)}`,
    });
    if (result.ok) {
      const jql = String(result.data?.jql || "").trim();
      if (jql) {
        return jql;
      }
    }
  }

  const storedJql = String(preset?.jql || "").trim();
  if (storedJql) {
    return storedJql;
  }

  return fallbackPresetJql(preset?.epicKey);
};

export const buildPastDueJql = ({
  mappingsByRole,
  epicPastDueMode,
  epicKeys = [],
  pastDueFloorDate = null,
}) => {
  const dueMapping = mappingsByRole.get("due_date");
  const iddMapping = mappingsByRole.get("initial_done_date");
  const mrdMapping = mappingsByRole.get("most_recent_done_date");
  const pedMapping = mappingsByRole.get("project_end_date");

  const dueRef = jqlFieldRef(dueMapping) || "duedate";
  const iddRef = jqlFieldRef(iddMapping);
  const mrdRef = jqlFieldRef(mrdMapping);
  const pedRef = jqlFieldRef(pedMapping);

  const floorLiteral =
    pastDueFloorDate instanceof Date
      ? pastDueFloorDate.toISOString().slice(0, 10)
      : String(pastDueFloorDate || "").trim();

  const withFloor = (clause, ref) => {
    if (!clause) {
      return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(floorLiteral)) {
      return clause;
    }
    return `${clause} AND ${ref} >= "${floorLiteral}"`;
  };

  const taskClause = withFloor(
    `statusCategory != Done AND ${dueRef} is not EMPTY AND ${dueRef} < startOfDay()`,
    dueRef
  );

  const iddClause = withFloor(
    iddRef != null ? `${iddRef} is not EMPTY AND ${iddRef} < startOfDay()` : null,
    iddRef
  );
  const mrdClause = withFloor(
    mrdRef != null ? `${mrdRef} is not EMPTY AND ${mrdRef} < startOfDay()` : null,
    mrdRef
  );
  const pedClause = withFloor(
    pedRef != null ? `${pedRef} is not EMPTY AND ${pedRef} < startOfDay()` : null,
    pedRef
  );

  let epicInnerClause = null;
  switch (epicPastDueMode) {
    case "initial_done_date":
      epicInnerClause = iddClause;
      break;
    case "most_recent_done_date":
      epicInnerClause = mrdClause;
      break;
    case "project_end_date":
      epicInnerClause = pedClause;
      break;
    case "either":
    default: {
      const parts = [mrdClause, iddClause, pedClause].filter(Boolean);
      epicInnerClause = parts.length > 0 ? parts.map((part) => `(${part})`).join(" OR ") : null;
      break;
    }
  }

  const clauses = [taskClause];
  if (epicInnerClause) {
    clauses.push(`(issuetype = Epic AND statusCategory != Done AND (${epicInnerClause}))`);
  }

  let jql = `(${clauses.join(" OR ")})`;

  const scopedKeys = epicKeys.map((key) => String(key || "").trim()).filter(Boolean);
  if (scopedKeys.length > 0) {
    const keysList = scopedKeys.join(", ");
    jql = `(${jql}) AND (parent in (${keysList}) OR key in (${keysList}))`;
  }

  return `${jql} ORDER BY updated DESC`;
};

export const buildUnionScopeFromJqls = (jqls) => {
  const scopes = (Array.isArray(jqls) ? jqls : [])
    .map((jql) => splitTrailingOrderBy(String(jql || "").trim()).scope)
    .filter(Boolean);
  if (scopes.length === 0) {
    return "";
  }
  return scopes.map((scope) => `(${scope})`).join(" OR ");
};

export const applyJqlScope = (jql, unionScope) => {
  const source = String(jql || "").trim();
  const scopeClause = String(unionScope || "").trim();
  if (!source || !scopeClause) {
    return "";
  }
  const { scope, orderBy } = splitTrailingOrderBy(source);
  if (!scope) {
    return "";
  }
  return `(${scope}) AND (${scopeClause}) ${orderBy || "ORDER BY updated DESC"}`.trim();
};

const applyEpicKeyScope = (jql, epicKeys = []) => {
  const scopedKeys = (Array.isArray(epicKeys) ? epicKeys : [])
    .map((key) => String(key || "").trim())
    .filter((key) => key && key !== "JQL");
  if (scopedKeys.length === 0) {
    return String(jql || "").trim();
  }

  const { scope, orderBy } = splitTrailingOrderBy(jql);
  const keysList = scopedKeys.join(", ");
  const scoped = scope
    ? `(${scope}) AND (parent in (${keysList}) OR key in (${keysList}))`
    : `(parent in (${keysList}) OR key in (${keysList}))`;
  return `${scoped} ${orderBy || "ORDER BY updated DESC"}`.trim();
};

export const buildUpcomingDueJql = ({
  mappingsByRole,
  dueByField = "due_date",
  dueByDate,
  epicKeys = [],
}) => {
  const cutoff = String(dueByDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
    return "";
  }

  const role = dueByField === "due_date" ? "due_date" : String(dueByField || "due_date").trim();
  const dueRef = jqlFieldRef(mappingsByRole?.get?.(role)) || "duedate";
  const jql = `statusCategory != Done AND ${dueRef} >= startOfDay() AND ${dueRef} <= "${cutoff}" ORDER BY ${dueRef} ASC`;
  return applyEpicKeyScope(jql, epicKeys);
};

export const buildStatusCategoryJql = ({ category, epicKeys = [] }) => {
  const cat = String(category || "").trim();
  if (!cat) {
    return "";
  }
  const escaped = cat.replace(/"/g, '\\"');
  const jql = `statusCategory = "${escaped}" ORDER BY updated DESC`;
  return applyEpicKeyScope(jql, epicKeys);
};
