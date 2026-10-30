import React from "react";
import { interpolate, useVideoConfig, Easing } from "remotion";
import { colors } from "../theme";
import { Appear, Background, Logo, useProgress, useSceneFrame } from "../ui";

export const IntroScene: React.FC = () => {
  const frame = useSceneFrame();
  const { fps } = useVideoConfig();
  return (
    <Background dark>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          textAlign: "center",
        }}
      >
        <Logo
          size={260}
          style={{
            scale: interpolate(frame, [0, 1 * fps], [0.6, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.spring({ damping: 12 }),
              output: "perceptual-scale",
            }),
            opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], {
              extrapolateRight: "clamp",
            }),
          }}
        />
        <Appear at={0.6}>
          <div style={{ fontSize: 150, fontWeight: 900, letterSpacing: -2 }}>The Docket</div>
        </Appear>
        <Appear at={1.2}>
          <div
            style={{
              fontSize: 44,
              fontWeight: 700,
              color: colors.cyan,
              letterSpacing: 6,
              textTransform: "uppercase",
            }}
          >
            How-To Guide · Setup, Multiple Jira Sites &amp; Reports
          </div>
        </Appear>
        <Appear at={2.2}>
          <div style={{ fontSize: 46, maxWidth: 1300, lineHeight: 1.35, opacity: 0.9 }}>
            Your Jira work — across every Jira space — organized, measured and reported in one local workspace.
          </div>
        </Appear>
      </div>
    </Background>
  );
};

const Before: React.FC<{ at: number; strike: number; children: React.ReactNode }> = ({
  at,
  strike,
  children,
}) => {
  const p = useProgress(strike, strike + 0.5);
  return (
    <Appear at={at}>
      <div
        style={{
          position: "relative",
          fontSize: 36,
          fontWeight: 700,
          background: "white",
          border: `2px solid ${colors.border}`,
          borderRadius: 16,
          padding: "22px 32px",
          whiteSpace: "nowrap",
          color: interpolate(p, [0, 1], [0, 1]) > 0.5 ? colors.muted : colors.text,
          boxShadow: "0 8px 24px rgba(15,49,51,0.08)",
        }}
      >
        {children}
        <div
          style={{
            position: "absolute",
            left: 20,
            top: "50%",
            height: 5,
            width: `${p * 92}%`,
            background: colors.coral,
            borderRadius: 3,
          }}
        />
      </div>
    </Appear>
  );
};

export const WhyScene: React.FC = () => {
  return (
    <Background>
      <div style={{ position: "absolute", left: 120, right: 120, top: 110 }}>
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
            What is The Docket?
          </div>
        </Appear>
        <Appear at={0.3}>
          <div style={{ fontSize: 92, fontWeight: 900, marginTop: 16, lineHeight: 1.05 }}>
            One workspace instead of ten tabs.
          </div>
        </Appear>
      </div>
      <div
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          top: 420,
          display: "flex",
          alignItems: "center",
          gap: 60,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24, width: 700 }}>
          <Before at={1.0} strike={4.2}>🗂️ A dozen Jira tabs &amp; filters</Before>
          <Before at={1.6} strike={4.5}>📊 Hand-built status spreadsheets</Before>
          <Before at={2.2} strike={4.8}>✉️ Weekly status-update emails</Before>
        </div>
        <Appear at={5.2}>
          <div style={{ fontSize: 120, color: colors.orange, fontWeight: 900 }}>→</div>
        </Appear>
        <Appear at={5.6} style={{ flex: 1 }}>
          <div
            style={{
              background: colors.teal,
              color: "white",
              borderRadius: 28,
              padding: "44px 52px",
              display: "flex",
              flexDirection: "column",
              gap: 22,
              boxShadow: "0 30px 70px rgba(15,49,51,0.35)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <Logo size={84} />
              <div style={{ fontSize: 60, fontWeight: 900 }}>The Docket</div>
            </div>
            {[
              ["✅", "Daily task management on top of Jira"],
              ["📈", "Live project & team health metrics"],
              ["✦", "AI-written reports, plans and tickets"],
              ["🔒", "Runs locally — credentials stay on your machine"],
            ].map(([icon, text], i) => (
              <Appear key={text} at={6.2 + i * 0.5}>
                <div style={{ fontSize: 36, display: "flex", gap: 18 }}>
                  <span style={{ color: colors.cyan, width: 44 }}>{icon}</span>
                  {text}
                </div>
              </Appear>
            ))}
          </div>
        </Appear>
      </div>
    </Background>
  );
};

const PersonaCard: React.FC<{
  at: number;
  icon: string;
  role: string;
  tagline: string;
  color: string;
  points: string[];
}> = ({ at, icon, role, tagline, color, points }) => (
  <Appear at={at} style={{ flex: 1 }}>
    <div
      style={{
        background: "white",
        borderRadius: 28,
        borderTop: `14px solid ${color}`,
        padding: "40px 40px 44px",
        height: 640,
        boxShadow: "0 24px 60px rgba(15,49,51,0.14)",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div style={{ fontSize: 76 }}>{icon}</div>
      <div style={{ fontSize: 52, fontWeight: 900, color }}>{role}</div>
      <div style={{ fontSize: 30, color: colors.muted, fontStyle: "italic", marginBottom: 8 }}>
        {tagline}
      </div>
      {points.map((p, i) => (
        <Appear key={p} at={at + 0.8 + i * 0.6}>
          <div style={{ fontSize: 31, lineHeight: 1.3, display: "flex", gap: 14 }}>
            <span style={{ color, fontWeight: 900 }}>✓</span>
            <span>{p}</span>
          </div>
        </Appear>
      ))}
    </div>
  </Appear>
);

export const PersonasScene: React.FC = () => (
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
          Why use it?
        </div>
      </Appear>
      <Appear at={0.3}>
        <div style={{ fontSize: 80, fontWeight: 900, marginTop: 10 }}>Built for every seat at the table</div>
      </Appear>
    </div>
    <div
      style={{
        position: "absolute",
        left: 100,
        right: 100,
        top: 330,
        display: "flex",
        gap: 40,
      }}
    >
      <PersonaCard
        at={1.0}
        icon="👩‍💻"
        role="Developers"
        tagline="“Less Jira clicking, more building.”"
        color="#2563EB"
        points={[
          "One focused view of all your assigned work",
          "Update status, dates & notes without leaving",
          "AI drafts tickets, week plans & 1:1 prep",
        ]}
      />
      <PersonaCard
        at={4.5}
        icon="🧭"
        role="Project Managers"
        tagline="“Know what’s at risk before stand-up.”"
        color="#C2410C"
        points={[
          "Health of every epic & project in one place",
          "Capacity, Gantt and overdue / blocked / stale flags",
          "Stakeholder-ready summaries in one click",
        ]}
      />
      <PersonaCard
        at={8.0}
        icon="📊"
        role="Executives"
        tagline="“The answer, not the ticket list.”"
        color="#7C3AED"
        points={[
          "% resolved, in progress & overdue at a glance",
          "Executive Summary: highlights, risks, actions",
          "Ask questions in plain English — no Jira skills needed",
        ]}
      />
    </div>
  </Background>
);
