import { NextResponse } from "next/server";
import { isApifyConfigured, startFacebookGroupsRun } from "@/integrations/apify";
import { verifyCronRequest } from "@/lib/cronAuth";
import { env } from "@/lib/env";
import { describeLocalSchedule, shouldRunApifyPoll } from "@/lib/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const authFail = verifyCronRequest(req);
  if (authFail) return authFail;

  if (!shouldRunApifyPoll()) {
    return NextResponse.json({
      ok: true,
      skipped: "Outside Apify local schedule window",
      localTime: describeLocalSchedule(),
    });
  }

  if (!isApifyConfigured()) {
    return NextResponse.json({
      ok: false,
      skipped: "APIFY_TOKEN not set",
    });
  }

  const webhookSecret = env().APIFY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { ok: false, error: "APIFY_WEBHOOK_SECRET not set" },
      { status: 500 },
    );
  }

  const origin = new URL(req.url).origin;
  const webhookUrl = `${origin}/api/webhooks/apify`;

  try {
    const result = await startFacebookGroupsRun({
      webhookUrl,
      webhookSecret,
    });

    if (!result) {
      return NextResponse.json({
        ok: true,
        skipped: "No monitored groups configured",
      });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("poll-apify failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
