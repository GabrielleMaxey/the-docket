import React from "react";
import { Button, Form, Label, Message, Modal, Table } from "semantic-ui-react";
import SettingsSection from "./SettingsSection";
import {
  activateJiraInstance,
  createJiraInstance,
  deleteJiraInstance,
  fetchJiraInstances,
  testJiraInstance,
  updateJiraInstance,
} from "../../../services/jiraClient.js";
import { useFlash } from "../../hooks/useFlash.js";

// Mirrors MAX_JIRA_INSTANCES in server/lib/jiraInstances.mjs.
const MAX_JIRA_INSTANCES = 5;

const EMPTY_FORM = { displayName: "", baseUrl: "", email: "", apiToken: "" };

const JiraInstancesSection = () => {
  const [instances, setInstances] = React.useState([]);
  const [activeInstanceId, setActiveInstanceId] = React.useState(null);
  const [legacyMode, setLegacyMode] = React.useState(false);
  const [error, setError] = React.useState("");
  const [flash, setFlash] = useFlash();

  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [testStatus, setTestStatus] = React.useState(null);
  const [testMessage, setTestMessage] = React.useState("");

  const loadInstances = React.useCallback(async () => {
    try {
      const data = await fetchJiraInstances();
      setInstances(data.instances || []);
      setActiveInstanceId(data.activeInstanceId || null);
      setLegacyMode(Boolean(data.legacyMode));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Jira sites");
    }
  }, []);

  React.useEffect(() => { void loadInstances(); }, [loadInstances]);

  const openAddModal = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setTestStatus(null);
    setTestMessage("");
    setError("");
    setModalOpen(true);
  };

  const openEditModal = (instance) => {
    setEditingId(instance.id);
    setForm({ displayName: instance.displayName, baseUrl: instance.baseUrl, email: instance.email, apiToken: "" });
    setTestStatus(null);
    setTestMessage("");
    setError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleTest = async () => {
    setTestStatus("loading");
    setTestMessage("");
    try {
      const data = await testJiraInstance(editingId || "new", {
        baseUrl: form.baseUrl,
        email: form.email,
        apiToken: form.apiToken,
      });
      setTestMessage(`✓ Connected as ${data?.displayName || "unknown user"}`);
      setTestStatus("ok");
    } catch (err) {
      setTestMessage(err instanceof Error ? err.message : "Connection failed");
      setTestStatus("error");
    }
  };

  const handleSave = async () => {
    setError("");
    if (!form.displayName.trim() || !form.baseUrl.trim() || !form.email.trim()) {
      setError("Name, site URL, and email are required.");
      return;
    }
    if (!editingId && !form.apiToken.trim()) {
      setError("API token is required.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const patch = { displayName: form.displayName, baseUrl: form.baseUrl, email: form.email };
        if (form.apiToken.trim()) patch.apiToken = form.apiToken;
        await updateJiraInstance(editingId, patch);
        setFlash("Jira site updated.");
      } else {
        await createJiraInstance(form);
        setFlash("Jira site added.");
      }
      setModalOpen(false);
      await loadInstances();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Jira site");
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (id) => {
    setError("");
    try {
      await activateJiraInstance(id);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate Jira site");
    }
  };

  const handleDelete = async (instance) => {
    if (!window.confirm(`Remove "${instance.displayName}"? This cannot be undone.`)) return;
    setError("");
    try {
      await deleteJiraInstance(instance.id);
      if (instance.id === activeInstanceId) {
        window.location.reload();
        return;
      }
      setFlash("Jira site removed.");
      await loadInstances();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove Jira site");
    }
  };

  const testDisabled =
    testStatus === "loading" ||
    !form.baseUrl.trim() ||
    !form.email.trim() ||
    (!editingId && !form.apiToken.trim());

  return (
    <SettingsSection
      title="Jira sites"
      description="Manage multiple Jira sites and switch which one the app talks to. Notes, dates, and presets are stored per site — switching reloads the app."
    >
      {error ? <Message negative size="small" content={error} /> : null}
      {legacyMode ? (
        <Message info size="small">
          Using the <code>.env</code> credentials — add a Jira site below to switch to the instance registry.
        </Message>
      ) : null}
      <Table celled compact>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
            <Table.HeaderCell>URL</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
            <Table.HeaderCell collapsing />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {instances.length === 0 ? (
            <Table.Row><Table.Cell colSpan="4">No Jira sites yet.</Table.Cell></Table.Row>
          ) : (
            instances.map((instance) => (
              <Table.Row key={instance.id}>
                <Table.Cell>{instance.displayName}</Table.Cell>
                <Table.Cell>{instance.baseUrl}</Table.Cell>
                <Table.Cell>
                  {instance.id === activeInstanceId ? <Label color="green" size="small">Active</Label> : null}
                </Table.Cell>
                <Table.Cell collapsing>
                  {instance.id !== activeInstanceId ? (
                    <Button size="mini" primary onClick={() => void handleActivate(instance.id)}>Set active</Button>
                  ) : null}
                  <Button size="mini" onClick={() => openEditModal(instance)}>Edit</Button>
                  <Button size="mini" negative onClick={() => void handleDelete(instance)}>Remove</Button>
                </Table.Cell>
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table>
      <Button primary onClick={openAddModal} disabled={instances.length >= MAX_JIRA_INSTANCES}>
        Add Jira site
      </Button>
      {instances.length >= MAX_JIRA_INSTANCES ? (
        <span style={{ fontSize: "0.82rem", color: "#64748b", marginLeft: "0.75rem" }}>
          Maximum of {MAX_JIRA_INSTANCES} Jira sites.
        </span>
      ) : null}
      {flash ? <Message positive size="mini" style={{ marginTop: "0.75rem" }}>✓ {flash}</Message> : null}

      <Modal open={modalOpen} onClose={closeModal} size="small">
        <Modal.Header>{editingId ? "Edit Jira site" : "Add Jira site"}</Modal.Header>
        <Modal.Content>
          <Form>
            <Form.Input
              label="Name"
              placeholder="Acme Corp Jira"
              value={form.displayName}
              onChange={(_e, { value }) => handleFormChange("displayName", value)}
            />
            <Form.Input
              label="Site URL"
              placeholder="https://acme.atlassian.net"
              value={form.baseUrl}
              onChange={(_e, { value }) => handleFormChange("baseUrl", value)}
            />
            <Form.Input
              label="Email"
              placeholder="you@acme.com"
              value={form.email}
              onChange={(_e, { value }) => handleFormChange("email", value)}
            />
            <Form.Input
              label={editingId ? "API token (leave blank to keep current)" : "API token"}
              type="password"
              placeholder={editingId ? "••••••••" : "Jira API token"}
              value={form.apiToken}
              onChange={(_e, { value }) => handleFormChange("apiToken", value)}
            />
          </Form>
          <Button
            type="button"
            size="small"
            onClick={() => void handleTest()}
            loading={testStatus === "loading"}
            disabled={testDisabled}
            style={{ marginTop: "0.5rem" }}
          >
            Test connection
          </Button>
          {testMessage ? (
            <Message positive={testStatus === "ok"} negative={testStatus === "error"} size="small" style={{ marginTop: "0.75rem" }}>
              {testMessage}
            </Message>
          ) : null}
        </Modal.Content>
        <Modal.Actions>
          <Button type="button" onClick={closeModal} disabled={saving}>Cancel</Button>
          <Button type="button" primary onClick={() => void handleSave()} loading={saving} disabled={saving}>
            {editingId ? "Save changes" : "Add site"}
          </Button>
        </Modal.Actions>
      </Modal>
    </SettingsSection>
  );
};

export default JiraInstancesSection;
