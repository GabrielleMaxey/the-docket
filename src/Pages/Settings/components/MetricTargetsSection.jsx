import React from "react";
import { Button, Form, Input, Message, Table } from "semantic-ui-react";
import SettingsSection from "./SettingsSection";
import {
  createWatchedAssignee,
  deleteWatchedAssignee,
  fetchWatchedAssignees,
  updateWatchedAssignee,
} from "../../../services/jiraClient.js";
import { useFlash } from "../../hooks/useFlash.js";

const MetricTargetsSection = ({ watchedAssignees, setWatchedAssignees, onError, epicPresets = [] }) => {
  const [watchedName, setWatchedName] = React.useState("");
  const [watchedJql, setWatchedJql] = React.useState("");
  const [watchType, setWatchType] = React.useState("person");
  const [watchedCapacity, setWatchedCapacity] = React.useState("");
  const [quickPickValue, setQuickPickValue] = React.useState("");
  const [capacityDrafts, setCapacityDrafts] = React.useState({});
  const [savingCapacityId, setSavingCapacityId] = React.useState(null);
  const [flash, setFlash] = useFlash();
  const contributorEntries = watchedAssignees.filter((person) => person.watchType !== "direct_reports");

  const handleQuickPickSelect = (presetId) => {
    setQuickPickValue(presetId);
    if (!presetId) return;
    const preset = epicPresets.find((p) => String(p.id) === String(presetId));
    if (!preset) return;
    const jql =
      preset.presetType === "jql"
        ? String(preset.jql || "").trim()
        : preset.epicKey
          ? `parent = ${preset.epicKey}`
          : "";
    if (jql) {
      setWatchedJql(jql);
    }
    if (!watchedName.trim() && preset.label) {
      setWatchedName(preset.label);
    }
    setQuickPickValue("");
  };

  const handleAddWatchedAssignee = async () => {
    const displayName = watchedName.trim();
    const jql = watchedJql.trim();
    if (!displayName) return;
    if (watchType === "jql" && !jql) { onError("JQL is required for a custom query entry."); return; }
    onError("");
    try {
      await createWatchedAssignee({
        displayName,
        watchType,
        jql: watchType === "jql" ? jql : "",
        sortOrder: watchedAssignees.length,
        capacity: watchedCapacity.trim() === "" ? null : watchedCapacity.trim(),
      });
      setWatchedName("");
      setWatchedJql("");
      setWatchType("person");
      setWatchedCapacity("");
      setQuickPickValue("");
      setWatchedAssignees(await fetchWatchedAssignees());
      setFlash(watchType === "jql" ? "Custom query added." : "Person added.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to add entry");
    }
  };

  const handleDeleteWatchedAssignee = async (id) => {
    onError("");
    try {
      await deleteWatchedAssignee(id);
      setWatchedAssignees(await fetchWatchedAssignees());
      setFlash("Entry removed.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to remove entry");
    }
  };

  const capacityDraftFor = (person) =>
    capacityDrafts[person.id] !== undefined
      ? capacityDrafts[person.id]
      : person.capacity === null || person.capacity === undefined
        ? ""
        : String(person.capacity);

  const handleCapacityBlur = async (person) => {
    const draft = capacityDraftFor(person);
    const nextCapacity = draft.trim() === "" ? null : draft.trim();
    const currentCapacity = person.capacity === null || person.capacity === undefined ? null : String(person.capacity);
    if (String(nextCapacity) === String(currentCapacity)) {
      // No real change - clear the draft so it falls back to the server value.
      setCapacityDrafts((prev) => {
        const next = { ...prev };
        delete next[person.id];
        return next;
      });
      return;
    }

    setSavingCapacityId(person.id);
    onError("");
    try {
      await updateWatchedAssignee(person.id, {
        displayName: person.displayName,
        watchType: person.watchType,
        jql: person.jql,
        memberNames: person.memberNames,
        resolvedAccountId: person.resolvedAccountId,
        sortOrder: person.sortOrder,
        capacity: nextCapacity,
      });
      setWatchedAssignees(await fetchWatchedAssignees());
      setCapacityDrafts((prev) => {
        const next = { ...prev };
        delete next[person.id];
        return next;
      });
      setFlash("Capacity updated.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update capacity");
    } finally {
      setSavingCapacityId(null);
    }
  };

  return (
    <SettingsSection
      title="Contributor Metrics"
      description="Define who appears in the Individual Contributor Metrics section on the Dashboard — different from project presets, which drive the project tabs."
    >
      <p>
        Add people by display name to track their open task count and overdue rate, or define a
        custom JQL query to scope a group — by project, team, label, or any combination, or pick a
        saved Epic/JQL preset to fill in the query for you. For a named manager team, use Settings
        → <strong>My Direct Reports</strong> instead of writing JQL by hand. Each entry appears as
        a quick-select chip on the Dashboard and is separate from the project presets that drive
        the project tabs above.
      </p>
      <p>
        <strong>Capacity</strong> (optional) is a target open-issue count — set it to see how each
        person's or group's current workload compares on the Dashboard. Leave it blank if you don't
        want a capacity comparison for that entry.
      </p>
      <Table celled compact>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Type</Table.HeaderCell>
            <Table.HeaderCell>Label</Table.HeaderCell>
            <Table.HeaderCell>JQL</Table.HeaderCell>
            <Table.HeaderCell>Capacity</Table.HeaderCell>
            <Table.HeaderCell />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {contributorEntries.length === 0 ? (
            <Table.Row><Table.Cell colSpan="5">No entries yet.</Table.Cell></Table.Row>
          ) : (
            contributorEntries.map((person) => (
              <Table.Row key={person.id}>
                <Table.Cell>{person.watchType === "jql" ? "Custom query" : "Person"}</Table.Cell>
                <Table.Cell>{person.displayName}</Table.Cell>
                <Table.Cell>{person.jql || "—"}</Table.Cell>
                <Table.Cell collapsing>
                  <Input
                    size="mini"
                    type="number"
                    min="0"
                    placeholder="Not set"
                    style={{ width: "90px" }}
                    value={capacityDraftFor(person)}
                    loading={savingCapacityId === person.id}
                    disabled={savingCapacityId === person.id}
                    onChange={(_e, { value }) => setCapacityDrafts((prev) => ({ ...prev, [person.id]: value }))}
                    onBlur={() => handleCapacityBlur(person)}
                  />
                </Table.Cell>
                <Table.Cell collapsing>
                  <Button size="mini" negative onClick={() => handleDeleteWatchedAssignee(person.id)}>Remove</Button>
                </Table.Cell>
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table>
      <Form style={{ marginTop: "1rem" }} onSubmit={(e) => e.preventDefault()}>
        <Form.Select
          label="Type"
          options={[
            { key: "person", text: "Person (display name)", value: "person" },
            { key: "jql", text: "Custom query (JQL)", value: "jql" },
          ]}
          value={watchType}
          onChange={(_e, { value }) => setWatchType(String(value || "person"))}
        />
        <Form.Input label="Label" placeholder={watchType === "jql" ? "Platform team open tasks" : "jane.doe"}
          value={watchedName} onChange={(_e, { value }) => setWatchedName(value)} />
        {watchType === "jql" ? (
          <>
            {epicPresets.length > 0 ? (
              <Form.Select
                label="Quick pick (optional)"
                placeholder="Choose a saved preset to fill in the JQL below…"
                options={epicPresets.map((preset) => ({
                  key: preset.id,
                  value: preset.id,
                  text: preset.label,
                  description: preset.presetType === "jql" ? preset.jql : preset.epicKey,
                }))}
                value={quickPickValue}
                onChange={(_e, { value }) => handleQuickPickSelect(value)}
              />
            ) : null}
            <Form.TextArea label="JQL" placeholder="assignee = currentUser() AND statusCategory != Done"
              value={watchedJql} onChange={(_e, { value }) => setWatchedJql(value)} />
          </>
        ) : null}
        <Form.Input
          label="Capacity (optional)"
          type="number"
          min="0"
          placeholder="e.g. 15 open issues"
          value={watchedCapacity}
          onChange={(_e, { value }) => setWatchedCapacity(value)}
        />
        <Button onClick={handleAddWatchedAssignee}>Add</Button>
        {flash ? <Message positive size="mini" style={{ marginTop: "0.75rem" }}>✓ {flash}</Message> : null}
      </Form>
    </SettingsSection>
  );
};

export default MetricTargetsSection;
