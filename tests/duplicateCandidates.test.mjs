import test from "node:test";
import assert from "node:assert/strict";
import { buildDuplicateSearchJql, rankDuplicateCandidates, significantWords } from "../shared/duplicateCandidates.mjs";

const issue = (key, summary, status = "In Progress") => ({ key, fields: { summary, status: { name: status } } });

test("significantWords drops short and common words, dedupes, caps at 6", () => {
  assert.deepEqual(significantWords("Fix the PSX coredump handling for SIPE cores"), ["psx", "coredump", "handling", "sipe", "cores"]);
  const long = "alpha beta gamma delta epsilon zeta theta iota kappa lambda sigma omega";
  assert.equal(significantWords(long).length, 10);
  // longest words are kept and original order preserved
  assert.deepEqual(
    significantWords("aaa bbb ccc ddd eee fff ggg hhh iii jjj longword anotherlongword"),
    ["aaa", "bbb", "ccc", "ddd", "eee", "fff", "ggg", "hhh", "longword", "anotherlongword"]
  );
  assert.deepEqual(significantWords("I want to be able to export billing records"), ["export", "billing", "records"]);
  assert.deepEqual(significantWords("Billing billing BILLING"), ["billing"]);
  assert.deepEqual(significantWords(""), []);
  assert.deepEqual(significantWords(null), []);
});

test("buildDuplicateSearchJql scopes to the project, open issues and OR'd summary terms", () => {
  assert.equal(
    buildDuplicateSearchJql({ projectKey: "ODI", summary: "Coredump handling scripts" }),
    'project = "ODI" AND statusCategory != Done AND (summary ~ "coredump" OR description ~ "coredump" OR summary ~ "handling" OR description ~ "handling" OR summary ~ "scripts" OR description ~ "scripts") ORDER BY updated DESC'
  );
});

test("buildDuplicateSearchJql neutralises quotes and JQL syntax; refuses bad project keys or empty terms", () => {
  const jql = buildDuplicateSearchJql({ projectKey: "ODI", summary: 'billing" OR project = "SECRET' });
  assert.ok(!jql.includes('SECRET" '));
  assert.ok(!/summary ~ "[^"a-z0-9]/.test(jql));
  const terms = jql.match(/(?:summary|description) ~ "[^"]*"/g) || [];
  assert.ok(terms.length > 0 && terms.every((t) => /^(?:summary|description) ~ "[a-z0-9]+"$/.test(t)));
  assert.equal(buildDuplicateSearchJql({ projectKey: 'ODI" OR 1=1', summary: "billing mediation" }), null);
  assert.equal(buildDuplicateSearchJql({ projectKey: "", summary: "billing mediation" }), null);
  assert.equal(buildDuplicateSearchJql({ projectKey: "ODI", summary: "fix the new" }), null);
});

test("rankDuplicateCandidates needs 2 shared words for 4+ word summaries", () => {
  const out = rankDuplicateCandidates("Torchwood ERR endpoints mediation billing", [
    issue("A-1", "Incorporate Torchwood ERR endpoints into Mediation"),
    issue("A-2", "Billing report"),
    issue("A-3", "Mediation outage runbook"),
  ]);
  assert.deepEqual(out.map((r) => r.key), ["A-1"]);
  assert.equal(out[0].status, "In Progress");
});

test("short summaries need half their words; one-word summaries need that word", () => {
  assert.deepEqual(rankDuplicateCandidates("Coredump scripts", [issue("A-1", "Coredump health"), issue("A-2", "Scripts only")]).map((r) => r.key), ["A-1", "A-2"]);
  assert.deepEqual(rankDuplicateCandidates("Mediation", [issue("A-1", "Mediation fixes"), issue("A-2", "Other")]).map((r) => r.key), ["A-1"]);
});

test("ranked by shared words then key, capped at 5, tolerant of bad input", () => {
  const many = Array.from({ length: 8 }, (_, i) => issue(`A-${i + 1}`, "alpha beta gamma"));
  many.push(issue("A-0", "alpha beta gamma delta"));
  const out = rankDuplicateCandidates("alpha beta gamma delta", many);
  assert.equal(out.length, 5);
  assert.equal(out[0].key, "A-0");
  assert.deepEqual(rankDuplicateCandidates("alpha beta", null), []);
  assert.deepEqual(rankDuplicateCandidates("alpha beta", [null, {}, { key: "A-1" }, { key: "A-2", fields: {} }]), []);
  assert.deepEqual(rankDuplicateCandidates("", [issue("A-1", "alpha")]), []);
});

test("longer text needs more shared words before an issue is flagged", () => {
  const text = "alpha beta gamma delta epsilon zeta theta kappa lambda sigma omega rhoxx";
  const two = issue("A-1", "alpha gamma only");
  const three = issue("A-2", "alpha gamma delta only");
  assert.deepEqual(rankDuplicateCandidates(text, [two, three]).map((r) => r.key), ["A-2"]);
});

test("wording found only in an issue's description counts, and is marked", () => {
  const epic = { key: "E-1", fields: { summary: "Voice program", status: { name: "In Progress" }, description: "Incorporate Torchwood ERR endpoints into mediation for billing" } };
  const out = rankDuplicateCandidates("Torchwood ERR endpoints mediation", [epic, issue("A-2", "Unrelated")]);
  assert.deepEqual(out.map((r) => [r.key, r.matchedIn]), [["E-1", "description"]]);
  assert.equal(rankDuplicateCandidates("Torchwood ERR endpoints mediation", [issue("A-3", "Torchwood ERR endpoints")])[0].matchedIn, "summary");
});

test("only the first 500 characters of a description are compared", () => {
  const late = { key: "E-2", fields: { summary: "Voice program", description: `${"filler ".repeat(100)} torchwood endpoints mediation billing` } };
  assert.deepEqual(rankDuplicateCandidates("Torchwood endpoints mediation billing", [late]), []);
  const early = { key: "E-3", fields: { summary: "Voice program", description: "torchwood endpoints mediation billing" } };
  assert.deepEqual(rankDuplicateCandidates("Torchwood endpoints mediation billing", [early]).map((r) => r.key), ["E-3"]);
});
