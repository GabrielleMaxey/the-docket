import { markdownTextToAdfNodes } from "./markdownToAdf.mjs";

export const descriptionTextToAdf = (text) => {
  const content = markdownTextToAdfNodes(text);
  if (content.length === 0) return null;
  return { type: "doc", version: 1, content };
};
