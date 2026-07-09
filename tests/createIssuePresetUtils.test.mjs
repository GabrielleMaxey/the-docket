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
        "issuekey = ODI-23066 OR parent = ODI-23066 ORDER BY created DESC"
      ),
      "ODI-23066"
    );
    assert.equal(
      extractLikelyEpicKeyFromJql("parent IN (ODI-23957) ORDER BY key DESC"),
      "ODI-23957"
    );
  });

  it("matches presets by label or exact JQL", () => {
    const presets = [
      { id: 1, presetType: "jql", label: "SeaTool", jql: "parent = ODI-22128" },
      { id: 2, presetType: "epic", label: "Vendor", epicKey: "ODI-18274" },
    ];

    assert.equal(findMatchingEpicPreset({ epicPresets: presets, label: "SeaTool" })?.id, 1);
    assert.equal(
      findMatchingEpicPreset({ epicPresets: presets, jql: "parent = ODI-22128" })?.id,
      1
    );
  });

  it("resolves create defaults for epic and jql presets", () => {
    const presets = [
      { id: 3, presetType: "epic", label: "Vendor", epicKey: "ODI-18274" },
      { id: 4, presetType: "jql", label: "SeaTool", jql: "parent = ODI-22128" },
    ];

    assert.deepEqual(resolveCreateIssueDefaults({
      epicPresets: presets,
      jql: "parent = ODI-18274",
      label: "Vendor",
    }), {
      presetId: "3",
      epicKey: "ODI-18274",
      epicSelectValue: "ODI-18274",
    });

    assert.deepEqual(resolveCreateIssueDefaults({
      epicPresets: presets,
      jql: "parent = ODI-22128",
      label: "SeaTool",
    }), {
      presetId: "4",
      epicKey: "ODI-22128",
      epicSelectValue: "__preset__4",
    });
  });

  it("maps preset dropdown values back to epic keys", () => {
    const presets = [{ id: 4, presetType: "jql", label: "SeaTool", jql: "parent = ODI-22128" }];
    assert.equal(presetSelectValue(presets[0]), "__preset__4");
    assert.equal(resolveEpicSelectToKey("__preset__4", presets), "ODI-22128");
  });
});
