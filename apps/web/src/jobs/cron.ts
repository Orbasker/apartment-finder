import { fetchYad2Listings, Yad2UpstreamUnavailableError, type Yad2Listing } from "@/scrapers/yad2";
import { isApifyConfigured, startFacebookGroupsRun } from "@/integrations/apify";
import { describeLocalSchedule, shouldRunApifyPoll, shouldRunYad2Poll } from "@/lib/schedule";
import { env } from "@/lib/env";
import { isLoopbackOrigin, resolveAppPublicOrigin } from "@/lib/appOrigin";
import { createLogger, errorMessage, newId } from "@/lib/log";
import { bulkInsertListings, type CollectedListing } from "@/ingestion/insert";
import { processListing } from "@/ingestion/pipeline";
import { contentHash } from "@/lib/contentHash";
import { getDb } from "@/db";
import { listings } from "@/db/schema";
import { and, eq, lt } from "drizzle-orm";

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
  const log = createLogger("job:yad2", { run: newId() });

  if (enforceSchedule && !shouldRunYad2Poll()) {
    log.info("skipped outside schedule", { localTime });
    return { status: 200, payload: { ok: true, skipped: "outside schedule", localTime } };
  }

  log.info("job started", { localTime, enforceSchedule });

  try {
    const listings = await fetchYad2Listings();
    log.info("yad2 fetched", { listings: listings.length });

    const collected = listings.map(yad2ToCollected);
    const { inserted, skippedExisting } = await bulkInsertListings(collected);
    log.info("ingested", { inserted: inserted.length, skippedExisting });

    const freshStats = await processBatch(
      inserted.map((row) => row.id),
      log,
    );

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
        fetched: listings.length,
        inserted: inserted.length,
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
  const log = createLogger("job:apify", { run: newId() });

  if (enforceSchedule && !shouldRunApifyPoll()) {
    return { status: 200, payload: { ok: true, skipped: "outside schedule" } };
  }

  if (!isApifyConfigured()) {
    return { status: 200, payload: { ok: false, skipped: "APIFY_TOKEN not set" } };
  }

  const webhookSecret = env().APIFY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return { status: 500, payload: { ok: false, error: "APIFY_WEBHOOK_SECRET not set" } };
  }

  const origin = resolveAppPublicOrigin(options.origin);
  if (isLoopbackOrigin(origin)) {
    return {
      status: 400,
      payload: {
        ok: false,
        error: "Apify cannot call webhooks on localhost. Set APP_PUBLIC_ORIGIN to a public origin.",
      },
    };
  }

  const webhookUrl = new URL("/api/webhooks/apify", origin).toString();

  try {
    const result = await startFacebookGroupsRun({ webhookUrl, webhookSecret });
    if (!result) {
      log.info("no monitored groups, processing retries only");
    } else {
      log.info("apify run started", { runId: result.runId, groupCount: result.groupCount });
    }

    const failedIds = await fetchFailedListingsToRetry();
    const retryStats =
      failedIds.length > 0
        ? await processBatch(failedIds, log)
        : { processed: 0, unified: 0, failed: 0, alertsSent: 0 };

    return {
      status: 200,
      payload: {
        ok: true,
        apifyRun: result || { skipped: "no monitored groups" },
        retry: retryStats,
      },
    };
  } catch (err) {
    log.error("apify poll failed", { error: errorMessage(err) });
    return {
      status: 500,
      payload: { ok: false, error: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function yad2ToCollected(listing: Yad2Listing): CollectedListing {
  return {
    source: "yad2",
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
