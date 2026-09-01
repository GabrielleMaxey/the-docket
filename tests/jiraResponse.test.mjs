import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseJiraResponse } from "../server/lib/jiraResponse.mjs";

describe("parseJiraResponse", () => {
  it("parses JSON response bodies", async () => {
    const response = new Response(JSON.stringify({ issues: [] }));
    assert.deepEqual(await parseJiraResponse(response), { issues: [] });
  });

  it("returns a bounded message for non-JSON response bodies", async () => {
    const response = new Response("<html>not a Jira response</html>");
    assert.deepEqual(await parseJiraResponse(response), {
      message: "<html>not a Jira response</html>",
    });
  });

  it("returns null for empty response bodies", async () => {
    assert.equal(await parseJiraResponse(new Response("")), null);
  });
});
