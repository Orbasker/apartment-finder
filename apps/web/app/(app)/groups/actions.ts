"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { monitoredGroups } from "@/db/schema";
import { getCurrentUser, isAdmin } from "@/lib/supabase/server";
import { setSubscription } from "@/groups/subscriptions";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function addGroupAction(input: { url: string; label: string | null }) {
  const user = await requireUser();
  const db = getDb();
  await db
    .insert(monitoredGroups)
    .values({
      url: input.url,
      label: input.label,
      enabled: true,
      addedBy: user.id,
    })
    .onConflictDoUpdate({
      target: monitoredGroups.url,
      set: { label: input.label, enabled: true },
    });
  // Adder is auto-subscribed to groups they add.
  await setSubscription(user.id, input.url, true);
  revalidatePath("/groups");
}

export async function removeGroupAction(url: string) {
  const user = await requireUser();
  if (!isAdmin(user)) throw new Error("Only admins can delete groups from the catalog");
  const db = getDb();
  await db.delete(monitoredGroups).where(eq(monitoredGroups.url, url));
  revalidatePath("/groups");
}

export async function toggleGroupCatalogAction(url: string, enabled: boolean) {
  const user = await requireUser();
  if (!isAdmin(user))
    throw new Error("Only admins can enable/disable catalog groups");
  const db = getDb();
  await db.update(monitoredGroups).set({ enabled }).where(eq(monitoredGroups.url, url));
  revalidatePath("/groups");
}

export async function toggleSubscriptionAction(url: string, subscribed: boolean) {
  const user = await requireUser();
  await setSubscription(user.id, url, subscribed);
  revalidatePath("/groups");
}
