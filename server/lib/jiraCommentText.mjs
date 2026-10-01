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

    // Mentions / emoji often have no text children — use attrs so notes still populate.
    if (node.type === "mention") {
      const label = String(node.attrs?.text || node.attrs?.displayName || "").trim();
      return label ? [label] : [];
    }

    if (node.type === "emoji") {
      const short = String(node.attrs?.shortName || node.attrs?.text || "").trim();
      return short ? [short] : [];
    }

    if (node.type === "inlineCard" || node.type === "blockCard" || node.type === "embedCard") {
      const url = String(node.attrs?.url || "").trim();
      return url ? [url] : [];
    }

    if (node.type === "hardBreak") {
      return [" "];
    }

    if (!Array.isArray(node.content)) {
      return [];
    }

    return node.content.flatMap(walk);
  };

  return walk(body).join("").replace(/\s+/g, " ").trim();
};

const commentFieldsFrom = (comment) => {
  const text = adfToPlainText(comment?.body);
  const author = String(
    comment?.author?.displayName || comment?.author?.name || ""
  ).trim();
  const created = String(comment?.created || "").trim();
  return { text, author, created };
};

const fetchLastCommentByStartAt = async ({ encodedKey, jiraRequest }) => {
  const probe = await jiraRequest({
    pathWithQuery: `/rest/api/3/issue/${encodedKey}/comment?maxResults=1`,
  });
  if (!probe.ok) {
    return { ok: false, error: probe.data };
  }
  const total = Number(probe.data?.total || 0);
  if (total <= 0) {
    return { ok: true, comment: null };
  }
  if (total === 1) {
    const comments = Array.isArray(probe.data?.comments) ? probe.data.comments : [];
    return { ok: true, comment: comments[0] || null };
  }
  const startAt = Math.max(0, total - 1);
  const lastPage = await jiraRequest({
    pathWithQuery: `/rest/api/3/issue/${encodedKey}/comment?startAt=${startAt}&maxResults=1`,
  });
  if (!lastPage.ok) {
    return { ok: false, error: lastPage.data };
  }
  const comments = Array.isArray(lastPage.data?.comments) ? lastPage.data.comments : [];
  return { ok: true, comment: comments[0] || null };
};

export const fetchLatestCommentTextForIssue = async ({ issueKey, jiraRequest }) => {
  const encodedKey = encodeURIComponent(issueKey);
  const result = await jiraRequest({
    pathWithQuery: `/rest/api/3/issue/${encodedKey}/comment?orderBy=-created&maxResults=1`,
  });

  if (!result.ok) {
    const fallback = await fetchLastCommentByStartAt({ encodedKey, jiraRequest });
    if (!fallback.ok) {
      return { issueKey, text: "", error: result.data };
    }
    const { text, author, created } = commentFieldsFrom(fallback.comment);
    return { issueKey, text, author, created, error: null };
  }

  const comments = Array.isArray(result.data?.comments) ? result.data.comments : [];
  const { text, author, created } = commentFieldsFrom(comments[0]);
  return { issueKey, text, author, created, error: null };
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

    results.forEach(({ issueKey, text, author, created }) => {
      if (text) {
        const entry = { text, author: author || "", created: created || "" };
        items[issueKey] = entry;
        const upper = issueKey.toUpperCase();
        if (upper !== issueKey) {
          items[upper] = entry;
        }
      }
    });
  }

  return { items };
};
