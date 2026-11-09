import React from "react";
import { usePersistedState } from "../../Pages/hooks/usePersistedState.js";
import { useApiConnection, OFFLINE_REASON } from "../../hooks/useApiConnection.jsx";
import { Button, Checkbox, Dropdown, Message } from "semantic-ui-react";
import CollapsibleSection from "../CollapsibleSection";
import FlowReport from "./FlowReport.jsx";
import { useReportClipboard } from "../../hooks/useReportClipboard";
import { buildFlowReportMarkdown, buildStandaloneFlowHtml, flowReportFileName } from "../../../shared/flowMetrics.mjs";
import flowReportCss from "./FlowReport.css?raw";
import { archiveFlowReport, generateCombinedFlowReport, generateFlowNarrative, generateFlowReport } from "../../services/jiraClient";

const WINDOW_OPTIONS = [
  { key: 3, text: "Past 3 months", value: 3 },
  { key: 6, text: "Past 6 months", value: 6 },
  { key: 12, text: "Past 12 months", value: 12 },
  { key: 24, text: "Past 24 months", value: 24 },
];

const scopeKeyOf = (presetIds) => (Array.isArray(presetIds) ? [...presetIds].map(String).sort().join(",") : "");

/**
 * Collapsible "generate, save, reopen" Flow report card.
 * `presetIds` limits the report to those project presets (Metrics page);
 * leave it undefined for "all my assigned work" (Task Management).
 */
const FlowReportSection = ({
  presetIds,
  instanceIds,
  presetOptions,
  onPresetIdsChange,
  allAssignees = false,
  title = "My Flow report",
  subtitle = "Throughput, lead and cycle time, aging and stalled work for issues assigned to you",
  storageKey = "dashboard-flow-report-open",
  defaultOpen = true,
}) => {
  const { online } = useApiConnection();
  const [windowMonths, setWindowMonths] = usePersistedState("flow-report-window-months", 12, { siteScoped: true });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [report, setReport] = React.useState(null);
  const [saveState, setSaveState] = React.useState("idle");
  const [includeHandedOn, setIncludeHandedOn] = usePersistedState("flow-report-include-handed-on", false, { siteScoped: true });
  const [narrativeLoading, setNarrativeLoading] = React.useState(false);
  const reportRef = React.useRef(null);
  const combined = Array.isArray(instanceIds);
  const currentScopeKey = scopeKeyOf(combined ? instanceIds : presetIds);
  const scoped = combined || Array.isArray(presetIds);
  const requestSeq = React.useRef(0);

  const clipboardReport = React.useMemo(
    () => (report ? { report: report.markdown, label: report.data?.title || "flow-report" } : null),
    [report]
  );
  const { copied, handleCopy, handleDownload } = useReportClipboard(clipboardReport, "flow-report");

  const handleGenerate = async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError("");
    setSaveState("idle");
    try {
      const result = combined
        ? await generateCombinedFlowReport({ instanceIds, windowMonths, includeHandedOn })
        : await generateFlowReport({ windowMonths, presetIds: scoped ? presetIds : [], allAssignees: scoped && allAssignees, includeHandedOn: !allAssignees && includeHandedOn });
      if (seq !== requestSeq.current) return; // a newer Generate superseded this one
      if (!result?.data) throw new Error("The server returned no report data.");
      setReport({ data: result.data, markdown: result.markdown || "", scopeKey: currentScopeKey });
    } catch (err) {
      if (seq === requestSeq.current) setError(err instanceof Error ? err.message : "Unable to generate the flow report.");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  };

  const handleDownloadHtml = () => {
    const root = reportRef.current;
    if (!root || !report?.data) return;
    // Static copy: drop the interactive table filters, which cannot work without the app.
    const copy = root.cloneNode(true);
    copy.querySelectorAll(".fr-filters").forEach((node) => node.remove());
    const html = buildStandaloneFlowHtml({ title: report.data.title, bodyHtml: copy.innerHTML, css: flowReportCss });
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = flowReportFileName(report.data.title, new Date().toISOString().slice(0, 10), "html");
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleNarrative = async () => {
    if (!report?.data) return;
    const target = report.data.meta?.generatedAt;
    setNarrativeLoading(true);
    setError("");
    try {
      const result = await generateFlowNarrative(report.data);
      if (!result?.narrative) throw new Error("The server returned no summary.");
      setReport((prev) => {
        if (!prev || prev.data?.meta?.generatedAt !== target) return prev; // report was regenerated meanwhile
        const data = { ...prev.data, narrative: result.narrative };
        return { ...prev, data, markdown: buildFlowReportMarkdown(data) };
      });
      setSaveState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to write the AI summary.");
    } finally {
      setNarrativeLoading(false);
    }
  };

  const handleSave = async () => {
    if (!report?.data) return;
    setSaveState("saving");
    try {
      await archiveFlowReport(report.data);
      setSaveState("saved");
    } catch (err) {
      setSaveState("idle");
      setError(err instanceof Error ? err.message : "Unable to save the flow report.");
    }
  };

  return (
    <CollapsibleSection
      title={title}
      subtitle={subtitle}
      storageKey={storageKey}
      defaultOpen={defaultOpen}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <Dropdown selection compact options={WINDOW_OPTIONS} value={windowMonths} onChange={(_, d) => setWindowMonths(d.value)} disabled={loading} />
        {!allAssignees ? (
          <Checkbox
            label="Include work I've handed on"
            checked={includeHandedOn}
            onChange={(_, d) => setIncludeHandedOn(Boolean(d.checked))}
            disabled={loading}
          />
        ) : null}
        <Button primary size="small" loading={loading} disabled={loading || !online || (combined && instanceIds.length === 0)} title={online ? undefined : OFFLINE_REASON} onClick={handleGenerate}>
          {report ? "Regenerate" : "Generate report"}
        </Button>
        {report ? (
          <>
            <Button basic size="small" loading={narrativeLoading} disabled={narrativeLoading || loading} onClick={handleNarrative}>
              {report.data?.narrative ? "Rewrite AI summary" : "Add AI summary"}
            </Button>
            <Button basic size="small" onClick={handleSave} disabled={saveState !== "idle"}>
              {saveState === "saved" ? "✓ Saved to archive" : saveState === "saving" ? "Saving…" : "Save to archive"}
            </Button>
            <Button basic size="small" onClick={handleCopy}>{copied ? "✓ Copied" : "Copy markdown"}</Button>
            <Button basic size="small" onClick={handleDownload}>⤓ Download .md</Button>
            <Button basic size="small" onClick={handleDownloadHtml}>⤓ Download .html</Button>
          </>
        ) : null}
      </div>
      {!combined && scoped && Array.isArray(presetOptions) && onPresetIdsChange ? (
        <div style={{ marginBottom: 12 }}>
          <Dropdown
            multiple
            search
            selection
            fluid
            placeholder="Select projects (shared with the filters above)"
            options={presetOptions.map((option) => ({ key: option.id, text: option.label, value: option.id }))}
            value={presetIds}
            onChange={(_, d) => onPresetIdsChange(d.value)}
            disabled={loading}
          />
        </div>
      ) : null}
      {combined ? (
        <p className="ww-inline-hint" style={{ margin: "0 0 12px" }}>
          {instanceIds.length
            ? `Covers your issues across the ${instanceIds.length} Jira site${instanceIds.length === 1 ? "" : "s"} selected above. Project filters do not apply.`
            : "Select at least one Jira site above."}
        </p>
      ) : scoped ? (
        <p className="ww-inline-hint" style={{ margin: "0 0 12px" }}>
          {currentScopeKey
            ? `Covers ${allAssignees ? "all issues" : "your issues"} in the ${presetIds.length} project option${presetIds.length === 1 ? "" : "s"} selected above.`
            : "No project options are selected above, so this covers all of your assigned work."}
        </p>
      ) : null}
      {report && scoped && report.scopeKey !== currentScopeKey ? (
        <Message warning size="small">
          The selection above has changed since this report was generated. Select Regenerate to apply it.
        </Message>
      ) : null}
      {error ? <Message negative size="small">{error}</Message> : null}
      {report ? (
        <>
          <div ref={reportRef}><FlowReport key={report.data?.meta?.generatedAt || "report"} data={report.data} /></div>
          {report.data?.meta?.jql ? (
            <details style={{ marginTop: 12 }}>
              <summary className="ww-inline-hint" style={{ cursor: "pointer" }}>Query used</summary>
              <code style={{ display: "block", whiteSpace: "pre-wrap", fontSize: 12, marginTop: 6 }}>{report.data.meta.jql}</code>
            </details>
          ) : null}
        </>
      ) : (
        <Message info size="small">
          Generate a report from your Jira work over the chosen period. Saved reports are kept in the Report Archive.
        </Message>
      )}
    </CollapsibleSection>
  );
};

export default FlowReportSection;
