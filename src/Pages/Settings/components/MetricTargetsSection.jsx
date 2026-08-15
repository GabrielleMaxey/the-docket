import React from "react";
import { Button, Form, Message, Table } from "semantic-ui-react";
import SettingsSection from "./SettingsSection";
import {
  createWatchedAssignee,
  deleteWatchedAssignee,
  fetchWatchedAssignees,
} from "../../../services/jiraClient.js";
import { useFlash } from "../../hooks/useFlash.js";

const MetricTargetsSection = ({ watchedAssignees, setWatchedAssignees, onError }) => {
  const [watchedName, setWatchedName] = React.useState("");
  const [watchedJql, setWatchedJql] = React.useState("");
  const [watchType, setWatchType] = React.useState("person");
  const [flash, setFlash] = useFlash();

  const handleAddWatchedAssignee = async () => {
    const displayName = watchedName.trim();
    const jql = watchedJql.trim();
    if (!displayName) return;
    if (watchType === "jql" && !jql) { onError("JQL is required for a custom query entry."); return; }
    onError("");
    try {
      await createWatchedAssignee({ displayName, watchType, jql: watchType === "jql" ? jql : "", sortOrder: watchedAssignees.length });
      setWatchedName("");
      setWatchedJql("");
      setWatchType("person");
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

  return (
    <SettingsSection
      title="Contributor Metrics"
      description="Define who appears in the Individual Contributor Metrics section on the Dashboard — different from project presets, which drive the project tabs."
    >
      <p>
        Add people by display name to track their open task count and overdue rate, or define a
        custom JQL query to scope a group — by project, team, label, or any combination. Each
        entry appears as a quick-select chip on the Dashboard and is separate from the project
        presets that drive the project tabs above.
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
            <Table.Row><Table.Cell colSpan="4">No entries yet.</Table.Cell></Table.Row>
          ) : (
            watchedAssignees.map((person) => (
              <Table.Row key={person.id}>
                <Table.Cell>{person.watchType === "jql" ? "Custom query" : "Person"}</Table.Cell>
                <Table.Cell>{person.displayName}</Table.Cell>
                <Table.Cell>{person.jql || "—"}</Table.Cell>
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
          <Form.TextArea label="JQL" placeholder="assignee = currentUser() AND statusCategory != Done"
            value={watchedJql} onChange={(_e, { value }) => setWatchedJql(value)} />
        ) : null}
        <Button onClick={handleAddWatchedAssignee}>Add</Button>
        {flash ? <Message positive size="mini" style={{ marginTop: "0.75rem" }}>✓ {flash}</Message> : null}
      </Form>
    </SettingsSection>
  );
};

export default MetricTargetsSection;
