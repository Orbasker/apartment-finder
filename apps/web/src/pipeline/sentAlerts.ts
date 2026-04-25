import { and, eq } from "drizzle-orm";
import type { Judgment, NormalizedListing } from "@apartment-finder/shared";
import { getDb } from "@/db";
import { sentAlerts } from "@/db/schema";

export type AlertChannel = "email";

export type AlertEntry = {
  listingId: number;
  listing: NormalizedListing;
  summary?: string;
  reason?: string;
  judgment?: Judgment;
};

export async function hasAlertBeenSent(
  userId: string,
  canonicalId: number,
  channel: AlertChannel,
): Promise<boolean> {
  const db = getDb();
  const existing = await db
    .select()
    .from(sentAlerts)
    .where(
      and(
        eq(sentAlerts.userId, userId),
        eq(sentAlerts.canonicalId, canonicalId),
        eq(sentAlerts.channel, channel),
      ),
    )
    .limit(1);
  return existing.length > 0;
}

export async function recordAlertSent(
  userId: string,
  canonicalId: number,
  channel: AlertChannel,
): Promise<void> {
  const db = getDb();
  await db.insert(sentAlerts).values({ userId, canonicalId, channel }).onConflictDoNothing();
}
