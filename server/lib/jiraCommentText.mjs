const chunkArray = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

export const adfToPlainText = (body) => {
  if (typeof body === "string") {
    return body.trim();
  }

  if (!body || typeof body !== "object") {
    return "";
  }

  const walk = (node) => {
    if (!node || typeof node !== "object") {
      return [];
    }

    if (node.type === "text" && typeof node.text === "string") {
      return [node.text];
    }

    if (!Array.isArray(node.content)) {
      return [];
    }

    return node.content.flatMap(walk);
  };

  return walk(body).join("").replace(/\s+/g, " ").trim();
};

export const fetchLatestCommentTextForIssue = async ({ issueKey, jiraRequest }) => {
  const result = await jiraRequest({
    pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?orderBy=-created&maxResults=1`,
  });

  if (!result.ok) {
    return { issueKey, text: "", error: result.data };
  }

  const comments = Array.isArray(result.data?.comments) ? result.data.comments : [];
  const latest = comments[0];
  const text = adfToPlainText(latest?.body);
  const author = String(
    latest?.author?.displayName || latest?.author?.name || ""
  ).trim();

  return { issueKey, text, author, error: null };
};

export const fetchLatestCommentTextBulk = async ({
  issueKeys,
  jiraRequest,
  chunkSize = 10,
}) => {
  const uniqueKeys = Array.from(
    new Set(
      (issueKeys || [])
        .map((key) => String(key || "").trim())
        .filter((key) => key.length > 0)
    )
  );

  if (uniqueKeys.length === 0) {
    return { items: {} };
  }

  const items = {};

  for (const chunk of chunkArray(uniqueKeys, chunkSize)) {
    const results = await Promise.all(
      chunk.map((issueKey) => fetchLatestCommentTextForIssue({ issueKey, jiraRequest }))
    );

    results.forEach(({ issueKey, text, author }) => {
      if (text) {
        items[issueKey] = { text, author: author || "" };
      }
    });
  }

  return { items };
};
