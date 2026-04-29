"use server";

import { autocompleteNeighborhoods, type NeighborhoodCandidate } from "@/lib/googlePlaces";
import { getCurrentUser } from "@/lib/auth-server";

export type { NeighborhoodCandidate };

export async function searchNeighborhoodsAction(
  query: string,
  cityNameHe?: string,
): Promise<NeighborhoodCandidate[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const trimmed = query.trim();
  if (!trimmed) return [];
  return autocompleteNeighborhoods(trimmed, cityNameHe ?? null);
}
