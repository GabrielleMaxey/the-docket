export const parseJiraResponse = async (response, signal) => {
  signal?.throwIfAborted();
  const text = await response.text();
  signal?.throwIfAborted();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
};
