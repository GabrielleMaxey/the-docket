import React from "react";
import { Button, Form, Message, Table } from "semantic-ui-react";
import SettingsSection from "./SettingsSection";
import {
  createEpicPreset,
  deleteEpicPreset,
  exportEpicPresetsPack,
  fetchJiraFilters,
  importEpicPresetsPack,
  updateEpicPreset,
} from "../../../services/jiraClient.js";
import { JQL_PRESET_TEMPLATES, getJqlPresetTemplateByKey } from "../../../utils/jqlPresetTemplates.js";
import { useFlash } from "../../hooks/useFlash.js";
import { useJiraAccountIdResolver } from "../../hooks/useJiraAccountIdResolver.js";

const EMPTY_EPIC_FORM = {
  presetType: "epic",
  epicKey: "",
  epicName: "",
  jiraFilterId: "",
  jql: "",
  sortOrder: 0,
};

const PresetsSection = ({ epicPresets, onPresetsChanged, onError }) => {
  const [epicForm, setEpicForm] = React.useState(EMPTY_EPIC_FORM);
  const [editingEpicId, setEditingEpicId] = React.useState(null);
  const [jiraFilters, setJiraFilters] = React.useState([]);
  const [loadingFilters, setLoadingFilters] = React.useState(false);
  const [selectedJqlTemplateKey, setSelectedJqlTemplateKey] = React.useState("");
  const [flash, setFlash] = useFlash();
  const teamPackInputRef = React.useRef(null);
  const watchedTexts = React.useMemo(() => epicPresets.map((preset) => preset.jql), [epicPresets]);
  const { humanizeJql } = useJiraAccountIdResolver(watchedTexts);

  const handleEpicFormChange = (field, value) => {
    setEpicForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetEpicForm = () => {
    setEpicForm(EMPTY_EPIC_FORM);
    setEditingEpicId(null);
  };

  const handleSaveEpicPreset = async () => {
    onError("");
    try {
      if (editingEpicId) {
        await updateEpicPreset(editingEpicId, epicForm);
        setFlash("Epic preset updated.");
      } else {
        await createEpicPreset(epicForm);
        setFlash("Epic preset added.");
      }
      resetEpicForm();
      onPresetsChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save epic preset");
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

  const handleDeleteEpicPreset = async (id) => {
    if (!window.confirm("Delete this epic preset?")) return;
    onError("");
    try {
      await deleteEpicPreset(id);
      if (editingEpicId === id) resetEpicForm();
      onPresetsChanged();
      setFlash("Epic preset deleted.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to delete epic preset");
    }
  };

  const handleExportTeamPack = async () => {
    onError("");
    try {
      const pack = await exportEpicPresetsPack();
      const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `team-presets_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setFlash("Team preset pack exported.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to export team pack");
    }
  };

  const handleImportTeamPackFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const replace = window.confirm(
      "Import team preset pack?\n\nOK = replace all existing presets with the file.\nCancel = merge (skip duplicates)."
    );
    const mode = replace ? "replace" : "merge";
    if (mode === "replace" && !window.confirm("Replace will delete all current presets. Continue?")) return;

    onError("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const presets = Array.isArray(parsed?.presets) ? parsed.presets : parsed;
      if (!Array.isArray(presets) || presets.length === 0) throw new Error("No presets found in file");
      const result = await importEpicPresetsPack({ presets, mode });
      onPresetsChanged();
      const imported = Number(result?.imported || 0);
      const skipped = Number(result?.skipped || 0);
      setFlash(`Imported ${imported} preset${imported === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} skipped)` : ""}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to import team pack");
    }
  };

  const handleLoadJiraFilters = async () => {
    setLoadingFilters(true);
    onError("");
    try {
      const filters = await fetchJiraFilters();
      setJiraFilters(filters);
      if (filters.length === 0) onError("No saved Jira filters found for your account.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load Jira filters");
    } finally {
      setLoadingFilters(false);
    }
  };

  const handleApplyJqlTemplate = React.useCallback(() => {
    if (!selectedJqlTemplateKey) return;
    const template = getJqlPresetTemplateByKey(selectedJqlTemplateKey);
    if (!template) return;
    setEpicForm((prev) => ({ ...prev, presetType: "jql", epicName: template.label, jql: template.jql, jiraFilterId: "" }));
    setEditingEpicId(null);
    setFlash(`Template loaded: ${template.label}`);
  }, [selectedJqlTemplateKey, setFlash]);

  return (
    <SettingsSection
      title="Epic &amp; JQL presets"
      description="Define the projects and queries that drive the Dashboard project tabs and the Work Week quick-pick selector. Not for tracking individuals — see Contributor Metrics for that."
    >
      <p>
        Each preset becomes a project tab on the Dashboard and a quick-pick option on Work Week.
        Use an epic key to link to a specific Jira epic, or a JQL preset to run any query as a
        named project view.
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
            <Table.Row><Table.Cell colSpan="5">No presets yet.</Table.Cell></Table.Row>
          ) : (
            epicPresets.map((preset) => (
              <Table.Row key={preset.id}>
                <Table.Cell>{preset.presetType === "jql" ? "JQL" : "Epic"}</Table.Cell>
                <Table.Cell>{preset.label}</Table.Cell>
                <Table.Cell>{preset.jiraFilterId || "—"}</Table.Cell>
                <Table.Cell>{humanizeJql(preset.jql) || "—"}</Table.Cell>
                <Table.Cell collapsing>
                  <Button size="mini" onClick={() => handleEditEpicPreset(preset)}>Edit</Button>
                  <Button size="mini" negative onClick={() => handleDeleteEpicPreset(preset.id)}>Delete</Button>
                </Table.Cell>
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table>

      <div className="settings-team-pack-row" style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <Button type="button" onClick={() => void handleExportTeamPack()}>Export team pack</Button>
        <Button type="button" onClick={() => teamPackInputRef.current?.click()}>Import team pack</Button>
        <input ref={teamPackInputRef} type="file" accept="application/json,.json" style={{ display: "none" }}
          onChange={(event) => void handleImportTeamPackFile(event)} />
        <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
          Share epic/JQL presets as JSON. Import merges by default; choose Replace to overwrite.
        </span>
      </div>

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
              <label htmlFor="jql-template-select" style={{ display: "block", fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.4rem", color: "#334155" }}>
                Starter template library
              </label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <select id="jql-template-select" value={selectedJqlTemplateKey}
                  onChange={(e) => setSelectedJqlTemplateKey(e.target.value)}
                  style={{ padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem", minWidth: "260px" }}>
                  <option value="">Pick a starter template...</option>
                  {JQL_PRESET_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <Button type="button" size="small" onClick={handleApplyJqlTemplate} disabled={!selectedJqlTemplateKey}>Load template</Button>
              </div>
              {selectedJqlTemplateKey ? (
                <p style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "0.25rem" }}>{getJqlPresetTemplateByKey(selectedJqlTemplateKey)?.description || ""}</p>
              ) : (
                <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.25rem" }}>Select a template to prefill label and JQL, then click Add preset.</p>
              )}
            </div>
            <Form.Input label="Label" placeholder="My open tasks" value={epicForm.epicName}
              onChange={(_e, { value }) => handleEpicFormChange("epicName", value)} />
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ display: "block", fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.4rem", color: "#334155" }}>
                Option A — Import from a saved Jira filter
              </label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <Button type="button" size="small" onClick={handleLoadJiraFilters} loading={loadingFilters} disabled={loadingFilters}>Browse saved Jira filters</Button>
                {jiraFilters.length > 0 ? (
                  <select value={epicForm.jiraFilterId || ""}
                    onChange={(e) => {
                      const selected = jiraFilters.find((f) => String(f.id) === e.target.value);
                      if (selected) {
                        handleEpicFormChange("jiraFilterId", String(selected.id));
                        handleEpicFormChange("jql", selected.jql || "");
                        if (!epicForm.epicName) handleEpicFormChange("epicName", selected.name || "");
                      }
                    }}
                    style={{ padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem", minWidth: "220px" }}>
                    <option value="">Pick a saved filter…</option>
                    {jiraFilters.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                ) : null}
              </div>
              {epicForm.jiraFilterId ? (
                <p style={{ fontSize: "0.78rem", color: "#22c55e", marginTop: "0.25rem" }}>✓ Filter ID {epicForm.jiraFilterId} selected — JQL loaded below.</p>
              ) : (
                <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.25rem" }}>Click "Browse saved Jira filters" to load your filters, then pick one to auto-fill the JQL.</p>
              )}
            </div>
            <div style={{ marginBottom: "0.5rem" }}>
              <label style={{ display: "block", fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.25rem", color: "#334155" }}>Option B — Enter manually</label>
              <p style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "0.4rem" }}>
                Paste a Jira epic key (e.g. <code>ODI-19898</code>), a JQL query, or a filter ID. JQL takes precedence over the filter ID when both are set.
              </p>
            </div>
            <Form.TextArea label="JQL" placeholder="project = ODI AND assignee = currentUser() — or paste from Jira"
              value={epicForm.jql} onChange={(_e, { value }) => handleEpicFormChange("jql", value)} />
          </>
        ) : (
          <>
            <Form.Group widths="equal">
              <Form.Input label="Epic key" placeholder="ODI-1234" value={epicForm.epicKey}
                onChange={(_e, { value }) => handleEpicFormChange("epicKey", value)} />
              <Form.Input label="Epic name" placeholder="Nora" value={epicForm.epicName}
                onChange={(_e, { value }) => handleEpicFormChange("epicName", value)} />
              <Form.Input label="Jira filter ID" value={epicForm.jiraFilterId}
                onChange={(_e, { value }) => handleEpicFormChange("jiraFilterId", value)} />
            </Form.Group>
            <Form.Input label="JQL (optional if filter ID set)" value={epicForm.jql}
              onChange={(_e, { value }) => handleEpicFormChange("jql", value)} />
          </>
        )}
        <Form.Input label="Sort order" type="number" value={epicForm.sortOrder}
          onChange={(_e, { value }) => handleEpicFormChange("sortOrder", Number(value) || 0)} />
        <Button primary onClick={handleSaveEpicPreset}>{editingEpicId ? "Update preset" : "Add preset"}</Button>
        {editingEpicId ? <Button basic onClick={resetEpicForm}>Cancel edit</Button> : null}
        {flash ? <Message positive size="mini" style={{ marginTop: "0.75rem" }}>✓ {flash}</Message> : null}
      </Form>
    </SettingsSection>
  );
};

export default PresetsSection;
