import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractLikelyEpicKeyFromJql,
  findMatchingEpicPreset,
  presetSelectValue,
  resolveCreateIssueDefaults,
  resolveEpicSelectToKey,
} from "../shared/createIssuePresetUtils.mjs";

describe("createIssuePresetUtils", () => {
  it("extracts epic keys from saved JQL presets", () => {
    assert.equal(
      extractLikelyEpicKeyFromJql(
        "issuekey = PROJ-23066 OR parent = PROJ-23066 ORDER BY created DESC"
      ),
      "PROJ-23066"
    );
    assert.equal(
      extractLikelyEpicKeyFromJql("parent IN (PROJ-23957) ORDER BY key DESC"),
      "PROJ-23957"
    );
  });

  it("matches presets by label or exact JQL", () => {
    const presets = [
      { id: 1, presetType: "jql", label: "SeaTool", jql: "parent = PROJ-22128" },
      { id: 2, presetType: "epic", label: "Vendor", epicKey: "PROJ-18274" },
    ];

    assert.equal(findMatchingEpicPreset({ epicPresets: presets, label: "SeaTool" })?.id, 1);
    assert.equal(
      findMatchingEpicPreset({ epicPresets: presets, jql: "parent = PROJ-22128" })?.id,
      1
    );
  });

  it("resolves create defaults for epic and jql presets", () => {
    const presets = [
      { id: 3, presetType: "epic", label: "Vendor", epicKey: "PROJ-18274" },
      { id: 4, presetType: "jql", label: "SeaTool", jql: "parent = PROJ-22128" },
    ];

    assert.deepEqual(resolveCreateIssueDefaults({
      epicPresets: presets,
      jql: "parent = PROJ-18274",
      label: "Vendor",
    }), {
      presetId: "3",
      epicKey: "PROJ-18274",
      epicSelectValue: "PROJ-18274",
    });

    assert.deepEqual(resolveCreateIssueDefaults({
      epicPresets: presets,
      jql: "parent = PROJ-22128",
      label: "SeaTool",
    }), {
      presetId: "4",
      epicKey: "PROJ-22128",
      epicSelectValue: "__preset__4",
    });
  });

  it("maps preset dropdown values back to epic keys", () => {
    const presets = [{ id: 4, presetType: "jql", label: "SeaTool", jql: "parent = PROJ-22128" }];
    assert.equal(presetSelectValue(presets[0]), "__preset__4");
    assert.equal(resolveEpicSelectToKey("__preset__4", presets), "PROJ-22128");
  });
});
