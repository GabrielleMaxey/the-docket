import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getProjectKeyFromIssueKey,
  detectCrossTeamLinks,
  buildDescendantFieldIds,
} from "../server/lib/epicWorkloadEvaluation.mjs";

describe("getProjectKeyFromIssueKey", () => {
  it("extracts the project prefix from a standard issue key", () => {
    assert.equal(getProjectKeyFromIssueKey("ODI-1234"), "ODI");
    assert.equal(getProjectKeyFromIssueKey("SYNC-41"), "SYNC");
  });

  it("returns empty string for malformed input", () => {
    assert.equal(getProjectKeyFromIssueKey("not-a-key"), "");
    assert.equal(getProjectKeyFromIssueKey(""), "");
    assert.equal(getProjectKeyFromIssueKey(null), "");
    assert.equal(getProjectKeyFromIssueKey("lowercase-123"), "");
  });
});

describe("detectCrossTeamLinks", () => {
  const buildLinkedIssue = (key, summary, status) => ({
    key,
    fields: { summary, status: { name: status } },
  });

  it("flags outward links to a different project", () => {
    const issue = {
      fields: {
        issuelinks: [
          {
            type: { outward: "blocks" },
            outwardIssue: buildLinkedIssue("NET-500", "Network cutover", "In Progress"),
          },
        ],
      },
    };
    const found = detectCrossTeamLinks(issue, "ODI");
    assert.equal(found.length, 1);
    assert.equal(found[0].linkedKey, "NET-500");
    assert.equal(found[0].linkedProject, "NET");
    assert.equal(found[0].linkType, "blocks");
  });

  it("flags inward links to a different project", () => {
    const issue = {
      fields: {
        issuelinks: [
          {
            type: { inward: "is blocked by" },
            inwardIssue: buildLinkedIssue("SEC-42", "Security review", "Backlog"),
          },
        ],
      },
    };
    const found = detectCrossTeamLinks(issue, "ODI");
    assert.equal(found.length, 1);
    assert.equal(found[0].linkType, "is blocked by");
  });

  it("does not flag links within the same project", () => {
    const issue = {
      fields: {
        issuelinks: [
          {
            type: { outward: "relates to" },
            outwardIssue: buildLinkedIssue("ODI-999", "Same team task", "Done"),
          },
        ],
      },
    };
    assert.deepEqual(detectCrossTeamLinks(issue, "ODI"), []);
  });

  it("returns an empty array for an issue with no links", () => {
    assert.deepEqual(detectCrossTeamLinks({ fields: {} }, "ODI"), []);
    assert.deepEqual(detectCrossTeamLinks({}, "ODI"), []);
  });

  it("handles a mix of same-project and cross-project links correctly", () => {
    const issue = {
      fields: {
        issuelinks: [
          { type: { outward: "blocks" }, outwardIssue: buildLinkedIssue("NET-500", "A", "Open") },
          { type: { outward: "relates to" }, outwardIssue: buildLinkedIssue("ODI-1", "B", "Done") },
          { type: { inward: "is blocked by" }, inwardIssue: buildLinkedIssue("SEC-1", "C", "Open") },
        ],
      },
    };
    const found = detectCrossTeamLinks(issue, "ODI");
    assert.equal(found.length, 2);
    assert.deepEqual(found.map((f) => f.linkedKey).sort(), ["NET-500", "SEC-1"]);
  });
});

describe("buildDescendantFieldIds", () => {
  it("always includes the base descendant fields", () => {
    const fields = buildDescendantFieldIds(new Map());
    for (const expected of ["summary", "status", "issuetype", "assignee", "parent", "duedate", "issuelinks"]) {
      assert.ok(fields.includes(expected), `expected ${expected} in field list`);
    }
  });

  it("includes mapped MRD/IDD field ids when present", () => {
    const mappings = new Map([
      ["most_recent_done_date", { fieldId: "customfield_10009" }],
      ["initial_done_date", { fieldId: "customfield_10008" }],
    ]);
    const fields = buildDescendantFieldIds(mappings);
    assert.ok(fields.includes("customfield_10009"));
    assert.ok(fields.includes("customfield_10008"));
  });

  it("does not throw when mappingsByRole is undefined", () => {
    assert.doesNotThrow(() => buildDescendantFieldIds(undefined));
  });
});
