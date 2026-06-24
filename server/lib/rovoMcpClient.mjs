const ROVO_MCP_URL = "https://mcp.atlassian.com/v1/mcp";
const MCP_ACCEPT = "application/json, text/event-stream";
const MCP_PROTOCOL_VERSION = "2024-11-05";

const getSessionId = (response) =>
  response.headers.get("mcp-session-id") || response.headers.get("Mcp-Session-Id") || "";

const parseMcpBody = async (response) => {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  if (contentType.includes("text/event-stream")) {
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) {
        continue;
      }

      const payload = line.slice(5).trim();
      if (!payload) {
        continue;
      }

      try {
        return JSON.parse(payload);
      } catch {
        // Try next SSE data line.
      }
    }
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { result: text };
  }
};

const mcpRequest = async ({ accessToken, sessionId, body, allowEmpty = false }) => {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: MCP_ACCEPT,
  };

  if (sessionId) {
    headers["Mcp-Session-Id"] = sessionId;
  }

  const response = await fetch(ROVO_MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await parseMcpBody(response);
  const mcpError = data?.error?.message || data?.error;

  if (!response.ok && !allowEmpty) {
    throw new Error(mcpError || `Rovo MCP HTTP ${response.status}`);
  }

  if (mcpError && !allowEmpty) {
    throw new Error(typeof mcpError === "string" ? mcpError : JSON.stringify(mcpError));
  }

  return { response, data, sessionId: getSessionId(response) || sessionId };
};

const initializeSession = async (accessToken) => {
  const { response, data, sessionId } = await mcpRequest({
    accessToken,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: "task-manager",
          version: "1.0.0",
        },
      },
    },
  });

  if (!sessionId) {
    throw new Error(
      data?.error?.message || "Rovo MCP did not return a session ID after initialize"
    );
  }

  return sessionId;
};

const notifyInitialized = async (accessToken, sessionId) => {
  await mcpRequest({
    accessToken,
    sessionId,
    allowEmpty: true,
    body: {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    },
  });
};

const extractToolText = (data) => {
  const result = data?.result;
  if (typeof result === "string") {
    return result.trim();
  }

  if (Array.isArray(result?.content)) {
    const parts = result.content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (typeof item?.text === "string") {
          return item.text;
        }
        return "";
      })
      .filter(Boolean);

    if (parts.length > 0) {
      return parts.join("\n\n").trim();
    }
  }

  if (result != null) {
    return JSON.stringify(result, null, 2);
  }

  return "";
};

export const callRovoSearch = async ({ accessToken, query }) => {
  const sessionId = await initializeSession(accessToken);
  await notifyInitialized(accessToken, sessionId);

  const { data } = await mcpRequest({
    accessToken,
    sessionId,
    body: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "search",
        arguments: {
          query: String(query || "").trim(),
        },
      },
    },
  });

  const text = extractToolText(data);
  if (!text) {
    throw new Error("Rovo search returned an empty response");
  }

  return text;
};
