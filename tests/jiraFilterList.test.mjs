import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listAvailableJiraFilters, mapJiraFilter } from "../server/lib/jiraFilterList.mjs";

describe("mapJiraFilter", () => {
  it("normalizes id, name, jql, and owner", () => {
    assert.deepEqual(
      mapJiraFilter({
        id: 42,
        name: " Shared bugs ",
        jql: " type = Bug ",
        owner: { displayName: "Ada" },
      }),
      { id: "42", name: "Shared bugs", jql: "type = Bug", owner: "Ada" }
    );
  });
});

describe("listAvailableJiraFilters", () => {
  it("paginates filter/search until isLast", async () => {
    const calls = [];
    const jiraRequest = async ({ pathWithQuery }) => {
      calls.push(pathWithQuery);
      if (pathWithQuery.includes("startAt=0")) {
        return {
          ok: true,
          status: 200,
          data: {
            isLast: false,
            values: [
              { id: "1", name: "A", jql: "assignee = currentUser()", owner: { displayName: "Ada" } },
            ],
          },
        };
      }
      return {
        ok: true,
        status: 200,
        data: {
          isLast: true,
          values: [
            { id: "2", name: "B", jql: "project = ODI", owner: { displayName: "Bob" } },
          ],
        },
      };
    };

    const result = await listAvailableJiraFilters({ jiraRequest });
    assert.equal(result.ok, true);
    assert.deepEqual(result.data.items, [
      { id: "1", name: "A", jql: "assignee = currentUser()", owner: "Ada" },
      { id: "2", name: "B", jql: "project = ODI", owner: "Bob" },
    ]);
    assert.equal(calls.length, 2);
    assert.match(calls[0], /\/rest\/api\/3\/filter\/search\?/);
    assert.match(calls[0], /expand=jql%2Cowner|expand=jql,owner/);
    assert.doesNotMatch(calls[0], /favourite/);
    assert.doesNotMatch(calls[0], /filter\/my/);
  });

  it("returns Jira errors without throwing", async () => {
    const result = await listAvailableJiraFilters({
      jiraRequest: async () => ({ ok: false, status: 401, data: { error: "Unauthorized" } }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
  });
});
