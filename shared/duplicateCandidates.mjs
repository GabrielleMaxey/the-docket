// Possible-duplicate check for Create Issue: build a read-only JQL search from the new
// summary, then rank the returned issues by how many meaningful words they share.

const MAX_QUERY_WORDS = 6;
const MIN_WORD_LENGTH = 3;
const MAX_RESULTS = 5;
const PROJECT_KEY = /^[A-Za-z][A-Za-z0-9_]*$/;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "onto", "that", "this", "these", "those", "are", "was",
  "were", "has", "have", "had", "not", "but", "all", "any", "can", "per", "via", "new", "add", "use",
  "make", "get", "set", "update", "create", "fix", "issue", "task", "story", "bug", "when", "then",
  "than", "its", "our", "your", "their", "should", "would", "could", "will", "need", "needs",
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

export const significantWords = (summary) => words(summary).slice(0, MAX_QUERY_WORDS);

export const buildDuplicateSearchJql = ({ projectKey, summary } = {}) => {
  const project = String(projectKey ?? "").trim();
  if (!PROJECT_KEY.test(project)) return null;
  const terms = significantWords(summary);
  if (terms.length === 0) return null;
  const clause = terms.map((w) => `summary ~ "${w}"`).join(" OR ");
  return `project = "${project}" AND statusCategory != Done AND (${clause}) ORDER BY updated DESC`;
};

const requiredShared = (n) => (n < 4 ? Math.ceil(n / 2) : 2);

export const rankDuplicateCandidates = (summary, issues, { limit = MAX_RESULTS } = {}) => {
  const query = significantWords(summary);
  if (query.length === 0 || !Array.isArray(issues)) return [];
  const need = requiredShared(query.length);
  const ranked = [];
  for (const issue of issues) {
    const key = issue?.key;
    const text = issue?.fields?.summary ?? issue?.summary;
    if (typeof key !== "string" || !key || typeof text !== "string") continue;
    const candidate = new Set(words(text));
    const shared = query.filter((w) => candidate.has(w)).length;
    if (shared < need) continue;
    ranked.push({
      key,
      summary: text,
      status: issue?.fields?.status?.name ?? (typeof issue?.status === "string" ? issue.status : ""),
      shared,
    });
  }
  ranked.sort((a, b) => b.shared - a.shared || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return ranked.slice(0, Math.max(0, limit));
};
