import React from "react";

const NotesCell = ({ issueKey, isClosedOrResolved, noteDraft, isNoteAlreadyPushed, onChange }) => (
  <td>
    {isClosedOrResolved ? (
      <span>-</span>
    ) : (
      <textarea
        className={`ww-note-textarea${isNoteAlreadyPushed ? " ww-note-textarea-pushed" : ""}`}
        value={noteDraft}
        onChange={(event) => onChange(issueKey, event.target.value)}
        placeholder="Add notes here"
        title={
          isNoteAlreadyPushed
            ? "This note was pushed to Jira. Change the text to add a new note before pushing again."
            : undefined
        }
      />
    )}
  </td>
);

export default NotesCell;
