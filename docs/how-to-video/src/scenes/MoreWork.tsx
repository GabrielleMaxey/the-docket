import React from "react";
import { colors } from "../theme";
import {
  AppWindow,
  Appear,
  Button,
  Field,
  Key,
  Panel,
  Pill,
  TutorialScene,
  Typed,
  useSeconds,
} from "../ui";

const Tabs: React.FC<{ tabs: string[]; active: string }> = ({ tabs, active }) => (
  <div style={{ display: "flex", gap: 8 }}>
    {tabs.map((tab) => (
      <div
        key={tab}
        style={{
          fontSize: 18,
          fontWeight: 700,
          padding: "8px 16px",
          borderRadius: 8,
          background: tab === active ? "white" : "transparent",
          border: tab === active ? `2px solid ${colors.blue}` : "2px solid transparent",
          color: tab === active ? colors.blue : colors.muted,
        }}
      >
        {tab}
      </div>
    ))}
  </div>
);

const Check: React.FC<{ on: boolean }> = ({ on }) => (
  <span
    style={{
      display: "inline-block",
      width: 20,
      height: 20,
      borderRadius: 4,
      border: `2px solid ${on ? colors.blue : colors.grey}`,
      background: on ? colors.blue : "white",
      color: "white",
      fontSize: 14,
      textAlign: "center",
      lineHeight: "18px",
      flexShrink: 0,
    }}
  >
    {on ? "✓" : ""}
  </span>
);

const COMBINED_ROWS = [
  { site: "Mobile", key: "APP-142", summary: "Apple Pay button fails on iOS 18", status: "In Progress", pri: "P1", flag: "Now" },
  { site: "Platform", key: "OPS-77", summary: "Rotate staging certificates", status: "To Do", pri: "P2", flag: "Now" },
  { site: "Mobile", key: "APP-138", summary: "Cache cart totals between screens", status: "In Progress", pri: "P3", flag: "Next" },
  { site: "Platform", key: "OPS-81", summary: "Alert on queue backlog > 5 min", status: "Backlog", pri: "P6", flag: "" },
];

export const CombinedWorkScene: React.FC = () => {
  const t = useSeconds();
  const loaded = t > 9.8;
  const list = t > 17.8 && t < 20.2;
  const cols = list ? "110px 100px 1fr 140px" : "110px 100px 1fr 140px 64px 76px";
  return (
    <TutorialScene
      step="Daily driver"
      title="Combined Open Work"
      who={["Developers", "Project Managers"]}
      lines={[
        { at: 2.4, text: <>Task Management → <Key>Combined Open Work</Key>: everything assigned to you, across saved Jira sites.</> },
        { at: 12.4, text: <>One editable table with a Site column — or switch to List.</> },
        { at: 22.0, text: <>A partial or failed site means the list isn&apos;t complete.</> },
        { at: 25.7, text: <>Rank with Docket priority and flag <b>Now</b> or <b>Next</b> — planning signals that don&apos;t change Jira.</> },
      ]}
    >
      <AppWindow active="Task Management">
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <Tabs tabs={["My Work", "Team Bugs", "Combined Open Work"]} active="Combined Open Work" />
          <Panel>
            <div style={{ display: "flex", gap: 22, alignItems: "center", fontSize: 18, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, color: colors.muted }}>Saved sites:</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Check on /> Mobile</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Check on /> Platform</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Check on={false} /> Partner</span>
              <div style={{ flex: 1 }} />
              <Button pressed={t > 8.1 && t < 8.4}>{loaded ? "Refresh" : t > 8.4 ? "Loading…" : "Load open work"}</Button>
            </div>
          </Panel>
          {loaded ? (
            <Appear at={9.8}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                <Pill color={colors.green} style={{ fontSize: 17 }}>✓ Mobile · 2 open</Pill>
                <Pill
                  color={t > 22.2 ? colors.coral : colors.green}
                  style={{ fontSize: 17, background: t > 22.2 ? `${colors.coral}1F` : undefined }}
                >
                  {t > 22.2 ? "⚠ Platform · partial (2 loaded)" : "✓ Platform · 2 open"}
                </Pill>
                <div style={{ flex: 1 }} />
                <div style={{ display: "flex", border: `1px solid ${colors.border}`, borderRadius: 8, overflow: "hidden" }}>
                  {["Managed tasks", "List"].map((m) => {
                    const on = (m === "List") === list;
                    return (
                      <div
                        key={m}
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          padding: "6px 14px",
                          background: on ? colors.blue : "white",
                          color: on ? "white" : colors.text,
                        }}
                      >
                        {m}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ background: "white", border: `1px solid ${colors.border}`, borderRadius: 12, overflow: "hidden", fontSize: 17 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: cols,
                    gap: 10,
                    padding: "10px 14px",
                    background: "#F0F4F7",
                    fontWeight: 900,
                  }}
                >
                  <span>Site</span>
                  <span>Key</span>
                  <span>Summary</span>
                  <span>Status</span>
                  {!list ? <span>Priority</span> : null}
                  {!list ? <span>Flag</span> : null}
                </div>
                {COMBINED_ROWS.map((r, i) => (
                  <Appear key={r.key} at={10.0 + i * 0.15}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: cols,
                        gap: 10,
                        padding: list ? "8px 14px" : "14px 14px",
                        alignItems: "center",
                        borderTop: `1px solid ${colors.border}`,
                      }}
                    >
                      <Pill color={r.site === "Mobile" ? colors.teal : "#7C3AED"} style={{ fontSize: 15 }}>
                        {r.site}
                      </Pill>
                      <span style={{ color: colors.blue, fontWeight: 700 }}>{r.key}</span>
                      <span>{r.summary}</span>
                      <span>{r.status}</span>
                      {!list ? <span style={{ fontWeight: 900 }}>{t > 26.0 ? r.pri : "—"}</span> : null}
                      {!list ? (
                        <span>
                          {r.flag && t > 28.6 + i * 0.4 ? (
                            <Pill color={r.flag === "Now" ? colors.coral : colors.orange} style={{ fontSize: 15 }}>
                              {r.flag}
                            </Pill>
                          ) : (
                            <span style={{ color: colors.grey }}>—</span>
                          )}
                        </span>
                      ) : null}
                    </div>
                  </Appear>
                ))}
              </div>
            </Appear>
          ) : null}
        </div>
      </AppWindow>
    </TutorialScene>
  );
};

export const WorkbookScene: React.FC = () => {
  const t = useSeconds();
  const previewed = t > 10.6;
  const downloaded = t > 15.6;
  return (
    <TutorialScene
      step="Share a snapshot"
      title="Download a task workbook"
      who={["Project Managers", "Executives"]}
      lines={[
        { at: 0.8, text: <>Below the results, click <Key>Download tasks</Key>.</> },
        { at: 3.2, text: <>Pick saved sites, their projects or presets, and optional filters.</> },
        { at: 10.0, text: <><b>Review snapshot</b>, then <b>Download workbook</b> — one sheet per site.</> },
        { at: 19.0, text: <>It&apos;s a snapshot, not a live sync. Share via your approved process (e.g. SharePoint).</> },
      ]}
    >
      <AppWindow active="Task Management">
        <div style={{ position: "absolute", inset: 0, background: "rgba(15,49,51,0.35)" }} />
        <div
          style={{
            position: "absolute",
            left: 50,
            right: 50,
            top: 24,
            bottom: 24,
            background: "white",
            borderRadius: 16,
            padding: 26,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            boxShadow: "0 30px 70px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 900 }}>Download tasks</div>
          {[
            { name: "Mobile", scope: "Projects: APP", source: "Local", on: true },
            { name: "Platform", scope: "Saved preset: My Work", source: "Local", on: true },
            { name: "Partner", scope: "—", source: "Local", on: false },
          ].map((e, i) => (
            <Appear key={e.name} at={2.0 + i * 0.3}>
              <div
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "center",
                  fontSize: 18,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  opacity: e.on ? 1 : 0.55,
                }}
              >
                <Check on={e.on} />
                <b style={{ width: 100 }}>{e.name}</b>
                <span style={{ flex: 1, color: colors.muted }}>{e.scope}</span>
                <span style={{ display: "flex", border: `1px solid ${colors.border}`, borderRadius: 6, overflow: "hidden", fontSize: 15 }}>
                  <span style={{ padding: "3px 10px", background: colors.teal, color: "white" }}>Local</span>
                  <span style={{ padding: "3px 10px" }}>Team</span>
                </span>
              </div>
            </Appear>
          ))}
          <Appear at={4.6}>
            <div style={{ display: "flex", gap: 12 }}>
              <Field label="Completed work" value="Exclude" style={{ flex: 1 }} />
              <Field label="Docket priority" value="All priorities" style={{ flex: 1 }} />
              <Field label="Now / Next" value={t > 7 ? "Now" : "Any"} style={{ flex: 1 }} />
            </div>
          </Appear>
          {previewed ? (
            <Appear at={10.6}>
              <div style={{ border: `1px solid ${colors.border}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ background: "#F0F4F7", padding: "8px 14px", fontSize: 16, display: "flex", gap: 10, alignItems: "center" }}>
                  <b>Snapshot 10:42</b>
                  <Pill color={colors.green} style={{ fontSize: 14 }}>Mobile complete</Pill>
                  <Pill color={colors.green} style={{ fontSize: 14 }}>Platform complete</Pill>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px 1fr 110px 170px 190px",
                    gap: 8,
                    padding: "8px 14px",
                    fontSize: 15,
                    fontWeight: 900,
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <span>Key</span>
                  <span>Summary</span>
                  <span>Status</span>
                  <span>Docket local notes</span>
                  <span>Latest Jira comment</span>
                </div>
                {[
                  ["APP-142", "Apple Pay button fails on iOS 18", "In Progress", "Fix in PR #88", "Repro on iPhone 15 — Dana"],
                  ["APP-138", "Cache cart totals between screens", "In Progress", "Pair w/ Marcus", "—"],
                ].map((r) => (
                  <div
                    key={r[0]}
                    style={{ display: "grid", gridTemplateColumns: "90px 1fr 110px 170px 190px", gap: 8, padding: "7px 14px", fontSize: 15 }}
                  >
                    {r.map((c, j) => (
                      <span key={j} style={{ color: j === 0 ? colors.blue : colors.text }}>{c}</span>
                    ))}
                  </div>
                ))}
                <div style={{ display: "flex", gap: 4, padding: "6px 14px 10px", fontSize: 14 }}>
                  {["Mobile", "Platform"].map((s, i) => (
                    <span
                      key={s}
                      style={{
                        padding: "3px 12px",
                        borderRadius: "0 0 6px 6px",
                        background: i === 0 ? colors.green : "#E5EAEE",
                        color: i === 0 ? "white" : colors.muted,
                        fontWeight: 700,
                      }}
                    >
                      sheet: {s}
                    </span>
                  ))}
                </div>
              </div>
            </Appear>
          ) : null}
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <Button variant="ghost" pressed={t > 9.8 && t < 10.1}>Review snapshot</Button>
            <Button pressed={t > 15.0 && t < 15.3} style={{ opacity: previewed ? 1 : 0.45 }}>
              Download workbook
            </Button>
          </div>
        </div>
        {downloaded ? (
          <Appear
            at={15.6}
            style={{
              position: "absolute",
              left: 230,
              right: 230,
              top: 90,
              background: colors.teal,
              color: "white",
              borderRadius: 12,
              padding: "16px 22px",
              fontSize: 21,
              fontWeight: 700,
              zIndex: 5,
              boxShadow: "0 16px 40px rgba(0,0,0,0.3)",
            }}
          >
            ✓ Saved docket-tasks-2026-10-19.xlsx
          </Appear>
        ) : null}
      </AppWindow>
    </TutorialScene>
  );
};

type AskRow = { title: string; who: string; note: string };

const AskActions: React.FC<{ closed: boolean; pressed?: string }> = ({ closed, pressed }) => (
  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
    {(closed ? ["Reopen", "Delete"] : ["Edit", "Delete", "Create a task", "Done", "Cancel"]).map((a) => (
      <Button
        key={a}
        variant={a === "Create a task" ? "primary" : "ghost"}
        pressed={pressed === a}
        style={{ fontSize: 13, padding: "4px 9px" }}
      >
        {a}
      </Button>
    ))}
  </span>
);

export const AsksScene: React.FC = () => {
  const t = useSeconds();
  const added = t > 6.0;
  const firstDone = t > 15.0;
  const secondCanceled = t > 19.6;
  const rows: (AskRow & { status: string; key: string; pressed?: string })[] = [
    ...(added
      ? [
          {
            title: "Exec demo of mobile checkout",
            who: "VP Product",
            note: "Demo build by Nov 7",
            status: firstDone ? "Done" : "Open",
            key: firstDone ? "APP-160" : "",
            pressed: t > 9.4 && t < 9.7 ? "Create a task" : undefined,
          },
        ]
      : []),
    {
      title: "Dark mode for reports",
      who: "PO – Platform",
      note: "Nice-to-have for Q1",
      status: secondCanceled ? "Canceled" : "Open",
      key: "",
      pressed: t > 19.3 && t < 19.6 ? "Cancel" : undefined,
    },
    { title: "Q4 roadmap one-pager", who: "CTO", note: "Sent Oct 12", status: "Done", key: "" },
  ];
  const sorted = [...rows].sort((a, b) => Number(a.status !== "Open") - Number(b.status !== "Open"));
  return (
    <TutorialScene
      step="Plan capacity"
      title="Asks: track stakeholder requests"
      who={["Project Managers"]}
      lines={[
        { at: 0.8, text: <>Log exec and product-owner asks before they become Jira work.</> },
        { at: 8.6, text: <><Key>Create a task</Key> opens Create Issue prefilled; the ask is marked Done and linked to the new key.</> },
        { at: 18.2, text: <>Or mark it <b>Done</b> or <b>Canceled</b> — reopen anytime.</> },
        { at: 22.0, text: <>Stays on this machine; Download CSV to share.</> },
      ]}
    >
      <div style={{ position: "relative" }}>
        <AppWindow active="Project Managers">
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <Tabs tabs={["Capacity", "Gantt", "Asks"]} active="Asks" />
            <div style={{ fontSize: 16, color: colors.muted }}>
              Personal parking lot for project asks — not issues yet. This machine only. Notes are not pushed to Jira.
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <Field value={added ? "" : <Typed text="Exec demo of mobile checkout" from={1.6} to={3.4} />} style={{ flex: 1.4 }} label="Title" />
              <Field value={added ? "" : <Typed text="VP Product" from={3.6} to={4.4} />} style={{ flex: 0.8 }} label="Who asked" />
              <Field value={added ? "" : <Typed text="Demo build by Nov 7" from={4.6} to={5.4} />} style={{ flex: 1 }} label="Note" />
              <Button pressed={t > 5.7 && t < 6.0}>Add</Button>
              <Button variant="ghost">Download CSV</Button>
            </div>
            <div style={{ background: "white", border: `1px solid ${colors.border}`, borderRadius: 12, overflow: "hidden", fontSize: 16 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.1fr 0.7fr 78px 72px 0.8fr 392px",
                  gap: 8,
                  padding: "10px 12px",
                  background: "#F0F4F7",
                  fontWeight: 900,
                }}
              >
                <span>Title</span>
                <span>Who asked</span>
                <span>Status</span>
                <span>Jira key</span>
                <span>Note</span>
                <span />
              </div>
              {sorted.map((r) => {
                const closed = r.status !== "Open";
                return (
                  <div
                    key={r.title}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.1fr 0.7fr 78px 72px 0.8fr 392px",
                      gap: 8,
                      padding: "12px 12px",
                      alignItems: "center",
                      borderTop: `1px solid ${colors.border}`,
                      color: closed ? colors.muted : colors.text,
                      background: closed ? "#FAFBFC" : "white",
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{r.title}</span>
                    <span>{r.who}</span>
                    <span>
                      {closed ? (
                        <Pill color={r.status === "Done" ? colors.green : colors.muted} style={{ fontSize: 14 }}>
                          {r.status}
                        </Pill>
                      ) : (
                        "Open"
                      )}
                    </span>
                    <span style={{ color: colors.blue, fontWeight: 700, textDecoration: r.key ? "underline" : "none" }}>
                      {r.key || "—"}
                    </span>
                    <span>{r.note}</span>
                    <AskActions closed={closed} pressed={r.pressed} />
                  </div>
                );
              })}
            </div>
          </div>
        </AppWindow>
        {t > 9.8 && t < 14.8 ? (
          <Appear
            at={9.8}
            out={14.4}
            style={{
              position: "absolute",
              left: 170,
              right: 170,
              top: 230,
              background: "white",
              borderRadius: 16,
              padding: 26,
              boxShadow: "0 30px 70px rgba(0,0,0,0.35)",
              zIndex: 10,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 900 }}>Create Issue</div>
            <div style={{ fontSize: 15, color: colors.muted }}>Opened from Asks — details filled in</div>
            <Field label="Title" value="Exec demo of mobile checkout" />
            <Field label="Description" value="Demo build by Nov 7" />
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
              {t > 12.6 ? <Pill color={colors.green} style={{ fontSize: 16 }}>✓ Created APP-160</Pill> : null}
              <Button pressed={t > 12.2 && t < 12.5}>Create</Button>
            </div>
          </Appear>
        ) : null}
      </div>
    </TutorialScene>
  );
};
