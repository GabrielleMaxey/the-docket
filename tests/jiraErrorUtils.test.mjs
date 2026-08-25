import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterWorkfrontErrorMessages,
  hasOnlyWorkfrontJiraErrors,
  isWorkfrontJiraErrorMessage,
  sanitizeJiraErrorData,
} from "../shared/jiraErrorUtils.mjs";

describe("jiraErrorUtils", () => {
  it("detects Workfront integration messages", () => {
    assert.equal(
      isWorkfrontJiraErrorMessage("Workfront sync failed for issue PROJ-1"),
      true
    );
    assert.equal(isWorkfrontJiraErrorMessage("Invalid parent for issue type"), false);
  });

  it("filters Workfront-only errors from Jira payloads", () => {
    const payload = {
      errorMessages: ["Workfront sync failed", "Another Workfront warning"],
      errors: { workfrontSync: "Workfront connector error" },
      message: "Workfront update failed",
    };

    assert.equal(hasOnlyWorkfrontJiraErrors(payload), true);
    assert.deepEqual(sanitizeJiraErrorData(payload), {
      errorMessages: [],
      errors: {},
      message: "",
    });
  });

  it("keeps non-Workfront errors after filtering", () => {
    const payload = {
      errorMessages: ["Workfront sync failed", "Specify a valid priority name"],
    };

    assert.equal(hasOnlyWorkfrontJiraErrors(payload), false);
    assert.deepEqual(filterWorkfrontErrorMessages(payload.errorMessages), [
      "Specify a valid priority name",
    ]);
  });
});
