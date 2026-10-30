import React from "react";
import { colors } from "../theme";
import { Appear, Code, Key, Pill, TutorialScene, useSeconds } from "../ui";

const Column: React.FC<{
  at: number;
  activeFrom: number;
  icon: string;
  title: string;
  color: string;
  items: string[];
}> = ({ at, activeFrom, icon, title, color, items }) => {
  const t = useSeconds();
  const on = t >= activeFrom;
  return (
    <Appear at={at} style={{ flex: 1 }}>
      <div
        style={{
          background: "white",
          borderRadius: 16,
          borderTop: `10px solid ${color}`,
          padding: "20px 22px",
          height: 390,
          boxShadow: on ? `0 0 0 3px ${color}55, 0 20px 50px rgba(15,49,51,0.15)` : "0 20px 50px rgba(15,49,51,0.12)",
        }}
      >
        <div style={{ fontSize: 40 }}>{icon}</div>
        <div style={{ fontSize: 24, fontWeight: 900, color, margin: "8px 0 14px", lineHeight: 1.2 }}>{title}</div>
        {items.map((i) => (
          <div key={i} style={{ fontSize: 19, lineHeight: 1.35, marginBottom: 10, display: "flex", gap: 8 }}>
            <span style={{ color }}>•</span>
            {i}
          </div>
        ))}
      </div>
    </Appear>
  );
};

export const DataSecurityScene: React.FC = () => {
  const t = useSeconds();
  return (
    <TutorialScene
      step="Use AI responsibly"
      title="Data security & approved AI"
      who={["Everyone"]}
      lines={[
        { at: 0.8, text: <>Chat, reports and AI Draft send Jira data to your configured AI model.</> },
        { at: 5.0, text: <>Use only your company&apos;s <Key>approved, governed models</Key> (Company AI).</> },
        { at: 13.0, text: <>Never paste passwords, tokens, or customer personal data into chat or notes.</> },
        { at: 24.0, text: <>Review AI answers before acting. Policy questions → AI Governance page.</> },
      ]}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 22, width: 1040 }}>
        <Appear at={5.6}>
          <div
            style={{
              background: "white",
              border: `1px solid ${colors.border}`,
              borderRadius: 14,
              padding: "18px 22px",
              display: "flex",
              alignItems: "center",
              gap: 16,
              boxShadow: "0 20px 50px rgba(15,49,51,0.12)",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 900 }}>Settings → Chat assistant</div>
            <div style={{ flex: 1 }} />
            <Pill color={colors.green} style={{ fontSize: 19, padding: "6px 14px" }}>
              ✓ Using Company AI
            </Pill>
            <span style={{ fontSize: 18, color: colors.muted }}>
              model: <Code>&lt;approved-model&gt;</Code>
            </span>
          </div>
        </Appear>
        <div style={{ display: "flex", gap: 18 }}>
          <Column
            at={16.5}
            activeFrom={16.5}
            icon="💻"
            title="Stays on your machine"
            color={colors.teal}
            items={["Jira credentials (.env)", "Notes & P1–P20 priorities", "Past Reports & metrics", "Personal to-dos"]}
          />
          <Column
            at={19.5}
            activeFrom={19.5}
            icon="🗂️"
            title="Goes to Jira"
            color={colors.blue}
            items={["Status, assignee & date changes", "Notes you push as comments", "Issues you create"]}
          />
          <Column
            at={1.4}
            activeFrom={1.4}
            icon="🛡️"
            title="Goes to your approved AI model"
            color="#7C3AED"
            items={["Chat questions + loaded Jira context", "Report & week-plan prompts", "AI Draft text"]}
          />
        </div>
        <Appear at={13.0}>
          <div
            style={{
              background: `${colors.coral}14`,
              border: `2px solid ${colors.coral}66`,
              borderRadius: 14,
              padding: "14px 20px",
              fontSize: 21,
              fontWeight: 700,
              color: "#9A2E1F",
              opacity: t >= 13 ? 1 : 0,
            }}
          >
            🚫 No passwords, API tokens, or customer PII in Chat, notes or AI Draft.
          </div>
        </Appear>
      </div>
    </TutorialScene>
  );
};
