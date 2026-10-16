import React from "react";
import { fetchCombinedOpenWork, fetchJiraInstances } from "../services/jiraClient";
import { formatTimestamp } from "../utils/format";
import "./combinedOpenWork.css";
import CombinedSiteEditor from "./components/CombinedSiteEditor.jsx";
import JiraResultsTable from "./components/JiraResultsTable.jsx";
import MyMetricsSection from "./components/MyMetricsSection.jsx";
import { STATUS_OPTIONS } from "./hooks/useTaskManagerJira.js";
import { buildCombinedTableModel, buildCombinedMetrics } from "./combinedWorkModel.js";
import { useBackgroundJobs } from "../hooks/useBackgroundJobs.js";

export default function CombinedOpenWork() {
  const [sites, setSites] = React.useState(null);
  const [selected, setSelected] = React.useState([]);
  const [result, setResult] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const request = React.useRef(null);
  const [mode, setMode] = React.useState("managed");
  const [models, setModels] = React.useState({});
  const [confirmedIssues, setConfirmedIssues] = React.useState({});
  const jobs = useBackgroundJobs();
  const saving = jobs.some((job) => job.siteSave && result?.sites.some((site) => site.instanceId === job.instanceId));
  const onModel = React.useCallback((id, model) => setModels((current) => ({ ...current, [id]: model })), []);
  const onConfirmedIssue = React.useCallback((context, issue) => {
    setConfirmedIssues((current) => ({ ...current, [context.siteHost]: { ...current[context.siteHost], [issue.key]: issue } }));
  }, []);
  const canReplaceLoadedWork = () => {
    if (saving) return false;
    const hasDrafts = Object.values(models).some((model) =>
      [model.jiraNotes, model.statusDrafts, model.iddDrafts, model.dueDateDrafts, model.mrdDrafts, model.assigneeDrafts, model.noteImagesByKey, model.planningMetaByKey, model.teamPlanningMetaByKey, model.jiraRowPriorities, model.saveState, model.rowUpdateState]
        .some((values) => Object.values(values).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value))));
    return !hasDrafts || window.confirm("Replace the loaded work? Unpushed notes, images and field drafts will be closed. Saved local notes remain in the database. Cancel to keep editing.");
  };

  React.useEffect(() => {
    const beforeSiteChange = (event) => { if (!canReplaceLoadedWork()) event.preventDefault(); };
    if (typeof window === "undefined") return;
    const target = window;
    target.addEventListener?.("docket:before-site-change", beforeSiteChange);
    return () => target.removeEventListener?.("docket:before-site-change", beforeSiteChange);
  }, [models, saving]);

  React.useEffect(() => {
    let mounted = true;
    fetchJiraInstances().then(data => {
      if (!mounted) return;
      const enabled = (data.instances || []).filter(site => site.enabled);
      setSites(enabled);
      setSelected(enabled.map(site => site.id));
    }).catch(failure => { if (mounted) setError(failure.message); });
    return () => {
      mounted = false;
      request.current?.abort();
      request.current = null;
    };
  }, []);

  const cancel = () => {
    request.current?.abort();
    request.current = null;
    setLoading(false);
  };
  const select = id => {
    if (!canReplaceLoadedWork()) return;
    cancel();
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
    setResult(null);
    setModels({});
    setConfirmedIssues({});
    setError("");
  };
  const load = async () => {
    if (!canReplaceLoadedWork()) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const data = await fetchCombinedOpenWork(selected, { signal: controller.signal });
      if (request.current === controller && !controller.signal.aborted) {
        setModels({});
        setConfirmedIssues({});
        setResult(data);
      }
    } catch (failure) {
      if (request.current === controller && !controller.signal.aborted) setError(failure.message);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  };
  const count = result?.sites.reduce((total, site) => total + site.loaded, 0) || 0;
  const allComplete = result?.sites.every(site => site.status === "complete");
  const editableSites = (result?.sites || []).filter((site) => site.sourceContext?.kind === "saved-site" && Array.isArray(site.issues) && site.status !== "failed");
  const table = buildCombinedTableModel(editableSites, models);
  const metricSites = (result?.sites || []).map((site) => {
    const model = models[site.instanceId];
    return { ...site, ...model?.jqlRuns[0], hydrationError: model?.jqlError, hydrationReady: model?.hydrationReady ?? false,
      jiraNotes: model?.jiraNotes || {}, jiraRowPriorities: model?.jiraRowPriorities || {},
      planningMetaByKey: model?.planningMetaByKey || {}, startDateByKey: model?.startDateByKey || {},
      completeDateByKey: model?.completeDateByKey || {}, teamPlanningMetaByKey: model?.teamPlanningMetaByKey || {},
      teamStartDateByKey: model?.teamStartDateByKey || {}, teamCompleteDateByKey: model?.teamCompleteDateByKey || {},
    };
  });
  const metrics = buildCombinedMetrics(metricSites);

  return (
    <section className="combined-open-work" aria-labelledby="combined-open-work-heading">
      <h2 id="combined-open-work-heading" className="ui header">Combined Open Work</h2>
      <p>Open issues assigned to the account configured for each selected Jira site. Open means the status category is not Done.</p>
      {error && <p className="ui negative message" role="alert">{error}</p>}
      {!sites && !error && <p role="status">Loading saved Jira sites…</p>}
      {sites?.length === 0 && <p>No enabled saved Jira sites. <a href="#/settings">Add a Jira site in Settings</a>.</p>}
      {sites?.length > 0 && <>
        <fieldset className="ui segment">
          <legend>Jira sites</legend>
          {sites.map(site => <label key={site.id} className="combined-open-work-site">
            <input type="checkbox" disabled={saving} checked={selected.includes(site.id)} onChange={() => select(site.id)} />
            {site.displayName} ({URL.canParse(site.baseUrl) ? new URL(site.baseUrl).hostname : "Invalid saved URL"})
          </label>)}
        </fieldset>
        {!selected.length && <p role="status">Select at least one Jira site.</p>}
        <button type="button" className="ui primary button" disabled={!selected.length || loading || saving} onClick={load}>{result ? "Refresh" : "Load open work"}</button>
        {loading && <button type="button" className="ui button" onClick={cancel}>Cancel</button>}
      </>}
      {loading && <p role="status">Loading open work…</p>}
      {result && <>
        {editableSites.map((site) => <CombinedSiteEditor key={`${result.fetchedAt}:${site.instanceId}`} site={site} onModel={onModel}
          confirmedIssues={confirmedIssues[site.sourceContext.siteHost]} onConfirmedIssue={onConfirmedIssue} />)}
        {editableSites.length > 0 && <>
          <MyMetricsSection run={{ ...metrics, label: "Combined Work" }} scope="combined-work" combinedMetrics={metrics}
            combinedSites={metricSites} jiraRowPriorities={table.jiraRowPriorities} />
          <div className="ui buttons" aria-label="Combined work presentation">
            <button type="button" className="ui button" aria-pressed={mode === "managed"} onClick={() => setMode("managed")}>Managed tasks</button>
            <button type="button" className="ui button" aria-pressed={mode === "list"} onClick={() => setMode("list")}>List</button>
          </div>
          {saving && <p role="status">Saving source changes. Wait for the result before refreshing or changing sites.</p>}
          {metricSites.filter((site) => site.sourceContext && !site.hydrationReady && !site.hydrationError).map((site) => <p key={site.instanceId} role="status">{site.displayName}: Loading source metadata and inherited dates before editing…</p>)}
          {metricSites.filter((site) => site.hydrationError).map((site) => <p key={site.instanceId} role="alert" className="ui warning message">{site.displayName}: {site.hydrationError}</p>)}
          <fieldset disabled={loading} hidden={mode !== "managed"} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            {Object.keys(models).length > 0 ? <JiraResultsTable {...table} statusOptions={STATUS_OPTIONS} /> : <p role="status">Loading saved source metadata…</p>}
          </fieldset>
        </>}
        <p role="status">{count} issues returned. Fetched {formatTimestamp(result.fetchedAt)}.</p>
        {result.sites.map(site => <p key={site.instanceId} className={site.status === "complete" ? "" : "ui warning message"} role={site.status === "complete" ? undefined : "alert"}>
          <strong>{site.displayName}</strong> ({site.siteHost || "Invalid saved URL"}): {site.status === "failed" ? "Failed" : `${site.loaded} issues — ${site.status}`}. {site.message}
        </p>)}
        {count === 0 && allComplete && <p>No open work assigned to these accounts.</p>}
        {count > 0 && <div hidden={editableSites.length > 0 && mode !== "list"} className="combined-open-work-table" role="region" aria-label="Combined open work results" tabIndex={0}>
          <table className="ui celled compact table">
            <thead><tr><th>Jira site</th><th>Issue</th><th>Title</th><th>Status</th><th>Jira priority</th><th>Due date</th></tr></thead>
            <tbody>{result.sites.flatMap(site => (models[site.instanceId]?.jqlRuns[0]?.issues.map((issue) => ({
              issueKey: issue.key, summary: issue.fields?.summary, status: issue.fields?.status?.name,
              jiraPriority: issue.fields?.priority?.name, dueDate: issue.fields?.duedate,
              url: `${site.sourceContext.baseUrl}/browse/${encodeURIComponent(issue.key)}`,
            })) || site.rows).map(row => <tr key={`${site.instanceId}:${site.siteHost}:${row.issueKey}`}>
              <td>{site.displayName}<br />{site.siteHost}</td>
              <td><a href={row.url} target="_blank" rel="noopener noreferrer">{row.issueKey}</a></td>
              <td>{row.summary}</td><td>{row.status}</td><td>{row.jiraPriority}</td><td>{row.dueDate || ""}</td>
            </tr>))}</tbody>
          </table>
        </div>}
      </>}
    </section>
  );
}
