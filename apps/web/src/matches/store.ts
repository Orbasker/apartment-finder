import { and, countDistinct, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  apartments,
  listingAttributes,
  listingExtractions,
  listings as listingsTable,
  sentAlerts,
  userApartmentStatus,
  userFilterAttributes,
  userFilters,
} from "@/db/schema";
import { checkAttributeRequirements } from "@/ingestion/match";
import {
  FurnitureStatusSchema,
  type ApartmentAttributeKey,
  type AttributeRequirement,
  type FurnitureStatus,
} from "@apartment-finder/shared";

import {
  type InboxItem,
  type MatchBoard,
  type MatchFeedItem,
  type MatchFeedPage,
  type NotifyChannel,
  type UnreadAlerts,
  type UserApartmentStatusKind,
} from "./types";

const DEFAULT_FEED_LIMIT = 20;
const DEFAULT_INBOX_LIMIT = 20;

/**
 * Cursor-paginated feed of apartments the user has been alerted about.
 *
 * - Multi-channel rows in `sent_alerts` collapse via `MAX(sent_at)` per
 *   apartment, matching the existing `/listings` loader.
 * - Excludes apartments the user has marked as `rejected`.
 * - `matchedAttributes` / `unverifiedAttributes` are recomputed against the
 *   current user filter + listing attributes; we don't persist a per-match
 *   snapshot (the email pipeline uses the same recomputation at send time).
 */
export async function getMatchFeed(
  userId: string,
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<MatchFeedPage> {
  const limit = opts.limit ?? DEFAULT_FEED_LIMIT;
  const cursor = opts.cursor ? new Date(opts.cursor) : null;
  const rows = await loadFeedRows({
    userId,
    cursor,
    includeRejected: false,
    limit: limit + 1,
  });
  const items = await hydrateRows(userId, rows.slice(0, limit));
  const hasMore = rows.length > limit;
  const nextCursor =
    hasMore && items.length > 0 ? items[items.length - 1]!.sentAt.toISOString() : null;
  return { items, nextCursor };
}

/**
 * Same shape as the feed but grouped by status with `rejected` included; used
 * by the kanban board.
 */
export async function getMatchBoard(userId: string): Promise<MatchBoard> {
  const rows = await loadFeedRows({ userId, cursor: null, includeRejected: true, limit: 500 });
  const items = await hydrateRows(userId, rows);
  const board: MatchBoard = {
    new: [],
    interested: [],
    contacted: [],
    visited: [],
    rejected: [],
  };
  for (const item of items) board[item.status].push(item);
  return board;
}

/**
 * Inbox feed for the bell panel. Returns the latest alerts (read + unread) and
 * a count of distinct apartments still unread, so a dual-channel user is not
 * double-counted.
 */
export async function getUnreadAlerts(
  userId: string,
  limit: number = DEFAULT_INBOX_LIMIT,
): Promise<UnreadAlerts> {
  const db = getDb();

  const [unread] = await db
    .select({ value: countDistinct(sentAlerts.apartmentId) })
    .from(sentAlerts)
    .where(and(eq(sentAlerts.userId, userId), sql`${sentAlerts.seenAt} IS NULL`));

  const rows = await db
    .select({
      apartmentId: apartments.id,
      maxSentAt: sql<Date>`MAX(${sentAlerts.sentAt})`.as("max_sent_at"),
      minSeenAt: sql<Date | null>`MIN(${sentAlerts.seenAt})`.as("min_seen_at"),
      destinations: sql<NotifyChannel[]>`array_agg(DISTINCT ${sentAlerts.destination})`.as(
        "destinations",
      ),
      neighborhood: apartments.neighborhood,
      city: apartments.city,
      formattedAddress: apartments.formattedAddress,
      priceNis: apartments.priceNisLatest,
      rooms: apartments.rooms,
      sqm: apartments.sqm,
      sourceUrl: listingsTable.url,
    })
    .from(sentAlerts)
    .innerJoin(apartments, eq(apartments.id, sentAlerts.apartmentId))
    .leftJoin(listingsTable, eq(listingsTable.id, apartments.primaryListingId))
    .where(eq(sentAlerts.userId, userId))
    .groupBy(
      apartments.id,
      apartments.neighborhood,
      apartments.city,
      apartments.formattedAddress,
      apartments.priceNisLatest,
      apartments.rooms,
      apartments.sqm,
      listingsTable.url,
    )
    .orderBy(desc(sql`max_sent_at`))
    .limit(limit);

  const items: InboxItem[] = rows.map((r) => ({
    apartmentId: r.apartmentId,
    sentAt: toDate(r.maxSentAt) as Date,
    seenAt: toDate(r.minSeenAt),
    channels: r.destinations ?? [],
    neighborhood: r.neighborhood,
    city: r.city,
    formattedAddress: r.formattedAddress,
    priceNis: r.priceNis,
    rooms: r.rooms,
    sqm: r.sqm,
    sourceUrl: r.sourceUrl,
  }));

  return { unreadCount: unread?.value ?? 0, items };
}

/**
 * Mark alerts as seen. Without `apartmentIds`, marks all unread for the user;
 * with it, only those apartments. Returns the number of rows updated (best-effort
 * — postgres-js exposes `count` on UPDATE results, but the type is permissive).
 */
export async function markAlertsSeen(userId: string, apartmentIds?: number[]): Promise<number> {
  if (apartmentIds && apartmentIds.length === 0) return 0;
  const db = getDb();
  const result = await db
    .update(sentAlerts)
    .set({ seenAt: new Date() })
    .where(
      and(
        eq(sentAlerts.userId, userId),
        sql`${sentAlerts.seenAt} IS NULL`,
        apartmentIds ? inArray(sentAlerts.apartmentId, apartmentIds) : sql`true`,
      ),
    );
  return (result as unknown as { count?: number }).count ?? 0;
}

/**
 * Upsert per-user-per-apartment status. Bumps `updatedAt` on every write so
 * the kanban can sort within a column by recency.
 */
export async function setApartmentStatus(input: {
  userId: string;
  apartmentId: number;
  status: UserApartmentStatusKind;
  note?: string | null;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(userApartmentStatus)
    .values({
      userId: input.userId,
      apartmentId: input.apartmentId,
      status: input.status,
      note: input.note ?? null,
    })
    .onConflictDoUpdate({
      target: [userApartmentStatus.userId, userApartmentStatus.apartmentId],
      set: {
        status: input.status,
        ...(input.note !== undefined ? { note: input.note } : {}),
        updatedAt: new Date(),
      },
    });
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type FeedRow = {
  apartmentId: number;
  maxSentAt: Date | string;
  minSeenAt: Date | string | null;
  lat: number | null;
  lon: number | null;
  neighborhood: string | null;
  city: string | null;
  formattedAddress: string | null;
  rooms: number | null;
  sqm: number | null;
  floor: number | null;
  priceNis: number | null;
  primaryListingId: number | null;
  sourceUrl: string | null;
  status: UserApartmentStatusKind | null;
  note: string | null;
};

async function loadFeedRows(args: {
  userId: string;
  cursor: Date | null;
  includeRejected: boolean;
  limit: number;
}): Promise<FeedRow[]> {
  const db = getDb();
  // The cursor filter and the "exclude rejected" filter both apply to the
  // aggregated result, so they live in HAVING rather than WHERE — otherwise a
  // multi-channel apartment could be partially excluded and produce a wrong MAX.
  const havingClauses: ReturnType<typeof sql>[] = [];
  if (args.cursor) {
    havingClauses.push(sql`MAX(${sentAlerts.sentAt}) <= ${args.cursor}`);
  }
  if (!args.includeRejected) {
    // status is in the GROUP BY (composite PK guarantees ≤1 row per apartment),
    // so it can be referenced directly. NULL (no status row yet) passes via
    // IS DISTINCT FROM, which keeps freshly alerted apartments visible.
    havingClauses.push(sql`${userApartmentStatus.status} IS DISTINCT FROM 'rejected'`);
  }

  const having =
    havingClauses.length === 0
      ? undefined
      : havingClauses.reduce((acc, clause) => sql`${acc} AND ${clause}`);

  const query = db
    .select({
      apartmentId: apartments.id,
      maxSentAt: sql<Date>`MAX(${sentAlerts.sentAt})`.as("max_sent_at"),
      minSeenAt: sql<Date | null>`MIN(${sentAlerts.seenAt})`.as("min_seen_at"),
      lat: apartments.lat,
      lon: apartments.lon,
      neighborhood: apartments.neighborhood,
      city: apartments.city,
      formattedAddress: apartments.formattedAddress,
      rooms: apartments.rooms,
      sqm: apartments.sqm,
      floor: apartments.floor,
      priceNis: apartments.priceNisLatest,
      primaryListingId: apartments.primaryListingId,
      sourceUrl: listingsTable.url,
      status: userApartmentStatus.status,
      note: userApartmentStatus.note,
    })
    .from(sentAlerts)
    .innerJoin(apartments, eq(apartments.id, sentAlerts.apartmentId))
    .leftJoin(
      userApartmentStatus,
      and(
        eq(userApartmentStatus.userId, sentAlerts.userId),
        eq(userApartmentStatus.apartmentId, sentAlerts.apartmentId),
      ),
    )
    .leftJoin(listingsTable, eq(listingsTable.id, apartments.primaryListingId))
    .where(eq(sentAlerts.userId, args.userId))
    .groupBy(
      apartments.id,
      apartments.lat,
      apartments.lon,
      apartments.neighborhood,
      apartments.city,
      apartments.formattedAddress,
      apartments.rooms,
      apartments.sqm,
      apartments.floor,
      apartments.priceNisLatest,
      apartments.primaryListingId,
      listingsTable.url,
      userApartmentStatus.status,
      userApartmentStatus.note,
    );

  const withHaving = having ? query.having(having) : query;
  const rows = await withHaving
    .orderBy(desc(sql`max_sent_at`), desc(apartments.id))
    .limit(args.limit);

  return rows as FeedRow[];
}

async function hydrateRows(userId: string, rows: FeedRow[]): Promise<MatchFeedItem[]> {
  if (rows.length === 0) return [];
  const apartmentIds = rows.map((r) => r.apartmentId);
  const [extractions, attrCtx] = await Promise.all([
    loadLatestExtractions(apartmentIds),
    loadAttributeContext(userId, apartmentIds),
  ]);

  return rows.map((r) => {
    const ext = extractions.get(r.apartmentId) ?? null;
    const aptAttrs =
      attrCtx.attrsByApartmentId.get(r.apartmentId) ?? new Map<ApartmentAttributeKey, boolean>();
    const matchResult = checkAttributeRequirements(
      attrCtx.userAttrs,
      aptAttrs,
      attrCtx.notifyOnUnknownMustHave,
    );
    const pricePerSqm =
      r.priceNis != null && r.sqm != null && r.sqm > 0 ? Math.round(r.priceNis / r.sqm) : null;
    const furnitureParsed = FurnitureStatusSchema.safeParse(ext?.furnitureStatus ?? null);
    const furnitureStatus: FurnitureStatus | null = furnitureParsed.success
      ? furnitureParsed.data
      : null;
    return {
      apartmentId: r.apartmentId,
      sentAt: toDate(r.maxSentAt) as Date,
      seenAt: toDate(r.minSeenAt),
      lat: r.lat,
      lon: r.lon,
      neighborhood: r.neighborhood,
      city: r.city,
      formattedAddress: r.formattedAddress,
      rooms: r.rooms,
      sqm: r.sqm,
      floor: r.floor,
      priceNis: r.priceNis,
      primaryListingId: r.primaryListingId,
      condition: ext?.condition ?? null,
      arnonaNis: ext?.arnonaNis ?? null,
      vaadBayitNis: ext?.vaadBayitNis ?? null,
      entryDate: ext?.entryDate ?? null,
      balconySqm: ext?.balconySqm ?? null,
      totalFloors: ext?.totalFloors ?? null,
      furnitureStatus,
      sourceUrl: r.sourceUrl,
      pricePerSqm,
      matchedAttributes: matchResult.matchedAttributes,
      unverifiedAttributes: matchResult.unverifiedAttributes,
      status: r.status ?? "new",
      note: r.note,
    };
  });
}

const toDate = (v: Date | string | null): Date | null =>
  v == null ? null : v instanceof Date ? v : new Date(v);

type ExtractionFields = {
  condition: string | null;
  arnonaNis: number | null;
  vaadBayitNis: number | null;
  entryDate: string | null;
  balconySqm: number | null;
  totalFloors: number | null;
  furnitureStatus: string | null;
};

async function loadLatestExtractions(
  apartmentIds: number[],
): Promise<Map<number, ExtractionFields>> {
  if (apartmentIds.length === 0) return new Map();
  const db = getDb();
  // DISTINCT ON returns one row per apartment, picking the latest extraction
  // by schema_version (NULLS LAST so apartments with no extraction still surface).
  const rows = (await db.execute(sql`
    SELECT DISTINCT ON (a.id)
      a.id AS apartment_id,
      le.condition,
      le.arnona_nis,
      le.vaad_bayit_nis,
      le.entry_date,
      le.balcony_sqm,
      le.total_floors,
      le.furniture_status
    FROM ${apartments} a
    LEFT JOIN ${listingExtractions} le ON le.listing_id = a.primary_listing_id
    WHERE a.id IN (${sql.join(apartmentIds, sql`, `)})
    ORDER BY a.id, le.schema_version DESC NULLS LAST
  `)) as unknown as Array<{
    apartment_id: number;
    condition: string | null;
    arnona_nis: number | null;
    vaad_bayit_nis: number | null;
    entry_date: string | null;
    balcony_sqm: number | null;
    total_floors: number | null;
    furniture_status: string | null;
  }>;

  const map = new Map<number, ExtractionFields>();
  for (const row of rows) {
    map.set(row.apartment_id, {
      condition: row.condition,
      arnonaNis: row.arnona_nis,
      vaadBayitNis: row.vaad_bayit_nis,
      entryDate: row.entry_date,
      balconySqm: row.balcony_sqm,
      totalFloors: row.total_floors,
      furnitureStatus: row.furniture_status,
    });
  }
  return map;
}

type AttributeContext = {
  userAttrs: Array<{ key: ApartmentAttributeKey; requirement: AttributeRequirement }>;
  notifyOnUnknownMustHave: boolean;
  attrsByApartmentId: Map<number, Map<ApartmentAttributeKey, boolean>>;
};

async function loadAttributeContext(
  userId: string,
  apartmentIds: number[],
): Promise<AttributeContext> {
  if (apartmentIds.length === 0) {
    return { userAttrs: [], notifyOnUnknownMustHave: true, attrsByApartmentId: new Map() };
  }
  const db = getDb();

  const [filterRow, userAttrs, listingAttrRows] = await Promise.all([
    db
      .select({ notifyOnUnknownMustHave: userFilters.notifyOnUnknownMustHave })
      .from(userFilters)
      .where(eq(userFilters.userId, userId))
      .limit(1),
    db
      .select({
        key: userFilterAttributes.key,
        requirement: userFilterAttributes.requirement,
      })
      .from(userFilterAttributes)
      .where(eq(userFilterAttributes.userId, userId)),
    db
      .select({
        apartmentId: apartments.id,
        key: listingAttributes.key,
        value: listingAttributes.value,
      })
      .from(apartments)
      .innerJoin(listingAttributes, eq(listingAttributes.listingId, apartments.primaryListingId))
      .where(inArray(apartments.id, apartmentIds)),
  ]);

  const attrsByApartmentId = new Map<number, Map<ApartmentAttributeKey, boolean>>();
  for (const row of listingAttrRows) {
    let inner = attrsByApartmentId.get(row.apartmentId);
    if (!inner) {
      inner = new Map();
      attrsByApartmentId.set(row.apartmentId, inner);
    }
    inner.set(row.key, row.value);
  }

  return {
    userAttrs,
    notifyOnUnknownMustHave: filterRow[0]?.notifyOnUnknownMustHave ?? true,
    attrsByApartmentId,
  };
}

/**
 * Compute median apartment price per `(neighborhood, rooms)` for a set of
 * cities. Returned object is the `MedianLookup` shape consumed by the
 * annotations helper. Empty city list → empty lookup (annotations skip the
 * price pill rather than blowing up).
 *
 * Median is computed via Postgres' `percentile_cont(0.5)` so half-integer
 * room counts (e.g. 3.5) get their own bucket — matching how Yad2 lists them.
 */
export async function loadMedianContext(cityIds: string[]): Promise<{
  byNeighborhoodAndRooms: (neighborhood: string | null, rooms: number | null) => number | null;
}> {
  if (cityIds.length === 0) {
    return { byNeighborhoodAndRooms: () => null };
  }
  const db = getDb();
  const rows = (await db.execute(sql`
    SELECT
      neighborhood,
      rooms,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price_nis_latest)::int AS median_nis
    FROM ${apartments}
    WHERE city_id IN (${sql.join(cityIds, sql`, `)})
      AND price_nis_latest IS NOT NULL
      AND neighborhood IS NOT NULL
      AND rooms IS NOT NULL
    GROUP BY neighborhood, rooms
  `)) as unknown as Array<{
    neighborhood: string;
    rooms: number;
    median_nis: number;
  }>;

  const lookup = new Map<string, number>();
  for (const row of rows) {
    lookup.set(medianKey(row.neighborhood, row.rooms), row.median_nis);
  }

  return {
    byNeighborhoodAndRooms: (neighborhood, rooms) => {
      if (neighborhood == null || rooms == null) return null;
      return lookup.get(medianKey(neighborhood, rooms)) ?? null;
    },
  };
}

function medianKey(neighborhood: string, rooms: number): string {
  return `${neighborhood}|${rooms}`;
}

export { USER_APARTMENT_STATUS_KINDS } from "./types";
