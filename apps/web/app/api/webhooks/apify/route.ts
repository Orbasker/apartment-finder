import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { fetchDatasetItems } from "@/integrations/apify";
import { normalizeFbPost } from "@/pipeline/fbNormalize";
import { ingestNewListings } from "@/pipeline/dedup";
import { ruleFilter } from "@/pipeline/ruleFilter";
import { runJudgeAndNotify } from "@/pipeline/pipeline";
import type { AlertEntry } from "@/pipeline/sentAlerts";
import { loadPreferences } from "@/preferences/store";
import { describeLocalSchedule } from "@/lib/schedule";
import { sendRunSummaryEmail } from "@/integrations/resend";

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
    const payload = {
      ok: true,
      skipped: eventType,
      runId: resource.id,
      localTime,
    };
    await sendRunSummaryEmail({
      job: "Apify scan",
      status: eventType === "ACTOR.RUN.FAILED" ? "error" : "skipped",
      details: payload,
    }).catch((err) => console.error("send Apify summary email failed:", err));
    return NextResponse.json(payload);
  }

  const datasetId = resource.defaultDatasetId;
  if (!datasetId) {
    const payload = {
      ok: false,
      error: "No defaultDatasetId on run",
      runId: resource.id,
      localTime,
    };
    await sendRunSummaryEmail({
      job: "Apify scan",
      status: "error",
      details: payload,
    }).catch((err) => console.error("send Apify summary email failed:", err));
    return NextResponse.json(
      payload,
      { status: 400 },
    );
  }

  const items = await fetchDatasetItems(datasetId);

  const normalized = (
    await Promise.all(items.map((item) => normalizeFbPost(item)))
  ).filter((l): l is NonNullable<typeof l> => l !== null);

  const { inserted, skippedExisting } = await ingestNewListings(normalized);
  const prefs = await loadPreferences();

  let alerted = 0;
  let filtered = 0;
  let skippedByAi = 0;
  let unsure = 0;
  const alerts: AlertEntry[] = [];

  for (const row of inserted) {
    const verdict = ruleFilter(row.listing, prefs);
    if (!verdict.pass) {
      filtered++;
      continue;
    }
    const result = await runJudgeAndNotify({
      listingId: row.id,
      listing: row.listing,
      prefs,
      channels: ["telegram"],
    });
    if (result.outcome === "alert") {
      alerted++;
      if (result.alert) alerts.push(result.alert);
    } else if (result.outcome === "unsure") unsure++;
    else skippedByAi++;
  }

  const payload = {
    ok: true,
    runId: resource.id,
    datasetId,
    received: items.length,
    normalized: normalized.length,
    inserted: inserted.length,
    skippedExisting,
    filtered,
    alerted,
    skippedByAi,
    unsure,
    localTime,
  };
  await sendRunSummaryEmail({
    job: "Apify scan",
    status: "ok",
    details: payload,
    alerts,
  }).catch((err) => console.error("send Apify summary email failed:", err));
  return NextResponse.json(payload);
}
