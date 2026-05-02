import { describeLocalSchedule, shouldRunApifyPoll, shouldRunYad2Poll } from "@/lib/schedule";
import { env } from "@/lib/env";
import { createLogger, errorMessage, newId } from "@/lib/log";
import { collectQueue } from "@apartment-finder/queue";
import { getDb } from "@/db";
import { cities, collectionRuns, yad2Regions } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

export type JobRunResult = {
  status: number;
  payload: Record<string, unknown>;
};

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

  // Enqueue-only path (BullMQ workers on Cloud Run handle everything).
  // Yad2 enqueues one job per REGION (Yad2's gateway only accepts ?region=N);
  // markers are routed to individual cities by the worker adapter.
  if (env().USE_BULLMQ_COLLECTORS !== "true") {
    log.warn("yad2 poll skipped because USE_BULLMQ_COLLECTORS is disabled", { batchId });
    return {
      status: 200,
      payload: { ok: true, skipped: "USE_BULLMQ_COLLECTORS is disabled", batchId, localTime },
    };
  }

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
  return {
    status: 200,
    payload: {
      ok: true,
      batchId,
      runIds: queued,
      queued: true,
      localTime,
      durationMs: Date.now() - startedAt,
    },
  };
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

async function listCollectorCities(source: "facebook") {
  const rows = await getDb()
    .select({
      id: cities.id,
      facebookGroupUrls: cities.facebookGroupUrls,
    })
    .from(cities)
    .where(and(eq(cities.isActive, true), eq(cities.isLaunchReady, true)));
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
