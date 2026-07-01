import React from "react";
import { Button, Container, Header, Message, Segment } from "semantic-ui-react";
import "semantic-ui-css/semantic.min.css";
import {
  fetchAppSettings,
  fetchChatStatus,
  fetchFieldMappings,
  fetchJiraFields,
  fetchWatchedAssignees,
  testJiraConnection,
} from "../../services/jiraClient.js";
import { getApiBase } from "../../services/apiBase.js";
import { useWorkWeekHeaderPreferences } from "../hooks/useWorkWeekHeaderPreferences.js";
import { useEpicFilters } from "../../context/EpicFiltersContext.jsx";
import PresetsSection from "./components/PresetsSection";
import DateFieldsSection from "./components/DateFieldsSection";
import MetricTargetsSection from "./components/MetricTargetsSection";
import WorkWeekHeaderSection from "./components/WorkWeekHeaderSection";
import ChatAssistantSection from "./components/ChatAssistantSection";

const Settings = () => {
  // Presets come from the shared context — mutations call reloadPresets so
  // the updated list is immediately visible on Work Week and Dashboard too.
  const { presets: epicPresets, reloadPresets } = useEpicFilters();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [fieldMappings, setFieldMappings] = React.useState([]);
  const [jiraFields, setJiraFields] = React.useState([]);
  const [settings, setSettings] = React.useState({ epic_past_due_mode: "either", proxy_url: "", chat_custom_instructions: "" });
  const [watchedAssignees, setWatchedAssignees] = React.useState([]);
  const [chatStatus, setChatStatus] = React.useState(null);
  const [headerPrefs, setHeaderPrefs] = useWorkWeekHeaderPreferences();

  const [jiraConnStatus, setJiraConnStatus] = React.useState(null);
  const [jiraConnMessage, setJiraConnMessage] = React.useState("");

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [mappings, appSettings, watched, fields, chat] = await Promise.all([
        fetchFieldMappings(),
        fetchAppSettings(),
        fetchWatchedAssignees(),
        fetchJiraFields().catch(() => []),
        fetchChatStatus().catch(() => null),
      ]);
      setFieldMappings(mappings);
      setSettings({
        epic_past_due_mode: appSettings.epic_past_due_mode || "either",
        proxy_url: appSettings.proxy_url || getApiBase(),
        chat_custom_instructions: appSettings.chat_custom_instructions || "",
      });
      setWatchedAssignees(watched);
      setJiraFields(fields);
      setChatStatus(chat);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void loadAll(); }, [loadAll]);

  const handleTestJiraConnection = async () => {
    setJiraConnStatus("loading");
    setJiraConnMessage("");
    try {
      const data = await testJiraConnection();
      const name = data?.displayName || data?.emailAddress || "Connected";
      setJiraConnMessage(`✓ Connected as ${name}`);
      setJiraConnStatus("ok");
    } catch (err) {
      setJiraConnMessage(err instanceof Error ? err.message : "Connection failed");
      setJiraConnStatus("error");
    }
  };

  if (loading) {
    return (
      <Container style={{ marginTop: "1.5rem" }}>
        <Message info>Loading settings…</Message>
      </Container>
    );
  }

  return (
    <Container style={{ marginTop: "1.5rem", marginBottom: "2rem", maxWidth: "1500px", width: "100%", paddingLeft: "1rem", paddingRight: "1rem" }}>
      <Header as="h1">Settings</Header>
      <p>Manage epic presets, Jira date field mappings, past-due rules, and contributor metrics.</p>

      {error ? <Message negative content={error} /> : null}

      <Segment>
        <Header as="h2">Jira connection</Header>
        <p>Verify that the API credentials in <code>.env</code> are working before changing other settings.</p>
        <Button primary onClick={handleTestJiraConnection} loading={jiraConnStatus === "loading"} disabled={jiraConnStatus === "loading"}>
          Test Jira Connection
        </Button>
        {jiraConnMessage ? (
          <Message positive={jiraConnStatus === "ok"} negative={jiraConnStatus === "error"} size="small" style={{ marginTop: "0.75rem" }}>
            {jiraConnMessage}
          </Message>
        ) : null}
      </Segment>

      <PresetsSection epicPresets={epicPresets} onPresetsChanged={reloadPresets} onError={setError} />

      <DateFieldsSection
        fieldMappings={fieldMappings} setFieldMappings={setFieldMappings}
        jiraFields={jiraFields} setJiraFields={setJiraFields}
        settings={settings} setSettings={setSettings}
        onError={setError}
      />

      <MetricTargetsSection watchedAssignees={watchedAssignees} setWatchedAssignees={setWatchedAssignees} onError={setError} />

      <WorkWeekHeaderSection headerPrefs={headerPrefs} setHeaderPrefs={setHeaderPrefs} />

      <ChatAssistantSection settings={settings} setSettings={setSettings} chatStatus={chatStatus} onError={setError} />
    </Container>
  );
};

export default Settings;
