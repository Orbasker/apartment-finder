import { fetchYad2Listings, Yad2UpstreamUnavailableError } from "@/scrapers/yad2";
import { ingestNewListings } from "@/pipeline/dedup";
import { ruleFilter } from "@/pipeline/ruleFilter";
import { runJudgeAndNotify } from "@/pipeline/pipeline";
import { loadPreferences } from "@/preferences/store";
import { verifyCronRequest } from "@/lib/cronAuth";
import { describeLocalSchedule, shouldRunYad2Poll } from "@/lib/schedule";
import { sendRunSummaryEmail } from "@/integrations/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const authFail = verifyCronRequest(req);
  if (authFail) return authFail;

  const startedAt = Date.now();
  const localTime = describeLocalSchedule();

  if (!shouldRunYad2Poll()) {
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
    return Response.json(payload);
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
    return Response.json(payload);
  } catch (err) {
    if (err instanceof Yad2UpstreamUnavailableError) {
      console.warn("poll-yad2 skipped:", err.message);
      return Response.json({
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
        durationMs: Date.now() - startedAt,
      });
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
    return Response.json(
      payload,
      { status: 500 },
    );
  }
}
