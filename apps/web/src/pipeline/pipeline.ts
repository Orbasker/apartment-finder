import type { NormalizedListing, Preferences } from "@apartment-finder/shared";
import { judgeListing, persistJudgment } from "@/pipeline/judge";
import { summarizeForAlert } from "@/pipeline/summarize";
import { notifyListing } from "@/pipeline/notifier";
import { isGatewayConfigured } from "@/lib/gateway";

export type PipelineOutcome = "alert" | "skip" | "unsure" | "error";

export type RunArgs = {
  listingId: number;
  listing: NormalizedListing;
  prefs: Preferences;
};

export async function runJudgeAndNotify(args: RunArgs): Promise<PipelineOutcome> {
  if (!isGatewayConfigured()) {
    try {
      await notifyListing({
        listingId: args.listingId,
        listing: args.listing,
        reason: "Rule filter only (AI gateway not configured)",
      });
      return "alert";
    } catch (err) {
      console.error("notify failed:", err);
      return "error";
    }
  }

  let judgeResult;
  try {
    judgeResult = await judgeListing(args.listing, args.prefs);
    await persistJudgment(args.listingId, judgeResult);
  } catch (err) {
    console.error(`judge failed for listing ${args.listingId}:`, err);
    return "error";
  }

  const { judgment } = judgeResult;
  const alertThreshold = args.prefs.ai.scoreThreshold;
  const shouldAlert =
    judgment.decision === "alert" && judgment.score >= alertThreshold;

  if (!shouldAlert) {
    return judgment.decision === "unsure" ? "unsure" : "skip";
  }

  let summary: string | undefined;
  try {
    summary = await summarizeForAlert(args.listing, judgment, args.prefs);
  } catch (err) {
    console.warn(`summarize failed for listing ${args.listingId}:`, err);
  }

  try {
    await notifyListing({
      listingId: args.listingId,
      listing: args.listing,
      summary,
      judgment,
    });
    return "alert";
  } catch (err) {
    console.error(`notify failed for listing ${args.listingId}:`, err);
    return "error";
  }
}
