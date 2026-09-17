import React from "react";
import { resolveJiraUsersByAccountIds } from "../../services/jiraClient.js";
import {
  extractAccountIdsFromTexts,
  humanizeJqlAccountIds,
  looksLikeAccountId,
} from "../../../shared/directReportsJql.mjs";

// Scans whatever strings the caller is currently rendering (member tokens,
// JQL text, anything) for raw Atlassian account ids and resolves them to a
// display name/email — purely for display; nothing here touches storage or
// the JQL actually sent to Jira. `resolvedNames[accountId]` is undefined
// while a lookup is pending, null if Jira has no match, or the label once
// resolved, so each id is only ever fetched once.
export const useJiraAccountIdResolver = (watchedTexts) => {
  const [resolvedNames, setResolvedNames] = React.useState({});

  React.useEffect(() => {
    const pendingIds = extractAccountIdsFromTexts(watchedTexts).filter(
      (id) => resolvedNames[id] === undefined
    );
    if (pendingIds.length === 0) {
      return undefined;
    }

    let cancelled = false;
    resolveJiraUsersByAccountIds(pendingIds)
      .then((items) => {
        if (cancelled) return;
        setResolvedNames((prev) => {
          const next = { ...prev };
          for (const accountId of pendingIds) {
            const user = items[accountId];
            next[accountId] = user?.displayName || user?.emailAddress || null;
          }
          return next;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setResolvedNames((prev) => {
          const next = { ...prev };
          for (const accountId of pendingIds) {
            next[accountId] = prev[accountId] ?? null;
          }
          return next;
        });
      });

    return () => {
      cancelled = true;
    };
  }, [watchedTexts, resolvedNames]);

  const displayMemberName = React.useCallback(
    (name) => (looksLikeAccountId(name) ? resolvedNames[name] || name : name),
    [resolvedNames]
  );

  const humanizeJql = React.useCallback(
    (jql) => humanizeJqlAccountIds(jql, resolvedNames),
    [resolvedNames]
  );

  return { resolvedNames, displayMemberName, humanizeJql };
};
