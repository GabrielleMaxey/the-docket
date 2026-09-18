import CollapsibleSection from "../../../Components/CollapsibleSection";
import ContributorOverdueList from "./ContributorOverdueList";

const ContributorDueTasksSection = ({
  title,
  tasks,
  jiraBaseUrl,
  variant = "overdue",
  className = "",
  personKey = "",
}) => {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return null;
  }

  // Same CSS regardless of variant — past due and upcoming read as one visual pattern.
  const groupClass = "dashboard-contributor-due-group--overdue";

  const storageKey = personKey
    ? `contributor-due-${variant}-${personKey}`
    : null;

  return (
    <CollapsibleSection
      title={title}
      badge={`${tasks.length} item${tasks.length !== 1 ? "s" : ""}`}
      storageKey={storageKey}
      persistKeyPrefix="dashboard-collapse-"
      defaultOpen={false}
      className={`app-collapsible--compact dashboard-contributor-due-group ${groupClass} ${className}`.trim()}
    >
      <ContributorOverdueList tasks={tasks} jiraBaseUrl={jiraBaseUrl} variant={variant} layout="compact" />
    </CollapsibleSection>
  );
};

export default ContributorDueTasksSection;
