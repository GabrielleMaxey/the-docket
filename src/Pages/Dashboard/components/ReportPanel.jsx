import { Button, Message } from "semantic-ui-react";
import StatusPieChart from "../../../components/StatusPieChart";
import ReportOutput from "../../../components/ReportOutput";
import { AUDIENCE_OPTIONS, useReportGeneration } from "../hooks/useReportGeneration";

const ReportPanel = ({ hasSnapshot, overallStatusCounts, chartVariant, epics = [] }) => {
  const {
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
    handleCopy,
    handleDownload,
    toggleEpicSelection,
    selectAllEpics,
  } = useReportGeneration({ epics, overallStatusCounts, chartVariant });

  const chartCounts = reportStatusCounts || overallStatusCounts;
  const chartStyle = report ? reportChartVariant : chartVariant;
  const hasChartData =
    chartCounts && Object.values(chartCounts).some((value) => Number(value) > 0);

  return (
    <div className="app-report-panel dashboard-report-panel">
      <div className="dashboard-report-controls">
        {epics.length > 1 ? (
          <div style={{ marginBottom: "0.75rem" }}>
            <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155", margin: "0 0 0.4rem" }}>
              Include in report
              <button
                type="button"
                onClick={selectAllEpics}
                style={{
                  marginLeft: "0.5rem",
                  fontSize: "0.72rem",
                  fontWeight: 400,
                  border: "1px solid #cbd5e1",
                  borderRadius: "999px",
                  padding: "0.1rem 0.45rem",
                  background: "#f1f5f9",
                  color: "#64748b",
                  cursor: "pointer",
                }}
              >
                All
              </button>
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {epics.map((epic) => {
                const eid = epic.epicPresetId;
                const checked = selectedEpicIds.length === 0 || selectedEpicIds.includes(eid);
                return (
                  <label
                    key={epic.id ?? eid}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      fontSize: "0.82rem",
                      padding: "0.2rem 0.6rem",
                      borderRadius: "999px",
                      border: `1px solid ${checked ? "#0c93d9" : "#e2e8f0"}`,
                      background: checked ? "#e8f5fd" : "#f8fafc",
                      color: checked ? "#0c93d9" : "#475569",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      style={{ display: "none" }}
                      checked={checked}
                      onChange={() => toggleEpicSelection(eid)}
                    />
                    {epic.label}
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="dashboard-report-audience-grid">
          {AUDIENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`dashboard-report-audience-btn${
                audience === opt.value ? " dashboard-report-audience-btn--active" : ""
              }`}
              onClick={() => setAudience(opt.value)}
            >
              <span className="dashboard-report-audience-label">{opt.label}</span>
              <span className="dashboard-report-audience-desc">{opt.description}</span>
            </button>
          ))}
        </div>

        <div className="dashboard-report-context-block">
          <label htmlFor="dashboard-report-context" className="dashboard-report-context-label">
            Additional context (optional)
          </label>
          <p className="dashboard-report-context-hint">
            Add priorities, known blockers, stakeholder concerns, or tone guidance for this report.
          </p>
          <textarea
            id="dashboard-report-context"
            className="dashboard-report-context-input"
            rows={3}
            value={additionalContext}
            onChange={(event) => setAdditionalContext(event.target.value)}
            placeholder="Example: Emphasize deadline risks for leadership and call out any dependencies on Platform team approvals."
          />
        </div>

        <div className="dashboard-report-generate-row">
          <Button
            primary
            onClick={handleGenerate}
            loading={loading}
            disabled={loading || !hasSnapshot}
          >
            Generate {selectedOption?.label || "Report"}
          </Button>
          {!hasSnapshot ? (
            <span className="dashboard-due-by-hint">
              Run a Dashboard refresh first so there is data to report on.
            </span>
          ) : null}
        </div>
      </div>

      {error ? <Message negative size="small">{error}</Message> : null}

      <ReportOutput
        report={report}
        copied={copied}
        onCopy={handleCopy}
        onDownload={handleDownload}
        chartSlot={
          hasChartData ? (
            <>
              <p className="app-report-chart-label">Overall status</p>
              <StatusPieChart
                statusCounts={chartCounts}
                size={160}
                variant={chartStyle}
              />
            </>
          ) : null
        }
      />
    </div>
  );
};

export default ReportPanel;
