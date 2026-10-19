import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fontFamily, monoFamily } from "./theme";

const ease = Easing.bezier(0.16, 1, 0.3, 1);

// Scenes are authored on a fixed timeline; when the voiceover runs longer,
// the parent sets a time scale > 1 so every animation stretches to match.
export const TimeScaleContext = React.createContext(1);

// Use this instead of useCurrentFrame() inside scenes so timing stretches.
export const useSceneFrame = () => {
  const frame = useCurrentFrame();
  return frame / React.useContext(TimeScaleContext);
};

// Fade + rise in at `at` seconds. Optional fade-out at `out` seconds.
export const useAppear = (at: number, out?: number): React.CSSProperties => {
  const frame = useSceneFrame();
  const { fps } = useVideoConfig();
  const inP = interpolate(frame, [at * fps, at * fps + 0.6 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const outP =
    out === undefined
      ? 1
      : interpolate(frame, [out * fps, out * fps + 0.4 * fps], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  return {
    opacity: inP * outP,
    translate: `0px ${(1 - inP) * 30}px`,
  };
};

export const Appear: React.FC<{
  at: number;
  out?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ at, out, style, children }) => {
  const s = useAppear(at, out);
  return <div style={{ ...style, ...s }}>{children}</div>;
};

// Seconds-based progress 0..1 between two times.
export const useProgress = (from: number, to: number) => {
  const frame = useSceneFrame();
  const { fps } = useVideoConfig();
  return interpolate(frame, [from * fps, to * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
};

export const useSeconds = () => {
  const frame = useSceneFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
};

export const Logo: React.FC<{ size: number; style?: React.CSSProperties }> = ({
  size,
  style,
}) => (
  <Img
    src={staticFile("logo.svg")}
    style={{ width: size, height: size, ...style }}
  />
);

export const Background: React.FC<{
  dark?: boolean;
  children: React.ReactNode;
}> = ({ dark, children }) => {
  const frame = useSceneFrame();
  return (
    <AbsoluteFill
      style={{
        fontFamily,
        color: dark ? "white" : colors.text,
        background: dark
          ? `radial-gradient(circle at ${30 + Math.sin(frame / 90) * 8}% 20%, #1B4A4D 0%, ${colors.teal} 45%, ${colors.ink} 100%)`
          : `radial-gradient(circle at ${80 + Math.sin(frame / 90) * 6}% 10%, #FFE9DE 0%, #F7F9FB 40%, #EEF3F7 100%)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export type Audience = "Everyone" | "Developers" | "Project Managers" | "Executives" | "Admins";

const audienceColor: Record<Audience, string> = {
  Everyone: colors.teal,
  Developers: "#2563EB",
  "Project Managers": "#C2410C",
  Executives: "#7C3AED",
  Admins: "#0F766E",
};

export const AudienceChips: React.FC<{ who: Audience[] }> = ({ who }) => (
  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
    {who.map((w) => (
      <div
        key={w}
        style={{
          fontSize: 24,
          fontWeight: 700,
          padding: "8px 18px",
          borderRadius: 999,
          color: audienceColor[w],
          background: `${audienceColor[w]}18`,
          border: `2px solid ${audienceColor[w]}55`,
        }}
      >
        {w}
      </div>
    ))}
  </div>
);

// Standard tutorial scene: narration column on the left, mock UI on the right.
export const TutorialScene: React.FC<{
  step: string;
  title: string;
  lines: { at: number; text: React.ReactNode }[];
  who: Audience[];
  children: React.ReactNode;
}> = ({ step, title, lines, who, children }) => {
  return (
    <Background>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 110,
          width: 640,
          bottom: 110,
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
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
            {step}
          </div>
        </Appear>
        <Appear at={0.25}>
          <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1.05 }}>
            {title}
          </div>
        </Appear>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 8 }}>
          {lines.map((l, i) => (
            <Appear key={i} at={l.at}>
              <div
                style={{
                  fontSize: 38,
                  lineHeight: 1.3,
                  color: colors.text,
                  display: "flex",
                  gap: 16,
                }}
              >
                <span style={{ color: colors.orange, fontWeight: 900 }}>›</span>
                <span>{l.text}</span>
              </div>
            </Appear>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <Appear at={0.5}>
          <AudienceChips who={who} />
        </Appear>
      </div>
      <div
        style={{
          position: "absolute",
          left: 800,
          top: 90,
          right: 70,
          bottom: 90,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
    </Background>
  );
};

export const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{
      fontWeight: 900,
      color: colors.teal,
      background: `${colors.yellow}55`,
      padding: "0 8px",
      borderRadius: 6,
    }}
  >
    {children}
  </span>
);

export const Code: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{
      fontFamily: monoFamily,
      fontSize: "0.85em",
      background: "#E7EDF2",
      padding: "2px 10px",
      borderRadius: 8,
    }}
  >
    {children}
  </span>
);

// ---------- Mock app chrome ----------

export const TABS = [
  "Task Management",
  "Metrics",
  "Project Managers",
  "Past Reports",
  "Chat",
] as const;

export const AppWindow: React.FC<{
  active?: string;
  url?: string;
  width?: number;
  height?: number;
  tabHighlight?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({
  active,
  url = "localhost:5173",
  width = 1040,
  height = 800,
  tabHighlight,
  children,
  style,
}) => {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 18,
        overflow: "hidden",
        background: colors.appBg,
        boxShadow: "0 40px 90px rgba(15,49,51,0.28), 0 8px 20px rgba(15,49,51,0.12)",
        border: `1px solid ${colors.border}`,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        ...style,
      }}
    >
      <div
        style={{
          height: 46,
          background: "#E9EDF1",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 18px",
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />
        ))}
        <div
          style={{
            marginLeft: 24,
            flex: 1,
            height: 28,
            borderRadius: 8,
            background: "white",
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            fontSize: 17,
            color: colors.muted,
          }}
        >
          🔒 {url}
        </div>
      </div>
      {active !== undefined ? (
        <div
          style={{
            height: 60,
            background: `linear-gradient(90deg, ${colors.navFrom}, ${colors.navTo})`,
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            gap: 4,
            color: "white",
          }}
        >
          <Logo size={34} />
          <div style={{ fontWeight: 900, fontSize: 21, marginLeft: 8, marginRight: "auto" }}>
            The Docket
          </div>
          {[...TABS, "⚙"].map((t) => {
            const isActive = t === active || (t === "⚙" && active === "Settings");
            const isHi = t === tabHighlight || (t === "⚙" && tabHighlight === "Settings");
            return (
              <div
                key={t}
                style={{
                  fontSize: t === "⚙" ? 24 : 17,
                  fontWeight: 700,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: isHi
                    ? colors.yellow
                    : isActive
                      ? "rgba(255,255,255,0.22)"
                      : "transparent",
                  color: isHi ? colors.teal : "white",
                }}
              >
                {t}
              </div>
            );
          })}
        </div>
      ) : null}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>{children}</div>
    </div>
  );
};

export const Panel: React.FC<{
  title?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ title, children, style }) => (
  <div
    style={{
      background: colors.panel,
      border: `1px solid ${colors.border}`,
      borderRadius: 12,
      overflow: "hidden",
      ...style,
    }}
  >
    {title ? (
      <div
        style={{
          padding: "12px 18px",
          fontWeight: 900,
          fontSize: 20,
          background: "#F0F4F7",
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        {title}
      </div>
    ) : null}
    <div style={{ padding: 18 }}>{children}</div>
  </div>
);

export const Button: React.FC<{
  children: React.ReactNode;
  pressed?: boolean;
  variant?: "primary" | "ghost" | "ai";
  style?: React.CSSProperties;
}> = ({ children, pressed, variant = "primary", style }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 20px",
      borderRadius: 8,
      fontWeight: 700,
      fontSize: 18,
      background:
        variant === "primary" ? colors.blue : variant === "ai" ? "#2563EB" : "white",
      color: variant === "ghost" ? colors.text : "white",
      border: variant === "ghost" ? `1px solid ${colors.border}` : "none",
      scale: pressed ? "0.94" : "1",
      filter: pressed ? "brightness(0.85)" : "none",
      ...style,
    }}
  >
    {children}
  </div>
);

export const Field: React.FC<{
  label?: string;
  value: React.ReactNode;
  mono?: boolean;
  style?: React.CSSProperties;
}> = ({ label, value, mono, style }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
    {label ? (
      <div style={{ fontSize: 15, fontWeight: 700, color: colors.muted }}>{label}</div>
    ) : null}
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: "9px 12px",
        fontSize: 18,
        background: "white",
        fontFamily: mono ? monoFamily : undefined,
        minHeight: 22,
      }}
    >
      {value}
    </div>
  </div>
);

// Typewriter text between two times (seconds).
export const Typed: React.FC<{ text: string; from: number; to: number }> = ({
  text,
  from,
  to,
}) => {
  const p = useProgress(from, to);
  const n = Math.round(text.length * p);
  const t = useSeconds();
  const caret = t >= from && t <= to + 0.6 && Math.floor(t * 2) % 2 === 0;
  return (
    <span>
      {text.slice(0, n)}
      <span style={{ opacity: caret ? 1 : 0 }}>▏</span>
    </span>
  );
};

// Animated mouse pointer that glides between waypoints (in seconds, px)
// relative to its positioned parent. `click: true` shows a ripple.
export const Cursor: React.FC<{
  points: { t: number; x: number; y: number; click?: boolean }[];
}> = ({ points }) => {
  const frame = useSceneFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const times = points.map((p) => p.t * fps);
  const x = interpolate(frame, times, points.map((p) => p.x), {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const y = interpolate(frame, times, points.map((p) => p.y), {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const visible = interpolate(frame, [times[0] - 8, times[0]], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lastClick = [...points].reverse().find((p) => p.click && p.t <= t);
  const sinceClick = lastClick ? t - lastClick.t : 99;
  const ripple = sinceClick < 0.5 ? sinceClick / 0.5 : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity: visible,
        zIndex: 50,
        pointerEvents: "none",
      }}
    >
      {ripple > 0 ? (
        <div
          style={{
            position: "absolute",
            left: -30 * ripple,
            top: -30 * ripple,
            width: 60 * ripple,
            height: 60 * ripple,
            borderRadius: "50%",
            border: `4px solid ${colors.orange}`,
            opacity: 1 - ripple,
          }}
        />
      ) : null}
      <svg width="34" height="40" viewBox="0 0 24 28" style={{ filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.35))" }}>
        <path
          d="M2 2 L2 22 L7.5 17 L11 25.5 L14.5 24 L11 15.8 L18.5 15.8 Z"
          fill="white"
          stroke="#111"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

// Pulsing callout ring around a rectangle, visible between from/to seconds.
export const Spotlight: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  from: number;
  to: number;
  label?: string;
  labelSide?: "top" | "bottom";
}> = ({ x, y, w, h, from, to, label, labelSide = "bottom" }) => {
  const t = useSeconds();
  const s = useAppear(from, to);
  if (t < from - 0.1 || t > to + 0.6) return null;
  const pulse = 1 + Math.sin(t * 6) * 0.015;
  return (
    <div
      style={{
        position: "absolute",
        left: x - 8,
        top: y - 8,
        width: w + 16,
        height: h + 16,
        borderRadius: 14,
        border: `4px solid ${colors.orange}`,
        boxShadow: `0 0 28px ${colors.orange}`,
        scale: String(pulse),
        zIndex: 40,
        opacity: s.opacity,
        pointerEvents: "none",
      }}
    >
      {label ? (
        <div
          style={{
            position: "absolute",
            left: -4,
            [labelSide === "bottom" ? "top" : "bottom"]: h + 22,
            background: colors.orange,
            color: "white",
            fontWeight: 900,
            fontSize: 20,
            padding: "6px 14px",
            borderRadius: 8,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
};

export const Pill: React.FC<{ color: string; children: React.ReactNode; style?: React.CSSProperties }> = ({
  color,
  children,
  style,
}) => (
  <span
    style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: 999,
      fontSize: 15,
      fontWeight: 700,
      color,
      background: `${color}1F`,
      border: `1px solid ${color}55`,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </span>
);

// Simple animated donut/pie from slices.
export const Donut: React.FC<{
  size: number;
  slices: { value: number; color: string }[];
  progress: number;
  hole?: number;
}> = ({ size, slices, progress, hole = 0.55 }) => {
  const total = slices.reduce((a, s) => a + s.value, 0);
  let acc = 0;
  const stops = slices
    .map((s) => {
      const start = (acc / total) * 360 * progress;
      acc += s.value;
      const end = (acc / total) * 360 * progress;
      return `${s.color} ${start}deg ${end}deg`;
    })
    .join(", ");
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `conic-gradient(${stops}, #E5EAEE ${360 * progress}deg 360deg)`,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: (size * (1 - hole)) / 2,
          borderRadius: "50%",
          background: "white",
        }}
      />
    </div>
  );
};
