import React from "react";
import { Button, Message } from "semantic-ui-react";
import {
  fetchTeamPriorityHealth,
  importIssueMetadataCsv,
  importTeamPriorityCsv,
} from "../../../services/jiraClient.js";
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
  const [atlasConnected, setAtlasConnected] = React.useState(false);
  const [target, setTarget] = React.useState("local");

  React.useEffect(() => {
    let cancelled = false;
    fetchTeamPriorityHealth()
      .then((health) => {
        if (!cancelled) {
          setAtlasConnected(Boolean(health?.configured && health?.connected));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAtlasConnected(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!atlasConnected && target === "atlas") {
      setTarget("local");
    }
  }, [atlasConnected, target]);

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
      if (target === "atlas") {
        const data = await importTeamPriorityCsv(csvText);
        setResult({
          ok: data.ok,
          updatedPriorities: data.updatedPriorities,
          skipped: data.skipped,
          errors: data.errors,
          target: "atlas",
        });
        if (!data.updatedPriorities) {
          setLocalError(
            `Atlas import finished but no priorities were updated (skipped ${data.skipped || 0}).`
          );
        }
        return;
      }

      const data = await importIssueMetadataCsv(csvText);
      applyImportToLocalStorage(data.items);
      setResult({ ...data, target: "local" });
      if (!data.updatedPriorities) {
        const skipHints =
          Array.isArray(data.errors) && data.errors.length
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
      description="Upload a CSV to set priorities in bulk"
    >
      <p style={{ marginTop: 0, color: "#475569", fontSize: "0.9rem" }}>
        This uploads a CSV file — it does not copy priorities that already exist in Atlas onto
        this machine. To bring existing shared priorities down instead, use{" "}
        <strong>Pull from Atlas</strong> in <strong>Team priority (Atlas demo)</strong> below.
      </p>
      <p style={{ marginTop: 0, color: "#475569", fontSize: "0.9rem" }}>
        Export the team's NORA tracker from Excel as <strong>CSV UTF-8</strong> (not the .xlsx
        workbook). Required columns: Priority, ODI. Optional: Notes.
      </p>
      <p style={{ marginTop: 0, marginBottom: "0.5rem", color: "#475569", fontSize: "0.9rem" }}>
        Choose where the CSV's priorities are written:
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center", marginBottom: "0.75rem" }}>
        <label style={{ display: "flex", gap: "0.35rem", alignItems: "center", fontSize: "0.9rem" }}>
          <input
            type="radio"
            name="priority-import-target"
            checked={target === "local"}
            onChange={() => setTarget("local")}
          />
          This machine — local SQLite, used by Work Week right away
        </label>
        <label
          style={{
            display: "flex",
            gap: "0.35rem",
            alignItems: "center",
            fontSize: "0.9rem",
            opacity: atlasConnected ? 1 : 0.5,
          }}
          title={
            atlasConnected
              ? undefined
              : "Atlas isn't reachable right now — check Team priority (Atlas demo) below"
          }
        >
          <input
            type="radio"
            name="priority-import-target"
            checked={target === "atlas"}
            onChange={() => setTarget("atlas")}
            disabled={!atlasConnected}
          />
          Atlas (demo) — shared database, doesn't change this machine until pulled
        </label>
      </div>
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
          {result.target === "atlas"
            ? `Seeded ${result.updatedPriorities} priorities to Atlas`
            : `Updated ${result.updatedPriorities} priorities`}
          {result.filledNotes ? `, filled ${result.filledNotes} notes` : ""}
          {result.skipped ? `, skipped ${result.skipped}` : ""}.
          {result.target === "local"
            ? " Open Work Week again (or re-run JQL) to see the new priorities."
            : " Link a Work Week slot to a shared program to use them live, or use Pull from Atlas below to copy them to this machine."}
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
