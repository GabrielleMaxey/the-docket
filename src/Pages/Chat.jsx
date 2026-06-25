import React from "react";
import {
  Button,
  Container,
  Form,
  Header,
  Message,
  Segment,
} from "semantic-ui-react";
import EpicFilterPanel from "./components/EpicFilterPanel";
import { useEpicFilters } from "./hooks/useEpicFilters";
import { fetchChatStatus, fetchDashboardMetrics, sendChatMessage, signOutChat, startChatOAuth } from "../services/jiraClient";
import { buildApiUrl } from "../services/apiBase";
import { buildChatSessionContext } from "../utils/chatSessionContext";
import "./chat.css";

const Chat = () => {
  const {
    presets,
    loading: epicPresetsLoading,
    error: epicPresetsError,
    selectedPresetIds,
    includePastDue,
    setIncludePastDue,
    selectAll,
    clearSelection,
    setSelectedPresetIds,
  } = useEpicFilters();

  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [chatError, setChatError] = React.useState("");
  const [chatStatus, setChatStatus] = React.useState(null);
  const [dashboardSnapshot, setDashboardSnapshot] = React.useState(null);

  const loadDashboardSnapshot = React.useCallback(async () => {
    try {
      const data = await fetchDashboardMetrics();
      setDashboardSnapshot(data);
    } catch {
      setDashboardSnapshot(null);
    }
  }, []);

  const loadStatus = React.useCallback(async () => {
    try {
      const status = await fetchChatStatus();
      setChatStatus(status);
    } catch {
      setChatStatus(null);
    }
  }, []);

  React.useEffect(() => {
    void loadStatus();
    void loadDashboardSnapshot();
  }, [loadStatus, loadDashboardSnapshot]);

  const selectedEpics = React.useMemo(
    () =>
      presets
        .filter((preset) => selectedPresetIds.includes(preset.id))
        .map((preset) => ({
          epicKey: preset.epicKey,
          epicName: preset.epicName,
          label: preset.label,
          presetType: preset.presetType,
          jql: preset.presetType === "jql" ? preset.jql : "",
        })),
    [presets, selectedPresetIds]
  );

  const handleSignIn = async () => {
    setChatError("");
    try {
      const url = await startChatOAuth();
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Failed to start sign-in");
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutChat();
      await loadStatus();
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Failed to sign out");
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) {
      return;
    }

    setChatError("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");

    try {
      let snapshot = dashboardSnapshot;
      try {
        snapshot = await fetchDashboardMetrics();
        setDashboardSnapshot(snapshot);
      } catch {
        // Use cached snapshot if refresh fails.
      }

      const sessionContext = buildChatSessionContext({ dashboardSnapshot: snapshot });

      const result = await sendChatMessage({
        message: text,
        epicContext: {
          selectedEpics,
          includePastDue,
          sessionContext,
        },
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.reply,
          note: result.note,
          provider: result.provider,
        },
      ]);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Chat request failed");
    } finally {
      setSending(false);
    }
  };

  const chatReady = Boolean(chatStatus?.ready);

  return (
    <Container className="chat-page">
      <Header as="h1">Chat</Header>
      <p className="ww-copy">
        Ask questions about selected epics, your Work Week JQL results, dashboard metrics, and any
        reports or week plans you generated in this browser.
      </p>

      <Segment>
        <div className="chat-status-row">
          <span>
            Provider: <strong>{chatStatus?.provider || "not configured"}</strong>
            {chatStatus?.provider === "rovo" && chatStatus?.oauthConnected
              ? " · Signed in with Atlassian"
              : ""}
          </span>
          {chatStatus?.provider === "rovo" && chatStatus?.oauthConfigured ? (
            <div className="chat-status-actions">
              {chatStatus.oauthConnected ? (
                <Button size="small" basic onClick={handleSignOut}>
                  Sign out
                </Button>
              ) : (
                <Button size="small" primary onClick={handleSignIn}>
                  Sign in with Atlassian
                </Button>
              )}
            </div>
          ) : null}
        </div>
        {!chatReady ? (
          <Message warning size="small">
            Chat is not ready. Set <code>CHAT_PROVIDER</code> and the matching API key in <code>.env</code> on
            the proxy host (for example <code>anthropic</code> + <code>ANTHROPIC_API_KEY</code>, or{" "}
            <code>rovo</code> with Atlassian OAuth). Status:{" "}
            <a href={buildApiUrl("/api/chat/status")} target="_blank" rel="noreferrer">
              /api/chat/status
            </a>
          </Message>
        ) : null}
      </Segment>

      <Segment>
        <EpicFilterPanel
          presets={presets}
          loading={epicPresetsLoading}
          error={epicPresetsError}
          selectedPresetIds={selectedPresetIds}
          includePastDue={includePastDue}
          onSelectionChange={setSelectedPresetIds}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          onIncludePastDueChange={setIncludePastDue}
          showRunButton={false}
        />
      </Segment>

      {chatError ? <Message negative>{chatError}</Message> : null}

      <Segment className="chat-thread">
        {messages.length === 0 ? (
          <Message info size="small">
            Start a conversation. Example: “Which epics are past due?” or “Summarize open work for
            the selected epics.”
          </Message>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={
                message.role === "user" ? "chat-bubble chat-bubble-user" : "chat-bubble chat-bubble-assistant"
              }
            >
              <p>{message.content}</p>
              {message.note ? <p className="chat-bubble-note">{message.note}</p> : null}
            </div>
          ))
        )}
      </Segment>

      <Form className="chat-input-form" onSubmit={(event) => event.preventDefault()}>
        <Form.TextArea
          placeholder="Ask about selected epics..."
          value={input}
          onChange={(_event, { value }) => setInput(value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSend();
            }
          }}
          disabled={!chatReady || sending}
        />
        <Button primary onClick={handleSend} loading={sending} disabled={!chatReady || sending}>
          Send
        </Button>
      </Form>
    </Container>
  );
};

export default Chat;
