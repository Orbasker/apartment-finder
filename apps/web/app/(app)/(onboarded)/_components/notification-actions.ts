"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth-server";
import { markAlertsSeen } from "@/matches/store";

export async function markAllAlertsSeenAction(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  await markAlertsSeen(user.id);
  revalidatePath("/", "layout");
  return { ok: true };
}
