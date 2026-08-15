import React from "react";
import { JIRA_UNASSIGNED_ASSIGNEE, searchJiraUsers } from "../../../services/jiraClient";

const UNASSIGNED_SUGGESTION = {
  accountId: JIRA_UNASSIGNED_ASSIGNEE,
  displayName: "Unassigned",
  emailAddress: "",
  source: "system",
};

const matchesAssigneeQuery = (value, query) => {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return false;
  }

  return String(value || "").trim().toLowerCase().includes(normalizedQuery);
};

const AssigneeCell = ({
  issueKey,
  assignee,
  isClosedOrResolved,
  draftValue,
  knownAssignees,
  loading,
  confirmation,
  onDraftChange,
  onUpdate,
}) => {
  const [jiraSuggestions, setJiraSuggestions] = React.useState([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchError, setSearchError] = React.useState("");
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const debounceRef = React.useRef(null);
  const blurTimeoutRef = React.useRef(null);

  const committedValue = assignee === "Unassigned" ? "" : assignee;
  const inputValue = draftValue !== undefined ? draftValue : committedValue;
  const query = String(inputValue || "").trim();

  React.useEffect(() => {
    if (query.length < 2) {
      setJiraSuggestions([]);
      setSearchLoading(false);
      setSearchError("");
      return undefined;
    }

    clearTimeout(debounceRef.current);
    setSearchLoading(true);
    setSearchError("");

    debounceRef.current = setTimeout(() => {
      searchJiraUsers(query)
        .then((items) => {
          setJiraSuggestions(Array.isArray(items) ? items : []);
          setSearchError("");
        })
        .catch((error) => {
          setJiraSuggestions([]);
          setSearchError(error instanceof Error ? error.message : "User search failed");
        })
        .finally(() => setSearchLoading(false));
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const localSuggestions = React.useMemo(() => {
    if (query.length < 2) {
      return [];
    }

    return knownAssignees
      .map((name) => String(name || "").trim())
      .filter((name) => name && matchesAssigneeQuery(name, query));
  }, [knownAssignees, query]);

  const suggestionItems = React.useMemo(() => {
    const seen = new Set();
    const items = [];

    const addItem = (item) => {
      const displayName = String(item?.displayName || item || "").trim();
      if (!displayName) {
        return;
      }

      const key = item?.accountId || displayName.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);

      items.push({
        accountId: String(item?.accountId || "").trim(),
        displayName,
        emailAddress: String(item?.emailAddress || "").trim(),
        source: item?.source || (item?.accountId ? "jira" : "local"),
      });
    };

    addItem(UNASSIGNED_SUGGESTION);

    jiraSuggestions.forEach(addItem);
    localSuggestions.forEach((name) => addItem({ displayName: name }));

    return items;
  }, [jiraSuggestions, localSuggestions]);

  const openSuggestions = showSuggestions && !isClosedOrResolved;

  const handleFocus = () => {
    clearTimeout(blurTimeoutRef.current);
    setShowSuggestions(true);
  };

  const handleBlur = () => {
    blurTimeoutRef.current = setTimeout(() => setShowSuggestions(false), 150);
  };

  const handleInputChange = (event) => {
    onDraftChange(issueKey, event.target.value);
    setShowSuggestions(true);
  };

  const handleSelectSuggestion = (item) => {
    clearTimeout(blurTimeoutRef.current);
    onDraftChange(issueKey, item.displayName, item.accountId || undefined);
    setShowSuggestions(false);
  };

  const handleKeyDown = (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (!loading && !isClosedOrResolved) {
      onUpdate(issueKey);
    }
  };

  return (
    <>
      <div className={"ww-edit-cell ww-assignee-cell" + (isClosedOrResolved ? " ww-edit-disabled" : "")}>
        <div className="ww-assignee-input-wrap">
          <input
            className="ww-edit-input"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="Display name, email, or username"
            disabled={isClosedOrResolved}
            aria-label={`Assignee for ${issueKey}`}
            aria-expanded={openSuggestions}
            aria-controls={`assignee-suggestions-${issueKey}`}
            autoComplete="off"
          />
          {openSuggestions ? (
            <ul className="ww-assignee-suggestions" id={`assignee-suggestions-${issueKey}`} role="listbox">
              {searchLoading ? (
                <li className="ww-assignee-suggestion ww-assignee-suggestion--meta">Searching Jira…</li>
              ) : null}
              {!searchLoading && searchError ? (
                <li className="ww-assignee-suggestion ww-assignee-suggestion--meta">{searchError}</li>
              ) : null}
              {!searchLoading && !searchError && suggestionItems.length === 0 ? (
                <li className="ww-assignee-suggestion ww-assignee-suggestion--meta">No matching users</li>
              ) : null}
              {suggestionItems.map((item) => (
                <li key={`${issueKey}-${item.accountId || item.displayName}`}>
                  <button
                    type="button"
                    className={
                      "ww-assignee-suggestion" +
                      (item.source === "system" ? " ww-assignee-suggestion--unassigned" : "")
                    }
                    role="option"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelectSuggestion(item)}
                  >
                    <span className="ww-assignee-suggestion-name">{item.displayName}</span>
                    {item.emailAddress ? (
                      <span className="ww-assignee-suggestion-email">{item.emailAddress}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <button
          type="button"
          className="ww-inline-action-btn"
          onClick={() => onUpdate(issueKey)}
          disabled={loading || isClosedOrResolved}
        >
          Update Assignee
        </button>
      </div>
      {confirmation?.success ? <p className="ww-inline-success">✓ {confirmation.success}</p> : null}
      {confirmation?.error ? <p className="ww-inline-error">{confirmation.error}</p> : null}
    </>
  );
};

export default AssigneeCell;
