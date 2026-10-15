import React from "react";
import { fetchCombinedOpenWork, fetchJiraInstances } from "../services/jiraClient";
import { formatTimestamp } from "../utils/format";
import "./combinedOpenWork.css";

export default function CombinedOpenWork() {
  const [sites, setSites] = React.useState(null);
  const [selected, setSelected] = React.useState([]);
  const [result, setResult] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const request = React.useRef(null);

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
    cancel();
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
    setResult(null);
    setError("");
  };
  const load = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const data = await fetchCombinedOpenWork(selected, { signal: controller.signal });
      if (request.current === controller && !controller.signal.aborted) setResult(data);
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
            <input type="checkbox" checked={selected.includes(site.id)} onChange={() => select(site.id)} />
            {site.displayName} ({URL.canParse(site.baseUrl) ? new URL(site.baseUrl).hostname : "Invalid saved URL"})
          </label>)}
        </fieldset>
        {!selected.length && <p role="status">Select at least one Jira site.</p>}
        <button type="button" className="ui primary button" disabled={!selected.length || loading} onClick={load}>{result ? "Refresh" : "Load open work"}</button>
        {loading && <button type="button" className="ui button" onClick={cancel}>Cancel</button>}
      </>}
      {loading && <p role="status">Loading open work…</p>}
      {result && <>
        <p role="status">{count} issues returned. Fetched {formatTimestamp(result.fetchedAt)}.</p>
        {result.sites.map(site => <p key={site.instanceId} className={site.status === "complete" ? "" : "ui warning message"} role={site.status === "complete" ? undefined : "alert"}>
          <strong>{site.displayName}</strong> ({site.siteHost || "Invalid saved URL"}): {site.status === "failed" ? "Failed" : `${site.loaded} issues — ${site.status}`}. {site.message}
        </p>)}
        {count === 0 && allComplete && <p>No open work assigned to these accounts.</p>}
        {count > 0 && <div className="combined-open-work-table" role="region" aria-label="Combined open work results" tabIndex={0}>
          <table className="ui celled compact table">
            <thead><tr><th>Jira site</th><th>Issue</th><th>Title</th><th>Status</th><th>Jira priority</th><th>Due date</th></tr></thead>
            <tbody>{result.sites.flatMap(site => site.rows.map(row => <tr key={`${site.instanceId}:${site.siteHost}:${row.issueKey}`}>
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
