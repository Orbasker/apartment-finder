import { verifyCronRequest } from "@/lib/cronAuth";
import { runSeedNeighborhoodsJob } from "@/jobs/seedNeighborhoods";
import { withApiLog } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request): Promise<Response> {
  return withApiLog("cron:seed-neighborhoods", req, async (log) => {
    const authFail = verifyCronRequest(req);
    if (authFail) {
      log.warn("cron auth failed", { status: authFail.status });
      return authFail;
    }
    const result = await runSeedNeighborhoodsJob();
    return Response.json(result.payload, { status: result.status });
  });
}
