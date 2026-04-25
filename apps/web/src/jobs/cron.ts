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
import { DEFAULT_HOURS_AGO, DEFAULT_TOP_PICKS, pickTopListings } from "@/pipeline/topPicks";
import { env } from "@/lib/env";
import { isLoopbackOrigin, resolveAppPublicOrigin } from "@/lib/appOrigin";
import { createLogger, errorMessage, newId, type Logger } from "@/lib/log";

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
  parentLog?: Logger,
): Promise<FanOutStats> {
  const log = parentLog
    ? parentLog.child("fan-out", { job: jobLabel })
    : createLogger("job:fan-out", { run: newId(), job: jobLabel });

  const stats: FanOutStats = {
    perUser: 0,
    passed: 0,
    filtered: 0,
    alerted: 0,
    skipped: 0,
    unsure: 0,
  };
  if (inserted.length === 0) {
    log.info("no listings to fan out");
    return stats;
  }

  const userIds = await getActiveEmailAlertUsers();
  stats.perUser = userIds.length;
  log.info("active email-alert users", {
    users: userIds.length,
    listings: inserted.length,
  });
  if (userIds.length === 0) return stats;

  for (const userId of userIds) {
    const prefs = await loadPreferences(userId);
    const userAlerts: AlertEntry[] = [];
    let userFiltered = 0;
    let userPassed = 0;
    let userAlerted = 0;
    let userSkipped = 0;
    let userUnsure = 0;

    for (const row of inserted) {
      const verdict = ruleFilter(row.listing, prefs);
      if (!verdict.pass) {
        stats.filtered++;
        userFiltered++;
        continue;
      }
      stats.passed++;
      userPassed++;
      const result = await runJudgeAndNotify({
        listingId: row.id,
        listing: row.listing,
        prefs,
        notifyUserId: userId,
        channels: ["email"],
      });
      if (result.outcome === "alert") {
        stats.alerted++;
        userAlerted++;
        if (result.alert) userAlerts.push(result.alert);
      } else if (result.outcome === "unsure") {
        stats.unsure++;
        userUnsure++;
      } else {
        stats.skipped++;
        userSkipped++;
      }
    }

    log.info("per-user summary", {
      user: userId,
      filtered: userFiltered,
      passed: userPassed,
      alerted: userAlerted,
      skipped: userSkipped,
      unsure: userUnsure,
    });

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
      log.error("run summary email failed", {
        user: userId,
        error: errorMessage(err),
      }),
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
  const log = createLogger("job:yad2", { run: newId() });

  if (enforceSchedule && !shouldRunYad2Poll()) {
    log.info("skipped outside schedule", { localTime });
    const payload = {
      ok: true,
      skipped: "Outside Yad2 local schedule window",
      localTime,
    };
    return { status: 200, payload };
  }

  log.info("job started", { localTime, enforceSchedule });

  try {
    const fetchStart = Date.now();
    const listings = await fetchYad2Listings();
    log.info("yad2 fetched", {
      listings: listings.length,
      durationMs: Date.now() - fetchStart,
    });

    const { inserted, skippedExisting } = await ingestNewListings(listings);
    log.info("ingested", {
      inserted: inserted.length,
      skippedExisting,
    });

    const stats = await fanOutToUsers(inserted, "Yad2 poll", log);

    const durationMs = Date.now() - startedAt;
    log.info("job finished", {
      fetched: listings.length,
      inserted: inserted.length,
      skippedExisting,
      notifiedUsers: stats.perUser,
      passed: stats.passed,
      filtered: stats.filtered,
      alerted: stats.alerted,
      skipped: stats.skipped,
      unsure: stats.unsure,
      durationMs,
    });

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
      durationMs,
    };
    return { status: 200, payload };
  } catch (err) {
    if (err instanceof Yad2UpstreamUnavailableError) {
      log.warn("yad2 upstream unavailable", {
        error: err.message,
        status: err.status,
        contentType: err.contentType,
        bodyPreview: err.bodyPreview,
        durationMs: Date.now() - startedAt,
      });
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

    log.error("job failed", {
      error: errorMessage(err),
      durationMs: Date.now() - startedAt,
    });
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
  const log = createLogger("job:apify", { run: newId() });

  if (enforceSchedule && !shouldRunApifyPoll()) {
    log.info("skipped outside schedule");
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
    log.warn("apify not configured");
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
    log.error("APIFY_WEBHOOK_SECRET not set");
    return {
      status: 500,
      payload: { ok: false, error: "APIFY_WEBHOOK_SECRET not set" },
    };
  }

  const origin = resolveAppPublicOrigin(options.origin);
  if (isLoopbackOrigin(origin)) {
    log.error("origin is loopback, apify cannot reach webhook", { origin });
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
  log.info("starting apify run", { webhookUrl });

  try {
    const result = await startFacebookGroupsRun({
      webhookUrl,
      webhookSecret,
    });

    if (!result) {
      log.warn("no monitored groups configured");
      return {
        status: 200,
        payload: {
          ok: true,
          skipped: "No monitored groups configured",
        },
      };
    }

    log.info("apify run started", {
      runId: result.runId,
      groupCount: result.groupCount,
    });
    return { status: 200, payload: { ok: true, ...result } };
  } catch (err) {
    log.error("apify poll failed", { error: errorMessage(err) });
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
  const log = createLogger("job:admin-cost-summary", { run: newId() });
  log.info("job started");

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
    log.warn("resend not configured");
    return {
      status: 200,
      payload: {
        ...payload,
        skipped: "RESEND_API_KEY not configured",
      },
    };
  }

  if (!hasAdminSummaryRecipients()) {
    log.warn("no admin summary recipients");
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
    log.info("summary emailed", {
      totalCalls: summary.totalCalls,
      totalTokens: summary.totalTokens,
      estimatedCostUsd: payload.estimatedCostUsd,
    });
    return { status: 200, payload };
  } catch (err) {
    log.error("summary email failed", { error: errorMessage(err) });
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
  const log = createLogger("job:ai-top-picks", { run: newId() });

  if (!isGatewayConfigured()) {
    log.warn("gateway not configured");
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
  log.info("job started", { users: userIds.length, hoursAgo, topN });

  if (userIds.length === 0) {
    log.info("no top-picks users");
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
      log.info("top picks sent", {
        user: userId,
        candidateCount: result.candidateCount,
        picks: result.picks.length,
      });
      perUser.push({
        userId,
        candidateCount: result.candidateCount,
        picks: result.picks.length,
      });
    } catch (err) {
      log.error("top picks failed for user", {
        user: userId,
        error: errorMessage(err),
      });
      perUser.push({
        userId,
        candidateCount: 0,
        picks: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const durationMs = Date.now() - startedAt;
  log.info("job finished", {
    users: perUser.length,
    durationMs,
    errors: perUser.filter((r) => r.error).length,
  });

  return {
    status: 200,
    payload: {
      ok: true,
      hoursAgo,
      topN,
      users: perUser.length,
      results: perUser,
      durationMs,
    },
  };
}

export { fanOutToUsers };
