import ExcelJS from "exceljs";
import { EXPORT_MAX_BYTES } from "./taskExport.mjs";
import { assertAllowedJiraBaseUrl } from "./jiraInstances.mjs";

const headings = ["Saved Jira entry", "Jira site", "Issue key", "Title", "Status", "Assignee", "Jira due date", "Docket priority", "Now / Next", "Latest Jira comment", "Jira comment author", "Jira comment date", "Jira comment status", "Docket local notes", "Team notes", "Requestor", "Planned start", "Planned finish", "Actual start", "Actual complete", "Open decision", "Decision note", "PM override", "Pinned to Gantt", "Metadata source", "Jira link"];
const widths = [26, 32, 17, 48, 22, 25, 18, 18, 16, 52, 26, 30, 24, 52, 52, 26, 18, 18, 18, 18, 18, 42, 30, 20, 20, 55];
const fail = (message, status = 400) => Object.assign(new Error(message), { status, code: "TASK_EXPORT_INVALID" });
const label = value => value[0].toUpperCase() + value.slice(1);
const identity = (site, row) => JSON.stringify([site.instanceId, site.siteHost, row.issueKey]);
const validateCell = (value, location) => {
  if (typeof value === "string") {
    if (value.length > 32767) throw fail(`${location}: exceeds Excel's 32,767-character cell limit. Exclude the affected task and download again, or narrow your preview.`);
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/u.test(value)) throw fail(`${location}: contains invalid XML characters. Exclude the affected task or correct its source and preview again.`);
  } else if (value !== null && typeof value !== "boolean" && !(typeof value === "number" && Number.isFinite(value))) throw fail(`${location}: expected a literal text, number or boolean value. Preview again.`);
  return value;
};
const sheetName = (savedName, used) => {
  const base = savedName.replace(/[\\/*?:\[\]]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "").trim() || "Jira entry";
  let candidate = base.slice(0, 31).replace(/'+$/g, "");
  for (let count = 2; used.has(candidate.toLowerCase()); count++) {
    const suffix = ` (${count})`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
};
const addRow = (sheet, values, fields, location) => {
  const checked = values.map((value, index) => validateCell(value ?? null, `${location}, ${fields[index]}`));
  const row = sheet.addRow(checked);
  row.alignment = { vertical: "top", wrapText: true };
  const lines = checked.map((value, index) => typeof value === "string" ? value.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / (sheet.getColumn(index + 1).width || 20))), 0) : 1);
  row.height = Math.min(409, Math.max(30, 15 * Math.max(...lines) + 8));
  return row;
};
const headingRow = (sheet, fields) => {
  const row = addRow(sheet, fields, fields, "Column heading");
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24465B" } };
  row.height = 42;
  sheet.views = [{ state: "frozen", ySplit: row.number, xSplit: 3 }];
  return row.number;
};
const introRow = (sheet, value, location) => {
  const row = addRow(sheet, [value], ["Summary"], location);
  sheet.mergeCells(row.number, 1, row.number, 10);
  row.height = 26;
  return row;
};
const filters = site => `Completed: ${site.includeCompleted ? "Included" : "Excluded"}; Priority: ${site.priorities?.join(", ") ?? "All"}; Now / Next: ${site.followUp ? label(site.followUp) : "All"}`;
const scope = site => site.scope.projectKeys ? `Projects: ${site.scope.projectKeys.join(", ")}` : `Saved preset IDs: ${site.scope.presetIds.join(", ")}`;
const taskValues = (site, row) => {
  if (!/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(row.issueKey)) throw fail(`Saved entry ${site.instanceId}: invalid issue key. Preview again.`);
  const comment = row.latestJiraComment;
  return [site.displayName, site.siteHost, row.issueKey, row.summary, row.status, row.assignee, row.jiraDueDate,
    row.priority, row.followUp ? label(row.followUp) : "", row.jiraCommentStatus === "available" ? comment.text : row.jiraCommentStatus === "none" ? "No Jira comments" : "Unavailable",
    row.jiraCommentStatus === "available" ? comment.author ?? "Unknown" : "", row.jiraCommentStatus === "available" ? comment.createdAt ?? "Unknown" : "", label(row.jiraCommentStatus),
    row.localNoteStatus === "available" ? row.localNote : "Unavailable", site.source === "team" ? row.teamNote : "", row.requestor,
    row.plannedStart, row.plannedFinish, row.startDate, row.completeDate, row.hasOpenDecision, row.openDecisionNote, row.pmOverride, row.pinnedGantt, label(site.source),
    `https://${site.siteHost}/browse/${encodeURIComponent(row.issueKey)}`];
};

const addSiteSheet = (book, site, snapshot, used) => {
  validateCell(site.displayName, `Saved entry ${site.instanceId}, Saved Jira entry`);
  let origin;
  try { origin = assertAllowedJiraBaseUrl(`https://${site.siteHost}`, [site.siteHost]); }
  catch { throw fail(`Saved entry ${site.instanceId}: invalid Jira hostname. Preview again.`); }
  if (origin !== `https://${site.siteHost}`) throw fail(`Saved entry ${site.instanceId}: invalid Jira hostname. Preview again.`);
  const name = sheetName(site.displayName, used);
  const sheet = book.addWorksheet(name);
  sheet.columns = widths.map(width => ({ width }));
  const location = `Saved entry ${site.instanceId}`;
  introRow(sheet, site.displayName, location).font = { bold: true, size: 18 };
  introRow(sheet, `Saved instance ID: ${site.instanceId}`, location);
  introRow(sheet, `Jira site: ${site.siteHost}`, location);
  introRow(sheet, `Status: ${label(site.status)}`, location);
  introRow(sheet, `Metadata source: ${label(site.source)}`, location);
  introRow(sheet, `Exported at: ${snapshot.exportedAt}; Timezone: ${snapshot.timezone}`, location);
  introRow(sheet, `${scope(site)}; ${filters(site)}`, location);
  introRow(sheet, `Latest Jira comment only; Team notes: ${site.source === "team" ? "Selected" : "Not selected"}`, location);
  const omitted = site.rowCount - site.rows.length;
  introRow(sheet, `Snapshot tasks: ${site.rowCount}; Excluded: ${omitted}; Exported tasks: ${site.rows.length}${site.message ? `; ${site.message}` : ""}`, location);
  const header = headingRow(sheet, headings);
  for (const task of site.rows) {
    const values = taskValues(site, task);
    const row = addRow(sheet, values, headings, `${location}, task ${task.issueKey}`);
    const link = row.getCell(26);
    link.value = { text: values[25], hyperlink: values[25] };
    link.font = { color: { argb: "FF0563C1" }, underline: true };
  }
  sheet.autoFilter = { from: { row: header, column: 1 }, to: { row: Math.max(header, sheet.rowCount), column: headings.length } };
  if (!site.rows.length) introRow(sheet, site.status === "failed" ? `Failed: ${site.message || "No verified tasks available. Preview again."}` : "No tasks after filters and exclusions.", location);
  return name;
};

export const buildTaskWorkbook = async (snapshot, { excludedRows = [], allowPartial = false } = {}) => {
  if (typeof allowPartial !== "boolean" || (snapshot.sites.some(site => site.status !== "complete") && !allowPartial)) throw fail("Explicit partial-download consent is required for partial or failed saved entries.");
  if (!Array.isArray(excludedRows)) throw fail("Exclusions must be a list of saved-entry, site and issue identities.");
  const known = new Set(snapshot.sites.flatMap(site => site.rows.map(row => identity(site, row))));
  const excluded = new Set();
  for (const row of excludedRows) {
    if (!row || Array.isArray(row) || Object.keys(row).length !== 3 || !["instanceId", "siteHost", "issueKey"].every(field => typeof row[field] === "string") || !known.has(identity(row, row))) throw fail("Each exclusion must match a saved entry, Jira site and issue key in this preview.");
    excluded.add(identity(row, row));
  }
  const selected = snapshot.sites.map(site => ({ ...site, rows: site.rows.filter(row => !excluded.has(identity(site, row))) }));
  if (Buffer.byteLength(JSON.stringify({ ...snapshot, sites: selected }), "utf8") > EXPORT_MAX_BYTES) throw fail("Workbook exceeds 25 MiB. Narrow your filters and preview again; rows were not dropped.", 413);
  const book = new ExcelJS.Workbook();
  book.creator = "The Docket";
  const overview = book.addWorksheet("Overview");
  overview.columns = [24, 28, 34, 32, 18, 20, 32, 48, 18, 18, 18, 18, 20, 24, 52].map(width => ({ width }));
  introRow(overview, "Docket task export", "Overview").font = { bold: true, size: 18 };
  introRow(overview, `Exported at: ${snapshot.exportedAt}`, "Overview");
  introRow(overview, `Timezone: ${snapshot.timezone}`, "Overview");
  introRow(overview, "Latest Jira comment only", "Overview");
  introRow(overview, `Partial download consent: ${allowPartial ? "Granted" : "Not required"}`, "Overview");
  introRow(overview, `Excluded tasks: ${excluded.size}. Unavailable notes/comments are labeled. Team notes are blank when not selected.`, "Overview");
  introRow(overview, "Each saved Jira entry has its own worksheet. Failed entries do not represent successful empty results.", "Overview");
  const overviewFields = ["Saved instance ID", "Saved Jira entry", "Jira site", "Worksheet", "Status", "Metadata source", "Scope", "Filters", "Search limit", "Searched", "Snapshot tasks", "Excluded", "Exported tasks", "Team notes", "Message / omissions"];
  const overviewHeading = headingRow(overview, overviewFields);
  const used = new Set(["overview"]);
  for (const site of selected) {
    const name = addSiteSheet(book, site, snapshot, used);
    const omitted = site.rowCount - site.rows.length;
    addRow(overview, [site.instanceId, site.displayName, site.siteHost, name, label(site.status), label(site.source), scope(site), filters(site), site.searchLimit, site.searchedCount, site.rowCount, omitted, site.rows.length, site.source === "team" ? "Selected" : "Not selected", site.message || ""], overviewFields, `Saved entry ${site.instanceId}`);
  }
  overview.autoFilter = { from: { row: overviewHeading, column: 1 }, to: { row: overview.rowCount, column: overviewFields.length } };
  const bytes = Buffer.from(await book.xlsx.writeBuffer());
  if (bytes.length > EXPORT_MAX_BYTES) throw fail("Generated workbook exceeds 25 MiB. Narrow your filters and preview again; rows were not dropped.", 413);
  return bytes;
};
