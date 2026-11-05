// Flow report across several saved Jira sites. Same contract as combined open work:
// each site is searched with its own saved credentials, failures stay per-site and
// never include upstream text (it can hold credentials or personal data).
import { beginInstanceOperations, getInstanceCredentials, listInstances, MAX_JIRA_INSTANCES } from "./jiraInstances.mjs";
import { fetchFlowIssues } from "./flowReport.mjs";
import { requestJira as sendJiraRequest } from "./jiraTransport.mjs";

const baseOf = (baseUrl) => String(baseUrl || "").replace(/\/+$/, "");

const failureMessageFor = (status) => {
  if (status === 401 || status === 403) return "Jira access denied. Check this saved entry's account and server token.";
  if (status === 429) return "Jira rate limit reached. Retry this selection later.";
  if (status === 504) return "Jira request timed out. Retry this selection.";
  return "Jira search unavailable. Check the connection and retry this selection.";
};

/**
 * Pure core (no database): `sites` are { instanceId, displayName, baseUrl, credentials }.
 * Returns merged issues (display keys "Site: KEY" so identical keys on different sites stay distinct)
 * and a per-site status list.
 */
export const runFlowAcrossSites = async ({ sites, jql, requestJira = sendJiraRequest, signal, timeoutMs }) => {
  const perSite = await Promise.all(sites.map(async (site) => {
    const result = { instanceId: site.instanceId, displayName: site.displayName, siteHost: "", status: "failed", issueCount: 0, message: "" };
    let lastStatus = null;
    try {
      if (site.setupMessage) {
        result.message = site.setupMessage;
        return { result, issues: [] };
      }
      result.siteHost = new URL(site.baseUrl).hostname;
      if (!site.credentials?.email || !site.credentials?.apiToken) {
        result.message = "Set this saved entry's email in Settings and configure the server Jira token.";
        return { result, issues: [] };
      }
      const jiraRequest = async ({ method, pathWithQuery, body }) => {
        const response = await requestJira({ credentials: site.credentials, signal, timeoutMs, method, pathWithQuery, body });
        lastStatus = response?.status ?? null;
        return response;
      };
      const fetched = await fetchFlowIssues({ jql, jiraRequest, signal });
      const base = baseOf(site.baseUrl);
      const label = site.displayName;
      const issues = fetched.issues.map((issue) => ({
        ...issue,
        key: `${label}: ${issue.key}`,
        url: `${base}/browse/${encodeURIComponent(issue.key)}`,
        parent: issue.parent ? `${label}: ${issue.parent}` : "",
        parentUrl: issue.parent ? `${base}/browse/${encodeURIComponent(issue.parent)}` : "",
      }));
      result.status = fetched.isComplete ? "complete" : "partial";
      result.issueCount = issues.length;
      if (!fetched.isComplete) result.message = "Jira results are incomplete for this site; figures here may be understated.";
      return { result, issues };
    } catch {
      result.message = signal?.aborted ? "Collection deadline reached; this site's data is incomplete." : failureMessageFor(lastStatus);
      return { result, issues: [] };
    }
  }));
  return { issues: perSite.flatMap((entry) => entry.issues), sites: perSite.map((entry) => entry.result) };
};

/** Validates the selection, leases the sites, resolves credentials, then runs the pure core. */
export const collectCombinedFlowIssues = async ({ metaDb, instanceIds, jql, env = process.env, requestJira = sendJiraRequest, signal, timeoutMs }) => {
  const saved = listInstances(metaDb);
  if (!Array.isArray(instanceIds) || !instanceIds.length || instanceIds.length > MAX_JIRA_INSTANCES || new Set(instanceIds).size !== instanceIds.length
    || instanceIds.some((id) => typeof id !== "string" || !id.trim() || !saved.some((site) => site.id === id && site.enabled))) {
    throw Object.assign(new TypeError("Choose one to five unique enabled saved Jira entries."), { status: 400 });
  }
  signal?.throwIfAborted();
  const lease = beginInstanceOperations(metaDb, instanceIds);
  try {
    const sites = instanceIds.map((instanceId) => {
      const entry = saved.find((site) => site.id === instanceId);
      let credentials = null;
      let baseUrl = "";
      let setupMessage = "";
      try {
        credentials = Object.freeze({ ...getInstanceCredentials(metaDb, instanceId, env) });
        baseUrl = credentials.baseUrl;
      } catch {
        setupMessage = "Check this saved entry's approved HTTPS Jira URL in Settings.";
      }
      return { instanceId, displayName: entry.displayName, baseUrl, credentials, setupMessage };
    });
    return await runFlowAcrossSites({ sites, jql, requestJira, signal, timeoutMs });
  } finally {
    lease.release();
  }
};
