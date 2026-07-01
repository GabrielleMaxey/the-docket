import React from "react";
import { Container, Header, Message, Tab, Table, Button } from "semantic-ui-react";
import CollapsibleSection from "../Components/CollapsibleSection";
import ReportOutput from "../Components/ReportOutput";
import StatusPieChart from "../Components/StatusPieChart";
import { useReportClipboard } from "../hooks/useReportClipboard";
import { fetchArchivedReportById, fetchArchivedReports } from "../services/jiraClient";
import { formatTimestamp } from "../utils/format";
import "./reportArchive.css";

const REPORT_TYPE_LABELS = {
  work_week_project_report: "Project report",
  week_plan: "Week plan",
  dashboard_report: "Dashboard report",
  chat_response: "Chat response",
};

const formatReportType = (item) => {
  if (!item) {
    return "";
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

const ReportList = ({ items, loading, error, selectedId, onSelect, emptyMessage }) => {
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
                onClick={() => onSelect(item.id)}
              >
                {selectedId === item.id ? "Selected" : "View"}
              </Button>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
};

const ReportArchivePanel = ({ source, title, emptyMessage }) => {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [selectedId, setSelectedId] = React.useState(null);
  const [selectedReport, setSelectedReport] = React.useState(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState("");

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

      try {
        const nextItems = await fetchArchivedReports({ source });
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
  }, [source]);

  const handleSelect = React.useCallback(async (id) => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetailError("");
    setSelectedReport(null);

    try {
      const item = await fetchArchivedReportById(id);
      setSelectedReport(item);
    } catch (loadError) {
      setDetailError(loadError instanceof Error ? loadError.message : "Failed to load report");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  return (
    <div className="report-archive-panel">
      <Header as="h3" className="report-archive-subtitle">{title}</Header>
      <ReportList
        items={items}
        loading={loading}
        error={error}
        selectedId={selectedId}
        onSelect={handleSelect}
        emptyMessage={emptyMessage}
      />
      {detailLoading ? <Message info size="small">Loading report…</Message> : null}
      {detailError ? (
        <Message negative size="small">
          {detailError}
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
                <>
                  <p className="app-report-chart-label">Overall status</p>
                  <StatusPieChart
                    statusCounts={archivedChart.statusCounts}
                    size={160}
                    variant={archivedChart.chartVariant}
                  />
                </>
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
  ];

  return (
    <Container fluid className="report-archive-page">
      <Header as="h2" className="report-archive-heading">Past reports</Header>
      <p className="report-archive-intro">
        Every generated report and week plan is saved on this machine. Browse previous Work Week, Dashboard,
        and ad-hoc Chat responses below.
      </p>
      <Tab menu={{ secondary: true, pointing: true }} panes={panes} />
    </Container>
  );
};

export default ReportArchive;
