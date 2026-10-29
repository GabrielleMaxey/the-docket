import { adfToPlainText } from "./jiraCommentText.mjs";

const MAX_DESCRIPTION_CHARS = 2000;

// Opt-in per search (the duplicate check): ask Jira for the description too.
export const withDescriptionField = (fields) =>
  Array.isArray(fields) && !fields.includes("description") ? [...fields, "description"] : fields;

// Descriptions arrive as ADF objects; hand the client short plain text instead.
export const withPlainDescriptions = (data) => {
  if (!data || !Array.isArray(data.issues)) return data;
  return {
    ...data,
    issues: data.issues.map((issue) => {
      if (!issue?.fields || !("description" in issue.fields)) return issue;
      return {
        ...issue,
        fields: {
          ...issue.fields,
          description: adfToPlainText(issue.fields.description).slice(0, MAX_DESCRIPTION_CHARS),
        },
      };
    }),
  };
};
