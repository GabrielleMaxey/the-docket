import React from "react";
import {
  Container,
  Segment,
  Card,
  Header,
  Icon,
  Button,
  Divider,
  Message,
} from "semantic-ui-react";
import "semantic-ui-css/semantic.min.css";
import "./workWeekTimerElements.css";
import JiraResultsTable from "./components/JiraResultsTable";
import TaskManagerHeaderPanel from "./components/TaskManagerHeaderPanel";
import { STATUS_OPTIONS, useTaskManagerJira } from "./hooks/useTaskManagerJira";

const TEN_MINUTES_MS = 10 * 60 * 1000;

const JOKE_FETCH_SOURCES = [
  {
    url: "https://icanhazdadjoke.com/",
    headers: { Accept: "application/json" },
    extract: (data) => String(data?.joke || "").trim(),
  },
  {
    url: "https://v2.jokeapi.dev/joke/Programming?safe-mode&type=single",
    headers: { Accept: "application/json" },
    extract: (data) => String(data?.joke || "").trim(),
  },
];

const JOKE_TICKER_ITEMS = [
  "Manager mode: turning coffee into completed tickets.",
  "I don't procrastinate, I run backlog grooming drills.",
  "My favorite cardio is sprint planning.",
  "Task juggling level: circus-grade project management.",
  "Current KPI: fewer tabs, more done.",
  "There are only two hard things in task management: estimation, prioritization, and remembering what the third one was.",
  "I closed three tabs today and called it workflow optimization.",
];

const shuffleItems = (items) => {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
};

const getCalendarCells = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < firstDayIndex; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

const REMINDERS_STORAGE_KEY = "workWeekTimerReminders";
const REMINDER_SLOT_COUNT = 4;

const defaultReminderRows = () =>
  Array.from({ length: REMINDER_SLOT_COUNT }, () => ({ text: "", done: false }));

const loadStoredReminders = () => {
  if (typeof window === "undefined") {
    return defaultReminderRows();
  }

  try {
    const raw = window.localStorage.getItem(REMINDERS_STORAGE_KEY);
    if (!raw) {
      return defaultReminderRows();
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return defaultReminderRows();
    }

    const next = defaultReminderRows();
    for (let index = 0; index < REMINDER_SLOT_COUNT; index += 1) {
      const item = parsed[index];
      if (item && typeof item === "object") {
        next[index] = {
          text: typeof item.text === "string" ? item.text : "",
          done: Boolean(item.done),
        };
      }
    }

    return next;
  } catch {
    return defaultReminderRows();
  }
};

const WorkWeekTimer = () => {
  const {
    jiraState,
    jiraApiMeta,
    jqlCount,
    jqlInputs,
    jqlLabels,
    jqlLoading,
    jqlRuns,
    showRestoredJqlBanner,
    jqlError,
    jqlMaxResults,
    jiraNotes,
    jiraRowPriorities,
    selectedForPush,
    lastPushedJiraNoteByKey,
    pushState,
    saveState,
    statusDrafts,
    assigneeDrafts,
    rowUpdateState,
    isClosedLikeStatus,
    clampPriority,
    getPriorityClass,
    getPriorityRowClass,
    formatDate,
    setJqlCount,
    setJqlMaxResults,
    handleJiraTest,
    handleJqlChange,
    handleJqlLabelChange,
    handleResetSavedQueries,
    handleRunJql,
    handlePushSelected,
    handleSaveMetadata,
    handleSelectAll,
    handleStatusDraftChange,
    handleStatusUpdate,
    handleAssigneeDraftChange,
    handleAssigneeUpdate,
    handleRowPriorityChange,
    handleNoteChange,
    handleSelectForPush,
    handlePushNote,
  } = useTaskManagerJira();

  const handleRunJqlRef = React.useRef(handleRunJql);
  React.useEffect(() => {
    handleRunJqlRef.current = handleRunJql;
  }, [handleRunJql]);

  React.useEffect(() => {
    const onKeyDown = (event) => {
      if ((!event.ctrlKey && !event.metaKey) || event.key !== "Enter") {
        return;
      }

      const target = event.target;
      const tagName =
        target && typeof target.tagName === "string" ? target.tagName.toLowerCase() : "";
      if (tagName === "textarea" || (target && target.isContentEditable)) {
        return;
      }

      event.preventDefault();
      if (!jqlLoading) {
        void handleRunJqlRef.current();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [jqlLoading]);

  const [jokeIndex, setJokeIndex] = React.useState(0);
  const [apiJokes, setApiJokes] = React.useState([]);
  const [reminders, setReminders] = React.useState(() => loadStoredReminders());

  const today = React.useMemo(() => new Date(), []);
  const todayDay = today.getDate();
  const monthLabel = today.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const fullDateLabel = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const calendarCells = React.useMemo(() => getCalendarCells(today), [today]);
  const tickerJokes = React.useMemo(() => {
    if (apiJokes.length === 0) {
      return JOKE_TICKER_ITEMS;
    }

    return [...apiJokes, ...JOKE_TICKER_ITEMS];
  }, [apiJokes]);

  const fetchApiJokes = React.useCallback(async () => {
    const nextApiJokes = [];

    for (const source of JOKE_FETCH_SOURCES) {
      try {
        const response = await fetch(source.url, { headers: source.headers });
        if (!response.ok) {
          continue;
        }

        const data = await response.json();
        const line = source.extract(data);
        if (line) {
          nextApiJokes.push(line);
        }
      } catch {
        // Keep static jokes when API is unavailable.
      }
    }

    setApiJokes(shuffleItems(nextApiJokes));
  }, []);

  React.useEffect(() => {
    fetchApiJokes();
  }, [fetchApiJokes]);

  React.useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchApiJokes();
      setJokeIndex((prev) => (prev + 1) % tickerJokes.length);
    }, TEN_MINUTES_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchApiJokes, tickerJokes.length]);

  React.useEffect(() => {
    setJokeIndex((prev) => (prev >= tickerJokes.length ? 0 : prev));
  }, [tickerJokes.length]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(reminders));
  }, [reminders]);

  const handleReminderTextChange = React.useCallback((index, value) => {
    setReminders((prev) => {
      const prevRow = prev[index];
      const prevTrim = String(prevRow.text).trim();
      const nextTrim = String(value).trim();
      const textMeaningChanged = nextTrim !== prevTrim;
      const clearDone = textMeaningChanged || nextTrim.length === 0;

      return prev.map((row, rowIndex) => {
        if (rowIndex !== index) {
          return row;
        }

        return {
          text: value,
          done: clearDone ? false : row.done,
        };
      });
    });
  }, []);

  const handleReminderDoneChange = React.useCallback((index, checked) => {
    setReminders((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, done: checked } : row))
    );
  }, []);

  return (
    <>
      <Container fluid className="work-week-page">
        <TaskManagerHeaderPanel
          tickerJokes={tickerJokes}
          jokeIndex={jokeIndex}
          fullDateLabel={fullDateLabel}
          monthLabel={monthLabel}
          calendarCells={calendarCells}
          todayDay={todayDay}
          reminders={reminders}
          onReminderTextChange={handleReminderTextChange}
          onReminderDoneChange={handleReminderDoneChange}
        />

        <Segment raised className="ww-segment">
          <Card.Content>
            <Header as="h2">
              <Icon name="tasks" />
              <Header.Content>Task Manager</Header.Content>
            </Header>
            <p className="ww-copy">
              Run saved JQL queries and manage Jira tasks.
            </p>
          </Card.Content>
          <Card.Content extra>
            <p className="ww-copy">
              Update status, assignee, priority, and notes.
            </p>
          </Card.Content>
          <Card.Content extra>
            <Button
              primary
              onClick={handleJiraTest}
              loading={jiraState.loading}
              disabled={jiraState.loading}
            >
              Test Jira Connection
            </Button>
            <p
              className={`ww-jira-status ${
                jiraState.success === false ? "ww-jira-error" : ""
              }`}
            >
              {jiraState.message}
            </p>
            {jiraApiMeta ? <p className="ww-jira-meta">{jiraApiMeta}</p> : null}
          </Card.Content>
          <Card.Content extra>
            <div className="ww-jql-controls">
              <label htmlFor="jql-count">JQL count:</label>
              <select
                id="jql-count"
                value={jqlCount}
                onChange={(event) => setJqlCount(Number(event.target.value))}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </div>

            {Array.from({ length: jqlCount }).map((_, index) => (
              <div key={`jql-input-${index}`} className="ww-jql-input-wrap">
                <div className="ww-jql-row-head">
                  <label htmlFor={`jql-label-${index}`}>
                    Label {index + 1}
                  </label>
                </div>
                <div className="ww-jql-row-inline">
                  <input
                    id={`jql-label-${index}`}
                    type="text"
                    value={jqlLabels[index]}
                    onChange={(event) =>
                      handleJqlLabelChange(index, event.target.value)
                    }
                    placeholder={`Label for JQL ${index + 1}`}
                  />
                </div>

                <input
                  id={`jql-${index}`}
                  type="text"
                  value={jqlInputs[index]}
                  onChange={(event) =>
                    handleJqlChange(index, event.target.value)
                  }
                  placeholder="project = ABC ORDER BY updated DESC"
                />
              </div>
            ))}

            <div className="ww-jql-maxresults">
              <label htmlFor="jql-max-results">Max results:</label>
              <input
                id="jql-max-results"
                type="number"
                min={1}
                max={1000}
                value={jqlMaxResults}
                onChange={(event) =>
                  setJqlMaxResults(
                    Math.max(1, Number(event.target.value) || 200),
                  )
                }
              />
            </div>
            <Button
              secondary
              onClick={handleRunJql}
              loading={jqlLoading}
              disabled={jqlLoading}
            >
              Run JQL
            </Button>
            <Button
              className="ww-reset-btn"
              onClick={handleResetSavedQueries}
              disabled={jqlLoading}
            >
              Reset Saved Queries
            </Button>

            {jqlError ? (
              <p className="ww-jira-status ww-jira-error">{jqlError}</p>
            ) : null}
            <p className="ww-jql-shortcut-hint">
              Tip: Press{" "}
              <kbd className="ww-kbd">Ctrl</kbd>+<kbd className="ww-kbd">Enter</kbd> or{" "}
              <kbd className="ww-kbd">⌘</kbd>+<kbd className="ww-kbd">Enter</kbd> to run or refresh
              JQL results.
            </p>
          </Card.Content>
        </Segment>

        {showRestoredJqlBanner && jqlRuns.length > 0 ? (
          <Message info className="ww-restored-jql-banner">
            <Message.Header>Showing saved results</Message.Header>
            <p className="ww-restored-jql-banner-copy">
              This table was restored from your last run (for example after a reload). Data may be
              out of date until you refresh from Jira.
            </p>
            <Button
              type="button"
              primary
              onClick={handleRunJql}
              loading={jqlLoading}
              disabled={jqlLoading}
            >
              Refresh results
            </Button>
          </Message>
        ) : null}

        <JiraResultsTable
          jqlRuns={jqlRuns}
          selectedForPush={selectedForPush}
          lastPushedJiraNoteByKey={lastPushedJiraNoteByKey}
          pushState={pushState}
          saveState={saveState}
          rowUpdateState={rowUpdateState}
          statusDrafts={statusDrafts}
          assigneeDrafts={assigneeDrafts}
          jiraRowPriorities={jiraRowPriorities}
          jiraNotes={jiraNotes}
          statusOptions={STATUS_OPTIONS}
          isClosedLikeStatus={isClosedLikeStatus}
          clampPriority={clampPriority}
          getPriorityClass={getPriorityClass}
          getPriorityRowClass={getPriorityRowClass}
          formatDate={formatDate}
          handlePushSelected={handlePushSelected}
          handleSaveMetadata={handleSaveMetadata}
          handleSelectAll={handleSelectAll}
          handleStatusDraftChange={handleStatusDraftChange}
          handleStatusUpdate={handleStatusUpdate}
          handleAssigneeDraftChange={handleAssigneeDraftChange}
          handleAssigneeUpdate={handleAssigneeUpdate}
          handleRowPriorityChange={handleRowPriorityChange}
          handleNoteChange={handleNoteChange}
          handleSelectForPush={handleSelectForPush}
          handlePushNote={handlePushNote}
        />
      </Container>
      <Divider />
    </>
  );
};

export default WorkWeekTimer;
