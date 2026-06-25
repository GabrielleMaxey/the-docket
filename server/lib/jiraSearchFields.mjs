const BASE_SEARCH_FIELDS = [
  "summary",
  "issuetype",
  "status",
  "assignee",
  "updated",
  "parent",
  "duedate",
];

const ODI_FALLBACK_FIELD_IDS = ["customfield_10008", "customfield_10009"];

export const getJiraSearchFields = (db) => {
  const fields = [...BASE_SEARCH_FIELDS];
  const seen = new Set(fields);

  const rows = db
    .prepare("SELECT field_id FROM jira_field_mappings WHERE TRIM(field_id) != ''")
    .all();

  for (const row of rows) {
    const fieldId = String(row.field_id || "").trim();
    if (!fieldId || seen.has(fieldId)) {
      continue;
    }

    seen.add(fieldId);
    fields.push(fieldId);
  }

  for (const fieldId of ODI_FALLBACK_FIELD_IDS) {
    if (!seen.has(fieldId)) {
      seen.add(fieldId);
      fields.push(fieldId);
    }
  }

  return fields;
};
