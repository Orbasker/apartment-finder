import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isAdmin } from "@/lib/supabase/server";
import {
  runAdminCostSummaryJob,
  runAiTopPicksJob,
  runApifyPollJob,
  runYad2PollJob,
} from "@/jobs/cron";
import { withApiLog, errorMessage } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z.object({
  job: z.enum(["yad2", "apify", "adminCostSummary", "aiTopPicks"]),
});

type JobId = z.infer<typeof BodySchema>["job"];

export async function POST(req: Request): Promise<Response> {
  return withApiLog("dashboard:run-job", req, async (log) => {
    const user = await getCurrentUser();
    if (!user) {
      log.warn("unauthenticated");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdmin(user)) {
      log.warn("non-admin tried to run job", { user: user.id });
      return NextResponse.json(
        { error: "Only admins can trigger data collection runs" },
        { status: 403 },
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      log.warn("invalid body", { user: user.id });
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { job } = parsed.data;
    log.info("admin job triggered", { user: user.id, job });

    try {
      const result = await runJob(job);
      log.info("admin job finished", {
        user: user.id,
        job,
        status: result.status,
        ok: result.status < 400 && result.payload.ok !== false,
      });
      return NextResponse.json(
        {
          job,
          ok: result.status < 400 && result.payload.ok !== false,
          status: result.status,
          summary: summarizeJobResult(job, result.payload),
          payload: result.payload,
        },
        { status: 200 },
      );
    } catch (err) {
      const message = errorMessage(err);
      log.error("admin job threw", { user: user.id, job, error: message });
      return NextResponse.json(
        {
          job,
          ok: false,
          status: 500,
          summary: message,
          payload: { ok: false, error: message },
        },
        { status: 200 },
      );
    }
  });
}

async function runJob(job: JobId) {
  switch (job) {
    case "yad2":
      return runYad2PollJob({ enforceSchedule: false });
    case "apify":
      return runApifyPollJob({
        origin: await getRequestOrigin(),
        enforceSchedule: false,
      });
    case "adminCostSummary":
      return runAdminCostSummaryJob();
    case "aiTopPicks":
      return runAiTopPicksJob();
  }
}

async function getRequestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) {
    throw new Error("Could not determine app origin");
  }
  const hostLower = host.split(":")[0]?.toLowerCase() ?? host.toLowerCase();
  const isLocal = hostLower === "localhost" || hostLower === "127.0.0.1" || hostLower === "::1";
  const proto = requestHeaders.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

function summarizeJobResult(job: JobId, payload: Record<string, unknown>): string {
  if (typeof payload.skipped === "string") {
    return `Skipped: ${payload.skipped}`;
  }
  if (typeof payload.error === "string") {
    return payload.error;
  }

  switch (job) {
    case "yad2":
      return [
        `Fetched ${formatNumber(payload.fetched)} listings`,
        `inserted ${formatNumber(payload.inserted)}`,
        `alerted ${formatNumber(payload.alerted)}`,
      ].join(", ");
    case "apify":
      return typeof payload.runId === "string"
        ? `Started Apify run ${payload.runId} for ${formatNumber(payload.groupCount)} groups`
        : "Apify job completed";
    case "adminCostSummary":
      return [
        `Summary sent for ${formatNumber(payload.totalCalls)} AI calls`,
        `${formatNumber(payload.totalTokens)} tokens`,
        `$${formatUsd(payload.estimatedCostUsd)}`,
      ].join(", ");
    case "aiTopPicks":
      return [
        `Scanned ${formatNumber(payload.candidateCount)} recent listings`,
        `picked ${formatNumber(payload.picksReturned)} of ${formatNumber(payload.topN)}`,
      ].join(", ");
  }
}

function formatNumber(value: unknown): string {
  return new Intl.NumberFormat("en-US").format(typeof value === "number" ? value : 0);
}

function formatUsd(value: unknown): string {
  return typeof value === "number" ? value.toFixed(value >= 1 ? 2 : 4) : "0.00";
}
