import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import {
  ingestRawJobSchema,
  ingestNormalizedQueue,
  type IngestRawJob,
  getConnection,
} from "@apartment-finder/queue";
import { getDb, schema } from "../db/index.js";
import { bulkInsertListings, type CollectedListing } from "../ingestion/insert.js";
import { env } from "../env.js";
import { createLogger, errorMessage } from "../lib/log.js";

const log = createLogger("worker:ingest-raw");

async function processIngestRaw(job: Job<IngestRawJob>): Promise<void> {
  const data = ingestRawJobSchema.parse(job.data);
  const db = getDb();
  log.info("ingest-raw started", { runId: data.runId, source: data.source });

  try {
    const res = await fetch(data.blobUrl);
    if (!res.ok) {
      throw new Error(`Failed to download blob: ${res.status}`);
    }
    const raw = await res.text();
    const listings = JSON.parse(raw) as CollectedListing[];

    // Insert listings
    const { inserted, skippedExisting } = await bulkInsertListings(listings);

    // Update collection run stats
    await db
      .update(schema.collectionRuns)
      .set({
        status: "ingesting",
        receivedCount: listings.length,
        skippedExisting,
        inserted: inserted.length,
      })
      .where(eq(schema.collectionRuns.runId, data.runId));

    // Enqueue per-listing normalization
    await Promise.all(
      inserted.map((row) =>
        ingestNormalizedQueue.add(
          "ingest-normalized",
          { runId: data.runId, source: data.source, listingId: row.id },
          { attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
        ),
      ),
    );

    log.info("ingest-raw completed", {
      runId: data.runId,
      inserted: inserted.length,
      skippedExisting,
    });
  } catch (err) {
    const message = errorMessage(err);
    log.error("ingest-raw failed", { runId: data.runId, error: message });
    throw err;
  }
}

export function createIngestRawWorker() {
  return new Worker<IngestRawJob>("ingest-raw", processIngestRaw, {
    connection: getConnection(),
    concurrency: 4,
  });
}
