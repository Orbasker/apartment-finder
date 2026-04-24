// Structured logger for Vercel log search.
//
// Every line is prefixed with `[af:<scope>]` so you can filter in Vercel by
// typing `af:`, `af:api:`, `af:job:yad2`, etc. Fields follow as `key=value`
// pairs (strings with whitespace are JSON-escaped). Correlation ids
// (`req=…`, `run=…`) live in the base fields so you can follow one request
// end-to-end.
//
// Levels: error > warn > info > debug. `debug` is for per-item / chatty
// output and is OFF by default. To enable it, set `LOG_DEBUG=1` (or
// `LOG_LEVEL=debug`) on the environment — in Vercel, add it to the
// project env vars for the environment you want to investigate, redeploy,
// then remove when done.

export type LogLevel = "info" | "warn" | "error" | "debug";

function readLogLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  if (process.env.LOG_DEBUG === "1" || process.env.LOG_DEBUG === "true") {
    return "debug";
  }
  return "info";
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// Read once at module init. Changing env vars requires a redeploy, which is
// exactly when Vercel reloads the module anyway.
const ACTIVE_LEVEL = readLogLevel();

export function isLevelEnabled(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[ACTIVE_LEVEL];
}

export type LogValue = string | number | boolean | null | undefined;
export type LogFields = Record<string, LogValue>;

export type Logger = {
  info: (msg: string, fields?: LogFields) => void;
  warn: (msg: string, fields?: LogFields) => void;
  error: (msg: string, fields?: LogFields) => void;
  debug: (msg: string, fields?: LogFields) => void;
  child: (subScope: string, childFields?: LogFields) => Logger;
  scope: string;
};

function formatField(value: LogValue): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    return /[\s="]/.test(value) ? JSON.stringify(value) : value;
  }
  return String(value);
}

function formatFields(fields: LogFields): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    parts.push(`${key}=${formatField(value)}`);
  }
  return parts.length > 0 ? " " + parts.join(" ") : "";
}

export function createLogger(scope: string, baseFields: LogFields = {}): Logger {
  const emit = (level: LogLevel, msg: string, fields?: LogFields) => {
    if (!isLevelEnabled(level)) return;
    const merged: LogFields = fields ? { ...baseFields, ...fields } : baseFields;
    const line = `[af:${scope}] ${msg}${formatFields(merged)}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };

  return {
    scope,
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    debug: (msg, fields) => emit("debug", msg, fields),
    child: (subScope, childFields = {}) =>
      createLogger(`${scope}:${subScope}`, { ...baseFields, ...childFields }),
  };
}

export function newId(): string {
  // Short non-crypto id for correlating log lines within one request/run.
  return Math.random().toString(36).slice(2, 10);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function errorName(err: unknown): string | undefined {
  return err instanceof Error ? err.name : undefined;
}

// Wraps a Next.js route handler so every request logs a start and end line
// with request id, method, path, status, and duration. The handler gets a
// pre-scoped logger it can use for any additional lines.
export async function withApiLog(
  name: string,
  req: Request,
  handler: (log: Logger) => Promise<Response>,
): Promise<Response> {
  const reqId = newId();
  const log = createLogger(`api:${name}`, { req: reqId });
  const startedAt = Date.now();
  const method = req.method;
  const path = (() => {
    try {
      return new URL(req.url).pathname;
    } catch {
      return req.url;
    }
  })();

  log.info("request received", { method, path });

  try {
    const res = await handler(log);
    const level = res.status >= 500 ? "error" : res.status >= 400 ? "warn" : "info";
    const fields = {
      status: res.status,
      durationMs: Date.now() - startedAt,
    };
    if (level === "error") log.error("request completed", fields);
    else if (level === "warn") log.warn("request completed", fields);
    else log.info("request completed", fields);
    return res;
  } catch (err) {
    log.error("request threw", {
      durationMs: Date.now() - startedAt,
      error: errorMessage(err),
      errorName: errorName(err),
    });
    throw err;
  }
}
