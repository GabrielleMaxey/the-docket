import React from "react";
import { Button, Message } from "semantic-ui-react";
import {
  fetchSharedPrograms,
  saveTeamPrioritySettings,
  fetchTeamPriorityHealth,
  pullTeamPrioritiesToLocal,
  seedTeamPriorityPrograms,
  syncLocalPrioritiesToTeam,
} from "../../../services/jiraClient.js";
import SettingsSection from "./SettingsSection";

const TeamPriorityDemoSection = () => {
  const [health, setHealth] = React.useState(null);
  const [programs, setPrograms] = React.useState([]);
  const [busy, setBusy] = React.useState("");
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

  const loadStatus = React.useCallback(async () => {
    setHealth(null);
    const nextHealth = await fetchTeamPriorityHealth();
    setHealth(nextHealth);
    if (nextHealth?.enabled && nextHealth?.configured && nextHealth?.connected) {
      setPrograms(await fetchSharedPrograms());
    } else {
      setPrograms([]);
    }
  }, []);

  const runAction = async (key, action) => {
    setBusy(key);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy("");
    }
  };

  React.useEffect(() => {
    void runAction("refresh", loadStatus);
  }, [loadStatus]);

  const statusLine = (() => {
    if (!health) return error ? "Team status unavailable. Retry Refresh status." : "Checking…";
    if (!health.enabled) return "Team database is off. Local saving is available.";
    if (health.configured === false) return "Team data not configured — set TEAM_PRIORITY_DATABASE_URL";
    if (health.connected) {
      return "Connected to the team database.";
    }
    return `Configured but not connected${health.error ? `: ${health.error}` : "."}`;
  })();

  const isBusy = Boolean(busy);

  return (
    <SettingsSection
      title="Team data"
      description="Shared priorities and planning for Work Week slots linked to a program."
    >
      <label><input type="checkbox" checked={health?.enabled === true} disabled={isBusy || !health} onChange={(event) => {
        const enabled = event.target.checked;
        return runAction("settings", async () => {
          await saveTeamPrioritySettings({ enabled });
          setHealth(previous => ({ ...previous, enabled, connected: false }));
          await loadStatus();
        });
      }} /> Use team DB</label>
      <p style={{ marginTop: 0, color: "#475569", fontSize: "0.9rem" }}>
        {statusLine} Link a Work Week slot to a shared program — priority changes push to the team database
        immediately. Use <strong>Import team priorities</strong> above with target{" "}
        <strong>Team database</strong> for CSV imports, or push and pull between local
        SQLite and the team database below.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
        <Button
          type="button"
          size="small"
          onClick={() => void runAction("refresh", loadStatus)}
          loading={busy === "refresh"}
          disabled={isBusy}
        >
          Refresh status
        </Button>
        <Button
          type="button"
          primary
          size="small"
          onClick={() =>
            void runAction("seed", async () => {
              const data = await seedTeamPriorityPrograms();
              setPrograms(Array.isArray(data?.programs) ? data.programs : []);
              setMessage(`Loaded ${(data?.programs || []).length} program(s).`);
              await loadStatus();
            })
          }
          loading={busy === "seed"}
          disabled={isBusy || !health?.enabled || !health?.connected}
        >
          Refresh programs
        </Button>
        <Button
          type="button"
          size="small"
          onClick={() =>
            void runAction("sync", async () => {
              const data = await syncLocalPrioritiesToTeam();
              setMessage(
                `Synced ${data.updatedPriorities} local priorities to the team database (scanned ${data.scanned}).`
              );
            })
          }
          loading={busy === "sync"}
          disabled={isBusy || !health?.enabled || !health?.connected}
        >
          Save local priorities to team
        </Button>
        <Button
          type="button"
          size="small"
          onClick={() =>
            void runAction("pull", async () => {
              const data = await pullTeamPrioritiesToLocal();
              setMessage(
                `Pulled ${data.updatedPriorities} priorities from the team database into local SQLite.`
              );
            })
          }
          loading={busy === "pull"}
          disabled={isBusy || !health?.enabled || !health?.connected}
        >
          Pull from the team database
        </Button>
      </div>
      {programs.length > 0 ? (
        <p style={{ marginTop: "0.75rem", color: "#334155", fontSize: "0.9rem" }}>
          Programs: {programs.map((p) => p.displayName || p.slug).join(", ")}.
        </p>
      ) : null}
      {error ? (
        <Message negative size="small" style={{ marginTop: "0.85rem" }}>
          {error}
        </Message>
      ) : null}
      {message ? (
        <Message positive size="small" style={{ marginTop: "0.85rem" }}>
          {message}
        </Message>
      ) : null}
    </SettingsSection>
  );
};

export default TeamPriorityDemoSection;
