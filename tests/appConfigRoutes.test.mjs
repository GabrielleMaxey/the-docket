import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import Database from "better-sqlite3";
import { initDatabase } from "../server/db/schema.mjs";
import { registerAppConfigRoutes } from "../server/routes/appConfigRoutes.mjs";

const withServer = async (testFn, { runJiraSearchRequest } = {}) => {
  const app = express();
  app.use(express.json());
  const db = new Database(":memory:");
  initDatabase(db);
  registerAppConfigRoutes(app, {
    getDb: () => db,
    jiraRequest: async () => ({ ok: true, status: 200, data: {} }),
    ensureEnvOrRespond: () => true,
    runJiraSearchRequest: runJiraSearchRequest || (async () => ({ ok: true, status: 200, data: { issues: [] } })),
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

describe("epic filter search limits", () => {
  it("passes requested limits for preset and past-due searches while preserving queries and results", async () => {
    const calls = [];
    const requestedLimit = 37;
    const presetJql = "project = ABC ORDER BY updated DESC";
    await withServer(async ({ db, request }) => {
      const { lastInsertRowid: presetId } = db.prepare(
        "INSERT INTO epic_presets (epic_key, epic_name, preset_type, jql) VALUES (?, ?, ?, ?)"
      ).run("ABC-100", "Synthetic epic", "epic", presetJql);
      db.prepare("DELETE FROM jira_field_mappings WHERE role != 'due_date'").run();

      const response = await request("/api/epic-filters/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epicPresetIds: [Number(presetId)], includePastDue: true, maxResults: requestedLimit }),
      });

      assert.equal(response.status, 200);
      const { runs } = await response.json();
      assert.equal(calls.length, 2);
      assert.equal(calls[0].jql, presetJql);
      assert.match(calls[1].jql, /^\(\(statusCategory != Done AND duedate is not EMPTY AND duedate < startOfDay\(\) AND duedate >= "\d{4}-\d{2}-\d{2}"\)\) AND \(parent in \(ABC-100\) OR key in \(ABC-100\)\) ORDER BY updated DESC$/);
      assert.deepEqual(calls.map((call) => call.maxResults), [requestedLimit, requestedLimit]);
      assert.equal(runs[0].jql, calls[0].jql);
      assert.equal(runs[1].jql, calls[1].jql);
      assert.deepEqual(runs[0].issues, [{ key: "ABC-1" }]);
      assert.equal(runs[0].total, 12);
      assert.equal(runs[0].error, null);
      assert.deepEqual(runs[1].issues, [{ key: "ABC-2" }]);
      assert.equal(runs[1].total, 1);
      assert.equal(runs[1].error, null);
    }, {
      runJiraSearchRequest: async (input, options = {}) => {
        calls.push(typeof input === "string" ? { jql: input, ...options } : input);
        return calls.length === 1
          ? { ok: true, status: 200, data: { issues: [{ key: "ABC-1" }], total: 12 } }
          : { ok: true, status: 200, data: { issues: [{ key: "ABC-2" }] } };
      },
    });
  });

  it("preserves search errors for preset and past-due runs", async () => {
    await withServer(async ({ db, request }) => {
      const { lastInsertRowid: presetId } = db.prepare(
        "INSERT INTO epic_presets (epic_key, epic_name, preset_type, jql) VALUES (?, ?, ?, ?)"
      ).run("ABC-100", "Synthetic epic", "epic", "project = ABC");

      const response = await request("/api/epic-filters/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epicPresetIds: [Number(presetId)], includePastDue: true, maxResults: 73 }),
      });

      assert.equal(response.status, 200);
      const { runs } = await response.json();
      assert.equal(runs.length, 2);
      for (const run of runs) {
        assert.equal(run.error, "Synthetic query rejected");
        assert.deepEqual(run.issues, []);
        assert.equal(run.total, 0);
      }
    }, {
      runJiraSearchRequest: async () => ({ ok: false, status: 400, data: { errorMessages: ["Synthetic query rejected"] } }),
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
