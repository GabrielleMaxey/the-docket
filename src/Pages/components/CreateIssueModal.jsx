import React from "react";
import { Button, Dropdown, Form, Modal, Message } from "semantic-ui-react";
import {
  createJiraIssue,
  fetchEpicParentOptions,
  fetchJiraCreateMeta,
  fetchJiraHealth,
  fetchJiraIssueSummary,
  fetchJiraParentCandidates,
  fetchJiraProjects,
  generateIssueDescription,
} from "../../services/jiraClient";
import {
  ODI_BUG_PRIORITIES,
  validateOdiIssueCreate,
} from "../../../shared/odiIssueStandards.mjs";
import {
  ODI_BUG_TRACKING_OPTIONS,
  ODI_COMPONENT_OPTIONS,
  ODI_VERTICAL_COMPONENT_OPTIONS,
  toCreateIssueDropdownOptions,
} from "../../../shared/odiCreateIssueFields.mjs";
import {
  buildEpicPresetDropdownOptions,
  resolveEpicSelectToKey,
  resolvePresetFromSelect,
} from "../../../shared/createIssuePresetUtils.mjs";
import { buildParentDropdownFromCandidates } from "../../../shared/jiraParentCandidates.mjs";

const COMPONENT_OPTIONS = toCreateIssueDropdownOptions(ODI_COMPONENT_OPTIONS);
const VERTICAL_COMPONENT_OPTIONS = toCreateIssueDropdownOptions(ODI_VERTICAL_COMPONENT_OPTIONS);
const BUG_TRACKING_OPTIONS = toCreateIssueDropdownOptions(ODI_BUG_TRACKING_OPTIONS);

const ComboDropdownField = ({
  label,
  value,
  options,
  disabled,
  onChange,
  placeholder,
  required = false,
}) => (
  <Form.Field required={required}>
    <label>{label}</label>
    <Dropdown
      fluid
      search
      selection
      allowAdditions
      additionLabel="Use custom: "
      placeholder={placeholder}
      options={options}
      value={value || null}
      disabled={disabled}
      onAddItem={(_e, { value: newValue }) => onChange(String(newValue || ""))}
      onChange={(_e, { value: nextValue }) => onChange(String(nextValue || ""))}
    />
    <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.25rem" }}>
      Choose a default option or type a custom value.
    </p>
  </Form.Field>
);

const ISSUE_TYPE_OPTIONS = [
  { key: "Story", text: "Story", value: "Story" },
  { key: "Task", text: "Task", value: "Task" },
  { key: "Bug", text: "Bug", value: "Bug" },
];

const PRIORITY_OPTIONS = ODI_BUG_PRIORITIES.map((priority) => ({
  key: priority,
  text: priority,
  value: priority,
}));

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/i;

const buildJiraBrowseUrl = (jiraBaseUrl, issueKey) => {
  const key = String(issueKey || "").trim();
  const base = String(jiraBaseUrl || "").trim().replace(/\/$/, "");
  if (!key || !base) {
    return "";
  }
  return `${base}/browse/${encodeURIComponent(key)}`;
};

const resolveEpicName = (epicSelectValue, epicPresets) => {
  if (!epicSelectValue || epicSelectValue === "__other__") {
    return "";
  }
  if (epicSelectValue.startsWith("__preset__")) {
    const presetId = epicSelectValue.slice("__preset__".length);
    const match = epicPresets.find((p) => String(p.id) === presetId);
    return match?.label || match?.epicName || "";
  }
  const match = epicPresets.find((p) => p.epicKey === epicSelectValue);
  return match?.label || match?.epicName || epicSelectValue;
};

const buildParentDropdownOptions = ({ parentOptions, issueType }) => {
  if (!parentOptions?.epic?.key) {
    return [];
  }

  const epicOption = {
    key: `epic-${parentOptions.epic.key}`,
    text: `Epic: ${parentOptions.epic.key} — ${parentOptions.epic.summary}`,
    value: parentOptions.epic.key,
    disabled: issueType === "Task",
  };

  const storyOptions = (parentOptions.stories || []).map((story) => ({
    key: story.key,
    text: `Story: ${story.key} — ${story.summary}`,
    value: story.key,
    disabled: issueType === "Story" || issueType === "Bug",
  }));

  return [epicOption, ...storyOptions];
};

const CreateIssueModal = ({ open, onClose, epicPresets, defaultEpicSelectValue, onCreated }) => {
  const [projectKey, setProjectKey] = React.useState("ODI");
  const [issueType, setIssueType] = React.useState("Story");
  const [summary, setSummary] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [assignee, setAssignee] = React.useState("");
  const [projects, setProjects] = React.useState([]);
  const [loadingMeta, setLoadingMeta] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [createdIssueKey, setCreatedIssueKey] = React.useState("");
  const [jiraBaseUrl, setJiraBaseUrl] = React.useState("");
  const [epicSelectValue, setEpicSelectValue] = React.useState(defaultEpicSelectValue || "");
  const [manualEpicInput, setManualEpicInput] = React.useState("");
  const [sourceEpicKey, setSourceEpicKey] = React.useState("");
  const [parentOptions, setParentOptions] = React.useState(null);
  const [jqlParentCandidates, setJqlParentCandidates] = React.useState(null);
  const [parentKey, setParentKey] = React.useState("");
  const [parentRole, setParentRole] = React.useState("");
  const [parentSelectValue, setParentSelectValue] = React.useState("");
  const [loadingParents, setLoadingParents] = React.useState(false);
  const [manualIssueCheck, setManualIssueCheck] = React.useState({
    loading: false,
    valid: false,
    error: "",
    issue: null,
  });

  const [generatingDesc, setGeneratingDesc] = React.useState(false);
  const [suggestedSubtasks, setSuggestedSubtasks] = React.useState([]);
  const [suggestedPriority, setSuggestedPriority] = React.useState("");
  const [bugPriority, setBugPriority] = React.useState("");
  const [componentValue, setComponentValue] = React.useState("");
  const [verticalComponentValue, setVerticalComponentValue] = React.useState("");
  const [bugTrackingValue, setBugTrackingValue] = React.useState("");
  const [clarificationQuestions, setClarificationQuestions] = React.useState([]);
  const [needsClarification, setNeedsClarification] = React.useState(false);
  const [creatingSubtasks, setCreatingSubtasks] = React.useState(false);
  const [subtaskResults, setSubtaskResults] = React.useState([]);

  const resetParentState = React.useCallback(() => {
    setSourceEpicKey("");
    setParentOptions(null);
    setJqlParentCandidates(null);
    setParentKey("");
    setParentRole("");
    setParentSelectValue("");
    setManualIssueCheck({ loading: false, valid: false, error: "", issue: null });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setProjectKey("ODI");
    setIssueType("Story");
    setEpicSelectValue(defaultEpicSelectValue || "");
    setManualEpicInput("");
    resetParentState();
    setSummary("");
    setDescription("");
    setAssignee("");
    setError("");
    setSuccess("");
    setCreatedIssueKey("");
    setSuggestedSubtasks([]);
    setSubtaskResults([]);
    setSuggestedPriority("");
    setBugPriority("");
    setComponentValue("");
    setVerticalComponentValue("");
    setBugTrackingValue("");
    setClarificationQuestions([]);
    setNeedsClarification(false);
  }, [open, defaultEpicSelectValue, resetParentState]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoadingMeta(true);
      try {
        const [items, health] = await Promise.all([fetchJiraProjects(), fetchJiraHealth()]);
        if (!cancelled) {
          setProjects(items);
          setJiraBaseUrl(String(health?.jiraBaseUrl || "").trim());
        }
      } catch {
        if (!cancelled) {
          setProjects([]);
          setJiraBaseUrl("");
        }
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

  React.useEffect(() => {
    if (issueType !== "Story") {
      setSuggestedSubtasks([]);
      setSubtaskResults([]);
    }
    if (issueType !== "Bug") {
      setSuggestedPriority("");
      setBugPriority("");
      setBugTrackingValue("");
    }
    setClarificationQuestions([]);
    setNeedsClarification(false);
    if (issueType === "Story") {
      setAssignee("");
    }
  }, [issueType]);

  const isManualEpic = epicSelectValue === "__other__";

  React.useEffect(() => {
    if (!open || isManualEpic) return;
    if (!epicSelectValue) {
      resetParentState();
      return;
    }

    const epicKeyToLoad = resolveEpicSelectToKey(epicSelectValue, epicPresets);
    const preset = resolvePresetFromSelect(epicSelectValue, epicPresets);
    const presetJql = String(preset?.jql || "").trim();

    if (!epicKeyToLoad && !presetJql) {
      resetParentState();
      if (epicSelectValue.startsWith("__preset__")) {
        setError("This saved query has no JQL to resolve parents from. Enter an issue key manually.");
      }
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoadingParents(true);
      setError("");
      try {
        if (epicKeyToLoad) {
          const data = await fetchEpicParentOptions(epicKeyToLoad);
          if (cancelled) return;
          setJqlParentCandidates(null);
          setSourceEpicKey(epicKeyToLoad);
          setParentOptions(data);
          setManualIssueCheck({ loading: false, valid: true, error: "", issue: null });
          return;
        }

        const data = await fetchJiraParentCandidates({ jql: presetJql });
        if (cancelled) return;
        setParentOptions(null);
        setJqlParentCandidates(data);
        setSourceEpicKey("");
        setManualIssueCheck({ loading: false, valid: true, error: "", issue: null });
      } catch (loadError) {
        if (!cancelled) {
          resetParentState();
          setError(loadError instanceof Error ? loadError.message : "Failed to load parent options");
        }
      } finally {
        if (!cancelled) setLoadingParents(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [open, epicSelectValue, isManualEpic, resetParentState, epicPresets]);

  React.useEffect(() => {
    if (!open || !isManualEpic) return;

    const key = manualEpicInput.trim().toUpperCase();
    if (!ISSUE_KEY_PATTERN.test(key)) {
      setManualIssueCheck({ loading: false, valid: false, error: "", issue: null });
      setSourceEpicKey("");
      setParentOptions(null);
      setParentKey("");
      setParentRole("");
      setParentSelectValue("");
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingParents(true);
      setManualIssueCheck({ loading: true, valid: false, error: "", issue: null });
      setError("");
      try {
        const issue = await fetchJiraIssueSummary(key);
        if (cancelled) return;

        if (issue.isEpic) {
          const data = await fetchEpicParentOptions(key);
          if (cancelled) return;
          setManualIssueCheck({ loading: false, valid: true, error: "", issue });
          setSourceEpicKey(key);
          setParentOptions(data);
        } else if (issue.isStory && issueType === "Task") {
          setManualIssueCheck({ loading: false, valid: true, error: "", issue });
          setSourceEpicKey("");
          setParentOptions(null);
          setParentKey(key);
          setParentRole("story");
          setParentSelectValue(key);
        } else {
          setManualIssueCheck({
            loading: false,
            valid: false,
            error: issue.isStory
              ? `${key} is a Story. Enter an Epic key, or switch issue type to Task.`
              : `${key} is a ${issue.issueType}. Enter an Epic key for Story/Bug, or a Story key for Task.`,
            issue,
          });
          setSourceEpicKey("");
          setParentOptions(null);
          setParentKey("");
          setParentRole("");
          setParentSelectValue("");
        }
      } catch (validateError) {
        if (!cancelled) {
          resetParentState();
          setManualIssueCheck({
            loading: false,
            valid: false,
            error: validateError instanceof Error ? validateError.message : "Issue not found",
            issue: null,
          });
        }
      } finally {
        if (!cancelled) setLoadingParents(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, isManualEpic, manualEpicInput, issueType, resetParentState]);

  React.useEffect(() => {
    if (!parentOptions?.epic?.key) {
      return;
    }

    if (issueType === "Story" || issueType === "Bug") {
      setParentKey(parentOptions.epic.key);
      setParentRole("epic");
      setParentSelectValue(parentOptions.epic.key);
      return;
    }

    if (issueType === "Task" && parentRole === "epic") {
      setParentKey("");
      setParentRole("");
      setParentSelectValue("");
    }
  }, [parentOptions, issueType, parentRole]);

  React.useEffect(() => {
    if (!jqlParentCandidates || parentOptions?.epic?.key) {
      return;
    }

    if (issueType === "Task" && parentRole === "epic") {
      setParentKey("");
      setParentRole("");
      setParentSelectValue("");
      setSourceEpicKey("");
      return;
    }

    if ((issueType === "Story" || issueType === "Bug") && parentRole === "story") {
      setParentKey("");
      setParentRole("");
      setParentSelectValue("");
      setSourceEpicKey("");
    }
  }, [jqlParentCandidates, parentOptions, issueType, parentRole]);

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

  const epicOptions = React.useMemo(
    () => buildEpicPresetDropdownOptions(epicPresets),
    [epicPresets]
  );

  const parentDropdownOptions = React.useMemo(() => {
    if (parentOptions?.epic?.key) {
      return buildParentDropdownOptions({ parentOptions, issueType });
    }
    if (jqlParentCandidates) {
      return buildParentDropdownFromCandidates({ candidates: jqlParentCandidates, issueType }).map(
        (option) => ({
          key: option.key,
          text: option.text,
          value: option.value,
          parentRole: option.parentRole,
        })
      );
    }
    return [];
  }, [parentOptions, jqlParentCandidates, issueType]);

  const jqlChainPreview = React.useMemo(() => {
    const chains = jqlParentCandidates?.chains || [];
    if (chains.length === 0) {
      return { items: [], remaining: 0 };
    }
    const maxItems = 12;
    return {
      items: chains.slice(0, maxItems),
      remaining: Math.max(0, chains.length - maxItems),
    };
  }, [jqlParentCandidates]);

  const parentReady = Boolean(parentKey && parentRole);
  const manualKeyPending = isManualEpic && manualEpicInput.trim() && !manualIssueCheck.valid && !manualIssueCheck.loading;
  const parentSelectionPending = !isManualEpic
    ? Boolean(epicSelectValue && !parentReady && !loadingParents)
    : manualKeyPending;
  const canEditIssueFields = parentReady && !parentSelectionPending && !loadingParents;

  const handleParentSelect = (_e, { value }) => {
    const selected = String(value || "").trim();
    setParentSelectValue(selected);
    if (!selected) {
      setParentKey("");
      setParentRole("");
      setSourceEpicKey("");
      return;
    }

    const option = parentDropdownOptions.find((item) => item.value === selected);
    if (option?.parentRole) {
      setParentKey(selected);
      setParentRole(option.parentRole);
      if (option.parentRole === "epic") {
        setSourceEpicKey(selected);
      } else {
        const story = jqlParentCandidates?.stories?.find((item) => item.key === selected);
        setSourceEpicKey(story?.epicKey || "");
      }
      return;
    }

    if (selected === parentOptions?.epic?.key) {
      setParentKey(selected);
      setParentRole("epic");
      setSourceEpicKey(selected);
      return;
    }

    setParentKey(selected);
    setParentRole("story");
    setSourceEpicKey("");
  };

  const handleGenerateDescription = async () => {
    if (!canEditIssueFields) {
      setError("Select and validate a parent before generating a description.");
      return;
    }
    if (!summary.trim()) {
      setError("Enter a title before generating a description.");
      return;
    }
    setError("");
    setGeneratingDesc(true);
    setSuggestedSubtasks([]);
    setSubtaskResults([]);
    setClarificationQuestions([]);
    setNeedsClarification(false);
    try {
      const epicName = resolveEpicName(epicSelectValue, epicPresets);
      const result = await generateIssueDescription({
        summary: summary.trim(),
        issueType,
        epicKey: sourceEpicKey || parentKey,
        epicName,
      });
      if (result?.description) {
        setDescription(result.description);
      }
      setNeedsClarification(Boolean(result?.needsClarification));
      if (Array.isArray(result?.questions) && result.questions.length > 0) {
        setClarificationQuestions(result.questions);
      } else {
        setClarificationQuestions([]);
      }
      if (issueType === "Story" && result?.summary) {
        setSummary(result.summary);
      }
      if (
        issueType === "Story" &&
        !result?.needsClarification &&
        Array.isArray(result?.subtasks) &&
        result.subtasks.length > 0
      ) {
        setSuggestedSubtasks(result.subtasks.map((title) => ({ title, checked: true })));
      } else if (issueType === "Story" && result?.needsClarification) {
        setSuggestedSubtasks([]);
      }
      if (issueType === "Bug" && result?.priority) {
        setSuggestedPriority(result.priority);
        setBugPriority((prev) => prev || result.priority);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setGeneratingDesc(false);
    }
  };

  const formatStandardsErrors = (errors) =>
    errors.map((item) => `• ${item}`).join("\n");

  const handleSubmit = async () => {
    setError("");
    setSuccess("");
    if (!parentReady) {
      setError("Select a valid parent before creating the issue.");
      return;
    }
    if (!summary.trim()) {
      setError("Summary is required.");
      return;
    }
    if (issueType === "Story" && needsClarification) {
      setError(
        "Story is not fully defined. Answer the clarification questions, update the title/description, then run AI Draft again before creating."
      );
      return;
    }

    const standardsCheck = validateOdiIssueCreate({
      issueType,
      summary: summary.trim(),
      description: description.trim(),
      epicKey: parentKey,
      assignee: issueType === "Story" ? "" : assignee.trim(),
      isSubtask: false,
      parentRole,
      priority: bugPriority,
    });
    if (!standardsCheck.valid) {
      setError(formatStandardsErrors(standardsCheck.errors));
      return;
    }

    setSubmitting(true);
    let createdParentKey = "";
    try {
      const result = await createJiraIssue({
        projectKey,
        issueType,
        epicKey: parentKey,
        parentRole,
        summary: summary.trim(),
        description: description.trim(),
        assignee: issueType === "Story" ? "" : assignee.trim(),
        priority: issueType === "Bug" ? bugPriority : "",
        component: componentValue.trim(),
        verticalComponent: verticalComponentValue.trim(),
        bugTracking: issueType === "Bug" ? bugTrackingValue.trim() : "",
      });
      createdParentKey = result?.issueKey || "";
      setCreatedIssueKey(createdParentKey);
      if (onCreated && createdParentKey) onCreated(createdParentKey);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create issue");
      setSubmitting(false);
      return;
    }

    const checkedSubtasks = suggestedSubtasks.filter((s) => s.checked);
    if (createdParentKey && checkedSubtasks.length > 0) {
      setSubmitting(false);
      setCreatingSubtasks(true);
      const results = [];
      for (const sub of checkedSubtasks) {
        const subtaskCheck = validateOdiIssueCreate({
          issueType: "Task",
          summary: sub.title.trim(),
          epicKey: createdParentKey,
          isSubtask: true,
          parentRole: "story",
        });
        if (!subtaskCheck.valid) {
          results.push({
            title: sub.title,
            error: subtaskCheck.errors.join(" "),
          });
          continue;
        }

        try {
          const subResult = await createJiraIssue({
            projectKey,
            issueType: "Task",
            epicKey: createdParentKey,
            parentRole: "story",
            summary: sub.title.trim(),
            description: "",
            assignee: "",
            isSubtask: true,
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

  const canGenerate = canEditIssueFields && Boolean(summary.trim()) && !generatingDesc && !submitting;
  const isLoading = loadingMeta || submitting || generatingDesc || creatingSubtasks || loadingParents;
  const createdIssueUrl = buildJiraBrowseUrl(jiraBaseUrl, createdIssueKey);

  return (
    <Modal open={open} onClose={onClose} size="small">
      <Modal.Header>Create Jira issue</Modal.Header>
      <Modal.Content>
        {error ? (
          <Message negative size="small" style={{ whiteSpace: "pre-wrap" }}>{error}</Message>
        ) : null}
        {success ? (
          <Message positive size="small">
            <p style={{ marginBottom: subtaskResults.length > 0 || createdIssueUrl ? "0.4rem" : 0 }}>{success}</p>
            {createdIssueUrl ? (
              <p style={{ margin: subtaskResults.length > 0 ? "0.4rem 0" : 0, fontSize: "0.88rem" }}>
                <a href={createdIssueUrl} target="_blank" rel="noopener noreferrer">
                  Open {createdIssueKey} in Jira to add more detail
                </a>
              </p>
            ) : null}
            {subtaskResults.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.82rem" }}>
                {subtaskResults.map((r, i) => (
                  <li key={i} style={{ color: r.error ? "#991b1b" : "inherit" }}>
                    {r.issueKey && buildJiraBrowseUrl(jiraBaseUrl, r.issueKey) ? (
                      <a href={buildJiraBrowseUrl(jiraBaseUrl, r.issueKey)} target="_blank" rel="noopener noreferrer">
                        {r.issueKey}
                      </a>
                    ) : r.issueKey ? (
                      `${r.issueKey}`
                    ) : null}
                    {r.issueKey ? " — " : ""}{r.title}
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
          <Form.Field required>
            <label>Epic preset</label>
            <Dropdown fluid search selection clearable
              placeholder="Select an epic preset"
              options={epicOptions} value={epicSelectValue || null}
              onChange={(_e, { value }) => {
                const v = String(value || "");
                setEpicSelectValue(v);
                resetParentState();
                if (v !== "__other__") {
                  setManualEpicInput("");
                }
              }} />
            {isManualEpic ? (
              <input type="text" placeholder="e.g. ODI-1234 (Epic for Story/Bug, Story for Task)"
                value={manualEpicInput}
                onChange={(e) => {
                  setManualEpicInput(e.target.value);
                  resetParentState();
                }}
                style={{ marginTop: "0.4rem", width: "100%", padding: "0.5em 0.8em", border: "1px solid #e2e8f0", borderRadius: "6px" }}
                autoFocus />
            ) : null}
            {isManualEpic && manualIssueCheck.loading ? (
              <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.3rem" }}>Validating issue key…</p>
            ) : null}
            {isManualEpic && manualIssueCheck.error ? (
              <p style={{ fontSize: "0.8rem", color: "#991b1b", marginTop: "0.3rem" }}>{manualIssueCheck.error}</p>
            ) : null}
            {isManualEpic && manualIssueCheck.valid && manualIssueCheck.issue ? (
              <p style={{ fontSize: "0.8rem", color: "#166534", marginTop: "0.3rem" }}>
                Found {manualIssueCheck.issue.issueKey}: {manualIssueCheck.issue.summary}
              </p>
            ) : null}
          </Form.Field>

          {parentDropdownOptions.length > 0 ? (
            <Form.Field required>
              <label>
                {issueType === "Task" ? "Story parent" : "Epic parent"}
              </label>
              <Dropdown fluid search selection
                placeholder={issueType === "Task" ? "Select a Story from this query" : "Select an Epic from this query"}
                options={parentDropdownOptions}
                value={parentSelectValue || null}
                onChange={handleParentSelect} />
              {jqlParentCandidates ? (
                <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.25rem" }}>
                  Parents are derived from issues returned by the saved JQL query.
                </p>
              ) : null}
              {issueType === "Bug" ? (
                <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.25rem" }}>
                  Bugs are created under the Epic only. Stories are listed for context.
                </p>
              ) : null}
              {issueType === "Task" ? (
                <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.25rem" }}>
                  Tasks require a Story parent. Select one from this epic, or enter a Story key manually above.
                </p>
              ) : null}
            </Form.Field>
          ) : null}

          {jqlParentCandidates && !loadingParents && parentDropdownOptions.length === 0 ? (
            <Message warning size="small">
              {jqlParentCandidates.issueCount === 0
                ? "This saved query returned no issues. Enter an issue key manually."
                : issueType === "Task"
                  ? "No Story parents were found in issues from this query. Enter a Story key manually."
                  : "No Epic parents were found in issues from this query. Enter an Epic key manually."}
            </Message>
          ) : null}

          {jqlChainPreview.items.length > 0 ? (
            <Message info size="small">
              <p style={{ marginBottom: "0.35rem" }}>
                Found {jqlParentCandidates.issueCount} issue(s) in this query. Parent chains:
              </p>
              <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.82rem" }}>
                {jqlChainPreview.items.map((chain) => (
                  <li key={chain.issueKey}>
                    <strong>{chain.issueKey}</strong>
                    {chain.summary ? ` — ${chain.summary}` : ""}
                    <br />
                    <span style={{ color: "#64748b" }}>{chain.chainLabel}</span>
                  </li>
                ))}
              </ul>
              {jqlChainPreview.remaining > 0 ? (
                <p style={{ marginTop: "0.35rem", marginBottom: 0, fontSize: "0.8rem", color: "#64748b" }}>
                  …and {jqlChainPreview.remaining} more
                </p>
              ) : null}
            </Message>
          ) : null}

          {!canEditIssueFields ? (
            <Message info size="small">
              Select a preset or enter a valid ODI issue key before filling in the issue details.
            </Message>
          ) : null}

          <Form.Field required>
            <label>Title</label>
            <input type="text" value={summary} disabled={!canEditIssueFields}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={issueType === "Story"
                ? "When <situation>, I want <motivation>, so I can <outcome>."
                : "Short, specific title"} />
            {issueType === "Story" ? (
              <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.25rem" }}>
                ODI standard: Job Story with a clear ask and goal outcome. AI Draft asks 2–3 questions if those are not defined.
              </p>
            ) : null}
          </Form.Field>

          <ComboDropdownField
            label="Components"
            value={componentValue}
            options={COMPONENT_OPTIONS}
            disabled={!canEditIssueFields}
            placeholder="Select or type a component"
            onChange={setComponentValue}
          />

          <ComboDropdownField
            label="Vertical Components"
            value={verticalComponentValue}
            options={VERTICAL_COMPONENT_OPTIONS}
            disabled={!canEditIssueFields}
            placeholder="Select or type a vertical component"
            onChange={setVerticalComponentValue}
          />

          {issueType === "Bug" ? (
            <ComboDropdownField
              label="BUG Tracking"
              value={bugTrackingValue}
              options={BUG_TRACKING_OPTIONS}
              disabled={!canEditIssueFields}
              placeholder="Select or type a bug tracking category"
              onChange={setBugTrackingValue}
            />
          ) : null}

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
            <textarea value={description} rows={8} disabled={!canEditIssueFields}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={issueType === "Story"
                ? "Short overview, then bulleted development steps. Use AI Draft for ODI formatting."
                : issueType === "Bug"
                ? "Short overview, then bulleted steps to reproduce, troubleshooting, and fix approach."
                : `Short overview, then bulleted work items for this ${issueType.toLowerCase()}…`}
              style={{ width: "100%", padding: "0.5em 0.8em", border: "1px solid #e2e8f0", borderRadius: "6px", resize: "vertical", fontFamily: "inherit", fontSize: "0.9rem", lineHeight: 1.45, whiteSpace: "pre-wrap" }} />
          </Form.Field>

          {issueType === "Bug" ? (
            <Form.Field required>
              <label>Priority</label>
              <Dropdown fluid selection options={PRIORITY_OPTIONS} value={bugPriority || null}
                disabled={!canEditIssueFields}
                placeholder="Select priority"
                onChange={(_e, { value }) => setBugPriority(String(value || ""))} />
              {suggestedPriority && suggestedPriority !== bugPriority ? (
                <p style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "0.25rem" }}>
                  AI suggested: {suggestedPriority}
                </p>
              ) : null}
            </Form.Field>
          ) : null}

          {clarificationQuestions.length > 0 ? (
            <Message warning size="small">
              <strong>{issueType === "Story" ? "Define the ask and goal outcome" : "AI needs clarification"}</strong>
              <ul style={{ margin: "0.45rem 0 0", paddingLeft: "1.2rem" }}>
                {clarificationQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
              <p style={{ margin: "0.45rem 0 0", color: "#475569", fontSize: "0.82rem" }}>
                {issueType === "Story"
                  ? "Answer these in the title or description (situation, ask, and result/goal), then click AI Draft again. Subtasks are suggested only after the story is fully defined."
                  : "Answer these in the title or description, then click AI Draft again."}
              </p>
            </Message>
          ) : null}

          {issueType === "Bug" && suggestedPriority ? (
            <Message info size="small" style={{ marginTop: "-0.5rem" }}>
              <strong>AI severity guidance: {suggestedPriority}</strong>
              <span style={{ color: "#475569", fontWeight: 400 }}>
                {" — "}
                {suggestedPriority === "Low" && "No noticeable breakdown of the system."}
                {suggestedPriority === "Medium" && "Unexpected behavior, but system still functional."}
                {suggestedPriority === "High" && "Capable of collapsing large parts of the system."}
                {suggestedPriority === "Critical" && "Capable of triggering complete system shutdown."}
              </span>
            </Message>
          ) : null}

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

          {issueType !== "Story" ? (
            <Form.Input label="Assignee" placeholder="Display name or email (optional)"
              disabled={!canEditIssueFields}
              value={assignee} onChange={(_e, { value }) => setAssignee(value)} />
          ) : (
            <p style={{ fontSize: "0.78rem", color: "#94a3b8", margin: 0 }}>
              Stories stay unassigned per ODI standards. Assign work on sub-tasks after creation.
            </p>
          )}
        </Form>
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={onClose}>Close</Button>
        {createdIssueUrl ? (
          <Button
            as="a"
            href={createdIssueUrl}
            target="_blank"
            rel="noopener noreferrer"
            primary
          >
            Add more detail in Jira
          </Button>
        ) : (
          <Button primary loading={submitting || creatingSubtasks} disabled={isLoading || !canEditIssueFields}
            onClick={handleSubmit}>
            Create{suggestedSubtasks.filter((s) => s.checked).length > 0
              ? ` + ${suggestedSubtasks.filter((s) => s.checked).length} subtask${suggestedSubtasks.filter((s) => s.checked).length !== 1 ? "s" : ""}`
              : ""}
          </Button>
        )}
      </Modal.Actions>
    </Modal>
  );
};

export default CreateIssueModal;
