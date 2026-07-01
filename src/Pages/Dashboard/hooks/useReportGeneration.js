import React from "react";
import { generateReport } from "../../../services/jiraClient";
import { saveChatSessionArtifact } from "../../../utils/chatSessionContext";
import {
  loadDashboardReportState,
  saveDashboardReportState,
  clearDashboardReportState,
} from "../../../utils/pageReportPersistence";
import { useReportClipboard } from "../../../hooks/useReportClipboard";
import {
  BACKGROUND_JOB_IDS,
  runBackgroundJob,
  useAttachBackgroundJob,
  useBackgroundJobRunning,
} from "../../../hooks/useBackgroundJobs.js";

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

export const useReportGeneration = ({ epics = [], overallStatusCounts, chartVariant = "pie" }) => {
  const persisted = loadDashboardReportState();

  const [audience, setAudience] = React.useState(persisted?.audience || "executive");
  const [reportPending, setReportPending] = React.useState(false);
  const bgReportRunning = useBackgroundJobRunning(BACKGROUND_JOB_IDS.DASHBOARD_REPORT);
  const loading = reportPending || bgReportRunning;
  const [report, setReport] = React.useState(persisted?.report ?? null);
  const [reportStatusCounts, setReportStatusCounts] = React.useState(persisted?.statusCounts ?? null);
  const [reportChartVariant, setReportChartVariant] = React.useState(
    persisted?.chartVariant || chartVariant || "pie"
  );
  const [error, setError] = React.useState("");
  const { copied, handleCopy, handleDownload } = useReportClipboard(report);
  const [selectedEpicIds, setSelectedEpicIds] = React.useState(
    Array.isArray(persisted?.selectedEpicIds) ? persisted.selectedEpicIds : []
  );
  const [additionalContext, setAdditionalContext] = React.useState(
    String(persisted?.additionalContext || "")
  );

  const epicIds =
    selectedEpicIds.length > 0
      ? selectedEpicIds
      : epics.map((e) => e.epicPresetId).filter(Boolean);

  const selectedOption = AUDIENCE_OPTIONS.find((o) => o.value === audience);

  const applyReportResult = React.useCallback(
    (payload) => {
      const result = payload?.result ?? payload;
      if (!result) {
        return;
      }
      setReport(result);
      const nextStatusCounts =
        payload?.nextStatusCounts ?? result?.statusCounts ?? null;
      const nextChartVariant =
        payload?.nextChartVariant ?? result?.chartVariant ?? chartVariant ?? "pie";
      setReportStatusCounts(nextStatusCounts);
      setReportChartVariant(nextChartVariant);
    },
    [chartVariant]
  );

  useAttachBackgroundJob(BACKGROUND_JOB_IDS.DASHBOARD_REPORT, {
    onSuccess: applyReportResult,
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Report generation failed");
    },
    onFinally: () => setReportPending(false),
  });

  const handleGenerate = React.useCallback(() => {
    setReportPending(true);
    setError("");
    setReport(null);
    setReportStatusCounts(null);

    const hasChartData =
      overallStatusCounts &&
      Object.values(overallStatusCounts).some((value) => Number(value) > 0);
    const trimmedContext = additionalContext.trim();

    runBackgroundJob(BACKGROUND_JOB_IDS.DASHBOARD_REPORT, {
      label: `Generating ${selectedOption?.label || "report"}`,
      run: async () => {
        const result = await generateReport({
          audience,
          epicPresetIds: epicIds,
          additionalContext: trimmedContext,
          ...(hasChartData ? { statusCounts: overallStatusCounts, chartVariant } : {}),
        });
        const nextStatusCounts = result?.statusCounts || (hasChartData ? overallStatusCounts : null);
        const nextChartVariant = result?.chartVariant || chartVariant || "pie";

        saveDashboardReportState({
          report: result,
          audience,
          selectedEpicIds,
          additionalContext: trimmedContext,
          statusCounts: nextStatusCounts,
          chartVariant: nextChartVariant,
        });
        saveChatSessionArtifact({
          type: "dashboard_report",
          label: result.label || selectedOption?.label || audience,
          content: result.report,
          meta: {
            audience,
            ...(nextStatusCounts ? { statusCounts: nextStatusCounts, chartVariant: nextChartVariant } : {}),
          },
        });

        return { result, nextStatusCounts, nextChartVariant };
      },
    })
      .then(applyReportResult)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Report generation failed");
      })
      .finally(() => setReportPending(false));
  }, [
    audience,
    epicIds,
    additionalContext,
    selectedEpicIds,
    selectedOption?.label,
    overallStatusCounts,
    chartVariant,
  ]);

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

  const handleClearReport = React.useCallback(() => {
    clearDashboardReportState();
    setReport(null);
    setReportStatusCounts(null);
    setError("");
  }, []);

  return {
    audience,
    setAudience,
    loading,
    report,
    reportStatusCounts,
    reportChartVariant,
    error,
    copied,
    selectedEpicIds,
    additionalContext,
    setAdditionalContext,
    selectedOption,
    handleGenerate,
    handleClearReport,
    handleCopy,
    handleDownload,
    toggleEpicSelection,
    selectAllEpics,
  };
};
