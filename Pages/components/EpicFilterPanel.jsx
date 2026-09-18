import React from "react";
import { Button, Checkbox, Message } from "semantic-ui-react";
import "./EpicFilterPanel.css";

const EpicFilterPanel = ({
  presets,
  loading,
  error,
  selectedPresetIds,
  includePastDue,
  onSelectionChange,
  onSelectAll,
  onClearSelection,
  onIncludePastDueChange,
  onRunSelected,
  runLoading,
  successMessage,
  title = "Epic filters",
  description = "Select epic presets and/or Past Due Projects, then run to load tabbed results.",
  runLabel = "Run Selected",
  showRunButton = true,
  showPastDue = true,
  extraGroupLabel = "",
  extraOptions = [],
  selectedExtraIds = [],
  onToggleExtra,
  onRemoveExtra,
  dropdownLabel = "Epic presets",
  emptyTriggerLabel = "Select epic presets",
}) => {
  const options = presets.map((preset) => ({
    key: preset.id,
    text: preset.label,
    value: preset.id,
  }));

  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef(null);

  React.useEffect(() => {
    const onDocumentClick = (event) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  const selectedLabels = options.filter((option) => selectedPresetIds.includes(option.value));

  const togglePreset = (presetId) => {
    const exists = selectedPresetIds.includes(presetId);
    onSelectionChange(exists
      ? selectedPresetIds.filter((id) => id !== presetId)
      : [...selectedPresetIds, presetId]);
  };

  const removePreset = (presetId) => {
    onSelectionChange(selectedPresetIds.filter((id) => id !== presetId));
  };

  const extraSelected = extraOptions.filter((option) => selectedExtraIds.includes(option.id));
  const selectedCount = selectedLabels.length + extraSelected.length;
  const hasMenuItems = options.length > 0 || extraOptions.length > 0;
  const hasSelection = selectedPresetIds.length > 0 || includePastDue || selectedExtraIds.length > 0;

  return (
    <div className="ww-epic-filter-panel">
      <h3 className="ww-epic-filter-title">{title}</h3>
      <p className="ww-copy">{description}</p>

      {error ? (
        <Message negative size="small">
          {error}
        </Message>
      ) : null}

      <div className="ww-epic-filter-controls">
        <div className="ww-epic-filter-dropdown-wrap">
          <label htmlFor="epic-filter-dropdown-trigger">{dropdownLabel}</label>
          <div className="ww-epic-dropdown" ref={dropdownRef}>
            <button
              id="epic-filter-dropdown-trigger"
              type="button"
              className="ww-epic-dropdown-trigger"
              aria-haspopup="listbox"
              aria-expanded={isDropdownOpen}
              onClick={() => setIsDropdownOpen((open) => !open)}
              disabled={loading || !hasMenuItems}
            >
              <span>
                {loading
                  ? "Loading presets..."
                  : selectedCount > 0
                    ? `${selectedCount} selected`
                    : emptyTriggerLabel}
              </span>
              <span className="ww-epic-dropdown-caret" aria-hidden="true">▾</span>
            </button>

            {isDropdownOpen && hasMenuItems ? (
              <div className="ww-epic-dropdown-menu" role="listbox" aria-multiselectable="true">
                {options.map((option) => {
                  const selected = selectedPresetIds.includes(option.value);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`ww-epic-dropdown-option${selected ? " is-selected" : ""}`}
                      onClick={() => togglePreset(option.value)}
                    >
                      <input type="checkbox" tabIndex={-1} readOnly checked={selected} />
                      <span>{option.text}</span>
                    </button>
                  );
                })}
                {extraOptions.length > 0 ? (
                  <>
                    {extraGroupLabel ? (
                      <div className="ww-epic-dropdown-group-label">{extraGroupLabel}</div>
                    ) : null}
                    {extraOptions.map((option) => {
                      const selected = selectedExtraIds.includes(option.id);
                      return (
                        <button
                          key={`extra-${option.id}`}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`ww-epic-dropdown-option${selected ? " is-selected" : ""}`}
                          title={option.title || ""}
                          onClick={() => onToggleExtra?.(option.id)}
                        >
                          <input type="checkbox" tabIndex={-1} readOnly checked={selected} />
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
                  </>
                ) : null}
              </div>
            ) : null}

            {selectedCount > 0 ? (
              <div className="ww-epic-selected-chips" aria-live="polite">
                {selectedLabels.map((preset) => (
                  <span key={preset.key} className="ww-epic-chip">
                    {preset.text}
                    <button
                      type="button"
                      className="ww-epic-chip-remove"
                      onClick={() => removePreset(preset.value)}
                      aria-label={`Remove ${preset.text}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {extraSelected.map((option) => (
                  <span key={`extra-${option.id}`} className="ww-epic-chip">
                    {option.label}
                    <button
                      type="button"
                      className="ww-epic-chip-remove"
                      onClick={() => onRemoveExtra?.(option.id)}
                      aria-label={`Remove ${option.label}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <Checkbox
          label="Past Due Projects"
          checked={includePastDue}
          onChange={(_event, { checked }) => onIncludePastDueChange(Boolean(checked))}
          style={showPastDue ? {} : { display: "none" }}
        />

        <div className="ww-epic-filter-actions">
          <Button size="small" basic onClick={onSelectAll} disabled={loading || !hasMenuItems}>
            Select All
          </Button>
          <Button size="small" basic onClick={onClearSelection} disabled={!hasSelection}>
            Clear
          </Button>
          {showRunButton ? (
            <Button
              primary
              onClick={onRunSelected}
              loading={runLoading}
              disabled={runLoading || !hasSelection}
            >
              {runLabel}
            </Button>
          ) : null}
        </div>
        {successMessage ? (
          <Message positive size="mini" style={{ marginTop: "0.5rem" }}>
            ✓ {successMessage}
          </Message>
        ) : null}
      </div>
    </div>
  );
};

export default EpicFilterPanel;
