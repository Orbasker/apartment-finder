import { verifyCronRequest } from "@/lib/cronAuth";
import { runAiTopPicksJob } from "@/jobs/cron";
import { withApiLog } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function GET(req: Request): Promise<Response> {
  return withApiLog("cron:ai-top-picks", req, async (log) => {
    const authFail = verifyCronRequest(req);
    if (authFail) {
      log.warn("cron auth failed", { status: authFail.status });
      return authFail;
    }
    const url = new URL(req.url);
    const result = await runAiTopPicksJob({
      hoursAgo: parsePositiveInt(url.searchParams.get("hoursAgo")),
      topN: parsePositiveInt(url.searchParams.get("topN")),
    });
    return Response.json(result.payload, { status: result.status });
  });
}
