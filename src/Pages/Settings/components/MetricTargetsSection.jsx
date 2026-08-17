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

// Same backslash-then-quote convention already used for JQL string literals
// elsewhere in this app (epicFilterJql.mjs, directReportsJql.mjs).
const escapeJqlString = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');

// "Reporter" isn't its own backend watch_type - PMs want "issues this
// person reported", which is really just a JQL scope. Generating it here
// and storing it as watchType "jql" means every other system that already
// understands jql-type watches (Dashboard refresh, Capacity Planning)
// works with it unmodified - no new type to teach those systems about.
// Unfiltered by status, matching how the "person" (assignee) watch type
// behaves - fetches everything and lets the existing metrics computation
// split it into open/resolved/overdue, rather than only ever seeing open
// issues here. This is only the FALLBACK shape when no preset is picked -
// picking a preset (e.g. the existing "Reporter's Current Issues" preset)
// replaces this with that preset's own filtering/ordering instead, since
// PMs may already have a preferred shape for this (resolution = Unresolved,
// priority-ordered) that shouldn't be overridden by a different default.
const buildReporterJql = (displayName) => `reporter = "${escapeJqlString(displayName)}" ORDER BY updated DESC`;

// Detects a reporter-type entry purely from whether its stored JQL
// references the "reporter" field at all, not an exact-match on one
// specific template - a preset-derived reporter JQL (e.g. substituted from
// "Reporter's Current Issues") won't match buildReporterJql's own shape,
// but is still fundamentally a reporter-scoped query, so the table should
// still label it "Reporter" rather than a generic "Custom query".
const isReporterWatchJql = (jql) => /(^|[\s(])reporter\s*=/.test(String(jql || ""));

// Substitutes currentUser() in a preset's JQL for a specific named person,
// so a PM-facing preset like "reporter = currentUser() AND resolution =
// Unresolved ORDER BY priority DESC, updated DESC" becomes a query for
// someone else's reported work, not just the person currently logged in.
// Presets that don't reference currentUser() at all are returned unchanged -
// a PM can still pick any preset, not just reporter-shaped ones.
const substituteCurrentUser = (jql, displayName) =>
  String(jql || "").replace(/currentUser\(\)/g, `"${escapeJqlString(displayName)}"`);

const MetricTargetsSection = ({ watchedAssignees, setWatchedAssignees, onError, epicPresets = [] }) => {
  const [watchedName, setWatchedName] = React.useState("");
  const [watchedJql, setWatchedJql] = React.useState("");
  const [watchedReporterJql, setWatchedReporterJql] = React.useState("");
  const [watchedPresetId, setWatchedPresetId] = React.useState("");
  const [watchType, setWatchType] = React.useState("person");
  const [watchedCapacity, setWatchedCapacity] = React.useState("");
  const [quickPickValue, setQuickPickValue] = React.useState("");
  const [editingId, setEditingId] = React.useState(null);
  const [capacityDrafts, setCapacityDrafts] = React.useState({});
  const [savingCapacityId, setSavingCapacityId] = React.useState(null);
  const [flash, setFlash] = useFlash();
  const contributorEntries = watchedAssignees.filter((person) => person.watchType !== "direct_reports");

  // Same epic-preset -> JQL conversion Quick Pick already uses (jql-type
  // presets: their own JQL; epic-type presets: parent = <epicKey>), reused
  // here so "From a saved preset" behaves identically to picking the same
  // preset via Quick Pick, just without the extra type-then-quick-pick step.
  const jqlForPreset = (preset) =>
    preset.presetType === "jql" ? String(preset.jql || "").trim() : preset.epicKey ? `parent = ${preset.epicKey}` : "";

  const handlePresetTypeSelect = (presetId) => {
    setWatchedPresetId(presetId);
    if (!presetId) return;
    const preset = epicPresets.find((p) => String(p.id) === String(presetId));
    if (!preset) return;
    if (!watchedName.trim()) {
      setWatchedName(preset.label || "");
    }
  };

  const handleQuickPickSelect = (presetId) => {
    setQuickPickValue(presetId);
    if (!presetId) return;
    const preset = epicPresets.find((p) => String(p.id) === String(presetId));
    if (!preset) return;
    const jql = jqlForPreset(preset);
    if (jql) {
      if (watchType === "reporter") {
        // Substitute the picked preset's currentUser() for the name already
        // typed above - if no name is typed yet, this leaves an empty ""
        // placeholder the PM can fill in by typing the name and it'll be
        // regenerated on blur, or they can just edit the JQL directly.
        setWatchedReporterJql(substituteCurrentUser(jql, watchedName.trim()));
      } else {
        setWatchedJql(jql);
      }
    }
    if (!watchedName.trim() && preset.label) {
      setWatchedName(preset.label);
    }
    setQuickPickValue("");
  };

  // Reporter mode's JQL box auto-fills when the name field is left (blur),
  // using whatever's already in the box as a hint: if it looks like a
  // preset-derived query (references currentUser() or already has this
  // person's old name in it), just re-substitute the new name into the
  // same shape rather than resetting to the plain default template -
  // preserves a PM's preset choice across renaming the target person.
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
    setQuickPickValue("");
    setEditingId(null);
  };

  // Loads an existing entry's fields into the same form used for adding,
  // so changing anything about it (label, query, capacity) is one Update
  // click instead of deleting and re-adding - which duplicated effort and
  // risked ending up with two rows for the same person if the delete was
  // missed. "preset" mode is never inferred here even if the entry's JQL
  // happens to match a saved preset exactly - there's no reliable way to
  // tell that from the stored data, and "Custom query" with the JQL
  // pre-filled is the safe, always-correct edit path for any jql-type entry.
  const handleEditClick = (person) => {
    setEditingId(person.id);
    setWatchedName(person.displayName);
    setWatchedPresetId("");
    setQuickPickValue("");
    setWatchedCapacity(person.capacity === null || person.capacity === undefined ? "" : String(person.capacity));
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
    const jql = isReporter
      ? watchedReporterJql.trim() || buildReporterJql(displayName)
      : isPreset
        ? selectedPreset
          ? jqlForPreset(selectedPreset)
          : ""
        : watchedJql.trim();
    if (!displayName) return;
    if (watchType === "jql" && !jql) { onError("JQL is required for a custom query entry."); return; }
    if (isPreset && !jql) { onError("Pick a saved preset first."); return; }
    onError("");
    const payload = {
      displayName,
      watchType: isReporter || isPreset ? "jql" : watchType,
      jql: watchType === "jql" || isReporter || isPreset ? jql : "",
      capacity: watchedCapacity.trim() === "" ? null : watchedCapacity.trim(),
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
                <Table.Cell>
                  {person.watchType !== "jql"
                    ? "Person"
                    : isReporterWatchJql(person.jql)
                      ? "Reporter"
                      : "Custom query"}
                </Table.Cell>
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
                    onKeyDown={(event) => {
                      // This Input isn't inside a <form>, so Enter does
                      // nothing by default - it doesn't trigger onBlur, and
                      // there's no submit to catch it. Without this, typing
                      // a new capacity and pressing Enter (the natural way
                      // to "confirm" a number field) silently does nothing:
                      // the draft never saves, the row still shows the old
                      // value, and it looks like the save just failed
                      // rather than never having been triggered at all.
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
