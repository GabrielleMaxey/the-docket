import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDirectReportsJql,
  extractAccountIdsFromText,
  extractAccountIdsFromTexts,
  humanizeJqlAccountIds,
  normalizeMemberNames,
} from "../shared/directReportsJql.mjs";

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

describe("humanizeJqlAccountIds", () => {
  it("swaps a resolved account id quoted in JQL for its display name", () => {
    const jql = 'assignee = "5d715a231d7bfa0d9cf263af" ORDER BY updated DESC';
    const resolved = { "5d715a231d7bfa0d9cf263af": "Gabrielle Maxey" };
    assert.equal(
      humanizeJqlAccountIds(jql, resolved),
      'assignee = "Gabrielle Maxey" ORDER BY updated DESC'
    );
  });

  it("swaps every resolved id in an assignee in (...) list, leaves unresolved ones as-is", () => {
    const jql = 'assignee in ("5d715a231d7bfa0d9cf263af", "601874f6332cbe007003de62") ORDER BY updated DESC';
    const resolved = { "5d715a231d7bfa0d9cf263af": "Gabrielle Maxey" };
    assert.equal(
      humanizeJqlAccountIds(jql, resolved),
      'assignee in ("Gabrielle Maxey", "601874f6332cbe007003de62") ORDER BY updated DESC'
    );
  });

  it("leaves non-account-id quoted strings and empty/missing JQL untouched", () => {
    const jql = 'reporter = "Jane Doe" ORDER BY updated DESC';
    assert.equal(humanizeJqlAccountIds(jql, { "5d715a231d7bfa0d9cf263af": "X" }), jql);
    assert.equal(humanizeJqlAccountIds("", {}), "");
    assert.equal(humanizeJqlAccountIds(null, {}), "");
  });

  it("swaps bare (unquoted) account ids inside assignee IN (...), quoting the swapped-in name", () => {
    const jql =
      "project = ODI AND assignee IN (5daa26bfa627f40c2f3c43be, 712020:d230216f-5197-4712-b088-0983a3d72404, currentUser()) ORDER BY created DESC";
    const resolved = {
      "5daa26bfa627f40c2f3c43be": "Alice Smith",
      "712020:d230216f-5197-4712-b088-0983a3d72404": "Bob Jones",
    };
    assert.equal(
      humanizeJqlAccountIds(jql, resolved),
      'project = ODI AND assignee IN ("Alice Smith", "Bob Jones", currentUser()) ORDER BY created DESC'
    );
  });
});

describe("extractAccountIdsFromText(s)", () => {
  it("finds a bare account id token", () => {
    assert.deepEqual(extractAccountIdsFromText("5d715a231d7bfa0d9cf263af"), [
      "5d715a231d7bfa0d9cf263af",
    ]);
  });

  it("finds account ids quoted inside JQL, ignoring non-id quoted values", () => {
    assert.deepEqual(
      extractAccountIdsFromText('assignee in ("5d715a231d7bfa0d9cf263af", "Jane Doe")'),
      ["5d715a231d7bfa0d9cf263af"]
    );
  });

  it("dedupes across multiple texts", () => {
    assert.deepEqual(
      extractAccountIdsFromTexts([
        "5d715a231d7bfa0d9cf263af",
        'assignee = "5d715a231d7bfa0d9cf263af"',
        'assignee = "601874f6332cbe007003de62"',
        "",
      ]).sort(),
      ["5d715a231d7bfa0d9cf263af", "601874f6332cbe007003de62"]
    );
  });

  it("finds bare account ids inside an unquoted assignee IN (...) list", () => {
    assert.deepEqual(
      extractAccountIdsFromText(
        "assignee IN (5daa26bfa627f40c2f3c43be, 712020:d230216f-5197-4712-b088-0983a3d72404, currentUser())"
      ).sort(),
      ["5daa26bfa627f40c2f3c43be", "712020:d230216f-5197-4712-b088-0983a3d72404"]
    );
  });
});
