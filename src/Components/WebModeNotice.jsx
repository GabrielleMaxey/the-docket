import React from "react";
import { Message } from "semantic-ui-react";

const isElectronDesktop = () =>
  typeof window !== "undefined" && Boolean(window.desktop?.platform);

const WebModeNotice = () => {
  if (isElectronDesktop()) {
    return null;
  }

  return (
    <Message info size="small" style={{ margin: "0.75rem 1rem 0" }}>
      <Message.Header>Browser mode</Message.Header>
      <p style={{ marginTop: "0.35rem" }}>
        This URL works in the browser. For day-to-day use, the{" "}
        <strong>The Docket desktop app (Electron)</strong> is recommended — it starts the
        helper service for you and keeps notes on this machine. Browser access remains fully
        supported; set <strong>Settings → App URL</strong> if the app cannot reach the API.
      </p>
    </Message>
  );
};

export default WebModeNotice;
