import { buildFlowJql, resolveFlowWindow } from "../lib/flowReport.mjs";
import { collectCombinedFlowIssues } from "../lib/combinedFlowReport.mjs";
import { buildFlowReportMarkdown, computeFlowReport } from "../../shared/flowMetrics.mjs";

const ALLOWED_KEYS = new Set(["instanceIds", "windowMonths", "stalledDays", "includeHandedOn"]);

export const registerCombinedFlowReportRoute = (app, context) => {
  const collectFlow = context.collectFlow || collectCombinedFlowIssues;

  app.post("/api/combined-flow-report", async (req, res) => {
    const controller = new AbortController();
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    req.on("aborted", abort);
    res.on("close", abort);
    res.setHeader("Cache-Control", "no-store");
    try {
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !ALLOWED_KEYS.has(key))) {
        throw Object.assign(new TypeError("Submit only instanceIds, windowMonths, stalledDays and includeHandedOn."), { status: 400 });
      }
      const { windowStart, windowEnd, months, windowLabel } = resolveFlowWindow({ windowMonths: body.windowMonths });
      const stalledDays = Math.min(365, Math.max(7, Number.parseInt(body.stalledDays, 10) || 30));
      const jql = buildFlowJql({ windowStart, includeHandedOn: body.includeHandedOn === true });
      const { issues, sites } = await collectFlow({
        metaDb: context.metaDb, env: context.env, requestJira: context.requestJira,
        instanceIds: body.instanceIds, jql, signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      const data = computeFlowReport(issues, {
        now: new Date(), windowStart, windowEnd, stalledDays, windowLabel,
        siteLabel: sites.map((site) => site.displayName).join(", "), siteCount: sites.length,
        includeHandedOn: body.includeHandedOn === true,
      });
      const problems = sites.filter((site) => site.status !== "complete");
      const notes = problems.map((site) => `${site.displayName}: ${site.status === "failed" ? "not included. " : "incomplete. "}${site.message}`);
      data.meta = {
        ...data.meta, windowMonths: months, combined: true,
        sites: sites.map(({ displayName, siteHost, status, issueCount, message }) => ({ displayName, siteHost, status, issueCount, message })),
        isComplete: problems.length === 0,
      };
      if (notes.length) data.footnote = `${notes.join(" ")} ${data.footnote}`;
      return res.json({ data, markdown: buildFlowReportMarkdown(data) });
    } catch (error) {
      if (controller.signal.aborted) return;
      const status = error?.status === 400 ? 400 : 500;
      return res.status(status).json({ error: status === 400 ? error.message : "Combined flow report unavailable. Retry the selection." });
    } finally {
      req.off("aborted", abort);
      res.off("close", abort);
    }
  });
};
