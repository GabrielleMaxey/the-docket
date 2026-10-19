import React from "react";
import { colors, monoFamily } from "../theme";
import {
  AppWindow,
  Appear,
  Button,
  Cursor,
  Field,
  Key,
  Panel,
  Pill,
  Spotlight,
  TutorialScene,
  Typed,
  useSeconds,
} from "../ui";

const ROWS = [
  { key: "APP-142", summary: "Apple Pay button fails on iOS 18", status: "To Do", pri: "P1", glow: "#FDE2DC" },
  { key: "APP-138", summary: "Cache cart totals between screens", status: "In Progress", pri: "P2", glow: "#FFEBD6" },
  { key: "APP-131", summary: "Add analytics to checkout funnel", status: "Ready for Work", pri: "P4", glow: "#FFF8DA" },
  { key: "APP-127", summary: "Update address form validation", status: "Backlog", pri: "P7", glow: "white" },
];

export const TaskManagementScene: React.FC = () => {
  const t = useSeconds();
  const loaded = t > 5.4;
  const statusChanged = t > 9.6;
  const pushed = t > 17.2;
  return (
    <TutorialScene
      step="Daily driver"
      title="Task Management"
      who={["Developers", "Project Managers"]}
      lines={[
        {
          at: 0.8,
          text: (
            <>
              Pick a saved preset, then <Key>Run JQL</Key> <span style={{ color: colors.muted }}>(⌘/Ctrl + Enter)</span>.
            </>
          ),
        },
        { at: 6.0, text: <>Change status, assignee or dates — it saves straight to Jira.</> },
        { at: 11.0, text: <>Rank with your own priority (P1–P20) and jot notes in Markdown.</> },
        { at: 15.0, text: <>Tick a row and <b>Push note</b> to post it as a Jira comment.</> },
        { at: 19.5, text: <>Up to five queries, each in its own tab. Plus a to-do list &amp; calendar.</> },
      ]}
    >
      <div style={{ position: "relative" }}>
        <AppWindow active="Task Management">
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <Panel title="🗂️ The Docket">
              <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                <Field label="Quick pick" value={t > 2.0 ? "My Work" : "Choose preset…"} style={{ width: 200 }} />
                <Field
                  label="JQL"
                  mono
                  value={t > 2.0 ? "assignee = currentUser() AND resolution = Unresolved" : ""}
                  style={{ flex: 1 }}
                />
                <Button pressed={t > 3.6 && t < 3.9}>{t > 3.9 && !loaded ? "Running…" : "Run JQL"}</Button>
              </div>
            </Panel>
            {loaded ? (
              <Appear at={5.4}>
                <div style={{ fontSize: 17, color: colors.muted, marginBottom: 8 }}>Loaded 4 of 4 matched</div>
                <div
                  style={{
                    background: "white",
                    border: `1px solid ${colors.border}`,
                    borderRadius: 12,
                    overflow: "hidden",
                    fontSize: 17,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "36px 96px 1fr 170px 70px 230px",
                      gap: 10,
                      padding: "10px 14px",
                      background: "#F0F4F7",
                      fontWeight: 900,
                    }}
                  >
                    <span />
                    <span>Key</span>
                    <span>Summary</span>
                    <span>Status</span>
                    <span>Priority</span>
                    <span>Notes</span>
                  </div>
                  {ROWS.map((r, i) => (
                    <Appear key={r.key} at={5.5 + i * 0.15}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "36px 96px 1fr 170px 70px 230px",
                          gap: 10,
                          padding: "12px 14px",
                          alignItems: "center",
                          borderTop: `1px solid ${colors.border}`,
                          background: r.glow,
                          minHeight: 64,
                        }}
                      >
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 4,
                            border: `2px solid ${colors.grey}`,
                            background: i === 0 && t > 15.6 ? colors.blue : "white",
                            color: "white",
                            fontSize: 14,
                            textAlign: "center",
                            lineHeight: "18px",
                          }}
                        >
                          {i === 0 && t > 15.6 ? "✓" : ""}
                        </span>
                        <span style={{ color: colors.blue, fontWeight: 700 }}>{r.key}</span>
                        <span>{r.summary}</span>
                        <span
                          style={{
                            border: `1px solid ${colors.border}`,
                            borderRadius: 6,
                            padding: "5px 8px",
                            background: "white",
                          }}
                        >
                          {i === 0 && statusChanged ? "In Progress" : r.status} ▾
                        </span>
                        <span style={{ fontWeight: 900 }}>{i === 0 && t > 12.4 ? "P1" : r.pri}</span>
                        <span
                          style={{
                            border: `1px solid ${colors.border}`,
                            borderRadius: 6,
                            padding: "5px 8px",
                            background: "white",
                            fontSize: 15,
                            minHeight: 22,
                          }}
                        >
                          {i === 0 ? (
                            pushed ? (
                              <span style={{ color: colors.muted }}>—</span>
                            ) : (
                              <Typed text="Repro'd on iPhone 15. Fix in PR #88." from={12.8} to={14.6} />
                            )
                          ) : null}
                        </span>
                      </div>
                    </Appear>
                  ))}
                </div>
                <div style={{ marginTop: 14, display: "flex", gap: 12 }}>
                  <Button pressed={t > 16.6 && t < 16.9}>Push Selected</Button>
                  <Button variant="ghost">Load remaining</Button>
                </div>
              </Appear>
            ) : null}
          </div>
        </AppWindow>
        {statusChanged && t < 11 ? (
          <div
            style={{
              position: "absolute",
              left: 690,
              top: 404,
              zIndex: 20,
            }}
          >
            <Pill color={colors.green} style={{ fontSize: 18, background: "white" }}>
              ✓ Updated in Jira
            </Pill>
          </div>
        ) : null}
        {pushed && t < 20 ? (
          <div
            style={{
              position: "absolute",
              left: 300,
              bottom: 40,
              zIndex: 20,
              background: colors.teal,
              color: "white",
              padding: "16px 26px",
              borderRadius: 12,
              fontSize: 22,
              fontWeight: 700,
              boxShadow: "0 16px 40px rgba(0,0,0,0.3)",
            }}
          >
            ✓ Note posted as a comment on APP-142
          </div>
        ) : null}
        <Spotlight x={22} y={234} w={200} h={44} from={1.0} to={2.4} label="Your saved presets" />
        <Cursor
          points={[
            { t: 1.0, x: 600, y: 600 },
            { t: 1.8, x: 134, y: 256, click: true },
            { t: 3.6, x: 942, y: 256, click: true },
            { t: 7.6, x: 600, y: 480 },
            { t: 8.4, x: 590, y: 420, click: true },
            { t: 9.4, x: 590, y: 420, click: true },
            { t: 11.8, x: 700, y: 422, click: true },
            { t: 12.6, x: 880, y: 424, click: true },
            { t: 15.4, x: 48, y: 426, click: true },
            { t: 16.6, x: 96, y: 694, click: true },
            { t: 18.6, x: 500, y: 700 },
          ]}
        />
      </div>
    </TutorialScene>
  );
};

export const CreateIssueScene: React.FC = () => {
  const t = useSeconds();
  const drafted = t > 6.6;
  return (
    <TutorialScene
      step="Daily driver"
      title="Create issues with ✦ AI Draft"
      who={["Developers", "Project Managers"]}
      lines={[
        { at: 0.8, text: <>Click <Key>Create Issue</Key> and pick the parent epic or story.</> },
        { at: 3.0, text: <>Type a rough idea, then click <b>✦ AI Draft</b>.</> },
        { at: 7.2, text: <>You get a clear title, description and suggested sub-tasks — all editable.</> },
        { at: 12.0, text: <>Click <b>Create</b>. Story, sub-tasks and links land in Jira together.</> },
      ]}
    >
      <div style={{ position: "relative" }}>
        <AppWindow active="Task Management">
          <div style={{ position: "absolute", inset: 0, background: "rgba(15,49,51,0.35)" }} />
          <div
            style={{
              position: "absolute",
              left: 70,
              right: 70,
              top: 26,
              bottom: 26,
              background: "white",
              borderRadius: 16,
              padding: 28,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              boxShadow: "0 30px 70px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 900 }}>Create Issue</div>
            <div style={{ display: "flex", gap: 12 }}>
              <Field label="Issue type" value="Story" style={{ width: 160 }} />
              <Field label="Parent" value="APP-100 · Mobile Checkout Revamp (Epic)" style={{ flex: 1 }} />
            </div>
            <Field
              label="Title"
              value={
                drafted ? (
                  <Appear at={6.6}>
                    When I check out on my phone, I want to pay in one tap, so I can finish before I get distracted
                  </Appear>
                ) : (
                  <Typed text="faster checkout on mobile" from={3.4} to={4.6} />
                )
              }
            />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: colors.muted }}>Description</div>
              <Button variant="ai" pressed={t > 5.2 && t < 5.5} style={{ padding: "6px 14px", fontSize: 16 }}>
                {t > 5.5 && !drafted ? "Drafting…" : "✦ AI Draft"}
              </Button>
            </div>
            <div
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: 14,
                fontSize: 17,
                lineHeight: 1.45,
                height: 150,
                color: colors.text,
              }}
            >
              {drafted ? (
                <Appear at={6.8}>
                  <b>Situation:</b> Shoppers on mobile abandon checkout at the payment step.
                  <br />
                  <b>Outcome:</b> One-tap Apple Pay / Google Pay, saved addresses, &lt; 30s checkout.
                  <br />
                  <b>Done when:</b> Conversion on mobile matches desktop within 5%.
                </Appear>
              ) : null}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.muted }}>Suggested sub-tasks</div>
            {["Add wallet payment buttons", "Persist saved addresses", "Track checkout timing"].map((s, i) => (
              <Appear key={s} at={8.2 + i * 0.4}>
                <div style={{ fontSize: 18, display: "flex", gap: 10, alignItems: "center" }}>
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      background: colors.blue,
                      color: "white",
                      fontSize: 14,
                      textAlign: "center",
                      lineHeight: "20px",
                    }}
                  >
                    ✓
                  </span>
                  {s}
                </div>
              </Appear>
            ))}
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <Button variant="ghost">Cancel</Button>
              <Button pressed={t > 12.6 && t < 12.9}>{drafted ? "Create + 3 subtasks" : "Create"}</Button>
            </div>
          </div>
          {t > 13.2 ? (
            <Appear
              at={13.2}
              style={{
                position: "absolute",
                left: 180,
                right: 180,
                top: 280,
                background: colors.teal,
                color: "white",
                borderRadius: 16,
                padding: 30,
                fontSize: 24,
                lineHeight: 1.5,
                zIndex: 5,
                boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 28 }}>✓ Created APP-151</div>
              <div style={{ fontFamily: monoFamily, fontSize: 20, opacity: 0.85 }}>
                + APP-152, APP-153, APP-154 (sub-tasks)
              </div>
              <div style={{ color: colors.cyan, marginTop: 8 }}>Add more detail in Jira ↗</div>
            </Appear>
          ) : null}
        </AppWindow>
        <Cursor
          points={[
            { t: 2.8, x: 500, y: 600 },
            { t: 3.3, x: 400, y: 340, click: true },
            { t: 5.2, x: 260, y: 393, click: true },
            { t: 11.6, x: 760, y: 700 },
            { t: 12.6, x: 840, y: 720, click: true },
          ]}
        />
      </div>
    </TutorialScene>
  );
};

export const PlanAndReportScene: React.FC = () => {
  const t = useSeconds();
  return (
    <TutorialScene
      step="Daily driver"
      title="Plan your week & prep your 1:1"
      who={["Developers", "Project Managers"]}
      lines={[
        { at: 0.8, text: <><b>Help me plan my week</b>: answer four quick questions.</> },
        { at: 3.6, text: <>Get a Monday–Friday plan using your real issue keys.</> },
        {
          at: 8.0,
          text: (
            <>
              <b>Project Report</b>: Status Report, <Key>1:1 Prep</Key> or a PWB self-review.
            </>
          ),
        },
        { at: 12.6, text: <>Every report is saved to <b>Past Reports</b> automatically.</> },
      ]}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24, width: 1040 }}>
        <Panel title="🗓️ Help me plan my week" style={{ boxShadow: "0 20px 50px rgba(15,49,51,0.15)" }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <Field label="Approach" value="Balance across projects" style={{ flex: 1 }} />
            <Field label="Hours" value="32" style={{ width: 90 }} />
            <Field label="Fixed commitments" value="Release Thursday" style={{ flex: 1 }} />
          </div>
          {[
            ["Mon", "APP-142 Apple Pay fix → PR review"],
            ["Tue", "APP-138 cart caching · pair with Marcus"],
            ["Wed", "APP-131 analytics events"],
            ["Thu", "Release day — buffer for hot-fixes"],
            ["Fri", "APP-127 form validation · plan next sprint"],
          ].map(([d, s], i) => (
            <Appear key={d} at={3.8 + i * 0.5}>
              <div style={{ display: "flex", gap: 16, fontSize: 21, padding: "6px 0" }}>
                <span style={{ fontWeight: 900, width: 56, color: colors.orange }}>{d}</span>
                {s}
              </div>
            </Appear>
          ))}
        </Panel>
        <Appear at={7.6}>
          <Panel title="📄 Project Report" style={{ boxShadow: "0 20px 50px rgba(15,49,51,0.15)" }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              {["Status Report", "1:1 Prep", "PWB Review"].map((r) => (
                <Pill
                  key={r}
                  color={r === "1:1 Prep" && t > 9.0 ? colors.orange : colors.muted}
                  style={{ fontSize: 19, padding: "6px 16px" }}
                >
                  {r}
                </Pill>
              ))}
              <div style={{ flex: 1 }} />
              <Button pressed={t > 9.8 && t < 10.1}>Generate Report</Button>
            </div>
            {t > 10.4 ? (
              <Appear at={10.4}>
                <div style={{ fontSize: 20, lineHeight: 1.5 }}>
                  <b>Talking points</b> — Closed 9 issues this sprint (↑3). APP-142 is the top risk for Thursday&apos;s
                  release; fix is in review. Ask: decision on wallet provider by Wednesday.
                </div>
              </Appear>
            ) : null}
          </Panel>
        </Appear>
      </div>
    </TutorialScene>
  );
};

