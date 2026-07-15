import { normalizeOdiBugPriority } from "../../shared/odiIssueStandards.mjs";
import { filterWorkfrontErrorMessages } from "../../shared/jiraErrorUtils.mjs";

const createMetaCache = new Map();

const PRIORITY_ALIASES = {
  Critical: ["Critical", "Highest", "Blocker"],
  High: ["High"],
  Medium: ["Medium"],
  Low: ["Low", "Lowest"],
};

const isEpicLinkField = (meta) => {
  const custom = String(meta?.schema?.custom || "");
  const name = String(meta?.name || "").trim().toLowerCase();
  return custom.includes("gh-epic-link") || name === "epic link";
};

const isParentLinkField = (meta) => {
  const custom = String(meta?.schema?.custom || "");
  const name = String(meta?.name || "").trim().toLowerCase();
  return custom.includes("jpo-custom-field-parent") || name === "parent link";
};

const findIssueTypeMeta = (project, issueTypeName) => {
  const issueTypes = Array.isArray(project?.issuetypes) ? project.issuetypes : [];
  const normalized = String(issueTypeName || "").trim().toLowerCase();
  return (
    issueTypes.find((type) => String(type?.name || "").trim().toLowerCase() === normalized) ||
    issueTypes.find((type) => String(type?.name || "").trim() === issueTypeName) ||
    null
  );
};

const findSubtaskIssueTypeMeta = (project) => {
  const issueTypes = Array.isArray(project?.issuetypes) ? project.issuetypes : [];
  return issueTypes.find((type) => {
    const name = String(type?.name || "").trim().toLowerCase();
    return (
      (name === "sub-task" || name === "subtask" || name === "sub task") &&
      (type?.subtask || type?.fields?.parent)
    );
  });
};

const wantsStoryParent = ({ issueTypeName, parentRole, isSubtask }) =>
  Boolean(isSubtask || (issueTypeName === "Task" && parentRole === "story"));

export const loadProjectComponents = async ({ projectKey, jiraRequest }) => {
  const cacheKey = `components:${String(projectKey || "").trim()}`;
  if (createMetaCache.has(cacheKey)) {
    return createMetaCache.get(cacheKey);
  }

  const result = await jiraRequest({
    pathWithQuery: `/rest/api/3/project/${encodeURIComponent(projectKey)}/components`,
  });

  const components = result.ok && Array.isArray(result.data) ? result.data : [];
  createMetaCache.set(cacheKey, components);
  return components;
};

const collectAllowedOptionLabels = (meta) => {
  const allowed = Array.isArray(meta?.allowedValues) ? meta.allowedValues : [];
  const labels = [];
  for (const item of allowed) {
    const label = String(item?.value ?? item?.name ?? "").trim();
    if (label) {
      labels.push(label);
    }
  }
  return labels;
};

const uniqueSortedLabels = (labels) =>
  [...new Set((labels || []).map((item) => String(item || "").trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right, undefined, { sensitivity: "base" })
  );

/** Live dropdown labels for Create Issue (project components + createmeta allowedValues). */
export const loadCreateFieldOptions = async ({
  projectKey,
  issueTypeName = "Story",
  jiraRequest,
}) => {
  const [projectComponents, createMeta] = await Promise.all([
    loadProjectComponents({ projectKey, jiraRequest }),
    loadProjectCreateMeta({ projectKey, jiraRequest }),
  ]);

  const componentNames = uniqueSortedLabels(
    (projectComponents || []).map((item) => item?.name)
  );

  const issueTypeFields =
    resolveIssueTypeMeta({
      project: createMeta?.ok ? createMeta.project : null,
      issueTypeName,
      needsParent: false,
    })?.fields || {};

  const verticalMatch = findCreateMetaField(issueTypeFields, isVerticalComponentsField);
  const bugTrackingMatch = findCreateMetaField(issueTypeFields, isBugTrackingField);
  const componentsMetaMatch = findCreateMetaField(issueTypeFields, isComponentsField);

  // Prefer project component registry; fall back to createmeta allowedValues when empty.
  const componentsFromMeta = uniqueSortedLabels(
    collectAllowedOptionLabels(componentsMetaMatch?.meta)
  );

  return {
    components: componentNames.length > 0 ? componentNames : componentsFromMeta,
    verticalComponents: uniqueSortedLabels(collectAllowedOptionLabels(verticalMatch?.meta)),
    bugTracking: uniqueSortedLabels(collectAllowedOptionLabels(bugTrackingMatch?.meta)),
  };
};

const resolveProjectComponentName = ({ requestedName, meta, projectComponents }) => {
  const normalized = String(requestedName || "").trim();
  if (!normalized) {
    return null;
  }

  const candidates = [];
  const allowed = Array.isArray(meta?.allowedValues) ? meta.allowedValues : [];
  for (const item of allowed) {
    candidates.push(String(item?.name || "").trim());
  }
  for (const item of projectComponents || []) {
    candidates.push(String(item?.name || "").trim());
  }

  const match = candidates.find((name) => name && name.toLowerCase() === normalized.toLowerCase());
  return match || null;
};

export const loadProjectCreateMeta = async ({ projectKey, jiraRequest }) => {
  const cacheKey = String(projectKey || "").trim();
  if (createMetaCache.has(cacheKey)) {
    return createMetaCache.get(cacheKey);
  }

  const result = await jiraRequest({
    pathWithQuery: `/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(cacheKey)}&expand=projects.issuetypes.fields`,
  });

  if (!result.ok) {
    return { ok: false, status: result.status, data: result.data };
  }

  const projects = Array.isArray(result.data?.projects) ? result.data.projects : [];
  const project =
    projects.find((item) => String(item.key || "").trim() === cacheKey) || projects[0] || null;

  const payload = { ok: true, project };
  createMetaCache.set(cacheKey, payload);
  return payload;
};

export const resolveIssueTypeMeta = ({
  project,
  issueTypeName,
  needsParent,
  parentRole = "",
  isSubtask = false,
}) => {
  const requested = findIssueTypeMeta(project, issueTypeName);
  if (!requested) {
    return null;
  }

  // ODI: Story children are Jira Sub-tasks. Task issuetype parents to Epic only —
  // createmeta still exposes parent on Task, so do not keep Task for story parents.
  if (wantsStoryParent({ issueTypeName, parentRole, isSubtask })) {
    return findSubtaskIssueTypeMeta(project) || requested;
  }

  if (!needsParent || requested.fields?.parent) {
    return requested;
  }

  if (issueTypeName === "Task") {
    return findSubtaskIssueTypeMeta(project) || requested;
  }

  return requested;
};

export const resolveJiraPriorityName = ({ fields, odiPriority }) => {
  const normalized = normalizeOdiBugPriority(odiPriority);
  if (!normalized) {
    return null;
  }

  const allowed = Array.isArray(fields?.priority?.allowedValues) ? fields.priority.allowedValues : [];
  if (allowed.length === 0) {
    return normalized;
  }

  const exact = allowed.find(
    (item) => String(item?.name || "").trim().toLowerCase() === normalized.toLowerCase()
  );
  if (exact?.name) {
    return exact.name;
  }

  for (const candidate of PRIORITY_ALIASES[normalized] || []) {
    const match = allowed.find(
      (item) => String(item?.name || "").trim().toLowerCase() === candidate.toLowerCase()
    );
    if (match?.name) {
      return match.name;
    }
  }

  return null;
};

export const findCreateMetaField = (issueTypeFields, predicate) => {
  for (const [fieldKey, meta] of Object.entries(issueTypeFields || {})) {
    const name = String(meta?.name || "").trim().toLowerCase();
    if (predicate({ fieldKey, name, meta })) {
      return { fieldKey, meta };
    }
  }
  return null;
};

const isComponentsField = ({ fieldKey, name, meta }) => {
  const schema = meta?.schema || {};
  return (
    fieldKey === "components" ||
    name === "components" ||
    name === "component(s)" ||
    (schema.type === "array" && schema.items === "component")
  );
};

const isVerticalComponentsField = ({ name }) =>
  name.includes("vertical") && name.includes("component");

const isBugTrackingField = ({ name }) => name.includes("bug tracking");

const resolveAllowedOptionValue = (meta, text) => {
  const allowed = Array.isArray(meta?.allowedValues) ? meta.allowedValues : [];
  const normalized = String(text || "").trim();
  if (!normalized) {
    return null;
  }

  const exact = allowed.find((item) => {
    const candidate = String(item?.value ?? item?.name ?? "").trim();
    return candidate.toLowerCase() === normalized.toLowerCase();
  });
  if (exact) {
    if (exact.value !== undefined && exact.value !== null && exact.value !== "") {
      return { value: exact.value };
    }
    if (exact.name) {
      return { name: exact.name };
    }
    if (exact.id) {
      return { id: exact.id };
    }
  }

  return { value: normalized };
};

export const applyNamedFieldValue = ({ fields, fieldKey, meta, value, projectComponents }) => {
  const text = String(value || "").trim();
  if (!text || !fieldKey || !meta) {
    return { ok: false };
  }

  const schema = meta.schema || {};
  const name = String(meta?.name || "").trim().toLowerCase();
  if (isComponentsField({ fieldKey, name, meta })) {
    const resolvedName = resolveProjectComponentName({
      requestedName: text,
      meta,
      projectComponents,
    });
    if (!resolvedName) {
      return {
        ok: false,
        error: `Component name '${text}' is not valid for this Jira project. Choose an existing component or leave the field blank.`,
      };
    }
    fields.components = [{ name: resolvedName }];
    return { ok: true };
  }

  if (schema.type === "option" || Array.isArray(meta.allowedValues)) {
    fields[fieldKey] = resolveAllowedOptionValue(meta, text);
    return { ok: true };
  }

  if (schema.type === "array") {
    fields[fieldKey] = [{ value: text }];
    return { ok: true };
  }

  fields[fieldKey] = text;
  return { ok: true };
};

export const applyOdiCreateFields = ({
  fields,
  issueTypeFields,
  issueType,
  component,
  verticalComponent,
  bugTracking,
  projectComponents,
}) => {
  const componentValue = String(component || "").trim();
  if (componentValue) {
    const match = findCreateMetaField(issueTypeFields, isComponentsField);
    if (match) {
      const result = applyNamedFieldValue({
        fields,
        fieldKey: match.fieldKey,
        meta: match.meta,
        value: componentValue,
        projectComponents,
      });
      if (!result.ok) {
        return result;
      }
    }
  }

  const verticalValue = String(verticalComponent || "").trim();
  if (verticalValue) {
    const match = findCreateMetaField(issueTypeFields, isVerticalComponentsField);
    if (match) {
      applyNamedFieldValue({
        fields,
        fieldKey: match.fieldKey,
        meta: match.meta,
        value: verticalValue,
        projectComponents,
      });
    }
  }

  const bugTrackingValue = String(bugTracking || "").trim();
  if (issueType === "Bug" && bugTrackingValue) {
    const match = findCreateMetaField(issueTypeFields, isBugTrackingField);
    if (match) {
      applyNamedFieldValue({
        fields,
        fieldKey: match.fieldKey,
        meta: match.meta,
        value: bugTrackingValue,
        projectComponents,
      });
    }
  }

  return { ok: true };
};

export const applyParentLinkFields = ({
  fields,
  issueTypeFields,
  parentKey,
  parentRole,
  issueType,
  isSubtask = false,
}) => {
  if (!parentKey) {
    return { ok: true };
  }

  const useEpicParent = parentRole === "epic" || issueType === "Story" || issueType === "Bug";
  const useStoryParent = wantsStoryParent({ issueTypeName: issueType, parentRole, isSubtask });

  if (useStoryParent) {
    fields.parent = { key: parentKey };
    return { ok: true, linkMode: "parent" };
  }

  // Prefer unified parent field (Epic Link / Parent Link are deprecated on create).
  if (issueTypeFields?.parent) {
    fields.parent = { key: parentKey };
    return { ok: true, linkMode: "parent" };
  }

  if (useEpicParent) {
    for (const [fieldKey, meta] of Object.entries(issueTypeFields || {})) {
      if (isEpicLinkField(meta)) {
        fields[fieldKey] = parentKey;
        return { ok: true, linkMode: "epicLink", fieldKey };
      }
    }
  }

  // Never set Portfolio Parent Link for story parents; avoid it when parent works.
  for (const [fieldKey, meta] of Object.entries(issueTypeFields || {})) {
    if (isParentLinkField(meta)) {
      fields[fieldKey] = parentKey;
      return { ok: true, linkMode: "parentLink", fieldKey };
    }
  }

  if (!useEpicParent) {
    return {
      ok: false,
      error: `Issue type ${issueType} does not support a Story parent on the create screen.`,
    };
  }

  return {
    ok: false,
    error: `Issue type ${issueType} does not support linking to an Epic on the create screen.`,
  };
};

export const formatJiraApiError = (data) => {
  const messages = [];
  if (Array.isArray(data?.errorMessages)) {
    messages.push(
      ...filterWorkfrontErrorMessages(data.errorMessages)
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    );
  }
  if (data?.errors && typeof data.errors === "object") {
    for (const [field, message] of Object.entries(data.errors)) {
      const detail = String(message || "").trim();
      if (detail) {
        messages.push(`${field}: ${detail}`);
      }
    }
  }
  if (messages.length === 0 && data?.message) {
    messages.push(String(data.message));
  }
  return messages.length > 0 ? messages.join(" ") : "Jira rejected the issue create request.";
};

export const buildJiraCreatePayload = async ({
  projectKey,
  issueType,
  summary,
  descriptionAdf,
  parentKey,
  parentRole,
  isSubtask = false,
  assigneeAccountId,
  odiPriority,
  component,
  verticalComponent,
  bugTracking,
  jiraRequest,
}) => {
  const metaResult = await loadProjectCreateMeta({ projectKey, jiraRequest });
  if (!metaResult.ok) {
    return {
      ok: false,
      status: metaResult.status || 500,
      error: formatJiraApiError(metaResult.data) || "Failed to load Jira create metadata.",
    };
  }

  const needsParent = Boolean(parentKey);
  const issueTypeMeta = resolveIssueTypeMeta({
    project: metaResult.project,
    issueTypeName: issueType,
    needsParent,
    parentRole,
    isSubtask,
  });

  if (!issueTypeMeta) {
    return {
      ok: false,
      status: 400,
      error: `Issue type "${issueType}" is not available for project ${projectKey}.`,
    };
  }

  const fields = {
    project: { key: projectKey },
    summary,
    issuetype: issueTypeMeta.id
      ? { id: issueTypeMeta.id }
      : { name: String(issueTypeMeta.name || issueType) },
  };

  if (descriptionAdf) {
    fields.description = descriptionAdf;
  }

  const parentResult = applyParentLinkFields({
    fields,
    issueTypeFields: issueTypeMeta.fields || {},
    parentKey,
    parentRole,
    issueType,
    isSubtask,
  });
  if (!parentResult.ok) {
    return { ok: false, status: 400, error: parentResult.error };
  }

  if (issueType === "Bug") {
    const priorityName = resolveJiraPriorityName({
      fields: issueTypeMeta.fields || {},
      odiPriority,
    });
    if (!priorityName) {
      const allowed = (issueTypeMeta.fields?.priority?.allowedValues || [])
        .map((item) => item?.name)
        .filter(Boolean);
      return {
        ok: false,
        status: 400,
        error:
          allowed.length > 0
            ? `Bug priority "${odiPriority}" is not valid for ODI. Allowed values: ${allowed.join(", ")}.`
            : `Bug priority "${odiPriority}" could not be mapped for this project.`,
      };
    }
    fields.priority = { name: priorityName };
  }

  if (assigneeAccountId) {
    fields.assignee = { id: assigneeAccountId };
  }

  const projectComponents = await loadProjectComponents({ projectKey, jiraRequest });
  const odiFieldsResult = applyOdiCreateFields({
    fields,
    issueTypeFields: issueTypeMeta.fields || {},
    issueType,
    component,
    verticalComponent,
    bugTracking,
    projectComponents,
  });
  if (!odiFieldsResult.ok) {
    return { ok: false, status: 400, error: odiFieldsResult.error };
  }

  return {
    ok: true,
    fields,
    issueTypeUsed: String(issueTypeMeta.name || issueType),
    linkMode: parentResult.linkMode || (fields.parent ? "parent" : null),
  };
};

export const buildEpicStoriesJql = (epicKey) =>
  `(parent = ${epicKey} OR "Epic Link" = ${epicKey}) AND issuetype = Story ORDER BY summary ASC`;

export const clearCreateMetaCache = () => {
  createMetaCache.clear();
};
