"use server";

import { addNeighborhoodFilter } from "@/filters/store";
import { getCurrentUser } from "@/lib/auth-server";

type Kind = "allowed" | "blocked";
type NeighborhoodInput = {
  placeId: string;
  nameHe: string;
  cityPlaceId: string;
  cityNameHe: string;
};

export async function pickNeighborhoodsAction(
  selections: NeighborhoodInput[],
  kind: Kind,
): Promise<{ ok: boolean; reason?: string; count?: number }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "unauthorized" };
  if (kind !== "allowed" && kind !== "blocked") return { ok: false, reason: "bad_kind" };
  const valid = selections.filter((s) => s.placeId && s.nameHe && s.cityPlaceId && s.cityNameHe);
  if (valid.length === 0) return { ok: false, reason: "missing_fields" };
  for (const selection of valid) {
    await addNeighborhoodFilter(user.id, kind, selection);
  }
  return { ok: true, count: valid.length };
}
