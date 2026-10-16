import { getSiteContext, setSiteContext, isSiteSwitching, setSiteSwitching } from "../utils/siteContextStore.js";
import { runBackgroundJob, waitForSiteSaves } from "../utils/backgroundJobStore.js";
import { buildApiUrl } from "./apiBase.js";
import { getLocalTimestampPayload } from "../utils/localTimestamp.js";
import { getPreferredAiPath } from "./aiPathPreference.js";
import { filterWorkfrontErrorMessages } from "../../shared/jiraErrorUtils.mjs";
import {
  buildSharedProgramJql,
  buildSharedProgramJqlWithDescendants,
} from "../utils/workWeekStorage.js";

const formatErrorDetail = ( value ) => {
  if ( value == null || value === "" )
  {
    return "";
  }
  if ( typeof value === "string" )
  {
    return value.trim();
  }
  if ( typeof value === "number" || typeof value === "boolean" )
  {
    return String( value );
  }
  try
  {
    return JSON.stringify( value );
  } catch
  {
    return String( value );
  }
};

const extractJiraErrorMessage = ( data, status ) => {
  if ( data?.code === "JIRA_TIMEOUT" )
  {
    return data.outcome === "unknown"
      ? "Jira timed out. Keep your edits. The change may have succeeded in Jira; check Jira before submitting again."
      : "Jira timed out. Keep your edits and try the read again when Jira is available.";
  }
  if ( Array.isArray( data?.errorMessages ) && data.errorMessages.length > 0 )
  {
    const messages = filterWorkfrontErrorMessages( data.errorMessages );
    if ( messages.length > 0 )
    {
      return messages.map( ( item ) => formatErrorDetail( item ) ).filter( Boolean ).join( " " );
    }
  }

  if ( Array.isArray( data?.errors ) && data.errors.length > 0 )
  {
    return data.errors.map( ( item ) => formatErrorDetail( item ) ).filter( Boolean ).join( " " );
  }

  const errorDetail = formatErrorDetail( data?.error );
  if ( errorDetail )
  {
    return errorDetail;
  }

  const messageDetail = formatErrorDetail( data?.message );
  if ( messageDetail )
  {
    return messageDetail;
  }

  return `Jira request failed with status ${ status }`;
};

let teamHealth = null;
let teamSettingsRevision = 0;
const teamHealthListeners = new Set();
export const getTeamPriorityHealthSnapshot = () => teamHealth;
export const subscribeTeamPriorityHealth = (listener) => {
  teamHealthListeners.add(listener);
  return () => teamHealthListeners.delete(listener);
};
const publishTeamHealth = (health) => {
  teamHealth = health;
  teamHealthListeners.forEach(listener => listener());
};
export const assertTeamPriorityEnabled = () => {
  if (teamHealth?.enabled === false) throw Object.assign(new Error("Team database is disabled. Enable Use team DB in Settings."), { status: 403, code: "TEAM_DATABASE_DISABLED" });
};

let initializingSite;
export const initializeSiteContext = async () => {
  if ( getSiteContext() ) return getSiteContext();
  initializingSite ??= requestJsonNow( "/api/health" ).then( ( data ) => {
    if ( !data.siteContext ) throw new Error( "Restart the local API to initialize the Jira site context." );
    setSiteContext( data.siteContext );
    return data.siteContext;
  } ).finally( () => { initializingSite = null; } );
  return initializingSite;
};

const siteHeaders = ( context ) => context?.kind === "combined-work" ? {
  "X-Docket-Report-Scope": "combined-work",
} : context?.kind === "saved-site" ? {
  "X-Docket-Saved-Site": context.instanceId,
  "X-Docket-Saved-Revision": context.revision,
} : context ? {
  "X-Docket-Site": context.instanceId || "legacy",
  "X-Docket-Generation": context.generation,
} : {};

const requestJson = async ( path, options = {} ) => {
  if ( path === "/api/health" || /^\/api\/todos(?:[/?]|$)/.test( path ) ) return requestJsonNow( path, options );
  const context = options.siteContext || await initializeSiteContext();
  const method = options.method || "GET";
  const registryMutation = path.startsWith( "/api/jira/instances" ) && method !== "GET" && !path.endsWith( "/test" );
  if ( registryMutation ) {
    if ( path.endsWith( "/activate" ) && typeof window !== "undefined" &&
      window.dispatchEvent( new Event( "docket:before-site-change", { cancelable: true } ) ) === false ) {
      throw new Error( "Site change cancelled. Combined Work drafts are still open." );
    }
    if ( isSiteSwitching() ) throw new Error( "A Jira site change is already in progress." );
    setSiteSwitching( true );
    try {
      await waitForSiteSaves( context.instanceId );
      const data = await requestJsonNow( path, { ...options, siteContext: context } );
      if ( data.siteContext ) setSiteContext( data.siteContext );
      return data;
    } finally {
      setSiteSwitching( false );
    }
  }
  const run = () => requestJsonNow( path, { ...options, siteContext: context } );
  const isSave = ["PUT", "PATCH", "DELETE"].includes( method ) || ( method === "POST" && path !== "/api/jira/issue-metadata/import/preview" && !/\/(search|resolve-bulk|bulk|parent-candidates|generate-description|generate|refresh|project|gantt-summary|week|test|scope-jql|run)(\/all)?$/.test( path ) );
  return isSave ? runBackgroundJob( `site-save:${method}:${path}`, {
    instanceId: context.instanceId, siteContext: context, siteSave: true, queue: true, label: "Saving Jira changes", run,
  } ) : run();
};

const requestJsonNow = async ( path, options = {} ) => {
  if ((path.startsWith("/api/team-priority/") && !["/api/team-priority/health", "/api/team-priority/settings"].includes(path)) || path === "/api/shared-programs") assertTeamPriorityEnabled();
  const { timeoutMs, siteContext, ...fetchOptions } = options;
  let response;
  try
  {
    response = await fetch( buildApiUrl( path ), {
      ...fetchOptions,
      headers: {
        ...siteHeaders( siteContext ),
        Accept: "application/json",
        ...( fetchOptions.headers || {} ),
      },
      ...( timeoutMs ? { signal: AbortSignal.timeout( timeoutMs ) } : {} ),
    } );
  } catch ( error )
  {
    if ( fetchOptions.signal?.aborted ) throw error;
    if ( error?.name === "TimeoutError" || error?.name === "AbortError" )
    {
      throw new Error(
        `The request did not finish within ${ Math.round( timeoutMs / 1000 ) }s. Try again.`
      );
    }
    if ( error instanceof TypeError )
    {
      throw new Error(
        "Cannot reach the local API. Start it with npm run dev:api or npm run dev:all (proxy on port 8787)."
      );
    }
    throw error;
  }

  const text = await response.text();
  let data = {};
  let parsedJson = false;

  if ( text )
  {
    try
    {
      data = JSON.parse( text );
      parsedJson = true;
    } catch
    {
      data = { message: text };
    }
  }

  if ( !response.ok )
  {
    const error = new Error( extractJiraErrorMessage( data, response.status ) );
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }

  // SPA/static fallbacks sometimes return index.html with HTTP 200 for unknown API routes.
  if ( !parsedJson || ( typeof data === "object" && data && typeof data.message === "string" && /^\s*</.test( data.message ) ) )
  {
    throw new Error(
      `API returned a non-JSON response for ${ path }. Restart the local API (npm run dev:api or npm run dev:all) so new routes are loaded.`
    );
  }

  return data;
};

export const fetchJiraMyself = async ( { siteContext } = {} ) => requestJson( "/api/jira/myself", { siteContext } );

export const fetchJiraHealth = async () => requestJson( "/api/health" );

export const testJiraConnection = async () => fetchJiraMyself();

export const fetchCombinedOpenWork = ( instanceIds, { signal } = {} ) =>
  requestJsonNow( "/api/combined-open-work", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify( { instanceIds } ),
    signal,
  } );

export const fetchJiraInstances = async () => requestJson( "/api/jira/instances" );

export const createJiraInstance = async ( body ) =>
  requestJson( "/api/jira/instances", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( body ),
  } );

export const updateJiraInstance = async ( id, body ) =>
  requestJson( `/api/jira/instances/${ encodeURIComponent( id ) }`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( body ),
  } );

export const deleteJiraInstance = async ( id ) =>
  requestJson( `/api/jira/instances/${ encodeURIComponent( id ) }`, { method: "DELETE" } );

export const activateJiraInstance = async ( id ) =>
  requestJson( `/api/jira/instances/${ encodeURIComponent( id ) }/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: "{}",
  } );

// Connection tests send site settings only; the API supplies JIRA_API_TOKEN.
export const testJiraInstance = async ( id, { baseUrl, email } = {} ) =>
  requestJson( `/api/jira/instances/${ encodeURIComponent( id ) }/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { baseUrl, email } ),
  } );

// Send JQL as POST JSON body to avoid URL-encoding edge cases.
export const fetchJiraSearch = async ( { jql, maxResults = 5, siteContext, signal } ) => {
  return requestJson( "/api/jira/search", {
    siteContext, signal,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { jql, maxResults } ),
  } );
};

export const fetchJiraSearchAll = async ( { jql, maxTotal = 200, siteContext, signal } ) => {
  return requestJson( "/api/jira/search/all", {
    siteContext, signal,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { jql, maxTotal } ),
  } );
};

// Resolve direct children first so generated JQL also includes their subtasks.
// Fall back to the direct-child query if Jira cannot resolve descendants.
export const resolveSharedProgramJql = async ( epicRoots ) => {
  const baseJql = buildSharedProgramJql( epicRoots );
  if ( !baseJql )
  {
    return "";
  }

  try
  {
    const data = await fetchJiraSearchAll( { jql: baseJql, maxTotal: 1000 } );
    const childKeys = ( data?.issues || [] )
      .map( ( issue ) => String( issue.key || "" ).trim() )
      .filter( Boolean );
    return buildSharedProgramJqlWithDescendants( epicRoots, childKeys ) || baseJql;
  } catch ( error )
  {
    console.error( "Failed to resolve shared program descendants", error );
    return baseJql;
  }
};

export const pushJiraIssueNote = async ( { issueKey, note, images = [] }, { siteContext } = {} ) => {
  const path = `/api/jira/issues/${ encodeURIComponent( issueKey ) }/comment`;

  if ( images.length === 0 )
  {
    return requestJson( path, {
      siteContext,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify( { note } ),
    } );
  }

  const formData = new FormData();
  formData.append( "note", note || "" );
  images.forEach( ( image ) => formData.append( "images", image.file, image.filename ) );

  // Omit Content-Type so the browser sets the multipart boundary itself.
  return requestJson( path, {
    siteContext,
    method: "POST",
    body: formData,
  } );
};

export const saveKeptNoteImages = async ( { issueKey, images = [] }, { siteContext } = {} ) => {
  const formData = new FormData();
  images.forEach( ( image ) => formData.append( "images", image.file, image.filename ) );

  return requestJson( `/api/jira/issue-metadata/${ encodeURIComponent( issueKey ) }/images`, {
    siteContext,
    method: "POST",
    body: formData,
  } );
};

export const deleteKeptNoteImages = async ( issueKey, { siteContext } = {} ) => {
  return requestJson( `/api/jira/issue-metadata/${ encodeURIComponent( issueKey ) }/images`, {
    siteContext,
    method: "DELETE",
  } );
};

export const fetchKeptNoteImageBlob = async ( issueKey, imageId, { siteContext } = {} ) => {
  const response = await fetch(
    buildApiUrl( `/api/jira/issue-metadata/${ encodeURIComponent( issueKey ) }/images/${ encodeURIComponent( imageId ) }` ),
    { headers: siteHeaders( siteContext || await initializeSiteContext() ) }
  );
  if ( !response.ok )
  {
    throw new Error( `Failed to load kept image ${ imageId } for ${ issueKey }` );
  }
  return response.blob();
};

export const updateJiraIssueStatus = async ( { issueKey, targetStatus }, { siteContext } = {} ) => {
  return requestJson( `/api/jira/issues/${ encodeURIComponent( issueKey ) }/status`, {
    siteContext,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { targetStatus } ),
  } );
};

export const JIRA_UNASSIGNED_ASSIGNEE = "__unassigned__";

export const isJiraUnassignValue = ( value ) => {
  const normalized = String( value || "" ).trim().toLowerCase();
  return normalized === "unassigned" || normalized === JIRA_UNASSIGNED_ASSIGNEE;
};

export const updateJiraIssueAssignee = async ( { issueKey, assignee }, { siteContext } = {} ) => {
  return requestJson( `/api/jira/issues/${ encodeURIComponent( issueKey ) }/assignee`, {
    siteContext,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { assignee } ),
  } );
};

export const searchJiraUsers = async ( query, { siteContext } = {} ) => {
  const data = await requestJson(
    `/api/jira/users/search?query=${ encodeURIComponent( String( query || "" ).trim() ) }`, { siteContext } );
  return data?.items || [];
};

export const resolveJiraUsersByAccountIds = async ( accountIds, { siteContext } = {} ) => {
  const data = await requestJson( "/api/jira/users/resolve-bulk", {
    siteContext,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { accountIds } ),
  } );
  return data?.items || {};
};

export const fetchIssueMetadataBulk = async ( issueKeys, { siteContext, signal } = {} ) => {
  const data = await requestJson( "/api/jira/issue-metadata/bulk", {
    siteContext, signal,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { issueKeys } ),
  } );

  return data?.items || {};
};

export const fetchRecentlyNotedIssueKeys = async ( since, { siteContext, signal } = {} ) => {
  const data = await requestJson( `/api/jira/issue-metadata/recent-notes?since=${ encodeURIComponent( since ) }`, { siteContext, signal } );
  return Array.isArray( data?.issueKeys ) ? data.issueKeys : [];
};

export const fetchLatestJiraCommentsBulk = async ( issueKeys, { siteContext, signal, includeCoverage = false } = {} ) => {
  const data = await requestJson( "/api/jira/issues/comments/latest/bulk", {
    siteContext, signal,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { issueKeys } ),
  } );

  return includeCoverage ? { items: data?.items || {}, errors: data?.errors || {} } : data?.items || {};
};

const PLANNING_FIELDS = [ "followUp", "hasOpenDecision", "plannedStart", "plannedFinish", "pmOverride", "requestor", "openDecisionNote" ];

export const saveIssueMetadata = async ( { issueKey, note, priority, startDate, completeDate, ...planningFields }, { siteContext } = {} ) => {
  const body = {};
  if ( typeof note === "string" ) body.note = note;
  if ( priority !== undefined ) body.priority = priority;
  if ( typeof startDate === "string" ) body.startDate = startDate;
  if ( typeof completeDate === "string" ) body.completeDate = completeDate;
  for ( const f of PLANNING_FIELDS )
  {
    if ( planningFields[ f ] !== undefined ) body[ f ] = planningFields[ f ];
  }

  return requestJson( `/api/jira/issue-metadata/${ encodeURIComponent( issueKey ) }`, {
    siteContext,
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( body ),
  } );
};

// role: "due_date" | "most_recent_done_date". value: "YYYY-MM-DD" or "" to clear.
export const updateJiraIssueDateField = async ( { issueKey, role, value }, { siteContext } = {} ) => {
  return requestJson( `/api/jira/issues/${ encodeURIComponent( issueKey ) }/date-field`, {
    siteContext,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { role, value } ),
  } );
};

export const previewIssueMetadataImport = ( payload, { siteContext } = {} ) =>
  requestJson( "/api/jira/issue-metadata/import/preview", {
    siteContext,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify( payload ),
  } );

export const commitIssueMetadataImport = ( previewId, { siteContext } = {} ) =>
  requestJson( "/api/jira/issue-metadata/import/commit", {
    siteContext,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify( { previewId } ),
  } );

export const fetchTeamPriorityHealth = async ( { siteContext, signal } = {} ) => {
  const revision = teamSettingsRevision;
  try {
    const health = await requestJson( "/api/team-priority/health", { siteContext, signal } );
    if (revision === teamSettingsRevision) publishTeamHealth(health);
    return revision === teamSettingsRevision ? health : teamHealth;
  } catch (error) {
    if (revision === teamSettingsRevision) publishTeamHealth(null);
    throw error;
  }
};

export const saveTeamPrioritySettings = async ( { enabled } ) => {
  const result = await requestJson("/api/team-priority/settings", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }),
  });
  teamSettingsRevision += 1;
  publishTeamHealth({ ...teamHealth, enabled: result.enabled, connected: false, ok: false });
  return result;
};

export const seedTeamPriorityPrograms = async () => {
  return requestJson( "/api/team-priority/seed", { method: "POST" } );
};

export const syncLocalPrioritiesToTeam = async () => {
  const data = await requestJson( "/api/team-priority/sync-local", { method: "POST" } );
  if ( !data || data.ok !== true || typeof data.updatedPriorities !== "number" )
  {
    throw new Error( "Local → team priority sync failed or returned an incomplete response." );
  }
  return data;
};

export const pullTeamPrioritiesToLocal = async () => {
  const data = await requestJson( "/api/team-priority/pull-to-local", { method: "POST" } );
  if ( !data || data.ok !== true || typeof data.updatedPriorities !== "number" )
  {
    throw new Error( "team → local priority pull failed or returned an incomplete response." );
  }
  return data;
};

export const fetchSharedPrograms = async ( { siteContext } = {} ) => {
  const health = teamHealth || await fetchTeamPriorityHealth({ siteContext });
  if (health?.enabled !== true) return [];
  const data = await requestJson( "/api/shared-programs", { siteContext } );
  return data?.items || [];
};

export const fetchTeamMetadataBulk = async ( issueKeys, { siteContext, signal } = {} ) => {
  const data = await requestJson( "/api/team-priority/metadata/bulk", {
    siteContext, signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify( { issueKeys } ),
  } );
  return data?.items || {};
};

export const fetchTeamPriorityBulk = async ( issueKeys, { siteContext } = {} ) => {
  const data = await requestJson( "/api/team-priority/bulk", {
    siteContext,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { issueKeys } ),
  } );
  return data?.items || {};
};

export const saveTeamPriority = async ( { issueKey, priority }, { siteContext } = {} ) => {
  return requestJson( `/api/team-priority/${ encodeURIComponent( issueKey ) }`, {
    siteContext,
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { priority } ),
  } );
};

export const fetchTeamDatesBulk = async ( issueKeys, { siteContext } = {} ) => {
  const data = await requestJson( "/api/team-priority/dates/bulk", {
    siteContext,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { issueKeys } ),
  } );
  return data?.items || {};
};

export const saveTeamDate = async ( { issueKey, startDate, completeDate, ...planningFields }, { siteContext } = {} ) => {
  const body = {};
  if ( typeof startDate === "string" ) body.startDate = startDate;
  if ( typeof completeDate === "string" ) body.completeDate = completeDate;
  for ( const f of PLANNING_FIELDS )
  {
    if ( planningFields[ f ] !== undefined ) body[ f ] = planningFields[ f ];
  }

  return requestJson( `/api/team-priority/dates/${ encodeURIComponent( issueKey ) }`, {
    siteContext,
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( body ),
  } );
};

// Explicit, deliberate clear of the shared dates and planning values for an issue.
export const deleteTeamDate = async ( issueKey, { siteContext } = {} ) => {
  return requestJson( `/api/team-priority/dates/${ encodeURIComponent( issueKey ) }`, {
    siteContext,
    method: "DELETE",
  } );
};

export const fetchEpicPresets = async () => {
  const data = await requestJson( "/api/epic-presets" );
  return data?.items || [];
};

export const fetchEpicPresetScopeJql = async ( epicPresetId, { siteContext } = {} ) => {
  const id = String( epicPresetId || "" ).trim();
  if ( !id )
  {
    return "";
  }
  const data = await requestJson( `/api/epic-presets/${ encodeURIComponent( id ) }/scope-jql`, { siteContext } );
  return String( data?.scopeJql || "" ).trim();
};

export const createEpicPreset = async ( payload ) => {
  return requestJson( "/api/epic-presets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( payload || {} ),
  } );
};

export const updateEpicPreset = async ( id, payload ) => {
  return requestJson( `/api/epic-presets/${ encodeURIComponent( id ) }`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( payload || {} ),
  } );
};

export const deleteEpicPreset = async ( id ) => {
  return requestJson( `/api/epic-presets/${ encodeURIComponent( id ) }`, {
    method: "DELETE",
  } );
};

export const exportEpicPresetsPack = async () => requestJson( "/api/epic-presets/export" );

export const importEpicPresetsPack = async ( { presets, mode = "merge" } ) =>
  requestJson( "/api/epic-presets/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { presets, mode } ),
  } );

export const runEpicFilters = async ( { epicPresetIds, includePastDue, maxResults = 200 } ) => {
  const data = await requestJson( "/api/epic-filters/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { epicPresetIds, includePastDue, maxResults } ),
  } );

  return data?.runs || [];
};

export const fetchFieldMappings = async ( { siteContext, signal } = {} ) => {
  const data = await requestJson( "/api/jira/field-mappings", { siteContext, signal } );
  return data?.items || [];
};

export const saveFieldMappings = async ( mappings ) => {
  const data = await requestJson( "/api/jira/field-mappings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { mappings } ),
  } );

  return data?.items || [];
};

export const syncFieldMappingsFromJira = async () => {
  const data = await requestJson( "/api/jira/field-mappings/sync", {
    method: "POST",
  } );

  return data?.items || [];
};

export const fetchJiraFields = async () => {
  const data = await requestJson( "/api/jira/fields" );
  return data?.items || [];
};

export const fetchAppSettings = async ( { siteContext } = {} ) => {
  const data = await requestJson( "/api/settings", { siteContext } );
  return data?.settings || {};
};

export const saveAppSettings = async ( settings, { siteContext } = {} ) => {
  const data = await requestJson( "/api/settings", {
    siteContext,
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { settings: settings || {} } ),
  } );

  return data?.settings || {};
};

export const fetchReminders = async () => {
  const data = await requestJson( "/api/reminders" );
  return data?.items || [];
};

export const saveReminders = async ( reminders, { siteContext } = {} ) => {
  const data = await requestJson( "/api/reminders", {
    siteContext,
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { reminders: reminders || [] } ),
  } );

  return data?.items || [];
};

export const fetchTodos = async () => {
  const data = await requestJson( "/api/todos" );
  return { items: data?.items || [], migration: data?.migration };
};

export const fetchCompletedTodos = async ( days = 90 ) => {
  const param = Number( days ) >= 0 ? Number( days ) : 90;
  const data = await requestJson( `/api/todos/completed?days=${ param }` );
  return { items: data?.items || [], days: data?.days ?? param, migration: data?.migration };
};

export const clearCompletedTodos = async () =>
  requestJson( "/api/todos/completed", { method: "DELETE" } );

export const createTodo = async ( { clientId, text, priority, dueDate } ) => {
  const data = await requestJson( "/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify( { clientId, text, priority, dueDate } ),
  } );
  return data;
};

export const updateTodo = async ( id, fields ) => {
  const data = await requestJson( `/api/todos/${ id }`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify( fields ),
  } );
  return data;
};

export const deleteTodo = async ( id ) => {
  try {
    await requestJson( `/api/todos/${ id }`, { method: "DELETE" } );
  } catch ( error ) {
    if ( error.status !== 404 ) throw error;
  }
};

export const fetchWatchedAssignees = async () => {
  const data = await requestJson( "/api/watched-assignees" );
  return data?.items || [];
};

export const createWatchedAssignee = async ( payload ) => {
  return requestJson( "/api/watched-assignees", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( payload || {} ),
  } );
};

export const updateWatchedAssignee = async ( id, payload ) => {
  return requestJson( `/api/watched-assignees/${ encodeURIComponent( id ) }`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( payload || {} ),
  } );
};

export const deleteWatchedAssignee = async ( id ) => {
  return requestJson( `/api/watched-assignees/${ encodeURIComponent( id ) }`, {
    method: "DELETE",
  } );
};

export const fetchDashboardMetrics = async () => {
  const data = await requestJson( "/api/dashboard/metrics" );
  return data?.snapshot || null;
};

export const fetchJiraFilters = async () => {
  const data = await requestJson( "/api/jira/filters" );
  return Array.isArray( data ) ? data : [];
};

/** @deprecated Prefer fetchJiraFilters — same owned + shared list via filter/search. */
export const fetchFavouriteJiraFilters = async () => fetchJiraFilters();

export const refreshDashboardMetrics = async ( payload, options = {} ) => {
  const data = await requestJson( "/api/dashboard/refresh", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( payload || {} ),
    signal: options.signal,
  } );

  return data?.snapshot || null;
};

export const generateReport = async ( {
  audience,
  epicPresetIds,
  additionalContext,
  statusCounts,
  chartVariant,
} ) => {
  const aiPath = getPreferredAiPath();
  return requestJson( "/api/report/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( {
      audience,
      epicPresetIds,
      additionalContext,
      statusCounts,
      chartVariant,
      ...( aiPath ? { aiPath } : {} ),
      ...getLocalTimestampPayload(),
    } ),
  } );
};

export const fetchWeeklyDigest = async () => requestJson( "/api/reports/weekly-digest" );

export const fetchChatStatus = async () => {
  const aiPath = getPreferredAiPath();
  const path = aiPath ? `/api/chat/status?aiPath=${ encodeURIComponent( aiPath ) }` : "/api/chat/status";
  return requestJson( path );
};

export const generateGanttSharepointSummary = async ( payload ) => {
  return requestJson( "/api/report/gantt-summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify( payload ),
  } );
};

export const startChatOAuth = async () => {
  const data = await requestJson( "/api/chat/auth/start?format=json" );
  return String( data?.authorizeUrl || "" ).trim();
};

export const signOutChat = async () => {
  return requestJson( "/api/chat/auth/signout", {
    method: "POST",
  } );
};

export const sendChatMessage = async ( { message, epicContext } ) => {
  const aiPath = getPreferredAiPath();
  return requestJson( "/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { message, epicContext, ...( aiPath ? { aiPath } : {} ) } ),
  } );
};

export const fetchJiraProjects = async () => {
  const data = await requestJson( "/api/jira/projects" );
  return data?.items || [];
};

export const fetchJiraCreateMeta = async ( projectKey ) => {
  return requestJson( `/api/jira/projects/${ encodeURIComponent( projectKey ) }/createmeta` );
};

export const fetchJiraCreateFieldOptions = async (
  projectKey,
  issueType = "Story",
  { parentRole = "", isSubtask = false } = {}
) => {
  const params = new URLSearchParams( {
    issueType: String( issueType || "Story" ).trim() || "Story",
  } );
  const role = String( parentRole || "" ).trim();
  if ( role )
  {
    params.set( "parentRole", role );
  }
  if ( isSubtask )
  {
    params.set( "isSubtask", "true" );
  }
  return requestJson(
    `/api/jira/projects/${ encodeURIComponent( projectKey ) }/create-field-options?${ params.toString() }`
  );
};

export const fetchJiraIssueSummary = async ( issueKey, { siteContext } = {} ) => {
  return requestJson( `/api/jira/issues/${ encodeURIComponent( String( issueKey || "" ).trim() ) }/summary`, { siteContext } );
};

export const fetchEpicParentOptions = async ( epicKey, { siteContext } = {} ) => {
  return requestJson( `/api/jira/epics/${ encodeURIComponent( String( epicKey || "" ).trim() ) }/parent-options`, { siteContext } );
};

export const fetchEpicWorkload = async ( epicKey ) => {
  return requestJson( `/api/jira/epics/${ encodeURIComponent( String( epicKey || "" ).trim() ) }/workload` );
};

// omitted/null selectedIds = all entries; [] = none (do not fetch).
export const fetchCapacityPlanning = async ( selectedIds ) => {
  if ( Array.isArray( selectedIds ) && selectedIds.length === 0 )
  {
    return [];
  }
  const idList = Array.isArray( selectedIds ) ? selectedIds.filter( ( id ) => id !== null && id !== undefined ) : null;
  const query = idList && idList.length > 0 ? `?ids=${ idList.map( ( id ) => encodeURIComponent( id ) ).join( "," ) }` : "";
  const data = await requestJson( `/api/project-managers/capacity${ query }` );
  return data?.items || [];
};

export const fetchGanttData = async ( slug ) => {
  const data = await requestJson( `/api/project-managers/gantt?slug=${ encodeURIComponent( slug ) }` );
  return data;
};

export const fetchGanttStatusHistory = async ( issueKey ) => {
  const key = String( issueKey || "" ).trim();
  if ( !key )
  {
    return [];
  }
  const data = await requestJson(
    `/api/project-managers/gantt/status-history/${ encodeURIComponent( key ) }`
  );
  return Array.isArray( data?.segments ) ? data.segments : [];
};

export const updatePinnedGantt = ( issueKey, pinned, { siteContext } = {} ) =>
  requestJson( `/api/jira/issue-metadata/${ encodeURIComponent( issueKey ) }/pin-gantt`, {
    siteContext,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify( { pinned: Boolean( pinned ) } ),
  } );

export const searchEpics = async ( query ) => {
  const q = String( query || "" ).trim();
  if ( q.length < 2 )
  {
    return [];
  }
  const data = await requestJson( `/api/jira/epics/search?q=${ encodeURIComponent( q ) }` );
  return data?.items || [];
};

export const fetchJiraParentCandidates = async ( { jql, maxTotal = 100 }, { siteContext } = {} ) => {
  return requestJson( "/api/jira/issues/parent-candidates", {
    siteContext,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( {
      jql: String( jql || "" ).trim(),
      maxTotal,
    } ),
  } );
};

export const createJiraIssue = async ( payload ) => {
  return requestJson( "/api/jira/issues", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( payload || {} ),
  } );
};

export const generateIssueDescription = async ( {
  summary,
  issueType,
  epicKey,
  epicName,
  intake,
  attachmentPreference = "attachmentsOnly",
  attachmentNames = [],
} ) => {
  const aiPath = getPreferredAiPath();
  return requestJson( "/api/jira/issues/generate-description", {
    // Slightly longer than the server's AI_DRAFT_TIMEOUT_MS so the server's clearer error wins.
    timeoutMs: 150_000,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify( {
      summary,
      issueType,
      epicKey: epicKey || "",
      epicName: epicName || "",
      intake: intake || null,
      attachmentPreference,
      attachmentNames,
      ...( aiPath ? { aiPath } : {} ),
    } ),
  } );
};

export const generateProjectReport = async ( {
  label,
  jql,
  summary,
  reportType,
  pwbPeriod,
  userGoals,
  companyGoals,
  combinedSources,
  reportQueryScope,
}, { siteContext, signal } = {} ) => {
  const aiPath = getPreferredAiPath();
  return requestJson( "/api/report/project", {
    siteContext, signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify( {
      label,
      jql,
      summary,
      reportType,
      pwbPeriod,
      userGoals,
      companyGoals,
      combinedSources,
      reportQueryScope,
      ...( aiPath ? { aiPath } : {} ),
      ...getLocalTimestampPayload(),
    } ),
  } );
};

export const generateWeekPlan = async ( { projects, focusStyle, capacityHours, additionalContext } ) => {
  const aiPath = getPreferredAiPath();
  return requestJson( "/api/plan/week", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify( {
      projects,
      focusStyle,
      capacityHours,
      additionalContext,
      ...( aiPath ? { aiPath } : {} ),
      ...getLocalTimestampPayload(),
    } ),
  } );
};

export const fetchArchivedReports = async ( { source, limit, siteContext } = {} ) => {
  const params = new URLSearchParams();
  if ( source )
  {
    params.set( "source", source );
  }
  if ( limit )
  {
    params.set( "limit", String( limit ) );
  }
  const query = params.toString();
  const path = query ? `/api/reports/archive?${ query }` : "/api/reports/archive";
  const data = await requestJson( path, { siteContext } );
  return data?.items || [];
};

export const fetchArchivedReportById = async ( id, { siteContext } = {} ) => {
  const data = await requestJson( `/api/reports/archive/${ encodeURIComponent( id ) }`, { siteContext } );
  return data?.item || null;
};

export const deleteArchivedReport = async ( id, { siteContext } = {} ) => {
  return requestJson( `/api/reports/archive/${ encodeURIComponent( id ) }`, {
    siteContext,
    method: "DELETE",
  } );
};

export const deleteArchivedReportsBySource = async ( source, { siteContext } = {} ) => {
  return requestJson( `/api/reports/archive?source=${ encodeURIComponent( source ) }`, {
    siteContext,
    method: "DELETE",
  } );
};

export const saveAdHocReport = async ( { content, label, userPrompt, provider, savedFrom } ) => {
  return requestJson( "/api/reports/archive", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( { content, label, userPrompt, provider, savedFrom, ...getLocalTimestampPayload() } ),
  } );
};

export const fetchCoworkWeeklyPlans = async () => {
  const data = await requestJson( "/api/reports/cowork-files" );
  return data?.items || [];
};

export const fetchCoworkWeeklyPlanByFilename = async ( filename ) => {
  const data = await requestJson( `/api/reports/cowork-files/${ encodeURIComponent( filename ) }` );
  return data?.item || null;
};

export const saveCoworkWeeklyPlanToArchive = async ( { content, label, filename } ) => {
  return requestJson( "/api/reports/archive", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify( {
      content,
      label,
      filename,
      fromCoworkFile: true,
      ...getLocalTimestampPayload(),
    } ),
  } );
};

export const fetchPmAsks = async () => {
  const data = await requestJson( "/api/project-managers/asks" );
  return data?.items || [];
};

export const createPmAsk = async ( { title, whoAsked, note } ) => {
  return requestJson( "/api/project-managers/asks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify( { title, whoAsked, note } ),
  } );
};

export const updatePmAsk = async ( { id, title, whoAsked, note, status, jiraIssueKey } ) => {
  const body = {};
  if ( typeof title === "string" ) body.title = title;
  if ( typeof whoAsked === "string" ) body.whoAsked = whoAsked;
  if ( typeof note === "string" ) body.note = note;
  if ( typeof status === "string" ) body.status = status;
  if ( typeof jiraIssueKey === "string" ) body.jiraIssueKey = jiraIssueKey;
  return requestJson( `/api/project-managers/asks/${ encodeURIComponent( id ) }`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify( body ),
  } );
};

export const deletePmAsk = async ( id ) => {
  return requestJson( `/api/project-managers/asks/${ encodeURIComponent( id ) }`, {
    method: "DELETE",
  } );
};

// ─── Issue attachments ──────────────────────────────────────────────────────

export const fetchAttachmentLimits = async ( { siteContext } = {} ) => requestJson( "/api/jira/attachment-limits", { siteContext } );

export const fetchIssueAttachments = async ( issueKey, { siteContext } = {} ) =>
  requestJson( `/api/jira/issues/${ encodeURIComponent( issueKey ) }/attachments`, { siteContext } );

/**
 * Uploads files to a Jira issue. Uses XMLHttpRequest (not fetch) so large screen
 * recordings can report upload progress.
 * @param {string} issueKey
 * @param {File[]} files
 * @param {{ onProgress?: (fraction: number) => void }} [options]
 * @returns {Promise<{ issueKey: string, uploaded: object[], failed: {filename: string, error: string}[] }>}
 */
export const uploadIssueAttachments = async ( issueKey, files, { onProgress, siteContext } = {} ) => {
  const context = siteContext || await initializeSiteContext();
  return runBackgroundJob( `site-save:attachments:${issueKey}`, {
    instanceId: context.instanceId, siteSave: true, queue: true, label: "Uploading attachments", run: () => new Promise( ( resolve, reject ) => {
    const formData = new FormData();
    ( files || [] ).forEach( ( file ) => formData.append( "files", file, file.name ) );

    const xhr = new XMLHttpRequest();
    xhr.open( "POST", buildApiUrl( `/api/jira/issues/${ encodeURIComponent( issueKey ) }/attachments` ) );
    xhr.setRequestHeader( "Accept", "application/json" );
    Object.entries( siteHeaders( context ) ).forEach( ( [key, value] ) => xhr.setRequestHeader( key, value ) );
    if ( onProgress )
    {
      xhr.upload.onprogress = ( event ) =>
      {
        if ( event.lengthComputable ) onProgress( event.loaded / event.total );
      };
    }
    xhr.onerror = () =>
      reject( new Error( "Cannot reach the local API. Start it with npm run dev:api or npm run dev:all." ) );
    xhr.onload = () =>
    {
      let data = {};
      try
      {
        data = xhr.responseText ? JSON.parse( xhr.responseText ) : {};
      } catch
      {
        data = {};
      }
      if ( xhr.status >= 200 && xhr.status < 300 )
      {
        resolve( data );
        return;
      }
      const error = new Error( data?.error || `Attachment upload failed (HTTP ${ xhr.status })` );
      error.failed = Array.isArray( data?.failed ) ? data.failed : [];
      reject( error );
    };
    xhr.send( formData );
  } ),
  } );
};

// Export identifies saved entries directly and is independent of the active-site save queue.
export const fetchTaskExportScopes = async ( instanceId, { signal } = {} ) =>
  requestJsonNow( `/api/task-export/sites/${ encodeURIComponent( instanceId ) }/scopes`, { signal } );

export const previewTaskExport = async ( options, { signal } = {} ) =>
  requestJsonNow( "/api/task-export/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify( options ),
    signal,
  } );


export const downloadTaskExport = async ( options, { signal } = {} ) => {
  const response = await fetch( buildApiUrl( "/api/task-export/download" ), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    body: JSON.stringify( options ),
    signal,
  } );
  if ( !response.ok ) {
    const data = await response.json().catch( ( error ) => {
      if ( !( error instanceof SyntaxError ) ) throw error;
      return {};
    } );
    const error = new Error( extractJiraErrorMessage( data, response.status ) );
    error.status = response.status;
    throw error;
  }
  if ( !response.headers.get( "Content-Type" )?.includes( "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ) ) {
    throw new Error( "API did not return an XLSX workbook. Restart the local API and retry." );
  }
  return response.blob();
};
