"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { monitoredGroups } from "@/db/schema";

export async function addGroupAction(input: { url: string; label: string | null }) {
  const db = getDb();
  await db
    .insert(monitoredGroups)
    .values({ url: input.url, label: input.label, enabled: true })
    .onConflictDoUpdate({
      target: monitoredGroups.url,
      set: { label: input.label, enabled: true },
    });
  revalidatePath("/groups");
}

export async function removeGroupAction(url: string) {
  const db = getDb();
  await db.delete(monitoredGroups).where(eq(monitoredGroups.url, url));
  revalidatePath("/groups");
}

export async function toggleGroupAction(url: string, enabled: boolean) {
  const db = getDb();
  await db.update(monitoredGroups).set({ enabled }).where(eq(monitoredGroups.url, url));
  revalidatePath("/groups");
}
