import React from "react";
import { colors } from "../theme";
import {
  AppWindow,
  Appear,
  Button,
  Cursor,
  Donut,
  Key,
  Panel,
  Pill,
  Spotlight,
  TutorialScene,
  Typed,
  useProgress,
  useSeconds,
} from "../ui";

const Kpi: React.FC<{ at: number; label: string; value: number; color: string }> = ({
  at,
  label,
  value,
  color,
}) => {
  const p = useProgress(at, at + 1.2);
  return (
    <Appear at={at} style={{ flex: 1 }}>
      <div
        style={{
          background: "white",
          border: `1px solid ${colors.border}`,
          borderTop: `6px solid ${color}`,
          borderRadius: 12,
          padding: "16px 18px",
        }}
      >
        <div style={{ fontSize: 44, fontWeight: 900, color }}>{Math.round(value * p)}%</div>
        <div style={{ fontSize: 17, color: colors.muted, fontWeight: 700 }}>{label}</div>
      </div>
    </Appear>
  );
};

const SLICES = [
  { label: "Resolved / Done", value: 68, color: "#1592DB" },
  { label: "Backlog", value: 21, color: "#A9B1B9" },
  { label: "In Progress", value: 6, color: "#FB8C2B" },
  { label: "Ready for Verification", value: 3, color: "#2AE0E0" },
  { label: "Ready for Work", value: 2, color: "#FDD219" },
];

export const MetricsScene: React.FC = () => {
  const t = useSeconds();
  const donut = useProgress(4.0, 6.0);
  const reportsTab = t > 12.6;
  return (
    <TutorialScene
      step="See the big picture"
      title="Metrics: project health at a glance"
      who={["Project Managers", "Executives"]}
      lines={[
        { at: 0.8, text: <>Choose projects (your presets), then <Key>Refresh status</Key>.</> },
        { at: 4.2, text: <>See % resolved, in progress, backlog and overdue — per project.</> },
        { at: 8.4, text: <>Click any person or issue key to jump to that work.</> },
        {
          at: 12.4,
          text: (
            <>
              <b>Reports</b> tab: an Executive, PM or Developer summary in one click.
            </>
          ),
        },
      ]}
    >
      <div style={{ position: "relative" }}>
        <AppWindow active="Metrics">
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {["Project metrics", "Individual contributors", "Reports"].map((tab) => {
                const on = reportsTab ? tab === "Reports" : tab === "Project metrics";
                return (
                  <div
                    key={tab}
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      padding: "8px 16px",
                      borderRadius: 8,
                      background: on ? "white" : "transparent",
                      border: on ? `2px solid ${colors.blue}` : `2px solid transparent`,
                      color: on ? colors.blue : colors.muted,
                    }}
                  >
                    {tab}
                  </div>
                );
              })}
              <div style={{ flex: 1 }} />
              <Button pressed={t > 2.2 && t < 2.5}>{t > 2.5 && t < 3.8 ? "Refreshing…" : "Refresh status"}</Button>
            </div>
            {!reportsTab ? (
              <>
                <div style={{ display: "flex", gap: 10, fontSize: 17 }}>
                  <Pill color={colors.blue} style={{ fontSize: 17, padding: "6px 14px" }}>✓ Mobile Checkout Revamp</Pill>
                  <Pill color={colors.blue} style={{ fontSize: 17, padding: "6px 14px" }}>✓ Platform Reliability</Pill>
                  <Pill color={colors.muted} style={{ fontSize: 17, padding: "6px 14px" }}>Partner API</Pill>
                </div>
                <div style={{ display: "flex", gap: 14 }}>
                  <Kpi at={3.9} label="Tasks resolved" value={68} color="#1592DB" />
                  <Kpi at={4.1} label="In progress" value={6} color={colors.orange} />
                  <Kpi at={4.3} label="In backlog" value={21} color={colors.muted} />
                  <Kpi at={4.5} label="Open & overdue" value={9} color={colors.coral} />
                </div>
                <Panel title="Mobile Checkout Revamp · Epic APP-100">
                  <div style={{ display: "flex", gap: 30, alignItems: "center" }}>
                    <Donut size={230} slices={SLICES} progress={donut} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, fontSize: 18 }}>
                      {SLICES.map((s) => (
                        <div key={s.label} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                          <span style={{ width: 16, height: 16, borderRadius: 8, background: s.color }} />
                          <span style={{ flex: 1 }}>{s.label}</span>
                          <b>{s.value}%</b>
                        </div>
                      ))}
                      <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ color: colors.muted }}>Overdue:</span>
                        <span style={{ color: colors.blue, fontWeight: 700, textDecoration: "underline" }}>APP-142</span>
                        <span style={{ color: colors.blue, fontWeight: 700, textDecoration: "underline" }}>Dana Ortiz (3)</span>
                      </div>
                    </div>
                  </div>
                </Panel>
              </>
            ) : (
              <Appear at={12.6}>
                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  {[
                    ["Executive Summary", "Highlights, risks, actions"],
                    ["Project Manager Summary", "Deadlines & delay risk"],
                    ["Developer Report", "Workload & WIP"],
                  ].map(([a, b], i) => (
                    <div
                      key={a}
                      style={{
                        flex: 1,
                        background: "white",
                        borderRadius: 12,
                        padding: 16,
                        border: i === 0 ? `3px solid ${colors.blue}` : `1px solid ${colors.border}`,
                      }}
                    >
                      <div style={{ fontSize: 20, fontWeight: 900 }}>{a}</div>
                      <div style={{ fontSize: 16, color: colors.muted }}>{b}</div>
                    </div>
                  ))}
                </div>
                <Panel title="Executive Summary · Week of Oct 19">
                  <div style={{ fontSize: 19, lineHeight: 1.55 }}>
                    <Appear at={13.6}>
                      <b>Highlights:</b> Mobile Checkout is 68% complete and on track for the Nov 14 launch.
                    </Appear>
                    <Appear at={14.3}>
                      <b style={{ color: colors.coral }}>Risks:</b> 9% of open tasks are overdue — mostly
                      payment integration (APP-142).
                    </Appear>
                    <Appear at={15.0}>
                      <b>Actions:</b> Confirm wallet provider by Wed; move 2 backlog items to next quarter.
                    </Appear>
                  </div>
                </Panel>
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <Button variant="ghost">Copy</Button>
                  <Button variant="ghost">Download .md</Button>
                </div>
              </Appear>
            )}
          </div>
        </AppWindow>
        <Spotlight x={384} y={620} w={200} h={26} from={8.6} to={11.4} label="Jumps to Task Management" />
        <Cursor
          points={[
            { t: 1.4, x: 600, y: 500 },
            { t: 2.2, x: 940, y: 148, click: true },
            { t: 8.8, x: 420, y: 634 },
            { t: 11.8, x: 520, y: 400 },
            { t: 12.4, x: 470, y: 148, click: true },
            { t: 13.2, x: 184, y: 220, click: true },
          ]}
        />
      </div>
    </TutorialScene>
  );
};

const Cap: React.FC<{ at: number; name: string; open: number; cap: number; flags: string[] }> = ({
  at,
  name,
  open,
  cap,
  flags,
}) => {
  const p = useProgress(at, at + 1);
  const ratio = open / cap;
  const color = ratio > 1 ? colors.coral : ratio >= 0.85 ? colors.orange : colors.green;
  const label = ratio > 1 ? "Over" : ratio >= 0.85 ? "Near" : "OK";
  return (
    <Appear at={at} style={{ flex: 1 }}>
      <div style={{ background: "white", borderRadius: 12, border: `1px solid ${colors.border}`, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 21, fontWeight: 900 }}>{name}</div>
          <Pill color={color}>{label}</Pill>
        </div>
        <div style={{ fontSize: 17, color: colors.muted, margin: "8px 0" }}>
          {open} open / capacity {cap}
        </div>
        <div style={{ height: 12, borderRadius: 6, background: "#E5EAEE", overflow: "hidden" }}>
          <div style={{ width: `${Math.min(1, ratio) * 100 * p}%`, height: "100%", background: color }} />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          {flags.map((f) => (
            <Pill key={f} color={colors.coral} style={{ fontSize: 14 }}>
              {f}
            </Pill>
          ))}
        </div>
      </div>
    </Appear>
  );
};

const BARS = [
  { key: "APP-142", start: 0.05, len: 0.25, color: colors.coral, status: "Overdue" },
  { key: "APP-138", start: 0.15, len: 0.35, color: colors.orange, status: "In Progress" },
  { key: "APP-131", start: 0.35, len: 0.3, color: "#FDD219", status: "Ready for Work" },
  { key: "APP-127", start: 0.55, len: 0.35, color: "#A9B1B9", status: "Backlog" },
  { key: "OPS-77", start: 0.1, len: 0.2, color: "#1592DB", status: "Done" },
];

export const ProjectManagersScene: React.FC = () => {
  const t = useSeconds();
  const gantt = t > 8.2;
  return (
    <TutorialScene
      step="Plan capacity"
      title="Project Managers tab"
      who={["Project Managers"]}
      lines={[
        { at: 0.8, text: <>Compare each person&apos;s open work to a capacity target.</> },
        { at: 4.2, text: <>Spot <b>overdue</b>, <b>blocked</b> and <b>stale</b> work before it slips.</> },
        { at: 8.4, text: <><Key>Gantt</Key>: timelines grouped by status or story.</> },
        { at: 12.6, text: <>Export .md / .csv, or save the view to Past Reports.</> },
      ]}
    >
      <AppWindow active="Project Managers">
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 10 }}>
            {["Capacity", "Gantt", "Asks"].map((tab) => {
              const on = gantt ? tab === "Gantt" : tab === "Capacity";
              return (
                <div
                  key={tab}
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    padding: "8px 16px",
                    borderRadius: 8,
                    background: on ? "white" : "transparent",
                    border: on ? `2px solid ${colors.blue}` : "2px solid transparent",
                    color: on ? colors.blue : colors.muted,
                  }}
                >
                  {tab}
                </div>
              );
            })}
            <div style={{ flex: 1 }} />
            <Button variant="ghost">Save to Reports</Button>
            <Button variant="ghost">.csv</Button>
          </div>
          {!gantt ? (
            <>
              <div style={{ display: "flex", gap: 14 }}>
                <Cap at={1.2} name="Priya Shah" open={12} cap={10} flags={["2 overdue", "1 blocked"]} />
                <Cap at={1.6} name="Marcus Lee" open={7} cap={10} flags={[]} />
              </div>
              <div style={{ display: "flex", gap: 14 }}>
                <Cap at={2.0} name="Dana Ortiz" open={9} cap={10} flags={["3 stale"]} />
                <Cap at={2.4} name="Sam Okafor" open={5} cap={8} flags={[]} />
              </div>
              <Appear at={4.6}>
                <Panel title="⚠ Risk signals">
                  <div style={{ fontSize: 19, lineHeight: 1.6 }}>
                    Priya is 20% over capacity · APP-142 blocked 4 days · 3 tickets untouched for 14+ days
                  </div>
                </Panel>
              </Appear>
            </>
          ) : (
            <Appear at={8.2}>
              <Panel title="Gantt · Pinned issues · 3 mo">
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", fontSize: 15, color: colors.muted, paddingLeft: 120 }}>
                    {["Oct", "Nov", "Dec"].map((m) => (
                      <div key={m} style={{ flex: 1 }}>{m}</div>
                    ))}
                  </div>
                  {BARS.map((b, i) => (
                    <GanttBar key={b.key} at={8.6 + i * 0.3} label={b.key} start={b.start} len={b.len} color={b.color} />
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    {["Overdue", "In Progress", "Ready for Work", "Backlog", "Done"].map((s) => (
                      <Pill key={s} color={colors.muted}>{s}</Pill>
                    ))}
                  </div>
                </div>
              </Panel>
            </Appear>
          )}
        </div>
      </AppWindow>
    </TutorialScene>
  );
};

const GanttBar: React.FC<{ at: number; label: string; start: number; len: number; color: string }> = ({
  at,
  label,
  start,
  len,
  color,
}) => {
  const p = useProgress(at, at + 0.8);
  return (
    <div style={{ display: "flex", alignItems: "center", height: 36 }}>
      <div style={{ width: 120, fontSize: 17, fontWeight: 700, color: colors.blue }}>{label}</div>
      <div style={{ flex: 1, position: "relative", height: 26, background: "#F0F4F7", borderRadius: 6 }}>
        <div
          style={{
            position: "absolute",
            left: `${start * 100}%`,
            width: `${len * 100 * p}%`,
            height: "100%",
            borderRadius: 6,
            background: color,
          }}
        />
      </div>
    </div>
  );
};

export const ChatScene: React.FC = () => {
  const t = useSeconds();
  return (
    <TutorialScene
      step="Ask anything"
      title="Chat: Jira in plain English"
      who={["Everyone"]}
      lines={[
        { at: 0.8, text: <>Ask about your queries, metrics, reports — or any issue.</> },
        { at: 5.4, text: <>Answers come from data you&apos;ve loaded, and it says when it doesn&apos;t know.</> },
        { at: 10.0, text: <>Click <b>Save to Past Reports</b> to keep a useful answer.</> },
      ]}
    >
      <div style={{ position: "relative" }}>
        <AppWindow active="Chat">
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", padding: 24, gap: 18 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <Pill color={colors.blue} style={{ fontSize: 16 }}>Mobile Checkout Revamp</Pill>
              <Pill color={colors.blue} style={{ fontSize: 16 }}>Platform Reliability</Pill>
            </div>
            {t > 3.4 ? (
              <Appear at={3.4} style={{ alignSelf: "flex-end", maxWidth: 600 }}>
                <div
                  style={{
                    background: colors.blue,
                    color: "white",
                    padding: "16px 22px",
                    borderRadius: "18px 18px 4px 18px",
                    fontSize: 22,
                  }}
                >
                  What&apos;s at risk for the November launch?
                </div>
              </Appear>
            ) : null}
            {t > 4.6 ? (
              <Appear at={4.6} style={{ alignSelf: "flex-start", maxWidth: 780 }}>
                <div
                  style={{
                    background: "white",
                    border: `1px solid ${colors.border}`,
                    padding: "18px 24px",
                    borderRadius: "18px 18px 18px 4px",
                    fontSize: 21,
                    lineHeight: 1.5,
                  }}
                >
                  {t < 5.4 ? (
                    <span style={{ color: colors.muted }}>Thinking…</span>
                  ) : (
                    <>
                      <Appear at={5.4}>Two items could delay the Nov 14 launch:</Appear>
                      <Appear at={6.2}>
                        • <b style={{ color: colors.blue }}>APP-142</b> Apple Pay fix — overdue 4 days, blocked on vendor.
                      </Appear>
                      <Appear at={7.0}>
                        • <b style={{ color: colors.blue }}>APP-138</b> cart caching — in progress, due Oct 30.
                      </Appear>
                      <Appear at={7.8}>Everything else in the epic is on track (68% resolved).</Appear>
                      <Appear at={9.6}>
                        <div style={{ marginTop: 12 }}>
                          <Button variant="ghost" pressed={t > 10.6 && t < 10.9} style={{ fontSize: 16, padding: "6px 14px" }}>
                            {t > 10.9 ? "✓ Saved" : "Save to Past Reports"}
                          </Button>
                        </div>
                      </Appear>
                    </>
                  )}
                </div>
              </Appear>
            ) : null}
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 12 }}>
              <div
                style={{
                  flex: 1,
                  border: `2px solid ${t < 3.4 ? colors.blue : colors.border}`,
                  borderRadius: 12,
                  padding: "14px 18px",
                  fontSize: 21,
                  background: "white",
                }}
              >
                {t < 3.4 ? (
                  <Typed text="What's at risk for the November launch?" from={1.2} to={3.0} />
                ) : (
                  <span style={{ color: colors.muted }}>Ask about your Jira work…</span>
                )}
              </div>
              <Button pressed={t > 3.1 && t < 3.4}>Send</Button>
            </div>
          </div>
        </AppWindow>
        <Cursor
          points={[
            { t: 2.4, x: 700, y: 600 },
            { t: 3.1, x: 972, y: 746, click: true },
            { t: 9.8, x: 500, y: 600 },
            { t: 10.6, x: 94, y: 434, click: true },
          ]}
        />
      </div>
    </TutorialScene>
  );
};

export const PastReportsScene: React.FC = () => (
  <TutorialScene
    step="Nothing gets lost"
    title="Past Reports"
    who={["Everyone"]}
    lines={[
      { at: 0.8, text: <>Every report, week plan and saved chat answer — stored on this machine.</> },
      { at: 4.0, text: <>Open one to read, copy, or download as Markdown to share.</> },
    ]}
  >
    <AppWindow active="Past Reports">
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 10 }}>
          {["Task Management", "Dashboard", "Ad-hoc", "Files"].map((tab, i) => (
            <div
              key={tab}
              style={{
                fontSize: 18,
                fontWeight: 700,
                padding: "8px 16px",
                borderRadius: 8,
                background: i === 1 ? "white" : "transparent",
                border: i === 1 ? `2px solid ${colors.blue}` : "2px solid transparent",
                color: i === 1 ? colors.blue : colors.muted,
              }}
            >
              {tab}
            </div>
          ))}
        </div>
        {[
          ["Executive Summary", "Mobile Checkout Revamp", "Oct 19"],
          ["Project Manager Summary", "Platform Reliability", "Oct 16"],
          ["Developer Report", "All selected projects", "Oct 12"],
          ["Executive Summary", "Mobile Checkout Revamp", "Oct 12"],
          ["Weekly digest", "All selected projects", "Oct 9"],
        ].map(([a, b, d], i) => (
          <Appear key={a + d} at={1.0 + i * 0.3}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                background: "white",
                border: `1px solid ${colors.border}`,
                borderRadius: 12,
                padding: "16px 20px",
                fontSize: 20,
              }}
            >
              <span style={{ fontSize: 26 }}>📄</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900 }}>{a}</div>
                <div style={{ color: colors.muted, fontSize: 17 }}>{b}</div>
              </div>
              <span style={{ color: colors.muted }}>{d}</span>
              <Button variant="ghost" style={{ fontSize: 16, padding: "6px 14px" }}>View</Button>
              <Button variant="ghost" style={{ fontSize: 16, padding: "6px 14px" }}>Download .md</Button>
            </div>
          </Appear>
        ))}
      </div>
    </AppWindow>
  </TutorialScene>
);
