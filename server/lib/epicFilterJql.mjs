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

  const orderMatch = source.match(/\bORDER\s+BY\s+[\s\S]+$/i);
  const orderClause = orderMatch ? orderMatch[0].trim() : "ORDER BY updated DESC";
  let scopeClause = orderMatch ? source.slice(0, orderMatch.index).trim() : source;

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
