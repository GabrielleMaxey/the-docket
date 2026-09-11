const PAGE_SIZE = 50;
const MAX_FILTERS = 500;

export const mapJiraFilter = (filter) => ({
  id: String(filter?.id || ""),
  name: String(filter?.name || "").trim(),
  jql: String(filter?.jql || "").trim(),
  owner: filter?.owner?.displayName || filter?.owner?.name || "",
});

/**
 * Lists filters the authenticated user can see in Jira (owned + shared),
 * via paginated GET /rest/api/3/filter/search — not favourites-only or owned-only.
 */
export const listAvailableJiraFilters = async ({ jiraRequest }) => {
  const items = [];
  let startAt = 0;

  while (items.length < MAX_FILTERS) {
    const params = new URLSearchParams({
      startAt: String(startAt),
      maxResults: String(PAGE_SIZE),
      expand: "jql,owner",
      orderBy: "name",
    });
    const result = await jiraRequest({
      pathWithQuery: `/rest/api/3/filter/search?${params.toString()}`,
    });
    if (!result.ok) {
      return result;
    }

    const page = Array.isArray(result.data?.values) ? result.data.values : [];
    for (const filter of page) {
      const mapped = mapJiraFilter(filter);
      if (mapped.id) {
        items.push(mapped);
      }
      if (items.length >= MAX_FILTERS) {
        break;
      }
    }

    const isLast = Boolean(result.data?.isLast) || page.length === 0;
    if (isLast) {
      break;
    }
    startAt += page.length > 0 ? page.length : PAGE_SIZE;
  }

  return { ok: true, status: 200, data: { items } };
};
