import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { monitoredGroups, userGroupSubscriptions } from "@/db/schema";

export async function getSubscribedGroupUrls(userId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ url: userGroupSubscriptions.groupUrl })
    .from(userGroupSubscriptions)
    .where(eq(userGroupSubscriptions.userId, userId));
  return rows.map((r) => r.url);
}

export async function setSubscription(
  userId: string,
  groupUrl: string,
  subscribed: boolean,
): Promise<void> {
  const db = getDb();
  if (subscribed) {
    await db
      .insert(userGroupSubscriptions)
      .values({ userId, groupUrl })
      .onConflictDoNothing();
  } else {
    await db
      .delete(userGroupSubscriptions)
      .where(
        and(
          eq(userGroupSubscriptions.userId, userId),
          eq(userGroupSubscriptions.groupUrl, groupUrl),
        ),
      );
  }
}

export async function autoSubscribeToEnabledGroups(userId: string): Promise<number> {
  const db = getDb();
  const enabled = await db
    .select({ url: monitoredGroups.url })
    .from(monitoredGroups)
    .where(eq(monitoredGroups.enabled, true));
  if (enabled.length === 0) return 0;
  const values = enabled.map((g) => ({ userId, groupUrl: g.url }));
  const inserted = await db
    .insert(userGroupSubscriptions)
    .values(values)
    .onConflictDoNothing()
    .returning({ url: userGroupSubscriptions.groupUrl });
  return inserted.length;
}
