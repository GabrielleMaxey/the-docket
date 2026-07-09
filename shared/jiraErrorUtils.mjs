export const isWorkfrontJiraErrorMessage = (message) =>
  /workfront/i.test(String(message || ""));

export const filterWorkfrontErrorMessages = (messages) => {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((item) => String(item || "").trim())
    .filter((item) => item && !isWorkfrontJiraErrorMessage(item));
};

export const filterWorkfrontErrorsObject = (errors) => {
  if (!errors || typeof errors !== "object") {
    return {};
  }

  const filtered = {};
  for (const [field, message] of Object.entries(errors)) {
    const detail = String(message || "").trim();
    if (detail && !isWorkfrontJiraErrorMessage(detail) && !isWorkfrontJiraErrorMessage(field)) {
      filtered[field] = message;
    }
  }
  return filtered;
};

export const sanitizeJiraErrorData = (data) => {
  if (!data || typeof data !== "object") {
    return data;
  }

  const errorMessages = filterWorkfrontErrorMessages(data.errorMessages);
  const errors = filterWorkfrontErrorsObject(data.errors);
  const message = isWorkfrontJiraErrorMessage(data.message) ? "" : data.message;

  return {
    ...data,
    ...(Array.isArray(data.errorMessages) ? { errorMessages } : {}),
    ...(data.errors ? { errors } : {}),
    ...(message !== undefined ? { message } : {}),
  };
};

export const hasOnlyWorkfrontJiraErrors = (data) => {
  const sanitized = sanitizeJiraErrorData(data);
  const errorMessages = Array.isArray(sanitized?.errorMessages) ? sanitized.errorMessages : [];
  const errors =
    sanitized?.errors && typeof sanitized.errors === "object" ? sanitized.errors : {};
  const message = String(sanitized?.message || "").trim();

  const hadSourceMessages = Array.isArray(data?.errorMessages) && data.errorMessages.length > 0;
  const hadSourceErrors =
    data?.errors && typeof data.errors === "object" && Object.keys(data.errors).length > 0;
  const hadSourceMessage = Boolean(String(data?.message || "").trim());

  if (!hadSourceMessages && !hadSourceErrors && !hadSourceMessage) {
    return false;
  }

  return errorMessages.length === 0 && Object.keys(errors).length === 0 && !message;
};
