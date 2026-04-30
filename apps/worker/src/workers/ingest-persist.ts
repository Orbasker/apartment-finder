import { Worker, type Job } from "bullmq";
import {
  ingestPersistJobSchema,
  type IngestPersistJob,
  getConnection,
} from "@apartment-finder/queue";
import { createLogger } from "../lib/log.js";

const log = createLogger("worker:ingest-persist");

/**
 * Placeholder worker. In this implementation, persist logic is folded into
 * ingest-enrich (via processListing). This worker is registered to keep the
 * queue infrastructure complete and to allow future decomposition.
 */
async function processIngestPersist(job: Job<IngestPersistJob>): Promise<void> {
  const data = ingestPersistJobSchema.parse(job.data);
  log.debug("ingest-persist pass-through", {
    runId: data.runId,
    listingId: data.listingId,
  });
}

export function createIngestPersistWorker() {
  return new Worker<IngestPersistJob>("ingest-persist", processIngestPersist, {
    connection: getConnection(),
    concurrency: 4,
  });
}
