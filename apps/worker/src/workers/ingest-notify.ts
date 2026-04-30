import { Worker, type Job } from "bullmq";
import {
  ingestNotifyJobSchema,
  type IngestNotifyJob,
  getConnection,
} from "@apartment-finder/queue";
import { createLogger } from "../lib/log.js";

const log = createLogger("worker:ingest-notify");

/**
 * Placeholder worker. In this implementation, notification logic is folded
 * into ingest-enrich (via processListing). This worker is registered to keep
 * the queue infrastructure complete and to allow future decomposition.
 */
async function processIngestNotify(job: Job<IngestNotifyJob>): Promise<void> {
  const data = ingestNotifyJobSchema.parse(job.data);
  log.debug("ingest-notify pass-through", {
    runId: data.runId,
    listingId: data.listingId,
  });
}

export function createIngestNotifyWorker() {
  return new Worker<IngestNotifyJob>("ingest-notify", processIngestNotify, {
    connection: getConnection(),
    concurrency: 4,
  });
}
