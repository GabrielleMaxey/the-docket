import React from "react";
import { Button, Message } from "semantic-ui-react";
import { importIssueMetadataCsv } from "../../../services/jiraClient.js";
import { WORK_WEEK_STORAGE_KEYS } from "../../../utils/workWeekStorage.js";
import SettingsSection from "./SettingsSection";

const readJsonObject = (key) => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const applyImportToLocalStorage = (items) => {
  if (!items || typeof items !== "object") {
    return;
  }

  const nextPriorities = { ...readJsonObject(WORK_WEEK_STORAGE_KEYS.jiraRowPriorities) };
  const nextNotes = { ...readJsonObject(WORK_WEEK_STORAGE_KEYS.jiraNotes) };

  Object.entries(items).forEach(([issueKey, value]) => {
    if (!issueKey || !value || typeof value !== "object") {
      return;
    }
    if (value.priority !== undefined) {
      nextPriorities[issueKey] = Number(value.priority) || 0;
    }
    if (typeof value.note === "string" && value.note.trim()) {
      const existing = String(nextNotes[issueKey] || "").trim();
      if (!existing) {
        nextNotes[issueKey] = value.note;
      }
    }
  });

  window.localStorage.setItem(
    WORK_WEEK_STORAGE_KEYS.jiraRowPriorities,
    JSON.stringify(nextPriorities)
  );
  window.localStorage.setItem(WORK_WEEK_STORAGE_KEYS.jiraNotes, JSON.stringify(nextNotes));
};

const TeamPriorityImportSection = ({ onError }) => {
  const [fileName, setFileName] = React.useState("");
  const [csvText, setCsvText] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState(null);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    setResult(null);
    if (!file) {
      setFileName("");
      setCsvText("");
      return;
    }

    setFileName(file.name);
    const text = await file.text();
    setCsvText(text);
  };

  const handleImport = async () => {
    if (!csvText.trim()) {
      onError?.("Choose a CSV file first");
      return;
    }

    setLoading(true);
    setResult(null);
    onError?.("");
    try {
      const data = await importIssueMetadataCsv(csvText);
      applyImportToLocalStorage(data?.items);
      setResult(data);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsSection
      title="Import team priorities"
      description="Load NORA rankings from the shared Excel tracker (CSV)"
    >
      <p style={{ marginTop: 0, color: "#475569", fontSize: "0.9rem" }}>
        Export the NORA tracker from Excel as <strong>CSV (UTF-8)</strong>. Required columns:{" "}
        <code>Priority</code>, <code>ODI</code>. Optional: <code>notes</code>.{" "}
        <code>Developer</code> and <code>Jira Status</code> are ignored. Re-import when rankings
        change — matching issues overwrite priority; notes fill only when local notes are empty.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
        <input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
        <Button primary size="small" onClick={handleImport} loading={loading} disabled={loading || !csvText}>
          Import CSV
        </Button>
        {fileName ? <span style={{ color: "#64748b", fontSize: "0.85rem" }}>{fileName}</span> : null}
      </div>
      {result?.ok ? (
        <Message positive size="small" style={{ marginTop: "0.85rem" }}>
          Updated {result.updatedPriorities} priorities
          {result.filledNotes ? `, filled ${result.filledNotes} notes` : ""}
          {result.skipped ? `, skipped ${result.skipped}` : ""}. Reload Work Week (or re-run JQL) if
          rows are already open.
        </Message>
      ) : null}
      {Array.isArray(result?.errors) && result.errors.length > 0 ? (
        <Message warning size="small" style={{ marginTop: "0.5rem" }}>
          {result.errors.slice(0, 5).map((err) => (
            <div key={`${err.row}-${err.reason}`}>
              Row {err.row}: {err.reason}
            </div>
          ))}
          {result.errors.length > 5 ? <div>…and {result.errors.length - 5} more</div> : null}
        </Message>
      ) : null}
    </SettingsSection>
  );
};

export default TeamPriorityImportSection;
