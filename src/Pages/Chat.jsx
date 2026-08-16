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
import EpicEvaluationPanel from "./components/EpicEvaluationPanel";
import { useEpicFilters } from "../context/EpicFiltersContext.jsx";
import { fetchChatStatus, fetchDashboardMetrics, saveAdHocReport, sendChatMessage, signOutChat, startChatOAuth } from "../services/jiraClient";
import { buildApiUrl } from "../services/apiBase";
import { buildChatSessionContext } from "../utils/chatSessionContext";
import "./chat.css";

// Always-available starter prompts, general enough to make sense with no
// epic loaded and nothing selected yet.
const BASE_IDEA_PROMPTS = [
  { icon: "⏰", text: "What's overdue across my work right now?" },
  { icon: "🎯", text: "What should I focus on today?" },
  { icon: "🚧", text: "Is anything blocking my open work?" },
];

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
  const [epicEvaluation, setEpicEvaluation] = React.useState(null);
  const [savedMessageIndexes, setSavedMessageIndexes] = React.useState(() => new Set());
  const [savingMessageIndex, setSavingMessageIndex] = React.useState(null);

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

  // Idea prompts shown before the first message: a couple grounded in
  // whatever is actually loaded right now (the evaluated epic, or the
  // selected epic/JQL presets), filled out with general starters so the
  // list never looks sparse. Capped at 5 so it stays a quick scan, not
  // another wall to read.
  const ideaPrompts = React.useMemo(() => {
    const prompts = [];
    if (epicEvaluation?.epic?.key) {
      const key = epicEvaluation.epic.key;
      prompts.push(
        { icon: "📊", text: `What's the workload breakdown on ${key}?` },
        { icon: "🚧", text: `Is anything blocking ${key} right now?` }
      );
    } else if (selectedEpics.length > 0) {
      prompts.push({ icon: "📋", text: "Summarize open work for my selected epics." });
    }
    for (const prompt of BASE_IDEA_PROMPTS) {
      if (prompts.length >= 5) break;
      prompts.push(prompt);
    }
    return prompts;
  }, [epicEvaluation, selectedEpics]);

  const handlePromptClick = (text) => {
    if (sending) return;
    void handleSend(text);
  };

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

  // Accepts an optional override so idea-prompt clicks can send immediately
  // without hitting the stale-state race of setInput(text) followed
  // synchronously by handleSend() reading the not-yet-updated input state.
  const handleSend = async (overrideText) => {
    const text = String(overrideText ?? input).trim();
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
          epicEvaluation,
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

  const findUserPromptForIndex = (messageIndex) => {
    for (let idx = messageIndex - 1; idx >= 0; idx -= 1) {
      if (messages[idx]?.role === "user") {
        return String(messages[idx].content || "").trim();
      }
    }
    return "";
  };

  const buildSaveLabel = (userPrompt) => {
    const trimmed = String(userPrompt || "").trim();
    if (!trimmed) {
      return "Chat response";
    }
    return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
  };

  const handleSaveResponse = async (messageIndex) => {
    const message = messages[messageIndex];
    const content = String(message?.content || "").trim();
    if (!content || message?.role !== "assistant") {
      return;
    }

    setSavingMessageIndex(messageIndex);
    setChatError("");

    try {
      const userPrompt = findUserPromptForIndex(messageIndex);
      await saveAdHocReport({
        content,
        label: buildSaveLabel(userPrompt),
        userPrompt,
        provider: message.provider || chatStatus?.provider || "",
      });
      setSavedMessageIndexes((prev) => new Set([...prev, messageIndex]));
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Failed to save response");
    } finally {
      setSavingMessageIndex(null);
    }
  };

  const chatReady = Boolean(chatStatus?.ready);

  return (
    <Container className="chat-page">
      <Header as="h1" className="chat-page-header">
        <span className="chat-page-header-icon" aria-hidden="true">💬</span> Chat
      </Header>
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

      <EpicEvaluationPanel
        presets={presets}
        onEpicLoaded={setEpicEvaluation}
        onEpicCleared={() => setEpicEvaluation(null)}
      />

      {chatError ? <Message negative>{chatError}</Message> : null}

      <Segment className="chat-thread">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <div className="chat-empty-state-icon">💬</div>
            <p className="chat-empty-state-title">Ask anything about your tasks</p>
            <p className="chat-empty-state-subtitle">
              Try one of these, or ask your own question below.
            </p>
            <div className="chat-idea-prompts">
              {ideaPrompts.map((prompt) => (
                <button
                  key={prompt.text}
                  type="button"
                  className="chat-idea-prompt"
                  disabled={!chatReady || sending}
                  onClick={() => handlePromptClick(prompt.text)}
                >
                  <span className="chat-idea-prompt-icon" aria-hidden="true">{prompt.icon}</span>
                  <span>{prompt.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`chat-bubble-row chat-bubble-row--${message.role === "user" ? "user" : "assistant"}`}
            >
              <span className="chat-bubble-role">{message.role === "user" ? "You" : "Assistant"}</span>
              <div
                className={
                  message.role === "user" ? "chat-bubble chat-bubble-user" : "chat-bubble chat-bubble-assistant"
                }
              >
                <p>{message.content}</p>
                {message.note ? <p className="chat-bubble-note">{message.note}</p> : null}
                {message.role === "assistant" ? (
                  <div className="chat-bubble-actions">
                    <Button
                      size="mini"
                      basic
                      loading={savingMessageIndex === index}
                      disabled={savedMessageIndexes.has(index) || savingMessageIndex !== null}
                      onClick={() => void handleSaveResponse(index)}
                    >
                      {savedMessageIndexes.has(index) ? "Saved to Past Reports" : "Save to Past Reports"}
                    </Button>
                  </div>
                ) : null}
              </div>
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
        <Button primary onClick={() => handleSend()} loading={sending} disabled={!chatReady || sending}>
          Send
        </Button>
      </Form>
    </Container>
  );
};

export default Chat;
