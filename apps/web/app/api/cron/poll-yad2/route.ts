import { verifyCronRequest } from "@/lib/cronAuth";
import { runYad2PollJob } from "@/jobs/cron";
import { env } from "@/lib/env";
import { withApiLog } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<Response> {
  return withApiLog("cron:yad2", req, async (log) => {
    const authFail = verifyCronRequest(req);
    if (authFail) {
      log.warn("cron auth failed", { status: authFail.status });
      return authFail;
    }
    const enforceSchedule = env().CRON_SCHEDULE_BYPASS !== "true";
    const result = await runYad2PollJob({ enforceSchedule });
    return Response.json(result.payload, { status: result.status });
  });
}
