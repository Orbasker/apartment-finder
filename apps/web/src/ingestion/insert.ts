import { getDb } from "@/db";
import { listings } from "@/db/schema";

export type CollectedListing = {
  source: "yad2" | "facebook";
  cityId?: string | null;
  sourceId: string;
  url: string;
  rawText: string | null;
  rawJson: unknown;
  contentHash: string;
  postedAt: Date | null;
  authorName?: string | null;
  authorProfile?: string | null;
  sourceGroupUrl?: string | null;
};

export type InsertResult = {
  inserted: { id: number; source: "yad2" | "facebook"; sourceId: string }[];
  skippedExisting: number;
};

export async function bulkInsertListings(input: CollectedListing[]): Promise<InsertResult> {
  if (input.length === 0) return { inserted: [], skippedExisting: 0 };

  const db = getDb();
  const inserted = await db
    .insert(listings)
    .values(
      input.map((row) => ({
        source: row.source,
        cityId: row.cityId ?? null,
        sourceId: row.sourceId,
        url: row.url,
        rawText: row.rawText,
        rawJson: row.rawJson as never,
        contentHash: row.contentHash,
        postedAt: row.postedAt,
        authorName: row.authorName ?? null,
        authorProfile: row.authorProfile ?? null,
        sourceGroupUrl: row.sourceGroupUrl ?? null,
      })),
    )
    .onConflictDoNothing({ target: [listings.source, listings.sourceId] })
    .returning({ id: listings.id, source: listings.source, sourceId: listings.sourceId });

  return {
    inserted,
    skippedExisting: input.length - inserted.length,
  };
}
