export const DEFAULT_DIRECT_REPORTS_LABEL = "My Direct Reports";

export const escapeJqlString = (value) =>
  String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export const stripAccountIdPrefix = (value) =>
  String(value || "")
    .trim()
    .replace(/^accountid:/i, "")
    .trim();

export const looksLikeAccountId = (value) => {
  const id = stripAccountIdPrefix(value);
  if (!id || id.includes(" ") || id.includes("@")) {
    return false;
  }
  if (/^\d+:[0-9a-f-]{8,}$/i.test(id)) {
    return true;
  }
  if (/^[0-9a-f]{24,32}$/i.test(id)) {
    return true;
  }
  return false;
};

export const isJqlCurrentUser = (value) =>
  /^currentuser\(\)$/i.test(String(value || "").trim());

export const unwrapMemberToken = (value) => {
  let token = String(value || "").trim();
  if (!token) {
    return "";
  }
  if (isJqlCurrentUser(token)) {
    return "currentUser()";
  }
  token = token.replace(/^assignee\s*(?:in|=)\s*\(?/i, "").trim();
  token = token.replace(/^["']+|["']+$/g, "").trim();
  token = token.replace(/^accountid:/i, "").trim();
  if (isJqlCurrentUser(token) || /^currentuser$/i.test(token)) {
    return "currentUser()";
  }
  return token;
};

export const extractAccountIdFromInput = (value) => {
  const raw = unwrapMemberToken(value);
  const fromUrl = raw.match(/\/(?:jira\/)?people\/([^/?#]+)/i);
  const candidate = stripAccountIdPrefix(fromUrl ? decodeURIComponent(fromUrl[1]) : raw);
  return looksLikeAccountId(candidate) ? candidate : "";
};

export const toAssigneeJqlOperand = (token) => {
  if (isJqlCurrentUser(token)) {
    return "currentUser()";
  }
  const accountId = extractAccountIdFromInput(token);
  if (accountId) {
    return `"${escapeJqlString(accountId)}"`;
  }
  return `"${escapeJqlString(String(token || "").trim())}"`;
};

export const parseMemberNameInput = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return [];
  }
  const inList = raw.match(/\bin\s*\(([\s\S]*?)\)\s*(?:order\s+by[\s\S]*)?$/i);
  const body = inList
    ? inList[1]
    : raw.replace(/\s+order\s+by[\s\S]*$/i, "").trim();
  return body
    .split(",")
    .map((part) => unwrapMemberToken(part))
    .filter((part) => part && !/^order\s+by\b/i.test(part));
};

export const canonicalizeMemberToken = (value) => {
  const trimmed = unwrapMemberToken(value);
  if (isJqlCurrentUser(trimmed)) {
    return "currentUser()";
  }
  return extractAccountIdFromInput(trimmed) || trimmed;
};

export const normalizeMemberNames = (names) => {
  const seen = new Set();
  const result = [];
  const parts = Array.isArray(names)
    ? names.flatMap((raw) => parseMemberNameInput(raw))
    : parseMemberNameInput(names);
  for (const part of parts) {
    const name = canonicalizeMemberToken(part);
    if (!name) {
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(name);
  }
  return result;
};

export const isCurrentUserMember = (token, myself = null) => {
  if (isJqlCurrentUser(token)) {
    return true;
  }
  const trimmed = String(token || "").trim();
  if (!trimmed) {
    return false;
  }
  const myId = String(myself?.accountId || "").trim();
  const tokenId = extractAccountIdFromInput(trimmed);
  if (myId && (tokenId === myId || trimmed === myId)) {
    return true;
  }
  const myName = String(myself?.displayName || "").trim().toLowerCase();
  return Boolean(myName && trimmed.toLowerCase() === myName);
};

export const membersExcludingCurrentUser = (names, myself = null) =>
  normalizeMemberNames(names).filter((token) => !isCurrentUserMember(token, myself));

export const buildDirectReportsJql = (names, myself = null) => {
  const members = membersExcludingCurrentUser(names, myself);
  if (members.length === 0) {
    return "";
  }
  if (members.length === 1) {
    return `assignee = ${toAssigneeJqlOperand(members[0])} ORDER BY updated DESC`;
  }
  const list = members.map((name) => toAssigneeJqlOperand(name)).join(", ");
  return `assignee in (${list}) ORDER BY updated DESC`;
};
