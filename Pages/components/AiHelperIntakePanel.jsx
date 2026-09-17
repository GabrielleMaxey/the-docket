import React from "react";
import { Form, Message } from "semantic-ui-react";
import {
  getAiHelperIntakeFields,
  listBlankOptionalIntakeFields,
} from "../../../shared/aiHelperIntake.mjs";

const inputStyle = {
  width: "100%",
  padding: "0.5em 0.8em",
  border: "1px solid #e2e8f0",
  borderRadius: "6px",
  fontFamily: "inherit",
  fontSize: "0.9rem",
  lineHeight: 1.45,
};

const hintStyle = { fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.25rem" };

const IntakeField = ({ field, value, disabled, missing, onChange }) => {
  const borderColor = missing ? "#dc2626" : "#e2e8f0";
  const shared = {
    value,
    disabled,
    placeholder: field.placeholder || "",
    onChange: (event) => onChange(field.id, event.target.value),
    style: { ...inputStyle, borderColor, ...(field.multiline ? { resize: "vertical" } : {}) },
  };

  return (
    <Form.Field required={Boolean(field.required)}>
      <label>{field.label}</label>
      {field.multiline ? <textarea rows={2} {...shared} /> : <input type="text" {...shared} />}
      {field.hint ? <p style={hintStyle}>{field.hint}</p> : null}
      {missing ? (
        <p style={{ ...hintStyle, color: "#991b1b" }}>Required before the AI helper can draft.</p>
      ) : null}
    </Form.Field>
  );
};

/**
 * Guided intake for the "Use AI helper" flow. Only the basic ask is required —
 * everything else can be left blank and finished in Jira after the issue exists.
 */
const AiHelperIntakePanel = ({
  issueType,
  values,
  disabled = false,
  missingFieldIds = [],
  onFieldChange,
}) => {
  const fields = React.useMemo(() => getAiHelperIntakeFields(issueType), [issueType]);
  const requiredFields = fields.filter((field) => field.required);
  const optionalFields = fields.filter((field) => !field.required);
  const missing = new Set(missingFieldIds);
  const blankOptional = listBlankOptionalIntakeFields(issueType, values);

  return (
    <div
      style={{
        border: "1px solid #dbeafe",
        background: "#f8fbff",
        borderRadius: "8px",
        padding: "0.9rem 1rem 0.6rem",
        marginBottom: "1rem",
      }}
    >
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "#475569" }}>
        Answer the basic ask and the AI writes the title and description from your words. Everything
        below the divider is optional — skip what you do not know yet.
      </p>

      {requiredFields.map((field) => (
        <IntakeField
          key={field.id}
          field={field}
          value={values?.[field.id] || ""}
          disabled={disabled}
          missing={missing.has(field.id)}
          onChange={onFieldChange}
        />
      ))}

      <div
        style={{
          borderTop: "1px dashed #cbd5e1",
          margin: "0.4rem 0 0.9rem",
          paddingTop: "0.75rem",
          fontSize: "0.82rem",
          fontWeight: 600,
          color: "#64748b",
        }}
      >
        Optional detail — improves the draft, but never blocks it
      </div>

      {optionalFields.map((field) => (
        <IntakeField
          key={field.id}
          field={field}
          value={values?.[field.id] || ""}
          disabled={disabled}
          missing={false}
          onChange={onFieldChange}
        />
      ))}

      {blankOptional.length > 0 ? (
        <Message info size="small" style={{ marginTop: "0.4rem" }}>
          <strong>Left blank:</strong> {blankOptional.map((field) => field.label).join(", ")}.
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.82rem" }}>
            The AI will leave these out rather than guess. Fill them in on the Jira issue after it is
            created so the ticket is complete.
          </p>
        </Message>
      ) : null}
    </div>
  );
};

export default AiHelperIntakePanel;
