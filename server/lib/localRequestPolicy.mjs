export function localRequestPolicy({ apiPort, allowedOrigins }) {
  const origins = new Set(allowedOrigins);
  return (req, res, next) => {
    const host = req.headers.host;
    let parsedHost;
    try {
      parsedHost = new URL(`http://${host}`);
    } catch {
      return res.status(403).json({ error: "Local API Host is not allowed" });
    }
    if (
      typeof host !== "string" || !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) ||
      !["localhost", "127.0.0.1"].includes(parsedHost.hostname) ||
      Number(parsedHost.port || 80) !== Number(apiPort)
    ) {
      return res.status(403).json({ error: "Local API Host is not allowed" });
    }
    const origin = req.headers.origin;
    // Origin-free callers are trusted local processes, not authenticated app sessions.
    if (origin !== undefined) {
      let parsedOrigin;
      try {
        parsedOrigin = new URL(origin);
      } catch {
        return res.status(403).json({ error: "Local API Origin is not allowed" });
      }
      if (
        typeof origin !== "string" || !["http:", "https:"].includes(parsedOrigin.protocol) ||
        parsedOrigin.origin !== origin || !origins.has(origin)
      ) {
        return res.status(403).json({ error: "Local API Origin is not allowed" });
      }
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, X-Docket-Site, X-Docket-Generation");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  };
}
