import ContributorOverdueList from "./ContributorOverdueList";

const ContributorDueTasksSection = ({
  title,
  tasks,
  jiraBaseUrl,
  variant = "overdue",
  className = "",
}) => {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return null;
  }

  const groupClass =
    variant === "upcoming"
      ? "dashboard-contributor-due-group--upcoming"
      : "dashboard-contributor-due-group--overdue";

  return (
    <div className={`dashboard-contributor-due-group ${groupClass} ${className}`.trim()}>
      <div className="dashboard-contributor-due-header">
        <span className="dashboard-contributor-due-title">{title}</span>
        <span className="dashboard-contributor-due-count">
          {tasks.length} item{tasks.length !== 1 ? "s" : ""}
        </span>
      </div>
      <ContributorOverdueList tasks={tasks} jiraBaseUrl={jiraBaseUrl} variant={variant} />
    </div>
  );
};

export default ContributorDueTasksSection;
