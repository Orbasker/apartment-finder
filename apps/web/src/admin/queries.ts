import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { listings } from "@/db/schema";

export type SourceHealthRow = {
  source: string;
  lastIngestedAt: Date | null;
  count24h: number;
  count7d: number;
};

export async function getSourceHealth(): Promise<SourceHealthRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      source: listings.source,
      lastIngestedAt: sql<Date | null>`max(${listings.ingestedAt})`,
      count24h: sql<number>`count(*) filter (where ${listings.ingestedAt} > now() - interval '24 hours')::int`,
      count7d: sql<number>`count(*) filter (where ${listings.ingestedAt} > now() - interval '7 days')::int`,
    })
    .from(listings)
    .groupBy(listings.source)
    .orderBy(desc(sql`max(${listings.ingestedAt})`));

  return rows;
}
