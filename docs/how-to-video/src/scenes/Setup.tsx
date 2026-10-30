import React from "react";
import { colors, monoFamily } from "../theme";
import {
  AppWindow,
  Appear,
  Button,
  Code,
  Cursor,
  Key,
  Logo,
  Spotlight,
  TutorialScene,
  Typed,
  useSeconds,
} from "../ui";

const TermLine: React.FC<{
  cmd: string;
  from: number;
  to: number;
  output?: string[];
  comment: string;
}> = ({ cmd, from, to, output = [], comment }) => {
  const t = useSeconds();
  if (t < from - 0.3) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ color: "#7FA3A6", fontSize: 22 }}># {comment}</div>
      <div style={{ fontSize: 28 }}>
        <span style={{ color: colors.cyan }}>~/the-docket $ </span>
        <Typed text={cmd} from={from} to={to} />
      </div>
      {output.map((o, i) =>
        t > to + 0.3 + i * 0.25 ? (
          <div
            key={o}
            style={{
              fontSize: 22,
              color: o.startsWith("✓") ? "#7CE38B" : "#B9C7C8",
            }}
          >
            {o}
          </div>
        ) : null,
      )}
    </div>
  );
};

export const InstallScene: React.FC = () => (
  <TutorialScene
    step="Setup · Step 1 of 4"
    title="Install & start it (one time)"
    who={["Developers", "Admins"]}
    lines={[
      {
        at: 3.5,
        text: (
          <>
            You need <Key>Node 22</Key> and a copy of the project folder.
          </>
        ),
      },
      {
        at: 7.8,
        text: (
          <>
            Open Terminal (PowerShell on Windows) in that folder and run four
            commands.
          </>
        ),
      },
      {
        at: 19.2,
        text: (
          <>
            <b>Not technical?</b> Ask a developer to do this once with you — it
            takes about five minutes.
          </>
        ),
      },
    ]}
  >
    <div
      style={{
        width: 1040,
        height: 760,
        borderRadius: 18,
        background: "#0E1E20",
        boxShadow: "0 40px 90px rgba(15,49,51,0.35)",
        overflow: "hidden",
        fontFamily: monoFamily,
        color: "white",
      }}
    >
      <div
        style={{
          height: 46,
          background: "#1B2E30",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 18px",
        }}
      >
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <div
            key={c}
            style={{ width: 14, height: 14, borderRadius: 7, background: c }}
          />
        ))}
        <div style={{ marginLeft: 20, color: "#8BA5A7", fontSize: 18 }}>
          Terminal — the-docket
        </div>
      </div>
      <div style={{ padding: "28px 34px" }}>
        <TermLine
          comment="1. Use the pinned Node version"
          cmd="nvm install && nvm use"
          from={11.8}
          to={13.2}
          output={["✓ Now using node v22"]}
        />
        <TermLine
          comment="2. Install dependencies"
          cmd="npm install"
          from={13.4}
          to={14.2}
          output={["added 412 packages in 18s"]}
        />
        <TermLine
          comment="3. Create your settings file (Windows: Copy-Item .env.example .env)"
          cmd="cp .env.example .env"
          from={14.6}
          to={16.0}
        />
        <TermLine
          comment="4. Start the app (browser)"
          cmd="npm run dev:all"
          from={17.5}
          to={18.6}
          output={[
            "[ui]  ➜  Local: http://localhost:5173/",
            "[api] ✓ Jira proxy listening on 127.0.0.1:8787",
          ]}
        />
      </div>
    </div>
  </TutorialScene>
);

const EnvRow: React.FC<{
  k: string;
  v: string;
  from: number;
  to: number;
  note?: string;
}> = ({ k, v, from, to, note }) => (
  <div style={{ fontSize: 26, marginBottom: 18 }}>
    {note ? (
      <div style={{ color: "#7A8C93", fontSize: 21 }}># {note}</div>
    ) : null}
    <span style={{ color: "#C2410C" }}>{k}</span>
    <span style={{ color: colors.muted }}>=</span>
    <span style={{ color: "#0F766E" }}>
      <Typed text={v} from={from} to={to} />
    </span>
  </div>
);

const EditorWindow: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      borderRadius: 18,
      background: "white",
      boxShadow: "0 40px 90px rgba(15,49,51,0.25)",
      border: `1px solid ${colors.border}`,
      overflow: "hidden",
      fontFamily: monoFamily,
    }}
  >
    <div
      style={{
        height: 46,
        background: "#E9EDF1",
        display: "flex",
        alignItems: "center",
        padding: "0 18px",
        fontSize: 18,
        color: colors.muted,
        gap: 10,
      }}
    >
      {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
        <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />
      ))}
      <span style={{ marginLeft: 20 }}>{title}</span>
    </div>
    <div style={{ padding: "30px 40px" }}>{children}</div>
  </div>
);

const Tag: React.FC<{ at: number; out?: number; children: React.ReactNode }> = ({
  at,
  out,
  children,
}) => (
  <Appear at={at} out={out} style={{ display: "inline-block", marginLeft: 14 }}>
    <span
      style={{
        fontFamily: "inherit",
        fontSize: 18,
        fontWeight: 700,
        color: "white",
        background: colors.orange,
        padding: "3px 10px",
        borderRadius: 6,
      }}
    >
      {children}
    </span>
  </Appear>
);

export const CredentialsScene: React.FC = () => {
  const t = useSeconds();
  return (
    <TutorialScene
      step="Setup · Step 2 of 4"
      title="Connect to your Jira"
      who={["Everyone"]}
      lines={[
        {
          at: 1.8,
          text: (
            <>
              Create an <Key>API token</Key> at id.atlassian.com → Security → API tokens.
            </>
          ),
        },
        {
          at: 6.3,
          text: (
            <>
              Open <Code>.env</Code> in the project folder and fill in three values.
            </>
          ),
        },
        { at: 23.5, text: <>🔒 Keep it private: never commit it or share your token — even with support.</> },
        { at: 28.0, text: <>Changed <Code>.env</Code>? Stop and restart the app.</> },
      ]}
    >
      <div style={{ position: "relative", width: 1040, height: 760 }}>
        <EditorWindow title=".env — the-docket (project folder, next to package.json)">
          <div style={{ marginTop: -10, marginBottom: 18 }}>
            <Tag at={12.0}>file name is exactly .env — not .env.txt</Tag>
          </div>
          <EnvRow note="Your Jira Cloud site" k="JIRA_BASE_URL" v="https://acme.atlassian.net" from={17.8} to={19.4} />
          <div style={{ marginTop: -12, marginBottom: 18 }}>
            <Tag at={19.8}>no trailing slash /</Tag>
          </div>
          <EnvRow note="The email you sign in to Jira with" k="JIRA_EMAIL" v="you@acme.com" from={21.2} to={22.2} />
          <EnvRow note="Token from id.atlassian.com (keep it secret)" k="JIRA_API_TOKEN" v="••••••••••••••••••••" from={22.6} to={23.6} />
          <Appear at={28.6}>
            <div
              style={{
                marginTop: 30,
                fontFamily: monoFamily,
                fontSize: 22,
                background: colors.teal,
                color: "white",
                borderRadius: 12,
                padding: "16px 20px",
                lineHeight: 1.6,
              }}
            >
              <span style={{ color: "#7FA3A6" }}># apply changes</span>
              <br />
              Ctrl+C <span style={{ color: "#7FA3A6" }}>→</span> npm run dev:all
            </div>
          </Appear>
        </EditorWindow>
        <Appear
          at={2.0}
          out={6.8}
          style={{
            position: "absolute",
            right: 40,
            top: 90,
            width: 560,
            background: "white",
            borderRadius: 16,
            boxShadow: "0 30px 70px rgba(15,49,51,0.3)",
            border: `1px solid ${colors.border}`,
            padding: 30,
            zIndex: 5,
          }}
        >
          <div style={{ fontSize: 18, color: colors.muted, fontWeight: 700 }}>ATLASSIAN ACCOUNT · SECURITY</div>
          <div style={{ fontSize: 32, fontWeight: 900, margin: "10px 0 18px" }}>API tokens</div>
          <div style={{ fontSize: 20, color: colors.muted, marginBottom: 22 }}>
            Label: <b style={{ color: colors.text }}>The Docket</b>
          </div>
          <Button pressed={t > 4.6 && t < 4.9}>Create API token</Button>
        </Appear>
      </div>
    </TutorialScene>
  );
};

const EnvBlock: React.FC<{
  at: number;
  active: [number, number];
  title: string;
  rows: [string, string][];
}> = ({ at, active, title, rows }) => {
  const t = useSeconds();
  const on = t >= active[0] && t < active[1];
  return (
    <Appear at={at}>
      <div
        style={{
          borderRadius: 12,
          padding: "14px 18px",
          marginBottom: 16,
          background: on ? `${colors.yellow}33` : "transparent",
          border: `2px solid ${on ? colors.orange : "transparent"}`,
          opacity: t >= active[1] ? 0.55 : 1,
        }}
      >
        <div style={{ color: "#7A8C93", fontSize: 20, marginBottom: 4 }}># {title}</div>
        {rows.map(([k, v]) => (
          <div key={k} style={{ fontSize: 22, lineHeight: 1.5 }}>
            <span style={{ color: "#C2410C" }}>{k}</span>
            <span style={{ color: colors.muted }}>=</span>
            <span style={{ color: "#0F766E" }}>{v}</span>
          </div>
        ))}
      </div>
    </Appear>
  );
};

export const EnvOptionsScene: React.FC = () => (
  <TutorialScene
    step="Setup · Step 3 of 4"
    title="Optional .env settings"
    who={["Developers", "Admins"]}
    lines={[
      { at: 0.8, text: <>Everything below the three Jira values is optional.</> },
      { at: 3.7, text: <><b>Several Jira sites?</b> Add up to five — they share one API token.</> },
      { at: 13.7, text: <><b>Chat &amp; AI:</b> use your company&apos;s <Key>approved model</Key> via the <Code>MANAGED_AI_*</Code> values.</> },
      { at: 24.0, text: <>Also: API port, log level, and an optional shared team database.</> },
    ]}
  >
    <div style={{ position: "relative", width: 1040, height: 780 }}>
      <EditorWindow title=".env — optional settings (see .env.example for all of them)">
        <EnvBlock
          at={3.4}
          active={[3.7, 13.7]}
          title="Multiple Jira sites (max 5) — all use JIRA_API_TOKEN"
          rows={[
            ["JIRA_INSTANCE_1_NAME", "Mobile"],
            ["JIRA_INSTANCE_1_BASE_URL", "https://acme.atlassian.net"],
            ["JIRA_INSTANCE_1_EMAIL", "you@acme.com"],
            ["JIRA_INSTANCE_2_NAME", "Platform"],
          ]}
        />
        <EnvBlock
          at={15.6}
          active={[15.6, 24.0]}
          title="Company AI — approved, governed model (default when set)"
          rows={[
            ["MANAGED_AI_BASE_URL", "https://<company-ai-gateway>/v1"],
            ["MANAGED_AI_API_KEY", "••••••••••••"],
            ["MANAGED_AI_MODEL", "<approved-model>"],
            ["# CHAT_PROVIDER", "…  # personal provider — only if policy allows"],
          ]}
        />
        <EnvBlock
          at={23.6}
          active={[24.0, 40]}
          title="Other (defaults shown)"
          rows={[
            ["API_PORT", "8787"],
            ["LOG_LEVEL", "info"],
            ["TEAM_PRIORITY_DATABASE_URL", "postgresql://…  # shared priorities"],
          ]}
        />
      </EditorWindow>
    </div>
  </TutorialScene>
);

export const OpenAppScene: React.FC = () => {
  const t = useSeconds();
  const menuOpen = t > 3.2 && t < 5.4;
  const dialog = t > 5.4 && t < 8.6;
  return (
    <TutorialScene
      step="Setup · Step 4 of 4"
      title="Open The Docket"
      who={["Everyone"]}
      lines={[
        {
          at: 0.8,
          text: (
            <>
              Visit <Key>localhost:5173</Key> in Chrome or Edge.
            </>
          ),
        },
        {
          at: 3.0,
          text: (
            <>
              Optional: <b>Install page as app</b> for its own Dock / taskbar
              icon.
            </>
          ),
        },
        {
          at: 8.6,
          text: (
            <>
              Keep the Terminal running — the app needs it. Prefer a desktop
              window? Use <Code>npm run desktop:dev</Code>
            </>
          ),
        },
      ]}
    >
      <div style={{ position: "relative" }}>
        <AppWindow active="Task Management" url="localhost:5173">
          <div
            style={{
              padding: 30,
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <div
              style={{
                borderRadius: 10,
                padding: "14px 20px",
                fontWeight: 700,
                fontSize: 19,
                background: `linear-gradient(90deg, ${colors.yellow}, ${colors.orange}, ${colors.coral})`,
              }}
            >
              OFFICE JOKE TICKER: Why did the developer go broke? They used up
              all their cache.
            </div>
            <div
              style={{
                background: "white",
                borderRadius: 12,
                border: `1px solid ${colors.border}`,
                padding: 24,
              }}
            >
              <div
                style={{ fontSize: 15, color: colors.muted, fontWeight: 700 }}
              >
                TODAY
              </div>
              <div style={{ fontSize: 26, fontWeight: 900 }}>
                Monday, October 19, 2026
              </div>
              <div
                style={{
                  height: 180,
                  marginTop: 16,
                  borderRadius: 10,
                  background: "#F0F4F7",
                }}
              />
            </div>
          </div>
        </AppWindow>
        {menuOpen ? (
          <div
            style={{
              position: "absolute",
              right: 20,
              top: 50,
              width: 420,
              background: "white",
              borderRadius: 12,
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
              border: `1px solid ${colors.border}`,
              padding: 10,
              fontSize: 20,
              zIndex: 10,
            }}
          >
            {[
              "New tab",
              "History",
              "Downloads",
              "Cast, save, and share  ›",
            ].map((m) => (
              <div
                key={m}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: m.startsWith("Cast") ? "#E8F1FB" : "transparent",
                }}
              >
                {m}
              </div>
            ))}
            {t > 4.2 ? (
              <div
                style={{
                  position: "absolute",
                  left: -330,
                  top: 150,
                  width: 320,
                  background: "white",
                  borderRadius: 12,
                  boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
                  padding: 10,
                }}
              >
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "#E8F1FB",
                    fontWeight: 700,
                  }}
                >
                  ⊕ Install page as app…
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {dialog ? (
          <div
            style={{
              position: "absolute",
              left: 290,
              top: 200,
              width: 460,
              background: "white",
              borderRadius: 16,
              boxShadow: "0 30px 70px rgba(0,0,0,0.35)",
              padding: 30,
              zIndex: 10,
            }}
          >
            <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 18 }}>
              Install app?
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginBottom: 26,
              }}
            >
              <Logo size={56} />
              <div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>The Docket</div>
                <div style={{ fontSize: 17, color: colors.muted }}>
                  localhost:5173
                </div>
              </div>
            </div>
            <div
              style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}
            >
              <Button variant="ghost">Cancel</Button>
              <Button pressed={t > 7.4 && t < 7.7}>Install</Button>
            </div>
          </div>
        ) : null}
        <Spotlight
          x={170}
          y={52}
          w={380}
          h={30}
          from={1.0}
          to={2.6}
          label="Type the address here"
        />
        <Cursor
          points={[
            { t: 2.6, x: 700, y: 300 },
            { t: 3.1, x: 1005, y: 22, click: true },
            { t: 3.9, x: 800, y: 215 },
            { t: 4.4, x: 760, y: 225 },
            { t: 4.9, x: 520, y: 228, click: true },
            { t: 6.6, x: 640, y: 380 },
            { t: 7.4, x: 705, y: 375, click: true },
            { t: 8.4, x: 760, y: 500 },
          ]}
        />
      </div>
    </TutorialScene>
  );
};
