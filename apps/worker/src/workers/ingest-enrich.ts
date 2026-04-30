import { Worker, type Job } from "bullmq";
import {
  ingestEnrichJobSchema,
  type IngestEnrichJob,
  getConnection,
} from "@apartment-finder/queue";
import { processListing } from "../ingestion/pipeline.js";
import { createLogger, errorMessage } from "../lib/log.js";

const log = createLogger("worker:ingest-enrich");

async function processIngestEnrich(job: Job<IngestEnrichJob>): Promise<void> {
  const data = ingestEnrichJobSchema.parse(job.data);
  log.info("ingest-enrich started", {
    runId: data.runId,
    listingId: data.listingId,
  });

  try {
    // Run full pipeline (extract → geocode → embed → persist → unify → match+notify)
    const outcome = await processListing(data.listingId);
    log.info("ingest-enrich completed", {
      runId: data.runId,
      listingId: data.listingId,
      status: outcome.status,
      apartmentId: outcome.apartmentId,
      matchedUsers: outcome.matchedUsers,
      alertsSent: outcome.alertsSent,
    });

    if (outcome.status === "failed") {
      throw new Error(outcome.error ?? "processListing returned failed");
    }
  } catch (err) {
    const message = errorMessage(err);
    log.error("ingest-enrich failed", {
      runId: data.runId,
      listingId: data.listingId,
      error: message,
    });
    throw err;
  }
}

export function createIngestEnrichWorker() {
  return new Worker<IngestEnrichJob>("ingest-enrich", processIngestEnrich, {
    connection: getConnection(),
    concurrency: 2,
  });
}
