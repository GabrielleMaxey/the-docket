const ISSUE_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/gi;

export const extractIssueKeysFromJql = (jql) => {
  const text = String(jql || "");
  const keys = [];
  const seen = new Set();

  const addKey = (raw) => {
    const key = String(raw || "").trim().toUpperCase();
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    keys.push(key);
  };

  const prioritizedPatterns = [
    /\bparent\s*=\s*([A-Z][A-Z0-9]+-\d+)/gi,
    /\bparent\s+IN\s*\(\s*([A-Z][A-Z0-9]+-\d+)/gi,
    /\bissuekey\s*=\s*([A-Z][A-Z0-9]+-\d+)/gi,
  ];

  for (const pattern of prioritizedPatterns) {
    let match = pattern.exec(text);
    while (match) {
      addKey(match[1]);
      match = pattern.exec(text);
    }
  }

  let match = ISSUE_KEY_PATTERN.exec(text);
  while (match) {
    addKey(match[1]);
    match = ISSUE_KEY_PATTERN.exec(text);
  }

  return keys;
};

export const extractLikelyEpicKeyFromJql = (jql) => extractIssueKeysFromJql(jql)[0] || "";

export const isJqlPreset = (preset) =>
  String(preset?.presetType || "").trim() === "jql" || String(preset?.epicKey || "").trim() === "JQL";

export const presetSelectValue = (preset) =>
  isJqlPreset(preset) ? `__preset__${preset.id}` : String(preset.epicKey || "").trim();

export const findMatchingEpicPreset = ({ epicPresets, jql, label }) => {
  const normalizedJql = String(jql || "").trim();
  const normalizedLabel = String(label || "").trim();
  if (!normalizedJql && !normalizedLabel) {
    return null;
  }

  const byLabel = epicPresets.find(
    (preset) => normalizedLabel && String(preset.label || "").trim() === normalizedLabel
  );
  if (byLabel) {
    return byLabel;
  }

  const byExactJql = epicPresets.find((preset) => {
    const presetJql = String(preset.jql || "").trim();
    return normalizedJql && presetJql && presetJql === normalizedJql;
  });
  if (byExactJql) {
    return byExactJql;
  }

  return (
    epicPresets.find((preset) => {
      const epicKey = String(preset.epicKey || "").trim();
      if (!epicKey || epicKey === "JQL") {
        return false;
      }
      return (
        normalizedJql.includes(`parent = ${epicKey}`) ||
        normalizedJql.includes(`parent IN (${epicKey}`) ||
        normalizedJql.includes(epicKey)
      );
    }) || null
  );
};

export const resolveEpicKeyFromPreset = (preset) => {
  if (!preset) {
    return "";
  }
  if (!isJqlPreset(preset)) {
    return String(preset.epicKey || "").trim();
  }
  return extractLikelyEpicKeyFromJql(preset.jql);
};

export const resolvePresetFromSelect = (epicSelectValue, epicPresets) => {
  const selected = String(epicSelectValue || "").trim();
  if (!selected.startsWith("__preset__")) {
    return null;
  }
  const presetId = selected.slice("__preset__".length);
  return epicPresets.find((item) => String(item.id) === presetId) || null;
};

export const resolveEpicSelectToKey = (epicSelectValue, epicPresets) => {
  const selected = String(epicSelectValue || "").trim();
  if (!selected || selected === "__other__") {
    return "";
  }
  if (selected.startsWith("__preset__")) {
    return resolveEpicKeyFromPreset(resolvePresetFromSelect(selected, epicPresets));
  }
  return selected;
};

export const resolveCreateIssueDefaults = ({ epicPresets, jql, label }) => {
  const preset = findMatchingEpicPreset({ epicPresets, jql, label });
  if (!preset) {
    const epicKey = extractLikelyEpicKeyFromJql(jql);
    return {
      presetId: "",
      epicKey,
      epicSelectValue: epicKey || "",
    };
  }

  const epicKey = resolveEpicKeyFromPreset(preset);
  return {
    presetId: String(preset.id),
    epicKey,
    epicSelectValue: presetSelectValue(preset),
  };
};

export const buildEpicPresetDropdownOptions = (epicPresets) => {
  const opts = [];
  for (const preset of epicPresets) {
    if (isJqlPreset(preset)) {
      opts.push({
        key: `preset-${preset.id}`,
        text: `${preset.label} (saved query)`,
        value: presetSelectValue(preset),
      });
      continue;
    }
    const epicKey = String(preset.epicKey || "").trim();
    if (!epicKey) {
      continue;
    }
    opts.push({
      key: `${preset.id}-${epicKey}`,
      text: preset.label || epicKey,
      value: epicKey,
    });
  }
  opts.push({ key: "__other__", text: "— Enter issue key manually —", value: "__other__" });
  return opts;
};
