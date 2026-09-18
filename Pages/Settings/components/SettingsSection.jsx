import React from "react";
import "./settingsSection.css";

const SettingsSection = ({ title, description, children }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="settings-section-collapsible">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`settings-section-toggle${open ? " is-open" : ""}`}
      >
        <span>
          <span className="settings-section-title">{title}</span>
          {!open && description ? (
            <span className="settings-section-description">{description}</span>
          ) : null}
        </span>
        <span className={`settings-section-chevron${open ? " is-open" : ""}`}>›</span>
      </button>
      {open ? (
        <div className="settings-section-body">
          {children}
        </div>
      ) : null}
    </div>
  );
};

export default SettingsSection;
