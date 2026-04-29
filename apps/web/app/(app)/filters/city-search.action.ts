"use server";

import { autocompleteCities, type CityCandidate } from "@/lib/googlePlaces";
import { getCurrentUser } from "@/lib/auth-server";

export type { CityCandidate };

export async function searchCitiesAction(query: string): Promise<CityCandidate[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const trimmed = query.trim();
  if (!trimmed) return [];
  return autocompleteCities(trimmed);
}
