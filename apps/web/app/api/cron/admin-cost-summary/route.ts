import { verifyCronRequest } from "@/lib/cronAuth";
import { runAdminCostSummaryJob } from "@/jobs/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const authFail = verifyCronRequest(req);
  if (authFail) return authFail;
  const result = await runAdminCostSummaryJob();
  return Response.json(result.payload, { status: result.status });
}
