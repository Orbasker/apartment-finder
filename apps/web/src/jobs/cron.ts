import { fetchYad2Listings, Yad2UpstreamUnavailableError } from "@/scrapers/yad2";
import { ingestNewListings } from "@/pipeline/dedup";
import { ruleFilter } from "@/pipeline/ruleFilter";
import { runJudgeAndNotify } from "@/pipeline/pipeline";
import { loadPreferences } from "@/preferences/store";
import { describeLocalSchedule, shouldRunApifyPoll, shouldRunYad2Poll } from "@/lib/schedule";
import {
  hasAdminSummaryRecipients,
  isResendConfigured,
  sendAdminCostSummaryEmail,
  sendRunSummaryEmail,
} from "@/integrations/resend";
import { getAiUsageSummary } from "@/lib/aiUsage";
import { isApifyConfigured, startFacebookGroupsRun } from "@/integrations/apify";
import { env } from "@/lib/env";

export type JobRunResult = {
  status: number;
  payload: Record<string, unknown>;
};

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
    await sendRunSummaryEmail({
      job: "Yad2 poll",
      status: "skipped",
      details: payload,
    }).catch((err) => console.error("send Yad2 summary email failed:", err));
    return { status: 200, payload };
  }

  try {
    const listings = await fetchYad2Listings();
    const { inserted, skippedExisting } = await ingestNewListings(listings);
    const prefs = await loadPreferences();

    let passed = 0;
    let filtered = 0;
    let alerted = 0;
    let skipped = 0;
    let unsure = 0;

    for (const row of inserted) {
      const verdict = ruleFilter(row.listing, prefs);
      if (!verdict.pass) {
        filtered++;
        continue;
      }
      passed++;
      const outcome = await runJudgeAndNotify({
        listingId: row.id,
        listing: row.listing,
        prefs,
      });
      if (outcome === "alert") alerted++;
      else if (outcome === "unsure") unsure++;
      else skipped++;
    }

    const payload = {
      ok: true,
      fetched: listings.length,
      inserted: inserted.length,
      skippedExisting,
      passed,
      filtered,
      alerted,
      skipped,
      unsure,
      localTime,
      durationMs: Date.now() - startedAt,
    };
    await sendRunSummaryEmail({
      job: "Yad2 poll",
      status: "ok",
      details: payload,
    }).catch((err) => console.error("send Yad2 summary email failed:", err));
    return { status: 200, payload };
  } catch (err) {
    if (err instanceof Yad2UpstreamUnavailableError) {
      console.warn("poll-yad2 skipped:", err.message);
      const payload = {
        ok: true,
        fetched: 0,
        inserted: 0,
        skippedExisting: 0,
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
      await sendRunSummaryEmail({
        job: "Yad2 poll",
        status: "skipped",
        details: payload,
      }).catch((error) => console.error("send Yad2 summary email failed:", error));
      return { status: 200, payload };
    }

    console.error("poll-yad2 failed:", err);
    const payload = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      localTime,
      durationMs: Date.now() - startedAt,
    };
    await sendRunSummaryEmail({
      job: "Yad2 poll",
      status: "error",
      details: payload,
    }).catch((error) => console.error("send Yad2 summary email failed:", error));
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

  const webhookUrl = `${options.origin}/api/webhooks/apify`;

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
