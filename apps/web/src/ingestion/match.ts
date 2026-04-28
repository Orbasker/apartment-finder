import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  apartments,
  listingAttributes,
  listingExtractions,
  userFilterAttributes,
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
        neighborhoodPredicate(neighborhood),
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

function neighborhoodPredicate(neighborhood: string | null) {
  if (!neighborhood) {
    // No neighborhood on apartment: only allow users with no allowed-list.
    return sql`coalesce(array_length(${userFilters.allowedNeighborhoods}, 1), 0) = 0`;
  }
  return and(
    or(
      sql`coalesce(array_length(${userFilters.allowedNeighborhoods}, 1), 0) = 0`,
      sql`${neighborhood} = ANY(${userFilters.allowedNeighborhoods})`,
    ),
    sql`NOT (${neighborhood} = ANY(${userFilters.blockedNeighborhoods}))`,
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
