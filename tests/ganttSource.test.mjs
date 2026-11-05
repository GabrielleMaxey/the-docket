import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseGanttSlug, resolveGanttSourceJql, ganttSnapshotKey, GANTT_MAX_JQL } from "../server/lib/ganttSource.mjs";

describe("parseGanttSlug", () => {
  it("recognises pinned, programs, presets and custom JQL", () => {
    assert.deepEqual(parseGanttSlug("__pinned__"), { kind: "pinned" });
    assert.deepEqual(parseGanttSlug("my-program"), { kind: "program", slug: "my-program" });
    assert.deepEqual(parseGanttSlug("preset:12"), { kind: "preset", presetId: 12 });
    assert.deepEqual(parseGanttSlug("jql:project = ODI"), { kind: "jql", jql: "project = ODI" });
  });
  it("rejects bad preset ids and empty or oversized JQL", () => {
    assert.equal(parseGanttSlug("preset:abc").kind, "invalid");
    assert.equal(parseGanttSlug("preset:0").kind, "invalid");
    assert.equal(parseGanttSlug("jql:   ").kind, "invalid");
    assert.equal(parseGanttSlug("jql:" + "x".repeat(GANTT_MAX_JQL + 1)).kind, "invalid");
    assert.equal(parseGanttSlug("").kind, "invalid");
  });
});

describe("resolveGanttSourceJql", () => {
  const loadPreset = (id) => (id === 5 ? { presetType: "jql", jql: "project = ALPHA AND statusCategory != Done ORDER BY rank", epicName: "Alpha work" } : null);
  const jiraRequest = async () => ({ ok: false });

  it("uses a preset's JQL, drops open-only filters and names it", async () => {
    const r = await resolveGanttSourceJql({ source: parseGanttSlug("preset:5"), loadPreset, jiraRequest });
    assert.equal(r.displayName, "Alpha work");
    assert.equal(r.jql, "project = ALPHA ORDER BY rank");
  });
  it("reports a missing preset", async () => {
    const r = await resolveGanttSourceJql({ source: parseGanttSlug("preset:9"), loadPreset, jiraRequest });
    assert.equal(r.error, "Preset not found");
  });
  it("adds a default order to custom JQL and labels it", async () => {
    const r = await resolveGanttSourceJql({ source: parseGanttSlug("jql:assignee = currentUser()"), loadPreset, jiraRequest });
    assert.equal(r.jql, "assignee = currentUser() ORDER BY updated DESC");
    assert.equal(r.displayName, "Custom JQL");
  });
  it("keeps the order clause of custom JQL", async () => {
    const r = await resolveGanttSourceJql({ source: parseGanttSlug("jql:project = A ORDER BY duedate"), loadPreset, jiraRequest });
    assert.equal(r.jql, "project = A ORDER BY duedate");
  });
});

describe("ganttSnapshotKey", () => {
  it("keeps short slugs and hashes long custom JQL to a bounded stable key", () => {
    assert.equal(ganttSnapshotKey("preset:5"), "preset:5");
    const long = "jql:" + "project = X OR ".repeat(30);
    const k = ganttSnapshotKey(long);
    assert.ok(k.length <= 120);
    assert.equal(k, ganttSnapshotKey(long));
    assert.notEqual(k, ganttSnapshotKey(long + "y"));
  });
});
