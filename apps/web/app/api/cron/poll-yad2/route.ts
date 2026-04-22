import { fetchYad2Listings } from "@/scrapers/yad2";
import { ingestNewListings } from "@/pipeline/dedup";
import { ruleFilter } from "@/pipeline/ruleFilter";
import { runJudgeAndNotify } from "@/pipeline/pipeline";
import { loadPreferences } from "@/preferences/store";
import { verifyCronRequest } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const authFail = verifyCronRequest(req);
  if (authFail) return authFail;

  const startedAt = Date.now();

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

    return Response.json({
      ok: true,
      fetched: listings.length,
      inserted: inserted.length,
      skippedExisting,
      passed,
      filtered,
      alerted,
      skipped,
      unsure,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("poll-yad2 failed:", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
