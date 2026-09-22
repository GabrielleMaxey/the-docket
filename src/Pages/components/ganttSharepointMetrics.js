const parseDate = ( str ) => {
  if ( !str ) return null;
  const d = new Date( str + "T00:00:00" );
  return isNaN( d.getTime() ) ? null : d;
};

const dateOnly = ( d ) => d.toISOString().slice( 0, 10 );

export const isGanttIssueOverdue = ( issue, { today = new Date() } = {} ) => {
  if ( issue.statusCategory === "Done" ) return false;
  const dueDate = parseDate( issue.dueDate || issue.completeDate );
  if ( !dueDate ) return false;
  const todayOnly = new Date( today.getFullYear(), today.getMonth(), today.getDate() );
  return dueDate < todayOnly;
};

export const computeGanttSharepointMetrics = ( issues, { today = new Date() } = {} ) => {
  let done = 0, inProgress = 0, todo = 0, overdue = 0;
  let spanStartMs = null, spanEndMs = null;

  for ( const issue of issues ) {
    const cat = issue.statusCategory;
    if ( cat === "Done" ) done++;
    else if ( cat === "Indeterminate" ) inProgress++;
    else todo++;

    if ( isGanttIssueOverdue( issue, { today } ) ) overdue++;

    const start = parseDate( issue.startDate );
    if ( start ) {
      const ms = start.getTime();
      if ( spanStartMs === null || ms < spanStartMs ) spanStartMs = ms;
    }

    const end = parseDate( issue.dueDate || issue.completeDate );
    if ( end ) {
      const ms = end.getTime();
      if ( spanEndMs === null || ms > spanEndMs ) spanEndMs = ms;
    }
  }

  const total = issues.length;
  const spanStart = spanStartMs !== null ? dateOnly( new Date( spanStartMs ) ) : null;
  const spanEnd = spanEndMs !== null ? dateOnly( new Date( spanEndMs ) ) : null;

  const bullets = [];
  if ( total > 0 ) {
    bullets.push( `${ total } total issue${ total === 1 ? "" : "s" }` );
    bullets.push( `${ done } done` );
    if ( inProgress > 0 ) bullets.push( `${ inProgress } in progress` );
    if ( todo > 0 ) bullets.push( `${ todo } to do` );
    if ( overdue > 0 ) bullets.push( `${ overdue } overdue` );
    if ( spanStart && spanEnd ) bullets.push( `Timeline: ${ spanStart } – ${ spanEnd }` );
  }

  return { total, done, inProgress, todo, overdue, spanStart, spanEnd, bullets };
};
