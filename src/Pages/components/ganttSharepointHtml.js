const esc = ( str ) =>
  String( str === null || str === undefined ? "" : str )
    .replace( /&/g, "&amp;" )
    .replace( /</g, "&lt;" )
    .replace( />/g, "&gt;" )
    .replace( /"/g, "&quot;" );

const parseDate = ( str ) => {
  if ( !str ) return null;
  const d = new Date( str + "T00:00:00" );
  return isNaN( d.getTime() ) ? null : d;
};

const OVERDUE_COLOR = "#dc2626";
const DAY_WIDTH = 14; // px per day

const generateMonths = ( startMs, endMs ) => {
  const months = [];
  let cur = new Date( new Date( startMs ).getFullYear(), new Date( startMs ).getMonth(), 1 );
  const endDate = new Date( endMs );
  while ( cur.getTime() <= endDate.getTime() ) {
    const next = new Date( cur.getFullYear(), cur.getMonth() + 1, 1 );
    const mStartMs = Math.max( cur.getTime(), startMs );
    const mEndMs = Math.min( next.getTime(), endMs );
    const label = cur.toLocaleDateString( "en-US", { month: "short", year: "numeric" } );
    months.push( { label, widthPx: ( ( mEndMs - mStartMs ) / 86400000 ) * DAY_WIDTH } );
    cur = next;
  }
  return months;
};

const isOverdue = ( issue ) => {
  if ( issue.statusCategory === "Done" ) return false;
  const d = parseDate( issue.dueDate || issue.completeDate );
  return d !== null && d < new Date( new Date().toISOString().slice( 0, 10 ) + "T00:00:00" );
};

const TH = "border:1px solid #d1d5db;padding:4px 8px;background:#f3f4f6;font-size:12px;text-align:left;";
const TD = "border:1px solid #e5e7eb;padding:4px 8px;font-size:12px;";
const TONE_COLORS = { red: "#dc2626", amber: "#d97706", green: "#16a34a" };
const SLIP_TONES = { "Early": "green", "On time": "green", "1–7 d late": "amber", "8–30 d late": "red", "31+ d late": "red" };
const OVERDUE_TONES = { "1–7 d": "amber", "8–30 d": "red", "31–90 d": "red", "90+ d": "red" };

const bar = ( px, color ) => `<table style="border-collapse:collapse;"><tr><td style="width:${ Math.max( 1, px ) }px;height:12px;padding:0;background:${ color };"></td></tr></table>`;

// Tables and spans only (no layout divs) so the section survives SharePoint's HTML sanitiser.
const buildPlanHealthSection = ( data, jiraBaseUrl ) => {
  if ( !data ) return "";
  const link = ( key ) => ( jiraBaseUrl
    ? `<a href="${ esc( jiraBaseUrl ) }/browse/${ esc( key ) }" style="color:#2563eb;">${ esc( key ) }</a>`
    : esc( key ) );
  const head = ( cols ) => `<thead><tr>${ cols.map( ( h ) => `<th style="${ TH }">${ esc( h ) }</th>` ).join( "" ) }</tr></thead>`;
  const sub = ( text ) => `<h3 style="font-size:13px;margin:16px 0 4px;">${ esc( text ) }</h3>`;
  const note = ( text ) => `<p style="font-size:12px;color:#6b7280;margin:2px 0 6px;">${ esc( text ) }</p>`;

  const kpiCells = ( data.kpis || [] ).map( ( k ) => `<td style="${ TD }vertical-align:top;width:25%;">
      <span style="display:block;font-size:11px;color:#6b7280;">${ esc( k.label ) }</span>
      <span style="display:block;font-size:20px;font-weight:600;color:${ TONE_COLORS[ k.tone ] || "#111827" };">${ esc( k.value ) }</span>
      <span style="display:block;font-size:11px;color:#6b7280;">${ esc( k.sub ) }</span></td>` );
  const kpiRows = [];
  for ( let i = 0; i < kpiCells.length; i += 4 ) kpiRows.push( `<tr>${ kpiCells.slice( i, i + 4 ).join( "" ) }</tr>` );

  const takeaways = ( data.takeaways || [] ).map( ( t ) => `<li style="margin:2px 0;"><b>${ esc( t.lead ) }:</b> ${ esc( t.text ) }${ t.keys?.length ? " " + t.keys.map( link ).join( ", " ) : "" }</li>` ).join( "" );

  const buckets = ( title, rows, tones ) => {
    const max = Math.max( 1, ...( rows || [] ).map( ( r ) => r.count ) );
    const body = ( rows || [] ).map( ( r ) => `<tr><td style="${ TD }">${ esc( r.label ) }</td>
      <td style="${ TD }width:220px;">${ bar( Math.round( ( r.count / max ) * 200 ), TONE_COLORS[ tones[ r.label ] ] || "#3b82f6" ) }</td>
      <td style="${ TD }text-align:right;">${ esc( r.count ) }</td></tr>` ).join( "" );
    return `<table style="border-collapse:collapse;width:100%;">${ head( [ title, "", "Issues" ] ) }<tbody>${ body }</tbody></table>`;
  };

  const months = data.months || [];
  const monthMax = Math.max( 1, ...( data.planned || [] ), ...( data.completed || [] ) );
  const monthRows = months.map( ( m, i ) => `<tr><td style="${ TD }white-space:nowrap;">${ esc( m ) }</td>
      <td style="${ TD }">${ bar( Math.round( ( ( data.planned || [] )[ i ] || 0 ) / monthMax * 160 ), "#7c3aed" ) }</td>
      <td style="${ TD }text-align:right;">${ esc( ( data.planned || [] )[ i ] || 0 ) }</td>
      <td style="${ TD }">${ bar( Math.round( ( ( data.completed || [] )[ i ] || 0 ) / monthMax * 160 ), "#16a34a" ) }</td>
      <td style="${ TD }text-align:right;">${ esc( ( data.completed || [] )[ i ] || 0 ) }</td></tr>` ).join( "" );
  const monthTable = months.length
    ? `${ sub( "Planned finishes vs. completions by month" ) }${ data.flowNote ? note( data.flowNote ) : "" }
<table style="border-collapse:collapse;">${ head( [ "Month", "Planned finishes", "", "Completed", "" ] ) }<tbody>${ monthRows }</tbody></table>`
    : "";

  const attention = ( data.attention || [] ).length
    ? `<table style="border-collapse:collapse;width:100%;">${ head( [ "Issue", "Summary", "Status", "Assignee", "Due", "Overdue (d)", "Pushed (d)" ] ) }<tbody>
      ${ data.attention.map( ( r ) => `<tr><td style="${ TD }">${ link( r.key ) }</td><td style="${ TD }">${ esc( r.summary ) }</td><td style="${ TD }">${ esc( r.status ) }</td><td style="${ TD }">${ esc( r.assignee ) }</td><td style="${ TD }">${ esc( r.dueDate ) }</td><td style="${ TD }text-align:right;">${ esc( r.overdueDays ) }</td><td style="${ TD }text-align:right;">${ r.pushedDays == null ? "" : "+" + esc( r.pushedDays ) }</td></tr>` ).join( "" ) }</tbody></table>`
    : note( "No open issues are past due." );

  const gaps = ( data.noSchedule || [] ).length
    ? `<table style="border-collapse:collapse;width:100%;">${ head( [ "Issue", "Summary", "Status", "Assignee" ] ) }<tbody>
      ${ data.noSchedule.map( ( r ) => `<tr><td style="${ TD }">${ link( r.key ) }</td><td style="${ TD }">${ esc( r.summary ) }</td><td style="${ TD }">${ esc( r.status ) }</td><td style="${ TD }">${ esc( r.assignee ) }</td></tr>` ).join( "" ) }</tbody></table>`
    : note( "Every open issue has a due date or planned finish." );

  return `<section style="margin:16px 0 24px;">
<h2 style="font-size:16px;margin:0 0 8px;">Plan health</h2>
<table style="border-collapse:collapse;width:100%;margin-bottom:8px;">${ kpiRows.join( "" ) }</table>
${ takeaways ? `${ sub( "Key takeaways" ) }<ul style="margin:4px 0;padding-left:20px;font-size:13px;">${ takeaways }</ul>` : "" }
${ monthTable }
${ sub( "Completion vs. planned finish" ) }
${ buckets( "Finished work vs. planned finish", data.slipBuckets, SLIP_TONES ) }
${ sub( "Open work past due" ) }
${ buckets( "Days past the current due date", data.overdueBuckets, OVERDUE_TONES ) }
${ sub( "Needing attention" ) }
${ attention }
${ sub( "Schedule gaps" ) }
${ gaps }
${ data.footnote ? `<p style="font-size:11px;color:#6b7280;margin:12px 0 0;">${ esc( data.footnote ) }</p>` : "" }
</section>`;
};

export const buildGanttSharepointHtml = ( {
  displayName = "",
  generatedAt = "",
  metrics,
  summary = "",
  issues = [],
  jiraBaseUrl = "",
  planHealth = null,
} ) => {
  // Compute timeline range from issues
  const startMsList = issues.map( ( i ) => parseDate( i.startDate )?.getTime() ).filter( Boolean );
  const endMsList = issues.map( ( i ) => parseDate( i.dueDate || i.completeDate )?.getTime() ).filter( Boolean );
  const rangeStartMs = startMsList.length ? Math.min( ...startMsList ) : Date.now();
  const rangeEndMs = endMsList.length ? Math.max( ...endMsList ) : rangeStartMs;

  const totalSpanDays = Math.max( 1, ( rangeEndMs - rangeStartMs ) / 86400000 );
  const totalWidthPx = Math.round( totalSpanDays * DAY_WIDTH );

  const months = generateMonths( rangeStartMs, rangeEndMs );

  const monthHeaders = months
    .map( ( m ) => `<th style="min-width:${ Math.round( m.widthPx ) }px;border:1px solid #d1d5db;padding:4px 6px;background:#f3f4f6;font-size:11px;white-space:nowrap;">${ esc( m.label ) }</th>` )
    .join( "" );

  const issueRows = issues.map( ( issue ) => {
    const start = parseDate( issue.startDate );
    const end = parseDate( issue.dueDate || issue.completeDate );
    const overdue = isOverdue( issue );
    const barColor = overdue ? OVERDUE_COLOR : "#3b82f6";

    let barHtml = "";
    if ( start && end ) {
      const leftPx = Math.round( ( start.getTime() - rangeStartMs ) / 86400000 * DAY_WIDTH );
      const widthPx = Math.max( 4, Math.round( ( end.getTime() - start.getTime() ) / 86400000 * DAY_WIDTH ) );
      barHtml = `<div style="position:absolute;left:${ leftPx }px;width:${ widthPx }px;height:16px;background:${ barColor };border-radius:3px;top:4px;"></div>`;
    }

    const keyHtml = jiraBaseUrl
      ? `<a href="${ esc( jiraBaseUrl ) }/browse/${ esc( issue.key ) }" style="color:#2563eb;">${ esc( issue.key ) }</a>`
      : esc( issue.key );

    const summaryText = String( issue.summary || "" ).slice( 0, 60 );

    return `<tr>
      <td style="padding:4px 8px;border:1px solid #e5e7eb;white-space:nowrap;font-size:12px;">${ keyHtml }</td>
      <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${ esc( summaryText ) }</td>
      <td style="padding:0;border:1px solid #e5e7eb;position:relative;width:${ totalWidthPx }px;min-width:${ totalWidthPx }px;height:24px;">${ barHtml }</td>
    </tr>`;
  } ).join( "\n" );

  const bulletItems = ( metrics.bullets || [] )
    .map( ( b ) => `<li style="margin:2px 0;">${ esc( b ) }</li>` )
    .join( "\n" );

  const summarySection = summary
    ? `<section style="margin:16px 0;padding:12px 16px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:4px;">
        <p style="margin:0;font-size:14px;">${ esc( summary ) }</p>
      </section>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ esc( displayName ) } — Gantt Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #111827; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { font-size: 12px; color: #6b7280; margin-bottom: 16px; }
  table { border-collapse: collapse; }
  .timeline-wrap { overflow-x: auto; }
</style>
</head>
<body>
<h1>${ esc( displayName ) }</h1>
<p class="meta">Generated: ${ esc( generatedAt ) }</p>
${ summarySection }
<section style="margin-bottom:16px;">
  <ul style="margin:0;padding-left:20px;font-size:13px;">
${ bulletItems }
  </ul>
</section>
${ buildPlanHealthSection( planHealth, jiraBaseUrl ) }
<div class="timeline-wrap">
<table>
  <thead>
    <tr>
      <th style="border:1px solid #d1d5db;padding:4px 8px;background:#f3f4f6;font-size:12px;text-align:left;">Key</th>
      <th style="border:1px solid #d1d5db;padding:4px 8px;background:#f3f4f6;font-size:12px;text-align:left;">Summary</th>
      <th style="border:1px solid #d1d5db;padding:0;background:#f3f4f6;">
        <table style="border-collapse:collapse;width:100%;"><tr>${ monthHeaders }</tr></table>
      </th>
    </tr>
  </thead>
  <tbody>
${ issueRows }
  </tbody>
</table>
</div>
</body>
</html>`;
};
