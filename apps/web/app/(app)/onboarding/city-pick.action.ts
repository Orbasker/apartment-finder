"use server";

import { addCity } from "@/filters/store";
import { getCurrentUser } from "@/lib/auth-server";

type CityInput = { placeId: string; nameHe: string };

export async function pickCitiesAction(
  cities: CityInput[],
): Promise<{ ok: boolean; reason?: string; count?: number }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "unauthorized" };
  const valid = cities.filter((c) => c.placeId && c.nameHe);
  if (valid.length === 0) return { ok: false, reason: "missing_fields" };
  for (const city of valid) {
    await addCity(user.id, city);
  }
  return { ok: true, count: valid.length };
}
