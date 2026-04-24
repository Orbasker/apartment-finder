import { verifyCronRequest } from "@/lib/cronAuth";
import { runAdminCostSummaryJob } from "@/jobs/cron";
import { withApiLog } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  return withApiLog("cron:admin-cost-summary", req, async (log) => {
    const authFail = verifyCronRequest(req);
    if (authFail) {
      log.warn("cron auth failed", { status: authFail.status });
      return authFail;
    }
    const result = await runAdminCostSummaryJob();
    return Response.json(result.payload, { status: result.status });
  });
}
