import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { fetchDatasetItems } from "@/integrations/apify";
import { normalizeFbPost } from "@/pipeline/fbNormalize";
import { ingestNewListings } from "@/pipeline/dedup";
import { ruleFilter } from "@/pipeline/ruleFilter";
import { runJudgeAndNotify } from "@/pipeline/pipeline";
import { loadPreferences } from "@/preferences/store";

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
    return NextResponse.json({ ok: true, skipped: eventType });
  }

  const datasetId = resource.defaultDatasetId;
  if (!datasetId) {
    return NextResponse.json(
      { ok: false, error: "No defaultDatasetId on run" },
      { status: 400 },
    );
  }

  const items = await fetchDatasetItems(datasetId);

  const normalized = (await Promise.all(items.map(normalizeFbPost))).filter(
    (l): l is NonNullable<typeof l> => l !== null,
  );

  const { inserted, skippedExisting } = await ingestNewListings(normalized);
  const prefs = await loadPreferences();

  let alerted = 0;
  let filtered = 0;
  let skippedByAi = 0;
  let unsure = 0;

  for (const row of inserted) {
    const verdict = ruleFilter(row.listing, prefs);
    if (!verdict.pass) {
      filtered++;
      continue;
    }
    const outcome = await runJudgeAndNotify({
      listingId: row.id,
      listing: row.listing,
      prefs,
    });
    if (outcome === "alert") alerted++;
    else if (outcome === "unsure") unsure++;
    else skippedByAi++;
  }

  return NextResponse.json({
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
  });
}
