import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { neighborhoods } from "@/db/schema";
import { createLogger } from "@/lib/log";

// ---------------------------------------------------------------------------
// Maps free-text / geocoded neighborhood signals into a canonical gov.il ID.
// Resolution order (first match wins):
//   1. googlePlaceId  →  exact match on neighborhoods.google_place_id
//   2. exact name_he  (case + whitespace normalized) within the city if known
//   3. fuzzy          (pg_trgm similarity > FUZZY_THRESHOLD on name_he)
//   4. geo            (nearest center within GEO_RADIUS_KM, scoped to city)
// ---------------------------------------------------------------------------

const log = createLogger("neighborhoodResolver");

const FUZZY_THRESHOLD = 0.5;
const GEO_RADIUS_KM = 1.5;

export type ResolverInput = {
  googlePlaceId?: string | null;
  cityCode?: string | null;
  cityNameHe?: string | null;
  rawText?: string | null;
  lat?: number | null;
  lon?: number | null;
};

export type ResolverConfidence = "placeId" | "exact" | "fuzzy" | "geo";

export type ResolverResult = {
  id: string;
  nameHe: string;
  cityNameHe: string;
  cityCode: string;
  confidence: ResolverConfidence;
};

/** Hebrew-aware text normalizer for matching. NFC + lowercase + collapse whitespace. */
export function normalizeText(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

export async function resolveNeighborhood(input: ResolverInput): Promise<ResolverResult | null> {
  const db = getDb();

  // 1. place_id direct match.
  if (input.googlePlaceId) {
    const [hit] = await db
      .select({
        id: neighborhoods.id,
        nameHe: neighborhoods.nameHe,
        cityNameHe: neighborhoods.cityNameHe,
        cityCode: neighborhoods.cityCode,
      })
      .from(neighborhoods)
      .where(eq(neighborhoods.googlePlaceId, input.googlePlaceId))
      .limit(1);
    if (hit) return { ...hit, confidence: "placeId" };
  }

  // Resolve cityCode from cityNameHe if needed.
  let cityCode = input.cityCode ?? null;
  if (!cityCode && input.cityNameHe) {
    const [cityHit] = await db
      .select({ cityCode: neighborhoods.cityCode })
      .from(neighborhoods)
      .where(eq(neighborhoods.cityNameHe, input.cityNameHe))
      .limit(1);
    if (cityHit) cityCode = cityHit.cityCode;
  }

  const cityFilter = cityCode ? eq(neighborhoods.cityCode, cityCode) : undefined;
  const norm = input.rawText ? normalizeText(input.rawText) : null;

  // 2. exact name_he match.
  if (norm) {
    const exactWhere = cityFilter
      ? and(cityFilter, sql`lower(${neighborhoods.nameHe}) = ${norm}`)
      : sql`lower(${neighborhoods.nameHe}) = ${norm}`;
    const [hit] = await db
      .select({
        id: neighborhoods.id,
        nameHe: neighborhoods.nameHe,
        cityNameHe: neighborhoods.cityNameHe,
        cityCode: neighborhoods.cityCode,
      })
      .from(neighborhoods)
      .where(exactWhere)
      .limit(1);
    if (hit) return { ...hit, confidence: "exact" };
  }

  // 3. fuzzy via pg_trgm similarity.
  if (norm && norm.length >= 2) {
    const fuzzyWhere = cityFilter
      ? and(cityFilter, sql`similarity(${neighborhoods.nameHe}, ${norm}) > ${FUZZY_THRESHOLD}`)
      : sql`similarity(${neighborhoods.nameHe}, ${norm}) > ${FUZZY_THRESHOLD}`;
    const [hit] = await db
      .select({
        id: neighborhoods.id,
        nameHe: neighborhoods.nameHe,
        cityNameHe: neighborhoods.cityNameHe,
        cityCode: neighborhoods.cityCode,
        score: sql<number>`similarity(${neighborhoods.nameHe}, ${norm})`,
      })
      .from(neighborhoods)
      .where(fuzzyWhere)
      .orderBy(sql`similarity(${neighborhoods.nameHe}, ${norm}) DESC`)
      .limit(1);
    if (hit) {
      log.debug("fuzzy hit", { rawText: input.rawText, picked: hit.nameHe, score: hit.score });
      return {
        id: hit.id,
        nameHe: hit.nameHe,
        cityNameHe: hit.cityNameHe,
        cityCode: hit.cityCode,
        confidence: "fuzzy",
      };
    }
  }

  // 4. geo fallback (Haversine in km, scoped to city if available).
  if (input.lat != null && input.lon != null) {
    const geoWhere = cityFilter
      ? and(
          cityFilter,
          sql`${neighborhoods.centerLat} IS NOT NULL`,
          sql`${neighborhoods.centerLon} IS NOT NULL`,
        )
      : and(
          sql`${neighborhoods.centerLat} IS NOT NULL`,
          sql`${neighborhoods.centerLon} IS NOT NULL`,
        );
    const distance = sql<number>`(
      6371 * acos(
        cos(radians(${input.lat})) * cos(radians(${neighborhoods.centerLat}))
        * cos(radians(${neighborhoods.centerLon}) - radians(${input.lon}))
        + sin(radians(${input.lat})) * sin(radians(${neighborhoods.centerLat}))
      )
    )`;
    const [hit] = await db
      .select({
        id: neighborhoods.id,
        nameHe: neighborhoods.nameHe,
        cityNameHe: neighborhoods.cityNameHe,
        cityCode: neighborhoods.cityCode,
        distance,
      })
      .from(neighborhoods)
      .where(geoWhere)
      .orderBy(distance)
      .limit(1);
    if (hit && hit.distance <= GEO_RADIUS_KM) {
      return {
        id: hit.id,
        nameHe: hit.nameHe,
        cityNameHe: hit.cityNameHe,
        cityCode: hit.cityCode,
        confidence: "geo",
      };
    }
  }

  return null;
}

/** Typeahead-style search for the chat agent and dashboard combobox.
 *  Returns the top candidates (default 5) by trigram similarity, plus exact
 *  prefix matches first. */
export async function searchNeighborhoodsByName(
  query: string,
  options: { cityNameHe?: string; limit?: number } = {},
): Promise<ResolverResult[]> {
  const db = getDb();
  const limit = options.limit ?? 5;
  const norm = normalizeText(query);
  if (!norm) return [];

  const cityFilter = options.cityNameHe
    ? eq(neighborhoods.cityNameHe, options.cityNameHe)
    : undefined;

  // Score = max(prefix-bonus, similarity). Prefix matches always sort to the top.
  const score = sql<number>`GREATEST(
    CASE WHEN lower(${neighborhoods.nameHe}) LIKE ${norm + "%"} THEN 1.0 ELSE 0.0 END,
    similarity(${neighborhoods.nameHe}, ${norm})
  )`;
  const where = cityFilter ? and(cityFilter, sql`(${score}) > 0.2`) : sql`(${score}) > 0.2`;

  const rows = await db
    .select({
      id: neighborhoods.id,
      nameHe: neighborhoods.nameHe,
      cityNameHe: neighborhoods.cityNameHe,
      cityCode: neighborhoods.cityCode,
      score,
    })
    .from(neighborhoods)
    .where(where)
    .orderBy(sql`(${score}) DESC`, neighborhoods.nameHe)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    nameHe: r.nameHe,
    cityNameHe: r.cityNameHe,
    cityCode: r.cityCode,
    confidence: r.score >= 1.0 ? ("exact" as const) : ("fuzzy" as const),
  }));
}
