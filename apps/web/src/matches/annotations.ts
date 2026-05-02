import type { ApartmentAttributeKey, AttributeRequirement } from "@apartment-finder/shared";

import type { MatchFeedItem } from "./types";

/**
 * One small "decision-helpful" pill rendered on a match card. Each kind is a
 * pure function of the item plus per-request context — there's no DB call
 * inside this module so it's trivial to unit-test.
 */
export type Annotation =
  | {
      kind: "price_vs_median";
      /** Difference in NIS vs the segment median; negative = below median. */
      deltaNis: number;
      /** Same delta as a fraction of the median (negative = cheaper). */
      deltaPct: number;
    }
  | {
      kind: "distance_to_center";
      /** Straight-line distance in meters from the user's center to the apartment. */
      meters: number;
      /** Rough walking time in minutes (haversine × 12.5 min/km). */
      walkMinutes: number;
    }
  | {
      kind: "must_have_coverage";
      matched: number;
      total: number;
      missing: ApartmentAttributeKey[];
    }
  | {
      kind: "fresh";
      /** Minutes since the match was alerted (sentAt). */
      ageMinutes: number;
    };

/**
 * Median-price lookup keyed by the segment used for "is this cheap for the
 * area?". Loaders should aggregate over the active city set once per request
 * and pass the result in.
 */
export type MedianLookup = {
  /** Returns ₪/month median for `(neighborhood, rooms)` or `null` if unknown. */
  byNeighborhoodAndRooms: (neighborhood: string | null, rooms: number | null) => number | null;
};

export type AnnotationContext = {
  median: MedianLookup;
  /** User's filter center (radius search anchor). `null` if not set. */
  center: { lat: number; lon: number } | null;
  /** User's must-have requirements; informs `must_have_coverage`. */
  userAttrs: Array<{ key: ApartmentAttributeKey; requirement: AttributeRequirement }>;
  /** "Now" — injected for deterministic tests. */
  now?: Date;
};

const PRICE_DELTA_THRESHOLD_PCT = 0.05; // ±5% — anything tighter isn't a real signal.
const FRESH_WINDOW_MINUTES = 24 * 60; // 24h — older alerts don't need a freshness pill.
const KM_TO_METERS = 1000;
const WALK_MINUTES_PER_KM = 12.5;

export function buildAnnotations(item: MatchFeedItem, ctx: AnnotationContext): Annotation[] {
  const annotations: Annotation[] = [];

  const priceVsMedian = computePriceVsMedian(item, ctx.median);
  if (priceVsMedian) annotations.push(priceVsMedian);

  const distance = computeDistanceToCenter(item, ctx.center);
  if (distance) annotations.push(distance);

  const coverage = computeMustHaveCoverage(item, ctx.userAttrs);
  if (coverage) annotations.push(coverage);

  const fresh = computeFreshness(item, ctx.now ?? new Date());
  if (fresh) annotations.push(fresh);

  return annotations;
}

function computePriceVsMedian(item: MatchFeedItem, lookup: MedianLookup): Annotation | null {
  if (item.priceNis == null) return null;
  const median = lookup.byNeighborhoodAndRooms(item.neighborhood, item.rooms);
  if (median == null || median <= 0) return null;
  const deltaNis = item.priceNis - median;
  const deltaPct = deltaNis / median;
  if (Math.abs(deltaPct) < PRICE_DELTA_THRESHOLD_PCT) return null;
  return { kind: "price_vs_median", deltaNis, deltaPct };
}

function computeDistanceToCenter(
  item: MatchFeedItem,
  center: { lat: number; lon: number } | null,
): Annotation | null {
  if (!center || item.lat == null || item.lon == null) return null;
  const km = haversineDistanceKm(center.lat, center.lon, item.lat, item.lon);
  return {
    kind: "distance_to_center",
    meters: Math.round(km * KM_TO_METERS),
    walkMinutes: Math.round(km * WALK_MINUTES_PER_KM),
  };
}

function computeMustHaveCoverage(
  item: MatchFeedItem,
  userAttrs: AnnotationContext["userAttrs"],
): Annotation | null {
  const mustHaveKeys = new Set<ApartmentAttributeKey>();
  for (const ua of userAttrs) {
    if (ua.requirement === "required_true" || ua.requirement === "required_false") {
      mustHaveKeys.add(ua.key);
    }
  }
  if (mustHaveKeys.size === 0) return null;
  const matched = item.matchedAttributes.filter((k) => mustHaveKeys.has(k)).length;
  const missing = item.unverifiedAttributes.filter((k) => mustHaveKeys.has(k));
  return {
    kind: "must_have_coverage",
    matched,
    total: mustHaveKeys.size,
    missing,
  };
}

function computeFreshness(item: MatchFeedItem, now: Date): Annotation | null {
  const ageMs = now.getTime() - item.sentAt.getTime();
  const ageMinutes = Math.max(0, Math.round(ageMs / 60000));
  if (ageMinutes >= FRESH_WINDOW_MINUTES) return null;
  return { kind: "fresh", ageMinutes };
}

// Local copy of the haversine helper from `ingestion/match.ts`. Duplicated
// rather than imported so this module stays a leaf — annotations are pure
// utilities that the matches store + UI both depend on.
function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}
