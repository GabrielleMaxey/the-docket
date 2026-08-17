import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  reconcileSelectedEntryIds,
  watchTypeLabel,
} from "../src/Pages/pmEntrySelection.js";

describe("reconcileSelectedEntryIds", () => {
  it("selects every current id on first visit", () => {
    assert.deepEqual(
      reconcileSelectedEntryIds({ currentIds: [1, 2], selectedIds: null, knownIds: null }),
      { selectedIds: [1, 2], knownIds: [1, 2] }
    );
  });

  it("selects a newly added Settings entry without restoring deselected ones", () => {
    assert.deepEqual(
      reconcileSelectedEntryIds({
        currentIds: [1, 2, 3],
        selectedIds: [1],
        knownIds: [1, 2],
      }),
      { selectedIds: [1, 3], knownIds: [1, 2, 3] }
    );
  });

  it("drops stale ids after a DB reset and selects the live ones", () => {
    assert.deepEqual(
      reconcileSelectedEntryIds({
        currentIds: [1, 2],
        selectedIds: [99, 100],
        knownIds: [99, 100],
      }),
      { selectedIds: [1, 2], knownIds: [1, 2] }
    );
  });

  it("does not re-select everyone after a clear-all when knownIds is not yet stored", () => {
    assert.deepEqual(
      reconcileSelectedEntryIds({
        currentIds: [1, 2],
        selectedIds: [],
        knownIds: null,
      }),
      { selectedIds: [], knownIds: [1, 2] }
    );
  });
});

describe("watchTypeLabel", () => {
  it("labels reporter JQL separately from a generic custom query", () => {
    assert.equal(watchTypeLabel("jql", 'reporter = "Ada" ORDER BY updated DESC'), "Reporter");
    assert.equal(watchTypeLabel("jql", "project = ODI"), "Custom query");
    assert.equal(watchTypeLabel("person", ""), "Person");
  });
});
