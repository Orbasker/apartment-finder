import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { verifyRequest, ingestRawQueue } from "@apartment-finder/queue";
import { getDb } from "@/db";
import { collectionRuns } from "@/db/schema";
import { withApiLog } from "@/lib/log";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WebhookBodyBase = z.object({
  runId: z.string().min(1),
  source: z.enum(["yad2", "facebook"]),
});

const WebhookBody = z.discriminatedUnion("status", [
  WebhookBodyBase.extend({
    status: z.literal("ok"),
    receivedCount: z.number().int().optional(),
    blobUrl: z.string().url(),
  }),
  WebhookBodyBase.extend({
    status: z.literal("error"),
    receivedCount: z.number().int().optional(),
    error: z.string(),
  }),
]);

export async function POST(req: Request): Promise<Response> {
  return withApiLog("collectors:webhook", req, async (log) => {
    const signature = req.headers.get("x-signature");
    const timestamp = req.headers.get("x-timestamp");

    if (!signature || !timestamp) {
      return NextResponse.json(
        { ok: false, error: "Missing X-Signature or X-Timestamp" },
        { status: 400 },
      );
    }

    const body = await req.text();
    const secret = env().COLLECTOR_WEBHOOK_SECRET;
    if (!secret) {
      return NextResponse.json(
        { ok: false, error: "COLLECTOR_WEBHOOK_SECRET not set" },
        { status: 500 },
      );
    }

    const valid = verifyRequest({ body, signature, timestamp, secret });
    if (!valid) {
      log.warn("invalid signature or stale timestamp");
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON payload" },
        { status: 400 },
      );
    }
    const parsed = WebhookBody.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid payload", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = parsed.data;
    log.info("webhook received", { runId: data.runId, source: data.source, status: data.status });

    const db = getDb();

    if (data.status === "error") {
      await db
        .update(collectionRuns)
        .set({
          status: "failed",
          error: data.error ?? "unknown error",
          failed: data.receivedCount ?? 0,
        })
        .where(eq(collectionRuns.runId, data.runId));
      return NextResponse.json({ ok: true, recorded: "error" });
    }

    // Idempotency anchor: UPDATE ... WHERE webhookReceivedAt IS NULL RETURNING id
    // Returns 0 rows on replay → no double-enqueue
    const updated = await db
      .update(collectionRuns)
      .set({
        webhookReceivedAt: new Date(),
        rawBlobUrl: data.blobUrl,
        status: "ingesting",
        receivedCount: data.receivedCount ?? 0,
      })
      .where(and(eq(collectionRuns.runId, data.runId), isNull(collectionRuns.webhookReceivedAt)))
      .returning({ id: collectionRuns.id });

    if (updated.length === 0) {
      log.info("replay detected, skipping", { runId: data.runId });
      return NextResponse.json({ ok: true, idempotent: true });
    }

    await ingestRawQueue.add(
      "ingest-raw",
      { runId: data.runId, source: data.source, blobUrl: data.blobUrl },
      { attempts: 5, backoff: { type: "exponential", delay: 10_000 } },
    );

    log.info("ingest-raw enqueued", { runId: data.runId });
    return NextResponse.json({ ok: true, runId: data.runId, queued: true });
  });
}
