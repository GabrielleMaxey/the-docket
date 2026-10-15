import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { descriptionTextToAdf } from "../shared/jiraDescriptionAdf.mjs";

describe("descriptionTextToAdf", () => {
  it("returns null for empty", () => {
    assert.equal(descriptionTextToAdf(""), null);
  });
  it("renders bold markdown as strong mark", () => {
    const doc = descriptionTextToAdf("**Important**");
    assert.equal(doc.type, "doc");
    assert.equal(doc.content[0].content[0].marks[0].type, "strong");
  });
});
