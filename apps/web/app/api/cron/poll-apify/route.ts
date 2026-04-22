import { verifyCronRequest } from "@/lib/cronAuth";
import { runApifyPollJob } from "@/jobs/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const authFail = verifyCronRequest(req);
  if (authFail) return authFail;
  const origin = new URL(req.url).origin;
  const result = await runApifyPollJob({ origin, enforceSchedule: true });
  return Response.json(result.payload, { status: result.status });
}
