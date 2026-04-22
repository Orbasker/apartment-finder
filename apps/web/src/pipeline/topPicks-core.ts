import { z } from "zod";

export const DEFAULT_TOP_PICKS = 5;
export const DEFAULT_HOURS_AGO = 24;
export const MAX_CANDIDATES = 80;

export const TopPickSchema = z.object({
  listingId: z.number().int(),
  rank: z.number().int().min(1),
  headline: z.string(),
  reasoning: z.string(),
  concerns: z.array(z.string()).default([]),
});

export const TopPicksResultSchema = z.object({
  picks: z.array(TopPickSchema),
  summary: z.string().optional(),
});

export type TopPick = z.infer<typeof TopPickSchema>;
export type TopPicksResult = z.infer<typeof TopPicksResultSchema>;

export type CandidateListing = {
  id: number;
  source: string;
  url: string;
  title: string | null;
  description: string | null;
  priceNis: number | null;
  rooms: number | null;
  sqm: number | null;
  neighborhood: string | null;
  street: string | null;
  isAgency: boolean | null;
  postedAt: Date | null;
  ingestedAt: Date;
  score: number | null;
  decision: string | null;
  reasoning: string | null;
};

export type ResolvedTopPick = TopPick & {
  listing: CandidateListing;
};

export function resolvePicks(
  picks: TopPick[],
  candidates: CandidateListing[],
  topN: number,
): ResolvedTopPick[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const resolved: ResolvedTopPick[] = [];
  const seen = new Set<number>();
  for (const pick of picks) {
    const listing = byId.get(pick.listingId);
    if (!listing || seen.has(pick.listingId)) continue;
    seen.add(pick.listingId);
    resolved.push({ ...pick, listing });
    if (resolved.length >= topN) break;
  }
  resolved.sort((a, b) => a.rank - b.rank);
  return resolved;
}
