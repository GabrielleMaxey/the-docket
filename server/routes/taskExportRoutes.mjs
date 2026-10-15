import { createTaskExportService } from "../lib/taskExport.mjs";
import { buildTaskWorkbook } from "../lib/taskWorkbook.mjs";

export const registerTaskExportRoutes = (app, context) => {
  const service = context.taskExportService || createTaskExportService(context);
  const run = handler => async (req, res) => {
    const controller = new AbortController();
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    req.on("aborted", abort);
    res.on("close", abort);
    if (req.aborted || res.destroyed) abort();
    res.setHeader("Cache-Control", "no-store");
    try {
      const result = await handler(req, controller.signal, res);
      if (!controller.signal.aborted && !res.headersSent) res.json(result);
    } catch (error) {
      if (!controller.signal.aborted) res.status(error.status || 500).json({ error: error.status ? error.message : "Export preview unavailable. Retry the preview.", code: error.status ? error.code : "TASK_EXPORT_FAILED" });
    } finally { req.off("aborted", abort); res.off("close", abort); }
  };
  app.get("/api/task-export/sites/:id/scopes", run((req, signal) => service.getExportScopes(req.params.id, { signal })));
  app.post("/api/task-export/preview", run((req, signal) => service.createPreview({ ...req.body, signal })));
  app.post("/api/task-export/download", run(async (req, signal, res) => {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["previewId", "excludedRows", "allowPartial"].includes(key)) || typeof body.previewId !== "string" || !body.previewId || (body.allowPartial !== undefined && typeof body.allowPartial !== "boolean") || (body.excludedRows !== undefined && !Array.isArray(body.excludedRows))) {
      throw Object.assign(new Error("Submit only previewId, excludedRows and boolean allowPartial. Preview again if needed."), { status: 400, code: "TASK_EXPORT_INVALID" });
    }
    if (signal.aborted) return;
    const { snapshot } = service.getPreview(body.previewId);
    if (signal.aborted) return;
    const bytes = await buildTaskWorkbook(snapshot, { excludedRows: body.excludedRows, allowPartial: body.allowPartial });
    if (signal.aborted) return;
    service.getPreview(body.previewId);
    const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="docket-tasks-${timestamp}.xlsx"`);
    res.send(bytes);
  }));
  return service;
};
