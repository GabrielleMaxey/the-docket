import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import ExcelJS from "exceljs";
import express from "express";
import { buildTaskWorkbook } from "../server/lib/taskWorkbook.mjs";
import { registerTaskExportRoutes } from "../server/routes/taskExportRoutes.mjs";

const note = '=HYPERLINK("https://example.invalid","x")';
const row = (overrides = {}) => ({
  issueKey: "TEST-1", summary: "Synthetic task", status: "In Progress", assignee: "Example Person",
  jiraDueDate: "2026-10-15", priority: 9, followUp: "now", note: "Selected-source internal note",
  localNote: note, localNoteStatus: "available", teamNote: "Team first line\nTeam second line",
  latestJiraComment: { text: "=1+1\nLatest comment", author: "Example Author", createdAt: "2026-10-14T13:40:00-06:00" }, jiraCommentStatus: "available",
  requestor: "Example Requestor", plannedStart: "2026-10-14", plannedFinish: "2026-10-16", startDate: "2026-10-14", completeDate: null,
  hasOpenDecision: true, openDecisionNote: "Decision\nMore detail", pmOverride: "PM decision", pinnedGantt: false,
  jiraUrl: "https://example.atlassian.net/browse/TEST-1", ...overrides,
});
const site = (instanceId, overrides = {}) => ({
  instanceId, displayName: "Example saved entry", siteHost: "example.atlassian.net", source: "team", scope: { projectKeys: ["TEST"] }, includeCompleted: false,
  priorities: [9], followUp: "now", status: "complete", searchLimit: 5000, searchedCount: 1, rowCount: 1, teamNotesSelected: true, rows: [row()], ...overrides,
});
const snapshot = () => ({ exportedAt: "2026-10-14T19:40:00.000Z", timezone: "America/Denver", commentScope: "Latest Jira comment only", sites: [site("first"), site("second", { source: "local", teamNotesSelected: false, rows: [row({ localNote: "Local first line\nLocal second line", teamNote: "", followUp: "next" })] })] });
const read = async bytes => { assert.ok(Buffer.isBuffer(bytes)); const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes); return book; };
const headerRow = sheet => sheet.getRows(1, sheet.rowCount).find(r => r.getCell(1).value === "Saved Jira entry");
const taskCell = (sheet, heading, offset = 1) => { const header = headerRow(sheet); return sheet.getRow(header.number + offset).getCell(header.values.indexOf(heading)); };
const text = sheet => sheet.getRows(1, sheet.rowCount).flatMap(r => r.values.slice(1)).map(v => typeof v === "object" && v ? v.text : String(v ?? "")).join("\n");

test("workbook readback keeps saved-entry sheets, all columns, literal notes, exact dates and validated links", async () => {
  const input = snapshot(); const before = structuredClone(input);
  const book = await read(await buildTaskWorkbook(input));
  assert.deepEqual(input, before);
  assert.deepEqual(book.worksheets.map(s => s.name), ["Overview", "Example saved entry", "Example saved entry (2)"]);
  const first = book.worksheets[1], second = book.worksheets[2];
  assert.deepEqual(headerRow(first).values.slice(1), ["Saved Jira entry", "Jira site", "Issue key", "Title", "Status", "Assignee", "Jira due date", "Docket priority", "Now / Next", "Latest Jira comment", "Jira comment author", "Jira comment date", "Jira comment status", "Docket local notes", "Team notes", "Requestor", "Planned start", "Planned finish", "Actual start", "Actual complete", "Open decision", "Decision note", "PM override", "Pinned to Gantt", "Metadata source", "Jira link"]);
  assert.equal(taskCell(first, "Docket local notes").value, note);
  assert.equal(taskCell(first, "Docket local notes").type, ExcelJS.ValueType.String);
  assert.equal(taskCell(first, "Latest Jira comment").value, "=1+1\nLatest comment");
  assert.equal(taskCell(first, "Jira comment date").value, "2026-10-14T13:40:00-06:00");
  for (const heading of ["Jira due date", "Planned start", "Planned finish", "Actual start"]) assert.equal(taskCell(first, heading).type, ExcelJS.ValueType.String);
  assert.equal(taskCell(first, "Planned start").value, "2026-10-14");
  assert.equal(taskCell(first, "Docket priority").value, 9);
  assert.equal(taskCell(first, "Now / Next").value, "Now");
  assert.equal(taskCell(second, "Now / Next").value, "Next");
  assert.equal(taskCell(first, "Open decision").value, true);
  assert.equal(taskCell(first, "Pinned to Gantt").value, false);
  assert.equal(taskCell(first, "Team notes").value, "Team first line\nTeam second line");
  assert.equal(taskCell(second, "Docket local notes").value, "Local first line\nLocal second line");
  assert.ok([null, ""].includes(taskCell(second, "Team notes").value));
  assert.match(text(second), /Team notes: Not selected/);
  assert.equal(taskCell(first, "Jira link").value.hyperlink, "https://example.atlassian.net/browse/TEST-1");
  assert.equal(taskCell(first, "Latest Jira comment").alignment.wrapText, true);
  assert.ok(first.views.some(v => v.state === "frozen" && v.ySplit === headerRow(first).number));
  assert.ok(first.autoFilter); assert.ok(first.getColumn(10).width >= 30);
  assert.match(text(book.getWorksheet("Overview")), /first[\s\S]*second/);
  assert.match(text(book.getWorksheet("Overview")), /Latest Jira comment only/);
  assert.match(text(first), /example.atlassian.net/);
});

test("exclusions match saved ID, host and key without removing the same key from another entry", async () => {
  const excludedRows = [{ instanceId: "first", siteHost: "example.atlassian.net", issueKey: "TEST-1" }];
  const book = await read(await buildTaskWorkbook(snapshot(), { excludedRows }));
  assert.match(text(book.worksheets[1]), /No tasks/);
  assert.equal(taskCell(book.worksheets[2], "Issue key").value, "TEST-1");
  assert.match(text(book.worksheets[0]), /Excluded/);
  for (const excluded of [{ ...excludedRows[0], instanceId: "unknown" }, { ...excludedRows[0], siteHost: "other.atlassian.net" }, { ...excludedRows[0], issueKey: "TEST-2" }, { ...excludedRows[0], extra: "forged" }]) await assert.rejects(buildTaskWorkbook(snapshot(), { excludedRows: [excluded] }), e => e.status === 400 && /exclusion/i.test(e.message));
});

test("partial consent is explicit and failed and empty sheets remain visible", async () => {
  const input = snapshot(); input.sites.push(site("empty", { displayName: "Empty", rowCount: 0, searchedCount: 0, rows: [] }), site("failed", { displayName: "Failed entry", status: "failed", rowCount: 0, searchedCount: 0, rows: [], message: "Selected Team metadata unavailable" }));
  input.sites[0].status = "partial"; input.sites[0].rows[0] = row({ localNote: null, localNoteStatus: "unavailable", latestJiraComment: null, jiraCommentStatus: "unavailable" });
  for (const options of [{}, { allowPartial: "true" }]) await assert.rejects(buildTaskWorkbook(input, options), e => e.status === 400 && /partial/i.test(e.message));
  const book = await read(await buildTaskWorkbook(input, { allowPartial: true }));
  assert.equal(book.worksheets.length, 5);
  assert.match(text(book.getWorksheet("Empty")), /Complete[\s\S]*No tasks/);
  assert.match(text(book.getWorksheet("Failed entry")), /Failed[\s\S]*Selected Team metadata unavailable/);
  assert.equal(taskCell(book.worksheets[1], "Docket local notes").value, "Unavailable");
  assert.equal(taskCell(book.worksheets[1], "Latest Jira comment").value, "Unavailable");
  assert.equal(taskCell(book.worksheets[1], "Jira comment status").value, "Unavailable");
});

test("successful empty comments and unknown attribution differ from unavailable values", async () => {
  const input = snapshot(); input.sites[0].rows = [row({ latestJiraComment: null, jiraCommentStatus: "none", localNote: "" }), row({ issueKey: "TEST-2", latestJiraComment: { text: "Comment", author: null, createdAt: null } })]; input.sites[0].rowCount = 2;
  const sheet = (await read(await buildTaskWorkbook(input))).worksheets[1];
  assert.equal(taskCell(sheet, "Jira comment status").value, "None");
  assert.equal(taskCell(sheet, "Latest Jira comment").value, "No Jira comments");
  assert.ok([null, ""].includes(taskCell(sheet, "Docket local notes").value));
  assert.equal(taskCell(sheet, "Jira comment author", 2).value, "Unknown");
  assert.equal(taskCell(sheet, "Jira comment date", 2).value, "Unknown");
});

test("sheet names sanitize forbidden characters, reserve Overview and resolve long case collisions", async () => {
  const input = snapshot(); input.sites = [site("a", { displayName: "Overview" }), site("b", { displayName: "overview" }), site("c", { displayName: "'A/B:C?D*E[F]G\\H'" }), site("d", { displayName: "A".repeat(40) }), site("e", { displayName: "a".repeat(40) })];
  const book = await read(await buildTaskWorkbook(input));
  assert.deepEqual(book.worksheets.map(s => s.name), ["Overview", "Overview (2)", "overview (3)", "A B C D E F G H", "A".repeat(31), `${"a".repeat(27)} (2)`]);
});

test("initial worksheet shortening preserves supplementary characters at the 31-unit boundary", async () => {
  const input = snapshot();
  input.sites = [site("unicode-empty", { displayName: `${"A".repeat(30)}😀`, rows: [], rowCount: 0, searchedCount: 0 })];
  const book = await read(await buildTaskWorkbook(input));
  assert.equal(book.worksheets[1].name, "A".repeat(30));
  assert.match(text(book.worksheets[1]), /😀/);
});

test("collision suffix shortening preserves supplementary characters at the suffix boundary", async () => {
  const input = snapshot();
  input.sites = [site("unicode-first", { displayName: `${"A".repeat(26)}😀BBBBBBBBBB` }), site("unicode-second", { displayName: `${"a".repeat(26)}😀bbbbbbbbbb` })];
  const book = await read(await buildTaskWorkbook(input));
  assert.deepEqual(book.worksheets.map(sheet => sheet.name), ["Overview", `${"A".repeat(26)}😀BBB`, `${"a".repeat(26)} (2)`]);
  assert.ok(book.worksheets.every(sheet => sheet.name.length <= 31));
  assert.match(text(book.worksheets[2]), /😀/);
});

test("unsafe and oversized cells fail with affected row and field, and can be excluded", async () => {
  for (const [field, value, label] of [["localNote", "x".repeat(32768), "Docket local notes"], ["summary", "Invalid\u0000text", "Title"], ["latestJiraComment", { text: "x".repeat(32768), author: null, createdAt: null }, "Latest Jira comment"]]) {
    const input = snapshot(); input.sites[0].rows[0][field] = value;
    await assert.rejects(buildTaskWorkbook(input), e => e.status === 400 && e.message.includes("first") && e.message.includes("TEST-1") && e.message.includes(label));
    await read(await buildTaskWorkbook(input, { excludedRows: [{ instanceId: "first", siteHost: "example.atlassian.net", issueKey: "TEST-1" }] }));
  }
  const input = snapshot(); input.sites[0].rows[0].localNote = "x".repeat(32767); await read(await buildTaskWorkbook(input));
});

test("hyperlinks derive only from validated snapshot host and issue key", async () => {
  const input = snapshot(); input.sites[0].rows[0].jiraUrl = "javascript:alert(1)";
  const book = await read(await buildTaskWorkbook(input));
  assert.equal(taskCell(book.worksheets[1], "Jira link").value.hyperlink, "https://example.atlassian.net/browse/TEST-1");
  for (const change of [s => { s.siteHost = "example.atlassian.net/evil"; }, s => { s.rows[0].issueKey = "../evil"; }]) { const bad = snapshot(); change(bad.sites[0]); await assert.rejects(buildTaskWorkbook(bad), e => e.status === 400); }
});

test("approved uuid override executes ExcelJS's actual conditional formatting extension path", async () => {
  const require = createRequire(import.meta.url);
  const CfRuleExtXform = require("exceljs/lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js");
  const model = { type: "dataBar", priority: 1, cfvo: [{ type: "min" }, { type: "max" }], color: { argb: "FF638EC6" } };
  const xform = new CfRuleExtXform();
  xform.prepare(model);
  const xml = xform.toXml(model);
  assert.match(xml, /[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}/);
});

test("download serves private snapshot XLSX, rejects client rows and propagates expired preview conflicts", async t => {
  const app = express(); app.use(express.json({ strict: false }));
  registerTaskExportRoutes(app, { taskExportService: { getPreview(id) { if (id !== "stored") throw Object.assign(new Error("Preview expired. Preview again."), { status: 409 }); return { snapshot: snapshot(), expiresAt: "2026-10-14T19:55:00.000Z" }; } } });
  const server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); }); t.after(() => new Promise(resolve => server.close(resolve)));
  const post = body => fetch(`http://127.0.0.1:${server.address().port}/api/task-export/download`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const response = await post({ previewId: "stored", excludedRows: [{ instanceId: "first", siteHost: "example.atlassian.net", issueKey: "TEST-1" }], allowPartial: false });
  assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); assert.equal(response.headers.get("cache-control"), "no-store"); assert.match(response.headers.get("content-disposition"), /^attachment; filename="docket-tasks-\d{8}T\d{9}Z.xlsx"$/);
  const book = await read(Buffer.from(await response.arrayBuffer())); assert.match(text(book.worksheets[1]), /No tasks/); assert.equal(taskCell(book.worksheets[2], "Title").value, "Synthetic task");
  for (const body of [{ previewId: "stored", rows: [] }, { previewId: "stored", allowPartial: "true" }, { previewId: "stored", excludedRows: null }, {}, null]) assert.equal((await post(body)).status, 400);
  assert.equal((await post({ previewId: "expired" })).status, 409);
});


test("preview expiring during workbook generation requires another preview before sending bytes", async t => {
  const app = express(); app.use(express.json());
  let reads = 0;
  registerTaskExportRoutes(app, { taskExportService: { getPreview() { if (++reads > 1) throw Object.assign(new Error("Preview expired. Preview again."), { status: 409 }); return { snapshot: snapshot() }; } } });
  const server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); }); t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/task-export/download`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ previewId: "expires-during-write" }) });
  assert.equal(response.status, 409); assert.match((await response.json()).error, /Preview again/);
  assert.ok(!response.headers.get("content-disposition"));
});

test("workbook rejects aggregate oversize instead of dropping rows", async () => {
  const input = snapshot(); input.sites[0].rows = Array.from({ length: 900 }, (_, i) => row({ issueKey: `TEST-${i + 1}`, localNote: "x".repeat(32767) })); input.sites[0].rowCount = 900;
  await assert.rejects(buildTaskWorkbook(input), e => e.status === 413 && /narrow/i.test(e.message));
});


test("download skips an already-disconnected request and discards a disconnect during XLSX writing", async () => {
  for (const alreadyDisconnected of [true, false]) {
    const req = Object.assign(new EventEmitter(), { body: { previewId: "stored" }, aborted: alreadyDisconnected });
    const outputs = [];
    const res = Object.assign(new EventEmitter(), { writableEnded: false, headersSent: false, destroyed: alreadyDisconnected, setHeader() {}, status() { return this; }, send(value) { outputs.push(value); }, json(value) { outputs.push(value); } });
    let download; let reads = 0;
    const app = { get() {}, post(path, handler) { if (path.endsWith("/download")) download = handler; } };
    registerTaskExportRoutes(app, { taskExportService: { getPreview() { reads++; queueMicrotask(() => res.emit("close")); return { snapshot: snapshot() }; } } });
    await download(req, res);
    assert.equal(reads, alreadyDisconnected ? 0 : 1);
    assert.deepEqual(outputs, []);
    assert.equal(req.listenerCount("aborted"), 0); assert.equal(res.listenerCount("close"), 0);
  }
});
