import type { NormalizedListing, Preferences } from "@apartment-finder/shared";
import { judgeListing, persistJudgment } from "@/pipeline/judge";
import { summarizeForAlert } from "@/pipeline/summarize";
import { notifyListing } from "@/pipeline/notifier";
import type { AlertChannel, AlertEntry } from "@/pipeline/sentAlerts";
import { isGatewayConfigured } from "@/lib/gateway";
import { createLogger, errorMessage } from "@/lib/log";

const log = createLogger("pipeline:judge");

export type PipelineOutcome = "alert" | "skip" | "unsure" | "error";

export type PipelineResult = {
  outcome: PipelineOutcome;
  alert?: AlertEntry;
};

export type RunArgs = {
  listingId: number;
  listing: NormalizedListing;
  prefs: Preferences;
  /** User to attribute notifications + sent_alerts to — typically the admin. */
  notifyUserId: string;
  channels?: AlertChannel[];
};

export async function runJudgeAndNotify(args: RunArgs): Promise<PipelineResult> {
  if (!isGatewayConfigured()) {
    const alert: AlertEntry = {
      listingId: args.listingId,
      listing: args.listing,
      reason: "Rule filter only (AI gateway not configured)",
    };
    try {
      await notifyListing({ ...alert, userId: args.notifyUserId, channels: args.channels });
      log.info("alerted (no-ai fallback)", {
        listingId: args.listingId,
        user: args.notifyUserId,
      });
      return { outcome: "alert", alert };
    } catch (err) {
      log.error("notify failed (no-ai fallback)", {
        listingId: args.listingId,
        user: args.notifyUserId,
        error: errorMessage(err),
      });
      return { outcome: "error" };
    }
  }

  let judgeResult;
  try {
    judgeResult = await judgeListing(args.listing, args.prefs);
    await persistJudgment(args.listingId, judgeResult);
  } catch (err) {
    log.error("judge failed", {
      listingId: args.listingId,
      error: errorMessage(err),
    });
    return { outcome: "error" };
  }

  const { judgment } = judgeResult;
  const alertThreshold = args.prefs.ai.scoreThreshold;
  const shouldAlert = judgment.decision === "alert" && judgment.score >= alertThreshold;

  if (!shouldAlert) {
    log.debug("judged not alertable", {
      listingId: args.listingId,
      decision: judgment.decision,
      score: judgment.score,
      threshold: alertThreshold,
    });
    return { outcome: judgment.decision === "unsure" ? "unsure" : "skip" };
  }

  let summary: string | undefined;
  try {
    summary = await summarizeForAlert(args.listing, judgment, args.prefs);
  } catch (err) {
    log.warn("summarize failed", {
      listingId: args.listingId,
      error: errorMessage(err),
    });
  }

  const alert: AlertEntry = {
    listingId: args.listingId,
    listing: args.listing,
    summary,
    judgment,
  };

  try {
    await notifyListing({ ...alert, userId: args.notifyUserId, channels: args.channels });
    log.info("alerted", {
      listingId: args.listingId,
      user: args.notifyUserId,
      score: judgment.score,
    });
    return { outcome: "alert", alert };
  } catch (err) {
    log.error("notify failed", {
      listingId: args.listingId,
      user: args.notifyUserId,
      error: errorMessage(err),
    });
    return { outcome: "error" };
  }
}
