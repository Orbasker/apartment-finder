import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { fetchDatasetItems } from "@/integrations/apify";
import { normalizeFbPost } from "@/pipeline/fbNormalize";
import { ingestNewListings } from "@/pipeline/dedup";
import { fanOutToUsers } from "@/jobs/cron";
import { describeLocalSchedule } from "@/lib/schedule";
import { withApiLog, errorMessage } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ApifyWebhookBody = z.object({
  eventType: z.string(),
  resource: z.object({
    id: z.string(),
    defaultDatasetId: z.string().optional(),
  }),
});

export async function POST(req: Request): Promise<Response> {
  return withApiLog("webhooks:apify", req, async (log) => {
    const localTime = describeLocalSchedule();
    const expected = env().APIFY_WEBHOOK_SECRET;
    if (!expected) {
      log.error("APIFY_WEBHOOK_SECRET not set");
      return NextResponse.json(
        { ok: false, error: "APIFY_WEBHOOK_SECRET not set" },
        { status: 500 },
      );
    }
    const given = req.headers.get("x-apify-webhook-secret");
    if (given !== expected) {
      log.warn("unauthorized", { hasHeader: given != null });
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json().catch(() => null);
    const parsed = ApifyWebhookBody.safeParse(json);
    if (!parsed.success) {
      log.warn("invalid payload");
      return NextResponse.json(
        { ok: false, error: "Invalid payload", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { eventType, resource } = parsed.data;
    log.info("webhook received", { runId: resource.id, eventType });

    if (eventType !== "ACTOR.RUN.SUCCEEDED") {
      log.warn("skipped non-success event", { runId: resource.id, eventType });
      return NextResponse.json({
        ok: true,
        skipped: eventType,
        runId: resource.id,
        localTime,
      });
    }

    const datasetId = resource.defaultDatasetId;
    if (!datasetId) {
      log.error("no defaultDatasetId", { runId: resource.id });
      return NextResponse.json(
        {
          ok: false,
          error: "No defaultDatasetId on run",
          runId: resource.id,
          localTime,
        },
        { status: 400 },
      );
    }

    let items;
    try {
      items = await fetchDatasetItems(datasetId);
    } catch (err) {
      log.error("fetchDatasetItems failed", {
        runId: resource.id,
        datasetId,
        error: errorMessage(err),
      });
      throw err;
    }
    log.info("dataset fetched", {
      runId: resource.id,
      datasetId,
      items: items.length,
    });

    const normalized = (await Promise.all(items.map((item) => normalizeFbPost(item)))).filter(
      (l): l is NonNullable<typeof l> => l !== null,
    );

    log.info("posts normalized", {
      runId: resource.id,
      normalized: normalized.length,
      droppedAsUnusable: items.length - normalized.length,
    });

    const { inserted, skippedExisting } = await ingestNewListings(normalized);
    log.info("ingested", {
      runId: resource.id,
      inserted: inserted.length,
      skippedExisting,
    });

    const stats = await fanOutToUsers(inserted, "Apify scan");

    log.info("fan-out complete", {
      runId: resource.id,
      notifiedUsers: stats.perUser,
      passed: stats.passed,
      filtered: stats.filtered,
      alerted: stats.alerted,
      skippedByAi: stats.skipped,
      unsure: stats.unsure,
    });

    return NextResponse.json({
      ok: true,
      runId: resource.id,
      datasetId,
      received: items.length,
      normalized: normalized.length,
      inserted: inserted.length,
      skippedExisting,
      notifiedUsers: stats.perUser,
      filtered: stats.filtered,
      alerted: stats.alerted,
      skippedByAi: stats.skipped,
      unsure: stats.unsure,
      localTime,
    });
  });
}
