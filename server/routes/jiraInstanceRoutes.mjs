// Jira instance registry: CRUD, activation, and connection test. Never echo apiToken.

import {
  listInstances,
  createInstance,
  updateInstance,
  deleteInstance,
  getActiveInstanceId,
  assertAllowedJiraBaseUrl,
  getAllowedJiraHosts,
} from "../lib/jiraInstances.mjs";
import { requestJira } from "../lib/jiraTransport.mjs";
import { createLogger } from "../lib/logger.mjs";

const log = createLogger("jira-instances");

export const registerJiraInstanceRoutes = (app, { metaDb, activateInstance, getCredentials, env = process.env }) => {
  const allowedHosts = getAllowedJiraHosts(env);
  const listPayload = () => ({
    instances: listInstances(metaDb),
    activeInstanceId: getActiveInstanceId(metaDb),
    legacyMode: getCredentials().mode === "legacy",
  });

  app.get("/api/jira/instances", (_req, res) => {
    res.json(listPayload());
  });

  app.post("/api/jira/instances", (req, res) => {
    const { displayName, baseUrl, email } = req.body || {};
    if (Object.hasOwn(req.body || {}, "apiToken")) {
      return res.status(400).json({ error: "Set JIRA_API_TOKEN in the server .env; submitted tokens are not accepted" });
    }
    if (!String(displayName || "").trim() || !String(email || "").trim()) {
      return res.status(400).json({ error: "displayName, baseUrl, and email are required" });
    }

    try {
      const instance = createInstance(metaDb, { displayName, baseUrl, email }, allowedHosts);
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

    try {
      const instance = updateInstance(metaDb, id, req.body || {}, allowedHosts);
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

  // Verify unsaved site settings with the environment token, without changing active state.
  app.post("/api/jira/instances/:id/test", async (req, res) => {
    const id = req.params.id;
    if (Object.hasOwn(req.body || {}, "apiToken")) {
      return res.status(400).json({ error: "Set JIRA_API_TOKEN in the server .env; submitted tokens are not accepted" });
    }
    const saved = listInstances(metaDb).find((instance) => instance.id === id);
    if (!saved && id !== "new") {
      return res.status(404).json({ error: "Jira instance not found" });
    }
    let baseUrl;
    try {
      baseUrl = assertAllowedJiraBaseUrl(req.body?.baseUrl ?? saved?.baseUrl, allowedHosts);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const email = String(req.body?.email ?? saved?.email ?? "").trim();
    const apiToken = String(env.JIRA_API_TOKEN || "").trim();
    if (!email || !apiToken) {
      return res.status(400).json({ error: "Set JIRA_API_TOKEN in the server .env, restart the app, and provide the site's email before testing" });
    }

    try {
      const result = await requestJira({
        credentials: { baseUrl, email, apiToken },
        pathWithQuery: "/rest/api/3/myself",
        timeoutMs: env.JIRA_REQUEST_TIMEOUT_MS,
      });
      const data = result.data;
      if (!result.ok) {
        if (data?.code === "JIRA_TIMEOUT") return res.status(result.status).json(data);
        return res.status(result.status).json({ error: "Connection failed. Check JIRA_API_TOKEN in the server .env and the site's email, then restart and test again" });
      }
      if (typeof data?.accountId !== "string" || !data.accountId.trim()) {
        return res.status(502).json({ error: "Jira identity could not be verified; the saved token has been preserved" });
      }
      // Only verification of the saved site/email can retire that site's recovery credential.
      if (saved && baseUrl === saved.baseUrl && email === saved.email) {
        metaDb.prepare("UPDATE jira_instances SET api_token = '' WHERE id = ? AND base_url = ? AND email = ?")
          .run(id, saved.baseUrl, saved.email);
      }
      return res.json({ ok: true, displayName: data?.displayName || "", accountId: data?.accountId || "" });
    } catch (error) {
      if (error instanceof TypeError || error instanceof SyntaxError) {
        return res.status(502).json({ error: "Connection could not be verified. Check the site's URL and JIRA_API_TOKEN in the server .env, then restart and test again" });
      }
      throw error;
    }
  });
};
