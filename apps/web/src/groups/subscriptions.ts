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
    await db.insert(userGroupSubscriptions).values({ userId, groupUrl }).onConflictDoNothing();
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

/**
 * Per-lambda TTL cache so we don't re-run the 2 DB writes on every page
 * navigation. 5 min means users pick up newly-added catalog groups on their
 * next nav after the cache expires.
 */
const autoSubscribedAt = new Map<string, number>();
const AUTO_SUBSCRIBE_TTL_MS = 5 * 60_000;

export async function autoSubscribeToEnabledGroups(userId: string): Promise<number> {
  const last = autoSubscribedAt.get(userId);
  if (last && Date.now() - last < AUTO_SUBSCRIBE_TTL_MS) return 0;

  const db = getDb();
  const enabled = await db
    .select({ url: monitoredGroups.url })
    .from(monitoredGroups)
    .where(eq(monitoredGroups.enabled, true));
  if (enabled.length === 0) {
    autoSubscribedAt.set(userId, Date.now());
    return 0;
  }
  const values = enabled.map((g) => ({ userId, groupUrl: g.url }));
  const inserted = await db
    .insert(userGroupSubscriptions)
    .values(values)
    .onConflictDoNothing()
    .returning({ url: userGroupSubscriptions.groupUrl });
  autoSubscribedAt.set(userId, Date.now());
  return inserted.length;
}
