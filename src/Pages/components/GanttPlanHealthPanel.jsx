import React from "react";
import GanttPlanHealth from "../../Components/FlowReport/GanttPlanHealth.jsx";
import { buildGanttPlanHealthMarkdown, compareGanttSnapshots, computeGanttPlanHealth } from "../../../shared/ganttPlanHealth.mjs";
import { buildStandaloneFlowHtml, flowReportFileName } from "../../../shared/flowMetrics.mjs";
import flowReportCss from "../../Components/FlowReport/FlowReport.css?raw";
import { archiveGanttPlanHealth, fetchLatestGanttPlanHealth } from "../../services/jiraClient";

const download = ( content, filename, type ) => {
  const url = URL.createObjectURL( new Blob( [ content ], { type } ) );
  const a = document.createElement( "a" );
  a.href = url;
  a.download = filename;
  document.body.appendChild( a );
  a.click();
  document.body.removeChild( a );
  URL.revokeObjectURL( url );
};

const GanttPlanHealthPanel = ( { open, onClose, slug, displayName, viewIssues, allIssues, jiraBaseUrl } ) => {
  const [ includeAll, setIncludeAll ] = React.useState( true );
  const [ previous, setPrevious ] = React.useState( null );
  const [ status, setStatus ] = React.useState( "" );
  const [ saving, setSaving ] = React.useState( false );
  const reportRef = React.useRef( null );

  const scopeIssues = includeAll ? allIssues : viewIssues;
  const scopeLabel = includeAll ? "Entire plan" : "Current view";
  const data = React.useMemo(
    () => ( open ? computeGanttPlanHealth( scopeIssues, { today: new Date(), displayName, scopeLabel, baseUrl: jiraBaseUrl } ) : null ),
    [ open, scopeIssues, displayName, scopeLabel, jiraBaseUrl ]
  );

  // Last saved snapshot for this plan, used to show which due dates moved. Only meaningful for the entire plan.
  React.useEffect( () => {
    if ( !open || !slug ) return undefined;
    let cancelled = false;
    setPrevious( null );
    fetchLatestGanttPlanHealth( slug )
      .then( ( r ) => { if ( !cancelled ) setPrevious( r?.report || null ); } )
      .catch( () => { if ( !cancelled ) setPrevious( null ); } );
    return () => { cancelled = true; };
  }, [ open, slug ] );

  const comparison = React.useMemo( () => {
    if ( !data || !previous?.data ) return null;
    return { ...compareGanttSnapshots( previous.data, data ), previousAt: previous.createdAt };
  }, [ data, previous ] );

  if ( !open ) return null;
  const disabled = !data || scopeIssues.length === 0;
  const day = new Date().toISOString().slice( 0, 10 );

  const flash = ( msg ) => { setStatus( msg ); setTimeout( () => setStatus( "" ), 3000 ); };

  const handleSave = async () => {
    setSaving( true );
    try {
      await archiveGanttPlanHealth( data, slug );
      flash( "Saved to Report Archive" );
      setPrevious( { id: null, createdAt: previous?.createdAt, data: previous?.data } );
    } catch ( err ) {
      flash( err?.message || "Save failed" );
    } finally {
      setSaving( false );
    }
  };

  const handleCopy = () => navigator.clipboard.writeText( buildGanttPlanHealthMarkdown( data ) )
    .then( () => flash( "Copied!" ), () => flash( "Copy failed" ) );

  const handleMd = () => download( buildGanttPlanHealthMarkdown( data ), flowReportFileName( data.title, day, "md" ), "text/markdown;charset=utf-8" );

  const handleHtml = () => {
    const html = buildStandaloneFlowHtml( { title: data.title, bodyHtml: reportRef.current?.innerHTML || "", css: flowReportCss } );
    download( html, flowReportFileName( data.title, day, "html" ), "text/html;charset=utf-8" );
  };

  return (
    <div className="pm-sp-overlay" onClick={ onClose }>
      <div className="pm-sp-panel pm-sp-panel--wide" onClick={ ( e ) => e.stopPropagation() }>
        <div className="pm-sp-panel-header">
          <span className="pm-sp-panel-title">Plan health — { displayName }</span>
          <button type="button" className="pm-sp-panel-close" onClick={ onClose } aria-label="Close">✕</button>
        </div>
        <div className="pm-sp-panel-body">
          <div className="pm-sp-scope">
            <label className={ `pm-sp-scope-option${ includeAll ? " pm-sp-scope-option--active" : "" }` }>
              <input type="radio" name="ph-scope" checked={ includeAll } onChange={ () => setIncludeAll( true ) } />
              Entire plan
            </label>
            <label className={ `pm-sp-scope-option${ !includeAll ? " pm-sp-scope-option--active" : "" }` }>
              <input type="radio" name="ph-scope" checked={ !includeAll } onChange={ () => setIncludeAll( false ) } />
              Current view (filters + search)
            </label>
          </div>
          <div className="pm-sp-actions">
            <button type="button" className="pm-gantt-refresh" onClick={ handleSave } disabled={ disabled || saving }>
              { saving ? "Saving…" : "Save snapshot to archive" }
            </button>
            <button type="button" className="pm-gantt-refresh" onClick={ handleCopy } disabled={ disabled }>Copy markdown</button>
            <button type="button" className="pm-gantt-refresh" onClick={ handleMd } disabled={ disabled }>Download .md</button>
            <button type="button" className="pm-gantt-refresh" onClick={ handleHtml } disabled={ disabled }>Download .html</button>
            { status && <span className="pm-sp-copy-msg">{ status }</span> }
          </div>
          { disabled
            ? <p className="pm-sp-empty">No issues in scope — adjust filters or scope selection.</p>
            : <div ref={ reportRef }><GanttPlanHealth data={ data } comparison={ comparison } /></div> }
        </div>
      </div>
    </div>
  );
};

export default GanttPlanHealthPanel;
