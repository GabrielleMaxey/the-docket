import React from "react";
import { Button, Form, Header, Message } from "semantic-ui-react";
import SettingsSection from "./SettingsSection";
import { saveAppSettings } from "../../../services/jiraClient.js";
import { setStoredProxyUrl } from "../../../services/apiBase.js";
import { useFlash } from "../../hooks/useFlash.js";

const ChatAssistantSection = ({ settings, setSettings, chatStatus, onError }) => {
  const [flash, setFlash] = useFlash();

  const handleSaveSettings = async () => {
    onError("");
    try {
      const next = await saveAppSettings({
        epic_past_due_mode: settings.epic_past_due_mode,
        proxy_url: settings.proxy_url,
        chat_custom_instructions: settings.chat_custom_instructions,
      });
      setSettings({
        epic_past_due_mode: next.epic_past_due_mode || "either",
        proxy_url: next.proxy_url || "",
        chat_custom_instructions: next.chat_custom_instructions || "",
      });
      setStoredProxyUrl(next.proxy_url || "");
      setFlash("Chat instructions saved.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save settings");
    }
  };

  return (
    <SettingsSection
      title="Chat assistant"
      description="Configure the AI chat assistant — set custom instructions and check connection status."
    >
      <p>The chat assistant already follows a few built-in rules every time it answers — you don&apos;t need to do anything for these:</p>
      <ul className="ww-copy">
        <li>It&apos;s a helpful assistant for this Jira task manager.</li>
        <li>It uses the epics selected in the filter panel when relevant.</li>
        <li>It searches Jira directly with JQL instead of guessing, when needed.</li>
        <li>It never states a name or fact unless it came from real selected-epic data or an actual Jira search — it won&apos;t guess or make up people.</li>
        <li>It keeps responses professional — no offensive or inappropriate language.</li>
        <li>It only helps with Lumen Jira data — it declines requests that are unrelated or inappropriate, even if asked more than once.</li>
      </ul>
      <p>
        Anything you type below is added <em>on top of</em> those defaults for every conversation — use it to tell the assistant how you&apos;d like it to answer. For example:
        <br />
        <code>Keep answers short. Always include the issue key. Prefer bullet points over paragraphs.</code>
      </p>
      <Form>
        <Form.TextArea
          label="Your instructions (optional)"
          placeholder="e.g. Keep answers short and always include issue keys."
          value={settings.chat_custom_instructions}
          onChange={(_e, { value }) => setSettings((prev) => ({ ...prev, chat_custom_instructions: value }))}
        />
        <Button primary onClick={handleSaveSettings}>Save chat instructions</Button>
        {flash ? <Message positive size="mini" style={{ marginTop: "0.75rem" }}>✓ {flash}</Message> : null}
      </Form>

      <div style={{ borderTop: "1px solid #e2e8f0", margin: "1.25rem 0 1rem" }} />
      <Header as="h4" style={{ margin: "0 0 0.5rem" }}>Connection status</Header>
      <p style={{ fontSize: "0.85rem", color: "#475569", marginBottom: "0.75rem" }}>
        Set <code>CHAT_PROVIDER</code> and the matching API key in <code>.env</code> on the proxy host
        (see JIRA_SETUP.md). Use <code>CHAT_PROVIDER=rovo</code> only if your org has Rovo MCP access.
      </p>
      {chatStatus ? (
        <Message info size="small">
          Provider: <strong>{chatStatus.provider}</strong>
          {chatStatus.provider === "rovo" && chatStatus.oauthConnected ? " · Signed in with Atlassian" : ""}
          {chatStatus.ready ? " · Ready" : " · Not ready — check API keys in .env"}
        </Message>
      ) : (
        <Message warning size="small">Could not load chat status.</Message>
      )}
    </SettingsSection>
  );
};

export default ChatAssistantSection;
