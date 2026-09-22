import React from "react";
import { computeGanttSharepointMetrics, isGanttIssueOverdue } from "./ganttSharepointMetrics";
import { buildGanttSharepointHtml } from "./ganttSharepointHtml";
import { buildGanttPng } from "./ganttSharepointPng";
import { fetchChatStatus, generateGanttSharepointSummary } from "../../services/jiraClient";

const downloadBlob = ( content, filename, type ) => {
  const blob = new Blob( [ content ], { type } );
  const url = URL.createObjectURL( blob );
  const anchor = document.createElement( "a" );
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild( anchor );
  anchor.click();
  document.body.removeChild( anchor );
  URL.revokeObjectURL( url );
};

const GanttSharepointReportPanel = ( { open, onClose, displayName, viewIssues, allIssues, jiraBaseUrl } ) => {
  const [ includeAll, setIncludeAll ] = React.useState( false );
  const [ summary, setSummary ] = React.useState( "" );
  const [ copyMsg, setCopyMsg ] = React.useState( "" );
  const [ aiReady, setAiReady ] = React.useState( false );
  const [ aiLoading, setAiLoading ] = React.useState( false );
  const [ aiError, setAiError ] = React.useState( "" );
  const [ refineInstruction, setRefineInstruction ] = React.useState( "" );

  React.useEffect( () => {
    if ( !open ) return;
    fetchChatStatus().then( ( s ) => setAiReady( Boolean( s?.ready ) ) ).catch( () => setAiReady( false ) );
  }, [ open ] );

  // Stable timestamp per open; refreshes when scope changes.
  const generatedAt = React.useMemo( () => new Date().toLocaleString(), [ open, includeAll ] );

  const scopeIssues = includeAll ? allIssues : viewIssues;
  const metrics = computeGanttSharepointMetrics( scopeIssues );
  const html = buildGanttSharepointHtml( { displayName, generatedAt, metrics, summary, issues: scopeIssues, jiraBaseUrl } );
  const disabled = scopeIssues.length === 0;

  const handleDownload = () => {
    const slug = ( displayName || "gantt" ).replace( /[^a-z0-9]+/gi, "_" ).toLowerCase();
    downloadBlob( html, `sharepoint_report_${ slug }_${ new Date().toISOString().slice( 0, 10 ) }.html`, "text/html;charset=utf-8" );
  };

  const handleCopy = () => {
    navigator.clipboard.writeText( html ).then(
      () => { setCopyMsg( "Copied!" ); setTimeout( () => setCopyMsg( "" ), 2000 ); },
      () => setCopyMsg( "Copy failed — use Download instead" )
    );
  };

  const handleDownloadPng = async () => {
    const slug = ( displayName || "gantt" ).replace( /[^a-z0-9]+/gi, "_" ).toLowerCase();
    const blob = await buildGanttPng( scopeIssues, displayName );
    const url = URL.createObjectURL( blob );
    const anchor = document.createElement( "a" );
    anchor.href = url;
    anchor.download = `gantt_chart_${ slug }_${ new Date().toISOString().slice( 0, 10 ) }.png`;
    document.body.appendChild( anchor );
    anchor.click();
    document.body.removeChild( anchor );
    URL.revokeObjectURL( url );
  };

  const callAi = async ( mode ) => {
    setAiLoading( true );
    setAiError( "" );
    try {
      const payload = {
        mode,
        displayName,
        metrics,
        issues: scopeIssues.map( ( i ) => ( {
          key: i.key,
          summary: i.summary,
          status: i.status,
          statusCategory: i.statusCategory,
          startDate: i.startDate || null,
          dueDate: i.dueDate || null,
          completeDate: i.completeDate || null,
          overdue: isGanttIssueOverdue( i ),
        } ) ),
        currentSummary: summary,
        instruction: refineInstruction,
      };
      const result = await generateGanttSharepointSummary( payload );
      if ( result?.summary ) setSummary( result.summary );
    } catch ( err ) {
      setAiError( err?.message || "AI generation failed." );
    } finally {
      setAiLoading( false );
    }
  };

  if ( !open ) return null;

  return (
    <div className="pm-sp-overlay" onClick={ onClose }>
      <div className="pm-sp-panel" onClick={ ( e ) => e.stopPropagation() }>
        <div className="pm-sp-panel-header">
          <span className="pm-sp-panel-title">SharePoint Report — { displayName }</span>
          <button type="button" className="pm-sp-panel-close" onClick={ onClose } aria-label="Close">✕</button>
        </div>

        <div className="pm-sp-panel-body">
          <div className="pm-sp-scope">
            <label className={ `pm-sp-scope-option${ !includeAll ? " pm-sp-scope-option--active" : "" }` }>
              <input type="radio" name="sp-scope" checked={ !includeAll } onChange={ () => setIncludeAll( false ) } />
              Current view (filters + search)
            </label>
            <label className={ `pm-sp-scope-option${ includeAll ? " pm-sp-scope-option--active" : "" }` }>
              <input type="radio" name="sp-scope" checked={ includeAll } onChange={ () => setIncludeAll( true ) } />
              Entire plan (ignore filters/search)
            </label>
          </div>

          { metrics.bullets.length > 0 && (
            <ul className="pm-sp-metrics">
              { metrics.bullets.map( ( b, i ) => <li key={ i }>{ b }</li> ) }
            </ul>
          ) }

          <label className="pm-sp-label">
            Summary <span className="pm-sp-label-hint">(optional — appears in report)</span>
          </label>
          <textarea
            className="pm-sp-summary"
            placeholder="Add an executive summary…"
            value={ summary }
            onChange={ ( e ) => setSummary( e.target.value ) }
            rows={ 3 }
          />

          <div className="pm-sp-ai-section">
            <div className="pm-sp-ai-row">
              <button
                type="button"
                className="pm-gantt-refresh"
                onClick={ () => callAi( "generate" ) }
                disabled={ !aiReady || aiLoading || disabled }
                title={ !aiReady ? "AI not configured — set up Chat in Settings" : undefined }
              >
                { aiLoading ? "Generating…" : "Generate AI Summary" }
              </button>
              <input
                className="pm-sp-refine-input"
                placeholder="Refine instruction…"
                value={ refineInstruction }
                onChange={ ( e ) => setRefineInstruction( e.target.value ) }
                disabled={ !aiReady || aiLoading || disabled }
              />
              <button
                type="button"
                className="pm-gantt-refresh"
                onClick={ () => callAi( "refine" ) }
                disabled={ !aiReady || aiLoading || disabled || !refineInstruction.trim() || !summary.trim() }
                title={ !aiReady ? "AI not configured — set up Chat in Settings" : undefined }
              >
                Refine
              </button>
            </div>
            { !aiReady && <p className="pm-sp-ai-hint">AI not configured — set up Chat in Settings to enable generation.</p> }
            { aiError && <p className="pm-sp-ai-error">{ aiError }</p> }
          </div>

          <div className="pm-sp-actions">
            <button type="button" className="pm-gantt-refresh" onClick={ handleDownload } disabled={ disabled }>
              Download HTML
            </button>
            <button type="button" className="pm-gantt-refresh" onClick={ handleCopy } disabled={ disabled }>
              Copy HTML
            </button>
            <button type="button" className="pm-gantt-refresh" onClick={ handleDownloadPng } disabled={ disabled }>
              Download chart PNG
            </button>
            { copyMsg && <span className="pm-sp-copy-msg">{ copyMsg }</span> }
          </div>

          { disabled
            ? <p className="pm-sp-empty">No issues in scope — adjust filters or scope selection.</p>
            : (
              <div className="pm-sp-preview-wrap">
                <div className="pm-sp-preview-label">Preview</div>
                <iframe className="pm-sp-preview" srcDoc={ html } title="SharePoint report preview" sandbox="" />
              </div>
            ) }
        </div>
      </div>
    </div>
  );
};

export default GanttSharepointReportPanel;
