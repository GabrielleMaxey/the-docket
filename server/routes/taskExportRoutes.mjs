import { createTaskExportService } from "../lib/taskExport.mjs";

export const registerTaskExportRoutes = (app, context) => {
  const service = context.taskExportService || createTaskExportService(context);
  const run = handler => async (req, res) => {
    const controller = new AbortController();
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    req.on("aborted", abort);
    res.on("close", abort);
    res.setHeader("Cache-Control", "no-store");
    try {
      const result = await handler(req, controller.signal);
      if (!controller.signal.aborted) res.json(result);
    } catch (error) {
      if (!controller.signal.aborted) res.status(error.status || 500).json({ error: error.status ? error.message : "Export preview unavailable. Retry the preview.", code: error.status ? error.code : "TASK_EXPORT_FAILED" });
    } finally { req.off("aborted", abort); res.off("close", abort); }
  };
  app.get("/api/task-export/sites/:id/scopes", run((req, signal) => service.getExportScopes(req.params.id, { signal })));
  app.post("/api/task-export/preview", run((req, signal) => service.createPreview({ ...req.body, signal })));
  return service;
};
