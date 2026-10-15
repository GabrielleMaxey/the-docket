import { randomUUID } from "node:crypto";

const changed = () => Object.assign(new Error("The active Jira site changed. Keep your drafts and reload before continuing."), {
  status: 409,
  code: "SITE_CONTEXT_CHANGED",
});

export const createSiteOperationState = ({ snapshot, activate }) => {
  let active = Object.freeze({ ...snapshot, credentials: Object.freeze({ ...snapshot.credentials }) });
  let generation = randomUUID();
  let leases = 0;
  let switching = false;
  let drained;
  const getSiteContext = () => Object.freeze({
    instanceId: active.credentials.instanceId || null,
    siteHost: active.credentials.baseUrl ? new URL(active.credentials.baseUrl).hostname : "",
    baseUrl: active.credentials.baseUrl || "",
    generation,
  });
  const beginSiteOperation = (expectedContext) => {
    const context = getSiteContext();
    if (switching || !expectedContext || expectedContext.generation !== generation ||
        (expectedContext.instanceId || "legacy") !== (context.instanceId || "legacy")) {
      throw changed();
    }
    leases += 1;
    let released = false;
    return { context, release: () => {
      if (released) return;
      released = true;
      leases -= 1;
      if (leases === 0) drained?.();
    } };
  };
  const withSiteOperation = (handler) => async (req, res, next) => {
    let operation;
    try {
      if (!req.headers["x-docket-site"] || !req.headers["x-docket-generation"]) throw changed();
      operation = beginSiteOperation({ instanceId: req.headers["x-docket-site"], generation: req.headers["x-docket-generation"] });
    } catch (error) {
      if (error.code !== "SITE_CONTEXT_CHANGED") throw error;
      return res.status(409).json({ error: error.message, code: error.code, siteContext: getSiteContext() });
    }
    try {
      return await handler(req, res, next);
    } finally {
      // A disconnected response does not mean the handler's database/Jira work is finished.
      operation.release();
    }
  };
  const changeSite = async (expectedGeneration, mutation) => {
    if (switching || expectedGeneration !== generation) throw changed();
    switching = true;
    try {
      if (leases > 0) await new Promise((resolve) => { drained = resolve; });
      const id = await mutation();
      const next = await activate(id);
      active = Object.freeze({ ...next, credentials: Object.freeze({ ...next.credentials }) });
      generation = randomUUID();
      return getSiteContext();
    } finally {
      drained = null;
      switching = false;
    }
  };
  return {
    getSnapshot: () => active,
    getSiteContext,
    beginSiteOperation,
    withSiteOperation,
    changeSite,
    switchSite: (id, expectedGeneration) => changeSite(expectedGeneration, () => id),
  };
};
