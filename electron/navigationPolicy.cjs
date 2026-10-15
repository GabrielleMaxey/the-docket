function isAppNavigation(url, { appOrigin }) {
  try {
    const parsed = new URL(url);
    return !parsed.username && !parsed.password &&
      (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.origin === appOrigin;
  } catch {
    return false;
  }
}

function isAllowedExternalUrl(url, { jiraHosts, externalHosts }) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port &&
      (jiraHosts.includes(parsed.hostname) || externalHosts.includes(parsed.hostname));
  } catch {
    return false;
  }
}

module.exports = { isAppNavigation, isAllowedExternalUrl };
