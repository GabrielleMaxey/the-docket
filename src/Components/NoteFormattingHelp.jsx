import React from "react";

const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘" : "Ctrl+";

const ROWS = [
  ["**text**", "Bold"],
  ["*text*", "Italic"],
  ["~~text~~", "Strikethrough"],
  ["`text`", "Code"],
  ["[text](https://…)", "Link"],
  ["- item", "Bulleted list"],
  ["1. item", "Numbered list"],
  ["> text", "Quote"],
  ["# Title  ·  ## Subtitle", "Headings"],
];

const NoteFormattingHelp = () => {
  const [open, setOpen] = React.useState(false);
  return (
    <span className="ww-note-help">
      <button
        type="button"
        className="ww-note-toolbar-btn ww-note-help-btn"
        aria-label="Formatting help"
        aria-expanded={open}
        title="Formatting help"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <div className="ww-note-help-panel" role="dialog" aria-label="Formatting help" onMouseDown={(event) => event.preventDefault()}>
          <p className="ww-note-help-title">Select text, then use the buttons — or type:</p>
          <table>
            <tbody>
              {ROWS.map(([typed, result]) => (
                <tr key={result}>
                  <td><code>{typed}</code></td>
                  <td>{result}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Shortcuts: {MOD}B bold, {MOD}I italic, {MOD}K link. Press Enter in a list to continue it, Enter on an empty item to end it.</p>
          <p>Paste from Word, Outlook or a web page and basic formatting carries over. Paste a screenshot to attach it.</p>
        </div>
      )}
    </span>
  );
};

export default NoteFormattingHelp;
