import { desc, eq } from "drizzle-orm";
import { PreferencesPatchSchema, PreferencesSchema } from "@apartment-finder/shared";
import type { Preferences, PreferencesPatch } from "@apartment-finder/shared";
import { getDb } from "@/db";
import { pendingPatches } from "@/db/schema";
import { loadPreferences, savePreferences } from "@/preferences/store";

export async function stagePatch(input: {
  chatId: string;
  toolCallId: string;
  patch: PreferencesPatch;
}): Promise<string> {
  const db = getDb();
  const parsed = PreferencesPatchSchema.parse(input.patch);
  const [row] = await db
    .insert(pendingPatches)
    .values({
      chatId: input.chatId,
      toolCallId: input.toolCallId,
      patch: parsed,
    })
    .returning({ id: pendingPatches.id });
  return row?.id ?? "";
}

export async function confirmLatestPatch(chatId: string): Promise<string> {
  const db = getDb();
  const [pending] = await db
    .select()
    .from(pendingPatches)
    .where(eq(pendingPatches.chatId, chatId))
    .orderBy(desc(pendingPatches.createdAt))
    .limit(1);

  if (!pending) {
    return "No pending changes to confirm.";
  }

  const current = await loadPreferences();
  const merged = mergePreferences(current, pending.patch as PreferencesPatch);
  const validated = PreferencesSchema.parse(merged);
  await savePreferences(validated);

  await db.delete(pendingPatches).where(eq(pendingPatches.chatId, chatId));

  return "Preferences updated. I'll use these for future alerts.";
}

export async function cancelLatestPatch(chatId: string): Promise<string> {
  const db = getDb();
  const result = await db
    .delete(pendingPatches)
    .where(eq(pendingPatches.chatId, chatId))
    .returning({ id: pendingPatches.id });

  if (result.length === 0) {
    return "Nothing to cancel.";
  }
  return "Cancelled pending changes.";
}

function mergePreferences(
  current: Preferences,
  patch: PreferencesPatch,
): Preferences {
  return {
    ...current,
    ...patch,
    budget: { ...current.budget, ...(patch.budget ?? {}) },
    rooms: { ...current.rooms, ...(patch.rooms ?? {}) },
    sizeSqm: patch.sizeSqm
      ? { ...(current.sizeSqm ?? { min: 0 }), ...patch.sizeSqm }
      : current.sizeSqm,
    allowedNeighborhoods:
      patch.allowedNeighborhoods ?? current.allowedNeighborhoods,
    blockedNeighborhoods:
      patch.blockedNeighborhoods ?? current.blockedNeighborhoods,
    hardRequirements: patch.hardRequirements ?? current.hardRequirements,
    niceToHaves: patch.niceToHaves ?? current.niceToHaves,
    dealBreakers: patch.dealBreakers ?? current.dealBreakers,
    maxAgeHours: patch.maxAgeHours ?? current.maxAgeHours,
    ai: { ...current.ai, ...(patch.ai ?? {}) },
    alerts: {
      ...current.alerts,
      ...(patch.alerts ?? {}),
      telegram: {
        ...current.alerts.telegram,
        ...(patch.alerts?.telegram ?? {}),
      },
      email: {
        ...current.alerts.email,
        ...(patch.alerts?.email ?? {}),
      },
      whatsapp: {
        ...current.alerts.whatsapp,
        ...(patch.alerts?.whatsapp ?? {}),
      },
    },
  };
}
