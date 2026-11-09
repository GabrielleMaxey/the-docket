import React from "react";
import { noteMarkdownToHtml } from "../utils/noteMarkdown.js";
import {
  toggleWrap,
  toggleLinePrefix,
  setHeading,
  insertLink,
  continueList,
  linkOverSelection,
} from "../utils/noteFormatting.js";
import { htmlToNoteMarkdown } from "../utils/noteClipboard.js";
import NoteToolbar from "./NoteToolbar.jsx";
import NoteFormattingHelp from "./NoteFormattingHelp.jsx";

export const NOTE_PLACEHOLDER = "Add notes here. Select text and use the toolbar, or paste a screenshot.";

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
  placeholder = NOTE_PLACEHOLDER,
  title,
  disabled = false,
  modal = false,
  saveState,
}) => {
  const [editing, setEditing] = React.useState(false);
  const textareaRef = React.useRef(null);
  const [showSaving, setShowSaving] = React.useState(false);

  React.useEffect(() => {
    setShowSaving(false);
    if (!saveState?.loading) return;
    const timer = window.setTimeout(() => setShowSaving(true), 750);
    return () => window.clearTimeout(timer);
  }, [saveState?.loading]);
  const html = React.useMemo(() => noteMarkdownToHtml(value), [value]);
  const showPreview = !editing && Boolean(String(value || "").trim()) && Boolean(html);

  React.useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const length = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(length, length);
    }
  }, [editing]);

  const pendingSelectionRef = React.useRef(null);

  // Restore the selection after React re-renders the textarea with the edited value.
  React.useLayoutEffect(() => {
    const pending = pendingSelectionRef.current;
    if (pending && textareaRef.current) {
      textareaRef.current.setSelectionRange(pending[0], pending[1]);
      pendingSelectionRef.current = null;
    }
  }, [value]);

  const readEdit = () => {
    const ta = textareaRef.current;
    return ta ? { value: ta.value, selectionStart: ta.selectionStart, selectionEnd: ta.selectionEnd } : null;
  };

  // fn(edit) -> edit | null. Returns true when an edit was applied.
  const applyEdit = (fn) => {
    const current = readEdit();
    if (!current) return false;
    const result = fn(current);
    if (!result) return false;
    pendingSelectionRef.current = [result.selectionStart, result.selectionEnd];
    onChange(result.value);
    return true;
  };

  const handleToolbarAction = (name) => {
    applyEdit((edit) => {
      switch (name) {
        case "bold": return toggleWrap(edit, "**");
        case "italic": return toggleWrap(edit, "*");
        case "strike": return toggleWrap(edit, "~~");
        case "code": return toggleWrap(edit, "`");
        case "bullet":
        case "numbered":
        case "quote": return toggleLinePrefix(edit, name);
        case "heading": {
          const lineStart = edit.selectionStart === 0 ? 0 : edit.value.lastIndexOf("\n", edit.selectionStart - 1) + 1;
          const isHeading = /^## /.test(edit.value.slice(lineStart));
          return setHeading(edit, isHeading ? 0 : 2);
        }
        case "link": {
          const hadSelection = edit.selectionStart !== edit.selectionEnd;
          const next = insertLink(edit, "url");
          // With text selected, select the "url" placeholder so typing replaces it.
          return hadSelection ? { ...next, selectionStart: next.selectionStart - 4, selectionEnd: next.selectionStart - 1 } : next;
        }
        default: return null;
      }
    });
  };

  const handleKeyDown = (event) => {
    if (event.nativeEvent?.isComposing) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && !event.shiftKey && !event.altKey) {
      const key = event.key.toLowerCase();
      const action = { b: "bold", i: "italic", k: "link" }[key];
      if (action) {
        event.preventDefault();
        handleToolbarAction(action);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !mod && !event.altKey) {
      if (applyEdit(continueList)) event.preventDefault();
    }
  };

  const handlePaste = (event) => {
    const data = event.clipboardData;
    if (!data || (data.files && data.files.length > 0)) return; // screenshots/files: the images strip handles them
    const text = data.getData("text/plain");
    if (applyEdit((edit) => linkOverSelection(edit, text))) {
      event.preventDefault();
      return;
    }
    const html = data.getData("text/html");
    if (!html) return;
    const markdown = htmlToNoteMarkdown(html);
    if (!markdown) return;
    event.preventDefault();
    applyEdit((edit) => {
      const next = edit.value.slice(0, edit.selectionStart) + markdown + edit.value.slice(edit.selectionEnd);
      const cursor = edit.selectionStart + markdown.length;
      return { value: next, selectionStart: cursor, selectionEnd: cursor };
    });
  };

  const startEditing = () => {
    if (!disabled) setEditing(true);
  };

  const field = showPreview ? (
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
  ) : (
    <textarea
      ref={textareaRef}
      className={className}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => setEditing(false)}
      onFocus={() => setEditing(true)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      placeholder={placeholder}
      title={title}
      disabled={disabled}
    />
  );

  let saveMessage = saveState?.success || "";
  if (saveState?.loading) saveMessage = showSaving ? "Saving…" : "";

  return (
    <>
      {!disabled && (modal || editing) && (
        <NoteToolbar compact={!modal} onAction={handleToolbarAction} disabled={showPreview}>
          <NoteFormattingHelp />
        </NoteToolbar>
      )}
      {field}
      {saveState && (
        <div
          className={`ww-note-save-status${saveState.error ? " ww-note-save-status--error" : ""}`}
          role={saveState.error ? "alert" : "status"}
          aria-live={saveState.error ? "assertive" : "polite"}
        >
          {saveState.error || saveMessage}
        </div>
      )}
    </>
  );
};

export default NoteFormattedField;
