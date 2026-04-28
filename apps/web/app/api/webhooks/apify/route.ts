import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { withApiLog } from "@/lib/log";
import { fetchDatasetItems } from "@/integrations/apify";
import { bulkInsertListings, type CollectedListing } from "@/ingestion/insert";
import { processListing } from "@/ingestion/pipeline";
import { contentHash } from "@/lib/contentHash";

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

const PROCESS_CONCURRENCY = 4;

const FbPost = z
  .object({
    postId: z.string().optional(),
    facebookId: z.string().optional(),
    legacyId: z.string().optional(),
    url: z.string().url().optional(),
    text: z.string().optional(),
    user: z
      .object({
        id: z.string().optional(),
        name: z.string().optional(),
        profileUrl: z.string().url().optional(),
      })
      .optional(),
    time: z.string().optional(),
    sourceUrl: z.string().url().optional(),
  })
  .passthrough();

export async function POST(req: Request): Promise<Response> {
  return withApiLog("webhooks:apify", req, async (log) => {
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
    log.info("webhook received", { runId: resource.id, eventType });
    if (eventType !== "ACTOR.RUN.SUCCEEDED" || !resource.defaultDatasetId) {
      return NextResponse.json({
        ok: true,
        runId: resource.id,
        skipped: eventType !== "ACTOR.RUN.SUCCEEDED" ? eventType : "no_dataset_id",
      });
    }

    const items = await fetchDatasetItems(resource.defaultDatasetId);
    log.info("dataset fetched", { runId: resource.id, items: items.length });

    const collected = items
      .map((raw) => apifyPostToCollected(raw))
      .filter((row): row is CollectedListing => row !== null);

    const { inserted, skippedExisting } = await bulkInsertListings(collected);
    log.info("ingested", { inserted: inserted.length, skippedExisting });

    const stats = { processed: 0, unified: 0, failed: 0, alertsSent: 0 };
    for (let i = 0; i < inserted.length; i += PROCESS_CONCURRENCY) {
      const slice = inserted.slice(i, i + PROCESS_CONCURRENCY);
      const results = await Promise.allSettled(slice.map((row) => processListing(row.id)));
      for (const r of results) {
        stats.processed++;
        if (r.status === "fulfilled") {
          if (r.value.status === "unified") stats.unified++;
          else if (r.value.status === "failed") stats.failed++;
          stats.alertsSent += r.value.alertsSent ?? 0;
        } else {
          stats.failed++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      runId: resource.id,
      received: items.length,
      normalized: collected.length,
      inserted: inserted.length,
      skippedExisting,
      ...stats,
    });
  });
}

function apifyPostToCollected(raw: unknown): CollectedListing | null {
  const parsed = FbPost.safeParse(raw);
  if (!parsed.success) return null;
  const post = parsed.data;
  const sourceId = post.postId ?? post.facebookId ?? post.legacyId ?? null;
  if (!sourceId || !post.url) return null;
  const text = (post.text ?? "").trim();
  if (text.length === 0) return null;
  const postedAt = post.time ? new Date(post.time) : null;
  return {
    source: "facebook",
    sourceId,
    url: post.url,
    rawText: text,
    rawJson: post,
    contentHash: contentHash({ id: sourceId, text }),
    postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
    authorName: post.user?.name ?? null,
    authorProfile: post.user?.profileUrl ?? null,
    sourceGroupUrl: post.sourceUrl ?? null,
  };
}
