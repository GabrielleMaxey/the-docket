import React from "react";
import { colors, monoFamily } from "../theme";
import { Appear, Background, Logo } from "../ui";

const Column: React.FC<{ at: number; role: string; icon: string; color: string; steps: string[] }> = ({
  at,
  role,
  icon,
  color,
  steps,
}) => (
  <Appear at={at} style={{ flex: 1 }}>
    <div
      style={{
        background: "white",
        borderRadius: 24,
        padding: "34px 36px",
        height: 460,
        boxShadow: "0 24px 60px rgba(15,49,51,0.14)",
        borderLeft: `12px solid ${color}`,
      }}
    >
      <div style={{ fontSize: 46, fontWeight: 900, color, marginBottom: 24 }}>
        {icon} {role}
      </div>
      {steps.map((s, i) => (
        <Appear key={s} at={at + 0.6 + i * 0.6}>
          <div style={{ display: "flex", gap: 16, fontSize: 31, lineHeight: 1.3, marginBottom: 22 }}>
            <span
              style={{
                flexShrink: 0,
                width: 46,
                height: 46,
                borderRadius: 23,
                background: color,
                color: "white",
                fontWeight: 900,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
              }}
            >
              {i + 1}
            </span>
            <span>{s}</span>
          </div>
        </Appear>
      ))}
    </div>
  </Appear>
);

export const RecapScene: React.FC = () => (
  <Background>
    <div style={{ position: "absolute", left: 100, right: 100, top: 90 }}>
      <Appear at={0.1}>
        <div
          style={{
            fontSize: 26,
            fontWeight: 900,
            letterSpacing: 3,
            color: colors.coral,
            textTransform: "uppercase",
          }}
        >
          Your first week
        </div>
      </Appear>
      <Appear at={0.3}>
        <div style={{ fontSize: 80, fontWeight: 900, marginTop: 10 }}>Start here, based on your role</div>
      </Appear>
    </div>
    <div style={{ position: "absolute", left: 100, right: 100, top: 320, display: "flex", gap: 36 }}>
      <Column
        at={1.0}
        role="Developers"
        icon="👩‍💻"
        color="#2563EB"
        steps={[
          "Run your “My Work” query each morning",
          "Push notes to Jira instead of writing status emails",
          "Generate 1:1 Prep before every check-in",
        ]}
      />
      <Column
        at={3.4}
        role="Project Managers"
        icon="🧭"
        color="#C2410C"
        steps={[
          "Save one Epic preset per project",
          "Refresh Metrics weekly and watch overdue %",
          "Use Capacity & Gantt to rebalance early",
        ]}
      />
      <Column
        at={5.8}
        role="Executives"
        icon="📊"
        color="#7C3AED"
        steps={[
          "Ask your PM to share the Executive Summary",
          "Or open Metrics → Reports yourself",
          "Ask Chat: “What’s at risk this month?”",
        ]}
      />
    </div>
    <Appear at={9.4} style={{ position: "absolute", left: 100, right: 100, bottom: 70, textAlign: "center" }}>
      <div style={{ fontSize: 32, color: colors.muted }}>
        🔒 Runs on your machine · Jira credentials live only in your local <b>.env</b> file
      </div>
    </Appear>
  </Background>
);

export const OutroScene: React.FC = () => (
  <Background dark>
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 30,
        textAlign: "center",
      }}
    >
      <Appear at={0.1}>
        <Logo size={180} />
      </Appear>
      <Appear at={0.5}>
        <div style={{ fontSize: 120, fontWeight: 900 }}>You&apos;re ready.</div>
      </Appear>
      <Appear at={1.2}>
        <div style={{ fontSize: 44, opacity: 0.9 }}>Connect · Save presets · Run your first query</div>
      </Appear>
      <Appear at={2.2}>
        <div
          style={{
            marginTop: 30,
            fontFamily: monoFamily,
            fontSize: 30,
            color: colors.cyan,
            lineHeight: 1.7,
          }}
        >
          docs/END_USER_GUIDE.md — full user guide
          <br />
          docs/JIRA_SETUP.md — Jira &amp; AI setup help
        </div>
      </Appear>
    </div>
  </Background>
);
