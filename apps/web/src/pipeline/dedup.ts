import { and, eq, inArray } from "drizzle-orm";
import type { NormalizedListing } from "@apartment-finder/shared";
import { getDb } from "@/db";
import { listings } from "@/db/schema";
import { listingTextHash } from "@/pipeline/normalize";

export type InsertedListing = { id: number; listing: NormalizedListing };

export type IngestResult = {
  inserted: InsertedListing[];
  skippedExisting: number;
};

export async function ingestNewListings(
  incoming: NormalizedListing[],
): Promise<IngestResult> {
  if (incoming.length === 0) return { inserted: [], skippedExisting: 0 };

  const db = getDb();

  const bySource = new Map<string, NormalizedListing[]>();
  for (const l of incoming) {
    const arr = bySource.get(l.source) ?? [];
    arr.push(l);
    bySource.set(l.source, arr);
  }

  const existingKeys = new Set<string>();
  for (const [source, arr] of bySource) {
    const ids = arr.map((l) => l.sourceId);
    if (ids.length === 0) continue;
    const rows = await db
      .select({ sourceId: listings.sourceId })
      .from(listings)
      .where(and(eq(listings.source, source), inArray(listings.sourceId, ids)));
    for (const r of rows) existingKeys.add(`${source}:${r.sourceId}`);
  }

  const fresh = incoming.filter(
    (l) => !existingKeys.has(`${l.source}:${l.sourceId}`),
  );

  if (fresh.length === 0) {
    return { inserted: [], skippedExisting: incoming.length };
  }

  const rows = fresh.map((l) => ({
    source: l.source,
    sourceId: l.sourceId,
    url: l.url,
    title: l.title ?? null,
    description: l.description ?? null,
    priceNis: l.priceNis ?? null,
    rooms: l.rooms ?? null,
    sqm: l.sqm ?? null,
    floor: l.floor ?? null,
    neighborhood: l.neighborhood ?? null,
    street: l.street ?? null,
    postedAt: l.postedAt ?? null,
    isAgency: l.isAgency ?? null,
    authorName: l.authorName ?? null,
    authorProfile: l.authorProfile ?? null,
    sourceGroupUrl: l.sourceGroupUrl ?? null,
    rawJson: l.rawJson ?? null,
    textHash: listingTextHash(l),
  }));

  const inserted = await db
    .insert(listings)
    .values(rows)
    .onConflictDoNothing({ target: [listings.source, listings.sourceId] })
    .returning({ id: listings.id, source: listings.source, sourceId: listings.sourceId });

  const idBySourceKey = new Map(
    inserted.map((r) => [`${r.source}:${r.sourceId}`, r.id] as const),
  );

  return {
    inserted: fresh
      .map((listing) => {
        const id = idBySourceKey.get(`${listing.source}:${listing.sourceId}`);
        return id === undefined ? null : { id, listing };
      })
      .filter((x): x is { id: number; listing: NormalizedListing } => x !== null),
    skippedExisting: incoming.length - fresh.length,
  };
}
