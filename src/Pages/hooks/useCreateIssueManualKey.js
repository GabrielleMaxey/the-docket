import React from "react";
import { fetchEpicParentOptions, fetchJiraIssueSummary } from "../../services/jiraClient";
import {
  emptyManualKeyCheck,
  isValidOdiIssueKey,
  MANUAL_KEY_DEBOUNCE_MS,
  normalizeIssueKey,
  resolveManualKeyOutcome,
} from "../../../shared/createIssueParentUtils.mjs";

const useCreateIssueManualKey = ({
  open,
  enabled,
  inputValue,
  issueType,
  mode,
  onBeforeValidate,
  onInvalidFormat,
  onLoadEpicOptions,
  onDirectParent,
  onInvalidIssue,
  onNotFound,
  setLoadingParents,
}) => {
  const [check, setCheck] = React.useState(emptyManualKeyCheck);

  React.useEffect(() => {
    if (!open || !enabled) {
      return;
    }

    const key = normalizeIssueKey(inputValue);
    if (!isValidOdiIssueKey(key)) {
      setCheck(emptyManualKeyCheck());
      onInvalidFormat?.({ key, hasInput: Boolean(inputValue.trim()) });
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      onBeforeValidate?.();
      setLoadingParents(true);
      setCheck({ loading: true, valid: false, error: "", issue: null });

      try {
        const issue = await fetchJiraIssueSummary(key);
        if (cancelled) {
          return;
        }

        const outcome = resolveManualKeyOutcome({ issue, issueType, key, mode });
        if (outcome.kind === "load-epic-options") {
          const data = await fetchEpicParentOptions(outcome.epicKey);
          if (cancelled) {
            return;
          }
          setCheck({ loading: false, valid: true, error: "", issue: outcome.issue });
          onLoadEpicOptions?.({ epicKey: outcome.epicKey, parentOptions: data, issue: outcome.issue });
          return;
        }

        if (outcome.kind === "direct-parent") {
          setCheck({ loading: false, valid: true, error: "", issue: outcome.issue });
          onDirectParent?.(outcome);
          return;
        }

        setCheck({
          loading: false,
          valid: false,
          error: outcome.error,
          issue: outcome.issue,
        });
        onInvalidIssue?.(outcome);
      } catch (validateError) {
        if (!cancelled) {
          const message =
            validateError instanceof Error ? validateError.message : "Issue not found";
          setCheck({ loading: false, valid: false, error: message, issue: null });
          onNotFound?.(message);
        }
      } finally {
        if (!cancelled) {
          setLoadingParents(false);
        }
      }
    }, MANUAL_KEY_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    open,
    enabled,
    inputValue,
    issueType,
    mode,
    onBeforeValidate,
    onInvalidFormat,
    onLoadEpicOptions,
    onDirectParent,
    onInvalidIssue,
    onNotFound,
    setLoadingParents,
  ]);

  const resetCheck = React.useCallback(() => {
    setCheck(emptyManualKeyCheck());
  }, []);

  return { check, resetCheck, setCheck };
};

export default useCreateIssueManualKey;
