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

export const buildGanttSharepointHtml = ( {
  displayName = "",
  generatedAt = "",
  metrics,
  summary = "",
  issues = [],
  jiraBaseUrl = "",
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
