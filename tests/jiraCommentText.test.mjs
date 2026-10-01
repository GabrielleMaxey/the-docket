import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  adfToPlainText,
  fetchLatestCommentTextForIssue,
  fetchLatestCommentTextBulk,
} from "../server/lib/jiraCommentText.mjs";

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
