import test from "node:test";
import assert from "node:assert/strict";
import { withDescriptionField, withPlainDescriptions } from "../server/lib/jiraSearchDescription.mjs";

test("withDescriptionField adds description once and does not mutate", () => {
  const base = ["summary", "status"];
  assert.deepEqual(withDescriptionField(base), ["summary", "status", "description"]);
  assert.deepEqual(base, ["summary", "status"]);
  assert.deepEqual(withDescriptionField(["summary", "description"]), ["summary", "description"]);
});

test("withPlainDescriptions converts ADF to text, trims length, leaves other issues alone", () => {
  const adf = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "Move billing mediation to Torchwood" }] }] };
  const out = withPlainDescriptions({ total: 3, issues: [
    { key: "A-1", fields: { summary: "S", description: adf } },
    { key: "A-2", fields: { summary: "S", description: null } },
    { key: "A-3", fields: { summary: "S" } },
    { key: "A-4", fields: { description: "x".repeat(5000) } },
  ] });
  assert.equal(out.total, 3);
  assert.match(out.issues[0].fields.description, /billing mediation to Torchwood/);
  assert.equal(out.issues[1].fields.description, "");
  assert.ok(!("description" in out.issues[2].fields));
  assert.equal(out.issues[3].fields.description.length, 2000);
  assert.deepEqual(withPlainDescriptions(null), null);
  assert.deepEqual(withPlainDescriptions({ error: "x" }), { error: "x" });
});
