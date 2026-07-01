// Lightweight structured logger for the Express API server.
// Outputs lines with ISO timestamp, level, and a tagged message.
// Level env override: LOG_LEVEL=debug|info|warn|error (default: info)

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const envLevel = (process.env.LOG_LEVEL || "info").toLowerCase();
const minLevel = LEVELS[envLevel] ?? LEVELS.info;

const ts = () => new Date().toISOString();

const emit = (level, tag, message, meta) => {
  if (LEVELS[level] < minLevel) return;
  const prefix = `${ts()} [${level.toUpperCase()}] [${tag}]`;
  const out = level === "error" || level === "warn" ? console.error : console.log;
  if (meta !== undefined) {
    out(prefix, message, meta);
  } else {
    out(prefix, message);
  }
};

export const createLogger = (tag) => ({
  debug: (msg, meta) => emit("debug", tag, msg, meta),
  info:  (msg, meta) => emit("info",  tag, msg, meta),
  warn:  (msg, meta) => emit("warn",  tag, msg, meta),
  error: (msg, meta) => emit("error", tag, msg, meta),
});
