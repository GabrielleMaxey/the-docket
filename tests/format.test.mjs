import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDate, formatTimestamp } from "../src/utils/format.js";

describe("date formatting", () => {
  it("formats valid dates with the requested locale/options", () => {
    assert.equal(
      formatDate("2026-08-24T12:00:00Z", { locale: "en-US", year: "numeric", month: "long", day: "numeric" }),
      "August 24, 2026"
    );
  });

  it("uses fallbacks for invalid dates instead of rendering Invalid Date", () => {
    assert.equal(formatDate("not-a-date", undefined, "-"), "-");
    assert.equal(formatTimestamp("not-a-date"), "not-a-date");
  });
});
