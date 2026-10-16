import React from "react";
import { Button, Message, Modal, Table } from "semantic-ui-react";
import { downloadTaskExport, getTeamPriorityHealthSnapshot, subscribeTeamPriorityHealth, fetchJiraInstances, fetchTaskExportScopes, fetchTeamPriorityHealth, previewTaskExport } from "../../services/jiraClient.js";
import { BACKGROUND_JOB_IDS, cancelBackgroundJob, runBackgroundJob, subscribeBackgroundJobs } from "../../utils/backgroundJobStore.js";

const EXPORT_JOB_KEY = `docket:site:legacy:${BACKGROUND_JOB_IDS.TASK_EXPORT}`;
const rowIdentity = (site, row) => ({ instanceId: site.instanceId, siteHost: site.siteHost, issueKey: row.issueKey });
const rowKey = (site, row) => JSON.stringify(rowIdentity(site, row));

const TaskExportModal = ({ open, onClose }) => {
  const [entries, setEntries] = React.useState([]);
  const [teamAvailable, setTeamAvailable] = React.useState(false);
  const [teamReason, setTeamReason] = React.useState("Checking Team availability…");
  const [loading, setLoading] = React.useState(false);
  const [loadVersion, setLoadVersion] = React.useState(0);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [preview, setPreview] = React.useState(null);
  const [excludedRows, setExcludedRows] = React.useState([]);
  const [allowPartial, setAllowPartial] = React.useState(false);
  const [savedConsent, setSavedConsent] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [jobs, setJobs] = React.useState([]);
  const requestVersion = React.useRef(0);
  React.useEffect(() => subscribeTeamPriorityHealth(() => {
    const health = getTeamPriorityHealthSnapshot();
    setTeamAvailable(Boolean(health?.enabled && health?.configured && health?.connected));
    setTeamReason(health?.enabled === false ? "Team database is off. Local export is available." : "Team is unavailable. Check Team data in Settings.");
    if (health?.enabled === false) {
      requestVersion.current += 1;
      cancelBackgroundJob(EXPORT_JOB_KEY);
      setBusy("");
      setPreview(null);
    }
  }), []);

  const invalidatePreview = () => {
    setPreview(null);
    setExcludedRows([]);
    setAllowPartial(false);
    setNotice("");
  };

  React.useEffect(() => {
    if (!open) return;
    return subscribeBackgroundJobs(setJobs);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let current = true;
    setLoading(true);
    setError("");
    setEntries([]);
    invalidatePreview();
    const load = async () => {
      const [registry, health] = await Promise.allSettled([fetchJiraInstances(), fetchTeamPriorityHealth()]);
      if (!current) return;
      const available = health.status === "fulfilled" && health.value.enabled && health.value.configured && health.value.connected;
      setTeamAvailable(Boolean(available));
      setTeamReason(available ? "" : "Team is unavailable or not configured. Check Team data in Settings, then reload choices.");
      if (registry.status === "rejected") throw registry.reason;
      const loaded = await Promise.all((registry.value.instances || []).filter(entry => entry.enabled !== false && entry.enabled !== 0).map(async entry => {
        const initial = { ...entry, selected: false, source: "local", scopeType: "projectKeys", scopeValues: [], includeCompleted: false, priority: "", followUp: "" };
        try {
          return { ...initial, scopes: await fetchTaskExportScopes(entry.id, { signal: controller.signal }) };
        } catch (scopeError) {
          if (controller.signal.aborted) throw scopeError;
          return { ...initial, scopeError: scopeError.message };
        }
      }));
      if (current) setEntries(loaded);
    };
    void load().catch(loadError => { if (current) setError(loadError.message || "Unable to load saved Jira entries."); }).finally(() => { if (current) setLoading(false); });
    return () => {
      current = false;
      controller.abort();
      requestVersion.current += 1;
      cancelBackgroundJob(EXPORT_JOB_KEY);
    };
  }, [open, loadVersion]);

  const selectedEntries = entries.filter(entry => entry.selected);
  const relevantSaves = jobs.filter(job => job.siteSave && job.status !== "done" && selectedEntries.some(entry => entry.id === job.instanceId));
  const pendingSaves = relevantSaves.filter(job => job.status === "running");
  const failedSaves = relevantSaves.filter(job => ["error", "cancelled", "timeout"].includes(job.status));
  const saveRevision = relevantSaves.map(job => `${job.id}:${job.status}:${job.finishedAt || job.startedAt}`).join("|");
  React.useEffect(() => {
    requestVersion.current += 1;
    cancelBackgroundJob(EXPORT_JOB_KEY);
    setBusy("");
    invalidatePreview();
    setSavedConsent(false);
  }, [saveRevision]);

  const changeEntry = (id, patch) => {
    invalidatePreview();
    setError("");
    setSavedConsent(false);
    setEntries(current => current.map(entry => entry.id === id ? { ...entry, ...patch } : entry));
  };

  const canPreview = selectedEntries.length > 0 && selectedEntries.every(entry => entry.scopeValues.length > 0 && entry.scopes && (entry.source !== "team" || teamAvailable)) && pendingSaves.length === 0 && (failedSaves.length === 0 || savedConsent);
  const partial = preview?.snapshot.sites.some(site => site.status !== "complete");
  const excludedKeys = new Set(excludedRows.map(row => JSON.stringify(row)));

  const collectPreview = async () => {
    if (!canPreview || busy) return;
    const version = ++requestVersion.current;
    invalidatePreview();
    setError("");
    setBusy("preview");
    const sites = selectedEntries.map(entry => ({
      instanceId: entry.id, source: entry.source,
      scope: { [entry.scopeType]: entry.scopeValues }, includeCompleted: entry.includeCompleted,
      ...(entry.priority !== "" ? { priorities: [Number(entry.priority)] } : {}),
      ...(entry.followUp ? { followUp: entry.followUp } : {}),
    }));
    try {
      const result = await runBackgroundJob(BACKGROUND_JOB_IDS.TASK_EXPORT, {
        instanceId: null, label: "Preparing task workbook preview", scope: "Task export",
        run: signal => previewTaskExport({ sites, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }, { signal }),
      });
      if (version === requestVersion.current) setPreview(result);
    } catch (previewError) {
      if (version === requestVersion.current) setError(previewError.name === "AbortError" ? "Preview cancelled." : previewError.message || "Preview failed. Retry when the source is available.");
    } finally {
      if (version === requestVersion.current) setBusy("");
    }
  };

  const download = async () => {
    if (!preview || busy || pendingSaves.length || (failedSaves.length && !savedConsent) || (partial && !allowPartial)) return;
    const version = ++requestVersion.current;
    setBusy("download");
    setError("");
    setNotice("");
    try {
      const blob = await runBackgroundJob(BACKGROUND_JOB_IDS.TASK_EXPORT, {
        instanceId: null, label: "Downloading task workbook", scope: "Task export",
        run: signal => downloadTaskExport({ previewId: preview.previewId, excludedRows, allowPartial }, { signal }),
      });
      if (version !== requestVersion.current) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `docket-tasks-${preview.snapshot.exportedAt.slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Workbook download requested. Share the saved file manually through SharePoint.");
    } catch (downloadError) {
      if (version !== requestVersion.current) return;
      if (downloadError.status === 409) invalidatePreview();
      setError(downloadError.name === "AbortError" ? "Download cancelled." : downloadError.message || "Download failed. You can retry this preview.");
    } finally {
      if (version === requestVersion.current) setBusy("");
    }
  };

  const close = () => {
    requestVersion.current += 1;
    cancelBackgroundJob(EXPORT_JOB_KEY);
    setBusy("");
    onClose();
  };

  return (
    <Modal open={open} onClose={close} size="fullscreen" className="ww-task-export-modal" closeOnDimmerClick={!busy}>
      <Modal.Header>Download tasks</Modal.Header>
      <Modal.Content scrolling>
        <p>Choose saved Jira entries and scopes. Each entry gets its own worksheet, including entries on the same hostname. The active Jira entry stays selected.</p>
        <p>Latest Jira comment only. Notes are text only; images and attachments are excluded. This workbook is a saved snapshot, with manual SharePoint sharing and no real-time synchronization.</p>
        {loading ? <p role="status">Loading saved entries and scope choices…</p> : null}
        {error ? <Message negative role="alert">{error}</Message> : null}
        {notice ? <Message positive role="status">{notice}</Message> : null}
        <Button size="small" onClick={() => setLoadVersion(value => value + 1)} disabled={Boolean(busy) || loading}>Reload choices</Button>
        {!loading && !entries.length ? <p>No saved Jira entries available. Add an entry in Settings.</p> : null}
        {entries.map(entry => (
          <fieldset key={entry.id} className="ww-export-entry" disabled={Boolean(busy) || loading}>
            <legend><label><input type="checkbox" disabled={Boolean(busy) || loading} checked={entry.selected} onChange={event => changeEntry(entry.id, { selected: event.target.checked })} /> {entry.displayName} — {new URL(entry.baseUrl).hostname}</label></legend>
            {entry.scopeError ? <p role="alert">Scope choices unavailable: {entry.scopeError} Use Reload choices to retry.</p> : null}
            {entry.selected && entry.scopes ? <div className="ww-export-controls">
              <label>Metadata source<select value={entry.source} onChange={event => changeEntry(entry.id, { source: event.target.value })}><option value="local">Local</option><option value="team" disabled={!teamAvailable}>Team</option></select></label>
              {!teamAvailable ? <p>{teamReason}</p> : null}
              <label>Scope type<select value={entry.scopeType} onChange={event => changeEntry(entry.id, { scopeType: event.target.value, scopeValues: [] })}><option value="projectKeys">Projects</option><option value="presetIds">Saved presets</option></select></label>
              <label>Scopes (select one or more)<select multiple value={entry.scopeValues.map(String)} onChange={event => changeEntry(entry.id, { scopeValues: [...event.target.selectedOptions].map(option => entry.scopeType === "presetIds" ? Number(option.value) : option.value) })}>
                {(entry.scopeType === "projectKeys" ? entry.scopes.projects : entry.scopes.presets).map(scope => <option key={scope.key || scope.id} value={scope.key || scope.id}>{scope.key ? `${scope.key} — ${scope.name}` : scope.name}</option>)}
              </select></label>
              {entry.scopeType === "projectKeys" && !entry.scopes.projectsComplete ? <p>Project choices are incomplete. Only the visible projects can be selected; narrow the scope or retry.</p> : null}
              {!(entry.scopeType === "projectKeys" ? entry.scopes.projects : entry.scopes.presets).length ? <p>No available choices for this scope type.</p> : null}
              <label>Priority<select value={entry.priority} onChange={event => changeEntry(entry.id, { priority: event.target.value })}><option value="">All priorities</option>{Array.from({ length: 21 }, (_, priority) => <option key={priority} value={priority}>{priority === 0 ? "0 — Unset" : priority}</option>)}</select></label>
              <label>Now / Next<select value={entry.followUp} onChange={event => changeEntry(entry.id, { followUp: event.target.value })}><option value="">All</option><option value="now">Now</option><option value="next">Next</option></select></label>
              <label><input type="checkbox" checked={entry.includeCompleted} onChange={event => changeEntry(entry.id, { includeCompleted: event.target.checked })} /> Include completed work</label>
            </div> : null}
          </fieldset>
        ))}
        {pendingSaves.length ? <Message warning role="status">Waiting for {pendingSaves.length} pending save(s) for selected entries. Preview becomes available when saves finish.</Message> : null}
        {failedSaves.length ? <Message warning><p>A save failed or was cancelled for a selected entry. Unsaved edits will not be included.</p><label><input type="checkbox" checked={savedConsent} disabled={Boolean(busy)} onChange={event => { invalidatePreview(); setSavedConsent(event.target.checked); }} /> Export saved values despite failed saves</label></Message> : null}
        {busy ? <p role="status">{busy === "preview" ? "Collecting saved task data…" : "Preparing workbook download…"}</p> : null}
        {preview ? <section aria-label="Export preview">
          <h3>Review snapshot</h3>
          <p>Snapshot time: {preview.snapshot.exportedAt} · Timezone: {preview.snapshot.timezone} · Preview expires: {preview.expiresAt}</p>
          <p>Latest Jira comment only. Excluding a row affects only this saved entry. Retry preview collects a new snapshot.</p>
          {preview.snapshot.sites.map(site => <section key={site.instanceId} className="ww-export-preview-site" aria-label={`${site.displayName} preview`}>
            <h4>{site.displayName} — {site.siteHost}</h4>
            <p>Metadata source: {site.source === "team" ? "Team" : "Local"} · Completeness: {site.status} · Collected: {site.rows.length} · Searched: {site.searchedCount}</p>
            <p>Docket local notes: separately labeled · Team notes: {site.teamNotesSelected ? "selected" : "not selected"} · Latest Jira comment only</p>
            {site.message ? <Message warning>{site.message}</Message> : null}
            {!site.rows.length ? <p>{site.status === "failed" ? "This entry failed; no task rows are available." : "No tasks in this scope."}</p> : <div className="ww-export-table-scroll"><Table celled compact>
              <Table.Header><Table.Row>{["Include", "Task", "Priority / Now / Next", "Docket local notes", "Team notes", "Latest Jira comment", "Jira comment author", "Jira comment date", "Jira comment status"].map(label => <Table.HeaderCell key={label}>{label}</Table.HeaderCell>)}</Table.Row></Table.Header>
              <Table.Body>{site.rows.map(row => <Table.Row key={rowKey(site, row)}>
                <Table.Cell><input type="checkbox" aria-label={`Include ${row.issueKey} from ${site.displayName}`} disabled={Boolean(busy)} checked={!excludedKeys.has(rowKey(site, row))} onChange={event => setExcludedRows(current => event.target.checked ? current.filter(item => JSON.stringify(item) !== rowKey(site, row)) : [...current, rowIdentity(site, row)])} /></Table.Cell>
                <Table.Cell>{row.issueKey}<br />{row.summary}<br />{row.status}</Table.Cell>
                <Table.Cell>{row.priority ?? "Unset"} / {row.followUp || "Unset"}</Table.Cell>
                <Table.Cell>{row.localNoteStatus === "unavailable" ? "Unavailable" : row.localNote || "Empty"}</Table.Cell>
                <Table.Cell>{site.teamNotesSelected ? row.teamNote || "Empty" : "Not selected"}</Table.Cell>
                <Table.Cell>{row.jiraCommentStatus === "unavailable" ? "Unavailable" : row.jiraCommentStatus === "none" ? "No comments" : row.latestJiraComment?.text || "Empty"}</Table.Cell>
                <Table.Cell>{row.jiraCommentStatus === "available" ? row.latestJiraComment?.author || "Unknown" : "—"}</Table.Cell>
                <Table.Cell>{row.jiraCommentStatus === "available" ? row.latestJiraComment?.createdAt || "Unknown" : "—"}</Table.Cell>
                <Table.Cell>{row.jiraCommentStatus}</Table.Cell>
              </Table.Row>)}</Table.Body>
            </Table></div>}
          </section>)}
          <p>Excluded rows: {excludedRows.length}</p>
          {partial ? <Message warning><p>This snapshot contains partial or failed entries. Their status remains visible even if rows are excluded.</p><label><input type="checkbox" checked={allowPartial} disabled={Boolean(busy)} onChange={event => setAllowPartial(event.target.checked)} /> I accept the missing data and want to download this partial workbook</label></Message> : null}
        </section> : null}
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={close}>{busy ? "Cancel and close" : "Close"}</Button>
        {busy ? <Button onClick={() => cancelBackgroundJob(EXPORT_JOB_KEY)}>Cancel operation</Button> : null}
        <Button onClick={collectPreview} disabled={!canPreview || Boolean(busy) || loading}>{preview ? "Retry preview" : "Preview tasks"}</Button>
        <Button primary onClick={download} disabled={!preview || Boolean(busy) || (partial && !allowPartial)}>Download workbook</Button>
      </Modal.Actions>
    </Modal>
  );
};

export default TaskExportModal;
