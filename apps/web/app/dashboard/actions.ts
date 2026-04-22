"use server";

import { headers } from "next/headers";
import { getCurrentUser, isAdmin } from "@/lib/supabase/server";
import {
  runAdminCostSummaryJob,
  runApifyPollJob,
  runYad2PollJob,
} from "@/jobs/cron";

export type DashboardJobId = "yad2" | "apify" | "adminCostSummary";

export type DashboardJobActionResult = {
  job: DashboardJobId;
  ok: boolean;
  status: number;
  summary: string;
  payload: Record<string, unknown>;
};

export async function runDashboardJobAction(
  job: DashboardJobId,
): Promise<DashboardJobActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  if (!isAdmin(user)) {
    throw new Error("Only admins can trigger data collection runs");
  }

  const result = await runJob(job);

  return {
    job,
    ok: result.status < 400 && result.payload.ok !== false,
    status: result.status,
    summary: summarizeJobResult(job, result.payload),
    payload: result.payload,
  };
}

async function runJob(job: DashboardJobId) {
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
  }
}

async function getRequestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) {
    throw new Error("Could not determine app origin");
  }
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

function summarizeJobResult(
  job: DashboardJobId,
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
