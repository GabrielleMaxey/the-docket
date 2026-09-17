const DashboardTabs = ({ tabs, activeTab, onChange }) => (
  <div className="dashboard-tabs-strip" role="tablist">
    {tabs.map((tab) => (
      <button
        key={tab.key}
        type="button"
        role="tab"
        aria-selected={activeTab === tab.key}
        className={`dashboard-tab-btn${activeTab === tab.key ? " dashboard-tab-btn--active" : ""}`}
        onClick={() => onChange(tab.key)}
      >
        <span>{tab.label}</span>
        {tab.badge != null ? <span className="dashboard-tab-badge">{tab.badge}</span> : null}
      </button>
    ))}
  </div>
);

export default DashboardTabs;
