import React from "react";

const getReportText = (report) => {
  if (!report) {
    return "";
  }
  if (typeof report === "string") {
    return report;
  }
  return String(report.report || "").trim();
};

const getReportLabel = (report, fallback = "report") => {
  if (!report || typeof report === "string") {
    return fallback;
  }
  return String(report.label || fallback).trim() || fallback;
};

export const useReportClipboard = (report, fallbackLabel = "report") => {
  const [copied, setCopied] = React.useState(false);
  const reportText = getReportText(report);
  const reportLabel = getReportLabel(report, fallbackLabel);

  const handleCopy = React.useCallback(async () => {
    if (!reportText) {
      return;
    }
    await navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [reportText]);

  const handleDownload = React.useCallback(() => {
    if (!reportText) {
      return;
    }
    const blob = new Blob([reportText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${reportLabel.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [reportText, reportLabel]);

  return {
    copied,
    handleCopy,
    handleDownload,
    hasReport: Boolean(reportText),
  };
};
