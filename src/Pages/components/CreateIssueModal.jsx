import React from "react";
import { Button, Dropdown, Form, Modal, Message } from "semantic-ui-react";
import {
  createJiraIssue,
  fetchJiraCreateMeta,
  fetchJiraProjects,
} from "../../services/jiraClient";

const ISSUE_TYPE_OPTIONS = [
  { key: "Story", text: "Story", value: "Story" },
  { key: "Task", text: "Task", value: "Task" },
  { key: "Bug", text: "Bug", value: "Bug" },
];

const CreateIssueModal = ({
  open,
  onClose,
  epicPresets,
  defaultEpicKey,
  onCreated,
}) => {
  const [projectKey, setProjectKey] = React.useState("ODI");
  const [issueType, setIssueType] = React.useState("Story");
  const [epicKey, setEpicKey] = React.useState(defaultEpicKey || "");
  const [summary, setSummary] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [assignee, setAssignee] = React.useState("");
  const [projects, setProjects] = React.useState([]);
  const [loadingMeta, setLoadingMeta] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [epicSelectValue, setEpicSelectValue] = React.useState(defaultEpicKey || "");
  const [manualEpicInput, setManualEpicInput] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      return;
    }

    setProjectKey("ODI");
    setIssueType("Story");
    setEpicKey(defaultEpicKey || "");
    setEpicSelectValue(defaultEpicKey || "");
    setManualEpicInput("");
    setSummary("");
    setDescription("");
    setAssignee("");
    setError("");
    setSuccess("");
  }, [open, defaultEpicKey]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const loadProjects = async () => {
      setLoadingMeta(true);
      try {
        const items = await fetchJiraProjects();
        if (!cancelled) {
          setProjects(items);
        }
      } catch {
        if (!cancelled) {
          setProjects([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingMeta(false);
        }
      }
    };

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open || !projectKey) {
      return;
    }

    let cancelled = false;

    const loadMeta = async () => {
      try {
        const meta = await fetchJiraCreateMeta(projectKey);
        if (cancelled) {
          return;
        }

        const allowed = meta?.issueTypes || [];
        if (allowed.length > 0 && !allowed.some((type) => type.name === issueType)) {
          setIssueType(allowed[0].name);
        }
      } catch {
        // Keep default Story/Task/Bug options when createmeta is unavailable.
      }
    };

    void loadMeta();

    return () => {
      cancelled = true;
    };
  }, [open, projectKey, issueType]);

  const projectOptions = React.useMemo(() => {
    const fromApi = projects.map((project) => ({
      key: project.key,
      text: `${project.key} — ${project.name}`,
      value: project.key,
    }));

    if (!fromApi.some((option) => option.value === "ODI")) {
      fromApi.unshift({ key: "ODI", text: "ODI", value: "ODI" });
    }

    return fromApi;
  }, [projects]);

  // Include all saved presets as epic options:
  // - Epic-type presets use their epicKey as the value
  // - JQL-type presets show in a "Saved Queries" group with their JQL as value
  // - A special "__other__" sentinel enables the manual input field
  const epicOptions = React.useMemo(() => {
    const opts = [];
    for (const preset of epicPresets) {
      if (preset.presetType === "jql" || preset.epicKey === "JQL") {
        // JQL preset — use a sentinel prefix so we can detect it
        opts.push({
          key: `jql-${preset.id}`,
          text: `${preset.label} (saved query)`,
          value: `__jql__${preset.jql || ""}`,
        });
      } else {
        opts.push({
          key: preset.epicKey,
          text: preset.label,
          value: preset.epicKey,
        });
      }
    }
    opts.push({ key: "__other__", text: "— Enter epic key manually —", value: "__other__" });
    return opts;
  }, [epicPresets]);

  const isManualEpic = epicSelectValue === "__other__";
  const isJqlEpic = typeof epicSelectValue === "string" && epicSelectValue.startsWith("__jql__");

  const handleSubmit = async () => {
    setError("");
    setSuccess("");

    if (!summary.trim()) {
      setError("Summary is required.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createJiraIssue({
        projectKey,
        issueType,
        epicKey,
        summary: summary.trim(),
        description: description.trim(),
        assignee: assignee.trim(),
      });

      const issueKey = result?.issueKey || "";
      setSuccess(issueKey ? `Created ${issueKey}` : "Issue created.");
      if (onCreated && issueKey) {
        onCreated(issueKey);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create issue");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="small">
      <Modal.Header>Create Jira issue</Modal.Header>
      <Modal.Content>
        <p className="ww-copy">Create a Story, Task, or Bug (Epic is not allowed).</p>
        {error ? <Message negative size="small">{error}</Message> : null}
        {success ? <Message positive size="small">{success}</Message> : null}
        <Form loading={loadingMeta || submitting}>
          <Form.Field>
            <label>Project</label>
            <Dropdown
              fluid
              search
              selection
              options={projectOptions}
              value={projectKey}
              onChange={(_event, { value }) => setProjectKey(String(value || "ODI"))}
            />
          </Form.Field>
          <Form.Field>
            <label>Issue type</label>
            <Dropdown
              fluid
              selection
              options={ISSUE_TYPE_OPTIONS}
              value={issueType}
              onChange={(_event, { value }) => setIssueType(String(value || "Story"))}
            />
          </Form.Field>
          <Form.Field>
            <label>Epic / parent</label>
            <Dropdown
              fluid
              search
              selection
              clearable
              placeholder="Select epic or saved query (optional)"
              options={epicOptions}
              value={epicSelectValue || null}
              onChange={(_event, { value }) => {
                const v = String(value || "");
                setEpicSelectValue(v);
                if (v === "__other__") {
                  setEpicKey(""); // cleared until user types
                } else if (v.startsWith("__jql__")) {
                  setEpicKey(""); // JQL presets don’t set an epic key
                } else {
                  setEpicKey(v);
                  setManualEpicInput("");
                }
              }}
            />
            {isManualEpic ? (
              <input
                type="text"
                placeholder="e.g. ODI-1234"
                value={manualEpicInput}
                onChange={(e) => {
                  setManualEpicInput(e.target.value);
                  setEpicKey(e.target.value.trim());
                }}
                style={{ marginTop: "0.4rem", width: "100%", padding: "0.5em 0.8em", border: "1px solid #e2e8f0", borderRadius: "6px" }}
                autoFocus
              />
            ) : null}
            {isJqlEpic ? (
              <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.3rem" }}>
                This is a saved JQL query — no epic key will be set on the issue.
              </p>
            ) : null}
          </Form.Field>
          <Form.Input
            label="Summary"
            required
            value={summary}
            onChange={(_event, { value }) => setSummary(value)}
          />
          <Form.TextArea
            label="Description"
            value={description}
            onChange={(_event, { value }) => setDescription(value)}
          />
          <Form.Input
            label="Assignee"
            placeholder="Display name or email (optional)"
            value={assignee}
            onChange={(_event, { value }) => setAssignee(value)}
          />
        </Form>
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={onClose}>Close</Button>
        <Button primary loading={submitting} onClick={handleSubmit}>
          Create
        </Button>
      </Modal.Actions>
    </Modal>
  );
};

export default CreateIssueModal;
