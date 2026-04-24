import { NextResponse } from "next/server";
import {
  EXTENSION_INGEST_HEADER,
  ExtensionIngestPayloadSchema,
  type ExtensionScrapedPost,
} from "@apartment-finder/shared";
import { env } from "@/lib/env";
import { normalizeFbPost } from "@/pipeline/fbNormalize";
import { ingestNewListings } from "@/pipeline/dedup";
import { fanOutToUsers } from "@/jobs/cron";
import { withApiLog } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  return withApiLog("webhooks:extension", req, async (log) => {
    const expected = env().EXTENSION_INGEST_SECRET;
    if (!expected) {
      log.error("EXTENSION_INGEST_SECRET not set");
      return NextResponse.json(
        { ok: false, error: "EXTENSION_INGEST_SECRET not set" },
        { status: 500 },
      );
    }
    const given = req.headers.get(EXTENSION_INGEST_HEADER);
    if (given !== expected) {
      log.warn("unauthorized", { hasHeader: given != null });
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json().catch(() => null);
    const parsed = ExtensionIngestPayloadSchema.safeParse(json);
    if (!parsed.success) {
      log.warn("invalid payload");
      return NextResponse.json(
        { ok: false, error: "Invalid payload", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    log.info("payload received", { posts: parsed.data.posts.length });

    const normalized = (
      await Promise.all(
        parsed.data.posts.map((p) =>
          normalizeFbPost(toApifyShape(p), { source: "fb_ext" }),
        ),
      )
    ).filter((l): l is NonNullable<typeof l> => l !== null);

    log.info("posts normalized", {
      normalized: normalized.length,
      droppedAsUnusable: parsed.data.posts.length - normalized.length,
    });

    const { inserted, skippedExisting } = await ingestNewListings(normalized);
    log.info("ingested", {
      inserted: inserted.length,
      skippedExisting,
    });

    const stats = await fanOutToUsers(inserted, "Extension upload");

    log.info("fan-out complete", {
      notifiedUsers: stats.perUser,
      passed: stats.passed,
      filtered: stats.filtered,
      alerted: stats.alerted,
      skippedByAi: stats.skipped,
      unsure: stats.unsure,
    });

    return NextResponse.json({
      ok: true,
      received: parsed.data.posts.length,
      normalized: normalized.length,
      inserted: inserted.length,
      skippedExisting,
      notifiedUsers: stats.perUser,
      filtered: stats.filtered,
      alerted: stats.alerted,
      skippedByAi: stats.skipped,
      unsure: stats.unsure,
    });
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
