import { getSiteContext, subscribeSiteContext } from "../utils/siteContextStore.js";
import React from "react";
import { activateJiraInstance, fetchJiraInstances } from "../services/jiraClient.js";

const LOAD_ATTEMPTS = 8;
const LOAD_RETRY_MS = 250;

const loadInstances = async () => {
  let lastError;
  for (let attempt = 0; attempt < LOAD_ATTEMPTS; attempt += 1) {
    try {
      return await fetchJiraInstances();
    } catch (error) {
      lastError = error;
      if (attempt < LOAD_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, LOAD_RETRY_MS));
      }
    }
  }
  throw lastError;
};

const JiraInstanceSwitcher = () => {
  const [state, setState] = React.useState(null);
  const siteContext = React.useSyncExternalStore(subscribeSiteContext, getSiteContext);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    loadInstances()
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [siteContext?.generation]);

  if (!state) return null;

  const { instances = [], activeInstanceId, legacyMode } = state;
  if (legacyMode && instances.length === 0) {
    return (
      <span className="app-nav-jira-switcher app-nav-jira-switcher--legacy" title="Configure more sites in Settings">
        Jira
      </span>
    );
  }

  const onChange = async (event) => {
    const id = event.target.value;
    if (!id || id === activeInstanceId) return;
    setError("");
    setBusy(true);
    try {
      await activateJiraInstance(id);
      setBusy(false);
    } catch (error) {
      setError(error.message);
      setBusy(false);
    }
  };

  return (
    <label className="app-nav-jira-switcher">
      <span className="app-nav-jira-switcher-label">Site</span>
      <select
        value={activeInstanceId || ""}
        onChange={onChange}
        disabled={busy || instances.length < 2}
        aria-label="Active Jira site"
      >
        {instances.map((inst) => (
          <option key={inst.id} value={inst.id}>
            {inst.displayName}
          </option>
        ))}
      </select>
      {/* The recovery notice is shown by the banner under the nav (with Dismiss); rendering it here
          too pushed the nav links off the right edge of the window. */}
      {error && <span role="alert" className="app-nav-jira-switcher-error" title={error}>{error}</span>}
    </label>
  );
};

export default JiraInstanceSwitcher;
