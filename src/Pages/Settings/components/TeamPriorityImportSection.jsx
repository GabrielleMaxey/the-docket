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

const TeamPriorityImportSection = () => {
  const inputRef = React.useRef(null);
  const [fileName, setFileName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [localError, setLocalError] = React.useState("");

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    setResult(null);
    setLocalError("");
    setFileName(file?.name || "");
  };

  const handleImport = async () => {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setLocalError("Choose a CSV file first");
      return;
    }

    setLoading(true);
    setResult(null);
    setLocalError("");
    try {
      const csvText = await file.text();
      const data = await importIssueMetadataCsv(csvText);
      applyImportToLocalStorage(data.items);
      setResult(data);
      if (!data.updatedPriorities) {
        const skipHints = Array.isArray(data.errors) && data.errors.length
          ? ` First skips: ${data.errors
              .slice(0, 3)
              .map((err) => `row ${err.row} ${err.reason}`)
              .join("; ")}.`
          : "";
        setLocalError(
          `Import finished but no priorities were updated (skipped ${data.skipped || 0}). Blank Priority and “Completed” rows are skipped; ranks above 20 import as P20.${skipHints}`
        );
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Import failed");
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
        Export the NORA tracker from Excel as <strong>CSV UTF-8</strong> (not the
        .xlsx workbook). Required columns: Priority, ODI. Optional: Notes. After changing
        import code, restart <code>npm run dev:all</code> so the API loads new routes.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,.txt"
          onChange={handleFileChange}
        />
        <Button type="button" primary size="small" onClick={handleImport} loading={loading} disabled={loading || !fileName}>
          Import CSV
        </Button>
        {fileName ? <span style={{ color: "#64748b", fontSize: "0.85rem" }}>{fileName}</span> : null}
      </div>
      {localError ? (
        <Message negative size="small" style={{ marginTop: "0.85rem" }}>
          {localError}
        </Message>
      ) : null}
      {result?.ok && result.updatedPriorities > 0 ? (
        <Message positive size="small" style={{ marginTop: "0.85rem" }}>
          Updated {result.updatedPriorities} priorities
          {result.filledNotes ? `, filled ${result.filledNotes} notes` : ""}
          {result.skipped ? `, skipped ${result.skipped}` : ""}. Open Work Week again (or re-run JQL)
          to see the new priorities.
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
