import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchJiraUserByAccountId, resolveJiraUser, searchAllIssues } from "../server/lib/jiraSearchHelpers.mjs";

const ACCOUNT_ID = "712020:b5670baa-3192-4606-903a-8fa037076b6f";

describe("resolveJiraUser", () => {
  it("loads a user by Atlassian account ID instead of user search", async () => {
    const calls = [];
    const jiraRequest = async ({ pathWithQuery }) => {
      calls.push(pathWithQuery);
      if (pathWithQuery.includes("/rest/api/3/user?")) {
        return {
          ok: true,
          data: {
            accountId: ACCOUNT_ID,
            displayName: "Jordan Lee",
            emailAddress: "jordan@company.com",
          },
        };
      }
      return { ok: true, data: [] };
    };

    const user = await resolveJiraUser({ query: ACCOUNT_ID, jiraRequest });
    assert.deepEqual(user, {
      accountId: ACCOUNT_ID,
      displayName: "Jordan Lee",
      emailAddress: "jordan@company.com",
    });
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0],
      `/rest/api/3/user?accountId=${encodeURIComponent(ACCOUNT_ID)}`
    );
  });

  it("returns null when account ID lookup fails", async () => {
    const user = await fetchJiraUserByAccountId({
      accountId: ACCOUNT_ID,
      jiraRequest: async () => ({ ok: false, data: { errorMessages: ["not found"] } }),
    });
    assert.equal(user, null);
  });
});

describe("searchAllIssues", () => {
  it("marks isComplete false when the cap is hit and Jira has another page", async () => {
    const result = await searchAllIssues({
      jql: "project = ODI",
      maxTotal: 2,
      batchSize: 2,
      runJiraSearchRequest: async () => ({
        ok: true,
        data: {
          issues: [{ key: "PROJ-1" }, { key: "PROJ-2" }],
          isLast: false,
          nextPageToken: "next",
        },
      }),
    });
    assert.equal(result.loaded, 2);
    assert.equal(result.isComplete, false);
  });

  it("marks isComplete true when Jira reports the last page", async () => {
    const result = await searchAllIssues({
      jql: "project = ODI",
      maxTotal: 2,
      batchSize: 2,
      runJiraSearchRequest: async () => ({
        ok: true,
        data: {
          issues: [{ key: "PROJ-1" }],
          isLast: true,
        },
      }),
    });
    assert.equal(result.loaded, 1);
    assert.equal(result.isComplete, true);
  });
});
