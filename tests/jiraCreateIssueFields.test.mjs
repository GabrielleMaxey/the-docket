import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyNamedFieldValue,
  applyOdiCreateFields,
  applyParentLinkFields,
  buildEpicStoriesJql,
  formatJiraApiError,
  resolveJiraPriorityName,
} from "../server/lib/jiraCreateIssueFields.mjs";

describe("buildEpicStoriesJql", () => {
  it("includes parent and epic link clauses", () => {
    assert.match(buildEpicStoriesJql("ODI-100"), /parent = ODI-100/);
    assert.match(buildEpicStoriesJql("ODI-100"), /Epic Link/);
  });
});

describe("resolveJiraPriorityName", () => {
  it("maps ODI Critical to Jira Highest when needed", () => {
    const fields = {
      priority: {
        allowedValues: [
          { name: "Highest" },
          { name: "High" },
          { name: "Medium" },
          { name: "Low" },
        ],
      },
    };

    assert.equal(resolveJiraPriorityName({ fields, odiPriority: "Critical" }), "Highest");
    assert.equal(resolveJiraPriorityName({ fields, odiPriority: "High" }), "High");
  });
});

describe("applyParentLinkFields", () => {
  it("uses parent field when available", () => {
    const fields = {};
    const result = applyParentLinkFields({
      fields,
      issueTypeFields: { parent: { name: "Parent" } },
      parentKey: "ODI-10",
      parentRole: "epic",
      issueType: "Story",
    });

    assert.equal(result.ok, true);
    assert.deepEqual(fields.parent, { key: "ODI-10" });
  });

  it("falls back to epic link custom field", () => {
    const fields = {};
    const result = applyParentLinkFields({
      fields,
      issueTypeFields: {
        customfield_10014: {
          name: "Epic Link",
          schema: { custom: "com.pyxis.greenhopper.jira:gh-epic-link" },
        },
      },
      parentKey: "ODI-10",
      parentRole: "epic",
      issueType: "Bug",
    });

    assert.equal(result.ok, true);
    assert.equal(fields.customfield_10014, "ODI-10");
    assert.equal(result.linkMode, "epicLink");
  });
});

describe("formatJiraApiError", () => {
  it("flattens Jira field errors", () => {
    const message = formatJiraApiError({
      errors: {
        priority: "Specify a valid priority name",
        parent: "Given parent work item does not belong to appropriate hierarchy.",
      },
    });

    assert.match(message, /priority:/);
    assert.match(message, /parent:/);
  });
});

describe("applyOdiCreateFields", () => {
  it("maps component and vertical fields onto Jira create payload", () => {
    const fields = {};
    const issueTypeFields = {
      components: { name: "Component(s)", schema: { type: "array", items: "component" } },
      customfield_20001: { name: "Vertical Components", schema: { type: "option" }, allowedValues: [
        { value: "Vertical-IP" },
      ] },
      customfield_20002: {
        name: "BUG Tracking",
        schema: { type: "option" },
        allowedValues: [{ value: "BUG Tracking-Itential Platform" }],
      },
    };

    applyOdiCreateFields({
      fields,
      issueTypeFields,
      issueType: "Bug",
      component: "WGA-DEV",
      verticalComponent: "Vertical-IP",
      bugTracking: "BUG Tracking-Itential Platform",
    });

    assert.deepEqual(fields.components, [{ name: "WGA-DEV" }]);
    assert.deepEqual(fields.customfield_20001, { value: "Vertical-IP" });
    assert.deepEqual(fields.customfield_20002, { value: "BUG Tracking-Itential Platform" });
  });

  it("allows custom component values", () => {
    const fields = {};
    applyNamedFieldValue({
      fields,
      fieldKey: "components",
      meta: { name: "Component(s)", schema: { type: "array", items: "component" } },
      value: "Custom-Component",
    });
    assert.deepEqual(fields.components, [{ name: "Custom-Component" }]);
  });
});
