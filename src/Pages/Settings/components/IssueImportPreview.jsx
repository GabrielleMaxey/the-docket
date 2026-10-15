import React from "react";
import { Button, Message } from "semantic-ui-react";
import { IMPORT_FIELDS } from "../../../../shared/issueMetadataFields.mjs";
import { getSiteContext, subscribeSiteContext } from "../../../utils/siteContextStore.js";
import { previewIssueMetadataImport, commitIssueMetadataImport } from "../../../services/jiraClient.js";

const labels = { priority: "Priority", note: "Note", followUp: "Now / Next", requestor: "Requestor", plannedStart: "Planned start", plannedFinish: "Planned finish", startDate: "Actual start", openDecisionNote: "Decision note" };
const display = (value) => value === null || value === undefined || value === "" ? "Unset" : String(value);

const IssueImportPreview = ({ initialPreview, teamAvailable, teamReason, siteContext, onLocalSaved, sourceChanged = false, onPreview = () => {} }) => {
  const currentSite = React.useSyncExternalStore(subscribeSiteContext, getSiteContext);
  const [rows, setRows] = React.useState(initialPreview.rows);
  const [columns, setColumns] = React.useState(() => IMPORT_FIELDS.filter(field => ["priority", "note", "followUp"].includes(field) || initialPreview.rows.some(row => Object.hasOwn(row.patch, field))));
  const [preview, setPreview] = React.useState(initialPreview);
  const [reviewed, setReviewed] = React.useState(true);
  const [approved, setApproved] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [saved, setSaved] = React.useState(false);
  const pending = React.useRef(false);
  const previousId = React.useRef(initialPreview.previewId);
  const stale = currentSite?.generation !== siteContext?.generation || currentSite?.instanceId !== siteContext?.instanceId;
  const edit = (next) => { setRows(next); setReviewed(false); setApproved(false); setMessage(""); setSaved(false); };
  const editRow = (rowId, change) => edit(rows.map(row => row.rowId === rowId ? { ...row, ...change } : row));
  const editField = (row, field, value) => editRow(row.rowId, { patch: { ...row.patch, [field]: value } });
  const review = async (destination = preview.destination) => {
    if (pending.current || stale || (saved && destination === preview.destination)) return;
    pending.current = true;
    setBusy(true); setApproved(false); setReviewed(false); setMessage(""); setSaved(false);
    try {
      const next = await previewIssueMetadataImport({ destination, rows, ...(previousId.current ? { supersedesPreviewId: previousId.current } : {}) }, { siteContext });
      if (getSiteContext()?.generation !== siteContext.generation) return;
      previousId.current = next.previewId;
      onPreview(next.previewId);
      setPreview(next); setRows(next.rows); setReviewed(true);
      if (destination !== preview.destination) setMessage(`Review the ${destination} comparison and approve again before saving.`);
    } catch (error) {
      if ([409, 410].includes(error.status)) { previousId.current = null; onPreview(null); }
      setMessage(error.message || "Could not create preview. Your edits are kept.");
    } finally { pending.current = false; setBusy(false); }
  };
  const save = async (destination) => {
    if (pending.current || stale || (!approved && !saved) || !reviewed) return;
    if (destination !== preview.destination) { await review(destination); return; }
    if (saved) return;
    pending.current = true; setBusy(true); setMessage("");
    try {
      const result = await commitIssueMetadataImport(preview.previewId, { siteContext });
      setSaved(true); setApproved(false); previousId.current = null; onPreview(null);
      setMessage(`${result.duplicate ? "Already saved" : "Saved"} ${result.updated} rows ${result.destination === "team" ? "to team" : "locally"}. Re-run your task query to load them.`);
      if (result.destination === "local") onLocalSaved(preview);
    } catch (error) {
      if ([409, 410].includes(error.status)) { setApproved(false); setReviewed(false); previousId.current = null; onPreview(null); }
      setMessage(error.status ? `Save failed: ${error.message}. Your edits are kept.` : "The save outcome is unknown. Your edits are kept. Retry the same save to check for duplicate completion before choosing another destination.");
    } finally { pending.current = false; setBusy(false); }
  };
  return <div className="issue-import-preview" aria-label="Editable import preview">
    <p><strong>Jira site:</strong> {siteContext.siteHost} · <strong>{preview.destination === "local" ? "Local" : "Team"} comparison</strong>. Importing changes Docket metadata; Jira is unchanged.</p>
    {stale ? <Message warning>The Jira site changed. Your edits are kept; return to the original site and create a new preview before saving.</Message> : null}
    {initialPreview.ignoredHeaders?.length ? <Message warning>Ignored columns: {initialPreview.ignoredHeaders.join(", ")}</Message> : null}
    <div className="issue-import-actions"><label>Add column <select aria-label="Add column" value="" disabled={busy || stale} onChange={event => { if (event.target.value) { setColumns([...columns, event.target.value]); edit(rows); } }}><option value="">Choose supported field</option>{IMPORT_FIELDS.filter(field => !columns.includes(field)).map(field => <option key={field} value={field}>{labels[field]}</option>)}</select></label><span>{rows.filter(row => row.selected).length} of {rows.length} rows selected</span></div>
    <fieldset disabled={busy || stale}>
      <div className="issue-import-table"><table><thead><tr><th><input type="checkbox" aria-label="Include all rows" checked={rows.every(row => row.selected)} onChange={event => edit(rows.map(row => ({ ...row, selected: event.target.checked })))} /></th><th>Issue key</th>{columns.map(field => <th key={field}>{labels[field]} <button type="button" aria-label={`Remove ${labels[field]} column`} onClick={() => { setColumns(columns.filter(column => column !== field)); edit(rows.map(row => ({ ...row, patch: Object.fromEntries(Object.entries(row.patch).filter(([key]) => key !== field)) }))); }}>×</button></th>)}<th>Status</th></tr></thead><tbody>{rows.map(row => {
        const comparison = preview.diff.find(item => item.rowId === row.rowId);
        const errors = preview.errors.filter(error => error.issueKey === row.issueKey);
        return <tr key={row.rowId} className={row.selected ? "" : "is-excluded"}>
          <td><input type="checkbox" aria-label={`Include ${row.issueKey}`} checked={row.selected} onChange={event => editRow(row.rowId, { selected: event.target.checked })} /></td>
          <td><input aria-label={`Issue key for ${row.rowId}`} value={row.issueKey} onChange={event => editRow(row.rowId, { issueKey: event.target.value })} /></td>
          {columns.map(field => <td key={field}>
            <small>Saved: {display(comparison?.saved?.[field])}</small>
            {field === "followUp" ? ["now", "next"].map(value => <label key={value} className="issue-import-choice"><input type="checkbox" aria-label={`${value === "now" ? "Now" : "Next"} for ${row.issueKey}`} checked={row.patch.followUp === value} onChange={event => editField(row, field, event.target.checked ? value : null)} />{value === "now" ? "Now" : "Next"}</label>) : field === "note" || field === "openDecisionNote" ? <textarea aria-label={`${labels[field]} for ${row.issueKey}`} value={row.patch[field] ?? ""} onChange={event => editField(row, field, event.target.value)} /> : <input type={field.endsWith("Date") || field.startsWith("planned") ? "date" : "text"} aria-label={`${labels[field]} for ${row.issueKey}`} value={row.patch[field] ?? ""} onChange={event => editField(row, field, event.target.value)} />}
            {field === "note" && comparison?.saved?.note ? <label className="issue-import-choice"><input type="checkbox" aria-label={`Replace saved note for ${row.issueKey}`} checked={row.replaceNote} onChange={event => editRow(row.rowId, { replaceNote: event.target.checked })} />Replace saved note with this text</label> : null}
            {reviewed && comparison?.changes[field] ? <small>New: {display(comparison.changes[field].after)}</small> : null}
          </td>)}
          <td>{!row.selected ? "Excluded" : !reviewed ? "Review needed" : errors.length ? errors.map(error => <div key={error.reason}>{error.reason}</div>) : "Ready"}</td>
        </tr>;
      })}</tbody></table></div>
    </fieldset>
    {sourceChanged ? <Message warning>A different file is selected. Use Preview CSV to review it before saving.</Message> : null}
    <p>Existing notes are protected unless replacement is checked. Empty CSV cells preserve saved fields. Editing a value to empty explicitly clears it; untouched added fields are omitted. Now and Next allow one selection or neither.</p>
    {reviewed && preview.errors.length > 0 ? <Message warning role="alert">{preview.errors.length} selected rows need attention. Fix the values or exclude those rows, then review again.</Message> : null}
    {message ? <Message role="status">{message}</Message> : null}
    <div className="issue-import-actions">
      <Button type="button" onClick={() => review()} disabled={busy || stale || saved} loading={busy}>Review changes</Button>
      <Button type="button" onClick={() => setApproved(true)} disabled={busy || stale || !reviewed || preview.errors.length > 0 || !preview.diff.some(row => Object.keys(row.changes).length) || sourceChanged || saved || approved}>Approve changes</Button>
      {approved ? <span>Approved for {preview.destination}. Approval saves nothing.</span> : null}
    </div>
    <div className="issue-import-actions">
      <Button type="button" primary onClick={() => save("local")} disabled={busy || stale || sourceChanged || (!approved && !(saved && preview.destination !== "local")) || (saved && preview.destination === "local")}>Save locally</Button>
      <Button type="button" primary onClick={() => save("team")} disabled={busy || stale || sourceChanged || !teamAvailable || (!approved && !(saved && preview.destination !== "team")) || (saved && preview.destination === "team")} title={!teamAvailable ? teamReason : undefined}>Save to team</Button>
    </div>
    {!teamAvailable ? <p>{teamReason || "Team database is unavailable. Check Team data below."}</p> : null}
    <p>Choosing another destination loads its own comparison and requires approval again. Drafts expire after 15 minutes; restarting the API requires a new preview.</p>
  </div>;
};
export default IssueImportPreview;
