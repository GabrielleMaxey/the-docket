import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDirectReportsJql, normalizeMemberNames } from "../shared/directReportsJql.mjs";

describe("buildDirectReportsJql", () => {
  it("returns empty JQL when no names are provided", () => {
    assert.equal(buildDirectReportsJql([]), "");
  });

  it("uses assignee = for a single name", () => {
    assert.equal(
      buildDirectReportsJql(["Jane Doe"]),
      'assignee = "Jane Doe" ORDER BY updated DESC'
    );
  });

  it("uses assignee in (...) for multiple names and skips duplicates", () => {
    const jql = buildDirectReportsJql(["Jane Doe", "jane doe", "Bob"]);
    assert.equal(jql, 'assignee in ("Jane Doe", "Bob") ORDER BY updated DESC');
    assert.deepEqual(normalizeMemberNames([" Jane ", "", "Jane"]), ["Jane"]);
    assert.deepEqual(
      normalizeMemberNames("Jane Doe, jane@company.com, jane doe"),
      ["Jane Doe", "jane@company.com"]
    );
  });

  it("quotes Atlassian account IDs in assignee JQL without an accountid: prefix", () => {
    assert.equal(
      buildDirectReportsJql(["557058:c0b3c8e9-1234-4abc-9def-1234567890ab"]),
      'assignee = "557058:c0b3c8e9-1234-4abc-9def-1234567890ab" ORDER BY updated DESC'
    );
    assert.equal(
      buildDirectReportsJql(["712020:b5670baa-3192-4606-903a-8fa037076b6f"]),
      'assignee = "712020:b5670baa-3192-4606-903a-8fa037076b6f" ORDER BY updated DESC'
    );
    const mixed = buildDirectReportsJql([
      "Jane Doe",
      "jane@company.com",
      "accountid:557058:c0b3c8e9-1234-4abc-9def-1234567890ab",
    ]);
    assert.equal(
      mixed,
      'assignee in ("Jane Doe", "jane@company.com", "557058:c0b3c8e9-1234-4abc-9def-1234567890ab") ORDER BY updated DESC'
    );
    assert.deepEqual(
      normalizeMemberNames(
        "https://example.atlassian.net/jira/people/557058:c0b3c8e9-1234-4abc-9def-1234567890ab"
      ),
      ["557058:c0b3c8e9-1234-4abc-9def-1234567890ab"]
    );
  });

  it("parses assignee in (...) lists and leaves currentUser() unquoted", () => {
    assert.deepEqual(
      normalizeMemberNames(
        "assignee in (5daa26bfa627f40c2f3c43be, 712020:d230216f-5197-4712-b088-0983a3d72404, currentUser())"
      ),
      [
        "5daa26bfa627f40c2f3c43be",
        "712020:d230216f-5197-4712-b088-0983a3d72404",
        "currentUser()",
      ]
    );
    assert.equal(
      buildDirectReportsJql([
        "5daa26bfa627f40c2f3c43be",
        "712020:d230216f-5197-4712-b088-0983a3d72404",
        "currentUser()",
      ]),
      'assignee in ("5daa26bfa627f40c2f3c43be", "712020:d230216f-5197-4712-b088-0983a3d72404") ORDER BY updated DESC'
    );
    assert.equal(buildDirectReportsJql(["currentUser()"]), "");
  });
});
