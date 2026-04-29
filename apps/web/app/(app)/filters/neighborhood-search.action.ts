"use server";

import { searchNeighborhoodsByName, type ResolverResult } from "@/lib/neighborhoodResolver";
import { getCurrentUser } from "@/lib/auth-server";

export type NeighborhoodCandidate = Pick<ResolverResult, "id" | "nameHe" | "cityNameHe">;

export async function searchNeighborhoodsAction(query: string): Promise<NeighborhoodCandidate[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const trimmed = query.trim();
  if (!trimmed) return [];
  const candidates = await searchNeighborhoodsByName(trimmed, { limit: 8 });
  return candidates.map(({ id, nameHe, cityNameHe }) => ({ id, nameHe, cityNameHe }));
}
