// ODI Jira custom field IDs for Automated Done Date fields (see JIRA_SETUP.md).
export const ODI_FIELD_IDS = {
  initial_done_date: "customfield_10008",
  most_recent_done_date: "customfield_10009",
  due_date: "duedate",
};

export const resolveMappedFieldId = (mappingsByRole, role) => {
  const mapping = mappingsByRole?.get?.(role) || mappingsByRole?.[role];
  const fromMap = String(mapping?.fieldId || "").trim();
  if (fromMap) {
    return fromMap;
  }
  return ODI_FIELD_IDS[role] || "";
};
