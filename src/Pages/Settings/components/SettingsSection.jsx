import React from "react";

const SettingsSection = ({ title, description, children }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="settings-section-collapsible" style={{ marginBottom: "1.25rem" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "0.75rem",
          padding: "0.85rem 1rem",
          border: "1px solid #e2e8f0",
          borderRadius: open ? "10px 10px 0 0" : "10px",
          background: "#f8fafc",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span>
          <span style={{ display: "block", fontWeight: 700, fontSize: "1rem", color: "#0f172a" }}>{title}</span>
          {!open && description ? (
            <span style={{ display: "block", fontSize: "0.8rem", color: "#64748b", fontWeight: 400, marginTop: "0.15rem" }}>{description}</span>
          ) : null}
        </span>
        <span style={{ fontSize: "1rem", color: "#94a3b8", transform: open ? "rotate(-90deg)" : "rotate(90deg)", display: "inline-block", transition: "transform 0.18s", lineHeight: 1, flexShrink: 0, marginTop: "0.15rem" }}>›</span>
      </button>
      {open ? (
        <div style={{ border: "1px solid #e2e8f0", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "1.25rem" }}>
          {children}
        </div>
      ) : null}
    </div>
  );
};

export default SettingsSection;
