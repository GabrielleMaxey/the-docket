import React from "react";
import { FiLink } from "react-icons/fi";

const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘" : "Ctrl+";

const BUTTONS = [
  { name: "bold", label: "Bold", shortcut: `${MOD}B`, glyph: <strong>B</strong> },
  { name: "italic", label: "Italic", shortcut: `${MOD}I`, glyph: <em>I</em> },
  { name: "strike", label: "Strikethrough", glyph: <s>S</s> },
  { name: "code", label: "Code", glyph: <code>{"</>"}</code> },
  { name: "heading", label: "Heading", glyph: "H" },
  { name: "bullet", label: "Bulleted list", glyph: "•" },
  { name: "numbered", label: "Numbered list", glyph: "1." },
  { name: "quote", label: "Quote", glyph: "❝" },
  { name: "link", label: "Link", shortcut: `${MOD}K`, glyph: <FiLink aria-hidden="true" /> },
];

/**
 * Formatting buttons for the notes textarea. mousedown is cancelled so the
 * textarea keeps focus (and its selection) while a button is used.
 */
const NoteToolbar = ({ compact = false, onAction, disabled = false, children }) => (
  <div
    className={`ww-note-toolbar${compact ? " ww-note-toolbar--compact" : ""}`}
    role="toolbar"
    aria-label="Format note"
  >
    {BUTTONS.map(({ name, label, shortcut, glyph }) => {
      const title = shortcut ? `${label} (${shortcut})` : label;
      return (
        <button
          key={name}
          type="button"
          className="ww-note-toolbar-btn"
          aria-label={label}
          title={title}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onAction(name)}
        >
          <span aria-hidden="true">{glyph}</span>
          {!compact && <span className="ww-note-toolbar-label">{label}</span>}
        </button>
      );
    })}
    {children}
  </div>
);

export default NoteToolbar;
