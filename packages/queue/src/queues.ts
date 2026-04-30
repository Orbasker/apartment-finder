import { Queue } from "bullmq";
import { getConnection } from "./connection.js";

// Lazy queue factories — Queue constructor does NOT open a connection until .add() is called.
// Each queue is a module-level singleton created on first import.
export const collectQueue = new Queue("collect", { connection: getConnection() });
export const ingestRawQueue = new Queue("ingest-raw", { connection: getConnection() });
export const ingestNormalizedQueue = new Queue("ingest-normalized", { connection: getConnection() });
export const ingestEnrichQueue = new Queue("ingest-enrich", { connection: getConnection() });
export const ingestPersistQueue = new Queue("ingest-persist", { connection: getConnection() });
export const ingestNotifyQueue = new Queue("ingest-notify", { connection: getConnection() });
