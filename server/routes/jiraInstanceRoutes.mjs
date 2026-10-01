// Jira instance registry: CRUD, activation, and connection test. Never echo apiToken.

import {
  listInstances,
  createInstance,
  updateInstance,
  deleteInstance,
  getActiveInstanceId,
  getInstanceCredentials,
  normalizeBaseUrl,
} from "../lib/jiraInstances.mjs";
import { parseJiraResponse } from "../lib/jiraResponse.mjs";
import { createLogger } from "../lib/logger.mjs";

const log = createLogger("jira-instances");

const isValidBaseUrl = (value) => {
  try {
    return new URL(value).protocol.startsWith("http");
  } catch {
    return false;
  }
};

export const registerJiraInstanceRoutes = (app, { metaDb, activateInstance, getCredentials }) => {
  const listPayload = () => ({
    instances: listInstances(metaDb),
    activeInstanceId: getActiveInstanceId(metaDb),
    legacyMode: getCredentials().mode === "legacy",
  });

  app.get("/api/jira/instances", (_req, res) => {
    res.json(listPayload());
  });

  app.post("/api/jira/instances", (req, res) => {
    const { displayName, baseUrl, email, apiToken } = req.body || {};
    if (!String(displayName || "").trim() || !String(email || "").trim() || !String(apiToken || "").trim()) {
      return res.status(400).json({ error: "displayName, baseUrl, email, and apiToken are required" });
    }
    if (!isValidBaseUrl(baseUrl)) {
      return res.status(400).json({ error: "baseUrl must be a valid http(s) URL" });
    }

    try {
      const instance = createInstance(metaDb, { displayName, baseUrl, email, apiToken });
      // First site: activate immediately so local data seeds from legacy and the UI isn't stuck in limbo.
      if (listInstances(metaDb).length === 1 && !getActiveInstanceId(metaDb)) {
        activateInstance(instance.id);
      }
      log.info(`created Jira instance ${instance.id} "${instance.displayName}"`);
      return res.status(201).json(instance);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: message });
    }
  });

  app.patch("/api/jira/instances/:id", (req, res) => {
    const id = req.params.id;
    if (!listInstances(metaDb).some((instance) => instance.id === id)) {
      return res.status(404).json({ error: "Jira instance not found" });
    }
    if (req.body?.baseUrl !== undefined && !isValidBaseUrl(req.body.baseUrl)) {
      return res.status(400).json({ error: "baseUrl must be a valid http(s) URL" });
    }

    try {
      const instance = updateInstance(metaDb, id, req.body || {});
      log.info(`updated Jira instance ${id}`);
      return res.json(instance);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: message });
    }
  });

  app.delete("/api/jira/instances/:id", (req, res) => {
    const id = req.params.id;
    if (!listInstances(metaDb).some((instance) => instance.id === id)) {
      return res.status(404).json({ error: "Jira instance not found" });
    }

    const wasActive = getActiveInstanceId(metaDb) === id;
    const { activeInstanceId } = deleteInstance(metaDb, id);
    if (wasActive) {
      // Reopen the app DB against whatever deleteInstance chose (another instance, or null → legacy).
      activateInstance(activeInstanceId);
    }

    log.info(`deleted Jira instance ${id}`);
    return res.json({ ok: true, ...listPayload() });
  });

  app.post("/api/jira/instances/:id/activate", (req, res) => {
    const id = req.params.id;
    const instance = listInstances(metaDb).find((item) => item.id === id);
    if (!instance) {
      return res.status(404).json({ error: "Jira instance not found" });
    }
    if (!instance.enabled) {
      return res.status(400).json({ error: "Jira instance is disabled" });
    }

    try {
      const creds = activateInstance(id);
      log.info(`activated Jira instance ${id}`);
      res.json({
        ok: true,
        activeInstanceId: creds.instanceId,
        jiraBaseUrl: creds.baseUrl,
        displayName: creds.displayName,
        legacyMode: creds.mode === "legacy",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  // Tests unsaved form values directly — never routed through the active-instance jiraRequest helper,
  // and never touches active state, so in-progress edits can be verified before Save.
  app.post("/api/jira/instances/:id/test", async (req, res) => {
    const id = req.params.id;
    const bodyBaseUrl = normalizeBaseUrl(req.body?.baseUrl);
    const bodyEmail = String(req.body?.email || "").trim();
    const bodyApiToken = String(req.body?.apiToken || "").trim();
    const hasFullOverride =
      isValidBaseUrl(bodyBaseUrl) && bodyEmail !== "" && bodyApiToken !== "";

    let baseUrl;
    let email;
    let apiToken;
    if (hasFullOverride) {
      baseUrl = bodyBaseUrl;
      email = bodyEmail;
      apiToken = bodyApiToken;
    } else {
      const stored = getInstanceCredentials(metaDb, id);
      if (!stored) {
        return res.status(404).json({ error: "Jira instance not found" });
      }
      baseUrl = normalizeBaseUrl(stored.baseUrl);
      email = String(stored.email || "").trim();
      apiToken = String(stored.apiToken || "").trim();
      if (!isValidBaseUrl(baseUrl) || !email || !apiToken) {
        return res.status(400).json({ error: "baseUrl, email, and apiToken are required to test connection" });
      }
    }

    try {
      const response = await fetch(`${baseUrl}/rest/api/3/myself`, {
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
        },
      });
      const data = await parseJiraResponse(response);
      if (!response.ok) {
        const detail = data?.errorMessages?.join(" ") || data?.message || "Connection failed";
        return res.status(response.status).json({ error: detail });
      }
      return res.json({ ok: true, displayName: data?.displayName || "", accountId: data?.accountId || "" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(502).json({ error: message });
    }
  });
};
