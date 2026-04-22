import { and, desc, eq, gte, ilike, inArray, lt, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { feedback, judgments, listings, sentAlerts } from "@/db/schema";

export type ListingsFilter = {
  neighborhood?: string;
  maxPriceNis?: number;
  minPriceNis?: number;
  minScore?: number;
  decision?: "alert" | "skip" | "unsure";
  hoursAgo?: number;
  search?: string;
  limit?: number;
  offset?: number;
};

export async function searchListings(f: ListingsFilter = {}) {
  const db = getDb();
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
  if (f.hoursAgo != null) {
    const cutoff = new Date(Date.now() - f.hoursAgo * 3_600_000);
    conds.push(gte(listings.ingestedAt, cutoff));
  }
  if (f.search) {
    conds.push(ilike(listings.description, `%${f.search}%`));
  }

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
    .leftJoin(feedback, eq(feedback.listingId, listings.id));

  if (f.minScore != null) {
    conds.push(gte(judgments.score, f.minScore));
  }
  if (f.decision) {
    conds.push(eq(judgments.decision, f.decision));
  }

  const filtered = conds.length > 0 ? query.where(and(...conds)) : query;

  return filtered
    .orderBy(desc(listings.ingestedAt))
    .limit(f.limit ?? 50)
    .offset(f.offset ?? 0);
}

export async function getListingById(id: number) {
  const db = getDb();
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
    .leftJoin(feedback, eq(feedback.listingId, listings.id))
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

export { inArray, lt };
