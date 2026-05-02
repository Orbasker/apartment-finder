import { fetchYad2Listings, Yad2UpstreamUnavailableError, type Yad2Listing } from "@/scrapers/yad2";
import { describeLocalSchedule, shouldRunApifyPoll, shouldRunYad2Poll } from "@/lib/schedule";
import { env } from "@/lib/env";
import { createLogger, errorMessage, newId } from "@/lib/log";
import { bulkInsertListings, type CollectedListing } from "@/ingestion/insert";
import { processListing } from "@/ingestion/pipeline";
import { contentHash } from "@/lib/contentHash";
import { collectQueue } from "@apartment-finder/queue";
import { getDb } from "@/db";
import { cities, collectionRuns, listings, yad2Regions } from "@/db/schema";
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";

export type JobRunResult = {
  status: number;
  payload: Record<string, unknown>;
};

const PROCESS_CONCURRENCY = 4;
const MAX_RETRY_BATCH_SIZE = 50;
const MAX_RETRIES_ALLOWED = 3;

export async function runYad2PollJob(options?: {
  enforceSchedule?: boolean;
}): Promise<JobRunResult> {
  const startedAt = Date.now();
  const localTime = describeLocalSchedule();
  const enforceSchedule = options?.enforceSchedule ?? true;
  const batchId = newId();
  const log = createLogger("job:yad2", { run: batchId });

  if (enforceSchedule && !shouldRunYad2Poll()) {
    log.info("skipped outside schedule", { localTime });
    return { status: 200, payload: { ok: true, skipped: "outside schedule", localTime } };
  }

  // NEW: enqueue-only path (BullMQ workers on VPS handle everything).
  // Yad2 enqueues one job per REGION (Yad2's gateway only accepts ?region=N);
  // markers are routed to individual cities by the worker adapter.
  if (env().USE_BULLMQ_COLLECTORS === "true") {
    const db = getDb();
    const targets = await listCollectorRegions();
    const queued: string[] = [];
    for (const region of targets) {
      const runId = `${batchId}-region-${region.id}-yad2`;
      await db
        .insert(collectionRuns)
        .values({ runId, source: "yad2", regionId: region.id, status: "queued" });
      try {
        await collectQueue.add(
          "collect",
          { runId, source: "yad2", regionId: region.id, enqueuedAt: Date.now() },
          {
            attempts: 3,
            backoff: { type: "exponential", delay: 30_000 },
          },
        );
        queued.push(runId);
      } catch (err) {
        const message = errorMessage(err);
        log.error("enqueue failed", { runId, regionId: region.id, error: message });
        // Mark the just-inserted row failed so it doesn't sit in `queued` forever
        // — no worker will ever pick it up.
        await db
          .update(collectionRuns)
          .set({ status: "failed", error: message })
          .where(eq(collectionRuns.runId, runId));
        return { status: 500, payload: { ok: false, batchId, queued, error: message, localTime } };
      }
    }
    log.info("collect enqueued (bullmq)", { batchId, runs: queued.length, localTime });
    return { status: 200, payload: { ok: true, batchId, runIds: queued, queued: true, localTime } };
  }

  // OLD: inline path (kept for rollback safety; remove once bullmq is verified in prod)
  log.info("job started", { localTime, enforceSchedule });

  try {
    const targets = await listCollectorCities("yad2");
    const allInserted: number[] = [];
    let fetched = 0;
    let skippedExisting = 0;

    for (const city of targets) {
      const listings = await fetchYad2Listings({ feedUrl: city.yad2FeedUrl ?? undefined });
      fetched += listings.length;
      log.info("yad2 fetched", { cityId: city.id, listings: listings.length });

      const collected = listings.map((listing) => yad2ToCollected(listing, city.id));
      const inserted = await bulkInsertListings(collected);
      skippedExisting += inserted.skippedExisting;
      allInserted.push(...inserted.inserted.map((row) => row.id));
    }
    log.info("ingested", { inserted: allInserted.length, skippedExisting });

    const freshStats = await processBatch(allInserted, log);

    const failedIds = await fetchFailedListingsToRetry();
    const retryStats =
      failedIds.length > 0
        ? await processBatch(failedIds, log)
        : { processed: 0, unified: 0, failed: 0, alertsSent: 0 };

    log.info("job finished", {
      durationMs: Date.now() - startedAt,
      freshProcessed: freshStats.processed,
      freshUnified: freshStats.unified,
      freshFailed: freshStats.failed,
      retryProcessed: retryStats.processed,
      retryUnified: retryStats.unified,
      retryFailed: retryStats.failed,
    });
    return {
      status: 200,
      payload: {
        ok: true,
        fetched,
        inserted: allInserted.length,
        skippedExisting,
        fresh: freshStats,
        retry: retryStats,
        localTime,
        durationMs: Date.now() - startedAt,
      },
    };
  } catch (err) {
    if (err instanceof Yad2UpstreamUnavailableError) {
      log.warn("yad2 upstream unavailable", { error: err.message, status: err.status });
      return {
        status: 200,
        payload: { ok: true, fetched: 0, upstreamStatus: "unavailable", localTime },
      };
    }
    log.error("job failed", { error: errorMessage(err) });
    return {
      status: 500,
      payload: { ok: false, error: err instanceof Error ? err.message : String(err), localTime },
    };
  }
}

export async function runApifyPollJob(options: {
  origin: string;
  enforceSchedule?: boolean;
}): Promise<JobRunResult> {
  const enforceSchedule = options.enforceSchedule ?? true;
  const batchId = newId();
  const log = createLogger("job:apify", { run: batchId });

  if (enforceSchedule && !shouldRunApifyPoll()) {
    return { status: 200, payload: { ok: true, skipped: "outside schedule" } };
  }

  // NEW: enqueue-only path (BullMQ workers on VPS handle everything)
  if (env().USE_BULLMQ_COLLECTORS === "true") {
    const db = getDb();
    const targets = await listCollectorCities("facebook");
    const queued: string[] = [];
    for (const city of targets) {
      const runId = `${batchId}-${city.id}-facebook`;
      await db
        .insert(collectionRuns)
        .values({ runId, source: "facebook", cityId: city.id, status: "queued" });
      try {
        await collectQueue.add(
          "collect",
          { runId, source: "facebook", cityId: city.id, enqueuedAt: Date.now() },
          {
            attempts: 3,
            backoff: { type: "exponential", delay: 30_000 },
          },
        );
        queued.push(runId);
      } catch (err) {
        const message = errorMessage(err);
        log.error("enqueue failed", { runId, cityId: city.id, error: message });
        // Mark the just-inserted row failed so it doesn't sit in `queued` forever
        // — no worker will ever pick it up.
        await db
          .update(collectionRuns)
          .set({ status: "failed", error: message })
          .where(eq(collectionRuns.runId, runId));
        return { status: 500, payload: { ok: false, batchId, queued, error: message } };
      }
    }
    log.info("collect enqueued (bullmq)", { batchId, runs: queued.length });
    return { status: 200, payload: { ok: true, batchId, runIds: queued, queued: true } };
  }

  // The legacy inline Apify path posted to /api/webhooks/apify, which this PR
  // removed. With USE_BULLMQ_COLLECTORS off there is no working ingest path -
  // but the Vercel cron may still be configured, so return 200 with a clear
  // "skipped" payload instead of 500ing on every tick.
  log.warn("apify poll skipped because USE_BULLMQ_COLLECTORS is disabled", { batchId });
  return {
    status: 200,
    payload: {
      ok: true,
      skipped: "USE_BULLMQ_COLLECTORS is disabled",
      batchId,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function yad2ToCollected(listing: Yad2Listing, cityId: string): CollectedListing {
  return {
    source: "yad2",
    cityId,
    sourceId: listing.sourceId,
    url: listing.url,
    rawText: null,
    rawJson: listing.rawJson,
    contentHash: contentHash(listing.rawJson ?? listing.url),
    postedAt: listing.postedAt,
    authorName: listing.authorName,
    authorProfile: listing.authorProfile,
  };
}

async function listCollectorCities(source: "yad2" | "facebook") {
  const rows = await getDb()
    .select({
      id: cities.id,
      yad2FeedUrl: cities.yad2FeedUrl,
      facebookGroupUrls: cities.facebookGroupUrls,
    })
    .from(cities)
    .where(
      and(
        eq(cities.isActive, true),
        eq(cities.isLaunchReady, true),
        source === "yad2" ? isNotNull(cities.yad2FeedUrl) : eq(cities.isLaunchReady, true),
      ),
    );
  return source === "facebook" ? rows.filter((row) => row.facebookGroupUrls.length > 0) : rows;
}

/**
 * DISTINCT regions that have ≥1 launch-ready city. Yad2's gateway is
 * region-scoped, so we fetch once per region and route markers to cities at
 * adapter time. A region with only dormant cities is skipped — it would still
 * return markers, but they'd be tagged to non-launch-ready cities that
 * aren't user-visible.
 */
async function listCollectorRegions() {
  return await getDb()
    .select({ id: yad2Regions.id, slug: yad2Regions.slug })
    .from(yad2Regions)
    .where(
      and(
        eq(yad2Regions.isActive, true),
        sql`EXISTS (
          SELECT 1 FROM ${cities}
          WHERE ${cities.regionId} = ${yad2Regions.id}
            AND ${cities.isActive} = true
            AND ${cities.isLaunchReady} = true
        )`,
      ),
    );
}

type BatchStats = { processed: number; unified: number; failed: number; alertsSent: number };

async function processBatch(
  listingIds: number[],
  log: ReturnType<typeof createLogger>,
): Promise<BatchStats> {
  const stats: BatchStats = { processed: 0, unified: 0, failed: 0, alertsSent: 0 };
  for (let i = 0; i < listingIds.length; i += PROCESS_CONCURRENCY) {
    const slice = listingIds.slice(i, i + PROCESS_CONCURRENCY);
    const results = await Promise.allSettled(slice.map((id) => processListing(id)));
    for (const r of results) {
      stats.processed++;
      if (r.status === "fulfilled") {
        if (r.value.status === "unified") stats.unified++;
        else if (r.value.status === "failed") stats.failed++;
        stats.alertsSent += r.value.alertsSent ?? 0;
      } else {
        stats.failed++;
        log.error("process unhandled rejection", { error: errorMessage(r.reason) });
      }
    }
  }
  return stats;
}

async function fetchFailedListingsToRetry(): Promise<number[]> {
  const db = getDb();
  const failed = await db
    .select({ id: listings.id })
    .from(listings)
    .where(and(eq(listings.status, "failed"), lt(listings.retries, MAX_RETRIES_ALLOWED)))
    .limit(MAX_RETRY_BATCH_SIZE);
  return failed.map((row) => row.id);
}
