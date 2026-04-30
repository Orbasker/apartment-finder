import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { apartments, listings as listingsTable, sentAlerts } from "@/db/schema";

import type { MatchedListing, MatchedListingsResult } from "./types";
import { PAGE_SIZE, type ListingsQuery } from "./url-state";

/**
 * Returns paginated matched listings for a user.
 *
 * "Matched" = there exists at least one row in `sent_alerts` for
 * (userId, apartmentId, *), regardless of destination. Multi-destination
 * duplicates (e.g. email + telegram for the same apartment) are collapsed
 * via `MAX(sent_alerts.sentAt)` per apartment.
 *
 * Sort defaults to alert-recency (`MAX(sentAt) DESC`); price-sorts re-order
 * on `apartments.priceNisLatest`. Filters (price, rooms, neighborhood) are
 * pushed into SQL. `neighborhood` matches `apartments.neighborhood` exactly;
 * the header bar's chip values are sourced from distinct neighborhoods in
 * the result set, so text equality is exact by construction.
 *
 * Pagination is offset-based (`page` 1-indexed, `pageSize` constant 20).
 * See APA-31 plan OD-4.
 */
export async function loadMatchedListings(
  userId: string,
  query: ListingsQuery,
): Promise<MatchedListingsResult> {
  const db = getDb();

  // Build the WHERE list once and reuse for both COUNT and SELECT so the
  // total stays consistent with the page contents.
  const whereClauses = [eq(sentAlerts.userId, userId)];
  if (query.priceMin !== null) {
    whereClauses.push(sql`${apartments.priceNisLatest} >= ${query.priceMin}`);
  }
  if (query.priceMax !== null) {
    whereClauses.push(sql`${apartments.priceNisLatest} <= ${query.priceMax}`);
  }
  if (query.rooms !== null) {
    // Exact match per ticket — half-room tolerance is a follow-up.
    whereClauses.push(sql`${apartments.rooms} = ${query.rooms}`);
  }
  if (query.neighborhood.length > 0) {
    whereClauses.push(inArray(apartments.neighborhood, query.neighborhood));
  }

  const baseWhere = and(...whereClauses);

  // ORDER BY: default = MAX(sentAt) DESC; price-sorts use the canonical
  // `priceNisLatest` and tie-break on alert-recency for stability.
  const orderBy = (() => {
    switch (query.sort) {
      case "priceAsc":
        return [asc(apartments.priceNisLatest), desc(sql`max_sent_at`)];
      case "priceDesc":
        return [desc(apartments.priceNisLatest), desc(sql`max_sent_at`)];
      case "newest":
      default:
        return [desc(sql`max_sent_at`), desc(apartments.id)];
    }
  })();

  // COUNT — distinct matched apartments. Uses the same JOIN + WHERE as the
  // SELECT so totals can never disagree with the page contents.
  const totalRows = await db
    .select({
      total: sql<number>`COUNT(DISTINCT ${apartments.id})::int`,
    })
    .from(sentAlerts)
    .innerJoin(apartments, eq(apartments.id, sentAlerts.apartmentId))
    .where(baseWhere);

  const total = totalRows[0]?.total ?? 0;

  // SELECT — left-join the primary listing for the source URL. We GROUP BY
  // every non-aggregated column from `apartments` so Postgres' strict
  // GROUP BY rule is satisfied even though `apartments.id` is the PK.
  const offset = (query.page - 1) * PAGE_SIZE;
  const rows = await db
    .select({
      id: apartments.id,
      maxSentAt: sql<Date>`MAX(${sentAlerts.sentAt})`.as("max_sent_at"),
      lat: apartments.lat,
      lon: apartments.lon,
      formattedAddress: apartments.formattedAddress,
      neighborhood: apartments.neighborhood,
      city: apartments.city,
      priceNis: apartments.priceNisLatest,
      rooms: apartments.rooms,
      sqm: apartments.sqm,
      floor: apartments.floor,
      sourceUrl: listingsTable.url,
    })
    .from(sentAlerts)
    .innerJoin(apartments, eq(apartments.id, sentAlerts.apartmentId))
    .leftJoin(listingsTable, eq(listingsTable.id, apartments.primaryListingId))
    .where(baseWhere)
    .groupBy(
      apartments.id,
      apartments.lat,
      apartments.lon,
      apartments.formattedAddress,
      apartments.neighborhood,
      apartments.city,
      apartments.priceNisLatest,
      apartments.rooms,
      apartments.sqm,
      apartments.floor,
      listingsTable.url,
    )
    .orderBy(...orderBy)
    .limit(PAGE_SIZE)
    .offset(offset);

  const mapped: MatchedListing[] = rows.map((r) => ({
    id: r.id,
    alertedAt: r.maxSentAt,
    lat: r.lat,
    lon: r.lon,
    formattedAddress: r.formattedAddress,
    neighborhood: r.neighborhood,
    city: r.city,
    priceNis: r.priceNis,
    rooms: r.rooms,
    sqm: r.sqm,
    floor: r.floor,
    sourceUrl: r.sourceUrl,
  }));

  const pageCount = total === 0 ? 0 : Math.ceil(total / PAGE_SIZE);

  return {
    rows: mapped,
    total,
    page: query.page,
    pageSize: PAGE_SIZE,
    pageCount,
  };
}
