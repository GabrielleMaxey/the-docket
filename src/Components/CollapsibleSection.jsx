import React from "react";
import { usePersistedState } from "../Pages/hooks/usePersistedState";
import "./collapsible.css";

const CollapsibleSection = ({
  title,
  subtitle,
  badge,
  storageKey,
  persistKeyPrefix = "",
  defaultOpen = true,
  className = "",
  children,
}) => {
  const fullPersistKey = storageKey ? `${persistKeyPrefix}${storageKey}` : null;
  const persistedState = usePersistedState(fullPersistKey || "__collapsible-unused__", defaultOpen);
  const localState = React.useState(defaultOpen);
  const [isOpen, setIsOpen] = fullPersistKey ? persistedState : localState;

  return (
    <div className={`app-collapsible ${className}`.trim()}>
      <button
        type="button"
        className="app-collapsible-header"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
      >
        <span className="app-collapsible-title-wrap">
          <span className="app-collapsible-title">{title}</span>
          {subtitle ? <span className="app-collapsible-subtitle">{subtitle}</span> : null}
        </span>
        {badge != null ? <span className="app-collapsible-badge">{badge}</span> : null}
        <span className={`app-collapsible-chevron${isOpen ? " open" : ""}`}>›</span>
      </button>
      {isOpen ? <div className="app-collapsible-body">{children}</div> : null}
    </div>
  );
};

export default CollapsibleSection;
