import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { apartments, listings as listingsTable, sentAlerts } from "@/db/schema";

import type { MatchedListing, MatchedListingsMapResult, MatchedListingsResult } from "./types";
import { PAGE_SIZE, type ListingsQuery } from "./url-state";

function buildMatchedListingsWhere(userId: string, query: ListingsQuery): SQL[] {
  const whereClauses = [eq(sentAlerts.userId, userId)];
  if (query.priceMin !== null) {
    whereClauses.push(sql`${apartments.priceNisLatest} >= ${query.priceMin}`);
  }
  if (query.priceMax !== null) {
    whereClauses.push(sql`${apartments.priceNisLatest} <= ${query.priceMax}`);
  }
  if (query.rooms !== null) {
    whereClauses.push(sql`${apartments.rooms} = ${query.rooms}`);
  }
  if (query.neighborhood.length > 0) {
    whereClauses.push(inArray(apartments.neighborhood, query.neighborhood));
  }
  return whereClauses;
}

function buildMatchedListingsOrder(query: ListingsQuery) {
  switch (query.sort) {
    case "priceAsc":
      return [asc(apartments.priceNisLatest), desc(sql`max_sent_at`)];
    case "priceDesc":
      return [desc(apartments.priceNisLatest), desc(sql`max_sent_at`)];
    case "roomsAsc":
      return [asc(apartments.rooms), desc(sql`max_sent_at`)];
    case "roomsDesc":
      return [desc(apartments.rooms), desc(sql`max_sent_at`)];
    case "oldest":
      return [asc(sql`max_sent_at`), asc(apartments.id)];
    case "newest":
    default:
      return [desc(sql`max_sent_at`), desc(apartments.id)];
  }
}

type MatchedListingRow = {
  id: number;
  maxSentAt: Date | string | null;
  lat: number | null;
  lon: number | null;
  formattedAddress: string | null;
  neighborhood: string | null;
  city: string | null;
  priceNis: number | null;
  rooms: number | null;
  sqm: number | null;
  floor: number | null;
  sourceUrl: string | null;
  source: MatchedListing["source"];
  postedAt: Date | string | null;
};

const toDate = (v: Date | string | null): Date | null =>
  v == null ? null : v instanceof Date ? v : new Date(v);

function mapMatchedListingRow(r: MatchedListingRow): MatchedListing {
  return {
    id: r.id,
    alertedAt: toDate(r.maxSentAt) as Date,
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
    source: r.source,
    postedAt: toDate(r.postedAt),
  };
}

/**
 * Returns paginated apartments the user has been alerted about. Multi-
 * destination duplicates (e.g. email + telegram for the same apartment)
 * are collapsed via MAX(sent_alerts.sent_at) per apartment; that timestamp
 * also drives the default sort.
 *
 * `neighborhood` matches `apartments.neighborhood` text exactly — chip
 * values come from distinct neighborhoods in the user's own result set,
 * so equality is exact by construction.
 */
export async function loadMatchedListings(
  userId: string,
  query: ListingsQuery,
): Promise<MatchedListingsResult> {
  const db = getDb();

  const baseWhere = and(...buildMatchedListingsWhere(userId, query));
  const orderBy = buildMatchedListingsOrder(query);

  const totalRows = await db
    .select({
      total: sql<number>`COUNT(DISTINCT ${apartments.id})::int`,
    })
    .from(sentAlerts)
    .innerJoin(apartments, eq(apartments.id, sentAlerts.apartmentId))
    .where(baseWhere);

  const total = totalRows[0]?.total ?? 0;

  // GROUP BY every non-aggregated column we select; Postgres' strict mode
  // requires it even though apartments.id is the PK.
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
      source: listingsTable.source,
      postedAt: listingsTable.postedAt,
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
      listingsTable.source,
      listingsTable.postedAt,
    )
    .orderBy(...orderBy)
    .limit(PAGE_SIZE)
    .offset(offset);

  const mapped: MatchedListing[] = rows.map(mapMatchedListingRow);

  const pageCount = total === 0 ? 0 : Math.ceil(total / PAGE_SIZE);

  return {
    rows: mapped,
    total,
    page: query.page,
    pageSize: PAGE_SIZE,
    pageCount,
  };
}

export async function loadMatchedListingsForMap(
  userId: string,
  query: ListingsQuery,
): Promise<MatchedListingsMapResult> {
  const db = getDb();
  const baseWhere = and(...buildMatchedListingsWhere(userId, query));
  const orderBy = buildMatchedListingsOrder(query);

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
      source: listingsTable.source,
      postedAt: listingsTable.postedAt,
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
      listingsTable.source,
      listingsTable.postedAt,
    )
    .orderBy(...orderBy);

  const mapped = rows.map(mapMatchedListingRow);
  const located = mapped.filter((r) => r.lat !== null && r.lon !== null);

  return {
    rows: located,
    total: mapped.length,
    noLocationCount: mapped.length - located.length,
  };
}
