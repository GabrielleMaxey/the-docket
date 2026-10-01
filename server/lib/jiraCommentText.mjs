const chunkArray = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const markTypes = (marks) =>
  new Set((Array.isArray(marks) ? marks : []).map((mark) => mark?.type).filter(Boolean));

const wrapInlineMarkdown = (text, marks) => {
  let out = String(text || "");
  if (!out) return "";
  const types = markTypes(marks);
  if (types.has("code")) {
    return `\`${out.replace(/`/g, "'")}\``;
  }
  if (types.has("link")) {
    const href = marks.find((mark) => mark?.type === "link")?.attrs?.href;
    if (href) {
      out = `[${out}](${href})`;
    }
  }
  if (types.has("strong")) {
    out = `**${out}**`;
  }
  if (types.has("em")) {
    out = `*${out}*`;
  }
  if (types.has("strike")) {
    out = `~~${out}~~`;
  }
  return out;
};

const inlineFromNode = (node) => {
  if (!node || typeof node !== "object") {
    return "";
  }

  if (node.type === "text" && typeof node.text === "string") {
    return wrapInlineMarkdown(node.text, node.marks);
  }

  if (node.type === "hardBreak") {
    return "\n";
  }

  if (node.type === "mention") {
    return String(node.attrs?.text || node.attrs?.displayName || "").trim();
  }

  if (node.type === "emoji") {
    return String(node.attrs?.shortName || node.attrs?.text || "").trim();
  }

  if (node.type === "inlineCard" || node.type === "blockCard" || node.type === "embedCard") {
    return String(node.attrs?.url || "").trim();
  }

  if (!Array.isArray(node.content)) {
    return "";
  }

  return node.content.map(inlineFromNode).join("");
};

const blockFromNode = (node) => {
  if (!node || typeof node !== "object") {
    return "";
  }

  switch (node.type) {
    case "paragraph":
      return inlineFromNode(node);
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
      const text = inlineFromNode(node).trim();
      return text ? `${"#".repeat(level)} ${text}` : "";
    }
    case "bulletList":
      return (node.content || [])
        .map((item) => {
          const text = (item.content || []).map(blockFromNode).join("\n").trim();
          return text
            .split("\n")
            .map((line, index) => (index === 0 ? `- ${line}` : `  ${line}`))
            .join("\n");
        })
        .filter(Boolean)
        .join("\n");
    case "orderedList": {
      let n = Number(node.attrs?.order) || 1;
      return (node.content || [])
        .map((item) => {
          const text = (item.content || []).map(blockFromNode).join("\n").trim();
          const prefix = `${n++}. `;
          return text
            .split("\n")
            .map((line, index) => (index === 0 ? `${prefix}${line}` : `   ${line}`))
            .join("\n");
        })
        .filter(Boolean)
        .join("\n");
    }
    case "blockquote": {
      const inner = (node.content || []).map(blockFromNode).filter(Boolean).join("\n\n");
      return inner
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    }
    case "codeBlock": {
      const lang = String(node.attrs?.language || "").trim();
      const code = (node.content || [])
        .map((child) => (child.type === "text" ? child.text : inlineFromNode(child)))
        .join("");
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }
    case "rule":
      return "---";
    case "listItem":
      return (node.content || []).map(blockFromNode).filter(Boolean).join("\n");
    case "doc":
      return (node.content || []).map(blockFromNode).filter((part) => part.length > 0).join("\n\n");
    case "mediaSingle":
    case "mediaGroup":
    case "media":
      return "[image]";
    case "panel": {
      const inner = (node.content || []).map(blockFromNode).filter(Boolean).join("\n\n");
      return inner;
    }
    case "table":
      return (node.content || [])
        .map((row) =>
          (row.content || [])
            .map((cell) => (cell.content || []).map(blockFromNode).join(" ").trim())
            .join(" | ")
        )
        .filter(Boolean)
        .join("\n");
    default:
      if (Array.isArray(node.content)) {
        return node.content.map(blockFromNode).filter(Boolean).join("\n\n");
      }
      return inlineFromNode(node);
  }
};

/** ADF → note text with markdown-style structure (newlines, bold, lists, headings). */
export const adfToPlainText = (body) => {
  if (typeof body === "string") {
    return body.replace(/\r\n/g, "\n").trim();
  }

  if (!body || typeof body !== "object") {
    return "";
  }

  return blockFromNode(body)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
