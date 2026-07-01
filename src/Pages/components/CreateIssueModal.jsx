import React from "react";
import { Button, Dropdown, Form, Modal, Message } from "semantic-ui-react";
import {
  createJiraIssue,
  fetchJiraCreateMeta,
  fetchJiraProjects,
  generateIssueDescription,
} from "../../services/jiraClient";

const ISSUE_TYPE_OPTIONS = [
  { key: "Story", text: "Story", value: "Story" },
  { key: "Task", text: "Task", value: "Task" },
  { key: "Bug", text: "Bug", value: "Bug" },
];

// Resolve a display label for the selected epic option
const resolveEpicName = (epicSelectValue, epicPresets) => {
  if (!epicSelectValue || epicSelectValue === "__other__" || epicSelectValue.startsWith("__jql__")) {
    return "";
  }
  const match = epicPresets.find((p) => p.epicKey === epicSelectValue);
  return match?.label || match?.epicName || epicSelectValue;
};

const CreateIssueModal = ({ open, onClose, epicPresets, defaultEpicKey, onCreated }) => {
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

  // AI generation
  const [generatingDesc, setGeneratingDesc] = React.useState(false);
  const [suggestedSubtasks, setSuggestedSubtasks] = React.useState([]); // [{ title, checked }]
  const [suggestedPriority, setSuggestedPriority] = React.useState(""); // Bug priority suggestion
  const [creatingSubtasks, setCreatingSubtasks] = React.useState(false);
  const [subtaskResults, setSubtaskResults] = React.useState([]); // [{ title, issueKey?, error? }]

  React.useEffect(() => {
    if (!open) return;
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
    setSuggestedSubtasks([]);
    setSubtaskResults([]);
    setSuggestedPriority("");
  }, [open, defaultEpicKey]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoadingMeta(true);
      try {
        const items = await fetchJiraProjects();
        if (!cancelled) setProjects(items);
      } catch {
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [open]);

  React.useEffect(() => {
    if (!open || !projectKey) return;
    let cancelled = false;
    const load = async () => {
      try {
        const meta = await fetchJiraCreateMeta(projectKey);
        if (cancelled) return;
        const allowed = meta?.issueTypes || [];
        if (allowed.length > 0 && !allowed.some((t) => t.name === issueType)) {
          setIssueType(allowed[0].name);
        }
      } catch { /* keep defaults */ }
    };
    void load();
    return () => { cancelled = true; };
  }, [open, projectKey, issueType]);

  // Clear subtask suggestions when issue type changes away from Story
  React.useEffect(() => {
    if (issueType !== "Story") {
      setSuggestedSubtasks([]);
      setSubtaskResults([]);
    }
    if (issueType !== "Bug") {
      setSuggestedPriority("");
    }
  }, [issueType]);

  const projectOptions = React.useMemo(() => {
    const fromApi = projects.map((p) => ({
      key: p.key,
      text: `${p.key} — ${p.name}`,
      value: p.key,
    }));
    if (!fromApi.some((o) => o.value === "ODI")) {
      fromApi.unshift({ key: "ODI", text: "ODI — Operations Devops Itential", value: "ODI" });
    }
    return fromApi;
  }, [projects]);

  const epicOptions = React.useMemo(() => {
    const opts = [];
    for (const preset of epicPresets) {
      if (preset.presetType === "jql" || preset.epicKey === "JQL") {
        opts.push({
          key: `jql-${preset.id}`,
          text: `${preset.label} (saved query)`,
          value: `__jql__${preset.jql || ""}`,
        });
      } else {
        opts.push({ key: preset.epicKey, text: preset.label, value: preset.epicKey });
      }
    }
    opts.push({ key: "__other__", text: "— Enter epic key manually —", value: "__other__" });
    return opts;
  }, [epicPresets]);

  const isManualEpic = epicSelectValue === "__other__";
  const isJqlEpic = typeof epicSelectValue === "string" && epicSelectValue.startsWith("__jql__");

  const handleGenerateDescription = async () => {
    if (!summary.trim()) {
      setError("Enter a title before generating a description.");
      return;
    }
    setError("");
    setGeneratingDesc(true);
    setSuggestedSubtasks([]);
    setSubtaskResults([]);
    try {
      const epicName = resolveEpicName(epicSelectValue, epicPresets);
      const result = await generateIssueDescription({
        summary: summary.trim(),
        issueType,
        epicKey: isManualEpic ? manualEpicInput.trim() : (isJqlEpic ? "" : epicSelectValue),
        epicName,
      });
      if (result?.description) {
        setDescription(result.description);
      }
      // Story: AI may rewrite the title into proper job story format
      if (issueType === "Story" && result?.summary) {
        setSummary(result.summary);
      }
      if (issueType === "Story" && Array.isArray(result?.subtasks) && result.subtasks.length > 0) {
        setSuggestedSubtasks(result.subtasks.map((title) => ({ title, checked: true })));
      }
      // Bug: AI suggests a priority
      if (issueType === "Bug" && result?.priority) {
        setSuggestedPriority(result.priority);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setGeneratingDesc(false);
    }
  };

  const handleSubmit = async () => {
    setError("");
    setSuccess("");
    if (!summary.trim()) {
      setError("Summary is required.");
      return;
    }
    setSubmitting(true);
    let createdParentKey = "";
    try {
      const result = await createJiraIssue({
        projectKey,
        issueType,
        epicKey,
        summary: summary.trim(),
        description: description.trim(),
        assignee: assignee.trim(),
      });
      createdParentKey = result?.issueKey || "";
      if (onCreated && createdParentKey) onCreated(createdParentKey);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create issue");
      setSubmitting(false);
      return;
    }

    // Create checked subtasks under the new story
    const checkedSubtasks = suggestedSubtasks.filter((s) => s.checked);
    if (createdParentKey && checkedSubtasks.length > 0) {
      setSubmitting(false);
      setCreatingSubtasks(true);
      const results = [];
      for (const sub of checkedSubtasks) {
        try {
          const subResult = await createJiraIssue({
            projectKey,
            issueType: "Task",
            epicKey: createdParentKey, // parent = the just-created story
            summary: sub.title,
            description: "",
            assignee: "",
          });
          results.push({ title: sub.title, issueKey: subResult?.issueKey || "" });
        } catch (subError) {
          results.push({ title: sub.title, error: subError instanceof Error ? subError.message : "Failed" });
        }
      }
      setSubtaskResults(results);
      setCreatingSubtasks(false);
      const failed = results.filter((r) => r.error);
      setSuccess(
        `Created ${createdParentKey}` +
        (results.length > 0 ? ` + ${results.length - failed.length} subtask${results.length - failed.length !== 1 ? "s" : ""}` : "") +
        (failed.length > 0 ? ` (${failed.length} subtask${failed.length !== 1 ? "s" : ""} failed)` : "")
      );
    } else {
      setSubmitting(false);
      setSuccess(createdParentKey ? `Created ${createdParentKey}` : "Issue created.");
    }
  };

  const canGenerate = Boolean(summary.trim()) && !generatingDesc && !submitting;
  const isLoading = loadingMeta || submitting || generatingDesc || creatingSubtasks;

  return (
    <Modal open={open} onClose={onClose} size="small">
      <Modal.Header>Create Jira issue</Modal.Header>
      <Modal.Content>
        {error ? <Message negative size="small">{error}</Message> : null}
        {success ? (
          <Message positive size="small">
            <p style={{ marginBottom: subtaskResults.length > 0 ? "0.4rem" : 0 }}>{success}</p>
            {subtaskResults.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.82rem" }}>
                {subtaskResults.map((r, i) => (
                  <li key={i} style={{ color: r.error ? "#991b1b" : "inherit" }}>
                    {r.issueKey ? `${r.issueKey} — ` : ""}{r.title}
                    {r.error ? ` (${r.error})` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </Message>
        ) : null}

        <Form loading={isLoading}>
          <Form.Field>
            <label>Project</label>
            <Dropdown fluid search selection options={projectOptions} value={projectKey}
              onChange={(_e, { value }) => setProjectKey(String(value || "ODI"))} />
          </Form.Field>
          <Form.Field>
            <label>Issue type</label>
            <Dropdown fluid selection options={ISSUE_TYPE_OPTIONS} value={issueType}
              onChange={(_e, { value }) => setIssueType(String(value || "Story"))} />
          </Form.Field>
          <Form.Field>
            <label>Epic / parent</label>
            <Dropdown fluid search selection clearable
              placeholder="Select epic or saved query (optional)"
              options={epicOptions} value={epicSelectValue || null}
              onChange={(_e, { value }) => {
                const v = String(value || "");
                setEpicSelectValue(v);
                if (v === "__other__") { setEpicKey(""); }
                else if (v.startsWith("__jql__")) { setEpicKey(""); }
                else { setEpicKey(v); setManualEpicInput(""); }
              }} />
            {isManualEpic ? (
              <input type="text" placeholder="e.g. ODI-1234" value={manualEpicInput}
                onChange={(e) => { setManualEpicInput(e.target.value); setEpicKey(e.target.value.trim()); }}
                style={{ marginTop: "0.4rem", width: "100%", padding: "0.5em 0.8em", border: "1px solid #e2e8f0", borderRadius: "6px" }}
                autoFocus />
            ) : null}
            {isJqlEpic ? (
              <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.3rem" }}>
                Saved JQL query — no epic key will be set on the issue.
              </p>
            ) : null}
          </Form.Field>

          <Form.Field required>
            <label>Title</label>
            <input type="text" value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={issueType === "Story"
                ? "When <situation>, I want <motivation>, so I can <outcome>."
                : "Short, specific title"} />
            {issueType === "Story" ? (
              <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.25rem" }}>
                ODI standard: Job Story format — "When… I want… so I can…". AI will reformat if needed.
              </p>
            ) : null}
          </Form.Field>

          <Form.Field>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
              <label style={{ margin: 0 }}>Description</label>
              <Button
                type="button"
                size="small"
                loading={generatingDesc}
                disabled={!canGenerate}
                onClick={handleGenerateDescription}
                style={{
                  backgroundColor: "#0c93d9",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  padding: "0.35em 0.85em",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  letterSpacing: "0.01em",
                  cursor: canGenerate ? "pointer" : "not-allowed",
                  opacity: canGenerate ? 1 : 0.5,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35em",
                }}
              >
                ✦ AI Draft
              </Button>
            </div>
            <textarea value={description} rows={5}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={issueType === "Story"
                ? "Expand on the situation, motivation, and desired outcome. Add technical details the developer needs."
                : issueType === "Bug"
                ? "What is broken? Steps to reproduce, expected vs actual behavior, environment, workaround if any."
                : `Describe what this ${issueType.toLowerCase()} needs to accomplish…`}
              style={{ width: "100%", padding: "0.5em 0.8em", border: "1px solid #e2e8f0", borderRadius: "6px", resize: "vertical", fontFamily: "inherit", fontSize: "0.9rem" }} />
          </Form.Field>

          {/* Bug priority suggestion */}
          {issueType === "Bug" && suggestedPriority ? (
            <Message info size="small" style={{ marginTop: "-0.5rem" }}>
              <strong>Suggested priority: {suggestedPriority}</strong>
              <span style={{ color: "#475569", fontWeight: 400 }}>
                {" — "}
                {suggestedPriority === "Low" && "No noticeable breakdown of the system."}
                {suggestedPriority === "Medium" && "Unexpected behavior, but system still functional."}
                {suggestedPriority === "High" && "Capable of collapsing large parts of the system."}
                {suggestedPriority === "Critical" && "Capable of triggering complete system shutdown."}
              </span>
            </Message>
          ) : null}

          {/* Subtask suggestions — Stories only */}
          {issueType === "Story" && suggestedSubtasks.length > 0 ? (
            <Form.Field>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                Suggested subtasks
                <span style={{ fontWeight: 400, fontSize: "0.8rem", color: "#64748b" }}>
                  — checked ones will be created under this story
                </span>
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.25rem" }}>
                {suggestedSubtasks.map((sub, idx) => (
                  <label key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", cursor: "pointer", fontSize: "0.88rem", lineHeight: 1.4 }}>
                    <input type="checkbox" checked={sub.checked} style={{ marginTop: "0.15rem", flexShrink: 0 }}
                      onChange={() => setSuggestedSubtasks((prev) =>
                        prev.map((s, i) => i === idx ? { ...s, checked: !s.checked } : s)
                      )} />
                    <input type="text" value={sub.title}
                      onChange={(e) => setSuggestedSubtasks((prev) =>
                        prev.map((s, i) => i === idx ? { ...s, title: e.target.value } : s)
                      )}
                      style={{ flex: 1, padding: "0.3em 0.6em", border: "1px solid #e2e8f0", borderRadius: "4px", fontSize: "0.88rem" }} />
                  </label>
                ))}
              </div>
            </Form.Field>
          ) : null}

          <Form.Input label="Assignee" placeholder="Display name or email (optional)"
            value={assignee} onChange={(_e, { value }) => setAssignee(value)} />
        </Form>
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={onClose}>Close</Button>
        <Button primary loading={submitting || creatingSubtasks} disabled={isLoading}
          onClick={handleSubmit}>
          Create{suggestedSubtasks.filter((s) => s.checked).length > 0
            ? ` + ${suggestedSubtasks.filter((s) => s.checked).length} subtask${suggestedSubtasks.filter((s) => s.checked).length !== 1 ? "s" : ""}`
            : ""}
        </Button>
      </Modal.Actions>
    </Modal>
  );
};

export default CreateIssueModal;
