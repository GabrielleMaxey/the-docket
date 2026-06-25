import EpicMetricCard from "./EpicMetricCard";
import EpicMetricsSummary from "./EpicMetricsSummary";

const ProjectMetricsSection = ({
  snapshot,
  displayEpics,
  pastDueEpics,
  activeProjectTab,
  setActiveProjectTab,
  jiraBaseUrl,
  dueByDate,
  chartVariant,
}) => (
  <>
    <div className="dashboard-project-tabs">
      <button
        type="button"
        className={`dashboard-project-tab${activeProjectTab === "all" ? " is-active" : ""}`}
        onClick={() => setActiveProjectTab("all")}
      >
        <span className="dashboard-project-tab-name">View All</span>
        <span className="dashboard-project-tab-stat">{displayEpics.length} projects</span>
      </button>
      {snapshot.includePastDue && pastDueEpics.length > 0
        ? pastDueEpics.map((epic) => (
            <button
              key={`pd-${epic.id}`}
              type="button"
              className={`dashboard-project-tab is-pastdue${activeProjectTab === `pd-${epic.id}` ? " is-active" : ""}`}
              onClick={() => setActiveProjectTab(`pd-${epic.id}`)}
            >
              <span className="dashboard-project-tab-name">{epic.label}</span>
              <span className="dashboard-project-tab-stat">Past Due</span>
            </button>
          ))
        : null}
      {displayEpics.map((epic) => (
        <button
          key={epic.id}
          type="button"
          className={`dashboard-project-tab${activeProjectTab === String(epic.id) ? " is-active" : ""}`}
          onClick={() => setActiveProjectTab(String(epic.id))}
        >
          <span className="dashboard-project-tab-name">{epic.label}</span>
          <span className="dashboard-project-tab-stat">
            {Math.round(epic.issuePercent ?? 0)}% resolved
          </span>
        </button>
      ))}
    </div>

    {activeProjectTab === "all" ? (
      <>
        {snapshot.includePastDue && pastDueEpics.length > 0 ? (
          <>
            <p className="dashboard-subsection-label">Past Due</p>
            <div className="dashboard-epic-grid">
              {pastDueEpics.map((epic) => (
                <EpicMetricCard
                  key={`past-due-${epic.id}`}
                  epic={epic}
                  jiraBaseUrl={jiraBaseUrl}
                  dueByDate={dueByDate}
                  chartVariant={chartVariant}
                  includePastDue={snapshot.includePastDue}
                />
              ))}
            </div>
          </>
        ) : null}
        <EpicMetricsSummary epics={displayEpics} chartVariant={chartVariant} />
        <div className="dashboard-epic-grid">
          {displayEpics.map((epic) => (
            <EpicMetricCard
              key={epic.id}
              epic={epic}
              jiraBaseUrl={jiraBaseUrl}
              dueByDate={dueByDate}
              chartVariant={chartVariant}
              includePastDue={snapshot.includePastDue}
            />
          ))}
        </div>
      </>
    ) : activeProjectTab.startsWith("pd-") ? (
      (() => {
        const epic = pastDueEpics.find((e) => `pd-${e.id}` === activeProjectTab);
        if (!epic) return null;
        return (
          <>
            <EpicMetricsSummary epics={[epic]} chartVariant={chartVariant} />
            <EpicMetricCard
              epic={epic}
              jiraBaseUrl={jiraBaseUrl}
              dueByDate={dueByDate}
              chartVariant={chartVariant}
              includePastDue={snapshot.includePastDue}
            />
          </>
        );
      })()
    ) : (
      (() => {
        const epic = displayEpics.find((e) => String(e.id) === activeProjectTab);
        if (!epic) return null;
        return (
          <>
            <EpicMetricsSummary epics={[epic]} chartVariant={chartVariant} />
            <EpicMetricCard
              epic={epic}
              jiraBaseUrl={jiraBaseUrl}
              dueByDate={dueByDate}
              chartVariant={chartVariant}
              includePastDue={snapshot.includePastDue}
            />
          </>
        );
      })()
    )}
  </>
);

export default ProjectMetricsSection;
