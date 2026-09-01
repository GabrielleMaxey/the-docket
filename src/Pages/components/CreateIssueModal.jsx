import React from "react";
import { Button, Dropdown, Form, Modal, Message } from "semantic-ui-react";
import {
  createJiraIssue,
  fetchEpicParentOptions,
  fetchJiraCreateFieldOptions,
  fetchJiraCreateMeta,
  fetchJiraHealth,
  fetchJiraParentCandidates,
  fetchJiraProjects,
  generateIssueDescription,
  fetchTeamDatesBulk,
  fetchIssueMetadataBulk,
  saveTeamDate,
  saveIssueMetadata,
} from "../../services/jiraClient";

// Fields a child issue should inherit from its parent at creation time —
// actual/tracked dates (startDate/completeDate) are per-issue and never cascade.
const CASCADABLE_PLANNING_FIELDS = [
  "plannedStart",
  "plannedFinish",
  "requestor",
  "pmOverride",
  "hasOpenDecision",
  "openDecisionNote",
];

// Best-effort: copies the parent's planning fields (if any) down to newly created
// children, from whichever store (shared/Mongo or personal/SQLite) actually has them.
const cascadePlanningFieldsToChildren = async (parentKey, childKeys) => {
  if (!parentKey || !Array.isArray(childKeys) || childKeys.length === 0) {
    return;
  }

  try {
    const [teamDates, personalMeta] = await Promise.all([
      fetchTeamDatesBulk([parentKey]).catch(() => ({})),
      fetchIssueMetadataBulk([parentKey]).catch(() => ({})),
    ]);
    const teamSource = teamDates?.[parentKey];
    const personalSource = personalMeta?.[parentKey];
    const isShared = CASCADABLE_PLANNING_FIELDS.some((f) => teamSource?.[f] !== undefined && teamSource[f] !== "");
    const source = isShared ? teamSource : personalSource;
    if (!source) return;

    const patch = {};
    for (const field of CASCADABLE_PLANNING_FIELDS) {
      if (source[field] !== undefined && source[field] !== "") {
        patch[field] = source[field];
      }
    }
    if (Object.keys(patch).length === 0) return;

    const save = isShared ? saveTeamDate : saveIssueMetadata;
    await Promise.all(childKeys.map((issueKey) => save({ issueKey, ...patch }).catch(() => null)));
  } catch {
    // Best-effort — never block issue creation on cascade failure.
  }
};
import {
  ODI_BUG_PRIORITIES,
  partitionOdiStandardsErrors,
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
  isJqlPreset,
  resolveEpicSelectToKey,
  resolvePresetFromSelect,
} from "../../../shared/createIssuePresetUtils.mjs";
import {
  buildQueryIssueParentError,
  resolveQueryIssueParent,
} from "../../../shared/createIssueParentUtils.mjs";
import {
  buildParentDropdownFromCandidates,
  buildQueryIssueDropdownOptions,
} from "../../../shared/jiraParentCandidates.mjs";
import {
  createEmptyAiHelperIntake,
  listBlankOptionalIntakeFields,
  normalizeAiHelperIntake,
  validateAiHelperIntake,
} from "../../../shared/aiHelperIntake.mjs";
import AiHelperIntakePanel from "./AiHelperIntakePanel";
import useCreateIssueManualKey from "../hooks/useCreateIssueManualKey";

const COMPONENT_OPTIONS = toCreateIssueDropdownOptions(ODI_COMPONENT_OPTIONS);
const VERTICAL_COMPONENT_OPTIONS = toCreateIssueDropdownOptions(ODI_VERTICAL_COMPONENT_OPTIONS);
const BUG_TRACKING_OPTIONS = toCreateIssueDropdownOptions(ODI_BUG_TRACKING_OPTIONS);

const mergeDropdownOptions = (options, value) => {
  const list = Array.isArray(options) ? [...options] : [];
  const current = String(value || "").trim();
  if (current && !list.some((item) => item.value === current)) {
    list.push({ key: current, text: current, value: current });
  }
  return list;
};

const ComboDropdownField = ({
  label,
  value,
  options,
  disabled,
  onChange,
  placeholder,
  required = false,
  hint = "Choose an option from the list, or type a value that already exists in Jira.",
}) => {
  const mergedOptions = React.useMemo(
    () => mergeDropdownOptions(options, value),
    [options, value]
  );

  return (
    <Form.Field required={required}>
      <label>{label}</label>
      <Dropdown
        fluid
        search
        selection
        allowAdditions
        additionLabel="Use custom: "
        placeholder={placeholder}
        options={mergedOptions}
        value={value || null}
        disabled={disabled}
        onAddItem={(_e, { value: newValue }) => onChange(String(newValue || ""))}
        onChange={(_e, { value: nextValue }) => onChange(String(nextValue || ""))}
      />
      {hint ? (
        <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.25rem" }}>{hint}</p>
      ) : null}
    </Form.Field>
  );
};

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

const STORY_NOT_DEFINED_ERROR =
  "Story is not fully defined. Answer the clarification questions, update the title/description, then run AI Draft again before creating.";

const isDescriptionRelatedError = (message) => {
  const text = String(message || "").trim().toLowerCase();
  if (!text) {
    return false;
  }
  return (
    text === STORY_NOT_DEFINED_ERROR.toLowerCase() ||
    text.includes("description") ||
    text.includes("reproduction") ||
    text.includes("expected vs actual")
  );
};

const formatFieldErrors = (errors) =>
  errors.map((item) => `• ${item}`).join("\n");

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
  const [projectKey, setProjectKey] = React.useState("");
  const [issueType, setIssueType] = React.useState("Story");
  const [summary, setSummary] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [assignee, setAssignee] = React.useState("");
  const [projects, setProjects] = React.useState([]);
  const [loadingMeta, setLoadingMeta] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [descriptionError, setDescriptionError] = React.useState("");
  const [standardsOverrideAvailable, setStandardsOverrideAvailable] = React.useState(false);
  const [overrideDescriptionStandards, setOverrideDescriptionStandards] = React.useState(false);
  const [overrideReason, setOverrideReason] = React.useState(""); // "clarification" | "standards"
  const [success, setSuccess] = React.useState("");
  const [createdIssueKey, setCreatedIssueKey] = React.useState("");
  const [jiraBaseUrl, setJiraBaseUrl] = React.useState("");
  const [epicSelectValue, setEpicSelectValue] = React.useState(defaultEpicSelectValue || "");
  const [manualEpicInput, setManualEpicInput] = React.useState("");
  const [sourceEpicKey, setSourceEpicKey] = React.useState("");
  const [parentOptions, setParentOptions] = React.useState(null);
  const [jqlParentCandidates, setJqlParentCandidates] = React.useState(null);
  const [selectedQueryIssueKey, setSelectedQueryIssueKey] = React.useState("");
  const [manualParentInput, setManualParentInput] = React.useState("");
  const [parentKey, setParentKey] = React.useState("");
  const [parentRole, setParentRole] = React.useState("");
  const [parentSelectValue, setParentSelectValue] = React.useState("");
  const [loadingParents, setLoadingParents] = React.useState(false);

  const [generatingDesc, setGeneratingDesc] = React.useState(false);
  const [suggestedSubtasks, setSuggestedSubtasks] = React.useState([]);
  const [suggestedPriority, setSuggestedPriority] = React.useState("");
  const [bugPriority, setBugPriority] = React.useState("");
  const [componentValue, setComponentValue] = React.useState("");
  const [verticalComponentValue, setVerticalComponentValue] = React.useState("");
  const [componentOptions, setComponentOptions] = React.useState(COMPONENT_OPTIONS);
  const [verticalComponentOptions, setVerticalComponentOptions] = React.useState(
    VERTICAL_COMPONENT_OPTIONS
  );
  const [bugTrackingOptions, setBugTrackingOptions] = React.useState(BUG_TRACKING_OPTIONS);
  const [bugTrackingValue, setBugTrackingValue] = React.useState("");
  const [clarificationQuestions, setClarificationQuestions] = React.useState([]);
  const [needsClarification, setNeedsClarification] = React.useState(false);
  const [useAiHelper, setUseAiHelper] = React.useState(false);
  const [intakeValues, setIntakeValues] = React.useState(() => createEmptyAiHelperIntake("Story"));
  const [intakeMissingFieldIds, setIntakeMissingFieldIds] = React.useState([]);
  const [draftedFromIntake, setDraftedFromIntake] = React.useState(false);
  const [creatingSubtasks, setCreatingSubtasks] = React.useState(false);
  const [subtaskResults, setSubtaskResults] = React.useState([]);

  const isManualEpic = epicSelectValue === "__other__";
  const activePreset = React.useMemo(
    () => resolvePresetFromSelect(epicSelectValue, epicPresets),
    [epicSelectValue, epicPresets]
  );
  const isJqlPresetMode = Boolean(activePreset && isJqlPreset(activePreset) && !isManualEpic);

  const clearResolvedParent = React.useCallback(() => {
    setParentKey("");
    setParentRole("");
    setParentSelectValue("");
    setSourceEpicKey("");
  }, []);

  const setResolvedParent = React.useCallback((resolved, { clearManualParent = false } = {}) => {
    if (!resolved?.parentKey || !resolved?.parentRole) {
      clearResolvedParent();
      return false;
    }
    setParentKey(resolved.parentKey);
    setParentRole(resolved.parentRole);
    setParentSelectValue(resolved.parentKey);
    setSourceEpicKey(resolved.sourceEpicKey || "");
    if (clearManualParent) {
      setManualParentInput("");
    }
    return true;
  }, [clearResolvedParent]);

  const onManualEpicBeforeValidate = React.useCallback(() => {
    setError("");
  }, []);

  const onManualEpicInvalidFormat = React.useCallback(({ hasInput }) => {
    if (hasInput) {
      return;
    }
    setSourceEpicKey("");
    setParentOptions(null);
    clearResolvedParent();
  }, [clearResolvedParent]);

  const onManualEpicLoadEpicOptions = React.useCallback(({ epicKey, parentOptions: data }) => {
    setJqlParentCandidates(null);
    setSourceEpicKey(epicKey);
    setParentOptions(data);
  }, []);

  const onManualEpicDirectParent = React.useCallback((outcome) => {
    setSourceEpicKey("");
    setParentOptions(null);
    setResolvedParent(outcome);
  }, [setResolvedParent]);

  const onManualEpicInvalidIssue = React.useCallback(() => {
    setSourceEpicKey("");
    setParentOptions(null);
    clearResolvedParent();
  }, [clearResolvedParent]);

  const onManualEpicNotFound = React.useCallback(() => {
    setSourceEpicKey("");
    setParentOptions(null);
    setJqlParentCandidates(null);
    setSelectedQueryIssueKey("");
    setManualParentInput("");
    clearResolvedParent();
  }, [clearResolvedParent]);

  const onManualParentBeforeValidate = React.useCallback(() => {
    setError("");
  }, []);

  const onManualParentInvalidFormat = React.useCallback(({ hasInput }) => {
    if (!hasInput) {
      clearResolvedParent();
    }
  }, [clearResolvedParent]);

  const onManualParentDirectParent = React.useCallback((outcome) => {
    setSelectedQueryIssueKey("");
    setResolvedParent(outcome);
  }, [setResolvedParent]);

  const onManualParentInvalidIssue = React.useCallback(() => {
    clearResolvedParent();
  }, [clearResolvedParent]);

  const onManualParentNotFound = React.useCallback(() => {
    clearResolvedParent();
  }, [clearResolvedParent]);

  const {
    check: manualIssueCheck,
    resetCheck: resetManualEpicCheck,
  } = useCreateIssueManualKey({
    open,
    enabled: isManualEpic,
    inputValue: manualEpicInput,
    issueType,
    mode: "preset",
    onBeforeValidate: onManualEpicBeforeValidate,
    onInvalidFormat: onManualEpicInvalidFormat,
    onLoadEpicOptions: onManualEpicLoadEpicOptions,
    onDirectParent: onManualEpicDirectParent,
    onInvalidIssue: onManualEpicInvalidIssue,
    onNotFound: onManualEpicNotFound,
    setLoadingParents,
  });

  const {
    check: manualParentCheck,
    resetCheck: resetManualParentCheck,
  } = useCreateIssueManualKey({
    open,
    enabled: isJqlPresetMode && !isManualEpic,
    inputValue: manualParentInput,
    issueType,
    mode: "parent",
    onBeforeValidate: onManualParentBeforeValidate,
    onInvalidFormat: onManualParentInvalidFormat,
    onDirectParent: onManualParentDirectParent,
    onInvalidIssue: onManualParentInvalidIssue,
    onNotFound: onManualParentNotFound,
    setLoadingParents,
  });

  const resetParentState = React.useCallback(() => {
    setSourceEpicKey("");
    setParentOptions(null);
    setJqlParentCandidates(null);
    setSelectedQueryIssueKey("");
    setManualParentInput("");
    setParentKey("");
    setParentRole("");
    setParentSelectValue("");
    resetManualEpicCheck();
    resetManualParentCheck();
  }, [resetManualEpicCheck, resetManualParentCheck]);

  React.useEffect(() => {
    if (!open) return;
    setProjectKey("");
    setIssueType("Story");
    setEpicSelectValue(defaultEpicSelectValue || "");
    setManualEpicInput("");
    resetParentState();
    setSummary("");
    setDescription("");
    setAssignee("");
    setError("");
    setDescriptionError("");
    setStandardsOverrideAvailable(false);
    setOverrideDescriptionStandards(false);
    setOverrideReason("");
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
    setUseAiHelper(false);
    setIntakeValues(createEmptyAiHelperIntake("Story"));
    setIntakeMissingFieldIds([]);
    setDraftedFromIntake(false);
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
    if (!open || !projectKey) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchJiraCreateFieldOptions(projectKey, issueType);
        if (cancelled) return;
        const components = Array.isArray(data?.components) ? data.components : [];
        const vertical = Array.isArray(data?.verticalComponents) ? data.verticalComponents : [];
        const bugTracking = Array.isArray(data?.bugTracking) ? data.bugTracking : [];
        setComponentOptions(
          toCreateIssueDropdownOptions(components.length > 0 ? components : ODI_COMPONENT_OPTIONS)
        );
        setVerticalComponentOptions(
          toCreateIssueDropdownOptions(
            vertical.length > 0 ? vertical : ODI_VERTICAL_COMPONENT_OPTIONS
          )
        );
        setBugTrackingOptions(
          toCreateIssueDropdownOptions(
            bugTracking.length > 0 ? bugTracking : ODI_BUG_TRACKING_OPTIONS
          )
        );
      } catch {
        if (!cancelled) {
          setComponentOptions(COMPONENT_OPTIONS);
          setVerticalComponentOptions(VERTICAL_COMPONENT_OPTIONS);
          setBugTrackingOptions(BUG_TRACKING_OPTIONS);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
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
    setDescriptionError("");
    if (issueType === "Story") {
      setAssignee("");
    }
    // Each issue type asks a different set of intake questions, so answers do not carry over.
    setIntakeValues(createEmptyAiHelperIntake(issueType));
    setIntakeMissingFieldIds([]);
    setDraftedFromIntake(false);
  }, [issueType]);

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
          return;
        }

        const data = await fetchJiraParentCandidates({ jql: presetJql });
        if (cancelled) return;
        setParentOptions(null);
        setJqlParentCandidates(data);
        setSourceEpicKey("");
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

  const applyQueryIssueParent = React.useCallback(
    (issueKey, { showErrorOnFailure = false } = {}) => {
      if (!issueKey) {
        clearResolvedParent();
        return;
      }

      const resolved = resolveQueryIssueParent({
        chains: jqlParentCandidates?.chains,
        selectedQueryIssueKey: issueKey,
        issueType,
      });

      if (setResolvedParent(resolved, { clearManualParent: true })) {
        resetManualParentCheck();
        if (showErrorOnFailure) {
          setError("");
        }
        return;
      }

      clearResolvedParent();
      if (showErrorOnFailure) {
        setError(buildQueryIssueParentError(issueKey, issueType));
      }
    },
    [jqlParentCandidates, issueType, setResolvedParent, clearResolvedParent, resetManualParentCheck]
  );

  React.useEffect(() => {
    if (!selectedQueryIssueKey || !jqlParentCandidates) {
      return;
    }
    applyQueryIssueParent(selectedQueryIssueKey);
  }, [selectedQueryIssueKey, jqlParentCandidates, issueType, applyQueryIssueParent]);

  React.useEffect(() => {
    if (!parentOptions?.epic?.key) {
      return;
    }

    if (issueType === "Story" || issueType === "Bug") {
      setResolvedParent({
        parentKey: parentOptions.epic.key,
        parentRole: "epic",
        sourceEpicKey: parentOptions.epic.key,
      });
      return;
    }

    if (issueType === "Task" && parentRole === "epic") {
      clearResolvedParent();
    }
  }, [parentOptions, issueType, parentRole, setResolvedParent, clearResolvedParent]);

  React.useEffect(() => {
    if (!jqlParentCandidates || parentOptions?.epic?.key) {
      return;
    }

    if (issueType === "Task" && parentRole === "epic") {
      clearResolvedParent();
      return;
    }

    if ((issueType === "Story" || issueType === "Bug") && parentRole === "story") {
      clearResolvedParent();
    }
  }, [jqlParentCandidates, parentOptions, issueType, parentRole, clearResolvedParent]);

  const projectOptions = React.useMemo(() => {
    const fromApi = projects.map((p) => ({
      key: p.key,
      text: `${p.key} — ${p.name}`,
      value: p.key,
    }));
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

  const queryIssueOptions = React.useMemo(
    () => buildQueryIssueDropdownOptions(jqlParentCandidates),
    [jqlParentCandidates]
  );

  const jqlChainPreview = React.useMemo(() => {
    if (!selectedQueryIssueKey) {
      return null;
    }
    return jqlParentCandidates?.chains?.find((chain) => chain.issueKey === selectedQueryIssueKey) || null;
  }, [jqlParentCandidates, selectedQueryIssueKey]);

  const parentReady = Boolean(parentKey && parentRole);
  const manualKeyPending = isManualEpic && manualEpicInput.trim() && !manualIssueCheck.valid && !manualIssueCheck.loading;
  const manualParentPending =
    isJqlPresetMode &&
    manualParentInput.trim() &&
    !manualParentCheck.valid &&
    !manualParentCheck.loading;
  const parentSelectionPending = !isManualEpic
    ? Boolean(
        epicSelectValue &&
          !parentReady &&
          !loadingParents &&
          (isJqlPresetMode
            ? queryIssueOptions.length > 0 || parentDropdownOptions.length > 0 || manualParentInput.trim()
            : true)
      )
    : manualKeyPending;
  const canEditIssueFields = parentReady
    ? !loadingParents
    : !parentSelectionPending && !loadingParents && !manualParentPending && !manualKeyPending;
  const canSubmit =
    parentReady &&
    Boolean(summary.trim()) &&
    !submitting &&
    !creatingSubtasks &&
    !generatingDesc &&
    !loadingMeta &&
    !loadingParents;

  const handleQueryIssueSelect = (_e, { value }) => {
    const issueKey = String(value || "").trim().toUpperCase();
    setSelectedQueryIssueKey(issueKey);
    resetManualParentCheck();
    setError("");

    if (!issueKey) {
      clearResolvedParent();
      return;
    }

    applyQueryIssueParent(issueKey, { showErrorOnFailure: true });
  };

  const handleParentSelect = (_e, { value }) => {
    const selected = String(value || "").trim();
    setParentSelectValue(selected);
    setSelectedQueryIssueKey("");
    setManualParentInput("");
    resetManualParentCheck();
    if (error) setError("");
    if (!selected) {
      clearResolvedParent();
      return;
    }

    const option = parentDropdownOptions.find((item) => item.value === selected);
    if (option?.parentRole) {
      const sourceEpicKey =
        option.parentRole === "epic"
          ? selected
          : jqlParentCandidates?.stories?.find((item) => item.key === selected)?.epicKey || "";
      setResolvedParent({
        parentKey: selected,
        parentRole: option.parentRole,
        sourceEpicKey,
      });
      return;
    }

    if (selected === parentOptions?.epic?.key) {
      setResolvedParent({
        parentKey: selected,
        parentRole: "epic",
        sourceEpicKey: selected,
      });
      return;
    }

    setResolvedParent({
      parentKey: selected,
      parentRole: "story",
      sourceEpicKey: "",
    });
  };

  const handleGenerateDescription = async () => {
    if (!canEditIssueFields) {
      setError("Select and validate a parent before generating a description.");
      return;
    }
    if (useAiHelper) {
      const intakeCheck = validateAiHelperIntake(issueType, intakeValues);
      if (!intakeCheck.valid) {
        setIntakeMissingFieldIds(intakeCheck.missingFieldIds);
        setError(intakeCheck.errors.join(" "));
        return;
      }
      setIntakeMissingFieldIds([]);
    } else if (!summary.trim()) {
      setError("Enter a title before generating a description.");
      return;
    }
    setError("");
    setDescriptionError("");
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
        intake: useAiHelper ? normalizeAiHelperIntake(issueType, intakeValues) : null,
      });
      if (result?.description) {
        setDescription(result.description);
      }
      setDraftedFromIntake(useAiHelper);
      setNeedsClarification(Boolean(result?.needsClarification));
      if (Array.isArray(result?.questions) && result.questions.length > 0) {
        setClarificationQuestions(result.questions);
      } else {
        setClarificationQuestions([]);
      }
      // Story titles are always rewritten to job story format; other types only get a
      // generated title when the AI helper supplied the raw material for one.
      if ((issueType === "Story" || useAiHelper) && result?.summary) {
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

  const applyValidationErrors = (errors) => {
    const list = Array.isArray(errors) ? errors : [];
    const descriptionErrors = list.filter(isDescriptionRelatedError);
    const generalErrors = list.filter((item) => !isDescriptionRelatedError(item));
    setDescriptionError(descriptionErrors.length > 0 ? formatFieldErrors(descriptionErrors) : "");
    setError(generalErrors.length > 0 ? formatFieldErrors(generalErrors) : "");
  };

  const handleSubmit = async () => {
    setError("");
    setDescriptionError("");
    setSuccess("");
    if (!parentReady) {
      setError("Select a valid parent before creating the issue.");
      return;
    }
    if (!summary.trim()) {
      setError("Summary is required.");
      return;
    }

    const allowDescriptionOverride = Boolean(overrideDescriptionStandards);
    if (issueType === "Story" && needsClarification && !allowDescriptionOverride) {
      setDescriptionError(STORY_NOT_DEFINED_ERROR);
      setStandardsOverrideAvailable(true);
      setOverrideReason("clarification");
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
      skipDescriptionStandards: allowDescriptionOverride,
    });
    if (!standardsCheck.valid) {
      const { descriptionErrors, hardErrors } = partitionOdiStandardsErrors(standardsCheck.errors);
      if (hardErrors.length > 0) {
        setStandardsOverrideAvailable(false);
        setOverrideDescriptionStandards(false);
        setOverrideReason("");
        applyValidationErrors(standardsCheck.errors);
        return;
      }
      if (descriptionErrors.length > 0 && !allowDescriptionOverride) {
        applyValidationErrors(descriptionErrors);
        setStandardsOverrideAvailable(true);
        setOverrideReason("standards");
        return;
      }
      applyValidationErrors(standardsCheck.errors);
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
        overrideDescriptionStandards: allowDescriptionOverride,
      });
      createdParentKey = result?.issueKey || "";
      setCreatedIssueKey(createdParentKey);
      void cascadePlanningFieldsToChildren(parentKey, [createdParentKey]);
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
            assignee: assignee.trim(),
            isSubtask: true,
          });
          results.push({ title: sub.title, issueKey: subResult?.issueKey || "" });
        } catch (subError) {
          results.push({ title: sub.title, error: subError instanceof Error ? subError.message : "Failed" });
        }
      }
      setSubtaskResults(results);
      setCreatingSubtasks(false);
      const createdSubtaskKeys = results.filter((r) => r.issueKey).map((r) => r.issueKey);
      void cascadePlanningFieldsToChildren(createdParentKey, createdSubtaskKeys);
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
    if (onCreated && createdParentKey) onCreated(createdParentKey);
  };

  const intakeCheck = React.useMemo(
    () => validateAiHelperIntake(issueType, intakeValues),
    [issueType, intakeValues]
  );
  const blankOptionalIntakeFields = React.useMemo(
    () => (draftedFromIntake ? listBlankOptionalIntakeFields(issueType, intakeValues) : []),
    [draftedFromIntake, issueType, intakeValues]
  );
  const canGenerate =
    canEditIssueFields &&
    (useAiHelper ? intakeCheck.valid : Boolean(summary.trim())) &&
    !generatingDesc &&
    !submitting;
  const formLoading = loadingMeta || submitting || generatingDesc || creatingSubtasks;
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
            {blankOptionalIntakeFields.length > 0 ? (
              <p style={{ margin: "0.4rem 0", fontSize: "0.82rem", color: "#475569" }}>
                Finish these on the issue in Jira:{" "}
                {blankOptionalIntakeFields.map((field) => field.label).join(", ")}.
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

        <Form loading={formLoading}>
          <Form.Field>
            <label>Project</label>
            <Dropdown fluid search selection options={projectOptions} value={projectKey}
              onChange={(_e, { value }) => setProjectKey(String(value || ""))} />
          </Form.Field>
          <Form.Field>
            <label>Issue type</label>
            <Dropdown fluid selection options={ISSUE_TYPE_OPTIONS} value={issueType}
              onChange={(_e, { value }) => {
                setIssueType(String(value || "Story"));
                if (error) setError("");
              }} />
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

          {isJqlPresetMode && queryIssueOptions.length > 0 ? (
            <Form.Field required>
              <label>Issue from saved query</label>
              <Dropdown
                fluid
                search
                selection
                clearable
                placeholder="Select a task or story from this query"
                options={queryIssueOptions}
                value={selectedQueryIssueKey || null}
                onChange={handleQueryIssueSelect}
              />
              <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.25rem" }}>
                Pick an issue from the query to auto-fill the parent from its chain.
              </p>
              {jqlChainPreview?.chainLabel ? (
                <p style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "0.25rem" }}>
                  Chain: {jqlChainPreview.chainLabel}
                </p>
              ) : null}
            </Form.Field>
          ) : null}

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

          {isJqlPresetMode ? (
            <Form.Field>
              <label>Or enter parent key manually</label>
              <input
                type="text"
                placeholder={
                  issueType === "Task"
                    ? "e.g. ODI-1234 (Story key)"
                    : "e.g. ODI-1234 (Epic key)"
                }
                value={manualParentInput}
                onChange={(e) => {
                  setManualParentInput(e.target.value);
                  setSelectedQueryIssueKey("");
                  resetManualParentCheck();
                  if (error) setError("");
                  if (!e.target.value.trim()) {
                    clearResolvedParent();
                  }
                }}
                style={{
                  width: "100%",
                  padding: "0.5em 0.8em",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                }}
              />
              {manualParentCheck.loading ? (
                <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.3rem" }}>
                  Validating parent key…
                </p>
              ) : null}
              {manualParentCheck.error ? (
                <p style={{ fontSize: "0.8rem", color: "#991b1b", marginTop: "0.3rem" }}>
                  {manualParentCheck.error}
                </p>
              ) : null}
              {manualParentCheck.valid && manualParentCheck.issue ? (
                <p style={{ fontSize: "0.8rem", color: "#166534", marginTop: "0.3rem" }}>
                  Parent {manualParentCheck.issue.issueKey}: {manualParentCheck.issue.summary}
                </p>
              ) : null}
            </Form.Field>
          ) : null}

          {jqlParentCandidates && !loadingParents && parentDropdownOptions.length === 0 && !parentReady ? (
            <Message warning size="small">
              {jqlParentCandidates.issueCount === 0
                ? "This saved query returned no issues. Enter an issue key manually."
                : issueType === "Task"
                  ? "No Story parents were found in issues from this query. Enter a Story key manually."
                  : "No Epic parents were found in issues from this query. Enter an Epic key manually."}
            </Message>
          ) : null}

          {!canEditIssueFields ? (
            <Message info size="small">
              {isJqlPresetMode
                ? "Select an issue from the query, choose a parent, or enter a valid parent key before filling in issue details."
                : "Select a preset or enter a valid ODI issue key before filling in the issue details."}
            </Message>
          ) : null}

          <Form.Field>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.5rem",
                cursor: canEditIssueFields ? "pointer" : "not-allowed",
              }}
            >
              <input
                type="checkbox"
                checked={useAiHelper}
                disabled={!canEditIssueFields}
                onChange={(e) => {
                  setUseAiHelper(e.target.checked);
                  setIntakeMissingFieldIds([]);
                  if (!e.target.checked) {
                    setDraftedFromIntake(false);
                  }
                  if (error) setError("");
                }}
                style={{ marginTop: "0.2rem", flexShrink: 0 }}
              />
              <span>
                Use AI helper
                <span style={{ fontWeight: 400, fontSize: "0.8rem", color: "#64748b" }}>
                  {" — answer a few guided questions and let AI Draft write the title and description"}
                </span>
              </span>
            </label>
          </Form.Field>

          {useAiHelper ? (
            <AiHelperIntakePanel
              issueType={issueType}
              values={intakeValues}
              disabled={!canEditIssueFields}
              missingFieldIds={intakeMissingFieldIds}
              onFieldChange={(fieldId, value) => {
                setIntakeValues((prev) => ({ ...prev, [fieldId]: value }));
                setIntakeMissingFieldIds((prev) => prev.filter((id) => id !== fieldId));
                if (error) setError("");
              }}
            />
          ) : null}

          <Form.Field required={!useAiHelper}>
            <label>Title</label>
            <input type="text" value={summary} disabled={!canEditIssueFields}
              onChange={(e) => {
                setSummary(e.target.value);
                if (error) setError("");
              }}
              placeholder={useAiHelper
                ? "Optional — AI Draft writes this from your answers above"
                : issueType === "Story"
                ? "When <situation>, I want <motivation>, so I can <outcome>."
                : "Short, specific title"} />
            {useAiHelper ? (
              <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.25rem" }}>
                Leave blank and run AI Draft, or type your own — anything you write here is kept and used as context.
              </p>
            ) : issueType === "Story" ? (
              <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.25rem" }}>
                ODI standard: Job Story with a clear ask and goal outcome. AI Draft asks 2–3 questions if those are not defined.
              </p>
            ) : null}
          </Form.Field>

          <ComboDropdownField
            label="Components"
            value={componentValue}
            options={componentOptions}
            disabled={!canEditIssueFields}
            placeholder="Select or type a component"
            onChange={setComponentValue}
            hint="Loaded from the Jira project. Names must already exist as project components."
          />

          <ComboDropdownField
            label="Vertical Components"
            value={verticalComponentValue}
            options={verticalComponentOptions}
            disabled={!canEditIssueFields}
            placeholder="Select or type a vertical component"
            onChange={setVerticalComponentValue}
            hint="Options come from the Vertical Components field on this issue type."
          />

          {issueType === "Bug" ? (
            <ComboDropdownField
              label="BUG Tracking"
              value={bugTrackingValue}
              options={bugTrackingOptions}
              disabled={!canEditIssueFields}
              placeholder="Select or type a bug tracking category"
              onChange={setBugTrackingValue}
              hint="Options come from the BUG Tracking field on Bugs."
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
              onChange={(e) => {
                setDescription(e.target.value);
                if (descriptionError) setDescriptionError("");
                if (standardsOverrideAvailable) {
                  setStandardsOverrideAvailable(false);
                  setOverrideDescriptionStandards(false);
                  setOverrideReason("");
                }
              }}
              placeholder={issueType === "Story"
                ? "Short overview, then bulleted development steps. Use AI Draft for ODI formatting."
                : issueType === "Bug"
                ? "Short overview, then bulleted steps to reproduce, troubleshooting, and fix approach."
                : `Short overview, then bulleted work items for this ${issueType.toLowerCase()}…`}
              style={{ width: "100%", padding: "0.5em 0.8em", border: "1px solid #e2e8f0", borderRadius: "6px", resize: "vertical", fontFamily: "inherit", fontSize: "0.9rem", lineHeight: 1.45, whiteSpace: "pre-wrap" }} />
            {descriptionError ? (
              <Message negative size="small" style={{ marginTop: "0.35rem", whiteSpace: "pre-wrap" }}>
                {descriptionError}
              </Message>
            ) : null}
            {standardsOverrideAvailable ? (
              <Message warning size="small" style={{ marginTop: "0.5rem" }}>
                <p style={{ margin: "0 0 0.45rem" }}>
                  {overrideReason === "clarification"
                    ? "AI Draft flagged this story as not fully defined — the situation, ask, or goal outcome is unclear. Answering the questions above and re-running AI Draft is recommended."
                    : "This description does not meet current ODI standards. Updating the description is recommended."}
                </p>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "0.45rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={overrideDescriptionStandards}
                    onChange={(e) => setOverrideDescriptionStandards(e.target.checked)}
                    style={{ marginTop: "0.2rem" }}
                  />
                  <span>
                    {overrideReason === "clarification"
                      ? "Create anyway — I understand this story's ask or outcome may not be fully defined."
                      : "Create anyway — I understand this description does not meet current ODI standards."}
                  </span>
                </label>
              </Message>
            ) : null}
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
                {useAiHelper
                  ? "Answer these in the guided questions above, then click AI Draft again."
                  : issueType === "Story"
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
          ) : suggestedSubtasks.length > 0 ? (
            <>
              <Form.Input label="Subtask assignee" placeholder="Display name or email (optional)"
                disabled={!canEditIssueFields}
                value={assignee} onChange={(_e, { value }) => setAssignee(value)} />
              <p style={{ fontSize: "0.78rem", color: "#94a3b8", margin: "0.25rem 0 0" }}>
                Applied to all checked subtasks. The story itself stays unassigned per ODI standards.
              </p>
            </>
          ) : (
            <p style={{ fontSize: "0.78rem", color: "#94a3b8", margin: 0 }}>
              Stories stay unassigned per ODI standards. Run AI Draft to add subtasks, then assign them here.
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
          <Button
            primary
            loading={submitting || creatingSubtasks}
            disabled={
              !canSubmit || (standardsOverrideAvailable && !overrideDescriptionStandards)
            }
            onClick={handleSubmit}
          >
            {standardsOverrideAvailable && overrideDescriptionStandards
              ? "Create anyway"
              : "Create"}
            {suggestedSubtasks.filter((s) => s.checked).length > 0
              ? ` + ${suggestedSubtasks.filter((s) => s.checked).length} subtask${suggestedSubtasks.filter((s) => s.checked).length !== 1 ? "s" : ""}`
              : ""}
          </Button>
        )}
      </Modal.Actions>
    </Modal>
  );
};

export default CreateIssueModal;
