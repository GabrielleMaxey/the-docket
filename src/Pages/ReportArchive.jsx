import React from "react";
import { Container, Header, Message, Tab, Table, Button } from "semantic-ui-react";
import CollapsibleSection from "../Components/CollapsibleSection";
import ReportOutput from "../Components/ReportOutput";
import ReportDiagrams from "./Dashboard/components/ReportDiagrams";
import { useReportClipboard } from "../hooks/useReportClipboard";
import {
  fetchArchivedReportById,
  fetchArchivedReports,
  fetchCoworkWeeklyPlanByFilename,
  fetchCoworkWeeklyPlans,
  saveCoworkWeeklyPlanToArchive,
} from "../services/jiraClient";
import { formatTimestamp } from "../utils/format";
import "./reportArchive.css";

const REPORT_TYPE_LABELS = {
  work_week_project_report: "Project report",
  week_plan: "Week plan",
  cowork_weekly_plan: "CoWork file",
  dashboard_report: "Dashboard report",
  chat_response: "Chat response",
};

const isCoworkFileItem = (item) =>
  item?.kind === "cowork_file" || String(item?.id || "").startsWith("file:");

const formatReportType = (item) => {
  if (!item) {
    return "";
  }
  if (isCoworkFileItem(item) || item.reportType === "cowork_weekly_plan") {
    return "CoWork file";
  }
  if (item.reportType === "week_plan" && item.meta?.fromCoworkFile) {
    return "Week plan (from CoWork)";
  }
  if (item.reportType === "dashboard_report" && item.meta?.audience) {
    return String(item.meta.audience).replace(/_/g, " ");
  }
  return REPORT_TYPE_LABELS[item.reportType] || item.reportType || "Report";
};

const getArchivedChartProps = (report) => {
  const statusCounts = report?.meta?.statusCounts;
  if (!statusCounts || typeof statusCounts !== "object") {
    return null;
  }

  const hasData = Object.values(statusCounts).some((value) => Number(value) > 0);
  if (!hasData) {
    return null;
  }

  return {
    statusCounts,
    chartVariant: report.meta?.chartVariant === "bar" ? "bar" : "pie",
  };
};

const ReportList = ({
  items,
  loading,
  error,
  selectedId,
  onSelect,
  onSaveToArchive,
  savingId,
  emptyMessage,
}) => {
  if (loading) {
    return <Message info size="small">Loading archived reports…</Message>;
  }

  if (error) {
    return (
      <Message negative size="small">
        {error}
      </Message>
    );
  }

  if (!items.length) {
    return (
      <Message info size="small">
        {emptyMessage ||
          "No archived reports yet. Generate a report on Work Week or Dashboard to save one here."}
      </Message>
    );
  }

  return (
    <Table celled compact selectable className="report-archive-table">
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>When</Table.HeaderCell>
          <Table.HeaderCell>Type</Table.HeaderCell>
          <Table.HeaderCell>Title</Table.HeaderCell>
          <Table.HeaderCell />
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {items.map((item) => (
          <Table.Row key={item.id} active={selectedId === item.id}>
            <Table.Cell>{formatTimestamp(item.createdAt)}</Table.Cell>
            <Table.Cell>{formatReportType(item)}</Table.Cell>
            <Table.Cell>{item.label || "Untitled"}</Table.Cell>
            <Table.Cell collapsing>
              <Button
                size="mini"
                primary={selectedId === item.id}
                onClick={() => onSelect(item)}
              >
                {selectedId === item.id ? "Selected" : "View"}
              </Button>
              {isCoworkFileItem(item) && onSaveToArchive ? (
                <Button
                  size="mini"
                  style={{ marginLeft: "0.35rem" }}
                  loading={savingId === item.id}
                  disabled={savingId === item.id}
                  onClick={() => onSaveToArchive(item)}
                >
                  Save to archive
                </Button>
              ) : null}
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
};

const ReportArchivePanel = ({
  source,
  title,
  emptyMessage,
  coworkOnly = false,
}) => {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [selectedId, setSelectedId] = React.useState(null);
  const [selectedReport, setSelectedReport] = React.useState(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState("");
  const [savingId, setSavingId] = React.useState(null);
  const [saveMessage, setSaveMessage] = React.useState("");

  const reportForClipboard = selectedReport
    ? { report: selectedReport.content, label: selectedReport.label }
    : null;
  const { copied, handleCopy, handleDownload } = useReportClipboard(reportForClipboard, selectedReport?.label);
  const archivedChart = getArchivedChartProps(selectedReport);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      setSelectedId(null);
      setSelectedReport(null);
      setDetailError("");
      setSaveMessage("");

      try {
        const nextItems = coworkOnly
          ? await fetchCoworkWeeklyPlans()
          : await fetchArchivedReports({ source });
        if (!cancelled) {
          setItems(nextItems);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load reports");
          setItems([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [source, coworkOnly]);

  const reloadList = React.useCallback(async () => {
    setLoading(true);
    setError("");
    setSaveMessage("");

    try {
      if (coworkOnly) {
        setItems(await fetchCoworkWeeklyPlans());
      } else {
        setItems(await fetchArchivedReports({ source }));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load reports");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [source, coworkOnly]);

  const handleSelect = React.useCallback(async (item) => {
    const id = item?.id ?? item;
    setSelectedId(id);
    setDetailLoading(true);
    setDetailError("");
    setSelectedReport(null);
    setSaveMessage("");

    try {
      if (isCoworkFileItem(item) || (typeof id === "string" && id.startsWith("file:"))) {
        const filename = item?.filename || String(id).slice("file:".length);
        const fileItem = await fetchCoworkWeeklyPlanByFilename(filename);
        setSelectedReport(fileItem);
      } else {
        const archived = await fetchArchivedReportById(id);
        setSelectedReport(archived);
      }
    } catch (loadError) {
      setDetailError(loadError instanceof Error ? loadError.message : "Failed to load report");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleSaveToArchive = React.useCallback(
    async (item) => {
      if (!isCoworkFileItem(item)) {
        return;
      }

      setSavingId(item.id);
      setSaveMessage("");
      setDetailError("");

      try {
        let content = selectedReport?.content;
        if (selectedId !== item.id || !content) {
          const fileItem = await fetchCoworkWeeklyPlanByFilename(item.filename);
          content = fileItem?.content;
        }
        if (!content) {
          throw new Error("Could not read weekly plan content");
        }

        await saveCoworkWeeklyPlanToArchive({
          content,
          label: item.label || item.filename,
          filename: item.filename,
        });
        setSaveMessage(`Saved “${item.label || item.filename}” to Work Week archive.`);
        await reloadList();
      } catch (saveError) {
        setDetailError(saveError instanceof Error ? saveError.message : "Failed to save to archive");
      } finally {
        setSavingId(null);
      }
    },
    [selectedId, selectedReport, reloadList]
  );

  return (
    <div className="report-archive-panel">
      <Header as="h3" className="report-archive-subtitle">{title}</Header>
      {saveMessage ? <Message positive size="small">{saveMessage}</Message> : null}
      <CollapsibleSection
        title="Reports"
        storageKey={coworkOnly ? "files" : source}
        persistKeyPrefix="report-archive-list-"
        defaultOpen={true}
        badge={loading ? "Loading…" : `${items.length} report${items.length !== 1 ? "s" : ""}`}
      >
        <ReportList
          items={items}
          loading={loading}
          error={error}
          selectedId={selectedId}
          onSelect={handleSelect}
          onSaveToArchive={coworkOnly ? handleSaveToArchive : undefined}
          savingId={savingId}
          emptyMessage={emptyMessage}
        />
      </CollapsibleSection>
      {detailLoading ? <Message info size="small">Loading report…</Message> : null}
      {detailError ? (
        <Message negative size="small">
          {detailError}
        </Message>
      ) : null}
      {selectedReport && !detailLoading ? (
        <Message info size="small">
          ↓ Scroll down to view “{selectedReport.label || "the selected report"}” below.
        </Message>
      ) : null}
      {selectedReport ? (
        <CollapsibleSection
          title={selectedReport.label || "Report"}
          subtitle={
            selectedReport.meta?.userPrompt
              ? `Question: ${selectedReport.meta.userPrompt}`
              : formatTimestamp(selectedReport.createdAt)
          }
          badge={formatReportType(selectedReport)}
          storageKey={`detail-${selectedId}`}
          persistKeyPrefix="report-archive-"
          defaultOpen={true}
          className="report-archive-detail-collapsible"
        >
          <ReportOutput
            report={reportForClipboard}
            hideTitle
            copied={copied}
            onCopy={handleCopy}
            onDownload={handleDownload}
            chartSlot={
              archivedChart ? (
                <ReportDiagrams
                  statusCounts={archivedChart.statusCounts}
                  chartVariant={archivedChart.chartVariant}
                />
              ) : null
            }
          />
        </CollapsibleSection>
      ) : null}
    </div>
  );
};

const ReportArchive = () => {
  const panes = [
    {
      menuItem: "Work Week",
      render: () => (
        <Tab.Pane attached={false}>
          <ReportArchivePanel source="work_week" title="My Work Week reports" />
        </Tab.Pane>
      ),
    },
    {
      menuItem: "Dashboard",
      render: () => (
        <Tab.Pane attached={false}>
          <ReportArchivePanel source="dashboard" title="Dashboard reports" />
        </Tab.Pane>
      ),
    },
    {
      menuItem: "Ad-hoc",
      render: () => (
        <Tab.Pane attached={false}>
          <ReportArchivePanel
            source="adhoc"
            title="Ad-hoc saved responses"
            emptyMessage="No ad-hoc reports yet. Use Save to Past Reports on a Chat assistant reply to add one here."
          />
        </Tab.Pane>
      ),
    },
    {
      menuItem: "Files",
      render: () => (
        <Tab.Pane attached={false}>
          <ReportArchivePanel
            coworkOnly
            title="CoWork weekly plan files"
            emptyMessage="No weekly-plan-*.md files in the data folder yet."
          />
        </Tab.Pane>
      ),
    },
  ];

  return (
    <Container fluid className="report-archive-page">
      <Header as="h2" className="report-archive-heading">Past reports</Header>
      <p className="report-archive-intro">
        Every generated report and week plan is saved on this machine. Browse previous Work Week, Dashboard,
        and ad-hoc Chat responses below. CoWork weekly plan files from the data folder appear under Files.
      </p>
      <Tab menu={{ secondary: true, pointing: true }} panes={panes} />
    </Container>
  );
};

export default ReportArchive;
