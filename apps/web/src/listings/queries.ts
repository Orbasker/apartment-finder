import { and, desc, eq, gte, ilike, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import {
  apartmentSources,
  canonicalApartments,
  extractions,
  feedback,
  judgments,
  rawPosts,
  sentAlerts,
} from "@/db/schema";

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
type FilterCondition = SQL<unknown>;

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

function buildFilterConditions(f: ListingsFilter, includeCursor: boolean): FilterCondition[] {
  const conds: FilterCondition[] = [];

  if (f.neighborhood) {
    conds.push(
      or(
        ilike(canonicalApartments.neighborhood, `%${f.neighborhood}%`),
        ilike(extractions.neighborhood, `%${f.neighborhood}%`),
      )!,
    );
  }
  if (f.maxPriceNis != null) {
    conds.push(lte(extractions.priceNis, f.maxPriceNis));
  }
  if (f.minPriceNis != null) {
    conds.push(gte(extractions.priceNis, f.minPriceNis));
  }
  if (f.minRooms != null) {
    conds.push(gte(extractions.rooms, f.minRooms));
  }
  if (f.maxRooms != null) {
    conds.push(lte(extractions.rooms, f.maxRooms));
  }
  if (f.source) {
    conds.push(eq(rawPosts.source, f.source));
  }
  if (f.hoursAgo != null) {
    const cutoff = new Date(Date.now() - f.hoursAgo * 3_600_000);
    conds.push(gte(rawPosts.fetchedAt, cutoff));
  }
  if (f.search) {
    const needle = `%${f.search}%`;
    conds.push(
      or(
        ilike(rawPosts.rawText, needle),
        ilike(canonicalApartments.primaryAddress, needle),
        ilike(canonicalApartments.neighborhood, needle),
        ilike(canonicalApartments.street, needle),
        ilike(extractions.neighborhood, needle),
        ilike(extractions.street, needle),
        ilike(rawPosts.authorName, needle),
      )!,
    );
  }
  if (f.minScore != null) {
    conds.push(gte(judgments.score, f.minScore));
  }
  if (f.decision) {
    conds.push(eq(judgments.decision, f.decision));
  }

  if (includeCursor && f.cursor) {
    const c = decodeCursor(f.cursor);
    if (c) {
      conds.push(
        or(
          lt(rawPosts.fetchedAt, c.ingestedAt),
          and(eq(rawPosts.fetchedAt, c.ingestedAt), lt(canonicalApartments.id, c.id)),
        )!,
      );
    }
  }

  if (f.subscribedGroupUrls) {
    const nonFb = inArray(rawPosts.source, ["yad2"]);
    if (f.subscribedGroupUrls.length === 0) {
      conds.push(nonFb);
    } else {
      conds.push(or(nonFb, inArray(rawPosts.sourceGroupUrl, f.subscribedGroupUrls))!);
    }
  }

  return conds;
}

export async function searchListings(f: ListingsFilter = {}) {
  const db = getDb();
  const limit = Math.min(Math.max(f.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const conds = buildFilterConditions(f, true);

  if (!f.cursor && f.offset != null && f.offset > 0) {
    // Legacy offset mode kept for callers that don't use cursor yet.
  }

  const feedbackJoinCond = f.forUserId
    ? and(eq(feedback.canonicalId, canonicalApartments.id), eq(feedback.userId, f.forUserId))!
    : eq(feedback.canonicalId, canonicalApartments.id);

  const query = db
    .select({
      id: canonicalApartments.id,
      source: rawPosts.source,
      sourceId: rawPosts.sourceId,
      url: rawPosts.url,
      title: canonicalApartments.primaryAddress,
      description: rawPosts.rawText,
      priceNis: extractions.priceNis,
      rooms: sql<number | null>`coalesce(${extractions.rooms}, ${canonicalApartments.rooms})`,
      sqm: sql<number | null>`coalesce(${extractions.sqm}, ${canonicalApartments.sqm})`,
      neighborhood: sql<
        string | null
      >`coalesce(${canonicalApartments.neighborhood}, ${extractions.neighborhood})`,
      street: sql<string | null>`coalesce(${canonicalApartments.street}, ${extractions.street})`,
      postedAt: rawPosts.postedAt,
      ingestedAt: rawPosts.fetchedAt,
      isAgency: extractions.isAgency,
      authorName: rawPosts.authorName,
      score: judgments.score,
      decision: judgments.decision,
      reasoning: judgments.reasoning,
      redFlags: judgments.redFlags,
      positiveSignals: judgments.positiveSignals,
      feedbackRating: feedback.rating,
    })
    .from(canonicalApartments)
    .innerJoin(apartmentSources, eq(apartmentSources.canonicalId, canonicalApartments.id))
    .innerJoin(extractions, eq(extractions.id, apartmentSources.extractionId))
    .innerJoin(rawPosts, eq(rawPosts.id, extractions.rawPostId))
    .leftJoin(judgments, eq(judgments.canonicalId, canonicalApartments.id))
    .leftJoin(feedback, feedbackJoinCond);

  const filtered = conds.length > 0 ? query.where(and(...conds)!) : query;

  // Fetch limit + 1 to know if there's a next page without a COUNT.
  const rows = await filtered
    .orderBy(desc(rawPosts.fetchedAt), desc(canonicalApartments.id))
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
  const conds = buildFilterConditions(f, false);

  const q = db
    .select({ count: sql<number>`count(distinct ${canonicalApartments.id})::int` })
    .from(canonicalApartments)
    .innerJoin(apartmentSources, eq(apartmentSources.canonicalId, canonicalApartments.id))
    .innerJoin(extractions, eq(extractions.id, apartmentSources.extractionId))
    .innerJoin(rawPosts, eq(rawPosts.id, extractions.rawPostId))
    .leftJoin(judgments, eq(judgments.canonicalId, canonicalApartments.id));

  const [row] = await (conds.length > 0 ? q.where(and(...conds)!) : q);
  return row?.count ?? 0;
}

export async function getListingById(id: number, forUserId?: string) {
  const db = getDb();
  const feedbackJoinCond = forUserId
    ? and(eq(feedback.canonicalId, canonicalApartments.id), eq(feedback.userId, forUserId))!
    : eq(feedback.canonicalId, canonicalApartments.id);
  const rows = await db
    .select({
      id: canonicalApartments.id,
      source: rawPosts.source,
      sourceId: rawPosts.sourceId,
      url: rawPosts.url,
      title: canonicalApartments.primaryAddress,
      description: rawPosts.rawText,
      priceNis: extractions.priceNis,
      rooms: sql<number | null>`coalesce(${extractions.rooms}, ${canonicalApartments.rooms})`,
      sqm: sql<number | null>`coalesce(${extractions.sqm}, ${canonicalApartments.sqm})`,
      floor: extractions.floor,
      neighborhood: sql<
        string | null
      >`coalesce(${canonicalApartments.neighborhood}, ${extractions.neighborhood})`,
      street: sql<string | null>`coalesce(${canonicalApartments.street}, ${extractions.street})`,
      postedAt: rawPosts.postedAt,
      ingestedAt: rawPosts.fetchedAt,
      isAgency: extractions.isAgency,
      authorName: rawPosts.authorName,
      authorProfile: rawPosts.authorProfile,
      rawJson: rawPosts.rawJson,
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
    .from(canonicalApartments)
    .innerJoin(apartmentSources, eq(apartmentSources.canonicalId, canonicalApartments.id))
    .innerJoin(extractions, eq(extractions.id, apartmentSources.extractionId))
    .innerJoin(rawPosts, eq(rawPosts.id, extractions.rawPostId))
    .leftJoin(judgments, eq(judgments.canonicalId, canonicalApartments.id))
    .leftJoin(feedback, feedbackJoinCond)
    .where(eq(canonicalApartments.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getDashboardStats(hoursAgo = 24) {
  const db = getDb();
  const cutoff = new Date(Date.now() - hoursAgo * 3_600_000);

  const [counts] = await db
    .select({
      total: sql<number>`count(distinct ${canonicalApartments.id})::int`,
      alerted: sql<number>`count(distinct ${canonicalApartments.id}) filter (where ${judgments.decision} = 'alert')::int`,
      skipped: sql<number>`count(distinct ${canonicalApartments.id}) filter (where ${judgments.decision} = 'skip')::int`,
      unsure: sql<number>`count(distinct ${canonicalApartments.id}) filter (where ${judgments.decision} = 'unsure')::int`,
    })
    .from(canonicalApartments)
    .innerJoin(apartmentSources, eq(apartmentSources.canonicalId, canonicalApartments.id))
    .innerJoin(extractions, eq(extractions.id, apartmentSources.extractionId))
    .innerJoin(rawPosts, eq(rawPosts.id, extractions.rawPostId))
    .leftJoin(judgments, eq(judgments.canonicalId, canonicalApartments.id))
    .where(gte(rawPosts.fetchedAt, cutoff));

  const [bySource] = await db
    .select({
      yad2: sql<number>`count(distinct ${canonicalApartments.id}) filter (where ${rawPosts.source} = 'yad2')::int`,
      fb_apify: sql<number>`count(distinct ${canonicalApartments.id}) filter (where ${rawPosts.source} = 'fb_apify')::int`,
      fb_ext: sql<number>`count(distinct ${canonicalApartments.id}) filter (where ${rawPosts.source} = 'fb_ext')::int`,
    })
    .from(canonicalApartments)
    .innerJoin(apartmentSources, eq(apartmentSources.canonicalId, canonicalApartments.id))
    .innerJoin(extractions, eq(extractions.id, apartmentSources.extractionId))
    .innerJoin(rawPosts, eq(rawPosts.id, extractions.rawPostId))
    .where(gte(rawPosts.fetchedAt, cutoff));

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
