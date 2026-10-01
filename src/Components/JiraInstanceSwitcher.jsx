import React from "react";
import { activateJiraInstance, fetchJiraInstances } from "../services/jiraClient.js";

const JiraInstanceSwitcher = () => {
  const [state, setState] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetchJiraInstances()
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    setBusy(true);
    try {
      await activateJiraInstance(id);
      window.location.reload();
    } catch {
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
    </label>
  );
};

export default JiraInstanceSwitcher;
