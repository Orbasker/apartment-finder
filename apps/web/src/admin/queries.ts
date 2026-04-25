import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { rawPosts } from "@/db/schema";

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
      source: rawPosts.source,
      lastIngestedAt: sql<Date | null>`max(${rawPosts.fetchedAt})`,
      count24h: sql<number>`count(*) filter (where ${rawPosts.fetchedAt} > now() - interval '24 hours')::int`,
      count7d: sql<number>`count(*) filter (where ${rawPosts.fetchedAt} > now() - interval '7 days')::int`,
    })
    .from(rawPosts)
    .groupBy(rawPosts.source)
    .orderBy(desc(sql`max(${rawPosts.fetchedAt})`));

  return rows;
}
