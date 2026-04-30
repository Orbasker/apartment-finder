"use server";

import { addCity } from "@/filters/store";
import { getCurrentUser } from "@/lib/auth-server";

type CityInput = {
  cityId: string;
  placeId: string;
  nameHe: string;
  nameEn: string;
};

export async function pickCityAction(city: CityInput): Promise<{ ok: boolean; reason?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "unauthorized" };
  if (!city.cityId.trim() || !city.placeId.trim() || !city.nameHe.trim() || !city.nameEn.trim()) {
    return { ok: false, reason: "missing_fields" };
  }
  await addCity(user.id, city);
  return { ok: true };
}
