import { and, desc, eq, gte, ilike, inArray, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { feedback, judgments, listings, sentAlerts } from "@/db/schema";

export type ListingSource = "yad2" | "fb_apify" | "fb_ext";
export type ListingDecision = "alert" | "skip" | "unsure";

export type ListingsFilter = {
  neighborhood?: string;
  maxPriceNis?: number;
  minPriceNis?: number;
  minRooms?: number;
  maxRooms?: number;
  minScore?: number;
  decision?: ListingDecision;
  source?: ListingSource;
  hoursAgo?: number;
  search?: string;
  limit?: number;
  offset?: number;
  cursor?: string;
  /** Scope the feedback join + group filter to this user. */
  forUserId?: string;
  /** Limit FB listings to these source_group_url values. Non-FB rows always pass. */
  subscribedGroupUrls?: string[];
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function encodeCursor(ingestedAt: Date, id: number): string {
  return `${ingestedAt.getTime()}_${id}`;
}

export function decodeCursor(raw: string): { ingestedAt: Date; id: number } | null {
  const m = /^(\d+)_(\d+)$/.exec(raw);
  if (!m) return null;
  const ms = Number(m[1]);
  const id = Number(m[2]);
  if (!Number.isFinite(ms) || !Number.isFinite(id)) return null;
  return { ingestedAt: new Date(ms), id };
}

export async function searchListings(f: ListingsFilter = {}) {
  const db = getDb();
  const limit = Math.min(Math.max(f.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const conds = [];

  if (f.neighborhood) {
    conds.push(ilike(listings.neighborhood, `%${f.neighborhood}%`));
  }
  if (f.maxPriceNis != null) {
    conds.push(lte(listings.priceNis, f.maxPriceNis));
  }
  if (f.minPriceNis != null) {
    conds.push(gte(listings.priceNis, f.minPriceNis));
  }
  if (f.minRooms != null) {
    conds.push(gte(listings.rooms, f.minRooms));
  }
  if (f.maxRooms != null) {
    conds.push(lte(listings.rooms, f.maxRooms));
  }
  if (f.source) {
    conds.push(eq(listings.source, f.source));
  }
  if (f.hoursAgo != null) {
    const cutoff = new Date(Date.now() - f.hoursAgo * 3_600_000);
    conds.push(gte(listings.ingestedAt, cutoff));
  }
  if (f.search) {
    const needle = `%${f.search}%`;
    conds.push(
      or(
        ilike(listings.description, needle),
        ilike(listings.title, needle),
        ilike(listings.neighborhood, needle),
        ilike(listings.street, needle),
        ilike(listings.authorName, needle),
      )!,
    );
  }
  if (f.minScore != null) {
    conds.push(gte(judgments.score, f.minScore));
  }
  if (f.decision) {
    conds.push(eq(judgments.decision, f.decision));
  }

  if (f.cursor) {
    const c = decodeCursor(f.cursor);
    if (c) {
      conds.push(
        or(
          lt(listings.ingestedAt, c.ingestedAt),
          and(eq(listings.ingestedAt, c.ingestedAt), lt(listings.id, c.id)),
        )!,
      );
    }
  } else if (f.offset != null && f.offset > 0) {
    // Legacy offset mode kept for callers that don't use cursor yet.
  }
  if (f.subscribedGroupUrls) {
    const nonFb = inArray(listings.source, ["yad2"]);
    if (f.subscribedGroupUrls.length === 0) {
      conds.push(nonFb);
    } else {
      conds.push(
        or(nonFb, inArray(listings.sourceGroupUrl, f.subscribedGroupUrls))!,
      );
    }
  }

  const feedbackJoinCond = f.forUserId
    ? and(eq(feedback.listingId, listings.id), eq(feedback.userId, f.forUserId))!
    : eq(feedback.listingId, listings.id);

  const query = db
    .select({
      id: listings.id,
      source: listings.source,
      sourceId: listings.sourceId,
      url: listings.url,
      title: listings.title,
      description: listings.description,
      priceNis: listings.priceNis,
      rooms: listings.rooms,
      sqm: listings.sqm,
      neighborhood: listings.neighborhood,
      street: listings.street,
      postedAt: listings.postedAt,
      ingestedAt: listings.ingestedAt,
      isAgency: listings.isAgency,
      authorName: listings.authorName,
      score: judgments.score,
      decision: judgments.decision,
      reasoning: judgments.reasoning,
      redFlags: judgments.redFlags,
      positiveSignals: judgments.positiveSignals,
      feedbackRating: feedback.rating,
    })
    .from(listings)
    .leftJoin(judgments, eq(judgments.listingId, listings.id))
    .leftJoin(feedback, feedbackJoinCond);

  const filtered = conds.length > 0 ? query.where(and(...conds)) : query;

  // Fetch limit + 1 to know if there's a next page without a COUNT.
  const rows = await filtered
    .orderBy(desc(listings.ingestedAt), desc(listings.id))
    .limit(limit + 1)
    .offset(f.cursor ? 0 : (f.offset ?? 0));

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.ingestedAt, last.id) : null;

  return { rows: page, nextCursor };
}

export async function countListings(
  f: Omit<ListingsFilter, "limit" | "offset" | "cursor"> = {},
): Promise<number> {
  const db = getDb();
  const conds = [];
  if (f.neighborhood) conds.push(ilike(listings.neighborhood, `%${f.neighborhood}%`));
  if (f.maxPriceNis != null) conds.push(lte(listings.priceNis, f.maxPriceNis));
  if (f.minPriceNis != null) conds.push(gte(listings.priceNis, f.minPriceNis));
  if (f.minRooms != null) conds.push(gte(listings.rooms, f.minRooms));
  if (f.maxRooms != null) conds.push(lte(listings.rooms, f.maxRooms));
  if (f.source) conds.push(eq(listings.source, f.source));
  if (f.hoursAgo != null) {
    const cutoff = new Date(Date.now() - f.hoursAgo * 3_600_000);
    conds.push(gte(listings.ingestedAt, cutoff));
  }
  if (f.search) {
    const needle = `%${f.search}%`;
    conds.push(
      or(
        ilike(listings.description, needle),
        ilike(listings.title, needle),
        ilike(listings.neighborhood, needle),
        ilike(listings.street, needle),
        ilike(listings.authorName, needle),
      )!,
    );
  }
  if (f.minScore != null) conds.push(gte(judgments.score, f.minScore));
  if (f.decision) conds.push(eq(judgments.decision, f.decision));

  const q = db
    .select({ count: sql<number>`count(*)::int` })
    .from(listings)
    .leftJoin(judgments, eq(judgments.listingId, listings.id));

  const [row] = await (conds.length > 0 ? q.where(and(...conds)) : q);
  return row?.count ?? 0;
}

export async function getListingById(id: number, forUserId?: string) {
  const db = getDb();
  const feedbackJoinCond = forUserId
    ? and(eq(feedback.listingId, listings.id), eq(feedback.userId, forUserId))!
    : eq(feedback.listingId, listings.id);
  const rows = await db
    .select({
      id: listings.id,
      source: listings.source,
      sourceId: listings.sourceId,
      url: listings.url,
      title: listings.title,
      description: listings.description,
      priceNis: listings.priceNis,
      rooms: listings.rooms,
      sqm: listings.sqm,
      floor: listings.floor,
      neighborhood: listings.neighborhood,
      street: listings.street,
      postedAt: listings.postedAt,
      ingestedAt: listings.ingestedAt,
      isAgency: listings.isAgency,
      authorName: listings.authorName,
      authorProfile: listings.authorProfile,
      rawJson: listings.rawJson,
      score: judgments.score,
      decision: judgments.decision,
      reasoning: judgments.reasoning,
      redFlags: judgments.redFlags,
      positiveSignals: judgments.positiveSignals,
      model: judgments.model,
      judgedAt: judgments.judgedAt,
      feedbackRating: feedback.rating,
      feedbackNote: feedback.note,
    })
    .from(listings)
    .leftJoin(judgments, eq(judgments.listingId, listings.id))
    .leftJoin(feedback, feedbackJoinCond)
    .where(eq(listings.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getDashboardStats(hoursAgo = 24) {
  const db = getDb();
  const cutoff = new Date(Date.now() - hoursAgo * 3_600_000);

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      alerted: sql<number>`count(*) filter (where ${judgments.decision} = 'alert')::int`,
      skipped: sql<number>`count(*) filter (where ${judgments.decision} = 'skip')::int`,
      unsure: sql<number>`count(*) filter (where ${judgments.decision} = 'unsure')::int`,
    })
    .from(listings)
    .leftJoin(judgments, eq(judgments.listingId, listings.id))
    .where(gte(listings.ingestedAt, cutoff));

  const [bySource] = await db
    .select({
      yad2: sql<number>`count(*) filter (where ${listings.source} = 'yad2')::int`,
      fb_apify: sql<number>`count(*) filter (where ${listings.source} = 'fb_apify')::int`,
      fb_ext: sql<number>`count(*) filter (where ${listings.source} = 'fb_ext')::int`,
    })
    .from(listings)
    .where(gte(listings.ingestedAt, cutoff));

  const [alertCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sentAlerts)
    .where(gte(sentAlerts.sentAt, cutoff));

  return {
    hoursAgo,
    total: counts?.total ?? 0,
    alerted: counts?.alerted ?? 0,
    skipped: counts?.skipped ?? 0,
    unsure: counts?.unsure ?? 0,
    bySource: {
      yad2: bySource?.yad2 ?? 0,
      fb_apify: bySource?.fb_apify ?? 0,
      fb_ext: bySource?.fb_ext ?? 0,
    },
    alertsSent: alertCount?.count ?? 0,
  };
}

export type ListingsPage = Awaited<ReturnType<typeof searchListings>>;
export type ListingRow = ListingsPage["rows"][number];

export { inArray, lt };
