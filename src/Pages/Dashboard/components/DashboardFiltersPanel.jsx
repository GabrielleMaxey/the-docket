import React from "react";
import { Button, Message, Segment } from "semantic-ui-react";
import EpicFilterPanel from "../../components/EpicFilterPanel";
import DashboardRefreshActions from "./DashboardRefreshActions";
import {
  getDashboardRefreshLoadingHint,
  getDashboardRefreshStatusHint,
  resolveEffectiveRefreshScope,
  DEFAULT_DASHBOARD_VISIBLE_SECTIONS,
  inferUpcomingDuePreset,
  UPCOMING_DUE_DATE_PRESETS,
  UPCOMING_DUE_PRESET_CUSTOM,
  UPCOMING_DUE_PRESET_OFF,
  upcomingDueDateForPreset,
  DASHBOARD_AUTO_REFRESH_OPTIONS,
  getDashboardAutoRefreshHint,
} from "../utils/dashboardMetricsUtils";

const SelectorClear = ({ onClick, label = "Clear" }) => (
  <button type="button" className="dashboard-selector-clear" onClick={onClick}>
    {label}
  </button>
);

const DashboardFiltersPanel = ({
  presets,
  epicPresetsLoading,
  epicPresetsError,
  refreshError,
  selectedPresetIds,
  includePastDue,
  setSelectedPresetIds,
  selectAll,
  clearSelection,
  setIncludePastDue,
  personWatches,
  jqlWatches,
  selectedWatchedIds,
  setSelectedWatchedIds,
  setAssigneeNames,
  assigneeInput,
  setAssigneeInput,
  handleAddAssignee,
  handleRemoveAssignee,
  handleToggleWatched,
  assigneeNames,
  dueByDate,
  setDueByDate,
  dueByField,
  setDueByField,
  pastDueLookbackYears,
  setPastDueLookbackYears,
  visibleSections,
  setVisibleSections,
  toggleSection,
  chartVariant,
  setChartVariant,
  handleRefresh,
  handleCancelRefresh,
  refreshLoading,
  canSubmit,
  hasEpicScope,
  hasContributorScope,
  refreshFlash,
  autoRefreshInterval,
  setAutoRefreshInterval,
}) => {
  const isInternalDuePresetUpdate = React.useRef(false);
  const [upcomingPresetMode, setUpcomingPresetMode] = React.useState(() =>
    inferUpcomingDuePreset(dueByDate)
  );
  const showUpcomingCustomDate = upcomingPresetMode === UPCOMING_DUE_PRESET_CUSTOM;

  React.useEffect(() => {
    if (isInternalDuePresetUpdate.current) {
      isInternalDuePresetUpdate.current = false;
      return;
    }

    setUpcomingPresetMode((previous) => {
      if (previous === UPCOMING_DUE_PRESET_CUSTOM) {
        return previous;
      }

      return inferUpcomingDuePreset(dueByDate);
    });
  }, [dueByDate]);

  const handleUpcomingPresetChange = (presetId) => {
    isInternalDuePresetUpdate.current = true;
    setUpcomingPresetMode(presetId);

    if (presetId === UPCOMING_DUE_PRESET_OFF) {
      setDueByDate("");
      return;
    }

    if (presetId === UPCOMING_DUE_PRESET_CUSTOM) {
      setDueByDate(dueByDate || upcomingDueDateForPreset("30d"));
      return;
    }

    setDueByDate(upcomingDueDateForPreset(presetId));
  };

  const clearPastDueOptions = () => {
    setIncludePastDue(false);
    setPastDueLookbackYears(1);
  };

  const clearUpcomingOptions = () => {
    isInternalDuePresetUpdate.current = true;
    setUpcomingPresetMode(UPCOMING_DUE_PRESET_OFF);
    setDueByDate("");
  };

  const clearCompareAgainst = () => {
    setDueByField("most_recent_done_date");
  };

  const clearViews = () => {
    setVisibleSections(DEFAULT_DASHBOARD_VISIBLE_SECTIONS);
  };

  const clearChartStyle = () => {
    setChartVariant("pie");
  };

  return (
    <Segment>
      <EpicFilterPanel
        presets={presets}
        loading={epicPresetsLoading}
        error={epicPresetsError || refreshError}
        selectedPresetIds={selectedPresetIds}
        includePastDue={includePastDue}
        onSelectionChange={setSelectedPresetIds}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
        onIncludePastDueChange={setIncludePastDue}
        showRunButton={false}
        showPastDue={false}
        title="1 — Select projects"
        description="Choose one or more saved Epic & JQL presets. Each preset is a named Jira query that loads a set of tasks. Add or edit presets in Settings → Epic & JQL presets."
      />

      <div className="dashboard-controls-divider" style={{ marginTop: "0.75rem" }} />

      <div className="dashboard-filter-extra">
        <p className="dashboard-optional-filters-label">2 — Optional due-date views</p>

        <div className="dashboard-due-by-field-row dashboard-due-by-field-row--inline">
          <span className="dashboard-due-by-field-label">Also include</span>
          <div className="dashboard-due-by-inline-group">
            <label className="dashboard-due-by-field-option">
              <input
                type="checkbox"
                checked={includePastDue}
                onChange={(e) => setIncludePastDue(e.target.checked)}
              />
              Past Due Projects
            </label>
            <span className="dashboard-due-by-inline-separator">Show past due</span>
            {[1, 2, 3].map((years) => (
              <label key={years} className="dashboard-due-by-field-option">
                <input
                  type="radio"
                  name="pastDueLookbackYears"
                  value={years}
                  checked={pastDueLookbackYears === years}
                  disabled={!includePastDue}
                  onChange={() => setPastDueLookbackYears(years)}
                />
                Last {years} year{years !== 1 ? "s" : ""}
              </label>
            ))}
            <SelectorClear onClick={clearPastDueOptions} />
          </div>
          <span className="dashboard-due-by-hint" style={{ marginTop: 0 }}>
            Past due options apply only when Past Due Projects is checked — they add missed-deadline
            project cards and past due rows to the due-date list.
          </span>
        </div>

        <div className="dashboard-due-by-field-row">
          <span className="dashboard-due-by-field-label">Show upcoming due dates</span>
          <label className="dashboard-due-by-field-option">
            <input
              type="radio"
              name="upcomingDuePreset"
              value={UPCOMING_DUE_PRESET_OFF}
              checked={upcomingPresetMode === UPCOMING_DUE_PRESET_OFF}
              onChange={() => handleUpcomingPresetChange(UPCOMING_DUE_PRESET_OFF)}
            />
            None
          </label>
          {UPCOMING_DUE_DATE_PRESETS.map((preset) => (
            <label key={preset.id} className="dashboard-due-by-field-option">
              <input
                type="radio"
                name="upcomingDuePreset"
                value={preset.id}
                checked={upcomingPresetMode === preset.id}
                onChange={() => handleUpcomingPresetChange(preset.id)}
              />
              {preset.label}
            </label>
          ))}
          <label className="dashboard-due-by-field-option dashboard-due-by-field-option--custom">
            <input
              type="radio"
              name="upcomingDuePreset"
              value={UPCOMING_DUE_PRESET_CUSTOM}
              checked={upcomingPresetMode === UPCOMING_DUE_PRESET_CUSTOM}
              onChange={() => handleUpcomingPresetChange(UPCOMING_DUE_PRESET_CUSTOM)}
            />
            Through custom date
            {showUpcomingCustomDate ? (
              <input
                id="dashboard-upcoming-due-date"
                type="date"
                className="dashboard-due-by-input dashboard-due-by-input--inline"
                value={dueByDate}
                onChange={(event) => setDueByDate(event.target.value)}
              />
            ) : null}
          </label>
          <SelectorClear onClick={clearUpcomingOptions} />
          <span className="dashboard-due-by-hint" style={{ marginTop: 0 }}>
            Upcoming lists show only future due dates unless Past Due Projects is also enabled above.
          </span>
        </div>

        {dueByDate ? (
          <div className="dashboard-due-by-field-row">
            <span className="dashboard-due-by-field-label">Compare against</span>
            <label className="dashboard-due-by-field-option">
              <input
                type="radio"
                name="dueByField"
                value="due_date"
                checked={dueByField === "due_date"}
                onChange={() => setDueByField("due_date")}
              />
              Task due date
            </label>
            <label className="dashboard-due-by-field-option">
              <input
                type="radio"
                name="dueByField"
                value="most_recent_done_date"
                checked={dueByField === "most_recent_done_date"}
                onChange={() => setDueByField("most_recent_done_date")}
              />
              Most Recent Done Date
            </label>
            <label className="dashboard-due-by-field-option">
              <input
                type="radio"
                name="dueByField"
                value="initial_done_date"
                checked={dueByField === "initial_done_date"}
                onChange={() => setDueByField("initial_done_date")}
              />
              Initial Done Date
            </label>
            <SelectorClear onClick={clearCompareAgainst} />
          </div>
        ) : null}
      </div>

      <div className="dashboard-controls-divider" />

      <div className="dashboard-people-section">
        <p className="dashboard-watch-group-label">
          3 — Contributor Metrics
          {(selectedWatchedIds.length > 0 || assigneeNames.length > 0) ? (
            <button
              type="button"
              onClick={() => {
                setSelectedWatchedIds([]);
                setAssigneeNames([]);
                setAssigneeInput("");
              }}
              style={{
                marginLeft: "0.6rem",
                fontSize: "0.72rem",
                fontWeight: 400,
                textTransform: "none",
                border: "1px solid #cbd5e1",
                borderRadius: "999px",
                padding: "0.1rem 0.5rem",
                background: "#f1f5f9",
                color: "#64748b",
                cursor: "pointer",
              }}
            >
              Clear all
            </button>
          ) : null}
        </p>
        <p style={{ fontSize: "0.78rem", color: "#64748b", margin: "0 0 0.5rem" }}>
          Optional — choose people or custom JQL queries for the{" "}
          <strong>Individual Contributor Metrics</strong> section. Person watches use full assignee
          workload; JQL watches render as a project contributor card with per-person breakdown.
        </p>
        {personWatches.length > 0 || jqlWatches.length > 0 ? (
          <div className="dashboard-watched-chips">
            {personWatches.map((person) => (
              <Button
                key={person.id}
                size="mini"
                primary={selectedWatchedIds.includes(person.id)}
                basic={!selectedWatchedIds.includes(person.id)}
                onClick={() => handleToggleWatched(person.id)}
              >
                {person.displayName}
              </Button>
            ))}
            {jqlWatches.map((watch) => (
              <Button
                key={watch.id}
                size="mini"
                primary={selectedWatchedIds.includes(watch.id)}
                basic={!selectedWatchedIds.includes(watch.id)}
                onClick={() => handleToggleWatched(watch.id)}
                title={watch.jql}
              >
                {watch.displayName}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="dashboard-assignee-input-row">
          <input
            type="text"
            value={assigneeInput}
            onChange={(event) => setAssigneeInput(event.target.value)}
            placeholder="Add by display name, email, or pick from list"
            list="dashboard-people-datalist"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAddAssignee();
              }
            }}
          />
          <datalist id="dashboard-people-datalist">
            {personWatches.map((person) => (
              <option key={`w-${person.id}`} value={person.displayName} />
            ))}
          </datalist>
          <Button size="small" onClick={handleAddAssignee} disabled={!assigneeInput.trim()}>
            Add
          </Button>
        </div>
        {assigneeNames.length > 0 ? (
          <div className="dashboard-selected-names">
            {assigneeNames.map((name) => (
              <span key={name} className="dashboard-name-chip">
                {name}
                <button
                  type="button"
                  className="dashboard-name-chip-remove"
                  onClick={() => handleRemoveAssignee(name)}
                  aria-label={`Remove ${name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="dashboard-controls-divider" />

      <div className="dashboard-filter-extra dashboard-filter-extra--views">
        <div className="dashboard-section-toggle-row">
          <span className="dashboard-due-by-label">Views</span>
          {[
            { key: "overall", label: "Overall Status" },
            { key: "epicMetrics", label: "Project Metrics" },
            { key: "dueByUpcoming", label: "Upcoming Due Dates" },
            { key: "dueByPastDue", label: "Past Due in lookback" },
            { key: "overdue", label: "Contributor Metrics" },
            { key: "report", label: "Report" },
          ].map(({ key, label }) => (
            <label key={key} className="dashboard-section-toggle-label">
              <input
                type="checkbox"
                checked={Boolean(visibleSections[key])}
                onChange={() => toggleSection(key)}
              />
              {label}
            </label>
          ))}
          <SelectorClear onClick={clearViews} />
        </div>

        <div className="dashboard-section-toggle-row">
          <span className="dashboard-due-by-label">Chart style</span>
          <label className="dashboard-section-toggle-label">
            <input
              type="radio"
              name="chartVariant"
              value="pie"
              checked={chartVariant === "pie"}
              onChange={() => setChartVariant("pie")}
            />
            Pie
          </label>
          <label className="dashboard-section-toggle-label">
            <input
              type="radio"
              name="chartVariant"
              value="bar"
              checked={chartVariant === "bar"}
              onChange={() => setChartVariant("bar")}
            />
            Vertical bars
          </label>
          <SelectorClear onClick={clearChartStyle} />
        </div>
      </div>

      <div className="dashboard-section-toggle-row">
        <span className="dashboard-due-by-label">Auto-refresh</span>
        {DASHBOARD_AUTO_REFRESH_OPTIONS.map(({ value, label }) => (
          <label key={value} className="dashboard-section-toggle-label">
            <input
              type="radio"
              name="dashboardAutoRefresh"
              value={value}
              checked={autoRefreshInterval === value}
              onChange={() => setAutoRefreshInterval(value)}
            />
            {label}
          </label>
        ))}
      </div>
      <p className="dashboard-auto-refresh-hint">{getDashboardAutoRefreshHint(autoRefreshInterval)}</p>

      <DashboardRefreshActions
        onRefresh={handleRefresh}
        onCancel={handleCancelRefresh}
        loading={refreshLoading}
        canSubmit={canSubmit}
        submitLabel="Refresh status"
        loadingHint={getDashboardRefreshLoadingHint(
          hasEpicScope || hasContributorScope
            ? resolveEffectiveRefreshScope({ hasEpicScope, hasContributorScope })
            : "all"
        )}
        hint={getDashboardRefreshStatusHint({ hasEpicScope, hasContributorScope })}
        flash={refreshFlash}
      />
    </Segment>
  );
};

export default DashboardFiltersPanel;
