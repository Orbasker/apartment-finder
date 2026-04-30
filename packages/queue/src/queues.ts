import { Queue } from "bullmq";
import { getConnection } from "./connection";

// Lazy queue accessor. The Queue instance is created on first access, not at
// module import time. This defers the REDIS_URL requirement to the first actual
// enqueue operation - safe to import in Next.js routes where REDIS_URL may not
// be set at build time (e.g., page-data collection).
function makeLazyQueue(name: string) {
  let instance: Queue | null = null;
  return new Proxy({} as Queue, {
    get(_target, prop) {
      if (!instance) {
        instance = new Queue(name, { connection: getConnection() });
      }
      const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
      if (typeof value === "function") {
        return value.bind(instance);
      }
      return value;
    },
  });
}

export const collectQueue = makeLazyQueue("collect");
export const ingestRawQueue = makeLazyQueue("ingest-raw");
export const ingestNormalizedQueue = makeLazyQueue("ingest-normalized");
export const ingestEnrichQueue = makeLazyQueue("ingest-enrich");
export const ingestPersistQueue = makeLazyQueue("ingest-persist");
export const ingestNotifyQueue = makeLazyQueue("ingest-notify");
