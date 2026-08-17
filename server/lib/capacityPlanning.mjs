import { searchAllIssues } from "./jiraSearchHelpers.mjs";
import { splitTrailingOrderBy } from "./epicFilterJql.mjs";
import { getFieldValue, getIssueStatusName, parseJiraDate, startOfToday } from "../../shared/dashboardMetrics.mjs";
import { toAssigneeJqlOperand } from "../../shared/directReportsJql.mjs";
import { resolveMappedFieldId } from "../../shared/odiFieldIds.mjs";
import { normalizeOverdueDateBasis } from "../../shared/overdueDateBasis.mjs";
import { buildIssueEpicContext } from "./dashboardRefresh/dueByHelpers.mjs";

const escapeJqlString = ( value ) =>
  String( value || "" ).replace( /\\/g, "\\\\" ).replace( /"/g, '\\"' );

const STALE_DAYS_THRESHOLD = 14;
const BLOCKED_STATUS_PATTERN = /blocked|on\s*hold/i;

const resolveCapacityOverdueFields = ( mappingsByRole ) => {
  const dueFieldId = String( mappingsByRole?.get?.( "due_date" )?.fieldId || "" ).trim() || "duedate";
  const iddFieldId = resolveMappedFieldId( mappingsByRole, "initial_done_date" );
  const mrdFieldId = resolveMappedFieldId( mappingsByRole, "most_recent_done_date" );
  const overdueFieldIds = [ mrdFieldId, iddFieldId ].filter( ( id ) => id && id !== dueFieldId );
  return { dueFieldId, iddFieldId, mrdFieldId, overdueFieldIds };
};

const toJqlDateRef = ( fieldId ) => {
  const id = String( fieldId || "" ).trim();
  if ( !id || id === "due" || id === "duedate" ) return "duedate";
  const match = id.match( /^customfield_(\d+)$/i );
  return match ? `cf[${ match[ 1 ] }]` : `"${ id.replace( /"/g, '\\"' ) }"`;
};

const buildOverdueDrillDownClause = ( dueFieldId, overdueFieldIds ) => {
  const refs = [ ...new Set( [ dueFieldId || "duedate", ...( overdueFieldIds || [] ) ].filter( Boolean ).map( toJqlDateRef ) ) ];
  const parts = refs.map( ( ref ) => `(${ ref } is not EMPTY AND ${ ref } < startOfDay())` );
  const dateClause = parts.length === 1 ? parts[ 0 ] : `(${ parts.join( " OR " ) })`;
  return `statusCategory != Done AND ${ dateClause }`;
};

const buildIssueKeysClause = ( keys ) => {
  const list = [ ...new Set( ( keys || [] ).map( ( key ) => String( key || "" ).trim() ).filter( Boolean ) ) ];
  if ( list.length === 0 ) return "";
  return `statusCategory != Done AND key in (${ list.join( "," ) })`;
};

const DEFAULT_BLOCKED_CLAUSE = 'statusCategory != Done AND status in ("Blocked", "On Hold")';

const resolveBlockedClause = ( keys ) => buildIssueKeysClause( keys ) || DEFAULT_BLOCKED_CLAUSE;

const firstDateOn = ( issue, fieldIds ) => {
  for ( const fieldId of fieldIds || [] )
  {
    const dueDate = parseJiraDate( getFieldValue( issue, fieldId ) );
    if ( dueDate ) return dueDate;
  }
  return null;
};

// task_due = issue due only; epic_done = parent Epic MRD/IDD (ignore child due);
// either = issue due, else issue done dates, else Epic.
const isCapacityIssueOverdue = ( issue, basis, { dueFieldId, iddFieldId, mrdFieldId, epicIssue } ) => {
  const today = startOfToday();
  const epicDoneFields = [ mrdFieldId, iddFieldId ].filter( Boolean );

  if ( basis === "task_due" )
  {
    const dueDate = firstDateOn( issue, [ dueFieldId ].filter( Boolean ) );
    return Boolean( dueDate && dueDate < today );
  }

  if ( basis === "epic_done" )
  {
    const issueKey = String( issue?.key || "" ).trim();
    const epicKey = String( epicIssue?.key || "" ).trim();
    const source = epicIssue && epicKey && epicKey !== issueKey ? epicIssue : issue;
    const dueDate = firstDateOn( source, epicDoneFields );
    return Boolean( dueDate && dueDate < today );
  }

  const issueDate = firstDateOn( issue, [ dueFieldId, mrdFieldId, iddFieldId ].filter( Boolean ) );
  if ( issueDate )
  {
    return issueDate < today;
  }
  const epicDate = firstDateOn( epicIssue, epicDoneFields );
  return Boolean( epicDate && epicDate < today );
};

// Strip trailing ORDER BY before wrapping — Jira rejects nested ORDER BY.
const buildScopeJql = ( watched ) => {
  if ( watched.watchType === "jql" )
  {
    const raw = String( watched.jql || "" ).trim();
    if ( !raw ) return "";
    const { scope } = splitTrailingOrderBy( raw );
    return scope;
  }
  const name = String( watched.displayName || "" ).trim();
  return name ? `assignee = "${ escapeJqlString( name ) }"` : "";
};

const buildOpenCountJql = ( scopeJql ) => ( scopeJql ? `(${ scopeJql }) AND statusCategory != Done` : "" );

// Per-assignee counts (not one mixed `assignee in (...)` search) so a busy
// person's issues cannot fill the cap and hide lightly loaded people.
const CONTRIBUTOR_TOTAL_SAFETY_LIMIT = 150;
const APPROXIMATE_COUNT_PATH = "/rest/api/3/search/approximate-count";
const OPEN_ISSUE_PAGE_LIMIT = 5000;

const countOpenIssuesForAssignee = async ( { jql, jiraRequest, runJiraSearchRequest } ) => {
  if ( jiraRequest )
  {
    const counted = await jiraRequest( {
      method: "POST",
      pathWithQuery: APPROXIMATE_COUNT_PATH,
      body: { jql },
    } );
    if ( counted?.ok )
    {
      const count = Number( counted.data?.count );
      if ( Number.isFinite( count ) && count >= 0 )
      {
        return count;
      }
    }
  }

  const { loaded } = await searchAllIssues( { jql, runJiraSearchRequest, maxTotal: 5000 } );
  return loaded;
};

const fetchContributorTotalWorkloads = async ( {
  contributorCounts,
  contributorAccountIds,
  jiraRequest,
  runJiraSearchRequest,
} ) => {
  const names = Object.keys( contributorCounts || {} )
    .filter( ( name ) => name !== "Unassigned" )
    .slice( 0, CONTRIBUTOR_TOTAL_SAFETY_LIMIT );
  if ( names.length === 0 )
  {
    return {};
  }

  const totals = {};
  await Promise.all(
    names.map( async ( name ) => {
      const accountId = String( contributorAccountIds?.[ name ] || "" ).trim();
      const operand = toAssigneeJqlOperand( accountId || name );
      try
      {
        const count = await countOpenIssuesForAssignee( {
          jql: `assignee = ${ operand } AND statusCategory != Done`,
          jiraRequest,
          runJiraSearchRequest,
        } );
        // Omit a 0 total next to a non-zero "here" — that is a failed lookup, not availability.
        if ( typeof count === "number" && ( count > 0 || !( contributorCounts[ name ] > 0 ) ) )
        {
          totals[ name ] = count;
        }
      } catch {
        // Leave this person without a total; others still apply.
      }
    } )
  );
  return totals;
};

const computeIssueBreakdown = ( issues, fieldIds, basis, epicContext ) => {
  const { dueFieldId, iddFieldId, mrdFieldId } = fieldIds;
  const statusCounts = {};
  const contributorCounts = {};
  const contributorAccountIds = {};
  const overdueIssueKeys = [];
  const blockedIssueKeys = [];
  let overdueCount = 0;
  let blockedCount = 0;
  let staleCount = 0;
  const now = Date.now();
  const staleThresholdMs = STALE_DAYS_THRESHOLD * 24 * 60 * 60 * 1000;

  for ( const issue of issues )
  {
    const statusName = getIssueStatusName( issue ) || "Unknown";
    statusCounts[ statusName ] = ( statusCounts[ statusName ] || 0 ) + 1;

    const assigneeName = String( issue?.fields?.assignee?.displayName || "Unassigned" ).trim() || "Unassigned";
    contributorCounts[ assigneeName ] = ( contributorCounts[ assigneeName ] || 0 ) + 1;
    const accountId = String( issue?.fields?.assignee?.accountId || "" ).trim();
    if ( assigneeName !== "Unassigned" && accountId && !contributorAccountIds[ assigneeName ] )
    {
      contributorAccountIds[ assigneeName ] = accountId;
    }

    const issueKey = String( issue?.key || "" ).trim();
    if ( BLOCKED_STATUS_PATTERN.test( statusName ) )
    {
      blockedCount += 1;
      if ( issueKey )
      {
        blockedIssueKeys.push( issueKey );
      }
    }
    const epicIssue = epicContext?.epicByKey?.get( epicContext?.issueToEpicKey?.get( issueKey ) ) || null;
    if ( isCapacityIssueOverdue( issue, basis, { dueFieldId, iddFieldId, mrdFieldId, epicIssue } ) )
    {
      overdueCount += 1;
      if ( issueKey )
      {
        overdueIssueKeys.push( issueKey );
      }
    }

    const updated = issue?.fields?.updated;
    if ( updated )
    {
      const updatedAt = new Date( updated );
      if ( !Number.isNaN( updatedAt.getTime() ) && now - updatedAt.getTime() > staleThresholdMs )
      {
        staleCount += 1;
      }
    }
  }

  return { statusCounts, contributorCounts, contributorAccountIds, overdueCount, overdueIssueKeys, blockedCount, blockedIssueKeys, staleCount };
};

const resolveOverdueClause = ( basis, dueFieldId, overdueFieldIds, overdueIssueKeys, usedEpicContext ) => {
  if ( basis === "task_due" )
  {
    return buildOverdueDrillDownClause( dueFieldId, [] );
  }
  if ( usedEpicContext )
  {
    return buildIssueKeysClause( overdueIssueKeys ) || buildOverdueDrillDownClause( dueFieldId, overdueFieldIds );
  }
  return buildOverdueDrillDownClause( dueFieldId, overdueFieldIds );
};

export const fetchCapacityWorkloads = async ( { watchedRows, jiraRequest, runJiraSearchRequest, mappingsByRole } ) => {
  const rows = ( watchedRows || [] ).filter( ( row ) => row.watchType !== "direct_reports" );
  if ( rows.length === 0 )
  {
    return [];
  }

  const fieldIds = resolveCapacityOverdueFields( mappingsByRole );
  const { dueFieldId, overdueFieldIds } = fieldIds;
  const issueDateFields = [ dueFieldId, fieldIds.mrdFieldId, fieldIds.iddFieldId ].filter( Boolean );

  const results = [];
  for ( const watched of rows )
  {
    const hasCapacity = watched.capacity !== null && watched.capacity !== undefined;
    const basis = normalizeOverdueDateBasis( watched.overdueDateBasis );
    const defaultOverdueClause = resolveOverdueClause( basis, dueFieldId, overdueFieldIds, [], false );
    const scopeJql = buildScopeJql( watched );
    const base = {
      id: watched.id,
      displayName: watched.displayName,
      watchType: watched.watchType,
      jql: String( watched.jql || "" ).trim(),
      capacity: hasCapacity ? Number( watched.capacity ) : null,
      overdueDateBasis: basis,
      scopeJql,
    };
    try
    {
      const jql = buildOpenCountJql( scopeJql );
      if ( !jql )
      {
        results.push( {
          ...base,
          openCount: 0,
          statusCounts: {},
          contributorCounts: {},
          contributorTotalCounts: {},
          overdueCount: 0,
          blockedCount: 0,
          staleCount: 0,
          openCountIncomplete: false,
          overdueClause: defaultOverdueClause,
          blockedClause: DEFAULT_BLOCKED_CLAUSE,
          error: "No query available for this entry",
        } );
        continue;
      }
      const { issues, isComplete } = await searchAllIssues( {
        jql,
        runJiraSearchRequest,
        maxTotal: OPEN_ISSUE_PAGE_LIMIT,
      } );
      const openIssues = issues || [];
      const needsEpicContext =
        Boolean( jiraRequest ) &&
        ( basis === "epic_done" ||
          ( basis === "either" && openIssues.some( ( issue ) => !firstDateOn( issue, issueDateFields ) ) ) );
      const epicContext = needsEpicContext
        ? await buildIssueEpicContext( {
            issues: openIssues,
            mappingsByRole: mappingsByRole instanceof Map ? mappingsByRole : new Map(),
            jiraRequest,
          } )
        : { issueToEpicKey: new Map(), epicByKey: new Map() };
      const breakdown = computeIssueBreakdown( openIssues, fieldIds, basis, epicContext );
      const { contributorAccountIds, overdueIssueKeys, blockedIssueKeys, ...publicBreakdown } = breakdown;
      const contributorTotalCounts = await fetchContributorTotalWorkloads( {
        contributorCounts: publicBreakdown.contributorCounts,
        contributorAccountIds,
        jiraRequest,
        runJiraSearchRequest,
      } );
      results.push( {
        ...base,
        openCount: openIssues.length,
        openCountIncomplete: !isComplete,
        overdueClause: resolveOverdueClause( basis, dueFieldId, overdueFieldIds, overdueIssueKeys, needsEpicContext ),
        blockedClause: resolveBlockedClause( blockedIssueKeys ),
        ...publicBreakdown,
        contributorTotalCounts,
        error: null,
      } );
    } catch ( error )
    {
      results.push( {
        ...base,
        openCount: 0,
        statusCounts: {},
        contributorCounts: {},
        contributorTotalCounts: {},
        overdueCount: 0,
        blockedCount: 0,
        staleCount: 0,
        openCountIncomplete: false,
        overdueClause: defaultOverdueClause,
        blockedClause: DEFAULT_BLOCKED_CLAUSE,
        error: error instanceof Error ? error.message : "Failed to fetch workload",
      } );
    }
  }

  return results;
};
