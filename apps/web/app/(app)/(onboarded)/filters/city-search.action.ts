"use server";

import { searchActiveCities, type CityCandidate } from "@/cities/store";
import { getCurrentUser } from "@/lib/auth-server";

export type { CityCandidate };

export async function searchCitiesAction(query: string): Promise<CityCandidate[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const trimmed = query.trim();
  if (!trimmed) return [];
  return searchActiveCities(trimmed);
}
