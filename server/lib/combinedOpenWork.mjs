import { beginInstanceOperations, getInstanceCredentials, listInstances, MAX_JIRA_INSTANCES } from "./jiraInstances.mjs";
import { searchAllIssues } from "./jiraSearchHelpers.mjs";
import { requestJira as sendJiraRequest } from "./jiraTransport.mjs";

const boundedSetting = (value, fallback, cap) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, cap) : fallback;
};
const text = value => typeof value === "string" ? value : "";

const projectRows = (issues, origin) => {
  const rows = [];
  const seen = new Set();
  for (const issue of issues) {
    if (typeof issue?.key !== "string" || !/^[A-Z][A-Z0-9_]*-\d+$/.test(issue.key)) throw new TypeError("Invalid Jira issue identity");
    if (seen.has(issue.key)) continue;
    seen.add(issue.key);
    rows.push({
      issueKey: issue.key,
      summary: text(issue.fields?.summary),
      status: text(issue.fields?.status?.name),
      jiraPriority: text(issue.fields?.priority?.name),
      dueDate: text(issue.fields?.duedate) || null,
      url: `${origin}/browse/${encodeURIComponent(issue.key)}`,
    });
  }
  return rows;
};

export const collectCombinedOpenWork = async ({ metaDb, instanceIds, env = process.env, requestJira = sendJiraRequest, signal: callerSignal }) => {
  const saved = listInstances(metaDb);
  if (!Array.isArray(instanceIds) || !instanceIds.length || instanceIds.length > MAX_JIRA_INSTANCES || new Set(instanceIds).size !== instanceIds.length || instanceIds.some(id => typeof id !== "string" || !id.trim() || !saved.some(site => site.id === id && site.enabled))) {
    throw Object.assign(new TypeError("Choose one to five unique enabled saved Jira entries."), { status: 400 });
  }
  callerSignal?.throwIfAborted();
  const lease = beginInstanceOperations(metaDb, instanceIds);
  const maxRows = boundedSetting(env.DOCKET_OPEN_WORK_MAX_ROWS_PER_SITE, 5000, 5000);
  const timeout = boundedSetting(env.DOCKET_OPEN_WORK_TIMEOUT_MS, 120000, 600000);
  const deadline = new AbortController();
  const signal = callerSignal ? AbortSignal.any([callerSignal, deadline.signal]) : deadline.signal;
  const deadlineAt = performance.now() + timeout;
  const timer = setTimeout(() => deadline.abort(new DOMException("Collection deadline reached", "TimeoutError")), timeout);
  const checkDeadline = () => {
    if (performance.now() >= deadlineAt && !deadline.signal.aborted) deadline.abort(new DOMException("Collection deadline reached", "TimeoutError"));
    signal.throwIfAborted();
  };
  try {
    const settled = await Promise.allSettled(instanceIds.map(async instanceId => {
      const entry = saved.find(site => site.id === instanceId);
      const site = { instanceId, displayName: entry.displayName, siteHost: "", status: "failed", rows: [], loaded: 0 };
      let failureMessage = "Jira search unavailable. Retry this selection.";
      try {
        failureMessage = "Check this saved entry's approved HTTPS Jira URL in Settings.";
        const credentials = Object.freeze({ ...getInstanceCredentials(metaDb, instanceId, env) });
        site.siteHost = new URL(credentials.baseUrl).hostname;
        failureMessage = "Set this saved entry's email in Settings and configure the server Jira token.";
        if (!credentials.email || !credentials.apiToken) return { ...site, message: failureMessage };
        failureMessage = "Jira search unavailable. Check the connection and retry this selection.";
        const search = await searchAllIssues({
          jql: "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC, key ASC",
          maxTotal: maxRows,
          signal,
          runJiraSearchRequest: async (jql, paging) => {
            checkDeadline();
            const result = await requestJira({ credentials, signal, timeoutMs: env.JIRA_REQUEST_TIMEOUT_MS, method: "POST", pathWithQuery: "/rest/api/3/search/jql", body: { jql, ...paging, fields: ["summary", "status", "priority", "duedate"] } });
            checkDeadline();
            if (!result?.ok) {
              if ([401, 403].includes(result?.status)) failureMessage = "Jira access denied. Check this saved entry's account and server token.";
              else if (result?.status === 429) failureMessage = "Jira rate limit reached. Retry this selection later.";
              else if (result?.status === 504) failureMessage = "Jira request timed out. Retry this selection.";
              throw new Error(failureMessage);
            }
            return result;
          },
        });
        site.rows = projectRows(search.issues, credentials.baseUrl);
        site.loaded = site.rows.length;
        if (!deadline.signal.aborted && performance.now() >= deadlineAt) deadline.abort(new DOMException("Collection deadline reached", "TimeoutError"));
        site.status = search.isComplete && !signal.aborted ? "complete" : "partial";
        if (site.status === "partial") {
          site.message = "Jira pagination is incomplete. Refresh to retry.";
          if (deadline.signal.aborted) site.message = "Collection deadline reached; this list is incomplete. Refresh to retry.";
          else if (search.completeness === "limit") site.message = `The ${maxRows}-row limit was reached; this list is incomplete.`;
        }
      } catch {
        // Upstream errors can contain credentials or personal data; return only local messages.
        site.rows = [];
        site.loaded = 0;
        site.message = deadline.signal.aborted ? "Collection deadline reached; this list is incomplete. Refresh to retry." : failureMessage;
        if (deadline.signal.aborted) site.status = "partial";
      }
      return site;
    }));
    callerSignal?.throwIfAborted();
    const rejected = settled.find(result => result.status === "rejected");
    if (rejected) throw rejected.reason;
    return { fetchedAt: new Date().toISOString(), sites: settled.map(result => result.value) };
  } finally {
    clearTimeout(timer);
    lease.release();
  }
};
