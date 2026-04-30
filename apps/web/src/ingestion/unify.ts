import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { apartmentListings, apartments, listingExtractions } from "@/db/schema";
import { createLogger } from "@/lib/log";

const log = createLogger("ingestion:unify");

export type UnifyInput = {
  listingId: number;
  extractionId: number;
  cityId: string | null;
  placeId: string | null;
  lat: number | null;
  lon: number | null;
  rooms: number | null;
  sqm: number | null;
  embedding: number[] | null;
  // Newest fields to copy onto the apartment row.
  formattedAddress: string | null;
  street: string | null;
  houseNumber: string | null;
  neighborhood: string | null;
  city: string | null;
  floor: number | null;
  priceNis: number | null;
};

export type UnifyResult = {
  apartmentId: number;
  matchedBy: "place_id" | "geo_radius" | "embedding" | "created";
  confidence: number;
};

const GEO_RADIUS_METERS = 25;
const GEO_BBOX_METERS = 200;
const ROOMS_TOLERANCE = 0.5;
const SQM_TOLERANCE = 0.15;
const EMBEDDING_DISTANCE_MAX = 0.08; // cosine similarity ≥ 0.92

export async function findOrCreateApartment(input: UnifyInput): Promise<UnifyResult> {
  // 1) place_id exact match
  if (input.placeId) {
    const hit = await findByPlaceId(input.placeId);
    if (hit) {
      log.info("matched by place_id", { apartmentId: hit, listingId: input.listingId });
      return await link(input, hit, "place_id", 0.95);
    }
  }

  // 2) geo + size match
  if (input.lat != null && input.lon != null) {
    const hit = await findByGeoAndSize(input.lat, input.lon, input.rooms, input.sqm, input.cityId);
    if (hit) {
      log.info("matched by geo+size", { apartmentId: hit, listingId: input.listingId });
      return await link(input, hit, "geo_radius", 0.85);
    }
  }

  // 3) embedding match within ±200m bbox
  if (input.embedding && input.embedding.length > 0 && input.lat != null && input.lon != null) {
    const hit = await findByEmbedding(input.embedding, input.lat, input.lon, input.cityId);
    if (hit) {
      log.info("matched by embedding", { apartmentId: hit, listingId: input.listingId });
      return await link(input, hit, "embedding", 0.7);
    }
  }

  // 4) create new apartment
  const created = await createApartment(input);
  log.info("created new apartment", { apartmentId: created, listingId: input.listingId });
  return await link(input, created, "created", 1.0);
}

async function findByPlaceId(placeId: string): Promise<number | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: apartments.id })
    .from(apartments)
    .where(eq(apartments.placeId, placeId))
    .limit(1);
  return row?.id ?? null;
}

async function findByGeoAndSize(
  lat: number,
  lon: number,
  rooms: number | null,
  sqm: number | null,
  cityId: string | null,
): Promise<number | null> {
  const db = getDb();
  const dLat = metersToLat(GEO_RADIUS_METERS);
  const dLon = metersToLon(GEO_RADIUS_METERS, lat);
  const candidates = await db
    .select({
      id: apartments.id,
      cityId: apartments.cityId,
      lat: apartments.lat,
      lon: apartments.lon,
      rooms: apartments.rooms,
      sqm: apartments.sqm,
    })
    .from(apartments)
    .where(
      and(
        inputCityPredicate(cityId),
        sql`${apartments.lat} BETWEEN ${lat - dLat} AND ${lat + dLat}`,
        sql`${apartments.lon} BETWEEN ${lon - dLon} AND ${lon + dLon}`,
      ),
    )
    .limit(20);

  for (const c of candidates) {
    if (c.lat == null || c.lon == null) continue;
    const distance = haversineMeters(lat, lon, c.lat, c.lon);
    if (distance > GEO_RADIUS_METERS) continue;
    if (rooms != null && c.rooms != null && Math.abs(rooms - c.rooms) > ROOMS_TOLERANCE) continue;
    if (sqm != null && c.sqm != null) {
      const denom = Math.max(sqm, c.sqm);
      if (denom > 0 && Math.abs(sqm - c.sqm) / denom > SQM_TOLERANCE) continue;
    }
    return c.id;
  }
  return null;
}

async function findByEmbedding(
  embedding: number[],
  lat: number,
  lon: number,
  cityId: string | null,
): Promise<number | null> {
  const db = getDb();
  const dLat = metersToLat(GEO_BBOX_METERS);
  const dLon = metersToLon(GEO_BBOX_METERS, lat);
  const vecLiteral = toVectorLiteral(embedding);
  // Find nearest extraction by embedding within geo bbox; then map to apartment.
  const rows = await db
    .select({
      apartmentId: apartmentListings.apartmentId,
      distance: sql<number>`${listingExtractions.embedding} <=> ${vecLiteral}::vector`,
    })
    .from(listingExtractions)
    .innerJoin(apartmentListings, eq(apartmentListings.listingId, listingExtractions.listingId))
    .innerJoin(apartments, eq(apartments.id, apartmentListings.apartmentId))
    .where(
      and(
        inputCityPredicate(cityId),
        sql`${listingExtractions.lat} BETWEEN ${lat - dLat} AND ${lat + dLat}`,
        sql`${listingExtractions.lon} BETWEEN ${lon - dLon} AND ${lon + dLon}`,
        sql`${listingExtractions.embedding} IS NOT NULL`,
      ),
    )
    .orderBy(sql`${listingExtractions.embedding} <=> ${vecLiteral}::vector`)
    .limit(1);
  const top = rows[0];
  if (!top) return null;
  if (top.distance > EMBEDDING_DISTANCE_MAX) return null;
  return top.apartmentId;
}

async function createApartment(input: UnifyInput): Promise<number> {
  const db = getDb();
  const [row] = await db
    .insert(apartments)
    .values({
      placeId: input.placeId,
      lat: input.lat,
      lon: input.lon,
      formattedAddress: input.formattedAddress,
      street: input.street,
      houseNumber: input.houseNumber,
      neighborhood: input.neighborhood,
      city: input.city,
      cityId: input.cityId,
      rooms: input.rooms,
      sqm: input.sqm,
      floor: input.floor,
      priceNisLatest: input.priceNis,
      primaryListingId: input.listingId,
    })
    .returning({ id: apartments.id });
  if (!row) throw new Error("failed to create apartment");
  return row.id;
}

async function link(
  input: UnifyInput,
  apartmentId: number,
  matchedBy: UnifyResult["matchedBy"],
  confidence: number,
): Promise<UnifyResult> {
  const db = getDb();
  await db
    .insert(apartmentListings)
    .values({
      apartmentId,
      listingId: input.listingId,
      confidence,
      matchedBy,
    })
    .onConflictDoNothing();
  // Update apartment lastSeenAt and bump latest price.
  await db
    .update(apartments)
    .set({
      lastSeenAt: new Date(),
      ...(input.cityId != null ? { cityId: input.cityId } : {}),
      ...(input.priceNis != null ? { priceNisLatest: input.priceNis } : {}),
    })
    .where(eq(apartments.id, apartmentId));
  return { apartmentId, matchedBy, confidence };
}

function inputCityPredicate(cityId: string | null) {
  return cityId == null
    ? sql`true`
    : sql`${apartments.cityId} IS NULL OR ${apartments.cityId} = ${cityId}`;
}

// ---------------------------------------------------------------------------
// Geo helpers (haversine + meters-to-degrees).
// ---------------------------------------------------------------------------

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function metersToLat(meters: number): number {
  return meters / 111_320;
}

function metersToLon(meters: number, atLat: number): number {
  return meters / (111_320 * Math.cos(toRad(atLat)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
