import React from "react";
import { Grid, Segment } from "semantic-ui-react";
import WorkWeekHeaderBanners from "./WorkWeekHeaderBanners";
import { usePersistedState } from "../hooks/usePersistedState";

const TODAY_DETAILS_COLLAPSE_KEY = "ww-today-details-open";

const PRIORITY_LABELS = {
  1: "P1 – Highest",
  2: "P2 – High",
  3: "P3 – Medium",
  4: "P4 – Low",
  5: "P5 – Lowest",
};

const TaskManagerHeaderPanel = ({
  showJokeTicker,
  showUpcomingDueBanner,
  onShowJokeTickerChange,
  onShowUpcomingDueBannerChange,
  tickerJokes,
  jokeIndex,
  dueBannerLoading,
  dueBannerError,
  dueByDate,
  upcomingIssues,
  currentUserDisplayName,
  fullDateLabel,
  monthLabel,
  calendarCells,
  todayDay,
  todos,
  todosError,
  canAddTodo,
  onTodoTextChange,
  onTodoPriorityChange,
  onTodoDueDateChange,
  onTodoDoneChange,
  onTodoDelete,
  onTodoAdd,
  weeklyPlanPanel,
}) => {
  const [detailsOpen, setDetailsOpen] = usePersistedState(TODAY_DETAILS_COLLAPSE_KEY, true);

  return (
    <>
      <WorkWeekHeaderBanners
        showJokeTicker={showJokeTicker}
        showUpcomingDueBanner={showUpcomingDueBanner}
        onShowJokeTickerChange={onShowJokeTickerChange}
        onShowUpcomingDueBannerChange={onShowUpcomingDueBannerChange}
        tickerJokes={tickerJokes}
        jokeIndex={jokeIndex}
        dueBannerLoading={dueBannerLoading}
        dueBannerError={dueBannerError}
        dueByDate={dueByDate}
        upcomingIssues={upcomingIssues}
        currentUserDisplayName={currentUserDisplayName}
      />

      <Grid columns={1} stackable>
        <Grid.Row>
          <Grid.Column>
            <Segment className="ww-date-calendar-segment">
              <div className="ww-date-block">
                <p className="ww-date-label">Today</p>
                <p className="ww-date-value">{fullDateLabel}</p>
                <button
                  type="button"
                  className="ww-date-toggle"
                  onClick={() => setDetailsOpen((open) => !open)}
                  aria-expanded={detailsOpen}
                >
                  {detailsOpen ? "Hide calendar & to do" : "Show calendar & to do"}
                  <span className={`ww-date-toggle-chevron${detailsOpen ? " open" : ""}`}>›</span>
                </button>
              </div>

              {detailsOpen ? (
                <>
                  <div className="ww-calendar-block">
                    <p className="ww-calendar-month">{monthLabel}</p>
                    <div className="ww-calendar-weekdays">
                      {["S", "M", "T", "W", "T", "F", "S"].map((letter, idx) => (
                        <span key={`weekday-${letter}-${idx}`}>{letter}</span>
                      ))}
                    </div>
                    <div className="ww-calendar-grid">
                      {calendarCells.map((day, idx) => {
                        const isToday = day === todayDay;
                        return (
                          <span
                            key={`calendar-day-${idx}`}
                            className={`ww-calendar-cell ${isToday ? "ww-calendar-today" : ""}`}
                          >
                            {day || ""}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="ww-reminders-block">
                    <p className="ww-reminders-label">To Do</p>
                    {todosError ? (
                      <p className="ww-todo-error">{todosError}</p>
                    ) : null}
                    <ul className="ww-reminders-list">
                      {(todos || []).map((row) => (
                        <li
                          key={row._index}
                          className={`ww-reminder-row ww-todo-row${row.done ? " ww-reminder-row-done" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="ww-reminder-check"
                            checked={row.done}
                            onChange={(e) => onTodoDoneChange(row._index, e.target.checked)}
                            disabled={!String(row.text || "").trim()}
                            title={
                              !String(row.text || "").trim()
                                ? "Enter a to do before marking it done."
                                : undefined
                            }
                            aria-label={`To do ${row._index + 1} done`}
                          />
                          <input
                            type="text"
                            className="ww-reminder-input ww-todo-text"
                            value={row.text}
                            onChange={(e) => onTodoTextChange(row._index, e.target.value)}
                            placeholder="To do…"
                            aria-label={`To do ${row._index + 1} text`}
                            disabled={row.done}
                          />
                          <select
                            className="ww-todo-priority"
                            value={row.priority}
                            onChange={(e) => onTodoPriorityChange(row._index, e.target.value)}
                            aria-label={`To do ${row._index + 1} priority`}
                            disabled={row.done}
                          >
                            {[1, 2, 3, 4, 5].map((p) => (
                              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                            ))}
                          </select>
                          <input
                            type="date"
                            className="ww-todo-due"
                            value={row.dueDate || ""}
                            onChange={(e) => onTodoDueDateChange(row._index, e.target.value)}
                            aria-label={`To do ${row._index + 1} due date`}
                            disabled={row.done}
                          />
                          <button
                            type="button"
                            className="ww-todo-delete"
                            onClick={() => onTodoDelete(row._index)}
                            aria-label={`Delete to do ${row._index + 1}`}
                            title="Delete"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>

                    {canAddTodo ? (
                      <button
                        type="button"
                        className="ww-todo-add"
                        onClick={onTodoAdd}
                      >
                        + Add to do
                      </button>
                    ) : null}

                    {weeklyPlanPanel ? (
                      <div className="ww-weekly-plan-block">{weeklyPlanPanel}</div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </Segment>
          </Grid.Column>
        </Grid.Row>
      </Grid>
    </>
  );
};

export default TaskManagerHeaderPanel;
