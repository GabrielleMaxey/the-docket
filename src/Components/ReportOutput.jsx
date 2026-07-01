import { Button } from "semantic-ui-react";
import SimpleMarkdown from "./SimpleMarkdown";
import "./report.css";

const ReportOutput = ({
  report,
  copied,
  onCopy,
  onDownload,
  onClear,
  chartSlot,
  title,
  hideTitle = false,
  className = "",
}) => {
  const reportText = typeof report === "string" ? report : report?.report;
  if (!reportText) {
    return null;
  }

  const displayTitle = hideTitle
    ? null
    : title ||
      (typeof report === "string" ? null : report?.label) ||
      "Report";

  return (
    <div className={`app-report-output ${className}`.trim()}>
      <div className="app-report-output-header">
        {displayTitle ? <strong className="app-report-output-title">{displayTitle}</strong> : <span />}
        <div className="app-report-output-actions">
          {onClear ? (
            <Button basic size="mini" onClick={onClear}>
              Clear report
            </Button>
          ) : null}
          <Button basic size="mini" onClick={onCopy}>
            {copied ? "✓ Copied" : "Copy"}
          </Button>
          <Button basic size="mini" onClick={onDownload}>
            ⤓ Download .md
          </Button>
        </div>
      </div>

      {chartSlot ? <div className="app-report-chart-wrap">{chartSlot}</div> : null}

      <SimpleMarkdown text={reportText} />
    </div>
  );
};

export default ReportOutput;
