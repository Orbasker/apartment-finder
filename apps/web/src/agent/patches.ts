import { desc, eq } from "drizzle-orm";
import { PreferencesPatchSchema, PreferencesSchema } from "@apartment-finder/shared";
import type { Preferences, PreferencesPatch } from "@apartment-finder/shared";
import { getDb } from "@/db";
import { pendingPatches } from "@/db/schema";
import { loadPreferences, savePreferences } from "@/preferences/store";

export async function stagePatch(input: {
  userId: string;
  toolCallId: string;
  patch: PreferencesPatch;
}): Promise<string> {
  const db = getDb();
  const parsed = PreferencesPatchSchema.parse(input.patch);
  const [row] = await db
    .insert(pendingPatches)
    .values({
      chatId: input.userId,
      toolCallId: input.toolCallId,
      patch: parsed,
    })
    .returning({ id: pendingPatches.id });
  return row?.id ?? "";
}

export async function confirmLatestPatch(userId: string): Promise<string> {
  const db = getDb();
  const [pending] = await db
    .select()
    .from(pendingPatches)
    .where(eq(pendingPatches.chatId, userId))
    .orderBy(desc(pendingPatches.createdAt))
    .limit(1);

  if (!pending) {
    return "No pending changes to confirm.";
  }

  const current = await loadPreferences(userId);
  const merged = mergePreferences(current, pending.patch as PreferencesPatch);
  const validated = PreferencesSchema.parse(merged);
  await savePreferences(userId, validated);

  await db.delete(pendingPatches).where(eq(pendingPatches.chatId, userId));

  return "Preferences updated. I'll use these for future alerts.";
}

export async function cancelLatestPatch(userId: string): Promise<string> {
  const db = getDb();
  const result = await db
    .delete(pendingPatches)
    .where(eq(pendingPatches.chatId, userId))
    .returning({ id: pendingPatches.id });

  if (result.length === 0) {
    return "Nothing to cancel.";
  }
  return "Cancelled pending changes.";
}

function mergePreferences(current: Preferences, patch: PreferencesPatch): Preferences {
  return {
    ...current,
    ...patch,
    budget: { ...current.budget, ...(patch.budget ?? {}) },
    rooms: { ...current.rooms, ...(patch.rooms ?? {}) },
    sizeSqm: patch.sizeSqm ? { ...(current.sizeSqm ?? {}), ...patch.sizeSqm } : current.sizeSqm,
    allowedNeighborhoods: patch.allowedNeighborhoods ?? current.allowedNeighborhoods,
    blockedNeighborhoods: patch.blockedNeighborhoods ?? current.blockedNeighborhoods,
    hardRequirements: patch.hardRequirements ?? current.hardRequirements,
    niceToHaves: patch.niceToHaves ?? current.niceToHaves,
    dealBreakers: patch.dealBreakers ?? current.dealBreakers,
    amenities: { ...current.amenities, ...(patch.amenities ?? {}) },
    maxAgeHours: patch.maxAgeHours ?? current.maxAgeHours,
    ai: { ...current.ai, ...(patch.ai ?? {}) },
    alerts: {
      ...current.alerts,
      ...(patch.alerts ?? {}),
      email: {
        ...current.alerts.email,
        ...(patch.alerts?.email ?? {}),
      },
    },
  };
}
