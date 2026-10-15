import React from "react";
import { Button, Message } from "semantic-ui-react";
import { getSiteContext, siteStorageKey, readSiteStorage } from "../../../utils/siteContextStore.js";
import { fetchTeamPriorityHealth, previewIssueMetadataImport } from "../../../services/jiraClient.js";
import { WORK_WEEK_STORAGE_KEYS } from "../../../utils/workWeekStorage.js";
import SettingsSection from "./SettingsSection";
import IssueImportPreview from "./IssueImportPreview";

const readJsonObject = (key, instanceId) => {
  try {
    const parsed = JSON.parse(readSiteStorage(window.localStorage, key, instanceId) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
};

const TeamPriorityImportSection = () => {
  const siteContext = React.useRef(getSiteContext()).current;
  const inputRef = React.useRef(null);
  const previousId = React.useRef(null);
  const pending = React.useRef(false);
  const [fileName, setFileName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sourceChanged, setSourceChanged] = React.useState(false);
  const [preview, setPreview] = React.useState(null);
  const [error, setError] = React.useState("");
  const [health, setHealth] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    fetchTeamPriorityHealth({ siteContext }).then(value => { if (!cancelled) setHealth(value); }).catch(() => { if (!cancelled) setHealth({ error: "Team database is unavailable. Check Team data below." }); });
    return () => { cancelled = true; };
  }, [siteContext]);
  const load = async () => {
    const file = inputRef.current?.files?.[0];
    if (!file || pending.current) return;
    pending.current = true; setLoading(true); setError("");
    try {
      const csvText = await file.text();
      const next = await previewIssueMetadataImport({ destination: "local", csvText, ...(previousId.current ? { supersedesPreviewId: previousId.current } : {}) }, { siteContext });
      if (getSiteContext()?.generation !== siteContext?.generation) return;
      previousId.current = next.previewId; setPreview(next); setSourceChanged(false);
    } catch (failure) {
      if ([409, 410].includes(failure.status)) previousId.current = null;
      setError(failure.message || "Could not read this CSV. Your previous edits are kept.");
    } finally { pending.current = false; setLoading(false); }
  };
  const updateLocalCaches = (savedPreview) => {
    const instanceId = siteContext.instanceId;
    const priorities = readJsonObject(WORK_WEEK_STORAGE_KEYS.jiraRowPriorities, instanceId);
    const notes = readJsonObject(WORK_WEEK_STORAGE_KEYS.jiraNotes, instanceId);
    const planning = readJsonObject(WORK_WEEK_STORAGE_KEYS.planningMetaByKey, instanceId);
    for (const row of savedPreview.diff) {
      for (const [field, change] of Object.entries(row.changes)) {
        if (field === "priority") priorities[row.issueKey] = change.after;
        else if (field === "note") notes[row.issueKey] = change.after;
        else if (field !== "startDate") planning[row.issueKey] = { ...planning[row.issueKey], [field]: change.after };
      }
    }
    try {
      for (const [key, value] of [[WORK_WEEK_STORAGE_KEYS.jiraRowPriorities, priorities], [WORK_WEEK_STORAGE_KEYS.jiraNotes, notes], [WORK_WEEK_STORAGE_KEYS.planningMetaByKey, planning]]) window.localStorage.setItem(siteStorageKey(key, instanceId), JSON.stringify(value));
    } catch (failure) {
      if (!["QuotaExceededError", "SecurityError"].includes(failure.name)) throw failure;
      setError("Saved locally. Browser cache could not refresh; re-run your task query to load saved values.");
    }
  };
  return <SettingsSection title="Import metadata" description="Review, edit and approve a CSV before saving locally or to team">
    <p>Choose a CSV UTF-8 file with an issue key (ODI or Key) and supported metadata columns. Priority, Notes, Now / Next, Requestor, planned dates, Actual start and Decision note are supported. Unknown columns are reported and ignored.</p>
    <div className="issue-import-actions"><input ref={inputRef} type="file" accept=".csv,text/csv,.txt" aria-label="Metadata CSV" onChange={event => { setFileName(event.target.files?.[0]?.name || ""); setSourceChanged(true); setError(""); }} /><Button type="button" primary disabled={loading || !fileName} loading={loading} onClick={load}>Preview CSV</Button><span>{fileName}</span></div>
    {error ? <Message negative role="alert">{error}</Message> : null}
    {preview ? <IssueImportPreview key={preview.previewId} initialPreview={preview} sourceChanged={sourceChanged} siteContext={siteContext} teamAvailable={Boolean(health?.configured && health?.connected)} teamReason={health?.error || (health?.configured ? "Team database is unavailable. Check Team data below." : "Team database is not configured. Local saving is available.")} onPreview={id => { previousId.current = id; }} onLocalSaved={updateLocalCaches} /> : null}
  </SettingsSection>;
};
export default TeamPriorityImportSection;
