import React from "react";
import { colors } from "../theme";
import { Appear, Key, Panel, Pill, TutorialScene, useSeconds } from "../ui";

const SCORES = [
  { n: 1, key: "APP-142", title: "[Mobile Checkout - Wallet] Fix Apple Pay", score: 95, why: "Highest priority · blocks APP-150 · due Thursday" },
  { n: 2, key: "APP-138", title: "[Mobile Checkout - Speed] Cache the cart", score: 70, why: "High priority · In Progress · P2" },
  { n: 3, key: "APP-131", title: "[Analytics - Events] Track checkout timing", score: 55, why: "Medium · stale 18 days" },
  { n: 4, key: "APP-127", title: "[Forms - Validation] Tighten address checks", score: 40, why: "Medium · P9" },
];

const FACTORS = [
  ["Jira priority", "10 to 50"],
  ["Status", "5 or 20"],
  ["Staleness", "5 to 25"],
  ["Due date", "+15 or +25"],
  ["Blockers", "+20 or +30"],
  ["Your P1 to P20", "up to +30"],
];

export const WeekPlanScene: React.FC = () => {
  const t = useSeconds();
  const open = t > 17.5;
  return (
    <TutorialScene
      step="Daily driver"
      title="Plan your week"
      who={["Developers", "Project Managers"]}
      lines={[
        { at: 0.8, text: <><b>Help me plan my week</b> asks a few quick questions.</> },
        { at: 4.5, text: <>The plan covers <b>only issues assigned to you</b>.</> },
        { at: 10.0, text: <>Ordered by a <b>suggested-order score</b> plus your own P1 to P20.</> },
        { at: 17.5, text: <><Key>How the score works</Key> opens at the end of every plan.</> },
      ]}
    >
      <Panel title="🗓️ Help me plan my week" style={{ width: 1040, boxShadow: "0 20px 50px rgba(15,49,51,0.15)" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <Pill color={colors.muted} style={{ fontSize: 17 }}>Balance across projects</Pill>
          <Pill color={colors.muted} style={{ fontSize: 17 }}>40h available</Pill>
          <Appear at={4.5}>
            <Pill color={colors.green} style={{ fontSize: 17 }}>Only my open issues</Pill>
          </Appear>
        </div>
        {SCORES.map((r, i) => (
          <Appear key={r.key} at={6.0 + i * 0.9}>
            <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 19, padding: "9px 0", borderTop: `1px solid ${colors.border}` }}>
              <span style={{ width: 28, fontWeight: 900, color: colors.orange }}>{r.n}</span>
              <span style={{ width: 92, fontWeight: 900, color: colors.blue }}>{r.key}</span>
              <span style={{ flex: 1 }}>
                {r.title}
                <div style={{ fontSize: 16, color: colors.muted }}>{r.why}</div>
              </span>
              <Appear at={10.0 + i * 0.5}>
                <Pill color={colors.teal} style={{ fontSize: 18 }}>Score {r.score}</Pill>
              </Appear>
            </div>
          </Appear>
        ))}
        <div style={{ marginTop: 12, border: `1px solid ${colors.border}`, borderRadius: 10, padding: "10px 16px", background: "#F7F9FB" }}>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{open ? "▾" : "▸"} How the score works</div>
          {open ? (
            <Appear at={17.5}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", marginTop: 8, fontSize: 18 }}>
                {FACTORS.map(([a, b]) => (
                  <div key={a} style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${colors.border}`, padding: "4px 0" }}>
                    <span>{a}</span>
                    <b>{b}</b>
                  </div>
                ))}
              </div>
            </Appear>
          ) : null}
        </div>
      </Panel>
    </TutorialScene>
  );
};

const CARDS: [number, string, string, string, string][] = [
  [1.0, "My Metrics", "Status Report", "Written from your real issues", colors.blue],
  [2.2, "My Metrics", "1:1 Prep", "Talking points and asks", colors.blue],
  [3.4, "My Metrics", "P W B Review", "Self-review draft", colors.blue],
  [8.6, "Metrics", "Executive summary", "Leadership view", "#7C3AED"],
  [9.8, "Metrics", "PM and Developer", "Audience-specific summaries", "#7C3AED"],
  [15.4, "Combined Open Work", "Combined Work report", "Across every Jira site", colors.orange],
];

export const ReportsScene: React.FC = () => {
  const t = useSeconds();
  return (
    <TutorialScene
      step="Helpful reports"
      title="Reports in one click"
      who={["Developers", "Project Managers", "Executives"]}
      lines={[
        { at: 0.8, text: <>My Metrics: <b>Status</b>, <b>1:1 Prep</b>, <b>P W B</b>.</> },
        { at: 8.2, text: <>Metrics: <b>Executive</b>, <b>PM</b> and <b>Developer</b> summaries.</> },
        { at: 15.0, text: <>Combined Open Work has its own report across all sites.</> },
        { at: 21.0, text: <>Saved to <b>Past Reports</b>: read, copy or download.</> },
        { at: 26.0, text: <>Download a task workbook, one sheet per site.</> },
      ]}
    >
      <div style={{ width: 1040, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          {CARDS.map(([at, where, title, sub, color]) => (
            <Appear key={title} at={at}>
              <div
                style={{
                  background: "white",
                  borderRadius: 16,
                  borderLeft: `10px solid ${color}`,
                  padding: "18px 22px",
                  boxShadow: "0 14px 34px rgba(15,49,51,0.12)",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 2, color, textTransform: "uppercase" }}>{where}</div>
                <div style={{ fontSize: 30, fontWeight: 900, marginTop: 4 }}>{title}</div>
                <div style={{ fontSize: 20, color: colors.muted }}>{sub}</div>
              </div>
            </Appear>
          ))}
        </div>
        <Appear at={21.0}>
          <Panel title="🗄️ Past Reports">
            <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 20 }}>
              <Pill color={colors.green}>Saved automatically</Pill>
              <span>Status Report · Week plan · Executive summary · Combined Work</span>
            </div>
          </Panel>
        </Appear>
        {t > 26 ? (
          <Appear at={26.0}>
            <Pill color={colors.teal} style={{ fontSize: 22, padding: "8px 18px" }}>⬇ Download tasks · workbook with one sheet per Jira site</Pill>
          </Appear>
        ) : null}
      </div>
    </TutorialScene>
  );
};
