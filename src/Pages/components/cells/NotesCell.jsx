import React from "react";
import NoteFormattedField from "../../../Components/NoteFormattedField.jsx";

const NotesCell = ({ issueKey, isClosedOrResolved, noteDraft, isNoteAlreadyPushed, onChange }) => (
  <td>
    {isClosedOrResolved ? (
      <span>-</span>
    ) : (
      <NoteFormattedField
        className={`ww-note-textarea${isNoteAlreadyPushed ? " ww-note-textarea-pushed" : ""}`}
        value={noteDraft}
        onChange={(next) => onChange(issueKey, next)}
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
