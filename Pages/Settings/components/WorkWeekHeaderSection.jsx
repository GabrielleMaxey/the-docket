import React from "react";
import { Form } from "semantic-ui-react";
import SettingsSection from "./SettingsSection";

const WorkWeekHeaderSection = ({ headerPrefs, setHeaderPrefs }) => (
  <SettingsSection
    title="Work Week header"
    description="Optional joke ticker and upcoming due-date banner at the top of Work Week."
  >
    <p style={{ fontSize: "0.85rem", color: "#475569", marginTop: 0 }}>
      The due-date banner uses the latest Dashboard snapshot, filtered to issues assigned to you
      (same upcoming-due window as Dashboard → Upcoming due). Refresh Dashboard after changing
      due-date filters.
    </p>
    <Form>
      <Form.Checkbox
        label="Show joke ticker"
        checked={headerPrefs.showJokeTicker}
        onChange={(_e, { checked }) => setHeaderPrefs((prev) => ({ ...prev, showJokeTicker: Boolean(checked) }))}
      />
      <Form.Checkbox
        label="Show my upcoming due dates banner (issues assigned to you)"
        checked={headerPrefs.showUpcomingDueBanner}
        onChange={(_e, { checked }) => setHeaderPrefs((prev) => ({ ...prev, showUpcomingDueBanner: Boolean(checked) }))}
      />
    </Form>
  </SettingsSection>
);

export default WorkWeekHeaderSection;
