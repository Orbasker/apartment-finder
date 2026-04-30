"use server";

import { getCityById } from "@/cities/store";
import { addCity } from "@/filters/store";
import { getCurrentUser } from "@/lib/auth-server";

export async function pickCityAction(input: {
  cityId: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "unauthorized" };
  const cityId = input.cityId.trim();
  if (!cityId) return { ok: false, reason: "missing_fields" };
  // Resolve from the catalog rather than trusting the client payload — guards
  // against forged/stale city metadata and enforces launch-ready on the server.
  const city = await getCityById(cityId);
  if (!city) return { ok: false, reason: "not_found" };
  if (!city.isLaunchReady) return { ok: false, reason: "not_launch_ready" };
  await addCity(user.id, {
    cityId: city.cityId,
    placeId: city.placeId,
    nameHe: city.nameHe,
    nameEn: city.nameEn,
  });
  return { ok: true };
}
