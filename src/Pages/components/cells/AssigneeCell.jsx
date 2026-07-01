import React from "react";
import { searchJiraUsers } from "../../../services/jiraClient";

const AssigneeCell = ({
  issueKey,
  assignee,
  isClosedOrResolved,
  draftValue,
  datalistId,
  knownAssignees,
  loading,
  confirmation,
  onDraftChange,
  onUpdate,
}) => {
  const [jiraSuggestions, setJiraSuggestions] = React.useState([]);
  const debounceRef = React.useRef(null);

  React.useEffect(() => {
    const query = String(draftValue || "").trim();
    if (query.length < 2) {
      setJiraSuggestions([]);
      return undefined;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchJiraUsers(query)
        .then((items) => setJiraSuggestions(items))
        .catch(() => setJiraSuggestions([]));
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [draftValue]);

  const optionValues = React.useMemo(() => {
    const values = new Set(
      [...knownAssignees, ...jiraSuggestions.map((item) => item.displayName)]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    );
    return [...values];
  }, [knownAssignees, jiraSuggestions]);

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
    <td>
      <div className={"ww-edit-cell" + (isClosedOrResolved ? " ww-edit-disabled" : "")}>
        <input
          list={datalistId}
          className="ww-edit-input"
          value={draftValue ?? assignee}
          onChange={(event) => onDraftChange(issueKey, event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Display name, email, or username"
          disabled={isClosedOrResolved}
          aria-label={`Assignee for ${issueKey}`}
        />
        <button
          type="button"
          className="ww-inline-action-btn"
          onClick={() => onUpdate(issueKey)}
          disabled={loading || isClosedOrResolved}
        >
          Update Assignee
        </button>
      </div>
      <datalist id={datalistId}>
        {optionValues.map((name) => (
          <option key={datalistId + "-" + name} value={name} />
        ))}
      </datalist>
      {confirmation?.success ? <p className="ww-inline-success">✓ {confirmation.success}</p> : null}
      {confirmation?.error ? <p className="ww-inline-error">{confirmation.error}</p> : null}
    </td>
  );
};

export default AssigneeCell;
