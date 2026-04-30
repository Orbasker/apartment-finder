// Lazy ioredis singleton. TLS-aware. BullMQ requires maxRetriesPerRequest:null.
import { Redis } from "ioredis";

let _conn: Redis | null = null;

export function getConnection(): Redis {
  if (_conn) return _conn;
  const url = process.env["REDIS_URL"];
  if (!url) throw new Error("REDIS_URL is required");
  _conn = new Redis(url, {
    maxRetriesPerRequest: null,
    tls: url.startsWith("rediss://") ? {} : undefined,
  });
  return _conn;
}
