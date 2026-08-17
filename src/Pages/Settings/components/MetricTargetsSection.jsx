import React from "react";
import { Button, Form, Input, Message, Table } from "semantic-ui-react";
import SettingsSection from "./SettingsSection";
import {
  createWatchedAssignee,
  deleteWatchedAssignee,
  fetchEpicPresetScopeJql,
  fetchWatchedAssignees,
  updateWatchedAssignee,
} from "../../../services/jiraClient.js";
import { useFlash } from "../../hooks/useFlash.js";
import {
  DEFAULT_OVERDUE_DATE_BASIS,
  OVERDUE_DATE_BASIS_OPTIONS,
  normalizeOverdueDateBasis,
  overdueDateBasisShortLabel,
} from "../../../../shared/overdueDateBasis.mjs";

const escapeJqlString = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');

// Stored as watchType "jql" so Dashboard/capacity treat it like any other query.
const buildReporterJql = (displayName) => `reporter = "${escapeJqlString(displayName)}" ORDER BY updated DESC`;

const isReporterWatchJql = (jql) => /(^|[\s(])reporter\s*=/.test(String(jql || ""));

const substituteCurrentUser = (jql, displayName) =>
  String(jql || "").replace(/currentUser\(\)/g, `"${escapeJqlString(displayName)}"`);

// Resolve through the API — a local `parent = KEY` stand-in would save a different query than the project tab.
const jqlForPreset = (preset) => {
  if (!preset?.id) return Promise.resolve("");
  return fetchEpicPresetScopeJql(preset.id);
};

const MetricTargetsSection = ({ watchedAssignees, setWatchedAssignees, onError, epicPresets = [] }) => {
  const [watchedName, setWatchedName] = React.useState("");
  const [watchedJql, setWatchedJql] = React.useState("");
  const [watchedReporterJql, setWatchedReporterJql] = React.useState("");
  const [watchedPresetId, setWatchedPresetId] = React.useState("");
  const [watchType, setWatchType] = React.useState("person");
  const [watchedCapacity, setWatchedCapacity] = React.useState("");
  const [watchedOverdueDateBasis, setWatchedOverdueDateBasis] = React.useState(DEFAULT_OVERDUE_DATE_BASIS);
  const [quickPickValue, setQuickPickValue] = React.useState("");
  const [editingId, setEditingId] = React.useState(null);
  const [capacityDrafts, setCapacityDrafts] = React.useState({});
  const [savingCapacityId, setSavingCapacityId] = React.useState(null);
  const [flash, setFlash] = useFlash();
  const quickPickRequestRef = React.useRef(0);
  const contributorEntries = watchedAssignees.filter((person) => person.watchType !== "direct_reports");

  const handlePresetTypeSelect = (presetId) => {
    setWatchedPresetId(presetId);
    if (!presetId) return;
    const preset = epicPresets.find((p) => String(p.id) === String(presetId));
    if (!preset) return;
    if (!watchedName.trim()) {
      setWatchedName(preset.label || "");
    }
  };

  const handleQuickPickSelect = async (presetId) => {
    setQuickPickValue(presetId);
    if (!presetId) return;
    const preset = epicPresets.find((p) => String(p.id) === String(presetId));
    if (!preset) return;
    const requestId = (quickPickRequestRef.current += 1);
    onError("");
    try {
      const jql = await jqlForPreset(preset);
      if (requestId !== quickPickRequestRef.current) return;
      if (jql) {
        if (watchType === "reporter") {
          setWatchedReporterJql(substituteCurrentUser(jql, watchedName.trim()));
        } else {
          setWatchedJql(jql);
        }
      } else {
        onError("No JQL configured for this epic preset.");
      }
    } catch (err) {
      if (requestId !== quickPickRequestRef.current) return;
      onError(err instanceof Error ? err.message : "Failed to resolve preset JQL");
    }
    if (!watchedName.trim() && preset.label) {
      setWatchedName(preset.label);
    }
    setQuickPickValue("");
  };

  const regenerateReporterJql = (nextName) => {
    const name = nextName.trim();
    if (!name) return;
    setWatchedReporterJql((prev) => {
      const trimmedPrev = prev.trim();
      if (!trimmedPrev) return buildReporterJql(name);
      if (/currentUser\(\)/.test(trimmedPrev)) return substituteCurrentUser(trimmedPrev, name);
      return trimmedPrev.replace(/reporter\s*=\s*"[^"]*"/, `reporter = "${escapeJqlString(name)}"`);
    });
  };

  const resetForm = () => {
    setWatchedName("");
    setWatchedJql("");
    setWatchedReporterJql("");
    setWatchedPresetId("");
    setWatchType("person");
    setWatchedCapacity("");
    setWatchedOverdueDateBasis(DEFAULT_OVERDUE_DATE_BASIS);
    setQuickPickValue("");
    setEditingId(null);
  };

  // Do not infer "preset" from stored JQL — Custom query with the JQL pre-filled is the reliable edit path.
  const handleEditClick = (person) => {
    setEditingId(person.id);
    setWatchedName(person.displayName);
    setWatchedPresetId("");
    setQuickPickValue("");
    setWatchedCapacity(person.capacity === null || person.capacity === undefined ? "" : String(person.capacity));
    setWatchedOverdueDateBasis(normalizeOverdueDateBasis(person.overdueDateBasis));
    if (person.watchType === "jql" && isReporterWatchJql(person.jql)) {
      setWatchType("reporter");
      setWatchedReporterJql(person.jql || "");
      setWatchedJql("");
    } else if (person.watchType === "jql") {
      setWatchType("jql");
      setWatchedJql(person.jql || "");
      setWatchedReporterJql("");
    } else {
      setWatchType("person");
      setWatchedJql("");
      setWatchedReporterJql("");
    }
  };

  const handleSubmit = async () => {
    const displayName = watchedName.trim();
    const isReporter = watchType === "reporter";
    const isPreset = watchType === "preset";
    const isEditing = editingId !== null;
    const selectedPreset = isPreset ? epicPresets.find((p) => String(p.id) === String(watchedPresetId)) : null;
    if (!displayName) return;
    if (isPreset && !selectedPreset) { onError("Pick a saved preset first."); return; }
    let jql = isReporter
      ? watchedReporterJql.trim() || buildReporterJql(displayName)
      : isPreset
        ? ""
        : watchedJql.trim();
    if (isPreset) {
      try {
        jql = String(await jqlForPreset(selectedPreset) || "").trim();
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to resolve preset JQL");
        return;
      }
    }
    if (watchType === "jql" && !jql) { onError("JQL is required for a custom query entry."); return; }
    if (isPreset && !jql) { onError("No JQL configured for this epic preset."); return; }
    onError("");
    const payload = {
      displayName,
      watchType: isReporter || isPreset ? "jql" : watchType,
      jql: watchType === "jql" || isReporter || isPreset ? jql : "",
      capacity: watchedCapacity.trim() === "" ? null : watchedCapacity.trim(),
      overdueDateBasis: watchedOverdueDateBasis,
    };
    try {
      if (isEditing) {
        const existing = watchedAssignees.find((p) => p.id === editingId);
        await updateWatchedAssignee(editingId, {
          ...payload,
          memberNames: existing?.memberNames,
          resolvedAccountId: existing?.resolvedAccountId,
          sortOrder: existing?.sortOrder ?? watchedAssignees.length,
        });
      } else {
        await createWatchedAssignee({ ...payload, sortOrder: watchedAssignees.length });
      }
      resetForm();
      setWatchedAssignees(await fetchWatchedAssignees());
      setFlash(
        isEditing
          ? "Entry updated."
          : watchType === "jql"
            ? "Custom query added."
            : isReporter
              ? "Reporter watch added."
              : isPreset
                ? "Added from preset."
                : "Person added."
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : `Failed to ${isEditing ? "update" : "add"} entry`);
    }
  };

  const handleDeleteWatchedAssignee = async (id) => {
    onError("");
    try {
      await deleteWatchedAssignee(id);
      if (editingId === id) {
        resetForm();
      }
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
        overdueDateBasis: person.overdueDateBasis,
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
        Add people by display name to track their open task count and overdue rate, use
        <strong> Reporter</strong> to track issues someone <em>reported</em> instead of what's
        assigned to them (useful for PMs following up on their own requests), or define a
        custom JQL query to scope a group — by project, team, label, or any combination, or pick a
        saved Epic/JQL preset to fill in the query for you. For a named manager team, use Settings
        → <strong>My Direct Reports</strong> instead of writing JQL by hand. Each entry appears as
        a quick-select chip on the Dashboard and is separate from the project presets that drive
        the project tabs above.
      </p>
      <p>
        <strong>Capacity</strong> (optional) is a target open-issue count — set it to see how each
        person's or group's current workload compares on the Project Managers page. Leave it blank
        if you don't want a capacity comparison for that entry.
      </p>
      <p>
        <strong>Due / overdue basis</strong> controls how Project Managers counts overdue work for
        that entry. Use <strong>Epic done dates</strong> for ODI-style groups (dates live on the
        parent Epic). Use <strong>Task due date</strong> when the team dates the task itself.{" "}
        <strong>Either</strong> uses the issue's Due date if set, otherwise its done dates, otherwise
        the parent Epic — a mixed catch-all. Stale task due dates still win on Either, so ODI
        watches should not use it.
      </p>
      <Table celled compact>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Type</Table.HeaderCell>
            <Table.HeaderCell>Label</Table.HeaderCell>
            <Table.HeaderCell>JQL</Table.HeaderCell>
            <Table.HeaderCell>Due / overdue</Table.HeaderCell>
            <Table.HeaderCell>Capacity</Table.HeaderCell>
            <Table.HeaderCell />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {contributorEntries.length === 0 ? (
            <Table.Row><Table.Cell colSpan="6">No entries yet.</Table.Cell></Table.Row>
          ) : (
            contributorEntries.map((person) => (
              <Table.Row key={person.id}>
                <Table.Cell>
                  {person.watchType !== "jql"
                    ? "Person"
                    : isReporterWatchJql(person.jql)
                      ? "Reporter"
                      : "Custom query"}
                </Table.Cell>
                <Table.Cell>{person.displayName}</Table.Cell>
                <Table.Cell>{person.jql || "—"}</Table.Cell>
                <Table.Cell collapsing>{overdueDateBasisShortLabel(person.overdueDateBasis)}</Table.Cell>
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
                    onKeyDown={(event) => {
                      // Not in a <form>; Enter does not blur/submit on its own.
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                  />
                </Table.Cell>
                <Table.Cell collapsing>
                  <Button size="mini" basic onClick={() => handleEditClick(person)} disabled={editingId === person.id}>
                    {editingId === person.id ? "Editing…" : "Edit"}
                  </Button>{" "}
                  <Button size="mini" negative onClick={() => handleDeleteWatchedAssignee(person.id)}>Remove</Button>
                </Table.Cell>
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table>
      {editingId !== null ? (
        <Message size="small" style={{ marginTop: "1rem", marginBottom: 0 }}>
          Editing <strong>{watchedAssignees.find((p) => p.id === editingId)?.displayName}</strong> — change
          anything below and click Update, or Cancel to discard.
        </Message>
      ) : null}
      <Form style={{ marginTop: "1rem" }} onSubmit={(e) => e.preventDefault()}>
        <Form.Select
          label="Type"
          options={[
            { key: "person", text: "Person (display name)", value: "person" },
            { key: "reporter", text: "Reporter (display name)", value: "reporter" },
            { key: "preset", text: "From a saved preset", value: "preset" },
            { key: "jql", text: "Custom query (JQL)", value: "jql" },
          ]}
          value={watchType}
          onChange={(_e, { value }) => setWatchType(String(value || "person"))}
        />
        {watchType === "preset" ? (
          <>
            <p className="ww-copy" style={{ marginBottom: "0.75rem" }}>
              Pick any saved Epic/JQL preset to track its workload directly here — reuses that
              preset's query exactly as saved. For more control (editing the query, or scoping a
              specific person within a preset), use <strong>Custom query (JQL)</strong> instead,
              which also has a Quick pick.
            </p>
            {epicPresets.length > 0 ? (
              <Form.Select
                label="Preset"
                placeholder="Choose a saved Epic/JQL preset…"
                options={epicPresets.map((preset) => ({
                  key: preset.id,
                  value: preset.id,
                  text: preset.label,
                }))}
                value={watchedPresetId}
                onChange={(_e, { value }) => handlePresetTypeSelect(value)}
              />
            ) : (
              <Message size="mini" info>
                No saved presets yet — add one under Epic & JQL presets above.
              </Message>
            )}
          </>
        ) : null}
        <Form.Input
          label="Label"
          placeholder={watchType === "jql" ? "Platform team open tasks" : "jane.doe"}
          value={watchedName}
          onChange={(_e, { value }) => setWatchedName(value)}
          onBlur={() => {
            if (watchType === "reporter") regenerateReporterJql(watchedName);
          }}
        />
        {watchType === "reporter" ? (
          <>
            <p className="ww-copy" style={{ marginTop: "-0.5rem", marginBottom: "0.75rem" }}>
              Tracks issues this person <strong>reported</strong>, not issues assigned to them —
              useful for PMs who want to see the current status of what they requested, regardless
              of who's working it. Pick a saved preset below to reuse its filtering (e.g. the
              "Reporter's Current Issues" preset), or just edit the JQL directly.
            </p>
            {epicPresets.length > 0 ? (
              <Form.Select
                label="Quick pick (optional)"
                placeholder="Choose a saved preset to fill in the JQL below…"
                selectOnBlur={false}
                options={epicPresets.map((preset) => ({
                  key: preset.id,
                  value: preset.id,
                  text: preset.label,
                }))}
                value={quickPickValue}
                onChange={(_e, { value }) => handleQuickPickSelect(value)}
              />
            ) : null}
            <Form.TextArea
              label="JQL"
              placeholder='reporter = "name" ORDER BY updated DESC'
              value={watchedReporterJql}
              onChange={(_e, { value }) => setWatchedReporterJql(value)}
            />
          </>
        ) : null}
        {watchType === "jql" ? (
          <>
            {epicPresets.length > 0 ? (
              <Form.Select
                label="Quick pick (optional)"
                placeholder="Choose a saved preset to fill in the JQL below…"
                selectOnBlur={false}
                options={epicPresets.map((preset) => ({
                  key: preset.id,
                  value: preset.id,
                  text: preset.label,
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
        <Form.Select
          label="Due / overdue basis"
          selectOnBlur={false}
          options={OVERDUE_DATE_BASIS_OPTIONS.map((option) => ({
            key: option.value,
            value: option.value,
            text: option.text,
          }))}
          value={watchedOverdueDateBasis}
          onChange={(_e, { value }) => setWatchedOverdueDateBasis(normalizeOverdueDateBasis(value))}
        />
        <Button primary={editingId !== null} onClick={handleSubmit}>
          {editingId !== null ? "Update" : "Add"}
        </Button>
        {editingId !== null ? (
          <Button basic style={{ marginLeft: "0.5rem" }} onClick={resetForm}>
            Cancel
          </Button>
        ) : null}
        {flash ? <Message positive size="mini" style={{ marginTop: "0.75rem" }}>✓ {flash}</Message> : null}
      </Form>
    </SettingsSection>
  );
};

export default MetricTargetsSection;
