import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { registerReportRoutes } from "../server/routes/reportRoutes.mjs";
import { computeGanttPlanHealth } from "../shared/ganttPlanHealth.mjs";

const gi = (key, o = {}) => ({ key, summary: key, status: "To Do", statusCategory: "To Do", assignee: "Pat", startDate: "", dueDate: "", completeDate: "", plannedStart: "", plannedFinish: "", ...o });
const data = computeGanttPlanHealth([gi("A-1", { dueDate: "2026-10-01" }), gi("A-2", { statusCategory: "Done", status: "Done", dueDate: "2026-10-02", completeDate: "2026-10-03" })], { today: "2026-11-05", displayName: "Alpha" });

const withServer = async (fn, { latestRows = [] } = {}) => {
  const inserts = [];
  const db = { prepare: () => ({ run: (params) => { inserts.push(params); return { lastInsertRowid: 11 }; }, all: () => latestRows, get: () => undefined }) };
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  registerReportRoutes(app, { getDb: () => db, dataDir: ".", ensureEnvOrRespond: () => true, getCredentials: () => ({ baseUrl: "https://x.atlassian.net" }), getSiteContext: () => ({ siteHost: "x" }), jiraRequest: async () => ({ ok: true, data: {} }) });
  const server = await new Promise((resolve) => { const l = app.listen(0, "127.0.0.1", () => resolve(l)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const get = (path) => fetch(base + path);
  try { return await fn({ post, get, inserts }); } finally { await new Promise((resolve) => server.close(resolve)); }
};

describe("gantt plan health archive routes", () => {
  it("saves a snapshot as gantt_report with the data, slug and markdown", async () => {
    await withServer(async ({ post, inserts }) => {
      const response = await post("/api/reports/gantt-plan-health/archive", { data, slug: "alpha", savedAtLocal: "2026-11-05T12:00:00" });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).archiveId, 11);
      assert.equal(inserts[0].reportType, "gantt_report");
      assert.equal(inserts[0].source, "dashboard");
      const meta = JSON.parse(inserts[0].metaJson);
      assert.equal(meta.slug, "alpha");
      assert.equal(meta.ganttReport.items.length, 2);
      assert.match(inserts[0].content, /^# Plan health: Alpha/);
    });
  });

  it("rejects invalid data, a missing slug and oversized reports", async () => {
    await withServer(async ({ post, inserts }) => {
      assert.equal((await post("/api/reports/gantt-plan-health/archive", { data: { title: "x" }, slug: "alpha" })).status, 400);
      assert.equal((await post("/api/reports/gantt-plan-health/archive", { data, slug: "" })).status, 400);
      const huge = { ...data, items: new Array(6000).fill({ key: "A-1", summary: "x".repeat(120), status: "To Do", dueDate: "", plannedFinish: "", completeDate: "" }) };
      assert.equal((await post("/api/reports/gantt-plan-health/archive", { data: huge, slug: "alpha" })).status, 413);
      assert.equal(inserts.length, 0);
    });
  });

  it("returns the latest saved snapshot for a plan, or null", async () => {
    const latestRows = [{ id: 5, source: "dashboard", report_type: "gantt_report", label: "L", content: "md", created_at: "2026-10-01T10:00:00.000Z", meta_json: JSON.stringify({ slug: "alpha", ganttReport: data }) }];
    await withServer(async ({ get }) => {
      const found = await (await get("/api/reports/gantt-plan-health/latest?slug=alpha")).json();
      assert.equal(found.report.id, 5);
      assert.equal(found.report.createdAt, "2026-10-01T10:00:00.000Z");
      assert.equal(found.report.data.items.length, 2);
      const none = await (await get("/api/reports/gantt-plan-health/latest?slug=zzz")).json();
      assert.equal(none.report, null);
      assert.equal((await get("/api/reports/gantt-plan-health/latest")).status, 400);
    }, { latestRows });
  });
});
