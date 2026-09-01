import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { markdownTextToAdfNodes } from "../shared/markdownToAdf.mjs";

describe("markdownTextToAdfNodes", () => {
  it("returns an empty array for empty input", () => {
    assert.deepEqual(markdownTextToAdfNodes(""), []);
    assert.deepEqual(markdownTextToAdfNodes("   "), []);
  });

  it("renders plain text as a single paragraph with no marks", () => {
    const nodes = markdownTextToAdfNodes("Hello");
    assert.deepEqual(nodes, [
      { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
    ]);
  });

  it("parses bold with ** and __", () => {
    const nodes = markdownTextToAdfNodes("**bold**");
    assert.deepEqual(nodes[0].content, [{ type: "text", text: "bold", marks: [{ type: "strong" }] }]);

    const underscoreNodes = markdownTextToAdfNodes("__also bold__");
    assert.deepEqual(underscoreNodes[0].content, [
      { type: "text", text: "also bold", marks: [{ type: "strong" }] },
    ]);
  });

  it("parses italic with * and _", () => {
    const nodes = markdownTextToAdfNodes("*italic*");
    assert.deepEqual(nodes[0].content, [{ type: "text", text: "italic", marks: [{ type: "em" }] }]);

    const underscoreNodes = markdownTextToAdfNodes("_also italic_");
    assert.deepEqual(underscoreNodes[0].content, [
      { type: "text", text: "also italic", marks: [{ type: "em" }] },
    ]);
  });

  it("parses inline code", () => {
    const nodes = markdownTextToAdfNodes("`code`");
    assert.deepEqual(nodes[0].content, [{ type: "text", text: "code", marks: [{ type: "code" }] }]);
  });

  it("parses links", () => {
    const nodes = markdownTextToAdfNodes("[Jira](https://example.atlassian.net)");
    assert.deepEqual(nodes[0].content, [
      {
        type: "text",
        text: "Jira",
        marks: [{ type: "link", attrs: { href: "https://example.atlassian.net" } }],
      },
    ]);
  });

  it("mixes plain text with marked spans in one paragraph", () => {
    const nodes = markdownTextToAdfNodes("This is **important** and *also* `code`.");
    const texts = nodes[0].content.map((n) => n.text);
    assert.deepEqual(texts, ["This is ", "important", " and ", "also", " ", "code", "."]);
    assert.deepEqual(nodes[0].content[1].marks, [{ type: "strong" }]);
    assert.deepEqual(nodes[0].content[3].marks, [{ type: "em" }]);
    assert.deepEqual(nodes[0].content[5].marks, [{ type: "code" }]);
  });

  it("parses a bullet list with - and *", () => {
    const nodes = markdownTextToAdfNodes("- one\n- two\n* three");
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].type, "bulletList");
    assert.equal(nodes[0].content.length, 3);
    assert.deepEqual(nodes[0].content[0].content[0].content, [{ type: "text", text: "one" }]);
    assert.deepEqual(nodes[0].content[2].content[0].content, [{ type: "text", text: "three" }]);
  });

  it("parses a numbered list", () => {
    const nodes = markdownTextToAdfNodes("1. first\n2. second");
    assert.equal(nodes[0].type, "orderedList");
    assert.equal(nodes[0].content.length, 2);
    assert.deepEqual(nodes[0].content[1].content[0].content, [{ type: "text", text: "second" }]);
  });

  it("parses list items with inline formatting", () => {
    const nodes = markdownTextToAdfNodes("- **bold item**");
    assert.deepEqual(nodes[0].content[0].content[0].content, [
      { type: "text", text: "bold item", marks: [{ type: "strong" }] },
    ]);
  });

  it("parses headings at multiple levels", () => {
    const h1 = markdownTextToAdfNodes("# Title");
    assert.equal(h1[0].type, "heading");
    assert.equal(h1[0].attrs.level, 1);
    assert.deepEqual(h1[0].content, [{ type: "text", text: "Title" }]);

    const h3 = markdownTextToAdfNodes("### Subheading");
    assert.equal(h3[0].attrs.level, 3);
  });

  it("does not treat a multi-line block starting with # as a heading", () => {
    const nodes = markdownTextToAdfNodes("# Title\nmore text on next line");
    assert.equal(nodes[0].type, "paragraph");
  });

  it("joins consecutive lines in one block with hardBreak", () => {
    const nodes = markdownTextToAdfNodes("line one\nline two");
    assert.equal(nodes.length, 1);
    assert.deepEqual(nodes[0].content, [
      { type: "text", text: "line one" },
      { type: "hardBreak" },
      { type: "text", text: "line two" },
    ]);
  });

  it("splits blank-line-separated text into separate paragraphs", () => {
    const nodes = markdownTextToAdfNodes("First paragraph.\n\nSecond paragraph.");
    assert.equal(nodes.length, 2);
    assert.equal(nodes[0].type, "paragraph");
    assert.equal(nodes[1].type, "paragraph");
    assert.deepEqual(nodes[0].content, [{ type: "text", text: "First paragraph." }]);
    assert.deepEqual(nodes[1].content, [{ type: "text", text: "Second paragraph." }]);
  });

  it("handles a heading, a paragraph, and a list together", () => {
    const nodes = markdownTextToAdfNodes(
      "# Status update\n\nThings are moving along.\n\n- done: setup\n- next: review"
    );
    assert.deepEqual(
      nodes.map((n) => n.type),
      ["heading", "paragraph", "bulletList"]
    );
  });

  it("leaves unmatched markdown-like text as plain text rather than dropping it", () => {
    const nodes = markdownTextToAdfNodes("2 * 3 = 6, not a list");
    assert.equal(nodes[0].type, "paragraph");
    const joined = nodes[0].content.map((n) => n.text).join("");
    assert.equal(joined, "2 * 3 = 6, not a list");
  });
});
