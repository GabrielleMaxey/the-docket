import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { appDbPathForInstance, beginInstanceOperations, getInstanceCredentials, listInstances, MAX_JIRA_INSTANCES } from "./jiraInstances.mjs";
import { requestJira as sendJiraRequest } from "./jiraTransport.mjs";
import { searchAllIssues } from "./jiraSearchHelpers.mjs";
import { getJiraSearchFields } from "./jiraSearchFields.mjs";
import { resolvePresetJql, buildUnionScopeFromJqls } from "./epicFilterJql.mjs";
import { getLocalMetadata } from "./issueMetadataStore.mjs";
import { getTeamMetadata as readTeamMetadata } from "./teamPriorityPostgres.mjs";
import { METADATA_COLUMNS } from "../../shared/issueMetadataFields.mjs";
import { adfToPlainText } from "./jiraCommentText.mjs";

export const EXPORT_PREVIEW_TTL_MS = 15 * 60 * 1000;
export const EXPORT_MAX_BYTES = 25 * 1024 * 1024;
const fail = (message, status = 400) => Object.assign(new Error(message), { status, code: "TASK_EXPORT_INVALID" });
const deadlineMessage = "Export collection deadline reached. Retry or narrow your filters.";
const projectKey = /^[A-Z][A-Z0-9_]*$/;
const issueKey = /^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/;
const positiveLimit = (value, fallback, cap) => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Math.min(Number(value), cap) : fallback;
const metadataDefaults = {
  priority: 0, followUp: null, note: "", requestor: "", openDecisionNote: "", pmOverride: "",
  hasOpenDecision: false, pinnedGantt: false,
  startDate: null, completeDate: null, plannedStart: null, plannedFinish: null,
};
const plainMetadata = (value = {}) => Object.fromEntries(Object.keys(METADATA_COLUMNS).map(field => [field, value[field] ?? metadataDefaults[field]]));

// Optional priorities is a nonempty integer array (0–20); followUp is one scalar "now" or "next". Omit either to include all values.
const validateInput = ({ sites, timezone = "UTC", ...extra }) => {
  if (Object.keys(extra).length) throw fail("Only sites and timezone may be submitted for preview");
  if (!Array.isArray(sites) || !sites.length || sites.length > MAX_JIRA_INSTANCES || new Set(sites.map(s => s?.instanceId)).size !== sites.length) throw fail("Choose one to five distinct saved Jira entries");
  if (typeof timezone !== "string" || timezone.length > 100) throw fail("A valid IANA timezone is required");
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); }
  catch { throw fail("A valid IANA timezone is required"); }
  const selections = sites.map(site => {
    if (!site || Object.keys(site).some(key => !["instanceId", "source", "scope", "includeCompleted", "priorities", "followUp"].includes(key))) throw fail("Unsupported site export option");
    if (typeof site.instanceId !== "string" || !["local", "team"].includes(site.source)) throw fail("Choose a saved entry and Local or Team metadata");
    const scope = site.scope;
    if (!scope || typeof scope !== "object" || Array.isArray(scope) || Object.keys(scope).length !== 1 || !["projectKeys", "presetIds"].includes(Object.keys(scope)[0])) throw fail("Choose exactly one project or saved-preset scope");
    const [type, values] = Object.entries(scope)[0];
    if (!Array.isArray(values) || !values.length || new Set(values).size !== values.length || values.some(value => type === "projectKeys" ? typeof value !== "string" || !projectKey.test(value) : !Number.isSafeInteger(value) || value < 1)) throw fail("Choose valid project keys or saved preset IDs");
    if (site.includeCompleted !== undefined && typeof site.includeCompleted !== "boolean") throw fail("includeCompleted must be a boolean");
    if (site.priorities !== undefined && (!Array.isArray(site.priorities) || !site.priorities.length || site.priorities.length > 21 || site.priorities.some(p => !Number.isInteger(p) || p < 0 || p > 20))) throw fail("Choose priorities from 0 to 20");
    if (site.followUp !== undefined && !["now", "next"].includes(site.followUp)) throw fail("Choose Now or Next");
    return structuredClone({ ...site, includeCompleted: site.includeCompleted ?? false });
  });
  return { sites: selections, timezone };
};

// Each synchronous read copies values before closing; export never migrates or activates a database.
const readLocal = (dataDir, id, read) => {
  let db;
  try {
    db = new Database(appDbPathForInstance(dataDir, id), { readonly: true, fileMustExist: true });
    return read(db);
  } finally { db?.close(); }
};
const readMetadata = (dataDir, id, keys) => readLocal(dataDir, id, db => {
  db.prepare(`SELECT ${Object.values(METADATA_COLUMNS).join(", ")}, keep_note_images FROM issue_metadata LIMIT 0`).all();
  return Object.fromEntries(Object.entries(getLocalMetadata(db, keys)).map(([key, value]) => [key, plainMetadata(value)]));
});
const readSettings = (dataDir, id) => readLocal(dataDir, id, db => ({
  fields: getJiraSearchFields(db),
  presets: db.prepare("SELECT id, epic_key, epic_name, jira_filter_id, jql, preset_type FROM epic_presets ORDER BY sort_order, id").all().map(row => ({ id: row.id, name: row.epic_name, epicKey: row.epic_key, jiraFilterId: row.jira_filter_id, jql: row.jql, presetType: row.preset_type })),
}));

const latestComment = async (key, jiraRequest) => {
  const unavailable = { latestJiraComment: null, jiraCommentStatus: "unavailable" };
  const result = await jiraRequest({ pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(key)}/comment?startAt=0&maxResults=1&orderBy=-created` });
  const data = result.data;
  if (!result.ok || (data?.orderBy !== undefined && data.orderBy !== "-created") || data?.startAt !== 0 || !Number.isSafeInteger(data?.total) || data.total < 0 || !Array.isArray(data.comments) || data.comments.length > 1 || (data.maxResults !== undefined && data.maxResults !== 1)) return unavailable;
  if (data.total === 0 && data.comments.length === 0) return { latestJiraComment: null, jiraCommentStatus: "none" };
  if (data.total === 0 || data.comments.length !== 1 || !data.comments[0] || typeof data.comments[0] !== "object") return unavailable;
  const comment = data.comments[0];
  return { jiraCommentStatus: "available", latestJiraComment: {
    text: adfToPlainText(comment.body),
    author: typeof comment.author?.displayName === "string" && comment.author.displayName.trim() ? comment.author.displayName : null,
    createdAt: typeof comment.created === "string" && comment.created.trim() ? comment.created : null,
  } };
};

export const createTaskExportService = ({ metaDb, dataDir, env = process.env, requestJira = sendJiraRequest, getTeamMetadata = readTeamMetadata, now = Date.now }) => {
  const maxRows = positiveLimit(env.DOCKET_EXPORT_MAX_ROWS_PER_SITE, 5000, 5000);
  const timeoutMs = positiveLimit(env.DOCKET_EXPORT_TIMEOUT_MS, 120000, 600000);
  const previews = new Map();
  let collecting = 0;
  const cleanup = () => { for (const [id, item] of previews) if (item.expiresAtMs <= now()) previews.delete(id); };
  const capture = (id) => {
    const saved = listInstances(metaDb).find(item => item.id === id && item.enabled);
    if (!saved) throw fail("Choose an enabled saved Jira entry");
    const credentials = Object.freeze({ ...getInstanceCredentials(metaDb, id, env) });
    return { instanceId: id, displayName: saved.displayName, siteHost: new URL(credentials.baseUrl).hostname, credentials };
  };
  const collectTaskExport = async ({ signal: userSignal, ...input }) => {
    const options = validateInput(input);
    userSignal?.throwIfAborted();
    const lease = beginInstanceOperations(metaDb, options.sites.map(site => site.instanceId));
    const deadline = new AbortController();
    const signal = userSignal ? AbortSignal.any([userSignal, deadline.signal]) : deadline.signal;
    const deadlineAt = performance.now() + timeoutMs;
    const timer = setTimeout(() => deadline.abort(new DOMException(deadlineMessage, "TimeoutError")), timeoutMs);
    const stopped = () => {
      if (!deadline.signal.aborted && performance.now() >= deadlineAt) deadline.abort(new DOMException(deadlineMessage, "TimeoutError"));
      return signal.aborted;
    };
    const snapshot = { exportedAt: new Date(now()).toISOString(), timezone: options.timezone, commentScope: "Latest Jira comment only", sites: [] };
    try {
      const captured = options.sites.map(selection => ({ selection, ...capture(selection.instanceId) }));
      for (const { selection, credentials, ...identity } of captured) {
        userSignal?.throwIfAborted();
        const site = { ...identity, ...selection, status: "failed", rows: [], searchLimit: maxRows, searchedCount: 0, rowCount: 0, teamNotesSelected: selection.source === "team" };
        snapshot.sites.push(site);
        if (stopped()) { site.message = deadlineMessage; continue; }
        let phase = "settings";
        try {
          if (!credentials.email || !credentials.apiToken) throw fail("Set the saved entry email and server Jira token before export");
          const jiraRequest = async request => {
            if (stopped()) signal.throwIfAborted();
            const result = await requestJira({ ...request, credentials, signal, timeoutMs: env.JIRA_REQUEST_TIMEOUT_MS });
            if (stopped()) signal.throwIfAborted();
            return result;
          };
          let settings;
          try { settings = readSettings(dataDir, identity.instanceId); }
          catch {
            if (selection.source === "local" || selection.scope.presetIds) throw fail("Saved entry schema unavailable. Open and migrate this entry before export.");
            // Team/project scope can use Jira built-ins, but missing saved mappings cannot be inferred.
            settings = { fields: ["summary", "status", "assignee", "duedate"], presets: [] };
          }
          phase = "scope";
          let scope;
          if (selection.scope.projectKeys) scope = `project in (${selection.scope.projectKeys.join(", ")})`;
          else {
            const jqls = [];
            for (const id of selection.scope.presetIds) {
              if (stopped()) signal.throwIfAborted();
              const preset = settings.presets.find(item => item.id === id);
              if (!preset) throw fail("Selected saved preset is unavailable for this entry");
              const jql = await resolvePresetJql({ preset, jiraRequest });
              if (!jql) throw fail("Selected saved preset has no usable scope");
              jqls.push(jql);
            }
            scope = buildUnionScopeFromJqls(jqls);
            if (!scope) throw fail("Selected saved preset has no usable scope");
          }
          phase = "search";
          const search = await searchAllIssues({ jql: `(${scope})${selection.includeCompleted ? "" : " AND statusCategory != Done"} ORDER BY key ASC`, maxTotal: maxRows, signal,
            runJiraSearchRequest: (jql, paging) => jiraRequest({ method: "POST", pathWithQuery: "/rest/api/3/search/jql", body: { jql, ...paging, fields: settings.fields } }),
          });
          userSignal?.throwIfAborted();
          const seen = new Set();
          const issues = search.issues.filter(issue => {
            if (!issueKey.test(issue?.key)) throw fail("Jira search returned an invalid issue key");
            if (seen.has(issue.key)) return false;
            seen.add(issue.key); return true;
          });
          site.searchedCount = search.loaded;
          if (stopped()) { site.message = `${deadlineMessage} Deadline occurred before selected-source metadata could be read; search hits are provisional.`; continue; }
          phase = selection.source;
          const keys = issues.map(issue => issue.key);
          const metadata = selection.source === "local" ? readMetadata(dataDir, identity.instanceId, keys) : structuredClone(await getTeamMetadata({ siteHost: identity.siteHost, issueKeys: keys }));
          userSignal?.throwIfAborted();
          const filtered = issues.filter(issue => {
            const value = plainMetadata(metadata[issue.key]);
            return (!selection.priorities || selection.priorities.includes(value.priority)) && (!selection.followUp || selection.followUp === value.followUp);
          });
          let local = selection.source === "local" ? metadata : {};
          let localNoteStatus = "available";
          if (selection.source === "team") {
            if (stopped()) localNoteStatus = "unavailable";
            else {
              try { local = readMetadata(dataDir, identity.instanceId, filtered.map(issue => issue.key)); }
              catch { localNoteStatus = "unavailable"; }
            }
          }
          site.rows = filtered.map(issue => ({
            issueKey: issue.key, summary: typeof issue.fields?.summary === "string" ? issue.fields.summary : "",
            status: typeof issue.fields?.status?.name === "string" ? issue.fields.status.name : "",
            assignee: typeof issue.fields?.assignee?.displayName === "string" ? issue.fields.assignee.displayName : "",
            jiraDueDate: typeof issue.fields?.duedate === "string" ? issue.fields.duedate : "",
            jiraUrl: `${credentials.baseUrl}/browse/${encodeURIComponent(issue.key)}`,
            ...plainMetadata(metadata[issue.key]),
            localNote: localNoteStatus === "available" ? local[issue.key]?.note ?? "" : null,
            localNoteStatus, teamNote: selection.source === "team" ? metadata[issue.key]?.note ?? "" : "",
            latestJiraComment: null, jiraCommentStatus: "unavailable",
          }));
          site.rowCount = site.rows.length;
          site.status = !search.isComplete || localNoteStatus === "unavailable" ? "partial" : "complete";
          const messages = [];
          if (!search.isComplete) messages.push(search.completeness === "limit" ? `Jira search reached the ${maxRows}-row limit; completeness is unverified.` : "Jira search pagination is incomplete.");
          if (localNoteStatus === "unavailable") messages.push("Docket local notes unavailable; selected Team metadata was retained.");
          phase = "comments";
          for (const row of site.rows) {
            userSignal?.throwIfAborted();
            if (stopped()) break;
            try { Object.assign(row, await latestComment(row.issueKey, jiraRequest)); }
            catch (error) {
              userSignal?.throwIfAborted();
              if (stopped()) break;
              // A comment read failure retains the task with an explicit unavailable status.
              if (!(error instanceof Error)) throw error;
            }
          }
          if (site.rows.some(row => row.jiraCommentStatus === "unavailable")) { site.status = "partial"; messages.push("Latest Jira comment unavailable for one or more tasks."); }
          if (stopped()) { site.status = "partial"; messages.push(deadlineMessage); }
          if (messages.length) site.message = messages.join(" ");
        } catch (error) {
          userSignal?.throwIfAborted();
          site.status = site.rows.length ? "partial" : "failed";
          if (stopped()) site.message = deadlineMessage;
          else if (error.code === "TASK_EXPORT_INVALID") site.message = error.message;
          else if (phase === "team") site.message = "Team metadata unavailable; no local fallback was used.";
          else if (phase === "local" || phase === "settings") site.message = "Local saved-entry schema unavailable. Open and migrate this entry before export.";
          else site.message = "Jira scope or search unavailable for this saved entry. Retry the preview.";
        }
      }
      userSignal?.throwIfAborted();
      return snapshot;
    } finally { clearTimeout(timer); lease.release(); }
  };

  const getExportScopes = async (instanceId, { signal: userSignal } = {}) => {
    const lease = beginInstanceOperations(metaDb, [instanceId]);
    const deadline = new AbortController();
    const signal = userSignal ? AbortSignal.any([userSignal, deadline.signal]) : deadline.signal;
    const deadlineAt = performance.now() + timeoutMs;
    const timer = setTimeout(() => deadline.abort(new DOMException(deadlineMessage, "TimeoutError")), timeoutMs);
    const stopped = () => {
      if (!deadline.signal.aborted && performance.now() >= deadlineAt) deadline.abort(new DOMException(deadlineMessage, "TimeoutError"));
      return signal.aborted;
    };
    try {
      const { credentials, ...identity } = capture(instanceId);
      const settings = readSettings(dataDir, instanceId);
      const projects = [];
      let complete = false;
      while (projects.length < 5000) {
        if (stopped()) signal.throwIfAborted();
        const response = await requestJira({ credentials, signal, timeoutMs: env.JIRA_REQUEST_TIMEOUT_MS, pathWithQuery: `/rest/api/3/project/search?startAt=${projects.length}&maxResults=100` });
        if (stopped()) signal.throwIfAborted();
        if (!response.ok || !Array.isArray(response.data?.values)) throw fail("Jira project choices unavailable. Retry the scope request.", 502);
        const batch = response.data.values;
        if (batch.some(p => !projectKey.test(p?.key))) throw fail("Jira returned invalid project choices", 502);
        projects.push(...batch.slice(0, 5000 - projects.length).map(p => ({ key: p.key, name: typeof p.name === "string" ? p.name : p.key })));
        const total = response.data.total;
        const hasTotal = Number.isSafeInteger(total) && total >= 0;
        if (response.data.isLast === true || (hasTotal && projects.length >= total && response.data.isLast !== false)) {
          complete = !hasTotal || projects.length >= total;
          break;
        }
        if (!batch.length) break;
      }
      return { ...identity, projects, projectsComplete: complete, presets: settings.presets.map(p => ({ id: p.id, name: p.name })) };
    } catch (error) {
      userSignal?.throwIfAborted();
      if (stopped()) throw fail(deadlineMessage, 504);
      if (error.code === "TASK_EXPORT_INVALID") throw error;
      throw fail("Saved scope choices unavailable. Open and migrate this saved entry before export.", 503);
    } finally { clearTimeout(timer); lease.release(); }
  };
  const createPreview = async options => {
    cleanup();
    if (previews.size + collecting >= 3) throw fail("Three export previews are awaiting review. Wait 15 minutes or use an existing preview.", 429);
    collecting += 1;
    try {
      const snapshot = await collectTaskExport(options);
      options.signal?.throwIfAborted();
      const serialized = JSON.stringify(snapshot);
      const bytes = Buffer.byteLength(serialized);
      cleanup();
      if (bytes + [...previews.values()].reduce((sum, item) => sum + item.bytes, 0) > EXPORT_MAX_BYTES) throw fail("Export previews exceed 25 MiB. Narrow your filters and preview again; rows were not dropped.", 413);
      const expiresAtMs = now() + EXPORT_PREVIEW_TTL_MS;
      const preview = { previewId: randomUUID(), snapshot: JSON.parse(serialized), expiresAt: new Date(expiresAtMs).toISOString() };
      previews.set(preview.previewId, { ...preview, bytes, expiresAtMs });
      return structuredClone(preview);
    } finally { collecting -= 1; }
  };
  const getPreview = previewId => {
    cleanup();
    const preview = previews.get(previewId);
    if (!preview) throw fail("Export preview expired or unavailable. Preview again.", 409);
    return structuredClone({ previewId, snapshot: preview.snapshot, expiresAt: preview.expiresAt });
  };
  return { collectTaskExport, getExportScopes, createPreview, getPreview };
};
