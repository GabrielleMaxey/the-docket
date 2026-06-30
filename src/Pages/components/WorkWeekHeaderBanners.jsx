import React from "react";
import { Link } from "react-router-dom";
import { buildWorkWeekHref } from "../../utils/workWeekNavigation.js";

const WorkWeekHeaderBanners = ({
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
}) => {
  const showBannerArea = showJokeTicker || showUpcomingDueBanner;

  return (
    <div className="ww-header-banner-wrap">
      <div className="ww-header-banner-controls">
        <span className="ww-header-banner-controls-label">Header banners</span>
        <label className="ww-header-banner-toggle">
          <input
            type="checkbox"
            checked={showJokeTicker}
            onChange={(event) => onShowJokeTickerChange(event.target.checked)}
          />
          Joke ticker
        </label>
        <label className="ww-header-banner-toggle">
          <input
            type="checkbox"
            checked={showUpcomingDueBanner}
            onChange={(event) => onShowUpcomingDueBannerChange(event.target.checked)}
          />
          My upcoming due dates
        </label>
      </div>

      {showBannerArea ? (
        <div className="ww-header-banners">
          {showJokeTicker ? (
            <div className="ww-header-banner ww-header-banner--joke" role="status" aria-live="polite">
              <span className="ww-header-banner-prefix">Office Joke Ticker:</span>
              <span className="ww-header-banner-text">
                {tickerJokes[jokeIndex % tickerJokes.length]}
              </span>
            </div>
          ) : null}

          {showUpcomingDueBanner ? (
            <div className="ww-header-banner ww-header-banner--due-dates" role="region" aria-label="My upcoming due dates">
              <div className="ww-header-banner-due-head">
                <span className="ww-header-banner-prefix">My upcoming due dates</span>
                {dueByDate ? (
                  <span className="ww-header-banner-due-window">through {dueByDate}</span>
                ) : null}
                {currentUserDisplayName ? (
                  <span className="ww-header-banner-due-user">for {currentUserDisplayName}</span>
                ) : null}
              </div>

              {dueBannerLoading ? (
                <p className="ww-header-banner-due-status">Loading your upcoming tasks…</p>
              ) : dueBannerError ? (
                <p className="ww-header-banner-due-status ww-header-banner-due-status--error">
                  {dueBannerError}
                </p>
              ) : upcomingIssues.length === 0 ? (
                <p className="ww-header-banner-due-status">
                  No upcoming tasks assigned to you in the current Dashboard due-date window.{" "}
                  <Link to="/dashboard">Refresh Dashboard</Link> to update.
                </p>
              ) : (
                <ul className="ww-header-banner-due-list">
                  {upcomingIssues.map((issue) => {
                    const issueKey = String(issue.key || "").trim();
                    const summary = String(issue.summary || "").trim() || "(no summary)";
                    return (
                      <li key={issueKey || summary} className="ww-header-banner-due-item">
                        <Link to={buildWorkWeekHref({ key: issueKey })} className="ww-header-banner-due-key">
                          {issueKey || "Issue"}
                        </Link>
                        <span className="ww-header-banner-due-summary">{summary}</span>
                        {issue.dueDate ? (
                          <span className="ww-header-banner-due-date">due {issue.dueDate}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default WorkWeekHeaderBanners;
