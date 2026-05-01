import { verifyCronRequest } from "@/lib/cronAuth";
import { runApifyPollJob } from "@/jobs/cron";
import { env } from "@/lib/env";
import { withApiLog } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<Response> {
  return withApiLog("cron:apify", req, async (log) => {
    const authFail = verifyCronRequest(req);
    if (authFail) {
      log.warn("cron auth failed", { status: authFail.status });
      return authFail;
    }
    const origin = new URL(req.url).origin;
    const enforceSchedule = env().CRON_SCHEDULE_BYPASS !== "true";
    const result = await runApifyPollJob({ origin, enforceSchedule });
    return Response.json(result.payload, { status: result.status });
  });
}
