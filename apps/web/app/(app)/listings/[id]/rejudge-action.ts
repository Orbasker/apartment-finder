"use server";

import { revalidatePath } from "next/cache";
import type { NormalizedListing } from "@apartment-finder/shared";
import { getCurrentUser } from "@/lib/supabase/server";
import { getListingById } from "@/listings/queries";
import { isGatewayConfigured } from "@/lib/gateway";
import { judgeListing, persistJudgment } from "@/pipeline/judge";
import { loadPreferences } from "@/preferences/store";

export type RejudgeResult =
  | {
      ok: true;
      score: number;
      decision: "alert" | "skip" | "unsure";
      reasoning: string;
      escalated: boolean;
      model: string;
    }
  | { ok: false; error: string };

export async function rejudgeListingAction(
  listingId: number,
): Promise<RejudgeResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  if (!isGatewayConfigured()) {
    return { ok: false, error: "AI_GATEWAY_API_KEY not set" };
  }

  const row = await getListingById(listingId, user.id);
  if (!row) return { ok: false, error: "Listing not found" };

  const listing: NormalizedListing = {
    source: row.source as NormalizedListing["source"],
    sourceId: row.sourceId,
    url: row.url,
    title: row.title,
    description: row.description,
    priceNis: row.priceNis,
    rooms: row.rooms,
    sqm: row.sqm,
    floor: row.floor,
    neighborhood: row.neighborhood,
    street: row.street,
    postedAt: row.postedAt,
    isAgency: row.isAgency,
    authorName: row.authorName,
    authorProfile: row.authorProfile,
  };

  try {
    const prefs = await loadPreferences(user.id);
    const result = await judgeListing(listing, prefs);
    await persistJudgment(listingId, result);
    revalidatePath(`/listings/${listingId}`);
    return {
      ok: true,
      score: result.judgment.score,
      decision: result.judgment.decision,
      reasoning: result.judgment.reasoning,
      escalated: result.escalated,
      model: result.model,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Judge failed",
    };
  }
}
