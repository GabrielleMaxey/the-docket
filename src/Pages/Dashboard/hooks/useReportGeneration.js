import React from "react";
import { generateReport } from "../../../services/jiraClient";
import { saveChatSessionArtifact } from "../../../utils/chatSessionContext";
import { useReportClipboard } from "../../../hooks/useReportClipboard";

export const AUDIENCE_OPTIONS = [
  {
    value: "executive",
    label: "Executive Summary",
    description: "High-level overview for senior leadership — highlights, risks, and action items",
  },
  {
    value: "product_owner",
    label: "Project Manager Summary",
    description:
      "Deadline realism, stakeholder impact, delay risks, stand-up summaries, and closeout reports",
  },
  {
    value: "developer",
    label: "Developer Report",
    description: "Team workload, overdue items by person, WIP, and upcoming tasks",
  },
];

export const useReportGeneration = ({ epics = [] }) => {
  const [audience, setAudience] = React.useState("executive");
  const [loading, setLoading] = React.useState(false);
  const [report, setReport] = React.useState(null);
  const [error, setError] = React.useState("");
  const { copied, handleCopy, handleDownload } = useReportClipboard(report);
  const [selectedEpicIds, setSelectedEpicIds] = React.useState([]);
  const [additionalContext, setAdditionalContext] = React.useState("");

  const epicIds =
    selectedEpicIds.length > 0
      ? selectedEpicIds
      : epics.map((e) => e.epicPresetId).filter(Boolean);

  const selectedOption = AUDIENCE_OPTIONS.find((o) => o.value === audience);

  const handleGenerate = React.useCallback(async () => {
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const result = await generateReport({
        audience,
        epicPresetIds: epicIds,
        additionalContext: additionalContext.trim(),
      });
      setReport(result);
      saveChatSessionArtifact({
        type: "dashboard_report",
        label: result.label || selectedOption?.label || audience,
        content: result.report,
        meta: { audience },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report generation failed");
    } finally {
      setLoading(false);
    }
  }, [audience, epicIds, additionalContext]);

  const toggleEpicSelection = React.useCallback(
    (epicPresetId) => {
      setSelectedEpicIds((prev) => {
        const all = epics.map((e) => e.epicPresetId).filter(Boolean);
        const current = prev.length === 0 ? all : prev;
        const next = current.includes(epicPresetId)
          ? current.filter((id) => id !== epicPresetId)
          : [...current, epicPresetId];
        return next.length === all.length ? [] : next;
      });
    },
    [epics]
  );

  const selectAllEpics = React.useCallback(() => setSelectedEpicIds([]), []);

  return {
    audience,
    setAudience,
    loading,
    report,
    error,
    copied,
    selectedEpicIds,
    additionalContext,
    setAdditionalContext,
    selectedOption,
    handleGenerate,
    handleCopy,
    handleDownload,
    toggleEpicSelection,
    selectAllEpics,
  };
};
