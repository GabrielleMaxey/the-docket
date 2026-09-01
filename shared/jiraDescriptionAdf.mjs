const bulletLinePattern = /^-\s+/;

const paragraphNode = (text) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const bulletListNode = (items) => ({
  type: "bulletList",
  content: items.map((item) => ({
    type: "listItem",
    content: [paragraphNode(item)],
  })),
});

const parseBlock = (block) => {
  const lines = block.split("\n").map((line) => line.trimEnd()).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return [];
  }

  const bulletLines = lines.filter((line) => bulletLinePattern.test(line));
  const nonBulletLines = lines.filter((line) => !bulletLinePattern.test(line));

  if (bulletLines.length === lines.length) {
    return [bulletListNode(bulletLines.map((line) => line.replace(bulletLinePattern, "")))];
  }

  if (
    nonBulletLines.length === 1 &&
    nonBulletLines[0].endsWith(":") &&
    bulletLines.length > 0
  ) {
    return [
      paragraphNode(nonBulletLines[0]),
      bulletListNode(bulletLines.map((line) => line.replace(bulletLinePattern, ""))),
    ];
  }

  return [paragraphNode(block)];
};

/**
 * Convert plain-text ODI descriptions (overview + labeled bullet sections) to Jira ADF.
 */
export const descriptionTextToAdf = (text) => {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return null;
  }

  const blocks = trimmed.split(/\n\n+/);
  const content = blocks.flatMap((block) => parseBlock(block.trim()));

  if (content.length === 0) {
    return null;
  }

  return {
    type: "doc",
    version: 1,
    content,
  };
};
