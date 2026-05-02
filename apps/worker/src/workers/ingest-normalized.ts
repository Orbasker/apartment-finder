import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import {
  ingestNormalizedJobSchema,
  ingestEnrichQueue,
  type IngestNormalizedJob,
  getConnection,
} from "@apartment-finder/queue";
import { getDb, schema } from "../db/index.js";
import { createLogger, errorMessage } from "../lib/log.js";

const log = createLogger("worker:ingest-normalized");

async function processIngestNormalized(job: Job<IngestNormalizedJob>): Promise<void> {
  const data = ingestNormalizedJobSchema.parse(job.data);
  const db = getDb();
  log.debug("ingest-normalized started", {
    runId: data.runId,
    listingId: data.listingId,
  });

  try {
    // Check if listing has already been processed past pending
    const [listing] = await db
      .select({ id: schema.listings.id, status: schema.listings.status })
      .from(schema.listings)
      .where(eq(schema.listings.id, data.listingId))
      .limit(1);

    if (!listing) {
      log.warn("listing not found, skipping", { listingId: data.listingId });
      return;
    }

    if (listing.status !== "pending") {
      log.debug("listing already processed, skipping", {
        listingId: data.listingId,
        status: listing.status,
      });
      return;
    }

    // Enqueue enrichment
    await ingestEnrichQueue.add(
      "ingest-enrich",
      { runId: data.runId, listingId: data.listingId },
      { attempts: 5, backoff: { type: "exponential", delay: 30_000 } },
    );
  } catch (err) {
    const message = errorMessage(err);
    log.error("ingest-normalized failed", {
      listingId: data.listingId,
      error: message,
    });
    throw err;
  }
}

export function createIngestNormalizedWorker() {
  return new Worker<IngestNormalizedJob>("ingest-normalized", processIngestNormalized, {
    connection: getConnection(),
    concurrency: 8,
    stalledInterval: 300_000,
  });
}
