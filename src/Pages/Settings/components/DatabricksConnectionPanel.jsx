import React from "react";
import { Button, Header, Message } from "semantic-ui-react";
import { fetchDatabricksStatus, testDatabricksConnection } from "../../../services/jiraClient.js";
import {
  ACCESS_TOKENS_PATH,
  DEVELOPER_ROLE_MESSAGE,
  ENDPOINT_GUIDE,
  HOST_GUIDE,
  SETUP_COMMAND,
  TOKEN_COMMENT,
  TOKEN_GUIDE,
  TOKEN_LIFETIME_DAYS,
} from "../../../../shared/databricksSetupGuide.mjs";

const CHECK_MARKS = { ok: "✓", warning: "!", skipped: "-", failed: "✗" };
const RESTART_CODES = ["token_missing", "token_rejected"];

const DatabricksConnectionPanel = () => {
  const [status, setStatus] = React.useState(null);
  const [statusError, setStatusError] = React.useState("");
  const [testing, setTesting] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [testError, setTestError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    fetchDatabricksStatus()
      .then((data) => { if (!cancelled) setStatus(data); })
      .catch((err) => {
        if (!cancelled) setStatusError(err instanceof Error ? err.message : "Could not load Databricks status.");
      });
    return () => { cancelled = true; };
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setTestError("");
    setResult(null);
    try {
      setResult(await testDatabricksConnection());
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Connection test failed.");
    } finally {
      setTesting(false);
    }
  };

  const rows = status
    ? [
        { label: "Host", variable: "DATABRICKS_HOST", set: status.hostConfigured, guide: HOST_GUIDE },
        { label: "Endpoint", variable: "DATABRICKS_ENDPOINT", set: status.endpointConfigured, guide: ENDPOINT_GUIDE },
        { label: "Token", variable: "DATABRICKS_TOKEN", set: status.tokenSet, guide: TOKEN_GUIDE },
      ]
    : [];

  const checks = Array.isArray(result?.checks) ? result.checks : [];
  const codes = [result?.code, ...checks.map((check) => check.code)];
  const showRestartHint = codes.some((code) => RESTART_CODES.includes(code));
  const showDeveloperHint = codes.includes("no_api_access");

  return (
    <>
      <div style={{ borderTop: "1px solid #e2e8f0", margin: "1.25rem 0 1rem" }} />
      <Header as="h4" style={{ margin: "0 0 0.5rem" }}>Databricks connection</Header>
      <p style={{ fontSize: "0.85rem", color: "#475569", marginBottom: "0.75rem" }}>
        This panel only reports what is configured. Values are saved by the setup command, never typed here.
      </p>

      {statusError ? <Message warning size="small">{statusError}</Message> : null}
      {status ? (
        <ul className="ww-copy" style={{ listStyle: "none", paddingLeft: 0 }}>
          {rows.map((row) => (
            <li key={row.variable} style={{ marginBottom: "0.5rem" }}>
              {row.set ? "✓" : "✗"} {row.label} (<code>{row.variable}</code>){row.set ? " is set" : " is not set"}
              {row.set ? null : (
                <div style={{ fontSize: "0.85rem", color: "#475569" }}>{row.guide}</div>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <Button onClick={handleTest} loading={testing} disabled={testing}>Test connection</Button>
      {testError ? <Message negative size="small" style={{ marginTop: "0.75rem" }}>{testError}</Message> : null}
      {result ? (
        <Message positive={Boolean(result.ok)} negative={!result.ok} size="small" style={{ marginTop: "0.75rem" }}>
          {result.ok
            ? `Connected${result.user ? ` as ${result.user}` : ""}.`
            : result.message || "Connection test failed."}
          {checks.length ? (
            <ul style={{ margin: "0.5rem 0 0" }}>
              {checks.map((check) => (
                <li key={check.name}>
                  {CHECK_MARKS[check.status] || "✗"} {check.name}
                  {check.message ? `: ${check.message}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {showDeveloperHint ? <div style={{ marginTop: "0.5rem" }}>{DEVELOPER_ROLE_MESSAGE}</div> : null}
          {showRestartHint ? <div style={{ marginTop: "0.5rem" }}>Restart The Docket after running setup.</div> : null}
        </Message>
      ) : null}

      <Header as="h5" style={{ margin: "1rem 0 0.5rem" }}>Setup guide</Header>
      <ol className="ww-copy">
        <li>Open a terminal in the project folder and run <code>{SETUP_COMMAND}</code>.</li>
        <li>
          When asked for the token, create one in Databricks under <code>{ACCESS_TOKENS_PATH}</code> with a
          lifetime of {TOKEN_LIFETIME_DAYS} days and the comment &quot;{TOKEN_COMMENT}&quot;, then paste it into the terminal.
        </li>
        <li>Enter the workspace address and model endpoint name when asked.</li>
        <li>Restart The Docket, then choose Test connection.</li>
      </ol>
    </>
  );
};

export default DatabricksConnectionPanel;
