import { fetchYad2Listings, Yad2UpstreamUnavailableError } from "@/scrapers/yad2";
import { ingestNewListings, type InsertedListing } from "@/pipeline/dedup";
import { ruleFilter } from "@/pipeline/ruleFilter";
import { runJudgeAndNotify } from "@/pipeline/pipeline";
import type { AlertEntry } from "@/pipeline/sentAlerts";
import {
  getActiveEmailAlertUsers,
  getActiveTopPicksUsers,
  loadPreferences,
} from "@/preferences/store";
import { describeLocalSchedule, shouldRunApifyPoll, shouldRunYad2Poll } from "@/lib/schedule";
import {
  hasAdminSummaryRecipients,
  isResendConfigured,
  sendAdminCostSummaryEmail,
  sendRunSummaryEmail,
  sendTopPicksEmail,
} from "@/integrations/resend";
import { getAiUsageSummary } from "@/lib/aiUsage";
import { isApifyConfigured, startFacebookGroupsRun } from "@/integrations/apify";
import { isGatewayConfigured } from "@/lib/gateway";
import {
  DEFAULT_HOURS_AGO,
  DEFAULT_TOP_PICKS,
  pickTopListings,
} from "@/pipeline/topPicks";
import { env } from "@/lib/env";
import { isLoopbackOrigin, resolveAppPublicOrigin } from "@/lib/appOrigin";

export type JobRunResult = {
  status: number;
  payload: Record<string, unknown>;
};

type FanOutStats = {
  perUser: number;
  passed: number;
  filtered: number;
  alerted: number;
  skipped: number;
  unsure: number;
};

async function fanOutToUsers(
  inserted: InsertedListing[],
  jobLabel: string,
): Promise<FanOutStats> {
  const stats: FanOutStats = {
    perUser: 0,
    passed: 0,
    filtered: 0,
    alerted: 0,
    skipped: 0,
    unsure: 0,
  };
  if (inserted.length === 0) return stats;

  const userIds = await getActiveEmailAlertUsers();
  stats.perUser = userIds.length;
  if (userIds.length === 0) return stats;

  for (const userId of userIds) {
    const prefs = await loadPreferences(userId);
    const userAlerts: AlertEntry[] = [];

    for (const row of inserted) {
      const verdict = ruleFilter(row.listing, prefs);
      if (!verdict.pass) {
        stats.filtered++;
        continue;
      }
      stats.passed++;
      const result = await runJudgeAndNotify({
        listingId: row.id,
        listing: row.listing,
        prefs,
        notifyUserId: userId,
        channels: ["email"],
      });
      if (result.outcome === "alert") {
        stats.alerted++;
        if (result.alert) userAlerts.push(result.alert);
      } else if (result.outcome === "unsure") stats.unsure++;
      else stats.skipped++;
    }

    await sendRunSummaryEmail({
      userId,
      job: jobLabel,
      status: "ok",
      details: {
        candidates: inserted.length,
        alertsForYou: userAlerts.length,
      },
      alerts: userAlerts,
    }).catch((err) =>
      console.error(`send ${jobLabel} summary email for user ${userId} failed:`, err),
    );
  }
  return stats;
}

export async function runYad2PollJob(options?: {
  enforceSchedule?: boolean;
}): Promise<JobRunResult> {
  const startedAt = Date.now();
  const localTime = describeLocalSchedule();
  const enforceSchedule = options?.enforceSchedule ?? true;

  if (enforceSchedule && !shouldRunYad2Poll()) {
    const payload = {
      ok: true,
      skipped: "Outside Yad2 local schedule window",
      localTime,
    };
    return { status: 200, payload };
  }

  try {
    const listings = await fetchYad2Listings();
    const { inserted, skippedExisting } = await ingestNewListings(listings);
    const stats = await fanOutToUsers(inserted, "Yad2 poll");

    const payload = {
      ok: true,
      fetched: listings.length,
      inserted: inserted.length,
      skippedExisting,
      notifiedUsers: stats.perUser,
      passed: stats.passed,
      filtered: stats.filtered,
      alerted: stats.alerted,
      skipped: stats.skipped,
      unsure: stats.unsure,
      localTime,
      durationMs: Date.now() - startedAt,
    };
    return { status: 200, payload };
  } catch (err) {
    if (err instanceof Yad2UpstreamUnavailableError) {
      console.warn("poll-yad2 skipped:", err.message);
      const payload = {
        ok: true,
        fetched: 0,
        inserted: 0,
        skippedExisting: 0,
        notifiedUsers: 0,
        passed: 0,
        filtered: 0,
        alerted: 0,
        skipped: 0,
        unsure: 0,
        upstreamStatus: "unavailable",
        upstreamError: err.message,
        localTime,
        durationMs: Date.now() - startedAt,
      };
      return { status: 200, payload };
    }

    console.error("poll-yad2 failed:", err);
    const payload = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      localTime,
      durationMs: Date.now() - startedAt,
    };
    return { status: 500, payload };
  }
}

export async function runApifyPollJob(options: {
  origin: string;
  enforceSchedule?: boolean;
}): Promise<JobRunResult> {
  const enforceSchedule = options.enforceSchedule ?? true;

  if (enforceSchedule && !shouldRunApifyPoll()) {
    return {
      status: 200,
      payload: {
        ok: true,
        skipped: "Outside Apify local schedule window",
        localTime: describeLocalSchedule(),
      },
    };
  }

  if (!isApifyConfigured()) {
    return {
      status: 200,
      payload: {
        ok: false,
        skipped: "APIFY_TOKEN not set",
      },
    };
  }

  const webhookSecret = env().APIFY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return {
      status: 500,
      payload: { ok: false, error: "APIFY_WEBHOOK_SECRET not set" },
    };
  }

  const origin = resolveAppPublicOrigin(options.origin);
  if (isLoopbackOrigin(origin)) {
    return {
      status: 400,
      payload: {
        ok: false,
        error:
          "Apify cannot call webhooks on localhost. Set APP_PUBLIC_ORIGIN in .env to a public https origin (your Vercel URL, or a tunnel like ngrok pointing at this dev server).",
      },
    };
  }

  const webhookUrl = new URL("/api/webhooks/apify", origin).toString();

  try {
    const result = await startFacebookGroupsRun({
      webhookUrl,
      webhookSecret,
    });

    if (!result) {
      return {
        status: 200,
        payload: {
          ok: true,
          skipped: "No monitored groups configured",
        },
      };
    }

    return { status: 200, payload: { ok: true, ...result } };
  } catch (err) {
    console.error("poll-apify failed:", err);
    return {
      status: 500,
      payload: {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function runAdminCostSummaryJob(): Promise<JobRunResult> {
  const summary = await getAiUsageSummary(24);
  const payload = {
    ok: true,
    hoursAgo: summary.hoursAgo,
    totalCalls: summary.totalCalls,
    totalTokens: summary.totalTokens,
    estimatedCostUsd: Number(summary.estimatedCostUsd.toFixed(6)),
    unpricedCalls: summary.unpricedCalls,
  };

  if (!isResendConfigured()) {
    return {
      status: 200,
      payload: {
        ...payload,
        skipped: "RESEND_API_KEY not configured",
      },
    };
  }

  if (!hasAdminSummaryRecipients()) {
    return {
      status: 200,
      payload: {
        ...payload,
        skipped: "ADMIN_SUMMARY_EMAILS not configured",
      },
    };
  }

  try {
    await sendAdminCostSummaryEmail(summary);
    return { status: 200, payload };
  } catch (err) {
    console.error("send admin cost summary email failed:", err);
    return {
      status: 500,
      payload: {
        ...payload,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function runAiTopPicksJob(options?: {
  hoursAgo?: number;
  topN?: number;
}): Promise<JobRunResult> {
  const startedAt = Date.now();
  const hoursAgo = options?.hoursAgo ?? DEFAULT_HOURS_AGO;
  const topN = options?.topN ?? DEFAULT_TOP_PICKS;

  if (!isGatewayConfigured()) {
    return {
      status: 200,
      payload: {
        ok: false,
        skipped: "AI_GATEWAY_API_KEY not set",
        hoursAgo,
        topN,
      },
    };
  }

  const userIds = await getActiveTopPicksUsers();
  if (userIds.length === 0) {
    return {
      status: 200,
      payload: {
        ok: true,
        skipped: "No users have opted into top-picks emails",
        hoursAgo,
        topN,
      },
    };
  }

  const perUser: Array<{
    userId: string;
    candidateCount: number;
    picks: number;
    error?: string;
  }> = [];

  for (const userId of userIds) {
    try {
      const prefs = await loadPreferences(userId);
      const result = await pickTopListings({ prefs, hoursAgo, topN });
      await sendTopPicksEmail({
        userId,
        picks: result.picks,
        summary: result.summary,
        hoursAgo: result.hoursAgo,
        candidateCount: result.candidateCount,
      });
      perUser.push({
        userId,
        candidateCount: result.candidateCount,
        picks: result.picks.length,
      });
    } catch (err) {
      console.error(`ai-top-picks failed for user ${userId}:`, err);
      perUser.push({
        userId,
        candidateCount: 0,
        picks: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    status: 200,
    payload: {
      ok: true,
      hoursAgo,
      topN,
      users: perUser.length,
      results: perUser,
      durationMs: Date.now() - startedAt,
    },
  };
}

export { fanOutToUsers };
