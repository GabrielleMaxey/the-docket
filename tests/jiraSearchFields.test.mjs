import assert from "node:assert/strict";
import test from "node:test";
import { getJiraSearchFields } from "../server/lib/jiraSearchFields.mjs";

const fakeDb = (rows) => ({ prepare: () => ({ all: () => rows }) });

test("includes priority exactly once", () => {
  const fields = getJiraSearchFields(
    fakeDb([{ field_id: "priority" }, { field_id: "customfield_10008" }]),
  );
  assert.ok(fields.includes("priority"));
  assert.equal(fields.filter((f) => f === "priority").length, 1);
  for (const f of ["summary", "issuelinks", "updated"]) {
    assert.ok(fields.includes(f), `missing ${f}`);
  }
});

test("includes priority when no mapping repeats it", () => {
  const fields = getJiraSearchFields(fakeDb([]));
  assert.equal(fields.filter((f) => f === "priority").length, 1);
});
