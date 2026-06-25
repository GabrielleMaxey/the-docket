import React from "react";
import { Container, Header, Segment, Button, Message, Form, Table, Icon } from "semantic-ui-react";
import "semantic-ui-css/semantic.min.css";
import {
  createEpicPreset,
  createWatchedAssignee,
  deleteEpicPreset,
  deleteWatchedAssignee,
  fetchAppSettings,
  fetchChatStatus,
  fetchEpicPresets,
  fetchFieldMappings,
  fetchJiraFields,
  fetchJiraFilters,
  fetchWatchedAssignees,
  saveAppSettings,
  saveFieldMappings,
  syncFieldMappingsFromJira,
  testJiraConnection,
  updateEpicPreset,
} from "../services/jiraClient.js";
import { getApiBase, setStoredProxyUrl } from "../services/apiBase.js";
import { JQL_PRESET_TEMPLATES, getJqlPresetTemplateByKey } from "../utils/jqlPresetTemplates.js";
import { useFlash } from "./hooks/useFlash.js";

// Collapsible wrapper for each Settings section. Accepts an optional
// `description` shown as a subtitle line when the section is collapsed,
// so users know what each section does without opening it.
const SettingsSection = ({ title, description, children }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="settings-section-collapsible" style={{ marginBottom: "1.25rem" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "0.75rem",
          padding: "0.85rem 1rem",
          border: "1px solid #e2e8f0",
          borderRadius: open ? "10px 10px 0 0" : "10px",
          background: "#f8fafc",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span>
          <span style={{ display: "block", fontWeight: 700, fontSize: "1rem", color: "#0f172a" }}>{title}</span>
          {!open && description ? (
            <span style={{ display: "block", fontSize: "0.8rem", color: "#64748b", fontWeight: 400, marginTop: "0.15rem" }}>{description}</span>
          ) : null}
        </span>
        <span style={{ fontSize: "1rem", color: "#94a3b8", transform: open ? "rotate(-90deg)" : "rotate(90deg)", display: "inline-block", transition: "transform 0.18s", lineHeight: 1, flexShrink: 0, marginTop: "0.15rem" }}>›</span>
      </button>
      {open ? (
        <div style={{ border: "1px solid #e2e8f0", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "1.25rem" }}>
          {children}
        </div>
      ) : null}
    </div>
  );
};

const EMPTY_EPIC_FORM = {
  presetType: "epic",
  epicKey: "",
  epicName: "",
  jiraFilterId: "",
  jql: "",
  sortOrder: 0,
};

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

const Settings = () => {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [epicPresets, setEpicPresets] = React.useState([]);
  const [fieldMappings, setFieldMappings] = React.useState([]);
  const [jiraFields, setJiraFields] = React.useState([]);
  const [settings, setSettings] = React.useState({
    epic_past_due_mode: "either",
    proxy_url: "",
    chat_custom_instructions: "",
  });
  const [watchedAssignees, setWatchedAssignees] = React.useState([]);
  const [epicForm, setEpicForm] = React.useState(EMPTY_EPIC_FORM);
  const [editingEpicId, setEditingEpicId] = React.useState(null);
  const [watchedName, setWatchedName] = React.useState("");
  const [watchedJql, setWatchedJql] = React.useState("");
  const [watchType, setWatchType] = React.useState("person");
  const [chatStatus, setChatStatus] = React.useState(null);
  const [syncingFields, setSyncingFields] = React.useState(false);
  const [jiraFilters, setJiraFilters] = React.useState([]);
  const [loadingFilters, setLoadingFilters] = React.useState(false);
  const [selectedJqlTemplateKey, setSelectedJqlTemplateKey] = React.useState("");

  // One confirmation flash per save action, so clicking a button shows its
  // own “✓ done” note right there — not just the shared banner at the top of
  // a long page that's easy to miss once you've scrolled down.
  const [epicPresetFlash, flashEpicPreset] = useFlash();
  const [fieldMappingsFlash, flashFieldMappings] = useFlash();
  const [settingsFlash, flashSettings] = useFlash();
  const [watchedAssigneeFlash, flashWatchedAssignee] = useFlash();

  const [jiraConnStatus, setJiraConnStatus] = React.useState(null); // null | 'loading' | 'ok' | 'error'
  const [jiraConnMessage, setJiraConnMessage] = React.useState("");

  const handleTestJiraConnection = async () => {
    setJiraConnStatus("loading");
    setJiraConnMessage("");
    try {
      const data = await testJiraConnection();
      const name = data?.displayName || data?.emailAddress || "Connected";
      setJiraConnMessage(`✓ Connected as ${name}`);
      setJiraConnStatus("ok");
    } catch (err) {
      setJiraConnMessage(err instanceof Error ? err.message : "Connection failed");
      setJiraConnStatus("error");
    }
  };

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [presets, mappings, appSettings, watched, fields, chat] = await Promise.all([
        fetchEpicPresets(),
        fetchFieldMappings(),
        fetchAppSettings(),
        fetchWatchedAssignees(),
        fetchJiraFields().catch(() => []),
        fetchChatStatus().catch(() => null),
      ]);
      setEpicPresets(presets);
      setFieldMappings(mappings);
      setSettings({
        epic_past_due_mode: appSettings.epic_past_due_mode || "either",
        proxy_url: appSettings.proxy_url || getApiBase(),
        chat_custom_instructions: appSettings.chat_custom_instructions || "",
      });
      setWatchedAssignees(watched);
      setJiraFields(fields);
      setChatStatus(chat);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const flashSuccess = (message) => {
    setSuccess(message);
    window.setTimeout(() => setSuccess(""), 3000);
  };

  const handleEpicFormChange = (field, value) => {
    setEpicForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetEpicForm = () => {
    setEpicForm(EMPTY_EPIC_FORM);
    setEditingEpicId(null);
  };

  const handleSaveEpicPreset = async () => {
    setError("");
    try {
      if (editingEpicId) {
        await updateEpicPreset(editingEpicId, epicForm);
        flashSuccess("Epic preset updated.");
        flashEpicPreset("Epic preset updated.");
      } else {
        await createEpicPreset(epicForm);
        flashSuccess("Epic preset added.");
        flashEpicPreset("Epic preset added.");
      }
      resetEpicForm();
      setEpicPresets(await fetchEpicPresets());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save epic preset");
    }
  };

  const handleEditEpicPreset = (preset) => {
    setEditingEpicId(preset.id);
    setEpicForm({
      presetType: preset.presetType || "epic",
      epicKey: preset.presetType === "jql" ? "" : preset.epicKey,
      epicName: preset.epicName,
      jiraFilterId: preset.jiraFilterId,
      jql: preset.jql,
      sortOrder: preset.sortOrder,
    });
  };

  const handleLoadJiraFilters = async () => {
    setLoadingFilters(true);
    setError("");
    try {
      const filters = await fetchJiraFilters();
      setJiraFilters(filters);
      if (filters.length === 0) {
        setError("No saved Jira filters found for your account.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Jira filters");
    } finally {
      setLoadingFilters(false);
    }
  };

  const handleApplyJqlTemplate = React.useCallback(() => {
    if (!selectedJqlTemplateKey) {
      return;
    }

    const template = getJqlPresetTemplateByKey(selectedJqlTemplateKey);
    if (!template) {
      return;
    }

    setEpicForm((prev) => ({
      ...prev,
      presetType: "jql",
      epicName: template.label,
      jql: template.jql,
      jiraFilterId: "",
    }));
    setEditingEpicId(null);
    flashSuccess(`Template loaded: ${template.label}`);
    flashEpicPreset(`Template loaded: ${template.label}`);
  }, [selectedJqlTemplateKey, flashEpicPreset, flashSuccess]);

  const handleDeleteEpicPreset = async (id) => {
    if (!window.confirm("Delete this epic preset?")) {
      return;
    }

    setError("");
    try {
      await deleteEpicPreset(id);
      if (editingEpicId === id) {
        resetEpicForm();
      }
      setEpicPresets(await fetchEpicPresets());
      flashSuccess("Epic preset deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete epic preset");
    }
  };

  const handleFieldMappingChange = (role, fieldName) => {
    const match = jiraFields.find((field) => field.name === fieldName);
    setFieldMappings((prev) =>
      prev.map((row) =>
        row.role === role
          ? {
              ...row,
              fieldName,
              fieldId: match?.id || row.fieldId,
            }
          : row
      )
    );
  };

  const handleSaveFieldMappings = async () => {
    setError("");
    try {
      const items = await saveFieldMappings(
        fieldMappings.map((row) => ({
          role: row.role,
          fieldName: row.fieldName,
          fieldId: row.fieldId,
        }))
      );
      setFieldMappings(items);
      flashSuccess("Field mappings saved.");
      flashFieldMappings("Field mappings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save field mappings");
    }
  };

  const handleSyncFields = async () => {
    setSyncingFields(true);
    setError("");
    try {
      const items = await syncFieldMappingsFromJira();
      setFieldMappings(items);
      setJiraFields(await fetchJiraFields());
      flashSuccess("Field IDs synced from Jira.");
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Failed to sync fields from Jira");
    } finally {
      setSyncingFields(false);
    }
  };

  const handleSaveSettings = async () => {
    setError("");
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
      flashSuccess("Settings saved.");
      flashSettings("Settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save settings");
    }
  };

  const handleAddWatchedAssignee = async () => {
    const displayName = watchedName.trim();
    const jql = watchedJql.trim();
    if (!displayName) {
      return;
    }

    if (watchType === "jql" && !jql) {
      setError("JQL is required for a JQL watch.");
      return;
    }

    setError("");
    try {
      await createWatchedAssignee({
        displayName,
        watchType,
        jql: watchType === "jql" ? jql : "",
        sortOrder: watchedAssignees.length,
      });
      setWatchedName("");
      setWatchedJql("");
      setWatchType("person");
      setWatchedAssignees(await fetchWatchedAssignees());
      const watchedMessage = watchType === "jql" ? "JQL watch added." : "Watched person added.";
      flashSuccess(watchedMessage);
      flashWatchedAssignee(watchedMessage);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Failed to add watch");
    }
  };

  const handleDeleteWatchedAssignee = async (id) => {
    setError("");
    try {
      await deleteWatchedAssignee(id);
      setWatchedAssignees(await fetchWatchedAssignees());
      flashSuccess("Watched person removed.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to remove watched person");
    }
  };

  const fieldOptions = jiraFields.map((field) => ({
    key: field.id,
    value: field.name,
    text: field.name,
  }));

  return (
    <Container style={{ marginTop: "1.5rem", marginBottom: "2rem", maxWidth: "1500px", width: "100%", paddingLeft: "1rem", paddingRight: "1rem" }}>
      <Header as="h1">Settings</Header>
      <p>Manage epic presets, Jira date field mappings, past-due rules, and watched people.</p>

      {error ? <Message negative content={error} /> : null}
      {success ? <Message positive content={success} /> : null}

      <Segment>
        <Header as="h2">Jira connection</Header>
        <p>Verify that the API credentials in <code>.env</code> are working before changing other settings.</p>
        <Button
          primary
          onClick={handleTestJiraConnection}
          loading={jiraConnStatus === "loading"}
          disabled={jiraConnStatus === "loading"}
        >
          Test Jira Connection
        </Button>
        {jiraConnMessage ? (
          <Message
            positive={jiraConnStatus === "ok"}
            negative={jiraConnStatus === "error"}
            size="small"
            style={{ marginTop: "0.75rem" }}
          >
            {jiraConnMessage}
          </Message>
        ) : null}
      </Segment>

      <SettingsSection title="Epic &amp; JQL presets" description="Define the Jira queries or epic keys that appear on the Dashboard and Work Week pages.">
        <p>
          Epic presets link to a Jira epic key; JQL presets run a saved query directly (no epic
          metrics).
        </p>
        <Table celled compact>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Type</Table.HeaderCell>
              <Table.HeaderCell>Label</Table.HeaderCell>
              <Table.HeaderCell>Filter ID</Table.HeaderCell>
              <Table.HeaderCell>JQL</Table.HeaderCell>
              <Table.HeaderCell collapsing />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {epicPresets.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan="5">No presets yet.</Table.Cell>
              </Table.Row>
            ) : (
              epicPresets.map((preset) => (
                <Table.Row key={preset.id}>
                  <Table.Cell>{preset.presetType === "jql" ? "JQL" : "Epic"}</Table.Cell>
                  <Table.Cell>{preset.label}</Table.Cell>
                  <Table.Cell>{preset.jiraFilterId || "—"}</Table.Cell>
                  <Table.Cell>{preset.jql || "—"}</Table.Cell>
                  <Table.Cell collapsing>
                    <Button size="mini" onClick={() => handleEditEpicPreset(preset)}>
                      Edit
                    </Button>
                    <Button size="mini" negative onClick={() => handleDeleteEpicPreset(preset.id)}>
                      Delete
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table>

        <Form style={{ marginTop: "1rem" }}>
          <Form.Select
            label="Preset type"
            options={[
              { key: "epic", text: "Epic (ODI-1234 + name)", value: "epic" },
              { key: "jql", text: "JQL query", value: "jql" },
            ]}
            value={epicForm.presetType}
            onChange={(_e, { value }) => handleEpicFormChange("presetType", String(value || "epic"))}
          />
          {epicForm.presetType === "jql" ? (
            <>
              <div style={{ marginBottom: "0.75rem" }}>
                <label
                  htmlFor="jql-template-select"
                  style={{ display: "block", fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.4rem", color: "#334155" }}
                >
                  Starter template library
                </label>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                  <select
                    id="jql-template-select"
                    value={selectedJqlTemplateKey}
                    onChange={(event) => setSelectedJqlTemplateKey(event.target.value)}
                    style={{ padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem", minWidth: "260px" }}
                  >
                    <option value="">Pick a starter template...</option>
                    {JQL_PRESET_TEMPLATES.map((template) => (
                      <option key={template.key} value={template.key}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="small"
                    onClick={handleApplyJqlTemplate}
                    disabled={!selectedJqlTemplateKey}
                  >
                    Load template
                  </Button>
                </div>
                {selectedJqlTemplateKey ? (
                  <p style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "0.25rem" }}>
                    {getJqlPresetTemplateByKey(selectedJqlTemplateKey)?.description || ""}
                  </p>
                ) : (
                  <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.25rem" }}>
                    Select a template to prefill label and JQL, then click Add preset.
                  </p>
                )}
              </div>

              <Form.Input
                label="Label"
                placeholder="My open tasks"
                value={epicForm.epicName}
                onChange={(_e, { value }) => handleEpicFormChange("epicName", value)}
              />

              {/* Option A: import from a saved Jira filter */}
              <div style={{ marginBottom: "0.75rem" }}>
                <label style={{ display: "block", fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.4rem", color: "#334155" }}>
                  Option A — Import from a saved Jira filter
                </label>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                  <Button
                    type="button"
                    size="small"
                    onClick={handleLoadJiraFilters}
                    loading={loadingFilters}
                    disabled={loadingFilters}
                  >
                    Browse saved Jira filters
                  </Button>
                  {jiraFilters.length > 0 ? (
                    <select
                      value={epicForm.jiraFilterId || ""}
                      onChange={(e) => {
                        const selected = jiraFilters.find((f) => String(f.id) === e.target.value);
                        if (selected) {
                          handleEpicFormChange("jiraFilterId", String(selected.id));
                          handleEpicFormChange("jql", selected.jql || "");
                          if (!epicForm.epicName) {
                            handleEpicFormChange("epicName", selected.name || "");
                          }
                        }
                      }}
                      style={{ padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem", minWidth: "220px" }}
                    >
                      <option value="">Pick a saved filter…</option>
                      {jiraFilters.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  ) : null}
                </div>
                {epicForm.jiraFilterId ? (
                  <p style={{ fontSize: "0.78rem", color: "#22c55e", marginTop: "0.25rem" }}>
                    ✓ Filter ID {epicForm.jiraFilterId} selected — JQL loaded below.
                  </p>
                ) : (
                  <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.25rem" }}>
                    Click “Browse saved Jira filters” to load your filters, then pick one to auto-fill the JQL.
                  </p>
                )}
              </div>

              {/* Option B: enter manually */}
              <div style={{ marginBottom: "0.5rem" }}>
                <label style={{ display: "block", fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.25rem", color: "#334155" }}>
                  Option B — Enter manually
                </label>
                <p style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "0.4rem" }}>
                  Paste a Jira epic key (e.g. <code>ODI-19898</code>), a JQL query, or a filter ID.
                  JQL takes precedence over the filter ID when both are set.
                </p>
              </div>
              <Form.TextArea
                label="JQL"
                placeholder="project = ODI AND assignee = currentUser() — or paste from Jira"
                value={epicForm.jql}
                onChange={(_e, { value }) => handleEpicFormChange("jql", value)}
              />
            </>
          ) : (
            <>
              <Form.Group widths="equal">
                <Form.Input
                  label="Epic key"
                  placeholder="ODI-1234"
                  value={epicForm.epicKey}
                  onChange={(_e, { value }) => handleEpicFormChange("epicKey", value)}
                />
                <Form.Input
                  label="Epic name"
                  placeholder="Nora"
                  value={epicForm.epicName}
                  onChange={(_e, { value }) => handleEpicFormChange("epicName", value)}
                />
                <Form.Input
                  label="Jira filter ID"
                  value={epicForm.jiraFilterId}
                  onChange={(_e, { value }) => handleEpicFormChange("jiraFilterId", value)}
                />
              </Form.Group>
              <Form.Input
                label="JQL (optional if filter ID set)"
                value={epicForm.jql}
                onChange={(_e, { value }) => handleEpicFormChange("jql", value)}
              />
            </>
          )}
          <Form.Input
            label="Sort order"
            type="number"
            value={epicForm.sortOrder}
            onChange={(_e, { value }) => handleEpicFormChange("sortOrder", Number(value) || 0)}
          />
          <Button primary onClick={handleSaveEpicPreset}>
            {editingEpicId ? "Update preset" : "Add preset"}
          </Button>
          {editingEpicId ? (
            <Button basic onClick={resetEpicForm}>
              Cancel edit
            </Button>
          ) : null}
          {epicPresetFlash ? (
            <Message positive size="mini" style={{ marginTop: "0.75rem" }}>
              ✓ {epicPresetFlash}
            </Message>
          ) : null}
        </Form>
      </SettingsSection>

      <SettingsSection title="Date fields &amp; past-due rules" description="Map Jira custom date fields (Initial Done Date, Most Recent Done Date) and set how overdue status is determined.">
        <p>Map Automation Done Date fields without editing .env.</p>
        <Button onClick={handleSyncFields} loading={syncingFields} disabled={syncingFields}>
          <Icon name="sync" />
          Refresh from Jira
        </Button>
        <Form style={{ marginTop: "1rem" }}>
          {fieldMappings.map((row) => (
            <Form.Group key={row.role} widths="equal">
              <Form.Input
                label="Role"
                readOnly
                value={FIELD_ROLE_LABELS[row.role] || row.role}
              />
              <Form.Dropdown
                label="Jira field"
                selection
                search
                options={fieldOptions}
                value={row.fieldName}
                onChange={(_e, { value }) => handleFieldMappingChange(row.role, value)}
              />
              <Form.Input label="Field ID" readOnly value={row.fieldId || "(not synced)"} />
            </Form.Group>
          ))}
          <Button primary onClick={handleSaveFieldMappings}>
            Save field mappings
          </Button>
          {fieldMappingsFlash ? (
            <Message positive size="mini" style={{ marginTop: "0.75rem" }}>
              ✓ {fieldMappingsFlash}
            </Message>
          ) : null}
        </Form>

        <div style={{ borderTop: "1px solid #e2e8f0", margin: "1.25rem 0 1rem" }} />
        <Header as="h4" style={{ margin: "0 0 0.75rem" }}>Past-due rules</Header>
        <Form>
          <Form.Dropdown
            label="Epic past-due basis"
            selection
            options={PAST_DUE_OPTIONS}
            value={settings.epic_past_due_mode}
            onChange={(_e, { value }) =>
              setSettings((prev) => ({ ...prev, epic_past_due_mode: value }))
            }
          />
          <Form.Input
            label="App URL (browser mode only)"
            placeholder="http://localhost:8787"
            value={settings.proxy_url}
            onChange={(_e, { value }) => setSettings((prev) => ({ ...prev, proxy_url: value }))}
          />
          <p className="ww-copy" style={{ marginTop: "0.5rem" }}>
            Leave blank when using the <strong>desktop app (Electron)</strong> or Vite dev (
            <code>http://localhost:5173</code>). In the browser, set this to the helper URL (usually{" "}
            <code>http://localhost:8787</code>) if API calls fail.
          </p>
          <Button primary onClick={handleSaveSettings}>
            Save settings
          </Button>
          {settingsFlash ? (
            <Message positive size="mini" style={{ marginTop: "0.75rem" }}>
              ✓ {settingsFlash}
            </Message>
          ) : null}
        </Form>
      </SettingsSection>

      <SettingsSection title="Metric targets" description="Save people or team JQL groups so you can quickly track progress for yourself or others on the Dashboard.">
        <p>
          Track workload and overdue metrics for specific people or teams on the Dashboard.
          Add yourself to see your own progress, or add colleagues and team JQL groups.
          These appear as quick-select chips on the Dashboard.
        </p>
        <Table celled compact>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Type</Table.HeaderCell>
              <Table.HeaderCell>Label</Table.HeaderCell>
              <Table.HeaderCell>JQL</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {watchedAssignees.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan="4">No watches yet.</Table.Cell>
              </Table.Row>
            ) : (
              watchedAssignees.map((person) => (
                <Table.Row key={person.id}>
                  <Table.Cell>{person.watchType === "jql" ? "JQL" : "Person"}</Table.Cell>
                  <Table.Cell>{person.displayName}</Table.Cell>
                  <Table.Cell>{person.jql || "—"}</Table.Cell>
                  <Table.Cell collapsing>
                    <Button size="mini" negative onClick={() => handleDeleteWatchedAssignee(person.id)}>
                      Remove
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table>
        <Form style={{ marginTop: "1rem" }} onSubmit={(event) => event.preventDefault()}>
          <Form.Select
            label="Watch type"
            options={[
              { key: "person", text: "Person (display name)", value: "person" },
              { key: "jql", text: "JQL query", value: "jql" },
            ]}
            value={watchType}
            onChange={(_e, { value }) => setWatchType(String(value || "person"))}
          />
          <Form.Input
            label="Label"
            placeholder={watchType === "jql" ? "My open bugs" : "gabrielle.maxey"}
            value={watchedName}
            onChange={(_e, { value }) => setWatchedName(value)}
          />
          {watchType === "jql" ? (
            <Form.TextArea
              label="JQL"
              placeholder="assignee = currentUser() AND statusCategory != Done"
              value={watchedJql}
              onChange={(_e, { value }) => setWatchedJql(value)}
            />
          ) : null}
          <Button onClick={handleAddWatchedAssignee}>Add watch</Button>
          {watchedAssigneeFlash ? (
            <Message positive size="mini" style={{ marginTop: "0.75rem" }}>
              ✓ {watchedAssigneeFlash}
            </Message>
          ) : null}
        </Form>
      </SettingsSection>

      <SettingsSection title="Chat assistant" description="Configure the AI chat assistant — set custom instructions and check connection status.">
        <p>
          The chat assistant already follows a few built-in rules every time it answers — you
          don't need to do anything for these:
        </p>
        <ul className="ww-copy">
          <li>It's a helpful assistant for this Jira task manager.</li>
          <li>It uses the epics selected in the filter panel when relevant.</li>
          <li>It searches Jira directly with JQL instead of guessing, when needed.</li>
          <li>
            It never states a name or fact unless it came from real selected-epic data or an
            actual Jira search — it won't guess or make up people.
          </li>
          <li>It keeps responses professional — no offensive or inappropriate language.</li>
          <li>
            It only helps with Lumen Jira data — it declines requests that are unrelated or
            inappropriate, even if asked more than once.
          </li>
        </ul>
        <p>
          Anything you type below is added <em>on top of</em> those defaults for every
          conversation — use it to tell the assistant how you'd like it to answer. For example:
          <br />
          <code>Keep answers short. Always include the issue key. Prefer bullet points over
          paragraphs.</code>
        </p>
        <Form>
          <Form.TextArea
            label="Your instructions (optional)"
            placeholder="e.g. Keep answers short and always include issue keys."
            value={settings.chat_custom_instructions}
            onChange={(_e, { value }) =>
              setSettings((prev) => ({ ...prev, chat_custom_instructions: value }))
            }
          />
          <Button primary onClick={handleSaveSettings}>
            Save chat instructions
          </Button>
          {settingsFlash ? (
            <Message positive size="mini" style={{ marginTop: "0.75rem" }}>
              ✓ {settingsFlash}
            </Message>
          ) : null}
        </Form>

        <div style={{ borderTop: "1px solid #e2e8f0", margin: "1.25rem 0 1rem" }} />
        <Header as="h4" style={{ margin: "0 0 0.5rem" }}>Connection status</Header>
        <p style={{ fontSize: "0.85rem", color: "#475569", marginBottom: "0.75rem" }}>
          Set <code>CHAT_PROVIDER</code> and the matching API key in <code>.env</code> on the proxy host
          (see JIRA_SETUP.md). Use <code>CHAT_PROVIDER=rovo</code> only if your org has Rovo MCP access.
        </p>
        {chatStatus ? (
          <Message info size="small">
            Provider: <strong>{chatStatus.provider}</strong>
            {chatStatus.provider === "rovo" && chatStatus.oauthConnected
              ? " · Signed in with Atlassian"
              : ""}
            {chatStatus.ready ? " · Ready" : " · Not ready — check API keys in .env"}
          </Message>
        ) : (
          <Message warning size="small">Could not load chat status.</Message>
        )}
      </SettingsSection>
    </Container>
  );
};

export default Settings;
