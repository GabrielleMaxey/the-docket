import React from "react";
import { Button, Message } from "semantic-ui-react";
import {
  fetchSharedPrograms,
  fetchTeamPriorityHealth,
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
    const nextHealth = await fetchTeamPriorityHealth();
    setHealth(nextHealth);
    if (nextHealth?.configured && nextHealth?.connected) {
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
    if (busy === "refresh" && !health) {
      return "Checking…";
    }
    if (!health?.configured) {
      return "Not configured — set TEAM_PRIORITY_MONGODB_URI in .env and restart the API.";
    }
    if (health.connected) {
      return "Connected to Atlas.";
    }
    return `Configured but not connected${health.error ? `: ${health.error}` : "."}`;
  })();

  const isBusy = Boolean(busy);

  return (
    <SettingsSection
      title="Team priority (Atlas demo)"
      description="Shared P1–P20 for Work Week slots linked to a program. Long-term target is MySQL."
    >
      <p style={{ marginTop: 0, color: "#475569", fontSize: "0.9rem" }}>
        {statusLine} Link a Work Week slot to a shared program — priority changes push to Atlas
        immediately. Use <strong>Import team priorities</strong> above with target{" "}
        <strong>Atlas (demo)</strong> for one-time CSV seeding, or sync from local SQLite below.
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
              setMessage(`Seeded ${(data?.programs || []).length} program(s).`);
              await loadStatus();
            })
          }
          loading={busy === "seed"}
          disabled={isBusy || !health?.configured}
        >
          Seed programs
        </Button>
        <Button
          type="button"
          size="small"
          onClick={() =>
            void runAction("sync", async () => {
              const data = await syncLocalPrioritiesToTeam();
              setMessage(
                `Synced ${data.updatedPriorities} local priorities to Atlas (scanned ${data.scanned}).`
              );
            })
          }
          loading={busy === "sync"}
          disabled={isBusy || !health?.connected}
        >
          Seed from local priorities
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
