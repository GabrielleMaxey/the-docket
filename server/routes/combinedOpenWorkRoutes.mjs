import { collectCombinedOpenWork } from "../lib/combinedOpenWork.mjs";

export const registerCombinedOpenWorkRoutes = (app, context) => {
  app.post("/api/combined-open-work", async (req, res) => {
    const controller = new AbortController();
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    req.on("aborted", abort);
    res.on("close", abort);
    if (req.aborted || res.destroyed) abort();
    res.setHeader("Cache-Control", "no-store");
    try {
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).some(key => key !== "instanceIds")) {
        throw Object.assign(new TypeError("Submit only instanceIds for saved Jira entries."), { status: 400 });
      }
      const result = await collectCombinedOpenWork({ metaDb: context.metaDb, env: context.env, requestJira: context.requestJira, instanceIds: req.body.instanceIds, signal: controller.signal });
      if (!controller.signal.aborted && !res.headersSent) res.json(result);
    } catch (error) {
      if (!controller.signal.aborted) res.status(error.status === 400 ? 400 : 500).json({ error: error.status === 400 ? error.message : "Combined open work unavailable. Retry the selection." });
    } finally {
      req.off("aborted", abort);
      res.off("close", abort);
    }
  });
};
