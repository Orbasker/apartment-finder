"use server";

import { addNeighborhoodFilter } from "@/filters/store";
import { getCurrentUser } from "@/lib/auth-server";

type Kind = "allowed" | "blocked";

export async function pickNeighborhoodAction(
  selection: { placeId: string; nameHe: string; cityNameHe: string },
  kind: Kind,
): Promise<{ ok: boolean; reason?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "unauthorized" };
  if (kind !== "allowed" && kind !== "blocked") return { ok: false, reason: "bad_kind" };
  if (!selection.placeId || !selection.nameHe || !selection.cityNameHe) {
    return { ok: false, reason: "missing_fields" };
  }
  await addNeighborhoodFilter(user.id, kind, selection);
  return { ok: true };
}
