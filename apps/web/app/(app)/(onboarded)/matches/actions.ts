"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-server";
import { setApartmentStatus } from "@/matches/store";
import type { UserApartmentStatusKind } from "@/matches/types";

const SetStatusInputSchema = z.object({
  apartmentId: z.number().int().positive(),
  status: z.enum(["new", "interested", "contacted", "visited", "rejected"]),
});

export type SetStatusResult = { ok: true } | { ok: false; error: string };

/**
 * Server action: write or update the user-apartment-status row used by the
 * swipe feed and the kanban board. Always validates auth + payload; the deck
 * relies on this returning a discriminated result so it can roll back the
 * optimistic UI on failure.
 */
export async function setApartmentStatusAction(input: {
  apartmentId: number;
  status: UserApartmentStatusKind;
}): Promise<SetStatusResult> {
  const parsed = SetStatusInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  try {
    await setApartmentStatus({
      userId: user.id,
      apartmentId: parsed.data.apartmentId,
      status: parsed.data.status,
    });
    return { ok: true };
  } catch (err) {
    console.error("[matches] setApartmentStatusAction failed", err);
    return { ok: false, error: "server_error" };
  }
}
