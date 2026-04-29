"use server";

import { addCity } from "@/filters/store";
import { getCurrentUser } from "@/lib/auth-server";

export async function pickCityAction(city: {
  placeId: string;
  nameHe: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "unauthorized" };
  if (!city.placeId || !city.nameHe) return { ok: false, reason: "missing_fields" };
  await addCity(user.id, city);
  return { ok: true };
}
