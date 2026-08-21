import React from "react";
import { Button, Form, Message, Table } from "semantic-ui-react";
import SettingsSection from "./SettingsSection";
import {
  createWatchedAssignee,
  deleteWatchedAssignee,
  fetchWatchedAssignees,
  resolveJiraUsersByAccountIds,
  updateWatchedAssignee,
} from "../../../services/jiraClient.js";
import { useFlash } from "../../hooks/useFlash.js";
import {
  DEFAULT_DIRECT_REPORTS_LABEL,
  buildDirectReportsJql,
  looksLikeAccountId,
  normalizeMemberNames,
} from "../../../../shared/directReportsJql.mjs";

const NameChip = ({ name, label, onRemove }) => (
  <span className="settings-name-chip">
    {label || name}
    <button
      type="button"
      className="settings-name-chip-remove"
      onClick={() => onRemove(name)}
      aria-label={`Remove ${label || name}`}
    >
      ×
    </button>
  </span>
);

const nextDefaultLabel = (existing) => {
  const used = new Set(existing.map((item) => String(item.displayName || "").trim().toLowerCase()));
  if (!used.has(DEFAULT_DIRECT_REPORTS_LABEL.toLowerCase())) {
    return DEFAULT_DIRECT_REPORTS_LABEL;
  }
  let n = 2;
  while (used.has(`${DEFAULT_DIRECT_REPORTS_LABEL} ${n}`.toLowerCase())) {
    n += 1;
  }
  return `${DEFAULT_DIRECT_REPORTS_LABEL} ${n}`;
};

const DirectReportsSection = ({ watchedAssignees, setWatchedAssignees, onError }) => {
  const queries = watchedAssignees.filter((item) => item.watchType === "direct_reports");
  const [label, setLabel] = React.useState(DEFAULT_DIRECT_REPORTS_LABEL);
  const [nameInput, setNameInput] = React.useState("");
  const [memberNames, setMemberNames] = React.useState([]);
  const [editingId, setEditingId] = React.useState(null);
  const [flash, setFlash] = useFlash();
  // accountId -> resolved display name; null means "tried, Jira has no match"
  // so we keep showing the raw id instead of retrying forever.
  const [resolvedNames, setResolvedNames] = React.useState({});

  const previewJql = buildDirectReportsJql([...memberNames, nameInput]);

  React.useEffect(() => {
    const pendingIds = [
      ...new Set(
        [...queries.flatMap((query) => query.memberNames || []), ...memberNames].filter(
          (name) => looksLikeAccountId(name) && resolvedNames[name] === undefined
        )
      ),
    ];
    if (pendingIds.length === 0) {
      return undefined;
    }

    let cancelled = false;
    resolveJiraUsersByAccountIds(pendingIds)
      .then((items) => {
        if (cancelled) return;
        setResolvedNames((prev) => {
          const next = { ...prev };
          for (const accountId of pendingIds) {
            const user = items[accountId];
            next[accountId] = user?.displayName || user?.emailAddress || null;
          }
          return next;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setResolvedNames((prev) => {
          const next = { ...prev };
          for (const accountId of pendingIds) {
            next[accountId] = prev[accountId] ?? null;
          }
          return next;
        });
      });

    return () => {
      cancelled = true;
    };
  }, [queries, memberNames, resolvedNames]);

  // Members stay stored/queried by account id (stable across renames) — this
  // only swaps in a human-readable label for display.
  const displayMemberName = (name) => (looksLikeAccountId(name) ? resolvedNames[name] || name : name);

  const resetForm = (items = queries) => {
    setEditingId(null);
    setLabel(nextDefaultLabel(items));
    setNameInput("");
    setMemberNames([]);
  };

  const handleAddName = () => {
    const next = normalizeMemberNames([...memberNames, nameInput]);
    setMemberNames(next);
    setNameInput("");
  };

  const handleRemoveName = (name) => {
    setMemberNames(memberNames.filter((item) => item !== name));
  };

  const handleClearDraftNames = () => {
    setMemberNames([]);
    setNameInput("");
  };

  const handleRemoveSavedName = async (query, name) => {
    const nextNames = normalizeMemberNames((query.memberNames || []).filter((item) => item !== name));
    onError("");
    try {
      if (nextNames.length === 0) {
        await deleteWatchedAssignee(query.id);
        setFlash("Last contributor removed; query deleted.");
      } else {
        await updateWatchedAssignee(query.id, {
          displayName: query.displayName,
          watchType: "direct_reports",
          memberNames: nextNames,
          sortOrder: query.sortOrder,
        });
        setFlash("Contributor removed.");
      }
      const items = await fetchWatchedAssignees();
      setWatchedAssignees(items);
      if (editingId === query.id) {
        if (nextNames.length === 0) {
          resetForm(items.filter((item) => item.watchType === "direct_reports"));
        } else {
          setMemberNames(nextNames);
        }
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to remove contributor");
    }
  };

  const handleEdit = (query) => {
    setEditingId(query.id);
    setLabel(query.displayName);
    setMemberNames(Array.isArray(query.memberNames) ? query.memberNames : []);
    setNameInput("");
  };

  const handleSave = async () => {
    const displayName = label.trim() || DEFAULT_DIRECT_REPORTS_LABEL;
    const names = normalizeMemberNames([...memberNames, nameInput]);
    if (names.length === 0) {
      onError("Add at least one contributor name.");
      return;
    }
    onError("");
    try {
      const payload = {
        displayName,
        watchType: "direct_reports",
        memberNames: names,
        sortOrder: editingId
          ? queries.find((item) => item.id === editingId)?.sortOrder ?? queries.length
          : watchedAssignees.length,
      };
      if (editingId) {
        await updateWatchedAssignee(editingId, payload);
        setFlash("Direct reports query updated.");
      } else {
        await createWatchedAssignee(payload);
        setFlash("Direct reports query saved.");
      }
      const items = await fetchWatchedAssignees();
      setWatchedAssignees(items);
      resetForm(items.filter((item) => item.watchType === "direct_reports"));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save direct reports query");
    }
  };

  const handleDelete = async (id) => {
    onError("");
    try {
      await deleteWatchedAssignee(id);
      const items = await fetchWatchedAssignees();
      setWatchedAssignees(items);
      setFlash("Direct reports query removed.");
      if (editingId === id) {
        resetForm(items.filter((item) => item.watchType === "direct_reports"));
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to remove query");
    }
  };

  return (
    <SettingsSection
      title="My Direct Reports"
      description="Build a JQL query from contributor names for manager team metrics and Ad-hoc team reports."
    >
      <p>
        Type Jira display names, emails, or Atlassian account IDs — one at a time, or paste a{" "}
        <strong>comma-separated list</strong> (for example{" "}
        <code>Jane Doe, jane@company.com, 557058:c0b3c8e9-1234-4abc-9def-1234567890ab</code>
        ). The app builds an <code>assignee in (...)</code> query labeled{" "}
        <strong>My Direct Reports</strong> by default. You can rename a query and save more than one
        (for example, different teams). Dashboard Generate Report → <strong>Ad-hoc team report</strong>{" "}
        uses this list after you select the chips and Refresh contributors — it is not a project JQL.
        The signed-in Jira user is left out of Direct Reports metrics and Ad-hoc team reports.
      </p>
      <p>
        For complex JQL (projects, labels, exclusions), build the filter in Jira (Filters → View all
        filters) and paste it under Settings → <strong>Contributor Metrics</strong> as a Custom query.
      </p>
      <Table celled compact>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Label</Table.HeaderCell>
            <Table.HeaderCell>Contributors</Table.HeaderCell>
            <Table.HeaderCell>Generated JQL</Table.HeaderCell>
            <Table.HeaderCell />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {queries.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan="4">No direct reports queries yet.</Table.Cell>
            </Table.Row>
          ) : (
            queries.map((query) => (
              <Table.Row key={query.id}>
                <Table.Cell>{query.displayName}</Table.Cell>
                <Table.Cell>
                  {(query.memberNames || []).length > 0 ? (
                    <div className="settings-name-chips" style={{ marginBottom: 0 }}>
                      {query.memberNames.map((name) => (
                        <NameChip
                          key={name}
                          name={name}
                          label={displayMemberName(name)}
                          onRemove={() => handleRemoveSavedName(query, name)}
                        />
                      ))}
                    </div>
                  ) : (
                    "—"
                  )}
                </Table.Cell>
                <Table.Cell>
                  <code>{query.jql || "—"}</code>
                </Table.Cell>
                <Table.Cell collapsing>
                  <Button size="mini" onClick={() => handleEdit(query)}>
                    Rename / edit
                  </Button>
                  <Button size="mini" negative onClick={() => handleDelete(query.id)}>
                    Remove
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table>
      <Form style={{ marginTop: "1rem" }} onSubmit={(e) => e.preventDefault()}>
        <Form.Input
          label={editingId ? "Rename query" : "Query label"}
          placeholder={DEFAULT_DIRECT_REPORTS_LABEL}
          value={label}
          onChange={(_e, { value }) => setLabel(value)}
        />
        <Form.Input
          label="Contributor names"
          placeholder="Jane Doe, jane@company.com, accountid:557058:…"
          value={nameInput}
          onChange={(_e, { value }) => setNameInput(value)}
          action={{ content: "Add names", onClick: handleAddName }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAddName();
            }
          }}
        />
        <p style={{ fontSize: "0.82rem", color: "#64748b", margin: "-0.5rem 0 0.75rem" }}>
          Separate multiple entries with commas. Display names, emails, and Atlassian account IDs
          are all accepted.
        </p>
        {memberNames.length > 0 ? (
          <div className="settings-name-chips">
            {memberNames.map((name) => (
              <NameChip key={name} name={name} label={displayMemberName(name)} onRemove={handleRemoveName} />
            ))}
            <Button type="button" size="mini" basic onClick={handleClearDraftNames}>
              Clear names
            </Button>
          </div>
        ) : null}
        <Form.Field>
          <label>Generated JQL</label>
          <code>{previewJql || "Add a name to preview JQL"}</code>
        </Form.Field>
        <Button primary onClick={handleSave}>
          {editingId ? "Save changes" : "Save query"}
        </Button>
        {editingId ? (
          <Button type="button" onClick={() => resetForm()}>
            Cancel
          </Button>
        ) : null}
        {flash ? (
          <Message positive size="mini" style={{ marginTop: "0.75rem" }}>
            ✓ {flash}
          </Message>
        ) : null}
      </Form>
    </SettingsSection>
  );
};

export default DirectReportsSection;
