import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { htmlToNoteMarkdown } from "../src/utils/noteClipboard.js";

describe("htmlToNoteMarkdown", () => {
  it("converts bold, italic and links", () => {
    assert.equal(htmlToNoteMarkdown("<b>x</b> <strong>y</strong>"), "**x** **y**");
    assert.equal(htmlToNoteMarkdown("<i>x</i> <em>y</em>"), "*x* *y*");
    assert.equal(htmlToNoteMarkdown('<a href="https://e.test">t</a>'), "[t](https://e.test)");
  });
  it("drops non-http(s) links to plain text", () => {
    assert.equal(htmlToNoteMarkdown('<a href="javascript:alert(1)">t</a>'), "t");
    assert.equal(htmlToNoteMarkdown('<a href="file:///c/x">t</a>'), "t");
  });
  it("converts lists", () => {
    assert.equal(htmlToNoteMarkdown("<ul><li>a</li><li>b</li></ul>"), "- a\n- b");
    assert.equal(htmlToNoteMarkdown("<ol><li>a</li><li>b</li></ol>"), "1. a\n2. b");
  });
  it("converts headings", () => {
    assert.equal(htmlToNoteMarkdown("<h1>A</h1><h2>B</h2><h3>C</h3>"), "# A\n\n## B\n\n### C");
  });
  it("turns paragraphs and br into line breaks", () => {
    assert.equal(htmlToNoteMarkdown("<p>a</p><p>b</p>"), "a\n\nb");
    assert.equal(htmlToNoteMarkdown("a<br>b"), "a\nb");
  });
  it("never carries script or style content or event attributes", () => {
    const out = htmlToNoteMarkdown('<p onclick="x()">hi</p><script>alert(1)</script><style>p{color:red}</style>');
    assert.equal(out, "hi");
    assert.ok(!/alert|color|onclick/.test(out));
  });
  it("unwraps Word-style spans and unsupported tags keeping text", () => {
    assert.equal(htmlToNoteMarkdown('<span style="mso-x:1">a</span><div>b</div>'), "a\nb");
    assert.equal(htmlToNoteMarkdown("<table><tr><td>a</td><td>b</td></tr></table>"), "a b");
  });
  it("decodes entities and does not re-interpret decoded markup", () => {
    assert.equal(htmlToNoteMarkdown("<p>a &amp; b &lt;b&gt; &nbsp;c</p>"), "a & b <b>  c".replace("  ", " "));
  });
  it("returns an empty string when nothing usable remains", () => {
    assert.equal(htmlToNoteMarkdown(""), "");
    assert.equal(htmlToNoteMarkdown("<script>x</script>"), "");
    assert.equal(htmlToNoteMarkdown(null), "");
  });
  it("ignores clipboard fragment comments and tolerates unclosed tags", () => {
    assert.equal(htmlToNoteMarkdown("<!--StartFragment--><b>x<!--EndFragment-->"), "**x**");
  });
});
