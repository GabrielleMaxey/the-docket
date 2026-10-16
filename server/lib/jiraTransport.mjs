import { assertAllowedJiraBaseUrl } from "./jiraInstances.mjs";
import { parseJiraResponse } from "./jiraResponse.mjs";

const DEFAULT_TIMEOUT_MS = 30_000;
const SEARCH_PATHS = new Set(["/rest/api/3/search/jql", "/rest/api/3/search/approximate-count"]);

export const requestJira = async ({
  credentials, method = "GET", pathWithQuery, body, formData, signal,
  responseMode = "json", timeoutMs,
}) => {
  const { baseUrl, email, apiToken } = { ...credentials };
  const origin = assertAllowedJiraBaseUrl(baseUrl);
  const target = new URL(pathWithQuery, origin);
  if (!String(pathWithQuery).startsWith("/") || target.origin !== origin || target.username || target.password || target.hash) {
    throw new TypeError("Jira request must use a path on the configured site");
  }
  const configuredTimeout = Number(timeoutMs ?? process.env.JIRA_REQUEST_TIMEOUT_MS);
  const deadlineMs = Number.isSafeInteger(configuredTimeout) && configuredTimeout > 0 && configuredTimeout <= 2_147_483_647
    ? configuredTimeout : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Jira request timed out", "TimeoutError"));
  }, deadlineMs);

  try {
    requestSignal.throwIfAborted();
    const response = await fetch(target.href, {
      method,
      redirect: responseMode === "redirect" ? "manual" : "error",
      signal: requestSignal,
      headers: {
        Accept: responseMode === "redirect" ? "*/*" : "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
        // Fetch must supply the multipart boundary for FormData.
        ...(formData ? { "X-Atlassian-Token": "no-check" } : {}),
        ...(body && !formData ? { "Content-Type": "application/json" } : {}),
      },
      ...(formData ? { body: formData } : {}),
      ...(body && !formData ? { body: JSON.stringify(body) } : {}),
    });
    if (responseMode === "redirect") {
      const location = response.headers.get("location") || "";
      await response.body?.cancel();
      return { ok: response.ok, status: response.status, data: null, location };
    }
    // Keep the boundary closed even if a fetch implementation returns a redirect.
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new TypeError("Jira redirects are not allowed");
    }
    const data = await parseJiraResponse(response, requestSignal);
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    if (!timedOut) throw error;
    const isRead = ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) ||
      (method.toUpperCase() === "POST" && SEARCH_PATHS.has(target.pathname));
    return {
      ok: false, status: 504,
      data: {
        code: "JIRA_TIMEOUT", outcome: isRead ? "not-written" : "unknown",
        message: isRead ? "Jira did not respond before the request deadline. Your edits are preserved."
          : "Jira did not respond before the request deadline. Your edits are preserved. The change may have succeeded in Jira; check Jira before submitting again.",
      },
    };
  } finally {
    clearTimeout(timer);
  }
};
