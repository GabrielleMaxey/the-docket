import React from "react";
import { Button, Form, Header, Icon, Message } from "semantic-ui-react";
import SettingsSection from "./SettingsSection";
import {
  fetchJiraFields,
  saveAppSettings,
  saveFieldMappings,
  syncFieldMappingsFromJira,
} from "../../../services/jiraClient.js";
import { setStoredProxyUrl } from "../../../services/apiBase.js";
import { useFlash } from "../../hooks/useFlash.js";

const FIELD_ROLE_LABELS = {
  initial_done_date: "Initial Done Date",
  most_recent_done_date: "Most Recent Done Date",
  due_date: "Due date",
  project_end_date: "Project End Date",
};

const PAST_DUE_OPTIONS = [
  { key: "either", value: "either", text: "Either (Most Recent Done Date or Project End Date)" },
  { key: "most_recent_done_date", value: "most_recent_done_date", text: "Most Recent Done Date" },
  { key: "project_end_date", value: "project_end_date", text: "Project End Date" },
];

const DateFieldsSection = ({ fieldMappings, setFieldMappings, jiraFields, setJiraFields, settings, setSettings, onError }) => {
  const [syncingFields, setSyncingFields] = React.useState(false);
  const [fieldMappingsFlash, flashFieldMappings] = useFlash();
  const [settingsFlash, flashSettings] = useFlash();

  const fieldOptions = jiraFields.map((field) => ({ key: field.id, value: field.name, text: field.name }));

  const handleFieldMappingChange = (role, fieldName) => {
    const match = jiraFields.find((field) => field.name === fieldName);
    setFieldMappings((prev) =>
      prev.map((row) => row.role === role ? { ...row, fieldName, fieldId: match?.id || row.fieldId } : row)
    );
  };

  const handleSaveFieldMappings = async () => {
    onError("");
    try {
      const items = await saveFieldMappings(
        fieldMappings.map((row) => ({ role: row.role, fieldName: row.fieldName, fieldId: row.fieldId }))
      );
      setFieldMappings(items);
      flashFieldMappings("Field mappings saved.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save field mappings");
    }
  };

  const handleSyncFields = async () => {
    setSyncingFields(true);
    onError("");
    try {
      const items = await syncFieldMappingsFromJira();
      setFieldMappings(items);
      setJiraFields(await fetchJiraFields());
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to sync fields from Jira");
    } finally {
      setSyncingFields(false);
    }
  };

  const handleSaveSettings = async () => {
    onError("");
    try {
      const next = await saveAppSettings({
        epic_past_due_mode: settings.epic_past_due_mode,
        proxy_url: settings.proxy_url,
        chat_custom_instructions: settings.chat_custom_instructions,
      });
      setSettings({
        epic_past_due_mode: next.epic_past_due_mode || "either",
        proxy_url: next.proxy_url || "",
        chat_custom_instructions: next.chat_custom_instructions || "",
      });
      setStoredProxyUrl(next.proxy_url || "");
      flashSettings("Settings saved.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save settings");
    }
  };

  return (
    <SettingsSection
      title="Date fields &amp; past-due rules"
      description="Map Jira custom date fields (Initial Done Date, Most Recent Done Date) and set how overdue status is determined."
    >
      <p>Map Automation Done Date fields without editing .env.</p>
      <Button onClick={handleSyncFields} loading={syncingFields} disabled={syncingFields}>
        <Icon name="sync" /> Refresh from Jira
      </Button>
      <Form style={{ marginTop: "1rem" }}>
        {fieldMappings.map((row) => (
          <Form.Group key={row.role} widths="equal">
            <Form.Input label="Role" readOnly value={FIELD_ROLE_LABELS[row.role] || row.role} />
            <Form.Dropdown label="Jira field" selection search options={fieldOptions} value={row.fieldName}
              onChange={(_e, { value }) => handleFieldMappingChange(row.role, value)} />
            <Form.Input label="Field ID" readOnly value={row.fieldId || "(not synced)"} />
          </Form.Group>
        ))}
        <Button primary onClick={handleSaveFieldMappings}>Save field mappings</Button>
        {fieldMappingsFlash ? <Message positive size="mini" style={{ marginTop: "0.75rem" }}>✓ {fieldMappingsFlash}</Message> : null}
      </Form>

      <div style={{ borderTop: "1px solid #e2e8f0", margin: "1.25rem 0 1rem" }} />
      <Header as="h4" style={{ margin: "0 0 0.75rem" }}>Past-due rules</Header>
      <Form>
        <Form.Dropdown label="Epic past-due basis" selection options={PAST_DUE_OPTIONS} value={settings.epic_past_due_mode}
          onChange={(_e, { value }) => setSettings((prev) => ({ ...prev, epic_past_due_mode: value }))} />
        <Form.Input label="App URL (browser mode only)" placeholder="http://localhost:8787" value={settings.proxy_url}
          onChange={(_e, { value }) => setSettings((prev) => ({ ...prev, proxy_url: value }))} />
        <p className="ww-copy" style={{ marginTop: "0.5rem" }}>
          Leave blank when using the <strong>desktop app (Electron)</strong> or Vite dev (<code>http://localhost:5173</code>).
          In the browser, set this to the helper URL (usually <code>http://localhost:8787</code>) if API calls fail.
        </p>
        <Button primary onClick={handleSaveSettings}>Save settings</Button>
        {settingsFlash ? <Message positive size="mini" style={{ marginTop: "0.75rem" }}>✓ {settingsFlash}</Message> : null}
      </Form>
    </SettingsSection>
  );
};

export default DateFieldsSection;
