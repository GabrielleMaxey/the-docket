import { Button, Message } from "semantic-ui-react";

const DashboardRefreshActions = ({
  onRefresh,
  onCancel,
  loading,
  canSubmit,
  submitLabel = "Refresh",
  hint,
  loadingHint,
  flash,
}) => (
  <div className="dashboard-section-refresh-row">
    <Button primary onClick={onRefresh} loading={loading} disabled={!canSubmit}>
      {submitLabel}
    </Button>
    {loading && onCancel ? (
      <Button basic onClick={onCancel}>
        Cancel
      </Button>
    ) : null}
    {loading && loadingHint ? (
      <span className="dashboard-submit-hint">{loadingHint}</span>
    ) : hint ? (
      <span className="dashboard-submit-hint">{hint}</span>
    ) : null}
    {flash ? (
      <Message positive size="mini" style={{ marginTop: "0.5rem", width: "100%" }}>
        ✓ {flash}
      </Message>
    ) : null}
  </div>
);

export default DashboardRefreshActions;
