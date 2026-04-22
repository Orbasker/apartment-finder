import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { fetchDatasetItems } from "@/integrations/apify";
import { normalizeFbPost } from "@/pipeline/fbNormalize";
import { ingestNewListings } from "@/pipeline/dedup";
import { fanOutToUsers } from "@/jobs/cron";
import { describeLocalSchedule } from "@/lib/schedule";

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
  const localTime = describeLocalSchedule();
  const expected = env().APIFY_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "APIFY_WEBHOOK_SECRET not set" },
      { status: 500 },
    );
  }
  const given = req.headers.get("x-apify-webhook-secret");
  if (given !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = ApifyWebhookBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { eventType, resource } = parsed.data;
  if (eventType !== "ACTOR.RUN.SUCCEEDED") {
    console.warn(`Apify run ${resource.id} eventType=${eventType} — skipping`);
    return NextResponse.json({
      ok: true,
      skipped: eventType,
      runId: resource.id,
      localTime,
    });
  }

  const datasetId = resource.defaultDatasetId;
  if (!datasetId) {
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

  const items = await fetchDatasetItems(datasetId);

  const normalized = (
    await Promise.all(items.map((item) => normalizeFbPost(item)))
  ).filter((l): l is NonNullable<typeof l> => l !== null);

  const { inserted, skippedExisting } = await ingestNewListings(normalized);
  const stats = await fanOutToUsers(inserted, "Apify scan");

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
}
