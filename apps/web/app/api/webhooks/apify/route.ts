import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { withApiLog } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ApifyWebhookBody = z.object({
  eventType: z.string(),
  resource: z.object({
    id: z.string(),
    defaultDatasetId: z.string().optional(),
  }),
});

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

    log.info("apify webhook received (ingestion rebuild in progress)", {
      runId: parsed.data.resource.id,
      eventType: parsed.data.eventType,
    });

    return NextResponse.json({
      ok: true,
      runId: parsed.data.resource.id,
      note: "ingestion pipeline rebuild in progress",
    });
  });
}
