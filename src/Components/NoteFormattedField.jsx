import React from "react";
import { noteMarkdownToHtml } from "../utils/noteMarkdown.js";

/**
 * Notes field: formatted preview when idle; textarea while editing so markdown
 * from pulled Jira comments (bold, lists, headings, newlines) is readable.
 *
 * Preview uses a div (not a button) so heading/list styles are not reset by
 * user-agent / Semantic UI button rules.
 */
const NoteFormattedField = ({
  className = "",
  value,
  onChange,
  placeholder = "Add notes here",
  title,
  disabled = false,
  modal = false,
}) => {
  const [editing, setEditing] = React.useState(false);
  const textareaRef = React.useRef(null);
  const html = React.useMemo(() => noteMarkdownToHtml(value), [value]);
  const showPreview = !editing && Boolean(String(value || "").trim()) && Boolean(html);

  React.useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const length = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(length, length);
    }
  }, [editing]);

  const startEditing = () => {
    if (!disabled) setEditing(true);
  };

  if (showPreview) {
    return (
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        className={`ww-note-formatted-preview${modal ? " ww-note-formatted-preview--modal" : ""}${
          className ? ` ${className}` : ""
        }`}
        onClick={startEditing}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            startEditing();
          }
        }}
        title={title || "Click to edit notes"}
        aria-label={title || "Formatted notes preview. Activate to edit."}
      >
        <div
          className="ww-note-formatted-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    );
  }

  return (
    <textarea
      ref={textareaRef}
      className={className}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => setEditing(false)}
      onFocus={() => setEditing(true)}
      placeholder={placeholder}
      title={title}
      disabled={disabled}
    />
  );
};

export default NoteFormattedField;
