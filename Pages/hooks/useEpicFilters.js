import React from "react";
import { fetchEpicPresets } from "../../services/jiraClient.js";

export const useEpicFilters = () => {
  const [presets, setPresets] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [selectedPresetIds, setSelectedPresetIds] = React.useState([]);
  const [includePastDue, setIncludePastDue] = React.useState(false);

  const reloadPresets = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const items = await fetchEpicPresets();
      setPresets(items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load epic presets");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void reloadPresets();
  }, [reloadPresets]);

  const selectAll = React.useCallback(() => {
    setSelectedPresetIds(presets.map((preset) => preset.id));
  }, [presets]);

  const clearSelection = React.useCallback(() => {
    setSelectedPresetIds([]);
    setIncludePastDue(false);
  }, []);

  const togglePreset = React.useCallback((id) => {
    setSelectedPresetIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  return {
    presets,
    loading,
    error,
    selectedPresetIds,
    includePastDue,
    setIncludePastDue,
    selectAll,
    clearSelection,
    togglePreset,
    setSelectedPresetIds,
    reloadPresets,
  };
};
