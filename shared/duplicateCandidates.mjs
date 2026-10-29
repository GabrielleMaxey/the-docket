// Possible-duplicate check for Create Issue: build a read-only JQL search from the new
// summary, then rank the returned issues by how many meaningful words they share.

// Only the start of a description is compared: that is where an issue states what it is about.
export const DESCRIPTION_CHECK_CHARS = 500;
const MAX_QUERY_WORDS = 10;
// Descriptions are long, so a common word matches far too many of them. Search them with only
// the most specific words; titles still use all of the words.
const MAX_DESCRIPTION_QUERY_WORDS = 8;
const MIN_WORD_LENGTH = 3;
const MAX_RESULTS = 5;
const PROJECT_KEY = /^[A-Za-z][A-Za-z0-9_]*$/;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "onto", "that", "this", "these", "those", "are", "was",
  "were", "has", "have", "had", "not", "but", "all", "any", "can", "per", "via", "new", "add", "use",
  "make", "get", "set", "update", "create", "fix", "issue", "task", "story", "bug", "when", "then",
  "than", "its", "our", "your", "their", "should", "would", "could", "will", "need", "needs",
  "want", "wants", "wanted", "able", "ability", "also", "just", "about", "there", "here", "what",
  "which", "who", "how", "why", "been", "being", "does", "like", "some", "more", "than", "very",
]);

const words = (text) => {
  const seen = new Set();
  const out = [];
  for (const raw of String(text ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < MIN_WORD_LENGTH || STOPWORDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
};

// Long text (AI helper intake answers) has more words than we search for, so keep the most
// specific ones: longest first, original order as the tie-break and in the result.
export const significantWords = (text, max = MAX_QUERY_WORDS) => {
  const all = words(text);
  if (all.length <= max) return all;
  const keep = new Set(
    all
      .map((word, index) => ({ word, index }))
      .sort((a, b) => b.word.length - a.word.length || a.index - b.index)
      .slice(0, max)
      .map((item) => item.word)
  );
  return all.filter((word) => keep.has(word));
};

export const buildDuplicateSearchJql = ({ projectKey, summary } = {}) => {
  const project = String(projectKey ?? "").trim();
  if (!PROJECT_KEY.test(project)) return null;
  const terms = significantWords(summary);
  if (terms.length === 0) return null;
  const descriptionTerms = new Set(significantWords(summary, MAX_DESCRIPTION_QUERY_WORDS));
  const clause = terms
    .flatMap((w) => [`summary ~ "${w}"`, ...(descriptionTerms.has(w) ? [`description ~ "${w}"`] : [])])
    .join(" OR ");
  // No ORDER BY: with a text search Jira ranks by relevance, so the capped result list holds the
  // best matches instead of whatever was updated last.
  return `project = "${project}" AND statusCategory != Done AND (${clause})`;
};

const requiredShared = (n) => (n < 4 ? Math.ceil(n / 2) : Math.min(3, Math.max(2, Math.ceil(n * 0.25))));

// Jira matches word forms (lookup/lookups); the local comparison must too.
export const stem = (word) => {
  let w = String(word);
  if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  return w;
};

export const rankDuplicateCandidates = (summary, issues, { limit = MAX_RESULTS } = {}) => {
  const queryRaw = significantWords(summary);
  if (queryRaw.length === 0 || !Array.isArray(issues)) return [];
  const query = queryRaw.map(stem);
  const need = requiredShared(query.length);
  const ranked = [];
  for (const issue of issues) {
    const key = issue?.key;
    const text = issue?.fields?.summary ?? issue?.summary;
    if (typeof key !== "string" || !key || typeof text !== "string") continue;
    const inSummary = new Set(words(text).map(stem));
    const description = issue?.fields?.description;
    const inDescription = typeof description === "string" ? new Set(words(description.slice(0, DESCRIPTION_CHECK_CHARS)).map(stem)) : new Set();
    const summaryShared = query.filter((w) => inSummary.has(w)).length;
    const shared = query.filter((w) => inSummary.has(w) || inDescription.has(w)).length;
    if (shared < need) continue;
    ranked.push({
      key,
      summary: text,
      status: issue?.fields?.status?.name ?? (typeof issue?.status === "string" ? issue.status : ""),
      shared,
      matchedIn: summaryShared >= need ? "summary" : "description",
    });
  }
  ranked.sort((a, b) => b.shared - a.shared || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return ranked.slice(0, Math.max(0, limit));
};
