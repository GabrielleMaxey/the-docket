import { useEffect, useState } from "react";
import { Button } from "semantic-ui-react";
import SimpleMarkdown from "./SimpleMarkdown";
import "./report.css";

const isMarkdownFilename = (filename) => /\.md$/i.test(String(filename || "").trim());

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
  filename = "",
}) => {
  const reportText = typeof report === "string" ? report : report?.report;
  const resolvedFilename =
    filename ||
    (typeof report === "object" && report ? report.filename || report.label : "") ||
    "";
  const showMdPreview = isMarkdownFilename(resolvedFilename);
  const [viewMode, setViewMode] = useState("preview");

  useEffect(() => {
    setViewMode("preview");
  }, [reportText, resolvedFilename]);

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
          {showMdPreview ? (
            <Button.Group size="mini">
              <Button
                basic={viewMode !== "preview"}
                primary={viewMode === "preview"}
                onClick={() => setViewMode("preview")}
              >
                Preview
              </Button>
              <Button
                basic={viewMode !== "source"}
                primary={viewMode === "source"}
                onClick={() => setViewMode("source")}
              >
                Source
              </Button>
            </Button.Group>
          ) : null}
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

      {showMdPreview && viewMode === "source" ? (
        <pre className="app-report-source">{reportText}</pre>
      ) : (
        <SimpleMarkdown text={reportText} />
      )}
    </div>
  );
};

export default ReportOutput;
