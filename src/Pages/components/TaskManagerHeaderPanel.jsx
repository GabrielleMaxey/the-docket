import React from "react";
import { Grid, Segment } from "semantic-ui-react";

const TaskManagerHeaderPanel = ({
  tickerJokes,
  jokeIndex,
  fullDateLabel,
  monthLabel,
  calendarCells,
  todayDay,
  reminders,
  onReminderTextChange,
  onReminderDoneChange,
}) => {
  return (
    <>
      <div className="ww-joke-ticker" role="status" aria-live="polite">
        <span className="ww-joke-prefix">Office Joke Ticker:</span>
        <span className="ww-joke-text">{tickerJokes[jokeIndex % tickerJokes.length]}</span>
      </div>

      <Grid columns={1} stackable>
        <Grid.Row>
          <Grid.Column>
            <Segment className="ww-date-calendar-segment">
              <div className="ww-date-block">
                <p className="ww-date-label">Today</p>
                <p className="ww-date-value">{fullDateLabel}</p>
              </div>

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
                <p className="ww-reminders-label">Reminders</p>
                <ul className="ww-reminders-list">
                  {reminders.map((row, index) => (
                    <li
                      key={`reminder-${index}`}
                      className={`ww-reminder-row ${row.done ? "ww-reminder-row-done" : ""}`}
                    >
                      <label className="ww-reminder-label">
                        <input
                          type="checkbox"
                          className="ww-reminder-check"
                          checked={row.done}
                          onChange={(event) => onReminderDoneChange(index, event.target.checked)}
                          disabled={!String(row.text || "").trim()}
                          title={
                            !String(row.text || "").trim()
                              ? "Enter a reminder before marking it done."
                              : undefined
                          }
                          aria-label={`Reminder ${index + 1} done`}
                        />
                        <input
                          type="text"
                          className="ww-reminder-input"
                          value={row.text}
                          onChange={(event) => onReminderTextChange(index, event.target.value)}
                          placeholder={`Reminder ${index + 1}`}
                          aria-label={`Reminder ${index + 1} text`}
                        />
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            </Segment>
          </Grid.Column>
        </Grid.Row>
      </Grid>
    </>
  );
};

export default TaskManagerHeaderPanel;
