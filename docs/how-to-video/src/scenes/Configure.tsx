import React from "react";
import { colors } from "../theme";
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
  TABS,
  TutorialScene,
  Typed,
  useSeconds,
} from "../ui";

export const SettingsScene: React.FC = () => {
  const t = useSeconds();
  const connected = t > 3.6;
  const siteAdded = t > 11.5;
  const siteTested = t > 13.6;
  const presetAdded = t > 21.0;
  return (
    <TutorialScene
      step="First things first"
      title="Settings: Jira sites & presets"
      who={["Everyone"]}
      lines={[
        { at: 0.8, text: <>Click <Key>⚙</Key> then <b>Test Jira Connection</b>. Look for ✓ Connected.</> },
        { at: 7.0, text: <>Add each extra Jira space under <b>Jira sites</b>, then test it.</> },
        { at: 14.6, text: <>Add <b>Epic &amp; JQL presets</b>: saved searches that power every page.</> },
        { at: 22.0, text: <>Share them with <b>Export team pack</b>.</> },
      ]}
    >
      <div style={{ position: "relative" }}>
        <AppWindow active="Settings">
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
            <Panel title="Jira connection">
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <Button pressed={t > 2.6 && t < 2.9}>Test Jira Connection</Button>
                {t > 2.9 && !connected ? <span style={{ fontSize: 19, color: colors.muted }}>Checking…</span> : null}
                {connected ? (
                  <Pill color={colors.green} style={{ fontSize: 19 }}>
                    ✓ Connected · ops.example.test
                  </Pill>
                ) : null}
              </div>
            </Panel>
            <Panel title="Jira sites">
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 19 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <Pill color={colors.blue}>Active</Pill> Demo Operations · ops.example.test
                </div>
                {siteAdded ? (
                  <Appear at={11.5}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <Pill color={colors.orange}>Saved</Pill> Demo Platform · platform.example.test
                      <Button variant="ghost" pressed={t > 13.0 && t < 13.3} style={{ padding: "4px 12px", fontSize: 16 }}>
                        Test connection
                      </Button>
                      {siteTested ? <Pill color={colors.green}>✓ Connected</Pill> : null}
                    </div>
                  </Appear>
                ) : null}
              </div>
            </Panel>
            <Panel title="Epic & JQL presets">
              <div style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
                <Field label="Type" value="JQL" style={{ width: 110 }} />
                <Field label="Label" value={<Typed text="My Work" from={15.4} to={16.1} />} style={{ width: 220 }} />
                <Field
                  label="JQL"
                  mono
                  value={<Typed text="assignee = currentUser() AND resolution = Unresolved" from={16.4} to={19.4} />}
                  style={{ flex: 1 }}
                />
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center" }}>
                <Button pressed={t > 20.6 && t < 20.9}>Add preset</Button>
                <Button variant="ghost">Export team pack</Button>
                <Button variant="ghost">Import team pack</Button>
              </div>
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8, fontSize: 18 }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <Pill color="#7C3AED">Epic</Pill> Mobile Checkout Revamp · APP-100
                </div>
                {presetAdded ? (
                  <Appear at={21.0}>
                    <div style={{ display: "flex", gap: 12 }}>
                      <Pill color={colors.blue}>JQL</Pill> My Work
                    </div>
                  </Appear>
                ) : null}
              </div>
            </Panel>
          </div>
        </AppWindow>
        <Spotlight x={963} y={52} w={56} h={46} from={0.9} to={2.0} label="Settings" />
        <Spotlight x={30} y={228} w={980} h={120} from={7.0} to={10.5} label="Every Jira space" labelSide="top" />
        <Spotlight x={30} y={620} w={420} h={50} from={22.0} to={25.5} label="Share with your team" labelSide="top" />
        <Cursor
          points={[
            { t: 0.8, x: 700, y: 400 },
            { t: 1.6, x: 990, y: 78, click: true },
            { t: 2.6, x: 150, y: 222, click: true },
            { t: 12.4, x: 540, y: 350 },
            { t: 13.0, x: 560, y: 345, click: true },
            { t: 16.0, x: 650, y: 470, click: true },
            { t: 20.6, x: 120, y: 520, click: true },
            { t: 23.0, x: 300, y: 520 },
          ]}
        />
      </div>
    </TutorialScene>
  );
};

const tabInfo: Record<string, { icon: string; title: string; text: string }> = {
  "Task Management": { icon: "🗂️", title: "Task Management", text: "Your daily driver — run queries, edit issues, notes & to-dos." },
  Metrics: { icon: "📈", title: "Metrics", text: "Project & team health across your presets." },
  "Project Managers": { icon: "🧭", title: "Project Managers", text: "Capacity planning, risk flags & Gantt timelines." },
  "Past Reports": { icon: "🗄️", title: "Past Reports", text: "Every report and week plan, saved locally." },
  Chat: { icon: "💬", title: "Chat", text: "Ask Jira questions in plain English." },
  Settings: { icon: "⚙", title: "Settings", text: "Jira connection, presets, people & preferences." },
};

export const NavigateScene: React.FC = () => {
  const t = useSeconds();
  const order = [...TABS, "Settings"];
  const idx = Math.min(order.length - 1, Math.max(0, Math.floor((t - 1.2) / 2.1)));
  const current = order[idx];
  const info = tabInfo[current];
  return (
    <TutorialScene
      step="Getting around"
      title="Six tabs, one top bar"
      who={["Everyone"]}
      lines={order.map((o, i) => ({
        at: 1.2 + i * 2.1,
        text: (
          <span style={{ fontWeight: o === current ? 900 : 400, color: o === current ? colors.teal : colors.muted }}>
            {tabInfo[o].icon} {o}
          </span>
        ),
      }))}
    >
      <AppWindow active={current} tabHighlight={t > 1.2 ? current : undefined}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 22,
            textAlign: "center",
            padding: 60,
          }}
        >
          <div style={{ fontSize: 120 }}>{info.icon}</div>
          <div style={{ fontSize: 54, fontWeight: 900 }}>{info.title}</div>
          <div style={{ fontSize: 32, color: colors.muted, maxWidth: 700, lineHeight: 1.3 }}>{info.text}</div>
          <div style={{ fontSize: 22, color: colors.muted, marginTop: 30 }}>
            Tip: long jobs keep running while you switch tabs — watch the yellow status pill.
          </div>
        </div>
      </AppWindow>
    </TutorialScene>
  );
};

const FIXES: [string, React.ReactNode][] = [
  ["Connection test fails", <>File named <b>.env</b> in the folder you launched? VPN on? Check the 3 <b>JIRA_</b> values, restart</>],
  ["Missing package error", <>npm install</>],
  ["Port already in use", <>Set a different <b>API_PORT</b> in .env</>],
  ["Native module error", <>npm rebuild better-sqlite3</>],
  ["Chat says “not ready”", <>Check <b>MANAGED_AI_*</b> (Company AI) settings</>],
];

export const FinishSetupScene: React.FC = () => {
  const t = useSeconds();
  return (
    <TutorialScene
      step="Finish setup"
      title="Map dates, check health, quick fixes"
      who={["Developers", "Admins"]}
      lines={[
        {
          at: 0.8,
          text: (
            <>
              Settings → <b>Jira field mapping</b> → <Key>Refresh from Jira</Key> → Save. This powers deadlines.
            </>
          ),
        },
        { at: 12.5, text: <>Health check: localhost:8787/api/health should say ok: true.</> },
        { at: 20.0, text: <>Something off? Most fixes are one line.</> },
      ]}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20, width: 1040 }}>
        <Panel title="Jira field mapping" style={{ boxShadow: "0 20px 50px rgba(15,49,51,0.15)" }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <Button pressed={t > 3.0 && t < 3.3}>Refresh from Jira</Button>
            <Button variant="ghost" pressed={t > 9.4 && t < 9.7}>
              {t > 9.7 ? "✓ Saved" : "Save field mappings"}
            </Button>
          </div>
          {[
            ["Initial Done Date", "customfield_10008"],
            ["Most Recent Done Date", "customfield_10009"],
            ["Due date", "duedate"],
            ["Project End Date", "customfield_10015"],
          ].map(([role, field], i) => (
            <div
              key={role}
              style={{ display: "flex", fontSize: 19, padding: "6px 0", borderTop: i ? `1px solid ${colors.border}` : "none" }}
            >
              <span style={{ width: 300, fontWeight: 700 }}>{role}</span>
              <span style={{ fontFamily: "monospace", color: t > 3.6 + i * 0.3 ? colors.teal : colors.grey }}>
                {t > 3.6 + i * 0.3 ? field : "—"}
              </span>
            </div>
          ))}
        </Panel>
        <Appear at={12.5}>
          <div
            style={{
              background: "white",
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 20px 50px rgba(15,49,51,0.15)",
            }}
          >
            <div style={{ background: "#E9EDF1", padding: "8px 16px", fontSize: 17, color: colors.muted }}>
              🔒 localhost:8787/api/health
            </div>
            <div style={{ padding: "12px 18px", fontFamily: "monospace", fontSize: 19, lineHeight: 1.5 }}>
              {"{ "}
              <span style={{ color: colors.green, fontWeight: 700 }}>&quot;ok&quot;: true</span>
              {', "jiraBaseUrl": "https://acme.atlassian.net", "legacyMode": true }'}
            </div>
          </div>
        </Appear>
        <Appear at={20.0}>
          <Panel title="Quick fixes" style={{ boxShadow: "0 20px 50px rgba(15,49,51,0.15)" }}>
            {FIXES.map(([problem, fix], i) => (
              <Appear key={problem} at={[21, 30, 34, 37.5, 41][i]}>
                <div style={{ display: "flex", gap: 16, fontSize: 19, padding: "7px 0" }}>
                  <span style={{ width: 290, fontWeight: 700, color: colors.coral }}>{problem}</span>
                  <span>{fix}</span>
                </div>
              </Appear>
            ))}
          </Panel>
        </Appear>
      </div>
    </TutorialScene>
  );
};
