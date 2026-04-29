import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  apartments,
  listingAttributes,
  listingExtractions,
  neighborhoods,
  userFilterAttributes,
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
      neighborhood: apartments.neighborhood,
      neighborhoodId: apartments.neighborhoodId,
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
  const neighborhoodId = apt.neighborhoodId;

  // SQL prefilter on user_filters.
  const candidates = await db
    .select({ userId: userFilters.userId, strictUnknowns: userFilters.strictUnknowns })
    .from(userFilters)
    .where(
      and(
        eq(userFilters.isActive, true),
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
        neighborhoodPredicate(neighborhoodId, neighborhood),
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

    const attrPass = checkAttributeRequirements(userAttrs, knownAttrs, c.strictUnknowns);
    if (!attrPass.pass) continue;

    if (apartmentEmbedding) {
      const dealbreakerHit = await dealbreakerHits(c.userId, apartmentEmbedding);
      if (dealbreakerHit) continue;
    }

    matched.push({
      userId: c.userId,
      triggeredBy: "filter",
      matchedAttributes: attrPass.matchedAttributes,
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
 * Neighborhood predicate against `user_filter_neighborhoods`.
 *
 * - Allowed: pass if the user has NO allowed selections, OR if the apartment's
 *   `neighborhoodId` matches one, OR (fallback for unresolved listings) if the
 *   apartment's free-text `neighborhood` equals the canonical `name_he` of one
 *   of the user's allowed selections.
 * - Blocked: fail if the apartment's `neighborhoodId` matches a blocked
 *   selection, OR if the free-text `neighborhood` equals the canonical name_he
 *   of one. Free-text fallback only kicks in when `neighborhoodId` is null on
 *   the apartment (i.e. resolver couldn't map it).
 */
function neighborhoodPredicate(
  apartmentNeighborhoodId: string | null,
  apartmentNeighborhood: string | null,
) {
  const noAllowedSelections = sql`NOT EXISTS (
    SELECT 1 FROM ${userFilterNeighborhoods}
    WHERE ${userFilterNeighborhoods.userId} = ${userFilters.userId}
      AND ${userFilterNeighborhoods.kind} = 'allowed'
  )`;

  const allowedById =
    apartmentNeighborhoodId != null
      ? sql`EXISTS (
          SELECT 1 FROM ${userFilterNeighborhoods}
          WHERE ${userFilterNeighborhoods.userId} = ${userFilters.userId}
            AND ${userFilterNeighborhoods.kind} = 'allowed'
            AND ${userFilterNeighborhoods.neighborhoodId} = ${apartmentNeighborhoodId}
        )`
      : sql`false`;

  const allowedByText =
    apartmentNeighborhoodId == null && apartmentNeighborhood != null
      ? sql`EXISTS (
          SELECT 1 FROM ${userFilterNeighborhoods}
          INNER JOIN ${neighborhoods}
            ON ${neighborhoods.id} = ${userFilterNeighborhoods.neighborhoodId}
          WHERE ${userFilterNeighborhoods.userId} = ${userFilters.userId}
            AND ${userFilterNeighborhoods.kind} = 'allowed'
            AND ${neighborhoods.nameHe} = ${apartmentNeighborhood}
        )`
      : sql`false`;

  const blockedById =
    apartmentNeighborhoodId != null
      ? sql`EXISTS (
          SELECT 1 FROM ${userFilterNeighborhoods}
          WHERE ${userFilterNeighborhoods.userId} = ${userFilters.userId}
            AND ${userFilterNeighborhoods.kind} = 'blocked'
            AND ${userFilterNeighborhoods.neighborhoodId} = ${apartmentNeighborhoodId}
        )`
      : sql`false`;

  const blockedByText =
    apartmentNeighborhoodId == null && apartmentNeighborhood != null
      ? sql`EXISTS (
          SELECT 1 FROM ${userFilterNeighborhoods}
          INNER JOIN ${neighborhoods}
            ON ${neighborhoods.id} = ${userFilterNeighborhoods.neighborhoodId}
          WHERE ${userFilterNeighborhoods.userId} = ${userFilters.userId}
            AND ${userFilterNeighborhoods.kind} = 'blocked'
            AND ${neighborhoods.nameHe} = ${apartmentNeighborhood}
        )`
      : sql`false`;

  return and(
    or(noAllowedSelections, allowedById, allowedByText),
    sql`NOT (${blockedById})`,
    sql`NOT (${blockedByText})`,
  );
}

export function checkAttributeRequirements(
  userAttrs: Array<{ key: ApartmentAttributeKey; requirement: AttributeRequirement }>,
  knownAttrs: Map<ApartmentAttributeKey, boolean>,
  strictUnknowns: boolean,
): { pass: boolean; matchedAttributes: ApartmentAttributeKey[] } {
  const matched: ApartmentAttributeKey[] = [];
  for (const ua of userAttrs) {
    const known = knownAttrs.get(ua.key);
    switch (ua.requirement) {
      case "required_true":
        if (known === true) matched.push(ua.key);
        else if (known === false) return { pass: false, matchedAttributes: [] };
        else if (strictUnknowns) return { pass: false, matchedAttributes: [] };
        break;
      case "required_false":
        if (known === false) matched.push(ua.key);
        else if (known === true) return { pass: false, matchedAttributes: [] };
        else if (strictUnknowns) return { pass: false, matchedAttributes: [] };
        break;
      case "preferred_true":
        if (known === true) matched.push(ua.key);
        break;
      case "dont_care":
        break;
    }
  }
  return { pass: true, matchedAttributes: matched };
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
