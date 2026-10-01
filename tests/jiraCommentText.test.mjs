import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  adfToPlainText,
  fetchLatestCommentTextForIssue,
  fetchLatestCommentTextBulk,
} from "../server/lib/jiraCommentText.mjs";
import { noteMarkdownToHtml } from "../src/utils/noteMarkdown.js";

describe("adfToPlainText", () => {
  it("extracts plain text paragraphs", () => {
    const body = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    };
    assert.equal(adfToPlainText(body), "Hello world");
  });

  it("includes mention labels from attrs", () => {
    const body = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "mention", attrs: { text: "@Alice", id: "1" } },
            { type: "text", text: " please review" },
          ],
        },
      ],
    };
    assert.equal(adfToPlainText(body), "@Alice please review");
  });

  it("preserves headings, lists, bold, italic, and newlines as markdown", () => {
    const body = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Status" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Please ", marks: [] },
            { type: "text", text: "review", marks: [{ type: "strong" }] },
            { type: "text", text: " this ", marks: [] },
            { type: "text", text: "soon", marks: [{ type: "em" }] },
            { type: "hardBreak" },
            { type: "text", text: "Thanks" },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "First" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Second" }],
                },
              ],
            },
          ],
        },
      ],
    };

    assert.equal(
      adfToPlainText(body),
      ["## Status", "Please **review** this *soon*\nThanks", "- First\n- Second"].join("\n\n")
    );
  });
});

describe("noteMarkdownToHtml", () => {
  it("renders bold, italic, lists, and headings", () => {
    const html = noteMarkdownToHtml("## Status\n\nPlease **review** this *soon*\n\n- First\n- Second");
    assert.match(html, /<h2>Status<\/h2>/);
    assert.match(html, /<strong>review<\/strong>/);
    assert.match(html, /<em>soon<\/em>/);
    assert.match(html, /<ul><li>First<\/li><li>Second<\/li><\/ul>/);
  });

  it("escapes raw HTML in notes", () => {
    const html = noteMarkdownToHtml("<script>alert(1)</script>");
    assert.equal(html.includes("<script>"), false);
    assert.match(html, /&lt;script&gt;/);
  });
});

describe("fetchLatestCommentTextForIssue", () => {
  it("uses orderBy=-created when the request succeeds", async () => {
    const calls = [];
    const jiraRequest = async ({ pathWithQuery }) => {
      calls.push(pathWithQuery);
      return {
        ok: true,
        data: {
          total: 2,
          comments: [
            {
              body: {
                type: "doc",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "Newest" }] },
                ],
              },
              author: { displayName: "Bob" },
              created: "2026-09-30T12:00:00.000+0000",
            },
          ],
        },
      };
    };

    const result = await fetchLatestCommentTextForIssue({
      issueKey: "ABC-1",
      jiraRequest,
    });
    assert.equal(result.text, "Newest");
    assert.equal(result.author, "Bob");
    assert.equal(calls.length, 1);
    assert.match(calls[0], /orderBy=-created/);
  });

  it("falls back to last-page fetch when orderBy fails", async () => {
    const calls = [];
    const jiraRequest = async ({ pathWithQuery }) => {
      calls.push(pathWithQuery);
      if (pathWithQuery.includes("orderBy=")) {
        return { ok: false, data: { errorMessages: ["bad orderBy"] } };
      }
      if (!pathWithQuery.includes("startAt=")) {
        return {
          ok: true,
          data: {
            total: 3,
            comments: [
              {
                body: {
                  type: "doc",
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "Oldest" }] },
                  ],
                },
                created: "2026-01-01T00:00:00.000+0000",
              },
            ],
          },
        };
      }
      return {
        ok: true,
        data: {
          total: 3,
          comments: [
            {
              body: {
                type: "doc",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "Latest via page" }] },
                ],
              },
              author: { displayName: "Carol" },
              created: "2026-09-30T12:00:00.000+0000",
            },
          ],
        },
      };
    };

    const result = await fetchLatestCommentTextForIssue({
      issueKey: "ABC-2",
      jiraRequest,
    });
    assert.equal(result.text, "Latest via page");
    assert.equal(result.author, "Carol");
    assert.ok(calls.some((path) => path.includes("startAt=2")));
  });
});

describe("fetchLatestCommentTextBulk", () => {
  it("indexes items under uppercase key aliases", async () => {
    const jiraRequest = async () => ({
      ok: true,
      data: {
        total: 1,
        comments: [
          {
            body: {
              type: "doc",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Note text" }] },
              ],
            },
            author: { displayName: "Dana" },
            created: "2026-09-30T12:00:00.000+0000",
          },
        ],
      },
    });

    const { items } = await fetchLatestCommentTextBulk({
      issueKeys: ["abc-9"],
      jiraRequest,
    });
    assert.equal(items["abc-9"]?.text, "Note text");
    assert.equal(items["ABC-9"]?.text, "Note text");
  });
});
