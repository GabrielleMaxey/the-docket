import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import Database from "better-sqlite3";
import { initDatabase } from "../server/db/schema.mjs";
import { registerAppConfigRoutes } from "../server/routes/appConfigRoutes.mjs";

const withServer = async (testFn) => {
  const app = express();
  app.use(express.json());
  const db = new Database(":memory:");
  initDatabase(db);
  registerAppConfigRoutes(app, {
    db,
    jiraRequest: async () => ({ ok: true, status: 200, data: {} }),
    ensureEnvOrRespond: () => true,
    runJiraSearchRequest: async () => ({ ok: true, status: 200, data: { issues: [] } }),
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  const request = (pathname, options) =>
    fetch(`http://127.0.0.1:${server.address().port}${pathname}`, options);

  try {
    return await testFn({ db, request });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
};

describe("epic preset routes", () => {
  it("saves jiraFilterId on a JQL preset instead of discarding it", async () => {
    await withServer(async ({ db, request }) => {
      const response = await request("/api/epic-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetType: "jql",
          epicName: "Imported from filter",
          jql: "assignee = currentUser() ORDER BY updated DESC",
          jiraFilterId: "12345",
        }),
      });

      assert.equal(response.status, 201);
      const body = await response.json();
      assert.equal(body.jiraFilterId, "12345");
      assert.equal(
        db.prepare("SELECT jira_filter_id FROM epic_presets WHERE id = ?").get(body.id).jira_filter_id,
        "12345"
      );
    });
  });

  it("preserves an existing jiraFilterId on a JQL preset update that doesn't change it", async () => {
    await withServer(async ({ request }) => {
      const created = await request("/api/epic-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetType: "jql",
          epicName: "Imported from filter",
          jql: "assignee = currentUser() ORDER BY updated DESC",
          jiraFilterId: "12345",
        }),
      }).then((res) => res.json());

      const updated = await request(`/api/epic-presets/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epicName: "Renamed" }),
      }).then((res) => res.json());

      assert.equal(updated.epicName, "Renamed");
      assert.equal(updated.jiraFilterId, "12345");
    });
  });
});

describe("reminder routes", () => {
  it("returns four empty slots when nothing is saved", async () => {
    await withServer(async ({ request }) => {
      const response = await request("/api/reminders");
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.items, [
        { text: "", done: false },
        { text: "", done: false },
        { text: "", done: false },
        { text: "", done: false },
      ]);
    });
  });

  it("saves and reloads reminder text and done state", async () => {
    await withServer(async ({ request }) => {
      const putResponse = await request("/api/reminders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reminders: [
            { text: "Ping the vendor", done: false },
            { text: "Renew badge", done: true },
          ],
        }),
      });
      assert.equal(putResponse.status, 200);
      const putBody = await putResponse.json();
      assert.deepEqual(putBody.items[0], { text: "Ping the vendor", done: false });
      assert.deepEqual(putBody.items[1], { text: "Renew badge", done: true });
      assert.deepEqual(putBody.items[2], { text: "", done: false });

      const getResponse = await request("/api/reminders");
      const getBody = await getResponse.json();
      assert.deepEqual(getBody.items, putBody.items);
    });
  });

  it("clearing a slot's text via PUT persists the clear", async () => {
    await withServer(async ({ request }) => {
      await request("/api/reminders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminders: [{ text: "Follow up", done: true }] }),
      });

      const response = await request("/api/reminders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminders: [{ text: "", done: false }] }),
      });

      const body = await response.json();
      assert.deepEqual(body.items[0], { text: "", done: false });
    });
  });
});
