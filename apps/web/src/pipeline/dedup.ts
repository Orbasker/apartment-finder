import { and, eq, inArray } from "drizzle-orm";
import type { NormalizedListing } from "@apartment-finder/shared";
import { getDb } from "@/db";
import { apartmentSources, canonicalApartments, extractions, rawPosts } from "@/db/schema";
import { listingTextHash } from "@/pipeline/normalize";
import { createLogger } from "@/lib/log";

const log = createLogger("pipeline:dedup");

export type InsertedListing = { id: number; listing: NormalizedListing };

export type IngestResult = {
  inserted: InsertedListing[];
  skippedExisting: number;
};

export async function ingestNewListings(incoming: NormalizedListing[]): Promise<IngestResult> {
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
      .select({ sourceId: rawPosts.sourceId })
      .from(rawPosts)
      .where(and(eq(rawPosts.source, source), inArray(rawPosts.sourceId, ids)));
    for (const r of rows) existingKeys.add(`${source}:${r.sourceId}`);
  }

  const fresh = incoming.filter((l) => !existingKeys.has(`${l.source}:${l.sourceId}`));

  if (fresh.length === 0) {
    return { inserted: [], skippedExisting: incoming.length };
  }

  const rows = fresh.map((l) => ({
    source: l.source,
    sourceId: l.sourceId,
    url: l.url,
    rawText: listingRawText(l),
    contentHash: listingTextHash(l),
    postedAt: l.postedAt ?? null,
    authorName: l.authorName ?? null,
    authorProfile: l.authorProfile ?? null,
    sourceGroupUrl: l.sourceGroupUrl ?? null,
    rawJson: l.rawJson ?? null,
  }));

  const insertedRawRows = await db
    .insert(rawPosts)
    .values(rows)
    .onConflictDoNothing({ target: [rawPosts.source, rawPosts.sourceId] })
    .returning({ id: rawPosts.id, source: rawPosts.source, sourceId: rawPosts.sourceId });

  const idBySourceKey = new Map(
    insertedRawRows.map((r) => [`${r.source}:${r.sourceId}`, r.id] as const),
  );

  const inserted: InsertedListing[] = [];
  for (const listing of fresh) {
    const rawPostId = idBySourceKey.get(`${listing.source}:${listing.sourceId}`);
    if (rawPostId === undefined) continue;

    const [extraction] = await db
      .insert(extractions)
      .values({
        rawPostId,
        schemaVersion: 1,
        model: "normalized-ingest",
        priceNis: listing.priceNis ?? null,
        rooms: listing.rooms ?? null,
        sqm: listing.sqm ?? null,
        floor: listing.floor ?? null,
        street: listing.street ?? null,
        neighborhood: listing.neighborhood ?? null,
        isAgency: listing.isAgency ?? null,
        extras: null,
      })
      .onConflictDoNothing({ target: [extractions.rawPostId, extractions.schemaVersion] })
      .returning({ id: extractions.id });

    if (!extraction) continue;

    const [canonical] = await db
      .insert(canonicalApartments)
      .values({
        primaryAddress: listing.street ?? listing.neighborhood ?? null,
        street: listing.street ?? null,
        neighborhood: listing.neighborhood ?? null,
        rooms: listing.rooms ?? null,
        sqm: listing.sqm ?? null,
        matchKey: `${listing.source}:${listing.sourceId}`,
      })
      .returning({ id: canonicalApartments.id });

    if (!canonical) continue;

    await db
      .insert(apartmentSources)
      .values({
        canonicalId: canonical.id,
        extractionId: extraction.id,
        confidence: 1,
      })
      .onConflictDoNothing();

    inserted.push({ id: canonical.id, listing });
  }

  const skippedExisting = incoming.length - fresh.length;
  const raceSkipped = fresh.length - inserted.length;

  if (raceSkipped > 0) {
    log.warn("insert race skipped rows", {
      incoming: incoming.length,
      fresh: fresh.length,
      inserted: inserted.length,
      raceSkipped,
    });
  }

  return {
    inserted,
    skippedExisting,
  };
}

function listingRawText(listing: NormalizedListing): string | null {
  const parts = [listing.title, listing.description].filter(
    (part): part is string => typeof part === "string" && part.trim() !== "",
  );
  return parts.length > 0 ? parts.join("\n\n") : null;
}
