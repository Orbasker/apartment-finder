"use server";

import { searchRadiusPoints, type RadiusPointCandidate } from "@/lib/googlePlaces";

export type RadiusCandidate = RadiusPointCandidate;

export async function searchRadiusPointsAction(query: string): Promise<RadiusCandidate[]> {
  return searchRadiusPoints(query);
}
