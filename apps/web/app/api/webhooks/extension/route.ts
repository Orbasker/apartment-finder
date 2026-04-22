import { NextResponse } from "next/server";
import {
  EXTENSION_INGEST_HEADER,
  ExtensionIngestPayloadSchema,
  type ExtensionScrapedPost,
} from "@apartment-finder/shared";
import { env } from "@/lib/env";
import { normalizeFbPost } from "@/pipeline/fbNormalize";
import { ingestNewListings } from "@/pipeline/dedup";
import { ruleFilter } from "@/pipeline/ruleFilter";
import { runJudgeAndNotify } from "@/pipeline/pipeline";
import { loadPreferences } from "@/preferences/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  const expected = env().EXTENSION_INGEST_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "EXTENSION_INGEST_SECRET not set" },
      { status: 500 },
    );
  }
  const given = req.headers.get(EXTENSION_INGEST_HEADER);
  if (given !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = ExtensionIngestPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const normalized = (
    await Promise.all(
      parsed.data.posts.map((p) =>
        normalizeFbPost(toApifyShape(p), { source: "fb_ext" }),
      ),
    )
  ).filter((l): l is NonNullable<typeof l> => l !== null);

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
    received: parsed.data.posts.length,
    normalized: normalized.length,
    inserted: inserted.length,
    skippedExisting,
    filtered,
    alerted,
    skippedByAi,
    unsure,
  });
}

function toApifyShape(p: ExtensionScrapedPost): Record<string, unknown> {
  return {
    postId: p.postId,
    facebookUrl: p.permalink,
    text: p.text,
    time: p.timestampIso ?? undefined,
    groupUrl: p.groupUrl ?? undefined,
    user: {
      name: p.authorName ?? undefined,
      profileUrl: p.authorUrl ?? undefined,
    },
  };
}
