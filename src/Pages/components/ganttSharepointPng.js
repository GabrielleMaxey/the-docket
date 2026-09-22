const DAY_WIDTH = 14;
const OVERDUE_COLOR = "#dc2626";
const NORMAL_COLOR = "#3b82f6";

const parseDate = ( str ) => {
  if ( !str ) return null;
  const d = new Date( str + "T00:00:00" );
  return isNaN( d.getTime() ) ? null : d;
};

const isOverdue = ( issue ) => {
  if ( issue.statusCategory === "Done" ) return false;
  const d = parseDate( issue.dueDate || issue.completeDate );
  return d !== null && d < new Date( new Date().toISOString().slice( 0, 10 ) + "T00:00:00" );
};

const generateMonths = ( startMs, endMs ) => {
  const months = [];
  let cur = new Date( new Date( startMs ).getFullYear(), new Date( startMs ).getMonth(), 1 );
  const endDate = new Date( endMs );
  while ( cur.getTime() <= endDate.getTime() ) {
    const next = new Date( cur.getFullYear(), cur.getMonth() + 1, 1 );
    const mStartMs = Math.max( cur.getTime(), startMs );
    const mEndMs = Math.min( next.getTime(), endMs );
    const label = cur.toLocaleDateString( "en-US", { month: "short", year: "numeric" } );
    months.push( { label, widthPx: Math.round( ( ( mEndMs - mStartMs ) / 86400000 ) * DAY_WIDTH ) } );
    cur = next;
  }
  return months;
};

export const buildGanttPng = ( issues, displayName ) => {
  return new Promise( ( resolve ) => {
    const KEY_COL = 90;
    const SUMMARY_COL = 180;
    const HEADER_H = 36;
    const MONTH_H = 22;
    const ROW_H = 26;
    const PADDING = 12;

    const startMsList = issues.map( ( i ) => parseDate( i.startDate )?.getTime() ).filter( Boolean );
    const endMsList = issues.map( ( i ) => parseDate( i.dueDate || i.completeDate )?.getTime() ).filter( Boolean );
    const rangeStartMs = startMsList.length ? Math.min( ...startMsList ) : Date.now();
    const rangeEndMs = endMsList.length ? Math.max( ...endMsList ) : rangeStartMs + 86400000 * 30;

    const totalSpanDays = Math.max( 1, ( rangeEndMs - rangeStartMs ) / 86400000 );
    const timelineW = Math.round( totalSpanDays * DAY_WIDTH );
    const months = generateMonths( rangeStartMs, rangeEndMs );

    const canvasW = PADDING * 2 + KEY_COL + SUMMARY_COL + timelineW;
    const canvasH = HEADER_H + MONTH_H + issues.length * ROW_H + PADDING;

    const canvas = document.createElement( "canvas" );
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext( "2d" );

    ctx.fillStyle = "#ffffff";
    ctx.fillRect( 0, 0, canvasW, canvasH );

    ctx.fillStyle = "#111827";
    ctx.font = "bold 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText( displayName || "Gantt Timeline", PADDING, PADDING + 14 );

    const gridTop = HEADER_H;
    const timelineX = PADDING + KEY_COL + SUMMARY_COL;

    // Column header: Key
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect( PADDING, gridTop, KEY_COL, MONTH_H );
    ctx.strokeStyle = "#d1d5db";
    ctx.strokeRect( PADDING, gridTop, KEY_COL, MONTH_H );
    ctx.fillStyle = "#374151";
    ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText( "Key", PADDING + 4, gridTop + 14 );

    // Column header: Summary
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect( PADDING + KEY_COL, gridTop, SUMMARY_COL, MONTH_H );
    ctx.strokeStyle = "#d1d5db";
    ctx.strokeRect( PADDING + KEY_COL, gridTop, SUMMARY_COL, MONTH_H );
    ctx.fillStyle = "#374151";
    ctx.fillText( "Summary", PADDING + KEY_COL + 4, gridTop + 14 );

    // Month headers
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    let mX = timelineX;
    months.forEach( ( m ) => {
      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect( mX, gridTop, m.widthPx, MONTH_H );
      ctx.strokeStyle = "#d1d5db";
      ctx.strokeRect( mX, gridTop, m.widthPx, MONTH_H );
      ctx.fillStyle = "#374151";
      ctx.fillText( m.label, mX + 4, gridTop + 14 );
      mX += m.widthPx;
    } );

    // Issue rows
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    issues.forEach( ( issue, idx ) => {
      const y = gridTop + MONTH_H + idx * ROW_H;
      const rowBg = idx % 2 === 0 ? "#ffffff" : "#f9fafb";

      ctx.fillStyle = rowBg;
      ctx.fillRect( PADDING, y, KEY_COL, ROW_H );
      ctx.strokeStyle = "#e5e7eb";
      ctx.strokeRect( PADDING, y, KEY_COL, ROW_H );
      ctx.fillStyle = "#2563eb";
      ctx.fillText( String( issue.key || "" ).slice( 0, 14 ), PADDING + 4, y + 16 );

      ctx.fillStyle = rowBg;
      ctx.fillRect( PADDING + KEY_COL, y, SUMMARY_COL, ROW_H );
      ctx.strokeStyle = "#e5e7eb";
      ctx.strokeRect( PADDING + KEY_COL, y, SUMMARY_COL, ROW_H );
      ctx.fillStyle = "#111827";
      ctx.fillText( String( issue.summary || "" ).slice( 0, 32 ), PADDING + KEY_COL + 4, y + 16 );

      ctx.fillStyle = rowBg;
      ctx.fillRect( timelineX, y, timelineW, ROW_H );
      ctx.strokeStyle = "#e5e7eb";
      ctx.strokeRect( timelineX, y, timelineW, ROW_H );

      const start = parseDate( issue.startDate );
      const end = parseDate( issue.dueDate || issue.completeDate );
      if ( start && end ) {
        const leftPx = Math.round( ( ( start.getTime() - rangeStartMs ) / 86400000 ) * DAY_WIDTH );
        const widthPx = Math.max( 4, Math.round( ( ( end.getTime() - start.getTime() ) / 86400000 ) * DAY_WIDTH ) );
        const bx = timelineX + leftPx;
        const by = y + 5;
        const bh = ROW_H - 10;
        const r = 3;
        ctx.fillStyle = isOverdue( issue ) ? OVERDUE_COLOR : NORMAL_COLOR;
        ctx.beginPath();
        ctx.moveTo( bx + r, by );
        ctx.lineTo( bx + widthPx - r, by );
        ctx.quadraticCurveTo( bx + widthPx, by, bx + widthPx, by + r );
        ctx.lineTo( bx + widthPx, by + bh - r );
        ctx.quadraticCurveTo( bx + widthPx, by + bh, bx + widthPx - r, by + bh );
        ctx.lineTo( bx + r, by + bh );
        ctx.quadraticCurveTo( bx, by + bh, bx, by + bh - r );
        ctx.lineTo( bx, by + r );
        ctx.quadraticCurveTo( bx, by, bx + r, by );
        ctx.closePath();
        ctx.fill();
      }
    } );

    canvas.toBlob( ( blob ) => resolve( blob ), "image/png" );
  } );
};
