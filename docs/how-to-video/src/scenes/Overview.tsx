import React from "react";
import { colors, monoFamily } from "../theme";
import { chapterStarts, formatTime, sentenceStarts } from "../timing";
import { AppWindow, Appear, Background, Key, Logo, Panel, Pill, TutorialScene, useSeconds } from "../ui";

// Chapter list with start times, computed from the real scene lengths.
export const ContentsScene: React.FC = () => {
  const rows = chapterStarts();
  const half = Math.ceil(rows.length / 2);
  const cols = [rows.slice(0, half), rows.slice(half)];
  return (
    <Background dark>
      <div style={{ position: "absolute", left: 120, right: 120, top: 70 }}>
        <Appear at={0.1}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 4, color: colors.cyan, textTransform: "uppercase" }}>
            Chapters
          </div>
        </Appear>
        <Appear at={0.3}>
          <div style={{ fontSize: 84, fontWeight: 900, lineHeight: 1.05 }}>In this video</div>
        </Appear>
        <Appear at={0.8}>
          <div style={{ fontSize: 30, opacity: 0.85, marginTop: 8 }}>
            Jump to any chapter using the times below. They are also in the video description.
          </div>
        </Appear>
        <div style={{ display: "flex", gap: 70, marginTop: 44 }}>
          {cols.map((col, c) => (
            <div key={c} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
              {col.map((r, i) => (
                <Appear key={r.key} at={1.4 + (c * half + i) * 0.45}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 22,
                      fontSize: 34,
                      fontWeight: 700,
                      padding: "6px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.14)",
                    }}
                  >
                    <span style={{ fontFamily: monoFamily, color: colors.yellow, width: 84 }}>{formatTime(r.seconds)}</span>
                    <span>{r.title}</span>
                  </div>
                </Appear>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Background>
  );
};

const Box: React.FC<{ at: number; title: string; sub: string; color: string; children?: React.ReactNode; w?: number }> = ({
  at,
  title,
  sub,
  color,
  children,
  w = 300,
}) => (
  <Appear at={at}>
    <div
      style={{
        width: w,
        background: "white",
        border: `3px solid ${color}`,
        borderRadius: 20,
        padding: "22px 22px",
        boxShadow: "0 20px 50px rgba(15,49,51,0.14)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 900, color }}>{title}</div>
      <div style={{ fontSize: 20, color: colors.muted, lineHeight: 1.3 }}>{sub}</div>
      {children}
    </div>
  </Appear>
);

const Arrow: React.FC<{ at: number; label: string }> = ({ at, label }) => (
  <Appear at={at}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 110, gap: 4 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: colors.muted, textAlign: "center" }}>{label}</div>
      <div style={{ fontSize: 54, color: colors.orange, lineHeight: 1 }}>→</div>
    </div>
  </Appear>
);

export const OverviewScene: React.FC = () => {
  // Cues follow the narration: s[0] "for engineers...", s[1] "runs on your
  // computer", s[2] "saved search... table", s[3] "change a status...",
  // s[4] "priorities and notes", s[5] "reports".
  const s = sentenceStarts("overview");
  return (
    <TutorialScene
      step="The big picture"
      title="What The Docket does"
      who={["Everyone"]}
      lines={[
        { at: s[0], text: <>Built for engineers and project managers who live in Jira.</> },
        { at: s[1], text: <>Runs on <b>your computer</b>; talks to Jira through a small local server.</> },
        { at: s[2], text: <>Saved searches become <b>one editable table</b>.</> },
        { at: s[3], text: <>Edits save straight to Jira.</> },
        { at: s[4], text: <>Priorities and notes stay with you.</> },
        { at: s[5], text: <>The app writes your <b>reports and plans</b>.</> },
      ]}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Box at={s[0]} title="Jira" sub="Your sites, issues and projects" color={colors.blue} w={230}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {["Demo Operations", "Demo Platform"].map((x) => (
              <Pill key={x} color={colors.blue}>{x}</Pill>
            ))}
          </div>
        </Box>
        <Arrow at={s[1]} label="your API token" />
        <Box at={s[1] + 0.5} title="The Docket" sub="Local server, notes and priorities on this machine" color={colors.coral} w={260}>
          <Logo size={64} />
        </Box>
        <Arrow at={s[2]} label="" />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            [s[2], "Editable table", colors.teal],
            [s[4], "Priorities & notes", colors.orange],
            [s[5], "Reports & plans", "#7C3AED"],
          ].map(([at, label, color]) => (
            <Appear key={label as string} at={at as number}>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 900,
                  color: color as string,
                  background: "white",
                  border: `3px solid ${color}`,
                  borderRadius: 16,
                  padding: "16px 22px",
                  width: 270,
                  boxShadow: "0 14px 34px rgba(15,49,51,0.12)",
                }}
              >
                {label}
              </div>
            </Appear>
          ))}
        </div>
      </div>
    </TutorialScene>
  );
};

const SITES = [
  { name: "Demo Operations", host: "ops.example.test", color: colors.blue },
  { name: "Demo Platform", host: "platform.example.test", color: colors.orange },
  { name: "Demo Support", host: "support.example.test", color: "#7C3AED" },
];

export const MultiSpaceScene: React.FC = () => {
  const t = useSeconds();
  const menu = t > 4.0 && t < 11.0;
  const site = t > 8.0 && t < 11.0 ? "Demo Platform" : "Demo Operations";
  const combined = t > 12.5;
  const rows = [
    ["Demo Operations", "OPS-101", "Review the deployment checklist", "In Progress", 0],
    ["Demo Platform", "PLT-212", "Rotate staging credentials", "To Do", 1],
    ["Demo Support", "SUP-87", "Triage escalated tickets", "In Progress", 2],
    ["Demo Operations", "OPS-118", "Update runbook for failover", "To Do", 0],
    ["Demo Platform", "PLT-230", "Add health check alerts", "In Review", 1],
  ] as const;
  return (
    <TutorialScene
      step="The big idea"
      title="Many Jira spaces, one workspace"
      who={["Everyone"]}
      lines={[
        { at: 1.0, text: <>Register up to <b>five Jira sites</b>.</> },
        { at: 4.2, text: <>Each keeps its own searches, notes and reports. Switch from the <Key>SITE</Key> menu.</> },
        { at: 12.0, text: <><b>Combined Open Work</b> shows every site in one table.</> },
        { at: 19.0, text: <>One person, one token, every Jira space.</> },
      ]}
    >
      <div style={{ position: "relative" }}>
        <AppWindow active="Task Management" site={site}>
          <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <Pill color={combined ? colors.muted : colors.blue} style={{ fontSize: 18, padding: "5px 16px" }}>My Work</Pill>
              <Pill color={combined ? colors.blue : colors.muted} style={{ fontSize: 18, padding: "5px 16px" }}>
                Combined Open Work
              </Pill>
            </div>
            {combined ? (
              <Appear at={12.5}>
                <Panel title="Combined managed tasks · loaded 5 of 5">
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    {SITES.map((s) => (
                      <Pill key={s.name} color={s.color}>✓ {s.name}</Pill>
                    ))}
                  </div>
                  {rows.map(([s, key, summary, status, c], i) => (
                    <Appear key={key} at={13.2 + i * 0.45}>
                      <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 18, padding: "7px 0", borderTop: `1px solid ${colors.border}` }}>
                        <span style={{ width: 190 }}>
                          <Pill color={SITES[c].color}>{s}</Pill>
                        </span>
                        <span style={{ width: 90, fontWeight: 900, color: colors.blue }}>{key}</span>
                        <span style={{ flex: 1 }}>{summary}</span>
                        <span style={{ color: colors.muted }}>{status}</span>
                      </div>
                    </Appear>
                  ))}
                </Panel>
              </Appear>
            ) : (
              <Panel title="🗂️ The Docket">
                <div style={{ fontSize: 20, color: colors.muted }}>
                  Active site: <b style={{ color: colors.text }}>{site}</b>. Presets, notes and reports follow the site you pick.
                </div>
              </Panel>
            )}
          </div>
          {menu ? (
            <Appear
              at={4.0}
              out={10.6}
              style={{
                position: "absolute",
                left: 250,
                top: 4,
                width: 330,
                background: "white",
                border: `1px solid ${colors.border}`,
                borderRadius: 12,
                boxShadow: "0 24px 60px rgba(15,49,51,0.3)",
                padding: 10,
                zIndex: 6,
              }}
            >
              {SITES.map((s) => (
                <div
                  key={s.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    fontSize: 20,
                    fontWeight: 700,
                    borderRadius: 8,
                    background: s.name === site ? "#EAF3FB" : "transparent",
                  }}
                >
                  <span style={{ width: 14, height: 14, borderRadius: 7, background: s.color }} />
                  {s.name}
                </div>
              ))}
            </Appear>
          ) : null}
        </AppWindow>
      </div>
    </TutorialScene>
  );
};
