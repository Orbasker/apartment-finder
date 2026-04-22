import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  runAdminCostSummaryJob,
  runAiTopPicksJob,
  runApifyPollJob,
  runYad2PollJob,
} from "@/jobs/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z.object({
  job: z.enum(["yad2", "apify", "adminCostSummary", "aiTopPicks"]),
});

type JobId = z.infer<typeof BodySchema>["job"];

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { job } = parsed.data;

  try {
    const result = await runJob(job);
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
    const message = err instanceof Error ? err.message : "Job failed";
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
  const isLocal =
    hostLower === "localhost" ||
    hostLower === "127.0.0.1" ||
    hostLower === "::1";
  const proto =
    requestHeaders.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

function summarizeJobResult(
  job: JobId,
  payload: Record<string, unknown>,
): string {
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
  return new Intl.NumberFormat("en-US").format(
    typeof value === "number" ? value : 0,
  );
}

function formatUsd(value: unknown): string {
  return typeof value === "number" ? value.toFixed(value >= 1 ? 2 : 4) : "0.00";
}
