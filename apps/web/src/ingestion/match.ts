import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  apartments,
  listingAttributes,
  listingExtractions,
  userFilterAttributes,
  userFilterCities,
  userFilterNeighborhoods,
  userFilterTexts,
  userFilters,
} from "@/db/schema";
import type { ApartmentAttributeKey, AttributeRequirement } from "@apartment-finder/shared";
import { createLogger } from "@/lib/log";
import { toVectorLiteral } from "@/ingestion/unify";

const log = createLogger("ingestion:match");

const DEALBREAKER_DISTANCE_MAX = 0.35; // similarity ≥ 0.65

export type MatchedUser = {
  userId: string;
  triggeredBy: "filter";
  matchedAttributes: ApartmentAttributeKey[];
  // Must-have attributes the listing didn't confirm or refute. Populated only
  // when the user opted in to "notify on unknowns"; surfaced in alerts so the
  // user knows what they need to verify themselves.
  unverifiedAttributes: ApartmentAttributeKey[];
};

/**
 * Find users whose filter set matches a given apartment. Pure SQL prefilter
 * on hot columns + app-side attribute / dealbreaker check.
 */
export async function findMatchingUsers(apartmentId: number): Promise<MatchedUser[]> {
  const db = getDb();

  // Load apartment + best extraction (latest schema_version) for the embedding.
  const [apt] = await db
    .select({
      id: apartments.id,
      cityId: apartments.cityId,
      neighborhood: apartments.neighborhood,
      city: apartments.city,
      lat: apartments.lat,
      lon: apartments.lon,
      rooms: apartments.rooms,
      sqm: apartments.sqm,
      priceNisLatest: apartments.priceNisLatest,
      primaryListingId: apartments.primaryListingId,
    })
    .from(apartments)
    .where(eq(apartments.id, apartmentId))
    .limit(1);
  if (!apt) {
    log.warn("apartment not found", { apartmentId });
    return [];
  }
  const price = apt.priceNisLatest;
  const rooms = apt.rooms;
  const sqm = apt.sqm;
  const neighborhood = apt.neighborhood;
  const cityId = apt.cityId;
  const city = apt.city;
  const lat = apt.lat;
  const lon = apt.lon;

  // SQL prefilter on user_filters.
  const candidates = await db
    .select({
      userId: userFilters.userId,
      strictUnknowns: userFilters.strictUnknowns,
      notifyOnUnknownMustHave: userFilters.notifyOnUnknownMustHave,
    })
    .from(userFilters)
    .where(
      and(
        eq(userFilters.isActive, true),
        cityPredicate(cityId, city),
        price == null
          ? sql`true`
          : and(
              or(isNull(userFilters.priceMaxNis), gte(userFilters.priceMaxNis, price)),
              or(isNull(userFilters.priceMinNis), lte(userFilters.priceMinNis, price)),
            ),
        rooms == null
          ? sql`true`
          : and(
              or(isNull(userFilters.roomsMax), gte(userFilters.roomsMax, rooms)),
              or(isNull(userFilters.roomsMin), lte(userFilters.roomsMin, rooms)),
            ),
        sqm == null
          ? sql`true`
          : and(
              or(isNull(userFilters.sqmMax), gte(userFilters.sqmMax, sqm)),
              or(isNull(userFilters.sqmMin), lte(userFilters.sqmMin, sqm)),
            ),
        locationPredicate(neighborhood, city, lat, lon),
      ),
    );

  if (candidates.length === 0) return [];

  // Load apartment-side data needed for attribute + dealbreaker checks.
  const listingId = apt.primaryListingId;
  const apartmentAttrs = listingId
    ? await db
        .select({ key: listingAttributes.key, value: listingAttributes.value })
        .from(listingAttributes)
        .where(eq(listingAttributes.listingId, listingId))
    : [];
  const knownAttrs = new Map<ApartmentAttributeKey, boolean>();
  for (const a of apartmentAttrs) knownAttrs.set(a.key, a.value);

  const apartmentEmbedding = listingId
    ? ((
        await db
          .select({ embedding: listingExtractions.embedding })
          .from(listingExtractions)
          .where(eq(listingExtractions.listingId, listingId))
          .orderBy(sql`${listingExtractions.schemaVersion} DESC`)
          .limit(1)
      )[0]?.embedding ?? null)
    : null;

  const matched: MatchedUser[] = [];
  for (const c of candidates) {
    const userAttrs = await db
      .select({
        key: userFilterAttributes.key,
        requirement: userFilterAttributes.requirement,
      })
      .from(userFilterAttributes)
      .where(eq(userFilterAttributes.userId, c.userId));

    const attrPass = checkAttributeRequirements(userAttrs, knownAttrs, c.notifyOnUnknownMustHave);
    if (!attrPass.pass) continue;

    if (apartmentEmbedding) {
      const dealbreakerHit = await dealbreakerHits(c.userId, apartmentEmbedding);
      if (dealbreakerHit) continue;
    }

    matched.push({
      userId: c.userId,
      triggeredBy: "filter",
      matchedAttributes: attrPass.matchedAttributes,
      unverifiedAttributes: attrPass.unverifiedAttributes,
    });
  }

  log.info("matched users", {
    apartmentId,
    candidates: candidates.length,
    matched: matched.length,
  });
  return matched;
}

/**
 * City predicate against `user_filter_cities`.
 *
 * Empty allowlist → pass everything. Non-empty → apartment.city must match
 * one of the user's selected city names (case/whitespace-normalized).
 */
function cityPredicate(apartmentCityId: string | null, apartmentCity: string | null) {
  const noCitySelections = sql`NOT EXISTS (
    SELECT 1 FROM ${userFilterCities}
    WHERE ${userFilterCities.userId} = ${userFilters.userId}
  )`;
  // Prefer the catalog id when the apartment has one. Fall back to Hebrew name
  // match ONLY when no city_id is set; otherwise apartments.city drift could let
  // a wrong-city listing satisfy the predicate.
  const cityMatches =
    apartmentCityId != null
      ? sql`EXISTS (
          SELECT 1 FROM ${userFilterCities}
          WHERE ${userFilterCities.userId} = ${userFilters.userId}
            AND ${userFilterCities.cityId} = ${apartmentCityId}
        )`
      : apartmentCity != null
        ? sql`EXISTS (
            SELECT 1 FROM ${userFilterCities}
            WHERE ${userFilterCities.userId} = ${userFilters.userId}
              AND lower(trim(${userFilterCities.nameHe})) = lower(trim(${apartmentCity}))
          )`
        : sql`false`;
  return or(noCitySelections, cityMatches);
}

/**
 * Combines explicit allowed neighborhoods and the optional radius filter.
 * Allowed neighborhood and radius are ORed so radius broadens selected
 * neighborhoods; blocked neighborhoods still always block.
 */
function locationPredicate(
  apartmentNeighborhood: string | null,
  apartmentCity: string | null,
  apartmentLat: number | null,
  apartmentLon: number | null,
) {
  const noAllowedSelections = sql`NOT EXISTS (
    SELECT 1 FROM ${userFilterNeighborhoods}
    WHERE ${userFilterNeighborhoods.userId} = ${userFilters.userId}
      AND ${userFilterNeighborhoods.kind} = 'allowed'
  )`;
  const noRadiusSelection = sql`${userFilters.centerLat} IS NULL
    OR ${userFilters.centerLon} IS NULL
    OR ${userFilters.radiusKm} IS NULL`;

  return and(
    sql`NOT (${neighborhoodMatchPair(apartmentNeighborhood, apartmentCity, "blocked")})`,
    or(
      and(noAllowedSelections, noRadiusSelection),
      neighborhoodMatchPair(apartmentNeighborhood, apartmentCity, "allowed"),
      radiusMatchPredicate(apartmentLat, apartmentLon),
    ),
  );
}

function neighborhoodMatchPair(
  apartmentNeighborhood: string | null,
  apartmentCity: string | null,
  kind: "allowed" | "blocked",
) {
  if (apartmentNeighborhood == null) return sql`false`;
  const cityClause =
    apartmentCity != null
      ? sql`AND lower(trim(${userFilterNeighborhoods.cityNameHe})) = lower(trim(${apartmentCity}))`
      : sql``;
  return sql`EXISTS (
    SELECT 1 FROM ${userFilterNeighborhoods}
    WHERE ${userFilterNeighborhoods.userId} = ${userFilters.userId}
      AND ${eq(userFilterNeighborhoods.kind, kind)}
      AND lower(trim(${userFilterNeighborhoods.nameHe})) = lower(trim(${apartmentNeighborhood}))
      ${cityClause}
  )`;
}

function radiusMatchPredicate(apartmentLat: number | null, apartmentLon: number | null) {
  if (apartmentLat == null || apartmentLon == null) return sql`false`;

  const distanceKm = sql`(
    6371 * 2 * asin(
      sqrt(
        least(
          1,
          power(sin(radians((${userFilters.centerLat} - ${apartmentLat}) / 2)), 2)
          + cos(radians(${apartmentLat}))
          * cos(radians(${userFilters.centerLat}))
          * power(sin(radians((${userFilters.centerLon} - ${apartmentLon}) / 2)), 2)
        )
      )
    )
  )`;
  return sql`${userFilters.centerLat} IS NOT NULL
    AND ${userFilters.centerLon} IS NOT NULL
    AND ${userFilters.radiusKm} IS NOT NULL
    AND ${distanceKm} <= ${userFilters.radiusKm}`;
}

export function isWithinRadiusKm(input: {
  apartmentLat: number | null;
  apartmentLon: number | null;
  centerLat: number | null;
  centerLon: number | null;
  radiusKm: number | null;
}): boolean {
  const { apartmentLat, apartmentLon, centerLat, centerLon, radiusKm } = input;
  if (
    apartmentLat == null ||
    apartmentLon == null ||
    centerLat == null ||
    centerLon == null ||
    radiusKm == null
  ) {
    return false;
  }
  return haversineDistanceKm(apartmentLat, apartmentLon, centerLat, centerLon) <= radiusKm;
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function checkAttributeRequirements(
  userAttrs: Array<{ key: ApartmentAttributeKey; requirement: AttributeRequirement }>,
  knownAttrs: Map<ApartmentAttributeKey, boolean>,
  notifyOnUnknownMustHave: boolean,
): {
  pass: boolean;
  matchedAttributes: ApartmentAttributeKey[];
  unverifiedAttributes: ApartmentAttributeKey[];
} {
  const matched: ApartmentAttributeKey[] = [];
  const unverified: ApartmentAttributeKey[] = [];
  const fail = () => ({
    pass: false,
    matchedAttributes: [] as ApartmentAttributeKey[],
    unverifiedAttributes: [] as ApartmentAttributeKey[],
  });
  for (const ua of userAttrs) {
    const known = knownAttrs.get(ua.key);
    switch (ua.requirement) {
      case "required_true":
        if (known === true) matched.push(ua.key);
        else if (known === false) return fail();
        else {
          unverified.push(ua.key);
          if (!notifyOnUnknownMustHave) return fail();
        }
        break;
      case "required_false":
        if (known === false) matched.push(ua.key);
        else if (known === true) return fail();
        else {
          unverified.push(ua.key);
          if (!notifyOnUnknownMustHave) return fail();
        }
        break;
      case "preferred_true":
        if (known === true) matched.push(ua.key);
        break;
      case "dont_care":
        break;
    }
  }
  return { pass: true, matchedAttributes: matched, unverifiedAttributes: unverified };
}

async function dealbreakerHits(userId: string, embedding: number[]): Promise<boolean> {
  const db = getDb();
  const vecLiteral = toVectorLiteral(embedding);
  const [hit] = await db
    .select({
      id: userFilterTexts.id,
      distance: sql<number>`${userFilterTexts.embedding} <=> ${vecLiteral}::vector`,
    })
    .from(userFilterTexts)
    .where(
      and(
        eq(userFilterTexts.userId, userId),
        eq(userFilterTexts.kind, "dealbreaker"),
        sql`${userFilterTexts.embedding} IS NOT NULL`,
      ),
    )
    .orderBy(sql`${userFilterTexts.embedding} <=> ${vecLiteral}::vector`)
    .limit(1);
  if (!hit) return false;
  return hit.distance <= DEALBREAKER_DISTANCE_MAX;
}
