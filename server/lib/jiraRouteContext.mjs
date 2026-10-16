import { resolveJiraUser, fetchJiraMyself } from "./jiraSearchHelpers.mjs";
import { getJiraSearchFields } from "./jiraSearchFields.mjs";
import { createLogger } from "./logger.mjs";
import { hasOnlyWorkfrontJiraErrors, sanitizeJiraErrorData } from "../../shared/jiraErrorUtils.mjs";
import { extractMediaIdFromUrl } from "./jiraNoteComment.mjs";
import { requestJira as sendJiraRequest } from "./jiraTransport.mjs";

const log = createLogger("server");
const JIRA_SEARCH_JQL_PATH = "/rest/api/3/search/jql";

export const getRequestOperationContext = (req, fallback) => req.docketOperation || fallback;

export const createJiraRouteContext = ({ getCredentials, getDb, getNoteImagesDir, getSiteContext, requestJira = sendJiraRequest, env = process.env }) => {
  const getMissingEnv = () => {
    const c = getCredentials();
    const missing = [];
    if (!c.baseUrl) missing.push(c.mode === "legacy" ? "JIRA_BASE_URL" : "instance.baseUrl");
    if (!c.email) missing.push(c.mode === "legacy" ? "JIRA_EMAIL" : "instance.email");
    if (!c.apiToken) missing.push("JIRA_API_TOKEN");
    return missing;
  };

  const ensureEnvOrRespond = (res) => {
    const configurationError = getCredentials().configurationError;
    if (configurationError) {
      res.status(400).json({ error: configurationError });
      return false;
    }
    const missing = getMissingEnv();
    if (missing.length > 0) {
      res.status(500).json({ error: "Missing required Jira environment variables", missing });
      return false;
    }
    return true;
  };


  const jiraRequest = async (options) => {
    const result = await requestJira({ timeoutMs: env.JIRA_REQUEST_TIMEOUT_MS, ...options, credentials: getCredentials() });
    const { method = "GET" } = options;
    if (!result.ok) {
      const sanitized = sanitizeJiraErrorData(result.data);
      if (hasOnlyWorkfrontJiraErrors(result.data)) {
        log.warn(`${method} Jira request → ${result.status} (Workfront sync error suppressed)`);
        return { ok: true, status: result.status, data: sanitized || {}, workfrontSuppressed: true };
      }
      log.error(`${method} Jira request → ${result.status}`);
      return { ...result, data: sanitized || {} };
    }
    log.debug(`${method} Jira request → ${result.status}`);
    return result;
  };

  const jiraMultipartRequest = async (options) => {
    const result = await requestJira({ method: "POST", timeoutMs: env.JIRA_REQUEST_TIMEOUT_MS, ...options, credentials: getCredentials() });
    if (!result.ok) {
      log.error(`Jira upload → ${result.status}`);
      return { ...result, data: sanitizeJiraErrorData(result.data) || {} };
    }
    log.debug(`Jira upload → ${result.status}`);
    return result;
  };

  const resolveJiraAttachmentMediaId = async (attachmentId) => {
    const id = String(attachmentId || "").trim();
    if (!id) return "";
    const result = await requestJira({
      timeoutMs: env.JIRA_REQUEST_TIMEOUT_MS, credentials: getCredentials(),
      pathWithQuery: `/rest/api/3/attachment/content/${encodeURIComponent(id)}`,
      responseMode: "redirect",
    });
    return extractMediaIdFromUrl(result.location || "");
  };

  const runJiraSearchRequest = async (input, legacyOptions = {}) => {
    const payload =
      typeof input === "string"
        ? { jql: input, ...(legacyOptions || {}) }
        : (input || {});

    const {
      jql,
      maxResults = 200,
      fields,
      nextPageToken,
      res,
    } = payload;

    if (res && !ensureEnvOrRespond(res)) {
      return null;
    }

    const requestBody = {
      jql,
      maxResults,
      fields: fields || getJiraSearchFields(getDb()),
      ...(nextPageToken ? { nextPageToken } : {}),
    };

    const result = await jiraRequest({
      method: "POST",
      pathWithQuery: JIRA_SEARCH_JQL_PATH,
      body: requestBody,
    });

    // Legacy inline handlers expect auto-response behavior and plain data.
    if (res) {
      if (!result.ok) {
        res.status(result.status).json(result.data);
        return null;
      }
      return result.data;
    }

    // Route modules and helpers expect a normalized { ok, status, data } object.
    return result;
  };

  return { getCredentials, getDb, getNoteImagesDir, getSiteContext, getMissingEnv, ensureEnvOrRespond,
    jiraRequest, jiraMultipartRequest, resolveJiraAttachmentMediaId, runJiraSearchRequest, resolveJiraUser,
    resolveCurrentJiraUser: () => fetchJiraMyself({ jiraRequest }) };
};
