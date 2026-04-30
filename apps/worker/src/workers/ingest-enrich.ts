import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import {
  ingestEnrichJobSchema,
  type IngestEnrichJob,
  getConnection,
} from "@apartment-finder/queue";
import { getDb, schema } from "../db/index.js";
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

    // Mark run done when all inserted listings have been enriched
    const conn = getConnection();
    const counterKey = `af:run:${data.runId}:enriched`;
    const enriched = await conn.incr(counterKey);
    await conn.expire(counterKey, 86400);

    const db = getDb();
    const [run] = await db
      .select({ inserted: schema.collectionRuns.inserted })
      .from(schema.collectionRuns)
      .where(eq(schema.collectionRuns.runId, data.runId))
      .limit(1);

    if (run && enriched >= run.inserted) {
      await db
        .update(schema.collectionRuns)
        .set({ status: "done" })
        .where(eq(schema.collectionRuns.runId, data.runId));
      log.info("run done", { runId: data.runId, enriched, inserted: run.inserted });
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
