import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { listingAttributes, listingExtractions, listings, type Listing } from "@/db/schema";
import { extractListing } from "@/ingestion/extract";
import { geocode, normalizeAddressKey } from "@/ingestion/geocode";
import { composeEmbeddingText, embedText } from "@/ingestion/embed";
import { findOrCreateApartment } from "@/ingestion/unify";
import { findMatchingUsers } from "@/ingestion/match";
import { sendInstantAlert } from "@/ingestion/notify";
import { createLogger, errorMessage } from "@/lib/log";

const log = createLogger("ingestion:pipeline");

export type ProcessOutcome = {
  listingId: number;
  status: "unified" | "failed" | "skipped";
  apartmentId?: number;
  matchedUsers?: number;
  alertsSent?: number;
  error?: string;
};

/**
 * Process one listing through the full pipeline. Idempotent on success
 * (writes use upsert / on-conflict-do-nothing). Updates `listings.status`
 * after each step for observability.
 */
export async function processListing(listingId: number): Promise<ProcessOutcome> {
  const db = getDb();

  const [listing] = await db.select().from(listings).where(eq(listings.id, listingId)).limit(1);
  if (!listing) {
    log.warn("listing not found", { listingId });
    return { listingId, status: "skipped" };
  }
  if (listing.status === "unified") {
    return { listingId, status: "skipped" };
  }

  try {
    // 1) extract
    const rawText = buildRawText(listing);
    const extracted = await extractListing({ rawText, source: listing.source });
    await markStatus(listingId, "extracted");

    // 2) geocode
    const addressKey = normalizeAddressKey({
      street: extracted.street,
      houseNumber: extracted.houseNumber,
      neighborhood: extracted.neighborhood,
      city: extracted.city,
      rawAddress: extracted.rawAddress,
    });
    const geo = addressKey
      ? await geocode(addressKey)
      : {
          placeId: null,
          lat: null,
          lon: null,
          formattedAddress: null,
          street: null,
          houseNumber: null,
          neighborhood: null,
          city: null,
          confidence: null,
        };
    await markStatus(listingId, "geocoded");

    // 3) embed
    const embeddingText = composeEmbeddingText({
      neighborhood: geo.neighborhood ?? extracted.neighborhood,
      street: geo.street ?? extracted.street,
      rooms: extracted.rooms,
      sqm: extracted.sqm,
      description: extracted.description,
    });
    const embedding = embeddingText.length > 0 ? await embedText(embeddingText) : null;
    await markStatus(listingId, "embedded");

    // 4) persist extraction
    const [extractionRow] = await db
      .insert(listingExtractions)
      .values({
        listingId,
        schemaVersion: 1,
        model: "google/gemini-2.5-flash",
        priceNis: extracted.priceNis,
        rooms: extracted.rooms,
        sqm: extracted.sqm,
        floor: extracted.floor,
        rawAddress: extracted.rawAddress,
        street: extracted.street ?? geo.street,
        houseNumber: extracted.houseNumber ?? geo.houseNumber,
        neighborhood: extracted.neighborhood ?? geo.neighborhood,
        city: extracted.city ?? geo.city,
        placeId: geo.placeId,
        lat: geo.lat,
        lon: geo.lon,
        geocodeConfidence: geo.confidence,
        description: extracted.description,
        condition: extracted.condition,
        isAgency: extracted.isAgency,
        phoneE164: extracted.phoneE164,
        arnonaNis: extracted.arnonaNis,
        vaadBayitNis: extracted.vaadBayitNis,
        entryDate: extracted.entryDate,
        balconySqm: extracted.balconySqm,
        totalFloors: extracted.totalFloors,
        furnitureStatus: extracted.furnitureStatus,
        extras: extracted.extras as never,
        embedding,
      })
      .returning({ id: listingExtractions.id });
    if (!extractionRow) throw new Error("failed to insert listing_extractions");

    if (extracted.attributes.length > 0) {
      await db
        .insert(listingAttributes)
        .values(
          extracted.attributes.map((a) => ({
            listingId,
            key: a.key,
            value: a.value,
            source: "ai" as const,
          })),
        )
        .onConflictDoNothing();
    }

    // 5) unify
    const unify = await findOrCreateApartment({
      listingId,
      extractionId: extractionRow.id,
      placeId: geo.placeId,
      lat: geo.lat,
      lon: geo.lon,
      rooms: extracted.rooms,
      sqm: extracted.sqm,
      embedding,
      formattedAddress: geo.formattedAddress,
      street: extracted.street ?? geo.street,
      houseNumber: extracted.houseNumber ?? geo.houseNumber,
      neighborhood: extracted.neighborhood ?? geo.neighborhood,
      city: extracted.city ?? geo.city,
      floor: extracted.floor,
      priceNis: extracted.priceNis,
    });
    await markStatus(listingId, "unified");

    // 6) match + notify
    const matched = await findMatchingUsers(unify.apartmentId);
    let alertsSent = 0;
    for (const m of matched) {
      const outcome = await sendInstantAlert({
        userId: m.userId,
        apartmentId: unify.apartmentId,
        matchedAttributes: m.matchedAttributes,
      });
      alertsSent += outcome.channels.filter((c) => c.status === "sent").length;
    }

    return {
      listingId,
      status: "unified",
      apartmentId: unify.apartmentId,
      matchedUsers: matched.length,
      alertsSent,
    };
  } catch (err) {
    const message = errorMessage(err);
    log.error("processListing failed", { listingId, error: message });
    await db
      .update(listings)
      .set({ status: "failed", failureReason: message, retries: (listing.retries ?? 0) + 1 })
      .where(eq(listings.id, listingId));
    return { listingId, status: "failed", error: message };
  }
}

async function markStatus(listingId: number, status: Listing["status"]): Promise<void> {
  await getDb().update(listings).set({ status }).where(eq(listings.id, listingId));
}

function buildRawText(listing: Listing): string {
  if (listing.rawText && listing.rawText.trim().length > 0) return listing.rawText;
  if (listing.rawJson) return JSON.stringify(listing.rawJson);
  return listing.url;
}
