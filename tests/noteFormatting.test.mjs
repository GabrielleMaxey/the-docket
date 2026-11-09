import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  toggleWrap,
  toggleLinePrefix,
  setHeading,
  insertLink,
  continueList,
  linkOverSelection,
} from "../src/utils/noteFormatting.js";

const e = (value, selectionStart, selectionEnd = selectionStart) => ({ value, selectionStart, selectionEnd });

describe("toggleWrap", () => {
  it("with no selection inserts markers and puts the cursor between them", () => {
    assert.deepEqual(toggleWrap(e("ab", 1), "**"), e("a****b", 3));
  });
  it("wraps a selection and keeps it selected", () => {
    assert.deepEqual(toggleWrap(e("hello world", 6, 11), "**"), e("hello **world**", 8, 13));
  });
  it("removes markers when the selection itself is wrapped", () => {
    assert.deepEqual(toggleWrap(e("**hi**", 0, 6), "**"), e("hi", 0, 2));
  });
  it("removes markers that surround the selection", () => {
    assert.deepEqual(toggleWrap(e("**hi**", 2, 4), "**"), e("hi", 0, 2));
  });
  it("italic does not strip one star from bold text", () => {
    assert.deepEqual(toggleWrap(e("**hi**", 2, 4), "*"), e("***hi***", 3, 5));
  });
  it("supports code and strike markers", () => {
    assert.equal(toggleWrap(e("x", 0, 1), "`").value, "`x`");
    assert.equal(toggleWrap(e("x", 0, 1), "~~").value, "~~x~~");
  });
  it("clamps out-of-range selections instead of throwing", () => {
    assert.deepEqual(toggleWrap(e("ab", 5, 9), "*"), e("ab**", 3));
    assert.deepEqual(toggleWrap(e("ab", -4, 1), "*"), e("*a*b", 1, 2));
  });
});

describe("toggleLinePrefix", () => {
  it("bullets every line of a multi-line selection, then toggles off", () => {
    const on = toggleLinePrefix(e("a\nb\nc", 0, 5), "bullet");
    assert.deepEqual(on, e("- a\n- b\n- c", 0, 11));
    const off = toggleLinePrefix(on, "bullet");
    assert.deepEqual(off, e("a\nb\nc", 0, 5));
  });
  it("numbers lines 1..n, skipping blank lines, and toggles off", () => {
    const on = toggleLinePrefix(e("a\n\nb", 0, 4), "numbered");
    assert.equal(on.value, "1. a\n\n2. b");
    assert.equal(toggleLinePrefix(on, "numbered").value, "a\n\nb");
  });
  it("switches bullet to numbered without nesting", () => {
    assert.equal(toggleLinePrefix(e("- a\n- b", 0, 7), "numbered").value, "1. a\n2. b");
  });
  it("with no selection prefixes the current line and moves the cursor", () => {
    assert.deepEqual(toggleLinePrefix(e("one\ntwo", 5), "quote"), e("one\n> two", 7));
  });
  it("a selection ending at the start of a line does not include that line", () => {
    assert.equal(toggleLinePrefix(e("a\nb", 0, 2), "bullet").value, "- a\nb");
  });
  it("prefixes an empty line", () => {
    assert.deepEqual(toggleLinePrefix(e("", 0), "bullet"), e("- ", 2));
  });
  it("handles Windows line endings", () => {
    assert.equal(toggleLinePrefix(e("a\r\nb", 0, 4), "bullet").value, "- a\r\n- b");
  });
});

describe("setHeading", () => {
  it("adds a heading prefix", () => {
    assert.equal(setHeading(e("Title", 0), 2).value, "## Title");
  });
  it("replaces an existing heading prefix", () => {
    assert.equal(setHeading(e("# Title", 3), 3).value, "### Title");
  });
  it("level 0 removes the prefix", () => {
    assert.equal(setHeading(e("## Title", 0), 0).value, "Title");
  });
});

describe("insertLink", () => {
  it("wraps a selection as the link text", () => {
    assert.deepEqual(insertLink(e("see docs", 4, 8), "https://e.test"), e("see [docs](https://e.test)", 26));
  });
  it("with no selection inserts an empty link with the cursor inside the brackets", () => {
    assert.deepEqual(insertLink(e("x", 1), "https://e.test"), e("x[](https://e.test)", 2));
  });
});

describe("continueList", () => {
  it("continues a bullet", () => {
    assert.deepEqual(continueList(e("- a", 3)), e("- a\n- ", 6));
  });
  it("continues and increments a numbered list", () => {
    assert.deepEqual(continueList(e("1. a", 4)), e("1. a\n2. ", 8));
  });
  it("ends the list on an empty item", () => {
    assert.deepEqual(continueList(e("- a\n- ", 6)), e("- a\n", 4));
  });
  it("returns null on a non-list line", () => {
    assert.equal(continueList(e("plain", 5)), null);
  });
  it("returns null when the cursor is mid-line or a range is selected", () => {
    assert.equal(continueList(e("- abc", 3)), null);
    assert.equal(continueList(e("- abc", 2, 5)), null);
  });
  it("keeps Windows line endings", () => {
    assert.equal(continueList(e("- a\r\n- b", 8)).value, "- a\r\n- b\r\n- ");
  });
});

describe("linkOverSelection", () => {
  it("turns a pasted URL over a selection into a link", () => {
    assert.deepEqual(linkOverSelection(e("see docs", 4, 8), "https://e.test/x"), e("see [docs](https://e.test/x)", 28));
  });
  it("returns null with no selection, a non-URL, or a non-http scheme", () => {
    assert.equal(linkOverSelection(e("docs", 2), "https://e.test"), null);
    assert.equal(linkOverSelection(e("docs", 0, 4), "just text"), null);
    assert.equal(linkOverSelection(e("docs", 0, 4), "javascript:alert(1)"), null);
    assert.equal(linkOverSelection(e("docs", 0, 4), "https://a.test b"), null);
  });
});
